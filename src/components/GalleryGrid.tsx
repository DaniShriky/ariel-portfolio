import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getMediaUrl, getMediaSrcSet, readImageDimensions, uploadMedia, deleteMedia, uploadCover } from '../lib/mediaService';
import { supabase } from '../lib/supabaseClient';
import { useAdminMode } from '../context/AdminModeContext';
import type { MediaItem, Node } from '../types';
import Lightbox from './Lightbox';
import DescriptionModal from './DescriptionModal';

type GalleryLayout = 'collage' | 'grid';

// ── Per-item component ────────────────────────────────────────────────────────

type ItemProps = {
  item: MediaItem;
  isAdmin: boolean;
  position: number;
  totalCount: number;
  confirmDeleteId: string | null;
  deleting: boolean;
  savingCoverId: string | null;
  savingFeaturedId: string | null;
  onDeleteClick: (id: string) => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: (item: MediaItem) => void;
  onSetAsCover: (item: MediaItem) => void;
  onToggleFeatured: (item: MediaItem) => void;
  onEditDescription: (item: MediaItem) => void;
  onReposition: (item: MediaItem, newPosition: number) => void;
  onImageClick: () => void;
};

function SortableGalleryItem({
  item, isAdmin, position, totalCount, confirmDeleteId, deleting, savingCoverId, savingFeaturedId,
  onDeleteClick, onDeleteCancel, onDeleteConfirm, onSetAsCover, onToggleFeatured, onEditDescription, onReposition, onImageClick,
}: ItemProps) {
  const dims = item.metadata as { width?: number; height?: number; featured?: boolean; description?: string } | undefined;
  const isFeatured = !!dims?.featured;
  const isSavingFeatured = savingFeaturedId === item.id;

  const [menuOpen, setMenuOpen] = useState(false);
  // Supabase's image transform rejects source files above its size limit;
  // fall back to the untransformed URL rather than showing a broken image.
  const [transformFailed, setTransformFailed] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  // close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    ...(menuOpen ? { zIndex: 10 } : {}),
  };

  const url = getMediaUrl(item.storage_path);
  const isConfirming  = confirmDeleteId === item.id;
  const isSavingCover = savingCoverId === item.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="gallery-item"
      onClick={() => { if (!isConfirming && !menuOpen) onImageClick(); }}
    >
      {item.type === 'video' ? (
        <video
          src={url}
          className="gallery-video"
          controls
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          src={transformFailed ? url : getMediaUrl(item.storage_path, { width: 1080, height: 1080, resize: 'contain', quality: 80 })}
          srcSet={transformFailed ? undefined : getMediaSrcSet(item.storage_path, [480, 768, 1080, 1440, 1920])}
          sizes="(min-width: 768px) 34vw, 100vw"
          width={dims?.width}
          height={dims?.height}
          alt={item.title}
          className="gallery-img"
          loading="lazy"
          decoding="async"
          onError={() => setTransformFailed(true)}
        />
      )}

      {dims?.description && (
        <div className="gallery-item-caption">{dims.description}</div>
      )}

      {isAdmin && (
        <>
          {/* drag handle */}
          <div className="gallery-drag-handle" {...attributes} {...listeners} title="Drag to reorder">
            ⠿
          </div>

          {/* position input */}
          <input
            type="number"
            className="gallery-position-input"
            min={1}
            max={totalCount}
            defaultValue={position}
            key={position}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onBlur={e => {
              const raw = parseInt(e.currentTarget.value, 10);
              if (Number.isNaN(raw) || raw === position) { e.currentTarget.value = String(position); return; }
              onReposition(item, raw);
            }}
            title="Gallery position"
          />

          {/* ⋮ options button + dropdown */}
          {!isConfirming && (
            <>
              <button
                className="gallery-options-btn"
                onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
              >
                ⋮
              </button>
              {menuOpen && (
                <div className="gallery-options-menu">
                  {item.type !== 'video' && (
                    <button
                      onClick={() => { setMenuOpen(false); onSetAsCover(item); }}
                      disabled={isSavingCover}
                    >
                      {isSavingCover ? 'Setting…' : 'Set as cover'}
                    </button>
                  )}
                  {item.type !== 'video' && (
                    <button
                      onClick={() => { setMenuOpen(false); onToggleFeatured(item); }}
                      disabled={isSavingFeatured}
                    >
                      {isSavingFeatured ? 'Saving…' : isFeatured ? '★ Remove from homepage' : '★ Feature on homepage'}
                    </button>
                  )}
                  <button
                    onClick={() => { setMenuOpen(false); onEditDescription(item); }}
                  >
                    {dims?.description ? 'Edit description' : 'Add description'}
                  </button>
                  <button
                    className="danger"
                    onClick={() => { setMenuOpen(false); onDeleteClick(item.id); }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </>
          )}

          {/* full overlay delete confirm */}
          {isConfirming && (
            <div className="gallery-delete-overlay">
              <p className="gallery-delete-warning-text">Delete this image?</p>
              <div className="gallery-delete-overlay__btns">
                <button onClick={onDeleteCancel} disabled={deleting} className="node-preview-btn node-preview-btn--cancel">Cancel</button>
                <button onClick={() => onDeleteConfirm(item)} disabled={deleting} className="node-preview-btn node-preview-btn--danger">{deleting ? 'Deleting…' : 'Delete'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Grid ──────────────────────────────────────────────────────────────────────

type Props = { node: Node };

function GalleryGrid({ node }: Props) {
  const nodeId = node.id;
  const { isAdmin } = useAdminMode();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems]                     = useState<MediaItem[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting]               = useState(false);
  const [uploadingCount, setUploadingCount]   = useState(0);
  const [savingCoverId, setSavingCoverId]     = useState<string | null>(null);
  const [savingFeaturedId, setSavingFeaturedId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex]     = useState<number | null>(null);
  const [editingDescriptionItem, setEditingDescriptionItem] = useState<MediaItem | null>(null);
  const [savingDescription, setSavingDescription] = useState(false);
  const [localLayout, setLocalLayout]         = useState<GalleryLayout | null>(null);
  const [savingLayout, setSavingLayout]       = useState(false);

  const layout: GalleryLayout = localLayout
    ?? ((node.metadata as { layout?: GalleryLayout } | undefined)?.layout)
    ?? 'collage';

  useEffect(() => {
    setLoading(true);
    supabase
      .from('media_items')
      .select('*')
      .eq('node_id', nodeId)
      .order('sort_order')
      .then(({ data, error }) => {
        if (!error && data) setItems(data as MediaItem[]);
        setLoading(false);
      });
  }, [nodeId]);

  // ── Drag-to-reorder ──────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    setItems(prev => {
      const oldIndex = prev.findIndex(i => i.id === active.id);
      const newIndex = prev.findIndex(i => i.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      saveSortOrder(reordered);
      return reordered;
    });
  }

  async function saveSortOrder(ordered: MediaItem[]) {
    await Promise.all(
      ordered.map((item, i) =>
        supabase.from('media_items').update({ sort_order: i }).eq('id', item.id)
      )
    );
  }

  function handleReposition(item: MediaItem, newPosition: number) {
    setItems(prev => {
      const clamped = Math.min(Math.max(newPosition, 1), prev.length) - 1;
      const oldIndex = prev.findIndex(i => i.id === item.id);
      if (oldIndex === -1 || oldIndex === clamped) return prev;
      const reordered = arrayMove(prev, oldIndex, clamped);
      saveSortOrder(reordered);
      return reordered;
    });
  }

  // ── Upload ───────────────────────────────────────────────────────────────

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const baseOrder = items.length > 0
      ? Math.max(...items.map(i => i.sort_order)) + 1
      : 0;

    let remaining = files.length;
    setUploadingCount(remaining);

    await Promise.all(
      files.map(async (file, idx) => {
        try {
          const dims = await readImageDimensions(file);
          const storagePath = await uploadMedia(file);
          const { data, error } = await supabase
            .from('media_items')
            .insert({
              node_id: nodeId,
              type: file.type.startsWith('video/') ? 'video' : 'photo',
              title: file.name.replace(/\.[^.]+$/, ''),
              storage_path: storagePath,
              sort_order: baseOrder + idx,
              focal_x: 0.5,
              focal_y: 0.5,
              metadata: dims ? { width: dims.width, height: dims.height } : {},
            })
            .select()
            .single();

          if (error) throw error;
          setItems(prev => [...prev, data as MediaItem]);
        } catch {
          toast.error(`Failed to upload ${file.name}`);
        } finally {
          remaining--;
          setUploadingCount(remaining);
        }
      })
    );
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function handleDeleteConfirm(item: MediaItem) {
    setDeleting(true);
    try {
      await deleteMedia(item.storage_path);
      const { error } = await supabase.from('media_items').delete().eq('id', item.id);
      if (error) throw error;
      setItems(prev => prev.filter(i => i.id !== item.id));
      setConfirmDeleteId(null);
      toast.success('Image deleted');
    } catch {
      toast.error('Failed to delete image');
    } finally {
      setDeleting(false);
    }
  }

  // ── Set as cover ─────────────────────────────────────────────────────────

  async function handleSetAsCover(item: MediaItem) {
    setSavingCoverId(item.id);
    try {
      const mediaUrl = getMediaUrl(item.storage_path);
      const response = await fetch(mediaUrl);
      if (!response.ok) throw new Error('fetch failed');
      const blob = await response.blob();
      const ext  = item.storage_path.split('.').pop() ?? 'jpg';
      const file = new File([blob], `cover.${ext}`, { type: blob.type });

      const newCoverPath = await uploadCover(file);
      const { error } = await supabase.from('nodes').update({ cover_path: newCoverPath }).eq('id', nodeId);
      if (error) throw error;

      toast.success('Cover updated');
    } catch {
      toast.error('Failed to set cover');
    } finally {
      setSavingCoverId(null);
    }
  }

  // ── Feature on homepage ──────────────────────────────────────────────────

  async function handleToggleFeatured(item: MediaItem) {
    setSavingFeaturedId(item.id);
    try {
      const isFeatured = !!(item.metadata as { featured?: boolean })?.featured;
      const newMetadata = { ...item.metadata, featured: !isFeatured };
      const { error } = await supabase.from('media_items').update({ metadata: newMetadata }).eq('id', item.id);
      if (error) throw error;
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, metadata: newMetadata } : i));
      toast.success(isFeatured ? 'Removed from homepage' : 'Added to homepage');
    } catch {
      toast.error('Failed to update');
    } finally {
      setSavingFeaturedId(null);
    }
  }

  // ── Description ──────────────────────────────────────────────────────────

  async function handleSaveDescription(text: string) {
    if (!editingDescriptionItem) return;
    setSavingDescription(true);
    try {
      const trimmed = text.trim();
      const newMetadata = { ...editingDescriptionItem.metadata, description: trimmed || undefined };
      const { error } = await supabase.from('media_items').update({ metadata: newMetadata }).eq('id', editingDescriptionItem.id);
      if (error) throw error;
      const savedId = editingDescriptionItem.id;
      setItems(prev => prev.map(i => i.id === savedId ? { ...i, metadata: newMetadata } : i));
      setEditingDescriptionItem(null);
      toast.success('Description saved');
    } catch {
      toast.error('Failed to save description');
    } finally {
      setSavingDescription(false);
    }
  }

  // ── Layout (Collage / Grid) ──────────────────────────────────────────────

  async function handleSetLayout(next: GalleryLayout) {
    if (next === layout) return;
    setSavingLayout(true);
    try {
      const newMetadata = { ...node.metadata, layout: next };
      const { error } = await supabase.from('nodes').update({ metadata: newMetadata }).eq('id', node.id);
      if (error) throw error;
      setLocalLayout(next);
      toast.success(`Switched to ${next === 'collage' ? 'Collage' : 'Grid'} view`);
    } catch {
      toast.error('Failed to update layout');
    } finally {
      setSavingLayout(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) return <div className="spinner" />;

  return (
    <div>
      {isAdmin && (
        <div className="gallery-layout-toggle">
          <button
            className={`gallery-layout-btn${layout === 'collage' ? ' gallery-layout-btn--active' : ''}`}
            onClick={() => handleSetLayout('collage')}
            disabled={savingLayout}
          >
            Collage
          </button>
          <button
            className={`gallery-layout-btn${layout === 'grid' ? ' gallery-layout-btn--active' : ''}`}
            onClick={() => handleSetLayout('grid')}
            disabled={savingLayout}
          >
            Grid
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setConfirmDeleteId(null)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
          <div className={`gallery-grid gallery-grid--${layout}`}>
            {items.map((item, idx) => (
              <SortableGalleryItem
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                position={idx + 1}
                totalCount={items.length}
                confirmDeleteId={confirmDeleteId}
                deleting={deleting}
                savingCoverId={savingCoverId}
                savingFeaturedId={savingFeaturedId}
                onDeleteClick={id => setConfirmDeleteId(id)}
                onDeleteCancel={() => setConfirmDeleteId(null)}
                onDeleteConfirm={handleDeleteConfirm}
                onSetAsCover={handleSetAsCover}
                onToggleFeatured={handleToggleFeatured}
                onEditDescription={setEditingDescriptionItem}
                onReposition={handleReposition}
                onImageClick={() => setLightboxIndex(idx)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Floating + button */}
      {isAdmin && (
        <>
          <button
            className={`add-floating-btn${uploadingCount > 0 ? ' add-floating-btn--busy' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingCount > 0}
            title="Add images"
          >
            {uploadingCount > 0 ? uploadingCount : '+'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFilesSelected}
          />
        </>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          items={items}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      {editingDescriptionItem && (
        <DescriptionModal
          initialValue={(editingDescriptionItem.metadata as { description?: string } | undefined)?.description ?? ''}
          saving={savingDescription}
          onSave={handleSaveDescription}
          onCancel={() => setEditingDescriptionItem(null)}
        />
      )}
    </div>
  );
}

export default GalleryGrid;
