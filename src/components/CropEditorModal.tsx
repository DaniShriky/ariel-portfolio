import { useState } from 'react';
import ReactCrop, { type Crop, type PercentCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

export type CropData = {
  x: number;      // 0-100 (% of original image width)
  y: number;      // 0-100 (% of original image height)
  width: number;  // 0-100
  height: number; // 0-100
};

type Props = {
  imageUrl: string;
  existingCrop: CropData | null;
  aspect?: number;
  saving?: boolean;
  onSave: (crop: CropData) => void;
  onCancel: () => void;
};

function CropEditorModal({ imageUrl, existingCrop, aspect, saving = false, onSave, onCancel }: Props) {
  const [crop, setCrop] = useState<Crop | undefined>(
    existingCrop ? { unit: '%', ...existingCrop } : undefined
  );

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    if (existingCrop) return;
    const { naturalWidth: iW, naturalHeight: iH } = e.currentTarget;
    if (aspect) {
      setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, aspect, iW, iH), iW, iH));
    } else {
      setCrop({ unit: '%', x: 5, y: 5, width: 90, height: 90 });
    }
  }

  function handleSave() {
    if (!crop || !crop.width || !crop.height) return;
    // crop is always in '%' unit (we always store percentCrop)
    onSave({ x: crop.x, y: crop.y, width: crop.width, height: crop.height });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="crop-modal-panel" onClick={e => e.stopPropagation()}>
        <p className="modal-title">Crop image</p>

        <div className="crop-editor-scroll">
          <ReactCrop
            crop={crop}
            onChange={(_px, pct: PercentCrop) => setCrop(pct)}
            minWidth={5}
            minHeight={5}
          >
            <img
              src={imageUrl}
              className="crop-editor-img"
              onLoad={e => onImageLoad(e)}
              draggable={false}
            />
          </ReactCrop>
        </div>

        <div className="add-category-actions">
          <button className="add-category-cancel" onClick={onCancel}>Cancel</button>
          <button
            className="add-category-save"
            onClick={handleSave}
            disabled={!crop?.width || !crop?.height || saving}
          >
            {saving ? 'Saving…' : 'Save crop'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CropEditorModal;
