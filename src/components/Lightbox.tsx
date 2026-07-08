import { useEffect, useCallback, useState } from 'react';
import { getMediaUrl, getMediaSrcSet } from '../lib/mediaService';
import type { MediaItem } from '../types';

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

  // Supabase's image transform rejects source files above its size limit;
  // fall back to the untransformed URL rather than showing a broken image.
  // Scoped to the item id it was recorded for, so navigating to a different
  // item doesn't need an effect to reset it.
  const [failedItemId, setFailedItemId] = useState<string | undefined>(undefined);
  const transformFailed = failedItemId === item?.id;
  const description = (item?.metadata as { description?: string } | undefined)?.description;

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
            src={transformFailed ? getMediaUrl(item.storage_path) : getMediaUrl(item.storage_path, { width: 2000, height: 2000, resize: 'contain', quality: 88 })}
            srcSet={transformFailed ? undefined : getMediaSrcSet(item.storage_path, [1200, 1600, 2000], 88)}
            sizes="(max-width: 767px) calc(100vw - 88px), calc(100vw - 128px)"
            alt={item.title}
            className="lightbox-img"
            decoding="async"
            onError={() => setFailedItemId(item.id)}
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
