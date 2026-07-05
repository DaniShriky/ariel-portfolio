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

// Square contain-box per candidate width: whichever axis of the real image is
// larger gets capped at `w`, aspect ratio always preserved.
export function getCoverSrcSet(path: string, widths: number[], quality = 80): string {
  return buildSrcSet(w => getCoverUrl(path, { width: w, height: w, resize: 'contain', quality }), widths);
}

export function getMediaSrcSet(path: string, widths: number[], quality = 80): string {
  return buildSrcSet(w => getMediaUrl(path, { width: w, height: w, resize: 'contain', quality }), widths);
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
