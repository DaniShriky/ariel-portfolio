import { useState } from 'react';
import { getMediaUrl } from '../lib/mediaService';
import type { MediaItem } from '../types';

type Props = {
  items: MediaItem[];
};

function GalleryGrid({ items }: Props) {
  const [orientations, setOrientations] = useState<Record<string, 'landscape' | 'portrait'>>({});

  function handleLoad(id: string, e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setOrientations(prev => ({
      ...prev,
      [id]: img.naturalWidth >= img.naturalHeight ? 'landscape' : 'portrait',
    }));
  }

  return (
    <div className="gallery-grid">
      {items.map(item => {
        const url = getMediaUrl(item.storage_path);
        const orientation = orientations[item.id];
        const className = `gallery-item${orientation === 'landscape' ? ' gallery-item--landscape' : ''}`;

        return (
          <div key={item.id} className={className}>
            <img
              src={url}
              alt={item.title}
              className="gallery-img"
              onLoad={e => handleLoad(item.id, e)}
            />
          </div>
        );
      })}
    </div>
  );
}

export default GalleryGrid;
