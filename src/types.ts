export type NodeKind = 'menu' | 'gallery';
export type MediaType = 'photo' | 'video';

export type Node = {
  id: string;
  parent_id: string | null;
  kind: 'menu' | 'gallery';
  title: string;
  slug: string;
  cover_path: string | null;          // MAIN image = phone (always used as fallback)
  focal_x: number;
  focal_y: number;
  cover_path_desktop: string | null;  // OPTIONAL different image for desktop
  focal_x_desktop: number | null;     // its own focal point (null = use main)
  focal_y_desktop: number | null;
  sort_order: number;
  is_published: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MediaItem = {
  id: string;
  node_id: string;
  type: MediaType;
  title: string;
  storage_path: string;
  focal_x: number;
  focal_y: number;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};