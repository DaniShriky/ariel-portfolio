// Backfills a fixed WebP derivative ladder for every existing photo/cover
// already sitting in Supabase Storage, without ever touching the originals.
//
// Why this exists: the app's on-the-fly Supabase transform requests every
// srcset candidate as a square box, which silently under-delivers resolution
// for portrait photos relative to what the srcset label promises (see
// src/lib/mediaService.ts). Pre-generating correctly-sized WebP files here —
// using the image's real aspect ratio, at one fixed quality setting for
// every image — removes that bug entirely and is also faster to serve
// (static file, no live transform, no Supabase transform size-limit
// fallback). The app prefers these derivatives and falls back to the
// on-the-fly transform (now aspect-fixed too) for anything not yet
// backfilled — see getMediaDerivativeUrl/getCoverDerivativeUrl callers.
//
// Usage:
//   npm run generate-derivatives -- --test          (a handful of representative images only)
//   npm run generate-derivatives -- --all            (every media item + node cover)
//   npm run generate-derivatives -- --all --force     (regenerate even if a derivative already exists)
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env (Project Settings -> API in the
// Supabase dashboard) — service role is needed to write to Storage from a
// script with no browser session; see .env.example.

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── env loading (no extra dependency — this repo has no dotenv installed) ──

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(__dirname, '..', '.env'));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Add SUPABASE_SERVICE_ROLE_KEY to your local .env (see .env.example) — get it from');
  console.error('the Supabase dashboard: Project Settings -> API -> service_role secret.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── config — mirrors src/lib/mediaService.ts's ladders exactly ─────────────

const MEDIA_WIDTHS = [480, 768, 1080, 1440, 1920];
const COVER_MOBILE_WIDTHS = [480, 768, 1080, 1440];
const COVER_DESKTOP_WIDTHS = [768, 1080, 1440, 1920];

const WEBP_QUALITY = 82;
const WEBP_EFFORT = 4;

type Bucket = 'media' | 'covers';

// ── path helpers (must match derivativePath() in src/lib/mediaService.ts) ──

function derivativeFolder(path: string): string {
  const stem = path.replace(/\.[^./]+$/, '');
  return `derivatives/${stem}`;
}

function getPublicUrl(bucket: Bucket, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// ── formatting ───────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// ── core: process one original into its derivative ladder ──────────────────

type Derivative = { width: number; height: number; bytes: number; url: string; skipped: boolean };
type ProcessResult = {
  label: string;
  originalBytes: number;
  originalWidth: number;
  originalHeight: number;
  originalUrl: string;
  derivatives: Derivative[];
};

async function listExistingWidths(bucket: Bucket, path: string): Promise<Set<number>> {
  const { data, error } = await supabase.storage.from(bucket).list(derivativeFolder(path));
  if (error || !data) return new Set();
  const widths = new Set<number>();
  for (const obj of data) {
    const m = /^(\d+)\.webp$/.exec(obj.name);
    if (m) widths.add(Number(m[1]));
  }
  return widths;
}

async function processImage(
  bucket: Bucket,
  path: string,
  label: string,
  widths: number[],
  force: boolean,
): Promise<ProcessResult | null> {
  const { data: originalBlob, error: downloadError } = await supabase.storage.from(bucket).download(path);
  if (downloadError || !originalBlob) {
    console.error(`  x ${label}: failed to download original (${downloadError?.message ?? 'unknown error'})`);
    return null;
  }
  const buffer = Buffer.from(await originalBlob.arrayBuffer());
  const meta = await sharp(buffer).metadata();
  const naturalWidth = meta.width ?? 0;
  const naturalHeight = meta.height ?? 0;

  const existing = force ? new Set<number>() : await listExistingWidths(bucket, path);
  const derivatives: Derivative[] = [];

  for (const width of widths) {
    // Never upscale — if the source is narrower than this rung there are no
    // real pixels to deliver at it, so skip it entirely rather than fabricate
    // detail. The srcset simply won't offer this candidate for that image.
    if (width > naturalWidth) continue;

    const outPath = `${derivativeFolder(path)}/${width}.webp`;

    if (existing.has(width)) {
      const { data: existingBlob } = await supabase.storage.from(bucket).download(outPath);
      const height = Math.round(width * (naturalHeight / naturalWidth));
      derivatives.push({
        width,
        height,
        bytes: existingBlob?.size ?? 0,
        url: getPublicUrl(bucket, outPath),
        skipped: true,
      });
      continue;
    }

    const resizedBuffer = await sharp(buffer)
      .resize({ width, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
      .toBuffer();
    const resizedMeta = await sharp(resizedBuffer).metadata();

    const { error: uploadError } = await supabase.storage.from(bucket).upload(outPath, resizedBuffer, {
      contentType: 'image/webp',
      upsert: true,
    });
    if (uploadError) {
      console.error(`  x ${label}: failed to upload ${width}w derivative (${uploadError.message})`);
      continue;
    }

    derivatives.push({
      width,
      height: resizedMeta.height ?? 0,
      bytes: resizedBuffer.length,
      url: getPublicUrl(bucket, outPath),
      skipped: false,
    });
  }

  return {
    label,
    originalBytes: buffer.length,
    originalWidth: naturalWidth,
    originalHeight: naturalHeight,
    originalUrl: getPublicUrl(bucket, path),
    derivatives,
  };
}

function printResult(result: ProcessResult): void {
  console.log(`\n${result.label}`);
  console.log(`  original: ${result.originalWidth}x${result.originalHeight}, ${fmtBytes(result.originalBytes)}`);
  console.log(`    ${result.originalUrl}`);
  for (const d of result.derivatives) {
    const tag = d.skipped ? '(already existed, skipped)' : `(quality ${WEBP_QUALITY})`;
    console.log(`  ${d.width}w -> ${d.width}x${d.height}, ${fmtBytes(d.bytes)} ${tag}`);
    console.log(`    ${d.url}`);
  }
  if (result.derivatives.length === 0) {
    console.log('  (no derivatives generated — original is narrower than every target width)');
  }
}

// ── DB row shapes (hand-written — no generated Database types in this repo) ──

type MediaItemRow = { storage_path: string; title: string; metadata: { width?: number; height?: number } | null };
type NodeRow = { title: string; cover_path: string | null; cover_path_desktop: string | null };

// ── test mode: a small representative sample ────────────────────────────────

async function selectTestCandidates(): Promise<{ bucket: Bucket; path: string; label: string; widths: number[] }[]> {
  const candidates: { bucket: Bucket; path: string; label: string; widths: number[] }[] = [];

  const { data: mediaItems } = await supabase
    .from('media_items')
    .select('storage_path, title, metadata')
    .eq('type', 'photo')
    .limit(200)
    .returns<MediaItemRow[]>();

  const items = mediaItems ?? [];
  const isPortrait = (i: MediaItemRow) => !!i.metadata?.width && !!i.metadata?.height && i.metadata.width < i.metadata.height;
  const isLandscape = (i: MediaItemRow) => !!i.metadata?.width && !!i.metadata?.height && i.metadata.width >= i.metadata.height;

  const portrait = items.find(isPortrait);
  const landscape = items.find(isLandscape);
  const extra = items.find(i => i !== portrait && i !== landscape);

  for (const item of [portrait, landscape, extra]) {
    if (item) candidates.push({ bucket: 'media', path: item.storage_path, label: `[gallery photo] ${item.title || item.storage_path}`, widths: MEDIA_WIDTHS });
  }

  const { data: nodes } = await supabase
    .from('nodes')
    .select('title, cover_path, cover_path_desktop')
    .limit(200)
    .returns<NodeRow[]>();

  const nodeRows = nodes ?? [];
  for (const n of nodeRows.filter(n => n.cover_path).slice(0, 2)) {
    candidates.push({ bucket: 'covers', path: n.cover_path as string, label: `[node cover, mobile] ${n.title}`, widths: COVER_MOBILE_WIDTHS });
  }
  for (const n of nodeRows.filter(n => n.cover_path_desktop).slice(0, 2)) {
    candidates.push({ bucket: 'covers', path: n.cover_path_desktop as string, label: `[node cover, desktop] ${n.title}`, widths: COVER_DESKTOP_WIDTHS });
  }

  return candidates;
}

async function runTest(force: boolean): Promise<void> {
  const candidates = await selectTestCandidates();
  if (candidates.length === 0) {
    console.log('No candidates found in the database.');
    return;
  }
  console.log(`Test mode — processing ${candidates.length} representative images. Originals are never modified.\n`);
  for (const c of candidates) {
    const result = await processImage(c.bucket, c.path, c.label, c.widths, force);
    if (result) printResult(result);
  }
  console.log('\nTest run complete. Nothing else was touched.');
  console.log('Once you\'ve reviewed the sizes/dimensions/quality above (open the URLs to compare visually),');
  console.log('run `npm run generate-derivatives -- --all` to backfill the rest of the library.');
}

// ── full backfill ────────────────────────────────────────────────────────

async function runAll(force: boolean): Promise<void> {
  const { data: mediaItems } = await supabase
    .from('media_items')
    .select('storage_path, title, metadata')
    .eq('type', 'photo')
    .returns<MediaItemRow[]>();
  const { data: nodes } = await supabase
    .from('nodes')
    .select('title, cover_path, cover_path_desktop')
    .returns<NodeRow[]>();

  let processed = 0;
  let totalOriginalBytes = 0;
  let totalDerivativeBytes = 0;

  for (const item of mediaItems ?? []) {
    const result = await processImage('media', item.storage_path, `[gallery photo] ${item.title || item.storage_path}`, MEDIA_WIDTHS, force);
    if (!result) continue;
    processed++;
    totalOriginalBytes += result.originalBytes;
    totalDerivativeBytes += result.derivatives.reduce((sum, d) => sum + d.bytes, 0);
    console.log(`OK ${result.label} (${result.derivatives.length} sizes)`);
  }

  for (const node of nodes ?? []) {
    if (node.cover_path) {
      const result = await processImage('covers', node.cover_path, `[node cover, mobile] ${node.title}`, COVER_MOBILE_WIDTHS, force);
      if (result) { processed++; console.log(`OK ${result.label} (${result.derivatives.length} sizes)`); }
    }
    if (node.cover_path_desktop) {
      const result = await processImage('covers', node.cover_path_desktop, `[node cover, desktop] ${node.title}`, COVER_DESKTOP_WIDTHS, force);
      if (result) { processed++; console.log(`OK ${result.label} (${result.derivatives.length} sizes)`); }
    }
  }

  console.log(`\nDone. Processed ${processed} images.`);
  if (totalOriginalBytes > 0) {
    console.log(`Media originals sampled at ${fmtBytes(totalOriginalBytes)} of combined derivative output ${fmtBytes(totalDerivativeBytes)}.`);
  }
}

// ── entry point ──────────────────────────────────────────────────────────

function parseArgs(): { mode: 'test' | 'all'; force: boolean } {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  if (args.includes('--all')) return { mode: 'all', force };
  if (args.includes('--test')) return { mode: 'test', force };
  console.error('Usage: npm run generate-derivatives -- --test | --all [--force]');
  process.exit(1);
}

async function main(): Promise<void> {
  const { mode, force } = parseArgs();
  if (mode === 'test') await runTest(force);
  else await runAll(force);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
