create table nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references nodes(id) on delete cascade,
  kind text not null check (kind in ('menu', 'gallery')),
  title text not null,
  slug text not null,
  cover_path text,
  focal_x numeric not null default 0.5,
  focal_y numeric not null default 0.5,
  cover_path_desktop text,
  focal_x_desktop numeric,
  focal_y_desktop numeric,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table media_items (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references nodes(id) on delete cascade,
  type text not null check (type in ('photo', 'video')),
  title text not null,
  storage_path text not null,
  focal_x numeric not null default 0.5,
  focal_y numeric not null default 0.5,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index nodes_parent_id_idx on nodes(parent_id);
create index media_items_node_id_idx on media_items(node_id);
