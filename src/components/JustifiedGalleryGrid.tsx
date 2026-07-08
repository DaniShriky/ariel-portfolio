import { useEffect, useRef, useState } from 'react';
import justifiedLayout from 'justified-layout';
import { getMediaUrl } from '../lib/mediaService';
import type { MediaItem } from '../types';

// A real justified/Flickr-style gallery: solves for the row height that makes
// each row's images (at their own true aspect ratio) sum to exactly the
// container width, so rows are flush on both edges with zero cropping —
// unlike a fixed-height + object-fit:cover approximation. Below 768px this
// is skipped entirely in favor of a simple single-column stack per the
// mobile spec (one image per row, full width, natural height).

const MOBILE_BREAKPOINT = 768;
const TARGET_ROW_HEIGHT = 300;
const BOX_SPACING = 12;
const FALLBACK_ASPECT_RATIO = 1.5; // used only until a legacy item's real dimensions are measured

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

  const layout = justifiedLayout(aspectRatios, {
    containerWidth,
    boxSpacing: BOX_SPACING,
    targetRowHeight: TARGET_ROW_HEIGHT,
    targetRowHeightTolerance: 0.3,
    containerPadding: 0,
  });

  return (
    <div ref={containerRef} className="gallery-grid--justified" style={{ height: layout.containerHeight }}>
      {items.map((item, idx) => {
        const box = layout.boxes[idx];
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
