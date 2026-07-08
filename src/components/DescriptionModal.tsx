import { useState } from 'react';

type Props = {
  initialValue: string;
  saving?: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
};

function DescriptionModal({ initialValue, saving = false, onSave, onCancel }: Props) {
  const [text, setText] = useState(initialValue);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-panel description-modal-panel" onClick={e => e.stopPropagation()}>
        <p className="modal-title">Edit description</p>
        <textarea
          className="description-modal-textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a caption for this image…"
          autoFocus
          disabled={saving}
        />
        <div className="node-cover-preview__actions">
          <button onClick={onCancel} disabled={saving} className="node-preview-btn node-preview-btn--cancel">Cancel</button>
          <button onClick={() => onSave(text)} disabled={saving} className="node-preview-btn node-preview-btn--save">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DescriptionModal;
