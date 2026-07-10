-- Correction to 003: publishing the "Homepage Favorites" bucket node made it
-- appear as a real top-level menu button on the home page (any published
-- node with parent_id null is listed as one). That bucket must stay
-- unpublished so it's never navigable — it's internal storage, not a page.
--
-- Instead, make featured photos public on their own merit, regardless of
-- their parent node's publish status. This covers both direct uploads
-- (living in the unpublished bucket node) and photos toggled featured from
-- an existing gallery.
DROP POLICY IF EXISTS public_read ON media_items;

CREATE POLICY public_read
ON media_items
FOR SELECT
USING (
  metadata->>'featured' = 'true'
  OR EXISTS (
    SELECT 1 FROM nodes
    WHERE nodes.id = media_items.node_id
    AND nodes.is_published = true
  )
  OR auth.uid() IS NOT NULL
);

UPDATE nodes
SET is_published = false
WHERE slug = 'home-favorites'
AND parent_id IS NULL;
