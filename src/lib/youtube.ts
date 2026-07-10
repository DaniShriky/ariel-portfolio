import { supabase } from './supabaseClient';

// Response shapes shared between AddYouTubeVideoModal (new item) and
// ChangeCoverFrameModal (re-pick a cover for an existing item) — both talk
// to the same three edge functions and render the same frame picker.
export type LookupSuccess = {
  available: true;
  title: string;
  durationSeconds: number;
  thumbnails: Record<'default' | 'medium' | 'high' | 'standard' | 'maxres', string | null>;
};
export type LookupResult = LookupSuccess | { available: false; reason: 'not_found' | 'private' | 'embed_disabled' | 'unavailable' };

export type Sprite = { url: string; columns: number; rows: number; tileWidth: number; tileHeight: number; tileCount: number; intervalMs: number };
export type StoryboardResult = { available: true; sprite: Sprite } | { available: false };

export type CaptureResult =
  | { success: true; storagePath: string; width: number; height: number }
  | { success: false; error: string; fallbackRequired: boolean };

export type CapturePayload = { mode: 'storyboard'; timestampSeconds: number } | { mode: 'thumbnail'; quality: string };

export const REASON_MESSAGES: Record<string, string> = {
  not_found: 'Video not found. Check the URL and try again.',
  private: 'This video is private.',
  embed_disabled: "This video's owner has disabled embedding.",
  unavailable: 'This video is unavailable.',
};

export async function invokeFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data as T;
}

// Accepts a bare 11-char video ID, or a full URL in any of YouTube's common
// shapes (watch?v=, youtu.be/, shorts/, embed/). Returns null for anything
// that doesn't resolve to a syntactically valid video ID — this is a format
// check only, not a check that the video actually exists (that's
// youtube-lookup's job).
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (ID_PATTERN.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return ID_PATTERN.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v');
      return id && ID_PATTERN.test(id) ? id : null;
    }
    const match = url.pathname.match(/^\/(shorts|embed)\/([^/]+)/);
    if (match && ID_PATTERN.test(match[2])) return match[2];
  }

  return null;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
