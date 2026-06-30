import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { Node, MediaItem } from '../types';
import NotFound from './NotFound';
import Header from '../components/Header';

function NodePage() {
  const location = useLocation();
  const slugSegments = location.pathname.split('/').filter(s => s !== '');

  const [status, setStatus] = useState<'loading' | 'not_found' | 'ready'>('loading');
  const [node, setNode] = useState<Node | null>(null);
  const [children, setChildren] = useState<Node[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);

  useEffect(() => {
    async function resolve() {
      setStatus('loading');
      setNode(null);
      setChildren([]);
      setMedia([]);

      // Walk the slug segments one by one, querying one level at a time
      let parentId: string | null = null;
      let currentNode: Node | null = null;

      for (const slug of slugSegments) {
        let stepData: Node | null = null;
        let stepError: unknown = null;

        if (parentId === null) {
          const res = await supabase.from('nodes').select('*').eq('slug', slug).is('parent_id', null).single();
          stepData = res.data as Node | null;
          stepError = res.error;
        } else {
          const res = await supabase.from('nodes').select('*').eq('slug', slug).eq('parent_id', parentId).single();
          stepData = res.data as Node | null;
          stepError = res.error;
        }

        if (stepError || !stepData) {
          setStatus('not_found');
          return;
        }

        currentNode = stepData;
        parentId = stepData.id;
      }

      // No slugs = home page: fetch all top-level nodes
      if (currentNode === null) {
        const { data, error } = await supabase
          .from('nodes')
          .select('*')
          .is('parent_id', null)
          .order('sort_order');

        if (error || !data) { setStatus('not_found'); return; }
        setChildren(data as Node[]);

      } else if (currentNode.kind === 'menu') {
        const { data, error } = await supabase
          .from('nodes')
          .select('*')
          .eq('parent_id', currentNode.id)
          .order('sort_order');

        if (error || !data) { setStatus('not_found'); return; }
        setNode(currentNode);
        setChildren(data as Node[]);

      } else {
        const { data, error } = await supabase
          .from('media_items')
          .select('*')
          .eq('node_id', currentNode.id)
          .order('sort_order');

        if (error || !data) { setStatus('not_found'); return; }
        setNode(currentNode);
        setMedia(data as MediaItem[]);
      }

      setStatus('ready');
    }

    resolve();
  }, [location.pathname]);

  if (status === 'loading') return (
    <>
      <Header />
      <div className="spinner" />
    </>
  );

  if (status === 'not_found') return (
    <>
      <Header />
      <NotFound />
    </>
  );

  if (children.length > 0) {
    return (
      <>
        <Header subtitle={node?.title} />
        {children.map(child => (
          <div key={child.id}>{child.title}</div>
        ))}
      </>
    );
  }

  return (
    <>
      <Header subtitle={node?.title} />
      {media.map(item => (
        <div key={item.id}>{item.title}</div>
      ))}
    </>
  );
}

export default NodePage;
