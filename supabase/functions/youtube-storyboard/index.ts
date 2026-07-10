// Fetches the sprite-sheet "storyboard" YouTube generates for its own
// seek-bar hover preview, so the admin can scrub a filmstrip instead of
// picking from only the 3-4 official auto-thumbnails.
//
// THIS IS NOT PART OF THE OFFICIAL YOUTUBE API. It calls YouTube's internal
// "innertube" player endpoint (the same one youtube.com's own web player and
// tools like yt-dlp use) and parses an undocumented, YouTube-owned string
// format that has changed shape before and can change again without notice.
// The actual fetch+parse (fetchStoryboardSprite, in ../_shared/youtube.ts)
// never throws — any unexpected shape resolves to `null`/`available: false`
// rather than an error. The caller (the admin add-video flow) always has a
// safe path: fall back to youtube-lookup's official thumbnails. Nothing here
// should ever be treated as "load-bearing" for the feature to work at all.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { fetchStoryboardSprite } from '../_shared/youtube.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

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

  const sprite = await fetchStoryboardSprite(body.videoId);
  if (!sprite) return json({ available: false });
  return json({ available: true, sprite });
});
