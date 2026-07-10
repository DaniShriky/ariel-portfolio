-- The "Homepage Favorites" node was originally created unpublished, which
-- hid every directly-uploaded favorite from visitors (RLS only exposes
-- media_items whose parent node is published). Publish it so those photos
-- follow the same public-read rule as everything else.
UPDATE nodes
SET is_published = true
WHERE slug = 'home-favorites'
AND parent_id IS NULL;
