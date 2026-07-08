import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { useAdminMode } from '../context/AdminModeContext';
import DescriptionModal from './DescriptionModal';

// PLACEHOLDER — replace via the "Edit Bio" button in admin mode.
const DEFAULT_BIO = `Ariel Barish is a photographer and cinematographer capturing life as it happens — from intimate portraits to unscripted street scenes across the world. Every frame is built on instinct, patience, and an eye for the story hiding in plain sight.`;

// The bio isn't tied to any existing gallery/category node, so it's stored
// on one lazily-created, unpublished node's metadata — same pattern as the
// "Homepage Favorites" node used for direct-upload featured photos.
const SITE_CONTENT_SLUG = 'site-content';

async function getOrCreateSiteContentNodeId(): Promise<string> {
  const { data: existing } = await supabase
    .from('nodes')
    .select('id')
    .eq('slug', SITE_CONTENT_SLUG)
    .is('parent_id', null)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('nodes')
    .insert({
      title: 'Site Content',
      slug: SITE_CONTENT_SLUG,
      kind: 'menu',
      parent_id: null,
      sort_order: 9999,
      is_published: false,
      focal_x: 0.5,
      focal_y: 0.5,
      metadata: {},
    })
    .select('id')
    .single();
  if (error || !created) throw error ?? new Error('failed to create site content node');
  return created.id;
}

function HomeIntro() {
  const { isAdmin } = useAdminMode();
  const [bio, setBio] = useState(DEFAULT_BIO);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('nodes')
      .select('metadata')
      .eq('slug', SITE_CONTENT_SLUG)
      .is('parent_id', null)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const savedBio = (data?.metadata as { bio?: string } | undefined)?.bio;
        if (savedBio) setBio(savedBio);
      });
    return () => { cancelled = true; };
  }, []);

  async function handleSaveBio(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const nodeId = await getOrCreateSiteContentNodeId();
      const { error } = await supabase.from('nodes').update({ metadata: { bio: trimmed } }).eq('id', nodeId);
      if (error) throw error;
      setBio(trimmed);
      setEditing(false);
      toast.success('Bio updated');
    } catch {
      toast.error('Failed to save bio');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="home-intro">
      <p className="home-intro__text">{bio}</p>

      {isAdmin && (
        <button className="home-intro__edit-btn" onClick={() => setEditing(true)}>
          Edit Bio
        </button>
      )}

      {editing && (
        <DescriptionModal
          initialValue={bio}
          title="Edit Bio"
          placeholder="Tell visitors who Ariel is…"
          saving={saving}
          onSave={handleSaveBio}
          onCancel={() => setEditing(false)}
        />
      )}
    </section>
  );
}

export default HomeIntro;
