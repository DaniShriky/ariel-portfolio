import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import type { Node } from '../types';
import ViewLabel from './ViewLabel';

type Props = {
  node: Node;
  href: string;
};

function NodeButton({ node, href }: Props) {
  const mobileUrl = node.cover_path
    ? supabase.storage.from('covers').getPublicUrl(node.cover_path).data.publicUrl
    : null;

  const desktopUrl = node.cover_path_desktop
    ? supabase.storage.from('covers').getPublicUrl(node.cover_path_desktop).data.publicUrl
    : null;

  const focalMobile = `${node.focal_x * 100}% ${node.focal_y * 100}%`;
  const focalDesktop = `${(node.focal_x_desktop ?? node.focal_x) * 100}% ${(node.focal_y_desktop ?? node.focal_y) * 100}%`;

  return (
    <Link
      to={href}
      className="node-button"
      style={{
        '--focal-mobile': focalMobile,
        '--focal-desktop': focalDesktop,
      } as React.CSSProperties}
    >
      <picture className="node-button__picture">
        {desktopUrl && <source media="(min-width: 768px)" srcSet={desktopUrl} />}
        {mobileUrl
          ? <img src={mobileUrl} alt={node.title} className="node-img" />
          : <div className="node-img node-img--placeholder" />
        }
      </picture>
      <div className="node-overlay">
        <p className="node-label">{node.title}</p>
        <ViewLabel />
      </div>
    </Link>
  );
}

export default NodeButton;
