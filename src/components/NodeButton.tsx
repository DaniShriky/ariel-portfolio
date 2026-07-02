import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { getCoverUrl, uploadCover } from '../lib/mediaService';
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
  const [localCoverPath, setLocalCoverPath] = useState<string | null>(null);
  const [pendingFile, setPendingFile]       = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]         = useState<string | null>(null); // blob for new image
  const [coverSaving, setCoverSaving]       = useState(false);

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

  const displayTitle    = localTitle ?? node.title;
  const activeCoverPath = localCoverPath ?? node.cover_path;
  const mobileUrl       = activeCoverPath ? getCoverUrl(activeCoverPath) : null;
  const desktopUrl      = node.cover_path_desktop ? getCoverUrl(node.cover_path_desktop) : null;
  const focalMobile     = `${node.focal_x * 100}% ${node.focal_y * 100}%`;
  const focalDesktop    = `${(node.focal_x_desktop ?? node.focal_x) * 100}% ${(node.focal_y_desktop ?? node.focal_y) * 100}%`;

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

  function openFilePicker() { setMenuOpen(false); fileInputRef.current?.click(); }

  function captureContainerAspect() {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) setContainerAspect(width / height);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    captureContainerAspect();
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setCropMode('new');
    e.target.value = '';
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

  // ── derived ──────────────────────────────────────────────────────────────────

  const hasCropDisplay  = !!localCrop && Object.keys(cropBgStyle).length > 0;
  const anyOverlayOpen  = renaming || confirmingDelete || cropMode !== false;

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        ref={containerRef}
        className="node-button"
        style={{ '--focal-mobile': focalMobile, '--focal-desktop': focalDesktop } as React.CSSProperties}
      >
        <Link to={href} className="node-button__link">
          {/* Cover image: crop display when crop set, else standard img */}
          {hasCropDisplay ? (
            <div className="node-button__picture node-img--crop-bg" style={cropBgStyle} />
          ) : (
            <picture className="node-button__picture">
              {desktopUrl && <source media="(min-width: 768px)" srcSet={desktopUrl} />}
              {mobileUrl
                ? <img src={mobileUrl} alt={displayTitle} className="node-img" />
                : <div className="node-img node-img--placeholder" />}
            </picture>
          )}
          <div className="node-tint" />
          <div className="node-overlay">
            <p className="node-label">{displayTitle}</p>
            <ViewLabel />
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
                <button onClick={openFilePicker}>Change cover</button>
                {activeCoverPath && (
                  <button onClick={openEditCrop}>Edit crop</button>
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
