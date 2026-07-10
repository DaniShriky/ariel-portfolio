// Auto-generates the same fixed WebP derivative ladder that
// scripts/generate-derivatives.ts backfills manually, but triggered right
// after each upload from the client (src/lib/mediaService.ts ->
// triggerDerivativeGeneration), so new uploads never need a manual script
// run again.
//
// Edge Functions run on a sandboxed Deno runtime with no native-library
// support — `sharp` (used by the manual script) cannot run here at all, and
// the documented WASM alternative (magick-wasm) hits Supabase's own
// "resource limit exceeded" ceiling around ~5MB source images, well below
// what real camera photos in this library actually are (tested up to 13MB).
// To avoid decoding any pixels in this function's own memory, we don't
// process images here — we ask Supabase's own Storage Image Transform
// endpoint (limits: 25MB source / 50 megapixels, comfortably covers this
// library) to do the resize/re-encode server-side, fetch the result with
// Accept: image/webp, verify it's really WebP, and just re-upload those
// bytes as the derivative. The original object is never read for decoding
// and never written to — only referenced by path so Supabase's transform
// service can process it on its own infrastructure.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const ALLOWED_BUCKETS = new Set(['media', 'covers']);
const ALLOWED_WIDTHS = new Set([480, 768, 1080, 1440, 1920]);
// {uuid}.{ext} — must match randomPath() in src/lib/mediaService.ts exactly.
// A single path segment only: no "/", no "..", nothing that could reach
// outside the bucket root the app actually uploads to.
const PATH_PATTERN = /^[0-9a-fA-F-]{36}\.[A-Za-z0-9]{1,10}$/;

const WEBP_QUALITY = 82;
const MAX_REASONABLE_DIMENSION = 20000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

type RequestBody = {
  bucket?: unknown;
  path?: unknown;
  widths?: unknown;
  naturalWidth?: unknown;
  aspectRatio?: unknown;
};

type ValidatedInput = {
  bucket: 'media' | 'covers';
  path: string;
  widths: number[];
  naturalWidth?: number;
  aspectRatio?: number;
};

function validate(body: RequestBody): ValidatedInput | string {
  if (typeof body.bucket !== 'string' || !ALLOWED_BUCKETS.has(body.bucket)) {
    return 'invalid bucket';
  }
  if (typeof body.path !== 'string' || !PATH_PATTERN.test(body.path)) {
    return 'invalid path';
  }
  if (!Array.isArray(body.widths)) {
    return 'invalid widths';
  }
  const widths = body.widths.filter((w): w is number => typeof w === 'number' && ALLOWED_WIDTHS.has(w));
  if (widths.length === 0) {
    return 'no valid widths';
  }

  const naturalWidth =
    typeof body.naturalWidth === 'number' && Number.isFinite(body.naturalWidth) &&
    body.naturalWidth > 0 && body.naturalWidth <= MAX_REASONABLE_DIMENSION
      ? body.naturalWidth
      : undefined;

  const aspectRatio =
    typeof body.aspectRatio === 'number' && Number.isFinite(body.aspectRatio) && body.aspectRatio > 0
      ? body.aspectRatio
      : undefined;

  return { bucket: body.bucket as 'media' | 'covers', path: body.path, widths, naturalWidth, aspectRatio };
}

function derivativeFolder(path: string): string {
  const stem = path.replace(/\.[^./]+$/, '');
  return `derivatives/${stem}`;
}

function containBox(width: number, aspectRatio?: number): { width: number; height: number } {
  if (!aspectRatio) return { width, height: width };
  return { width, height: Math.round(width / aspectRatio) };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  // ── auth: any authenticated session counts as admin, matching the app's
  // existing trust model (AdminModeContext / RLS's auth.uid() IS NOT NULL) ──
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authError } = await callerClient.auth.getUser();
  if (authError || !userData?.user) return json({ error: 'unauthorized' }, 401);

  // ── validate everything before touching Storage ──
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const validated = validate(body);
  if (typeof validated === 'string') {
    return json({ error: validated }, 400);
  }
  const { bucket, path, widths, naturalWidth, aspectRatio } = validated;

  // Only now — after auth + validation both pass — create the elevated client.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const results: { width: number; status: 'created' | 'skipped-too-large' | 'skipped-not-webp' | 'error' }[] = [];

  for (const width of widths) {
    if (naturalWidth && width > naturalWidth) {
      results.push({ width, status: 'skipped-too-large' });
      continue;
    }

    const box = containBox(width, aspectRatio);
    const { data: urlData } = adminClient.storage.from(bucket).getPublicUrl(path, {
      transform: { width: box.width, height: box.height, resize: 'contain', quality: WEBP_QUALITY },
    });

    let response: Response;
    try {
      response = await fetch(urlData.publicUrl, { headers: { Accept: 'image/webp' } });
    } catch (err) {
      console.warn(`[generate-derivatives] fetch failed for ${bucket}/${path} @ ${width}w:`, err);
      results.push({ width, status: 'error' });
      continue;
    }
    if (!response.ok) {
      console.warn(`[generate-derivatives] transform endpoint returned ${response.status} for ${bucket}/${path} @ ${width}w`);
      results.push({ width, status: 'error' });
      continue;
    }

    // Never trust the Accept header actually being honored — verify the
    // response really is WebP before saving it under a .webp path.
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/webp')) {
      console.warn(`[generate-derivatives] expected image/webp, got "${contentType}" for ${bucket}/${path} @ ${width}w — skipping`);
      results.push({ width, status: 'skipped-not-webp' });
      continue;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const outPath = `${derivativeFolder(path)}/${width}.webp`;
    const { error: uploadError } = await adminClient.storage.from(bucket).upload(outPath, bytes, {
      contentType: 'image/webp',
      upsert: true,
    });
    if (uploadError) {
      console.warn(`[generate-derivatives] upload failed for ${outPath}:`, uploadError.message);
      results.push({ width, status: 'error' });
      continue;
    }

    results.push({ width, status: 'created' });
  }

  return json({ bucket, path, results });
});
