import { useEffect, useCallback, useState } from 'react';
import {
  getMediaUrl, getMediaUrlForWidth, getMediaSrcSet,
  getMediaDerivativeUrl, getMediaDerivativeSrcSet, MEDIA_WIDTH_LADDER,
} from '../lib/mediaService';
import type { MediaItem } from '../types';

const LIGHTBOX_MAX_DERIVATIVE_WIDTH = MEDIA_WIDTH_LADDER[MEDIA_WIDTH_LADDER.length - 1]; // 1920 — largest pre-generated size

type Props = {
  items: MediaItem[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
};

function Lightbox({ items, index, onClose, onNavigate }: Props) {
  const item    = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const prev = useCallback(() => { if (index > 0) onNavigate(index - 1); }, [index, onNavigate]);
  const next = useCallback(() => { if (index < items.length - 1) onNavigate(index + 1); }, [index, items.length, onNavigate]);

  // Three-tier fallback, same as the grid: pre-generated derivative (fast,
  // static file, up to 1920px) → on-the-fly transform (still aspect-correct,
  // higher quality for close viewing) → fully untransformed original
  // (Supabase's transform endpoint rejects source files above its size
  // limit, so this is the last resort). Scoped to the item id it was
  // recorded for, so navigating to a different item doesn't need an effect
  // to reset it.
  const [derivativeFailedItemId, setDerivativeFailedItemId] = useState<string | undefined>(undefined);
  const [transformFailedItemId, setTransformFailedItemId] = useState<string | undefined>(undefined);
  const derivativeFailed = derivativeFailedItemId === item?.id;
  const transformFailed = transformFailedItemId === item?.id;
  const dims = item?.metadata as { width?: number; height?: number; description?: string } | undefined;
  const aspectRatio = dims?.width && dims?.height ? dims.width / dims.height : undefined;
  const description = dims?.description;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      onClose();
      else if (e.key === 'ArrowLeft')  prev();
      else if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, prev, next]);

  useEffect(() => {
    const saved = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = saved; };
  }, []);

  if (!item) return null;

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">✕</button>

      {hasPrev && (
        <button
          className="lightbox-arrow lightbox-arrow--prev"
          onClick={e => { e.stopPropagation(); prev(); }}
          aria-label="Previous image"
        >‹</button>
      )}

      <div className="lightbox-content" onClick={e => e.stopPropagation()}>
        {item.type === 'video' ? (
          <video
            src={getMediaUrl(item.storage_path)}
            className="lightbox-video"
            controls
            playsInline
          />
        ) : (
          <img
            src={
              transformFailed ? getMediaUrl(item.storage_path)
              : derivativeFailed ? getMediaUrlForWidth(item.storage_path, 1920, 88, aspectRatio)
              : getMediaDerivativeUrl(item.storage_path, LIGHTBOX_MAX_DERIVATIVE_WIDTH)
            }
            srcSet={
              transformFailed ? undefined
              : derivativeFailed ? getMediaSrcSet(item.storage_path, [1200, 1600, 1920], 88, aspectRatio)
              : getMediaDerivativeSrcSet(item.storage_path)
            }
            sizes="(max-width: 767px) calc(100vw - 88px), calc(100vw - 128px)"
            alt={item.title}
            className="lightbox-img"
            decoding="async"
            onError={() => {
              if (!derivativeFailed) setDerivativeFailedItemId(item.id);
              else setTransformFailedItemId(item.id);
            }}
          />
        )}
      </div>

      {hasNext && (
        <button
          className="lightbox-arrow lightbox-arrow--next"
          onClick={e => { e.stopPropagation(); next(); }}
          aria-label="Next image"
        >›</button>
      )}

      {description && <p className="lightbox-caption">{description}</p>}

      <span className="lightbox-counter">{index + 1} / {items.length}</span>
    </div>
  );
}

export default Lightbox;
