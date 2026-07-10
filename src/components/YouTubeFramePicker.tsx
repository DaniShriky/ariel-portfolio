import { formatDuration, type LookupSuccess, type StoryboardResult, type CapturePayload } from '../lib/youtube';

// Shared by AddYouTubeVideoModal and ChangeCoverFrameModal — renders either
// the scrubbable storyboard filmstrip or, when storyboards aren't available
// for this video, a fallback grid of YouTube's official auto-thumbnails.
type Props = {
  lookup: LookupSuccess;
  storyboard: StoryboardResult | null;
  scrubSeconds: number;
  onScrub: (seconds: number) => void;
  onConfirm: (payload: CapturePayload) => void;
  onCancel: () => void;
};

function YouTubeFramePicker({ lookup, storyboard, scrubSeconds, onScrub, onConfirm, onCancel }: Props) {
  if (storyboard?.available) {
    const { sprite } = storyboard;
    const maxSeconds = Math.min(lookup.durationSeconds, (sprite.tileCount * sprite.intervalMs) / 1000);
    const tileIndex = Math.min(Math.max(Math.floor((scrubSeconds * 1000) / sprite.intervalMs), 0), sprite.tileCount - 1);
    const col = tileIndex % sprite.columns;
    const row = Math.floor(tileIndex / sprite.columns);

    return (
      <>
        <p className="youtube-modal-subtitle">{lookup.title}</p>
        <div
          className="youtube-frame-preview"
          style={{
            width: sprite.tileWidth,
            height: sprite.tileHeight,
            backgroundImage: `url(${sprite.url})`,
            backgroundPosition: `-${col * sprite.tileWidth}px -${row * sprite.tileHeight}px`,
          }}
        />
        <input
          type="range"
          className="youtube-frame-scrubber"
          min={0}
          max={maxSeconds}
          step={sprite.intervalMs / 1000}
          value={scrubSeconds}
          onChange={e => onScrub(Number(e.target.value))}
        />
        <p className="youtube-modal-timestamp">{formatDuration(scrubSeconds)} / {formatDuration(lookup.durationSeconds)}</p>
        <div className="add-category-actions">
          <button className="add-category-cancel" onClick={onCancel}>Cancel</button>
          <button className="add-category-save" onClick={() => onConfirm({ mode: 'storyboard', timestampSeconds: scrubSeconds })}>
            Use this frame
          </button>
        </div>
      </>
    );
  }

  const options = (['maxres', 'high', 'medium', 'default'] as const)
    .map(quality => ({ quality, url: lookup.thumbnails[quality] }))
    .filter((o): o is { quality: 'maxres' | 'high' | 'medium' | 'default'; url: string } => !!o.url);

  return (
    <>
      <p className="youtube-modal-subtitle">{lookup.title}</p>
      <p className="youtube-modal-hint">
        A scrubbable frame picker isn't available for this video — choose one of YouTube's thumbnails instead.
      </p>
      <div className="youtube-thumbnail-options">
        {options.map(o => (
          <button
            key={o.quality}
            className="youtube-thumbnail-option"
            onClick={() => onConfirm({ mode: 'thumbnail', quality: o.quality })}
          >
            <img src={o.url} alt="" />
          </button>
        ))}
      </div>
      <div className="add-category-actions">
        <button className="add-category-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </>
  );
}

export default YouTubeFramePicker;
