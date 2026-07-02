import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { getCoverUrl, uploadCover } from '../lib/mediaService';
import { supabase } from '../lib/supabaseClient';
import { useAdminMode } from '../context/AdminModeContext';
import type { Node } from '../types';
import ViewLabel from './ViewLabel';

type Props = {
  node: Node;
  href: string;
  onDelete?: () => Promise<void>;
};

function NodeButton({ node, href, onDelete }: Props) {
  const { isAdmin } = useAdminMode();
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [localCoverPath, setLocalCoverPath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl]         = useState<string | null>(null);
  const [pendingFile, setPendingFile]       = useState<File | null>(null);
  const [coverSaving, setCoverSaving]       = useState(false);

  const [localTitle, setLocalTitle]     = useState<string | null>(null);
  const [renaming, setRenaming]         = useState(false);
  const [renameDraft, setRenameDraft]   = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting]                 = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);

  const displayTitle    = localTitle ?? node.title;
  const activeCoverPath = localCoverPath ?? node.cover_path;
  const mobileUrl       = activeCoverPath         ? getCoverUrl(activeCoverPath)         : null;
  const desktopUrl      = node.cover_path_desktop ? getCoverUrl(node.cover_path_desktop) : null;
  const focalMobile     = `${node.focal_x * 100}% ${node.focal_y * 100}%`;
  const focalDesktop    = `${(node.focal_x_desktop ?? node.focal_x) * 100}% ${(node.focal_y_desktop ?? node.focal_y) * 100}%`;

  // close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus();
  }, [renaming]);

  // ── cover ───────────────────────────────────────────────────────────────
  function openFilePicker() { setMenuOpen(false); fileInputRef.current?.click(); }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  }

  async function handleCoverSave() {
    if (!pendingFile) return;
    setCoverSaving(true);
    try {
      const newPath = await uploadCover(pendingFile);
      const { error } = await supabase.from('nodes').update({ cover_path: newPath }).eq('id', node.id);
      if (error) throw error;
      setLocalCoverPath(newPath);
      handleCoverCancel();
      toast.success('Cover updated');
    } catch { toast.error('Failed to update cover'); }
    finally { setCoverSaving(false); }
  }

  function handleCoverCancel() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
  }

  // ── rename ──────────────────────────────────────────────────────────────
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

  // ── delete ──────────────────────────────────────────────────────────────
  async function handleDeleteConfirm() {
    if (!onDelete) return;
    setDeleting(true);
    try { await onDelete(); }
    finally { setDeleting(false); setConfirmingDelete(false); }
  }

  const anyOverlayOpen = !!previewUrl || renaming || confirmingDelete;

  return (
    <div
      className="node-button"
      style={{ '--focal-mobile': focalMobile, '--focal-desktop': focalDesktop } as React.CSSProperties}
    >
      <Link to={href} className="node-button__link">
        <picture className="node-button__picture">
          {desktopUrl && <source media="(min-width: 768px)" srcSet={desktopUrl} />}
          {mobileUrl
            ? <img src={mobileUrl} alt={displayTitle} className="node-img" />
            : <div className="node-img node-img--placeholder" />}
        </picture>
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
              {onDelete && (
                <button className="danger" onClick={() => { setMenuOpen(false); setConfirmingDelete(true); }}>
                  Delete
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* cover preview overlay */}
      {previewUrl && (
        <div className="node-cover-preview">
          <img src={previewUrl} alt="preview" className="node-img" />
          <div className="node-cover-preview__actions">
            <button onClick={handleCoverCancel} disabled={coverSaving} className="node-preview-btn node-preview-btn--cancel">Cancel</button>
            <button onClick={handleCoverSave}   disabled={coverSaving} className="node-preview-btn node-preview-btn--save">{coverSaving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
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
  );
}

export default NodeButton;
