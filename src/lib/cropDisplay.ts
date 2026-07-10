import type { CSSProperties } from 'react';
import type { CropData } from '../components/CropEditorModal';

// Given crop (%, 0-100) + natural image size + container size,
// compute background-image CSS that shows exactly the crop region (cover-fit).
// Shared by NodeButton (node covers) and GalleryGrid (YouTube video posters)
// so both render a saved crop identically.
export function computeCropBg(
  url: string,
  crop: CropData,
  nW: number, nH: number,
  cW: number, cH: number,
): CSSProperties {
  const cropPxX = (crop.x      / 100) * nW;
  const cropPxY = (crop.y      / 100) * nH;
  const cropPxW = (crop.width  / 100) * nW;
  const cropPxH = (crop.height / 100) * nH;

  // Scale so the crop region fills the container (cover behaviour)
  const s    = Math.max(cW / cropPxW, cH / cropPxH);
  const bgX  = -cropPxX * s + (cW - cropPxW * s) / 2;
  const bgY  = -cropPxY * s + (cH - cropPxH * s) / 2;

  return {
    backgroundImage:    `url(${url})`,
    backgroundSize:     `${nW * s}px ${nH * s}px`,
    backgroundPosition: `${bgX}px ${bgY}px`,
    backgroundRepeat:   'no-repeat',
  };
}
