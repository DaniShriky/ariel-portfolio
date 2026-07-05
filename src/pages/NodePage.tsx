import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAdminMode } from '../context/AdminModeContext';
import {
  DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { supabase } from '../lib/supabaseClient';
import type { Node } from '../types';
import NotFound from './NotFound';
import Header from '../components/Header';
import SortableNodeButton from '../components/SortableNodeButton';
import GalleryGrid from '../components/GalleryGrid';
import FeaturedWork from '../components/FeaturedWork';
import AboutSection from '../components/AboutSection';
import ContactCTA from '../components/ContactCTA';

function toSlug(title: string) {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, '');
}

function NodePage() {
  const location    = useLocation();
  const { isAdmin } = useAdminMode();
  const titleInputRef = useRef<HTMLInputElement>(null);

  const slugSegments = location.pathname.split('/').filter(s => s !== '');

  const [status, setStatus]     = useState<'loading' | 'not_found' | 'ready'>('loading');
  const [node, setNode]         = useState<Node | null>(null);
  const [children, setChildren] = useState<Node[]>([]);
  const hasLoadedRef = useRef(false); // stays true after first successful load

  const [addingCategory, setAddingCategory] = useState(false);
  const [newTitle, setNewTitle]             = useState('');
  const [newKind, setNewKind]               = useState<'gallery' | 'menu'>('gallery');
  const [adding, setAdding]                 = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  // focus input when modal opens
  useEffect(() => {
    if (addingCategory) titleInputRef.current?.focus();
  }, [addingCategory]);

  // Escape key closes the modal
  useEffect(() => {
    if (!addingCategory) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelAdd(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [addingCategory]);

  useEffect(() => {
    async function resolve() {
      setStatus('loading');
      setAddingCategory(false);
      setNewTitle('');
      // keep node/children from previous page so the header doesn't flash during navigation

      let parentId: string | null = null;
      let currentNode: Node | null = null;

      for (const slug of slugSegments) {
        let stepData: Node | null = null;
        let stepError: unknown = null;

        if (parentId === null) {
          const q = supabase.from('nodes').select('*').eq('slug', slug).is('parent_id', null);
          const res = await (isAdmin ? q : q.eq('is_published', true)).single();
          stepData = res.data as Node | null;
          stepError = res.error;
        } else {
          const q = supabase.from('nodes').select('*').eq('slug', slug).eq('parent_id', parentId);
          const res = await (isAdmin ? q : q.eq('is_published', true)).single();
          stepData = res.data as Node | null;
          stepError = res.error;
        }

        if (stepError || !stepData) { setStatus('not_found'); return; }
        currentNode = stepData;
        parentId = stepData.id;
      }

      if (currentNode === null) {
        const q = supabase.from('nodes').select('*').is('parent_id', null).order('sort_order');
        const { data, error } = await (isAdmin ? q : q.eq('is_published', true));
        if (error || !data) { setStatus('not_found'); return; }
        setNode(null);
        setChildren(data as Node[]);

      } else if (currentNode.kind === 'menu') {
        const q = supabase.from('nodes').select('*').eq('parent_id', currentNode.id).order('sort_order');
        const { data, error } = await (isAdmin ? q : q.eq('is_published', true));
        if (error || !data) { setStatus('not_found'); return; }
        setNode(currentNode);
        setChildren(data as Node[]);

      } else {
        setNode(currentNode);
      }

      hasLoadedRef.current = true;
      setStatus('ready');
    }

    resolve();
  }, [location.pathname, isAdmin]);

  // ── drag-to-reorder ──────────────────────────────────────────────────────

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    setChildren(prev => {
      const oldIndex = prev.findIndex(n => n.id === active.id);
      const newIndex = prev.findIndex(n => n.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      saveSortOrder(reordered);
      return reordered;
    });
  }

  async function saveSortOrder(ordered: Node[]) {
    await Promise.all(
      ordered.map((n, i) =>
        supabase.from('nodes').update({ sort_order: i }).eq('id', n.id)
      )
    );
  }

  // ── delete category ───────────────────────────────────────────────────────

  async function handleDeleteCategory(category: Node) {
    await supabase.from('media_items').delete().eq('node_id', category.id);
    const { error } = await supabase.from('nodes').delete().eq('id', category.id);
    if (error) throw error;
    setChildren(prev => prev.filter(c => c.id !== category.id));
    toast.success(`"${category.title}" deleted`);
  }

  // ── add category ─────────────────────────────────────────────────────────

  function cancelAdd() {
    setAddingCategory(false);
    setNewTitle('');
    setNewKind('gallery');
  }

  async function handleAddCategory() {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      const slug      = toSlug(title);
      const parentId  = node?.id ?? null;
      const sortOrder = children.length > 0
        ? Math.max(...children.map(c => c.sort_order)) + 1
        : 0;

      const { data, error } = await supabase
        .from('nodes')
        .insert({
          title,
          slug,
          kind: newKind,
          parent_id: parentId,
          sort_order: sortOrder,
          is_published: true,
          focal_x: 0.5,
          focal_y: 0.5,
          metadata: {},
        })
        .select()
        .single();

      if (error) throw error;
      setChildren(prev => [...prev, data as Node]);
      cancelAdd();
      toast.success(`"${title}" added`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      toast.error(msg.includes('unique') ? 'A category with that name already exists' : 'Failed to add category');
    } finally {
      setAdding(false);
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); handleAddCategory(); }
    if (e.key === 'Escape') cancelAdd();
  }

  // ── render ───────────────────────────────────────────────────────────────

  // Derive a tentative title from the URL so the header shows the right text
  // immediately on refresh, before Supabase responds.
  const lastSlug = slugSegments[slugSegments.length - 1];
  const tentativeTitle = lastSlug
    ? lastSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : undefined;

  // Only show the spinner on the very first page load — on navigation keep
  // rendering the previous content so the layout never jumps position.
  if (status === 'loading' && !hasLoadedRef.current) return (
    <>
      <Header subtitle={tentativeTitle} />
      <div className="spinner" />
    </>
  );

  if (status === 'not_found') return (
    <>
      <Header />
      <NotFound />
    </>
  );

  // Gallery node → always show image grid
  if (node?.kind === 'gallery') {
    return (
      <>
        <Header subtitle={node.title} />
        <GalleryGrid nodeId={node.id} />
      </>
    );
  }

  // Home page or menu node → category grid
  const basePath  = location.pathname === '/' ? '' : location.pathname.replace(/\/$/, '');
  const gridClass = node === null ? 'node-grid node-grid--home' : 'node-grid';

  return (
    <>
      <Header subtitle={node?.title} />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={children.map(c => c.id)} strategy={rectSortingStrategy}>
          <div className={gridClass} id={node === null ? 'home-hero' : undefined}>
            {children.map(child => (
              <SortableNodeButton
                key={child.id}
                node={child}
                href={`${basePath}/${child.slug}`}
                onDelete={() => handleDeleteCategory(child)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {node === null && (
        <>
          <FeaturedWork />
          <AboutSection />
          <ContactCTA />
        </>
      )}

      {/* Floating + button */}
      {isAdmin && (
        <button
          className="add-floating-btn"
          onClick={() => setAddingCategory(true)}
          title="Add category"
        >
          +
        </button>
      )}

      {/* Add category modal */}
      {addingCategory && (
        <div className="modal-backdrop" onClick={cancelAdd}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <p className="modal-title">Add category</p>
            <input
              ref={titleInputRef}
              className="add-category-input"
              placeholder="Category name"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              disabled={adding}
            />
            <div className="add-kind-toggle">
              <button
                className={`add-kind-btn${newKind === 'gallery' ? ' add-kind-btn--active' : ''}`}
                onClick={() => setNewKind('gallery')}
              >
                Gallery
              </button>
              <button
                className={`add-kind-btn${newKind === 'menu' ? ' add-kind-btn--active' : ''}`}
                onClick={() => setNewKind('menu')}
              >
                Menu
              </button>
            </div>
            <div className="add-category-actions">
              <button className="add-category-cancel" onClick={cancelAdd} disabled={adding}>Cancel</button>
              <button className="add-category-save" onClick={handleAddCategory} disabled={!newTitle.trim() || adding}>
                {adding ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default NodePage;
