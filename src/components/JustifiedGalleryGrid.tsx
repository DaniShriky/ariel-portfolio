import { useEffect, useRef, useState } from 'react';
import { getMediaUrl } from '../lib/mediaService';
import type { MediaItem } from '../types';

// A justified gallery with a deliberately constrained row shape (per spec):
// on desktop, a row is either three portrait images, or exactly one
// landscape paired with one portrait — never two landscapes sharing a row.
// Each row's height is solved so its images, at their own true aspect
// ratio, sum to exactly the container width: flush edges, zero cropping.
// A row that doesn't match one of those two shapes (a lone image, or a
// trailing remainder of 1-2 portraits) renders at natural size instead of
// being stretched to fill. Below 768px this is skipped entirely in favor of
// a simple single-column stack (one image per row, full width, natural
// height), per the mobile spec.

const MOBILE_BREAKPOINT = 768;
// A truly solo image (no partner at all) is sized to this fraction of the
// container width, height following from its own aspect ratio — uncropped.
const SOLO_WIDTH_FRACTION = 0.8;
// Max width AND height for a row of 2 that doesn't fill (a 1-2 portrait
// remainder that still has a partner, just not a third) — each image fits
// inside this NxN box at its own true aspect ratio (object-fit: contain).
const LONE_BOX_SIZE = 300;
const BOX_SPACING = 12;
const FALLBACK_ASPECT_RATIO = 1.5; // used only until a legacy item's real dimensions are measured

function isLandscape(aspectRatio: number): boolean {
  return aspectRatio >= 1;
}

// Groups item indexes into rows: runs of portraits are chunked into groups
// of up to 3; a landscape pairs with whichever neighbor comes immediately
// after it if that neighbor is a portrait, and likewise a portrait pairs
// with an immediately-following landscape — the pairing works in either
// order, so which image lands on the left vs. right of the row is just
// whichever comes first in the gallery's own order (drag-reorder or the
// position number already controls that). Two landscapes never share a row.
function groupIntoRows(aspectRatios: number[]): number[][] {
  const rows: number[][] = [];
  let i = 0;
  while (i < aspectRatios.length) {
    const currentIsLandscape = isLandscape(aspectRatios[i]);
    const nextIsLandscape = i + 1 < aspectRatios.length ? isLandscape(aspectRatios[i + 1]) : null;

    if (nextIsLandscape !== null && currentIsLandscape !== nextIsLandscape) {
      // One landscape + one portrait, in whatever order they actually appear.
      rows.push([i, i + 1]);
      i += 2;
    } else if (currentIsLandscape) {
      // No portrait to pair with (end of list, or the next one is also landscape).
      rows.push([i]);
      i += 1;
    } else {
      // Gather a run of up to 3 consecutive portraits.
      const group = [i];
      let j = i + 1;
      while (j < aspectRatios.length && !isLandscape(aspectRatios[j]) && group.length < 3) {
        group.push(j);
        j += 1;
      }
      rows.push(group);
      i = j;
    }
  }
  return rows;
}

type Box = { top: number; left: number; width: number; height: number };

function computeGeometry(aspectRatios: number[], containerWidth: number): { boxes: Box[]; containerHeight: number } {
  const rows = groupIntoRows(aspectRatios);
  const boxes: Box[] = new Array(aspectRatios.length);
  let top = 0;

  for (const row of rows) {
    const ratios = row.map(idx => aspectRatios[idx]);
    const isThreePortraits = row.length === 3;
    const isLandscapePortraitPair = row.length === 2 && isLandscape(ratios[0]) !== isLandscape(ratios[1]);
    const fillsRow = isThreePortraits || isLandscapePortraitPair;

    let left = 0;
    let rowHeight = 0;

    if (fillsRow) {
      const sumRatios = ratios.reduce((a, b) => a + b, 0);
      const totalSpacing = (row.length - 1) * BOX_SPACING;
      rowHeight = (containerWidth - totalSpacing) / sumRatios;
      row.forEach((idx, i) => {
        const width = rowHeight * aspectRatios[idx];
        boxes[idx] = { top, left, width, height: rowHeight };
        left += width + (i < row.length - 1 ? BOX_SPACING : 0);
      });
    } else if (row.length === 1) {
      // Truly no partner: width is a fixed fraction of the container, height
      // follows from its own aspect ratio — uncropped. Centered, since it's
      // not flush against either edge of a shared row.
      const ratio = aspectRatios[row[0]];
      const width = containerWidth * SOLO_WIDTH_FRACTION;
      const height = width / ratio;
      boxes[row[0]] = { top, left: (containerWidth - width) / 2, width, height };
      rowHeight = height;
    } else {
      // A 1-2 portrait remainder that still has a partner, just not a third:
      // each fits its own aspect ratio inside the same LONE_BOX_SIZE x
      // LONE_BOX_SIZE box, uncropped — not stretched to the container width.
      row.forEach((idx, i) => {
        const ratio = aspectRatios[idx];
        const width = Math.min(LONE_BOX_SIZE, LONE_BOX_SIZE * ratio);
        const height = Math.min(LONE_BOX_SIZE, LONE_BOX_SIZE / ratio);
        boxes[idx] = { top, left, width, height };
        left += width + (i < row.length - 1 ? BOX_SPACING : 0);
        rowHeight = Math.max(rowHeight, height);
      });
    }

    top += rowHeight + BOX_SPACING;
  }

  return { boxes, containerHeight: Math.max(0, top - BOX_SPACING) };
}

function useAspectRatios(items: MediaItem[]): Map<string, number> {
  const [measured, setMeasured] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const toMeasure = items.filter(item => {
      if (item.type === 'video') return false;
      const dims = item.metadata as { width?: number; height?: number } | undefined;
      return !(dims?.width && dims?.height) && !measured.has(item.id);
    });

    toMeasure.forEach(item => {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        setMeasured(prev => new Map(prev).set(item.id, img.naturalWidth / img.naturalHeight));
      };
      // Small probe — same URL the visible thumbnail will also request, so the
      // browser typically dedupes/caches rather than double-downloading.
      img.src = getMediaUrl(item.storage_path, { width: 400, height: 400, resize: 'contain', quality: 60 });
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return measured;
}

type Props = {
  items: MediaItem[];
  renderItem: (item: MediaItem, index: number, positionStyle: React.CSSProperties | undefined) => React.ReactNode;
};

function JustifiedGalleryGrid({ items, renderItem }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const measuredAspectRatios = useAspectRatios(items);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Not yet measured — avoid a flash between the two layouts.
  if (containerWidth === 0) {
    return <div ref={containerRef} className="spinner" />;
  }

  // Mobile: one image per row, full width, natural height — no algorithm needed.
  if (containerWidth < MOBILE_BREAKPOINT) {
    return (
      <div ref={containerRef} className="gallery-grid--justified-stack">
        {items.map((item, idx) => renderItem(item, idx, undefined))}
      </div>
    );
  }

  const aspectRatios = items.map(item => {
    if (item.type === 'video') return FALLBACK_ASPECT_RATIO;
    const dims = item.metadata as { width?: number; height?: number } | undefined;
    if (dims?.width && dims?.height) return dims.width / dims.height;
    return measuredAspectRatios.get(item.id) ?? FALLBACK_ASPECT_RATIO;
  });

  const { boxes, containerHeight } = computeGeometry(aspectRatios, containerWidth);

  return (
    <div ref={containerRef} className="gallery-grid--justified" style={{ height: containerHeight }}>
      {items.map((item, idx) => {
        const box = boxes[idx];
        return renderItem(item, idx, {
          position: 'absolute',
          top: box.top,
          left: box.left,
          width: box.width,
          height: box.height,
        });
      })}
    </div>
  );
}

export default JustifiedGalleryGrid;
