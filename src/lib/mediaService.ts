import { supabase } from './supabaseClient';

const COVERS = 'covers';
const MEDIA = 'media';

function randomPath(file: File): string {
  const ext = file.name.split('.').pop() ?? 'jpg';
  return `${crypto.randomUUID()}.${ext}`;
}

// ── URL generation ──────────────────────────────────────────────────────────
// To add image transforms later (Supabase Pro / Cloudinary), only change here.

export function getCoverUrl(path: string): string {
  return supabase.storage.from(COVERS).getPublicUrl(path).data.publicUrl;
}

export function getMediaUrl(path: string): string {
  return supabase.storage.from(MEDIA).getPublicUrl(path).data.publicUrl;
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
