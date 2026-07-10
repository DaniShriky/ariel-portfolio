import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  getCoverUrl, getCoverSrcSet,
  getCoverDerivativeUrl, getCoverDerivativeSrcSet,
  COVER_MOBILE_WIDTH_LADDER, COVER_DESKTOP_WIDTH_LADDER,
  uploadCover, triggerDerivativeGeneration,
} from '../lib/mediaService';
import { supabase } from '../lib/supabaseClient';
import { useAdminMode } from '../context/AdminModeContext';
import type { Node } from '../types';
import ViewLabel from './ViewLabel';
import CropEditorModal, { type CropData } from './CropEditorModal';

type Props = {
  node: Node;
  href: string;
  onDelete?: () => Promise<void>;
};

// ── Crop display math ──────────────────────────────────────────────────────────
// Given crop (%, 0-100) + natural image size + container size,
// compute background-image CSS that shows exactly the crop region (cover-fit).
function computeCropBg(
  url: string,
  crop: CropData,
  nW: number, nH: number,
  cW: number, cH: number,
): React.CSSProperties {
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

// ── Component ──────────────────────────────────────────────────────────────────

function NodeButton({ node, href, onDelete }: Props) {
  const { isAdmin } = useAdminMode();
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);  // .node-button element

  // ── cover state ──
  const [localCoverPath, setLocalCoverPath]     = useState<string | null>(null);
  const [localDesktopPath, setLocalDesktopPath] = useState<string | null | undefined>(undefined);
  const [pendingFile, setPendingFile]           = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]             = useState<string | null>(null);
  const [coverSaving, setCoverSaving]           = useState(false);
  const fileTargetRef                           = useRef<'mobile' | 'desktop'>('mobile');

  // ── crop state ──
  const [localCrop, setLocalCrop]         = useState<CropData | null>(
    (node.metadata?.crop as CropData) ?? null
  );
  const [cropMode, setCropMode]           = useState<false | 'new' | 'edit'>(false);
  const [cropBgStyle, setCropBgStyle]     = useState<React.CSSProperties>({});
  const [containerAspect, setContainerAspect] = useState<number | undefined>(undefined);

  // ── rename state ──
  const [localTitle, setLocalTitle]     = useState<string | null>(null);
  const [renaming, setRenaming]         = useState(false);
  const [renameDraft, setRenameDraft]   = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  // ── delete state ──
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting]                 = useState(false);

  // ── menu ──
  const [menuOpen, setMenuOpen] = useState(false);

  // ── publish state ──
  const [localIsPublished, setLocalIsPublished] = useState<boolean | null>(null);

  // ── opacity state ──
  const [localOpacity, setLocalOpacity] = useState<number | null>(null);
  const [opacitySaving, setOpacitySaving] = useState(false);

  // Three-tier fallback, same pattern used for gallery media: pre-generated
  // derivative (fast, static file) → on-the-fly transform (still correct,
  // just a live round-trip) → fully untransformed original (Supabase's
  // transform endpoint rejects source files above its size limit, so this is
  // the last resort). Derivatives are full-frame resizes of the original —
  // not pre-cropped — so the focal-point crop below (CSS object-fit/
  // object-position, driven by --focal-mobile/--focal-desktop) keeps working
  // unchanged no matter which tier is actually serving the pixels.
  const [coverDerivativeFailed, setCoverDerivativeFailed] = useState(false);
  const [coverTransformFailed, setCoverTransformFailed] = useState(false);

  const isPublished       = localIsPublished ?? node.is_published;
  const opacity           = localOpacity ?? ((node.metadata as { opacity?: number } | undefined)?.opacity ?? 1);
  const displayTitle      = localTitle ?? node.title;
  const activeCoverPath   = localCoverPath ?? node.cover_path;
  const activeDesktopPath = localDesktopPath !== undefined ? localDesktopPath : node.cover_path_desktop;
  const mobileUrl         = activeCoverPath
    ? (coverTransformFailed
        ? getCoverUrl(activeCoverPath)
        : coverDerivativeFailed
          ? getCoverUrl(activeCoverPath, { width: 800, height: 800, resize: 'contain', quality: 80 })
          : getCoverDerivativeUrl(activeCoverPath, 768))
    : null;
  const desktopUrl        = activeDesktopPath
    ? (coverTransformFailed
        ? getCoverUrl(activeDesktopPath)
        : coverDerivativeFailed
          ? getCoverUrl(activeDesktopPath, { width: 1600, height: 1600, resize: 'contain', quality: 80 })
          : getCoverDerivativeUrl(activeDesktopPath, 1440))
    : null;
  const mobileSrcSet      = !activeCoverPath || coverTransformFailed ? undefined
    : coverDerivativeFailed ? getCoverSrcSet(activeCoverPath, COVER_MOBILE_WIDTH_LADDER)
    : getCoverDerivativeSrcSet(activeCoverPath, COVER_MOBILE_WIDTH_LADDER);
  const desktopSrcSet     = !activeDesktopPath || coverTransformFailed ? undefined
    : coverDerivativeFailed ? getCoverSrcSet(activeDesktopPath, COVER_DESKTOP_WIDTH_LADDER)
    : getCoverDerivativeSrcSet(activeDesktopPath, COVER_DESKTOP_WIDTH_LADDER);
  const hasDesktopCover   = !!activeDesktopPath;
  const focalMobile       = `${node.focal_x * 100}% ${node.focal_y * 100}%`;
  const focalDesktop      = `${(node.focal_x_desktop ?? node.focal_x) * 100}% ${(node.focal_y_desktop ?? node.focal_y) * 100}%`;

  // ── compute background-image crop display ───────────────────────────────────
  useEffect(() => {
    if (!localCrop || !mobileUrl) {
      setCropBgStyle({});
      return;
    }

    let cancelled = false;
    let obs: ResizeObserver | null = null;

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const nW = img.naturalWidth;
      const nH = img.naturalHeight;

      function recompute() {
        const el = containerRef.current;
        if (!el || !localCrop) return;
        const { width: cW, height: cH } = el.getBoundingClientRect();
        if (!cW || !cH) return;
        setCropBgStyle(computeCropBg(mobileUrl!, localCrop, nW, nH, cW, cH));
      }

      recompute();
      obs = new ResizeObserver(recompute);
      if (containerRef.current) obs.observe(containerRef.current);
    };
    img.onerror = () => {
      if (cancelled) return;
      if (!coverDerivativeFailed) setCoverDerivativeFailed(true);
      else setCoverTransformFailed(true);
    };
    img.src = mobileUrl;

    return () => {
      cancelled = true;
      obs?.disconnect();
    };
  }, [localCrop, mobileUrl]);

  // ── misc effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus();
  }, [renaming]);

  // ── cover / crop handlers ────────────────────────────────────────────────────

  function openFilePicker()        { setMenuOpen(false); fileTargetRef.current = 'mobile';  fileInputRef.current?.click(); }
  function openDesktopFilePicker() { setMenuOpen(false); fileTargetRef.current = 'desktop'; fileInputRef.current?.click(); }

  function captureContainerAspect() {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) setContainerAspect(width / height);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (fileTargetRef.current === 'desktop') {
      handleDesktopUpload(file);
      return;
    }
    captureContainerAspect();
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setCropMode('new');
  }

  function openEditCrop() {
    setMenuOpen(false);
    captureContainerAspect();
    setCropMode('edit');
  }

  function cancelCrop() {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    setPendingFile(null);
    setCropMode(false);
  }

  async function handleCropSave(crop: CropData) {
    setCoverSaving(true);
    try {
      if (cropMode === 'new' && pendingFile) {
        // Upload new image + save crop together
        const newPath = await uploadCover(pendingFile);
        const newMeta = { ...node.metadata, crop };
        const { error } = await supabase
          .from('nodes')
          .update({ cover_path: newPath, metadata: newMeta })
          .eq('id', node.id);
        if (error) throw error;
        setLocalCoverPath(newPath);
        setLocalCrop(crop);
        triggerDerivativeGeneration('covers', newPath, COVER_MOBILE_WIDTH_LADDER);
        toast.success('Cover updated');

      } else if (cropMode === 'edit') {
        // Only update crop metadata — no new upload
        const newMeta = { ...node.metadata, crop };
        const { error } = await supabase
          .from('nodes')
          .update({ metadata: newMeta })
          .eq('id', node.id);
        if (error) throw error;
        setLocalCrop(crop);
        toast.success('Crop updated');
      }
    } catch { toast.error('Failed to save'); }
    finally {
      setCoverSaving(false);
      cancelCrop(); // clears previewUrl, pendingFile, cropMode
    }
  }

  // ── desktop cover handlers ───────────────────────────────────────────────────

  async function handleDesktopUpload(file: File) {
    setCoverSaving(true);
    try {
      const newPath = await uploadCover(file);
      const { error } = await supabase.from('nodes').update({ cover_path_desktop: newPath }).eq('id', node.id);
      if (error) throw error;
      setLocalDesktopPath(newPath);
      triggerDerivativeGeneration('covers', newPath, COVER_DESKTOP_WIDTH_LADDER);
      toast.success('Desktop cover updated');
    } catch { toast.error('Failed to save desktop cover'); }
    finally { setCoverSaving(false); }
  }

  async function handleRemoveDesktopCover() {
    setMenuOpen(false);
    setCoverSaving(true);
    try {
      const { error } = await supabase.from('nodes').update({ cover_path_desktop: null }).eq('id', node.id);
      if (error) throw error;
      setLocalDesktopPath(null);
      toast.success('Desktop cover removed');
    } catch { toast.error('Failed to remove desktop cover'); }
    finally { setCoverSaving(false); }
  }

  // ── rename handlers ──────────────────────────────────────────────────────────

  function startRename() { setMenuOpen(false); setRenameDraft(displayTitle); setRenaming(true); }

  async function handleRenameSave() {
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === displayTitle) { setRenaming(false); return; }
    setRenameSaving(true);
    try {
      const { error } = await supabase.from('nodes').update({ title: trimmed }).eq('id', node.id);
      if (error) throw error;
      setLocalTitle(trimmed);
      setRenaming(false);
      toast.success('Renamed');
    } catch { toast.error('Failed to rename'); }
    finally { setRenameSaving(false); }
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); handleRenameSave(); }
    if (e.key === 'Escape') setRenaming(false);
  }

  // ── delete handlers ──────────────────────────────────────────────────────────

  async function handleDeleteConfirm() {
    if (!onDelete) return;
    setDeleting(true);
    try { await onDelete(); }
    finally { setDeleting(false); setConfirmingDelete(false); }
  }

  // ── publish handler ───────────────────────────────────────────────────────────

  async function handleTogglePublished() {
    setMenuOpen(false);
    const next = !isPublished;
    try {
      const { error } = await supabase.from('nodes').update({ is_published: next }).eq('id', node.id);
      if (error) throw error;
      setLocalIsPublished(next);
      toast.success(next ? 'Published' : 'Set to draft');
    } catch { toast.error('Failed to update'); }
  }

  // ── opacity handler ───────────────────────────────────────────────────────────
  // Commits on release (pointer up / key up), not on every drag tick, to avoid
  // hammering the DB — the live fade itself comes from localOpacity updating
  // on every onChange, no separate preview state needed.

  async function saveOpacity(value: number) {
    setOpacitySaving(true);
    try {
      const newMetadata = { ...node.metadata, opacity: value };
      const { error } = await supabase.from('nodes').update({ metadata: newMetadata }).eq('id', node.id);
      if (error) throw error;
    } catch { toast.error('Failed to save opacity'); }
    finally { setOpacitySaving(false); }
  }

  // ── derived ──────────────────────────────────────────────────────────────────

  const hasCropDisplay  = !!localCrop && Object.keys(cropBgStyle).length > 0;
  const anyOverlayOpen  = renaming || confirmingDelete || cropMode !== false;

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        ref={containerRef}
        className="node-button"
        style={{ '--focal-mobile': focalMobile, '--focal-desktop': focalDesktop, '--node-opacity': opacity } as React.CSSProperties}
      >
        <Link to={href} className="node-button__link">
          {/* Cover image: crop display when crop set, else standard img */}
          {hasCropDisplay ? (
            <div className="node-button__picture node-img--crop-bg" style={cropBgStyle} />
          ) : (
            <picture className="node-button__picture">
              {desktopUrl && <source media="(min-width: 768px)" srcSet={desktopSrcSet} sizes="50vw" />}
              {mobileUrl
                ? <img
                    src={mobileUrl}
                    srcSet={mobileSrcSet}
                    sizes="100vw"
                    alt={displayTitle}
                    className="node-img"
                    decoding="async"
                    onError={() => { if (!coverDerivativeFailed) setCoverDerivativeFailed(true); else setCoverTransformFailed(true); }}
                  />
                : <div className="node-img node-img--placeholder" />}
            </picture>
          )}
          <div className="node-tint" />
          <div className="node-overlay">
            <p className="node-label">{displayTitle}</p>
            <ViewLabel />
            {isAdmin && !isPublished && <span className="node-draft-badge">Draft</span>}
          </div>
        </Link>

        {/* ⋮ options button */}
        {isAdmin && !anyOverlayOpen && (
          <>
            <button
              className="node-options-btn"
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
            >
              ⋮
            </button>
            {menuOpen && (
              <div className="node-options-menu">
                <button onClick={startRename}>Rename</button>
                <button onClick={handleTogglePublished}>
                  {isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <div className="node-options-menu__slider-row" onClick={e => e.stopPropagation()}>
                  <span className="node-options-menu__slider-label">Opacity</span>
                  <input
                    type="range"
                    className="node-opacity-slider"
                    min={0}
                    max={1}
                    step={0.05}
                    value={opacity}
                    disabled={opacitySaving}
                    onChange={e => setLocalOpacity(parseFloat(e.target.value))}
                    onPointerUp={() => saveOpacity(opacity)}
                    onKeyUp={() => saveOpacity(opacity)}
                  />
                </div>
                <button onClick={openFilePicker}>
                  {activeCoverPath ? 'Change cover image' : 'Set cover image'}
                </button>
                {activeCoverPath && (
                  <button onClick={openEditCrop}>Edit crop</button>
                )}
                {!hasDesktopCover && activeCoverPath && (
                  <button onClick={openDesktopFilePicker}>Use different image for desktop</button>
                )}
                {hasDesktopCover && (
                  <button onClick={openDesktopFilePicker}>Change desktop image</button>
                )}
                {hasDesktopCover && (
                  <button onClick={handleRemoveDesktopCover}>Remove desktop image</button>
                )}
                {onDelete && (
                  <button className="danger" onClick={() => { setMenuOpen(false); setConfirmingDelete(true); }}>
                    Delete
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* rename overlay */}
        {renaming && (
          <div className="node-rename-overlay">
            <input
              ref={renameInputRef}
              className="node-rename-input"
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              disabled={renameSaving}
            />
            <div className="node-cover-preview__actions">
              <button onClick={() => setRenaming(false)} disabled={renameSaving} className="node-preview-btn node-preview-btn--cancel">Cancel</button>
              <button onClick={handleRenameSave}         disabled={renameSaving} className="node-preview-btn node-preview-btn--save">{renameSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}

        {/* delete confirm overlay */}
        {confirmingDelete && (
          <div className="node-delete-overlay">
            <p className="node-delete-warning">Delete &ldquo;{displayTitle}&rdquo;?</p>
            <div className="node-cover-preview__actions">
              <button onClick={() => setConfirmingDelete(false)} disabled={deleting} className="node-preview-btn node-preview-btn--cancel">Cancel</button>
              <button onClick={handleDeleteConfirm}              disabled={deleting} className="node-preview-btn node-preview-btn--danger">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
      </div>

      {/* Crop editor modal — rendered outside node-button to avoid overflow/z-index issues */}
      {cropMode !== false && (
        <CropEditorModal
          imageUrl={cropMode === 'new' ? (previewUrl ?? '') : (mobileUrl ?? '')}
          existingCrop={cropMode === 'edit' ? localCrop : null}
          aspect={containerAspect}
          saving={coverSaving}
          onSave={handleCropSave}
          onCancel={cancelCrop}
        />
      )}

    </>
  );
}

export default NodeButton;
