import { supabase } from './supabaseClient';

const COVERS = 'covers';
const MEDIA = 'media';

function randomPath(file: File): string {
  const ext = file.name.split('.').pop() ?? 'jpg';
  return `${crypto.randomUUID()}.${ext}`;
}

// ── URL generation ──────────────────────────────────────────────────────────
// Supabase's image transform endpoint resizes/re-encodes on the fly (and
// content-negotiates AVIF/WebP automatically), so visitors never download the
// full camera-original file — only the pixels a given layout slot can show.
//
// IMPORTANT: passing only `width` (no `height`) does NOT scale proportionally
// on this backend — it distorts the image. Always pass both dimensions with
// resize: 'contain' and a generous box; contain never crops or upscales, it
// just fits the real aspect ratio inside the box, so a square box works for
// portrait and landscape sources alike.

export type ImageTransform = {
  width?: number;
  height?: number;
  quality?: number;
  resize?: 'cover' | 'contain' | 'fill';
};

export function getCoverUrl(path: string, transform?: ImageTransform): string {
  return supabase.storage.from(COVERS).getPublicUrl(path, { transform }).data.publicUrl;
}

export function getMediaUrl(path: string, transform?: ImageTransform): string {
  return supabase.storage.from(MEDIA).getPublicUrl(path, { transform }).data.publicUrl;
}

function buildSrcSet(urlFor: (width: number) => string, widths: number[]): string {
  return widths.map(w => `${urlFor(w)} ${w}w`).join(', ');
}

// A square w×w box with resize:'contain' only delivers a true w-px-wide
// image for landscape/square sources — a portrait source is capped by the
// height axis instead, so it's delivered narrower than `w` while still being
// labeled "Nw" in a srcset. Browsers then under-fetch resolution for
// portraits specifically. Passing the real aspect ratio keeps width exact
// for every orientation by shaping the box to match.
function containBox(width: number, aspectRatio?: number): { width: number; height: number } {
  if (!aspectRatio) return { width, height: width };
  return { width, height: Math.round(width / aspectRatio) };
}

// Covers are always requested as a square box regardless of source
// orientation — the delivered image is cropped to a focal point client-side
// via CSS object-fit/object-position, so a square box deliberately
// over-fetches on one axis to guarantee enough pixels for any tile aspect
// ratio at any breakpoint (mobile vs. desktop, different container shapes).
export function getCoverSrcSet(path: string, widths: number[], quality = 80): string {
  return buildSrcSet(w => getCoverUrl(path, { width: w, height: w, resize: 'contain', quality }), widths);
}

export function getMediaUrlForWidth(path: string, width: number, quality = 80, aspectRatio?: number): string {
  return getMediaUrl(path, { ...containBox(width, aspectRatio), resize: 'contain', quality });
}

export function getMediaSrcSet(path: string, widths: number[], quality = 80, aspectRatio?: number): string {
  return buildSrcSet(w => getMediaUrlForWidth(path, w, quality, aspectRatio), widths);
}

// ── Pre-generated derivatives ───────────────────────────────────────────────
// scripts/generate-derivatives.ts backfills a fixed WebP ladder for each
// original, stored as plain static files at derivatives/{uuid}/{width}.webp
// in the same bucket — served directly with no on-the-fly transform, which
// is both faster (no transform round-trip) and immune to Supabase's
// transform source-size limit. Callers should treat these as best-effort:
// fall back to the on-the-fly transform (getMediaUrlForWidth/getMediaSrcSet
// above) via an <img onError> handler for anything not yet backfilled.

export const MEDIA_WIDTH_LADDER = [480, 768, 1080, 1440, 1920];
export const COVER_MOBILE_WIDTH_LADDER = [480, 768, 1080, 1440];
export const COVER_DESKTOP_WIDTH_LADDER = [768, 1080, 1440, 1920];

function derivativePath(originalPath: string, width: number): string {
  const stem = originalPath.replace(/\.[^./]+$/, '');
  return `derivatives/${stem}/${width}.webp`;
}

export function getMediaDerivativeUrl(path: string, width: number): string {
  return getMediaUrl(derivativePath(path, width));
}

export function getMediaDerivativeSrcSet(path: string, widths: number[] = MEDIA_WIDTH_LADDER): string {
  return buildSrcSet(w => getMediaDerivativeUrl(path, w), widths);
}

export function getCoverDerivativeUrl(path: string, width: number): string {
  return getCoverUrl(derivativePath(path, width));
}

export function getCoverDerivativeSrcSet(path: string, widths: number[]): string {
  return buildSrcSet(w => getCoverDerivativeUrl(path, w), widths);
}

// ── Auto-generation on upload ───────────────────────────────────────────────
// Fire-and-forget call to the generate-derivatives Edge Function
// (supabase/functions/generate-derivatives) so every future upload gets its
// derivative ladder without ever needing scripts/generate-derivatives.ts run
// by hand again. Must never throw or block the caller — if this fails for
// any reason (function not deployed yet, network hiccup, etc.), the
// aspect-ratio-correct on-the-fly transform fallback already wired into
// every gallery/cover component covers the gap until the next backfill.
export function triggerDerivativeGeneration(
  bucket: 'media' | 'covers',
  path: string,
  widths: number[],
  opts?: { naturalWidth?: number; aspectRatio?: number },
): void {
  supabase.functions
    .invoke('generate-derivatives', { body: { bucket, path, widths, ...opts } })
    .catch(err => console.warn('[triggerDerivativeGeneration] failed (non-fatal):', err));
}

// ── Intrinsic size ───────────────────────────────────────────────────────────
// Read locally before upload so the gallery can reserve layout space (and know
// landscape vs portrait) on first paint instead of after the image loads.

export function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null);
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

// ── Upload ───────────────────────────────────────────────────────────────────

export async function uploadCover(file: File): Promise<string> {
  const path = randomPath(file);
  const { error } = await supabase.storage.from(COVERS).upload(path, file);
  if (error) throw error;
  return path;
}

export async function uploadMedia(file: File): Promise<string> {
  const path = randomPath(file);
  const { error } = await supabase.storage.from(MEDIA).upload(path, file);
  if (error) throw error;
  return path;
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteCover(path: string): Promise<void> {
  const { error } = await supabase.storage.from(COVERS).remove([path]);
  if (error) throw error;
}

export async function deleteMedia(path: string): Promise<void> {
  const { error } = await supabase.storage.from(MEDIA).remove([path]);
  if (error) throw error;
}

// ── Replace ──────────────────────────────────────────────────────────────────

export async function replaceCover(oldPath: string, file: File): Promise<string> {
  const newPath = await uploadCover(file);
  await deleteCover(oldPath);
  return newPath;
}

export async function replaceMedia(oldPath: string, file: File): Promise<string> {
  const newPath = await uploadMedia(file);
  await deleteMedia(oldPath);
  return newPath;
}
