// Shared by youtube-storyboard and youtube-cover-capture — both need the
// same undocumented, YouTube-owned storyboard spec, and duplicating this
// fragile parsing logic in two places would risk them drifting out of sync
// on what "safe" means. See youtube-storyboard/index.ts for the full
// rationale: this must always resolve to `null` rather than throw when
// YouTube's undocumented format doesn't match what we expect.

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`;

export type SpriteSheet = {
  url: string;
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  tileCount: number;
  intervalMs: number;
};

function parseStoryboardSpec(spec: string): SpriteSheet | null {
  const parts = spec.split('|');
  if (parts.length < 2) return null;

  const urlTemplate = parts[0];
  const levelParts = parts[parts.length - 1].split('#');
  if (levelParts.length < 8) return null;

  const [wStr, hStr, countStr, colsStr, rowsStr, intervalStr, , sigh] = levelParts;
  const tileWidth = Number(wStr);
  const tileHeight = Number(hStr);
  const tileCount = Number(countStr);
  const columns = Number(colsStr);
  const rows = Number(rowsStr);
  const intervalMs = Number(intervalStr);

  if (![tileWidth, tileHeight, tileCount, columns, rows, intervalMs].every(n => Number.isFinite(n) && n > 0)) {
    return null;
  }
  if (!urlTemplate.includes('$L') || !urlTemplate.includes('$N')) return null;

  const levelIndex = parts.length - 2;
  const url = urlTemplate
    .replace('$L', String(levelIndex))
    .replace('$N', '0')
    .replace('$M', '0')
    + (sigh ? `&sigh=${sigh}` : '');

  return { url, columns, rows, tileWidth, tileHeight, tileCount: Math.min(tileCount, columns * rows), intervalMs };
}

// Never throws — any failure (network, unexpected shape, missing field)
// resolves to null so callers can fall back to official thumbnails.
export async function fetchStoryboardSprite(videoId: string): Promise<SpriteSheet | null> {
  try {
    const res = await fetch(INNERTUBE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId,
        context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' } },
      }),
    });
    if (!res.ok) return null;

    const player = await res.json();
    const spec: unknown = player?.storyboards?.playerStoryboardSpecRenderer?.spec;
    if (typeof spec !== 'string') return null;

    return parseStoryboardSpec(spec);
  } catch (err) {
    console.warn('[youtube shared] storyboard fetch failed, falling back:', err);
    return null;
  }
}
