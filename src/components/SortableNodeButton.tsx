import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAdminMode } from '../context/AdminModeContext';
import NodeButton from './NodeButton';
import type { Node } from '../types';

type Props = {
  node: Node;
  href: string;
  onDelete?: () => Promise<void>;
};

function SortableNodeButton({ node, href, onDelete }: Props) {
  const { isAdmin } = useAdminMode();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    flexGrow: isDragging ? 1 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`node-slot${isDragging ? ' node-slot--dragging' : ''}`}
    >
      {isAdmin && (
        <div className="node-cat-drag-handle" {...attributes} {...listeners} title="Drag to reorder">
          ⠿
        </div>
      )}
      <NodeButton node={node} href={href} onDelete={onDelete} />
    </div>
  );
}

export default SortableNodeButton;
