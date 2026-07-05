import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { getMediaUrl, getMediaSrcSet, readImageDimensions, uploadMedia } from '../lib/mediaService';
import { useAdminMode } from '../context/AdminModeContext';
import type { MediaItem } from '../types';
import Lightbox from './Lightbox';

// Homepage favorites aren't a separate content type — they're ordinary gallery
// photos with metadata.featured = true. Photos "toggled" featured from an
// existing gallery (GalleryGrid's ⋮ menu) live in that gallery's node.
// Photos uploaded directly here have nowhere else to live, so they're filed
// under one lazily-created, unpublished "Homepage Favorites" node — invisible
// to visitors, but manageable by the admin like any other gallery if needed.
const FAVORITES_SLUG = 'home-favorites';

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
  item, isAdmin, removing, onClick, onRemove,
}: {
  item: MediaItem;
  isAdmin: boolean;
  removing: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  const [transformFailed, setTransformFailed] = useState(false);

  return (
    <div className="featured-work__item" onClick={onClick}>
      <img
        src={transformFailed ? getMediaUrl(item.storage_path) : getMediaUrl(item.storage_path, { width: 1080, height: 1080, resize: 'contain', quality: 80 })}
        srcSet={transformFailed ? undefined : getMediaSrcSet(item.storage_path, [480, 768, 1080, 1440])}
        sizes="(min-width: 768px) 34vw, 50vw"
        alt={item.title}
        loading="lazy"
        decoding="async"
        onError={() => setTransformFailed(true)}
      />
      {isAdmin && (
        <button
          className="featured-work__remove"
          disabled={removing}
          onClick={e => { e.stopPropagation(); onRemove(); }}
          title="Remove from homepage"
        >
          {removing ? '…' : '✕'}
        </button>
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

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('media_items')
      .select('*')
      .eq('type', 'photo')
      .eq('metadata->>featured', 'true')
      .order('created_at', { ascending: false })
      .limit(9)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) setItems(data as MediaItem[]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

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

      await Promise.all(
        files.map(async file => {
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
                metadata: { featured: true, ...(dims ? { width: dims.width, height: dims.height } : {}) },
              })
              .select()
              .single();
            if (error) throw error;
            setItems(prev => [data as MediaItem, ...prev]);
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
  if (!isAdmin && items.length === 0) return null;

  return (
    <section className="featured-work">
      <h2 className="featured-work__title">Featured Work</h2>

      {items.length > 0 ? (
        <div className="featured-work__grid">
          {items.map((item, idx) => (
            <FeaturedItem
              key={item.id}
              item={item}
              isAdmin={isAdmin}
              removing={removingId === item.id}
              onClick={() => setLightboxIndex(idx)}
              onRemove={() => handleRemove(item)}
            />
          ))}
        </div>
      ) : (
        <p className="featured-work__empty">
          No favorites yet — feature a photo from any gallery, or upload one directly here.
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
