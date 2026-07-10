// Validates a YouTube video ID and returns the metadata needed to add it as
// a media item: title, duration, and YouTube's own auto-thumbnails (used as
// the cover-picker fallback when the undocumented storyboard endpoint,
// queried separately by youtube-storyboard, isn't available for this video).
//
// Two-stage check, cheapest first:
//   1. oEmbed (no API key, free) — fails fast for anything private/deleted/
//      nonexistent without spending Data API quota.
//   2. Data API v3 videos.list — the only source for `status.embeddable`,
//      which oEmbed does not reliably expose.
// This never throws for "video doesn't qualify" outcomes — those are
// ordinary results (`available: false, reason: ...`), not errors.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY')!;

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

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

// ISO 8601 duration (e.g. "PT1H2M10S") -> seconds. YouTube's contentDetails
// only ever returns this exact subset (hours/minutes/seconds, no months or
// years), so a small manual parser is enough — no need for a date library.
function parseIsoDuration(iso: string): number {
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // ── auth: same trust model as generate-derivatives — any authenticated
  // session counts as admin (this app has no separate role/allowlist) ──
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: authError } = await callerClient.auth.getUser();
  if (authError || !userData?.user) return json({ error: 'unauthorized' }, 401);

  let body: { videoId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  if (typeof body.videoId !== 'string' || !ID_PATTERN.test(body.videoId)) {
    return json({ error: 'invalid videoId' }, 400);
  }
  const videoId = body.videoId;

  // ── stage 1: oEmbed ──
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  let oembedOk = false;
  try {
    const oembedRes = await fetch(oembedUrl);
    oembedOk = oembedRes.ok;
  } catch (err) {
    console.warn('[youtube-lookup] oEmbed fetch failed:', err);
  }
  if (!oembedOk) {
    return json({ available: false, reason: 'unavailable' });
  }

  // ── stage 2: Data API v3 ──
  const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${videoId}&key=${YOUTUBE_API_KEY}`;
  let apiRes: Response;
  try {
    apiRes = await fetch(apiUrl);
  } catch (err) {
    console.warn('[youtube-lookup] Data API fetch failed:', err);
    return json({ error: 'lookup failed' }, 502);
  }
  if (!apiRes.ok) {
    console.warn('[youtube-lookup] Data API returned', apiRes.status);
    return json({ error: 'lookup failed' }, 502);
  }

  const data = await apiRes.json();
  const item = data?.items?.[0];
  if (!item) return json({ available: false, reason: 'not_found' });

  const privacyStatus: string | undefined = item.status?.privacyStatus;
  if (privacyStatus === 'private') return json({ available: false, reason: 'private' });
  if (item.status?.embeddable === false) return json({ available: false, reason: 'embed_disabled' });

  const thumbnails = item.snippet?.thumbnails ?? {};
  const durationSeconds = parseIsoDuration(item.contentDetails?.duration ?? 'PT0S');

  return json({
    available: true,
    title: item.snippet?.title ?? videoId,
    durationSeconds,
    privacyStatus: privacyStatus ?? 'public',
    // contentRating is a soft signal only — YouTube doesn't consistently
    // expose age-gating through this API, so we surface it as a hint for
    // the admin UI, not a hard block.
    contentRating: item.contentDetails?.contentRating ?? null,
    thumbnails: {
      default: thumbnails.default?.url ?? null,
      medium: thumbnails.medium?.url ?? null,
      high: thumbnails.high?.url ?? null,
      standard: thumbnails.standard?.url ?? null,
      maxres: thumbnails.maxres?.url ?? null,
    },
  });
});
