import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { getMediaUrl, deleteMediaAndDerivatives, triggerDerivativeGeneration, MEDIA_WIDTH_LADDER } from '../lib/mediaService';
import { invokeFn, REASON_MESSAGES, type LookupSuccess, type LookupResult, type StoryboardResult, type CapturePayload } from '../lib/youtube';
import { useCapturedFrame } from '../hooks/useCapturedFrame';
import type { MediaItem } from '../types';
import CropEditorModal, { type CropData } from './CropEditorModal';
import YouTubeFramePicker from './YouTubeFramePicker';

// Re-picks the cover frame for an *existing* YouTube media item. Everything
// else about the item — external_id, title, duration, sort_order, and its
// position in the gallery — is left untouched; only storage_path, focal_x/y
// and metadata.crop/width/height change. Changing the underlying video
// itself is out of scope here (delete-and-re-add covers that case).
type Step = 'looking-up' | 'frame' | 'capturing' | 'crop' | 'error';

type Props = {
  item: MediaItem;
  onSaved: (item: MediaItem) => void;
  onCancel: () => void;
};

// item.external_id is nullable in the type (shared with 'upload' items),
// but a media_items row can only reach this modal via the "Change cover
// frame" menu option, which GalleryGrid only renders for provider==='youtube'
// items — the DB's own check constraint guarantees external_id is set
// whenever provider is 'youtube'. This is therefore a real invariant, not a
// defensive guess, so it's safe to resolve once at mount via lazy initial
// state rather than re-checking inside the effect on every dependency change.
function ChangeCoverFrameModal({ item, onSaved, onCancel }: Props) {
  const videoId = item.external_id;
  const [step, setStep] = useState<Step>(() => (videoId ? 'looking-up' : 'error'));
  const [errorMsg, setErrorMsg] = useState<string | null>(() => (videoId ? null : 'This item has no linked YouTube video.'));
  const [lookup, setLookup] = useState<LookupSuccess | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardResult | null>(null);
  const [scrubSeconds, setScrubSeconds] = useState(0);
  const [saving, setSaving] = useState(false);

  const frame = useCapturedFrame(videoId);

  // Re-validate the video is still available (it may have gone private since
  // it was added) and fetch a fresh storyboard/thumbnails set — the original
  // add flow's lookup result was never persisted on the item. The
  // !videoId case is already resolved by the lazy initial state above, so
  // there's nothing left to fetch — no setState needed on that path.
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await invokeFn<LookupResult>('youtube-lookup', { videoId });
        if (cancelled) return;
        if (!result.available) {
          setErrorMsg(REASON_MESSAGES[result.reason] ?? 'This video is unavailable.');
          setStep('error');
          return;
        }
        setLookup(result);

        const sb = await invokeFn<StoryboardResult>('youtube-storyboard', { videoId })
          .catch(() => ({ available: false as const }));
        if (cancelled) return;
        setStoryboard(sb);
        setStep('frame');
      } catch {
        if (cancelled) return;
        setErrorMsg('Something went wrong loading this video. Try again.');
        setStep('error');
      }
    })();
    return () => { cancelled = true; };
  }, [videoId]);

  async function handleCancel() {
    // Only the newly captured (uncommitted) frame is removed here — the
    // existing item's current cover is never touched by a cancel.
    await frame.cleanup();
    onCancel();
  }

  async function handleCaptureFrame(payload: CapturePayload) {
    if (!videoId) return;
    setStep('capturing');
    const result = await frame.capture(payload);
    if (!result.ok) {
      if (result.fallbackRequired) {
        toast.error("Couldn't capture that frame — pick an official thumbnail instead.");
        setStoryboard({ available: false });
      } else {
        toast.error('Failed to capture cover image.');
      }
      setStep('frame');
      return;
    }
    setStep('crop');
  }

  async function handleCropCancel() {
    await frame.cleanup();
    setStep('frame');
  }

  async function handleCropSave(crop: CropData) {
    const capturedPath = frame.capturedPath;
    if (!capturedPath) return;
    setSaving(true);
    try {
      const focalX = (crop.x + crop.width / 2) / 100;
      const focalY = (crop.y + crop.height / 2) / 100;
      const aspectRatio = frame.capturedDims ? frame.capturedDims.width / frame.capturedDims.height : undefined;

      // external_id, title, sort_order, and metadata.duration_seconds are
      // deliberately absent from this payload — only the cover-frame fields
      // change. Spreading item.metadata preserves duration_seconds and
      // anything else already stored there (e.g. a saved description).
      const { data, error: updateError } = await supabase
        .from('media_items')
        .update({
          storage_path: capturedPath,
          focal_x: focalX,
          focal_y: focalY,
          metadata: {
            ...item.metadata,
            crop,
            width: frame.capturedDims?.width,
            height: frame.capturedDims?.height,
          },
        })
        .eq('id', item.id)
        .select()
        .single();

      if (updateError) throw updateError;

      // DB now points at the new cover — it's a committed asset, not a
      // provisional one, so stop tracking it for cleanup. Only now is it
      // safe to remove the old cover; a failure above would have left the
      // existing item's storage_path (and file) completely untouched.
      frame.clearWithoutCleanup();
      const oldPath = item.storage_path;

      if (aspectRatio) {
        triggerDerivativeGeneration('media', capturedPath, MEDIA_WIDTH_LADDER, {
          naturalWidth: frame.capturedDims?.width,
          aspectRatio,
        });
      }

      // Best-effort — the DB has already committed to the new cover, so a
      // failure here just leaves the old file orphaned, not a broken item.
      deleteMediaAndDerivatives(oldPath).catch(err => {
        console.warn('[ChangeCoverFrameModal] old cover cleanup failed (non-fatal):', err);
      });

      toast.success('Cover updated');
      onSaved(data as MediaItem);
    } catch {
      toast.error('Failed to update cover');
      await frame.cleanup();
    } finally {
      setSaving(false);
    }
  }

  // ── render ──────────────────────────────────────────────────────────────

  if (step === 'crop' && frame.capturedPath) {
    return (
      <CropEditorModal
        imageUrl={getMediaUrl(frame.capturedPath)}
        existingCrop={null}
        saving={saving}
        onSave={handleCropSave}
        onCancel={handleCropCancel}
      />
    );
  }

  return (
    <div className="modal-backdrop" onClick={handleCancel}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <p className="modal-title">Change cover frame</p>

        {(step === 'looking-up' || step === 'capturing') && <div className="spinner" />}

        {step === 'error' && (
          <>
            <p className="youtube-modal-error">{errorMsg}</p>
            <div className="add-category-actions">
              <button className="add-category-cancel" onClick={handleCancel}>Close</button>
            </div>
          </>
        )}

        {step === 'frame' && lookup && (
          <YouTubeFramePicker
            lookup={lookup}
            storyboard={storyboard}
            scrubSeconds={scrubSeconds}
            onScrub={setScrubSeconds}
            onConfirm={handleCaptureFrame}
            onCancel={handleCancel}
          />
        )}
      </div>
    </div>
  );
}

export default ChangeCoverFrameModal;
