-- Adds YouTube-hosted video items alongside today's upload-based photos and
-- self-hosted videos. `storage_path` keeps its existing meaning for every
-- item ("bucket path to this item's display image") — for a YouTube item it
-- points at the captured cover frame, not the video itself. `provider` /
-- `external_id` are purely additive: every existing row already satisfies
-- both check constraints via the defaults below, so no backfill is needed.

alter table media_items
  add column provider text not null default 'upload',
  add column external_id text null;

alter table media_items
  add constraint media_items_provider_check
    check (provider in ('upload', 'youtube'));

alter table media_items
  add constraint media_items_external_id_consistency
    check (
      (provider = 'upload'  and external_id is null)
      or
      (provider <> 'upload' and external_id is not null)
    );

-- Prevent pasting the same YouTube video twice into the same gallery.
-- Scoped to node_id (not global) so the same video can still be featured
-- deliberately in two different galleries.
create unique index media_items_youtube_unique
  on media_items (node_id, external_id)
  where provider = 'youtube';
