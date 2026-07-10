// Turns a chosen point in a YouTube video's timeline into a permanent, owned
// image in the `media` bucket — either a crop of a storyboard sprite tile
// (undocumented, best-effort — see ../_shared/youtube.ts) or, when that's
// unavailable, a straight copy of one of YouTube's official auto-thumbnails
// (fully documented, zero image processing needed).
//
// From this point on, the result is indistinguishable from any other file in
// `media`: same upload path shape, same derivative pipeline
// (triggerDerivativeGeneration, called by the client afterward), same
// deletion path. Nothing downstream needs to know it came from YouTube.
//
// Only the storyboard branch touches pixels. `generate-derivatives`
// deliberately avoids decoding images in-process (its own comments explain
// why: magick-wasm hits Supabase's Edge Function resource ceiling around
// ~5MB source images) by delegating resizing to Supabase's own Storage
// Transform endpoint — that trick isn't available here because the source
// sprite lives on YouTube's CDN, not in our bucket. Sprite sheets are small
// (a low-res grid of seek-preview tiles, generally well under a few hundred
// KB), comfortably clear of the ceiling that ruled out magick-wasm for full
// camera photos, so a lightweight pure-JS decoder is safe to use here.
//
// IMPORTANT: pin this import to an exact version. An unversioned or
// range-versioned remote import would let a future ImageScript release
// change behavior (or disappear) underneath a function nobody is watching.
// Bump deliberately, not implicitly.
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchStoryboardSprite } from '../_shared/youtube.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const MAX_SPRITE_BYTES = 5 * 1024 * 1024; // sanity ceiling, real sprites are far smaller
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

const THUMBNAIL_FILENAMES: Record<string, string> = {
  default: 'default',
  medium: 'mqdefault',
  high: 'hqdefault',
  standard: 'sddefault',
  maxres: 'maxresdefault',
};

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

// `supabase-js`'s functions.invoke() does not reliably surface a non-2xx
// response's JSON body to the caller (it throws a FunctionsHttpError with
// the body only reachable via a Response on the error object) — so every
// *expected* outcome, success or not, is returned as HTTP 200 with an
// explicit `success` field. Non-200 is reserved for genuine request-shape
// problems (bad auth, bad method, malformed body), which the client already
// treats as an unstructured, generic failure.
function outcome(body: { success: true; storagePath: string; width: number; height: number } | { success: false; error: string; fallbackRequired: boolean }): Response {
  return json(body, 200);
}

type RequestBody = {
  videoId?: unknown;
  mode?: unknown;
  timestampSeconds?: unknown;
  quality?: unknown;
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // ── auth first, same trust model as generate-derivatives ──
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authError } = await callerClient.auth.getUser();
  if (authError || !userData?.user) return json({ error: 'unauthorized' }, 401);

  // ── validate everything before any external fetch or Storage write ──
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  if (typeof body.videoId !== 'string' || !ID_PATTERN.test(body.videoId)) {
    return json({ error: 'invalid videoId' }, 400);
  }
  const videoId = body.videoId;

  if (body.mode !== 'storyboard' && body.mode !== 'thumbnail') {
    return json({ error: 'invalid mode' }, 400);
  }

  let jpegBytes: Uint8Array;
  let width: number;
  let height: number;

  try {
    if (body.mode === 'storyboard') {
      if (typeof body.timestampSeconds !== 'number' || !Number.isFinite(body.timestampSeconds) || body.timestampSeconds < 0) {
        return json({ error: 'invalid timestampSeconds' }, 400);
      }

      // Re-derive the sprite ourselves rather than trusting a client-supplied
      // URL — the only inputs that cross the trust boundary here are
      // videoId (regex-validated above) and a plain number.
      const sprite = await fetchStoryboardSprite(videoId);
      if (!sprite) {
        return outcome({ success: false, error: 'storyboard_unavailable', fallbackRequired: true });
      }

      const tileIndex = Math.min(
        Math.max(Math.floor((body.timestampSeconds * 1000) / sprite.intervalMs), 0),
        sprite.tileCount - 1,
      );
      const col = tileIndex % sprite.columns;
      const row = Math.floor(tileIndex / sprite.columns);

      const spriteRes = await fetch(sprite.url);
      if (!spriteRes.ok) {
        return outcome({ success: false, error: 'sprite_fetch_failed', fallbackRequired: true });
      }
      const spriteBuf = new Uint8Array(await spriteRes.arrayBuffer());
      if (spriteBuf.byteLength === 0 || spriteBuf.byteLength > MAX_SPRITE_BYTES) {
        return outcome({ success: false, error: 'sprite_too_large', fallbackRequired: true });
      }

      const spriteImg = await Image.decode(spriteBuf);
      const x = Math.min(col * sprite.tileWidth, Math.max(spriteImg.width - sprite.tileWidth, 0));
      const y = Math.min(row * sprite.tileHeight, Math.max(spriteImg.height - sprite.tileHeight, 0));
      const w = Math.min(sprite.tileWidth, spriteImg.width - x);
      const h = Math.min(sprite.tileHeight, spriteImg.height - y);
      if (w <= 0 || h <= 0) {
        return outcome({ success: false, error: 'invalid_tile_bounds', fallbackRequired: true });
      }

      const cropped = spriteImg.crop(x, y, w, h);
      jpegBytes = await cropped.encodeJPEG(85);
      width = cropped.width;
      height = cropped.height;

    } else {
      const quality = typeof body.quality === 'string' ? body.quality : '';
      const filename = THUMBNAIL_FILENAMES[quality];
      if (!filename) return json({ error: 'invalid quality' }, 400);

      // Server-constructed URL only — never trust a client-supplied
      // thumbnail URL, to keep this immune to SSRF via an attacker-chosen host.
      const thumbUrl = `https://i.ytimg.com/vi/${videoId}/${filename}.jpg`;
      const thumbRes = await fetch(thumbUrl);
      if (!thumbRes.ok) {
        return outcome({ success: false, error: 'thumbnail_fetch_failed', fallbackRequired: false });
      }
      const thumbBuf = new Uint8Array(await thumbRes.arrayBuffer());
      if (thumbBuf.byteLength === 0 || thumbBuf.byteLength > MAX_THUMBNAIL_BYTES) {
        return outcome({ success: false, error: 'thumbnail_too_large', fallbackRequired: false });
      }

      // No cropping needed — just relocate YouTube's own already-framed
      // thumbnail into our storage, no pixel decode required.
      jpegBytes = thumbBuf;
      const dims = await Image.decode(thumbBuf).then(img => ({ width: img.width, height: img.height })).catch(() => null);
      width = dims?.width ?? 0;
      height = dims?.height ?? 0;
    }
  } catch (err) {
    console.warn('[youtube-cover-capture] capture failed:', err);
    return outcome({ success: false, error: 'capture_failed', fallbackRequired: body.mode === 'storyboard' });
  }

  // Only now — after everything above succeeded — touch Storage.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const storagePath = `${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await adminClient.storage.from('media').upload(storagePath, jpegBytes, {
    contentType: 'image/jpeg',
  });
  if (uploadError) {
    console.warn('[youtube-cover-capture] upload failed:', uploadError.message);
    return outcome({ success: false, error: 'upload_failed', fallbackRequired: false });
  }

  return outcome({ success: true, storagePath, width, height });
});
