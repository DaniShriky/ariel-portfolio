Project handoff — Ariel Barish photography/video portfolio
I'm building a responsive photo/video portfolio site. I know HTML/CSS/JS/React, I'm new to TypeScript and learning as I go. Please explain things simply, step by step, one step at a time — don't dump all the code at once. Challenge my decisions if there's a more professional or maintainable approach.
Tech stack: React + TypeScript + Vite, Supabase (database, auth, storage), Vercel (deploy).
Architecture (already decided): A self-referential tree. Every button on the site — top-level (Photo, Video), categories (Portrait, Street…), and sub-categories (Thailand, Krakow…) — is one row in a single nodes table, each pointing to its parent_id. A node's kind is either 'menu' (clicking shows more buttons) or 'gallery' (clicking shows photos/videos). This handles the irregular depth where most categories go straight to a gallery but "Street" opens another level of buttons first. Each page only loads one level (children where parent_id = X), so no recursive queries.
Design: Every page looks the same — a barcode "Ariel Barish" header plus full-width image buttons with a title and a VIEW box. On phones the buttons stack as wide strips; on desktop they sit side by side (home) or as tall columns (categories).
Mobile-first decision: The phone is the primary audience. The main cover image (cover_path) is the PHONE image and is always present. Desktop gets an OPTIONAL override (cover_path_desktop); if absent, the phone image is reused. Each image has its own focal point (focal_x/focal_y) so CSS object-position keeps the right spot framed when the crop shape changes between phone and desktop.
My two TypeScript types so far:
typescripttype Node = {
  id: string;
  parent_id: string | null;
  kind: 'menu' | 'gallery';
  title: string;
  slug: string;
  cover_path: string | null;          // main = phone image, always present
  focal_x: number;
  focal_y: number;
  cover_path_desktop: string | null;  // optional desktop override
  focal_x_desktop: number | null;
  focal_y_desktop: number | null;
  sort_order: number;
  is_published: boolean;
  metadata: Record<string, unknown>;  // flexible future data (JSONB)
  created_at: string;
  updated_at: string;
};

type MediaItem = {
  id: string;
  node_id: string;
  type: 'photo' | 'video';
  title: string;
  storage_path: string;
  focal_x: number;
  focal_y: number;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
Admin panel needed (owner-only login): upload/replace/delete photos & videos, edit titles/categories, reorder items and buttons (drag-and-drop), change any cover image, set focal points, all without writing code. Storage organized with covers/ and media/ prefixes; public read, owner-only write via Row Level Security.
Where I am: Step 1 done — Vite + React + TS project created (ariel-portfolio), src/types.ts written, folder structure set up (lib/, components/, pages/, admin/). Next: Step 2 — create the Supabase project and build the nodes and media_items tables.
Please pick up from Step 2.