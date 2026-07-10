import { useEffect, useRef, useState } from 'react';
import { deleteMediaAndDerivatives } from '../lib/mediaService';
import { invokeFn, type CapturePayload, type CaptureResult } from '../lib/youtube';

// Shared by AddYouTubeVideoModal (new item) and ChangeCoverFrameModal
// (existing item) — both capture a candidate cover frame into the `media`
// bucket before anything is committed to the database, so both need the
// same "this file is provisional until X" cleanup semantics:
//   - cancel / step failure -> sweep the captured file immediately
//   - modal unmounts (navigation away, hard close) with a captured file
//     still uncommitted -> best-effort sweep on unmount too
//   - caller's own save succeeds -> clearWithoutCleanup(), so the file
//     becomes a real referenced asset and the unmount effect leaves it alone
export function useCapturedFrame(videoId: string | null) {
  const [capturedPath, setCapturedPath] = useState<string | null>(null);
  const [capturedDims, setCapturedDims] = useState<{ width: number; height: number } | null>(null);

  const capturedPathRef = useRef<string | null>(null);
  useEffect(() => { capturedPathRef.current = capturedPath; }, [capturedPath]);

  // Best-effort only: covers the admin navigating away or closing the tab
  // with a captured-but-uncommitted file. Runs once on unmount, reading the
  // ref (not the state closure) so it always sees the latest path.
  useEffect(() => {
    return () => {
      const path = capturedPathRef.current;
      if (!path) return;
      deleteMediaAndDerivatives(path).catch(err => {
        console.warn('[useCapturedFrame] unmount cleanup failed (non-fatal):', err);
      });
    };
  }, []);

  async function cleanup() {
    const path = capturedPathRef.current;
    if (!path) return;
    setCapturedPath(null);
    setCapturedDims(null);
    try {
      await deleteMediaAndDerivatives(path);
    } catch (err) {
      console.warn('[useCapturedFrame] cleanup failed (non-fatal):', err);
    }
  }

  // Call after a successful save — the file is now a real referenced asset,
  // not a provisional one, so it must not be swept by cleanup()/unmount.
  function clearWithoutCleanup() {
    setCapturedPath(null);
    setCapturedDims(null);
  }

  async function capture(payload: CapturePayload): Promise<
    | { ok: true; storagePath: string; width: number; height: number }
    | { ok: false; fallbackRequired: boolean }
  > {
    if (!videoId) return { ok: false, fallbackRequired: false };
    try {
      const result = await invokeFn<CaptureResult>('youtube-cover-capture', { videoId, ...payload });
      if (!result.success) {
        return { ok: false, fallbackRequired: payload.mode === 'storyboard' && result.fallbackRequired };
      }
      setCapturedPath(result.storagePath);
      setCapturedDims({ width: result.width, height: result.height });
      return { ok: true, storagePath: result.storagePath, width: result.width, height: result.height };
    } catch {
      return { ok: false, fallbackRequired: false };
    }
  }

  return { capturedPath, capturedDims, capture, cleanup, clearWithoutCleanup };
}
