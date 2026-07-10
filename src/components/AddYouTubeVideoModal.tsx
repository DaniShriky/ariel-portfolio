import { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { getMediaUrl, triggerDerivativeGeneration, MEDIA_WIDTH_LADDER } from '../lib/mediaService';
import { parseYouTubeId, invokeFn, REASON_MESSAGES, type LookupSuccess, type LookupResult, type StoryboardResult, type CapturePayload } from '../lib/youtube';
import { useCapturedFrame } from '../hooks/useCapturedFrame';
import type { MediaItem } from '../types';
import CropEditorModal, { type CropData } from './CropEditorModal';
import YouTubeFramePicker from './YouTubeFramePicker';

// 'crop' covers its own "saving" feedback via CropEditorModal's `saving`
// prop (see handleCropSave) — there is no separate post-crop step.
type Step = 'url' | 'looking-up' | 'frame' | 'capturing' | 'crop';

type Props = {
  nodeId: string;
  baseSortOrder: number;
  onSaved: (item: MediaItem) => void;
  onCancel: () => void;
};

function AddYouTubeVideoModal({ nodeId, baseSortOrder, onSaved, onCancel }: Props) {
  const [step, setStep] = useState<Step>('url');
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupSuccess | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardResult | null>(null);
  const [scrubSeconds, setScrubSeconds] = useState(0);
  const [saving, setSaving] = useState(false);

  const frame = useCapturedFrame(videoId);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleCancel() {
    await frame.cleanup();
    onCancel();
  }

  async function handleUrlSubmit() {
    const id = parseYouTubeId(urlInput);
    if (!id) { setError('Enter a valid YouTube URL or video ID.'); return; }

    setError(null);
    setStep('looking-up');
    try {
      // Friendly early warning — the DB unique index (node_id, external_id)
      // where provider='youtube' is the real guard against a race.
      const { data: existing } = await supabase
        .from('media_items')
        .select('id')
        .eq('node_id', nodeId)
        .eq('provider', 'youtube')
        .eq('external_id', id)
        .maybeSingle();
      if (existing) {
        setError('This video is already in this gallery.');
        setStep('url');
        return;
      }

      const result = await invokeFn<LookupResult>('youtube-lookup', { videoId: id });
      if (!result.available) {
        setError(REASON_MESSAGES[result.reason] ?? 'This video is unavailable.');
        setStep('url');
        return;
      }

      setVideoId(id);
      setLookup(result);
      setScrubSeconds(0);

      const sb = await invokeFn<StoryboardResult>('youtube-storyboard', { videoId: id })
        .catch(() => ({ available: false as const }));
      setStoryboard(sb);
      setStep('frame');
    } catch {
      setError('Something went wrong looking up that video. Try again.');
      setStep('url');
    }
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
    if (!capturedPath || !videoId || !lookup) return;
    setSaving(true);
    try {
      const focalX = (crop.x + crop.width / 2) / 100;
      const focalY = (crop.y + crop.height / 2) / 100;
      const aspectRatio = frame.capturedDims ? frame.capturedDims.width / frame.capturedDims.height : undefined;

      const { data, error: insertError } = await supabase
        .from('media_items')
        .insert({
          node_id: nodeId,
          type: 'video',
          provider: 'youtube',
          external_id: videoId,
          title: lookup.title,
          storage_path: capturedPath,
          sort_order: baseSortOrder,
          focal_x: focalX,
          focal_y: focalY,
          metadata: {
            crop,
            duration_seconds: lookup.durationSeconds,
            width: frame.capturedDims?.width,
            height: frame.capturedDims?.height,
          },
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Saved successfully — this is now a real, referenced gallery item, so
      // it's no longer "captured but uncommitted" and must not be swept if
      // this component unmounts right after.
      frame.clearWithoutCleanup();

      if (aspectRatio) {
        triggerDerivativeGeneration('media', capturedPath, MEDIA_WIDTH_LADDER, {
          naturalWidth: frame.capturedDims?.width,
          aspectRatio,
        });
      }

      toast.success('Video added');
      onSaved(data as MediaItem);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg.includes('unique') ? 'This video is already in this gallery' : 'Failed to save video');
      await frame.cleanup();
      onCancel();
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
        <p className="modal-title">Add YouTube video</p>

        {step === 'url' && (
          <>
            <input
              ref={inputRef}
              className="add-category-input"
              placeholder="YouTube URL or video ID"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleUrlSubmit(); }}
              autoFocus
            />
            {error && <p className="youtube-modal-error">{error}</p>}
            <div className="add-category-actions">
              <button className="add-category-cancel" onClick={handleCancel}>Cancel</button>
              <button className="add-category-save" onClick={handleUrlSubmit} disabled={!urlInput.trim()}>Next</button>
            </div>
          </>
        )}

        {(step === 'looking-up' || step === 'capturing') && <div className="spinner" />}

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

export default AddYouTubeVideoModal;
