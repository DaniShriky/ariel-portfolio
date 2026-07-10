import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { supabase } from '../lib/supabaseClient';
import {
  getMediaUrl, getMediaUrlForWidth, getMediaSrcSet,
  getMediaDerivativeUrl, getMediaDerivativeSrcSet, MEDIA_WIDTH_LADDER,
  readImageDimensions, uploadMedia, triggerDerivativeGeneration,
} from '../lib/mediaService';
import { useAdminMode } from '../context/AdminModeContext';
import { FAVORITES_SLUG } from '../lib/constants';
import type { MediaItem } from '../types';
import Lightbox from './Lightbox';

// Homepage favorites aren't a separate content type — they're ordinary gallery
// photos with metadata.featured = true. Photos "toggled" featured from an
// existing gallery (GalleryGrid's ⋮ menu) live in that gallery's node.
// Photos uploaded directly here have nowhere else to live, so they're filed
// under one lazily-created, unpublished "Homepage Favorites" node — kept
// unpublished (and explicitly excluded in NodePage's menu query) so it never
// surfaces as a real menu button, but its photos are still publicly visible
// because RLS grants read access to any media item with metadata.featured =
// true regardless of its node's publish status.
//
// Favorites can come from many different galleries, each with its own
// node-scoped sort_order column — reusing that for homepage ordering would
// scramble the photo's position inside its original gallery. So homepage
// order is its own field, metadata.featured_order, independent of any
// gallery's internal ordering.

function getFeaturedOrder(item: MediaItem): number {
  const raw = (item.metadata as { featured_order?: number } | undefined)?.featured_order;
  return typeof raw === 'number' ? raw : Number.MAX_SAFE_INTEGER;
}

// The masonry grid packs tiles column-by-column (browser balances column
// heights), so array order reads top-to-bottom-then-next-column — not the
// left-to-right, row-by-row order admins expect when typing a position.
// This derives that reading order from each tile's actual rendered
// position, without touching the masonry layout itself.
//
// "Row" isn't a precise concept once tiles have different heights, so two
// tiles are treated as the same row whenever their top edges are close
// (generous tolerance) rather than requiring identical top values. Each
// row's band is anchored to the top of whichever tile started it — NOT the
// tallest tile's bottom edge, which would let one tall photo keep inflating
// the boundary and swallow many rows below it.
const ROW_TOLERANCE_PX = 24;

function computeVisualOrder(container: HTMLElement, refs: Map<string, HTMLElement>, ids: string[]): string[] {
  const containerTop = container.getBoundingClientRect().top;
  const rects = ids
    .map(id => {
      const el = refs.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { id, top: r.top - containerTop, left: r.left };
    })
    .filter((r): r is { id: string; top: number; left: number } => r !== null)
    .sort((a, b) => a.top - b.top || a.left - b.left);

  const rows: (typeof rects)[] = [];
  let currentRow: typeof rects = [];
  let rowAnchorTop = 0;
  for (const r of rects) {
    if (currentRow.length === 0 || r.top < rowAnchorTop + ROW_TOLERANCE_PX) {
      if (currentRow.length === 0) rowAnchorTop = r.top;
      currentRow.push(r);
    } else {
      rows.push(currentRow);
      currentRow = [r];
      rowAnchorTop = r.top;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  return rows.flatMap(row => [...row].sort((a, b) => a.left - b.left).map(r => r.id));
}

async function getOrCreateFavoritesNodeId(): Promise<string> {
  const { data: existing } = await supabase
    .from('nodes')
    .select('id')
    .eq('slug', FAVORITES_SLUG)
    .is('parent_id', null)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('nodes')
    .insert({
      title: 'Homepage Favorites',
      slug: FAVORITES_SLUG,
      kind: 'gallery',
      parent_id: null,
      sort_order: 9999,
      is_published: false,
      focal_x: 0.5,
      focal_y: 0.5,
      metadata: {},
    })
    .select('id')
    .single();
  if (error || !created) throw error ?? new Error('failed to create favorites node');
  return created.id;
}

function FeaturedItem({
  item, isAdmin, position, totalCount, removing, onClick, onRemove, onReposition, registerRef, onImageLoad,
}: {
  item: MediaItem;
  isAdmin: boolean;
  position: number;
  totalCount: number;
  removing: boolean;
  onClick: () => void;
  onRemove: () => void;
  onReposition: (newPosition: number) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  onImageLoad: () => void;
}) {
  const dims = item.metadata as { width?: number; height?: number } | undefined;
  const aspectRatio = dims?.width && dims?.height ? dims.width / dims.height : undefined;

  const [derivativeFailed, setDerivativeFailed] = useState(false);
  const [transformFailed, setTransformFailed] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={node => { setNodeRef(node); registerRef(item.id, node); }}
      style={style}
      className="featured-work__item"
      onClick={onClick}
    >
      <img
        src={
          transformFailed ? getMediaUrl(item.storage_path)
          : derivativeFailed ? getMediaUrlForWidth(item.storage_path, 1080, 80, aspectRatio)
          : getMediaDerivativeUrl(item.storage_path, 1080)
        }
        srcSet={
          transformFailed ? undefined
          : derivativeFailed ? getMediaSrcSet(item.storage_path, MEDIA_WIDTH_LADDER, 80, aspectRatio)
          : getMediaDerivativeSrcSet(item.storage_path)
        }
        sizes="(min-width: 768px) 34vw, 50vw"
        alt={item.title}
        loading={isAdmin ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => { if (!derivativeFailed) setDerivativeFailed(true); else { setTransformFailed(true); } onImageLoad(); }}
        onLoad={onImageLoad}
      />
      {isAdmin && (
        <>
          <div
            className="featured-work__drag-handle"
            {...attributes}
            {...listeners}
            onClick={e => e.stopPropagation()}
            title="Drag to reorder"
          >
            ⠿
          </div>
          <input
            type="number"
            className="featured-work__position-input"
            min={1}
            max={totalCount}
            defaultValue={position}
            key={position}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onBlur={e => {
              const raw = parseInt(e.currentTarget.value, 10);
              if (Number.isNaN(raw) || raw === position) { e.currentTarget.value = String(position); return; }
              onReposition(raw);
            }}
            title="Position in Favorites"
          />
          <button
            className="featured-work__remove"
            disabled={removing}
            onClick={e => { e.stopPropagation(); onRemove(); }}
            title="Remove from homepage"
          >
            {removing ? '…' : '✕'}
          </button>
        </>
      )}
    </div>
  );
}

function FeaturedWork() {
  const { isAdmin } = useAdminMode();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const favoritesNodeIdRef = useRef<string | null>(null);

  const [items, setItems]     = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [removingId, setRemovingId]         = useState<string | null>(null);

  // ── Reading-order numbering (row-by-row, left-to-right) ─────────────────
  // Purely a labeling/reorder-input concern — the masonry layout above is
  // untouched. See computeVisualOrder for why this can't be derived from
  // array order alone.
  const gridRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const [visualOrder, setVisualOrder] = useState<string[]>([]);
  // Bumped on every photo's onLoad/onError — a photo's real height (and thus
  // which "row" it lands in) is only known once it has actually loaded, and
  // that happens asynchronously well after the container's own size settles.
  const [loadedTick, setLoadedTick] = useState(0);

  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  }, []);

  const itemIds = useMemo(() => items.map(i => i.id), [items]);

  useEffect(() => {
    const container = gridRef.current;
    if (!container || itemIds.length === 0) { setVisualOrder([]); return; }

    const recompute = () => setVisualOrder(computeVisualOrder(container, itemRefs.current, itemIds));
    recompute();

    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [itemIds, loadedTick]);

  const visualRank = useMemo(() => {
    const map = new Map<string, number>();
    visualOrder.forEach((id, i) => map.set(id, i + 1));
    return map;
  }, [visualOrder]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('media_items')
      .select('*')
      .eq('type', 'photo')
      .eq('metadata->>featured', 'true')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          const sorted = [...(data as MediaItem[])].sort((a, b) => getFeaturedOrder(a) - getFeaturedOrder(b));
          setItems(sorted);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Drag-to-reorder ──────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  async function saveFeaturedOrder(ordered: MediaItem[]) {
    await Promise.all(
      ordered.map((item, i) =>
        supabase
          .from('media_items')
          .update({ metadata: { ...item.metadata, featured_order: i } })
          .eq('id', item.id)
      )
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    setItems(prev => {
      const oldIndex = prev.findIndex(i => i.id === active.id);
      const newIndex = prev.findIndex(i => i.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex)
        .map((item, i) => ({ ...item, metadata: { ...item.metadata, featured_order: i } }));
      saveFeaturedOrder(reordered);
      return reordered;
    });
  }

  // newPosition here is a raw array-order index (1-based) — the index that
  // actually drives the masonry layout.
  function handleReposition(item: MediaItem, newPosition: number) {
    setItems(prev => {
      const clamped = Math.min(Math.max(newPosition, 1), prev.length) - 1;
      const oldIndex = prev.findIndex(i => i.id === item.id);
      if (oldIndex === -1 || oldIndex === clamped) return prev;
      const reordered = arrayMove(prev, oldIndex, clamped)
        .map((it, i) => ({ ...it, metadata: { ...it.metadata, featured_order: i } }));
      saveFeaturedOrder(reordered);
      return reordered;
    });
  }

  // Admin types a reading-order rank ("make this #5 left-to-right"). Resolve
  // it to whichever array position currently renders at that visual rank,
  // then reuse the same raw-index move above.
  function handleRepositionByReadingOrder(item: MediaItem, desiredRank: number) {
    const clampedRank = Math.min(Math.max(desiredRank, 1), visualOrder.length || items.length);
    const targetId = visualOrder[clampedRank - 1];
    const rawIndex = targetId ? items.findIndex(i => i.id === targetId) : clampedRank - 1;
    handleReposition(item, rawIndex + 1);
  }

  // ── Upload directly into Favorites ──────────────────────────────────────

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'));
    e.target.value = '';
    if (files.length === 0) return;

    setUploadingCount(files.length);
    try {
      if (!favoritesNodeIdRef.current) {
        favoritesNodeIdRef.current = await getOrCreateFavoritesNodeId();
      }
      const nodeId = favoritesNodeIdRef.current;
      const baseOrder = items.length > 0
        ? Math.max(...items.map(getFeaturedOrder).filter(n => n !== Number.MAX_SAFE_INTEGER), items.length - 1) + 1
        : 0;

      await Promise.all(
        files.map(async (file, idx) => {
          try {
            const dims = await readImageDimensions(file);
            const storagePath = await uploadMedia(file);
            const { data, error } = await supabase
              .from('media_items')
              .insert({
                node_id: nodeId,
                type: 'photo',
                title: file.name.replace(/\.[^.]+$/, ''),
                storage_path: storagePath,
                sort_order: 0,
                focal_x: 0.5,
                focal_y: 0.5,
                metadata: {
                  featured: true,
                  featured_order: baseOrder + idx,
                  ...(dims ? { width: dims.width, height: dims.height } : {}),
                },
              })
              .select()
              .single();
            if (error) throw error;
            setItems(prev => [...prev, data as MediaItem]);
            if (dims) {
              triggerDerivativeGeneration('media', storagePath, MEDIA_WIDTH_LADDER, {
                naturalWidth: dims.width,
                aspectRatio: dims.width / dims.height,
              });
            }
          } catch {
            toast.error(`Failed to add ${file.name}`);
          }
        })
      );
      toast.success('Added to homepage');
    } catch {
      toast.error('Failed to set up favorites');
    } finally {
      setUploadingCount(0);
    }
  }

  // ── Remove from Favorites ───────────────────────────────────────────────

  async function handleRemove(item: MediaItem) {
    setRemovingId(item.id);
    try {
      const newMetadata = { ...item.metadata, featured: false };
      const { error } = await supabase.from('media_items').update({ metadata: newMetadata }).eq('id', item.id);
      if (error) throw error;
      setItems(prev => prev.filter(i => i.id !== item.id));
      toast.success('Removed from homepage');
    } catch {
      toast.error('Failed to update');
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) return null;

  return (
    <section className="featured-work">
      <h2 className="featured-work__title">
        Featured Work
        {isAdmin && <span className="featured-work__count"> ({items.length})</span>}
      </h2>

      {items.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
            <div className="featured-work__grid" ref={gridRef}>
              {items.map((item, idx) => (
                <FeaturedItem
                  key={item.id}
                  item={item}
                  isAdmin={isAdmin}
                  position={visualRank.get(item.id) ?? idx + 1}
                  totalCount={items.length}
                  removing={removingId === item.id}
                  onClick={() => setLightboxIndex(idx)}
                  onRemove={() => handleRemove(item)}
                  onReposition={newRank => handleRepositionByReadingOrder(item, newRank)}
                  registerRef={registerRef}
                  onImageLoad={() => setLoadedTick(t => t + 1)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="featured-work__empty">
          {isAdmin
            ? 'No favorites yet — feature a photo from any gallery, or upload one directly here.'
            : 'No favorites yet.'}
        </p>
      )}

      {items.length > 0 && (
        <a className="featured-work__cta" href="#home-hero">View Full Portfolio</a>
      )}

      {isAdmin && (
        <>
          <button
            className="featured-work__add-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingCount > 0}
          >
            {uploadingCount > 0 ? `Uploading ${uploadingCount}…` : '+ Add to Favorites'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
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
    </section>
  );
}

export default FeaturedWork;
