ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read
ON nodes
FOR SELECT
USING (auth.uid() IS NOT NULL OR is_published = true);

CREATE POLICY public_read
ON media_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM nodes
    WHERE nodes.id = media_items.node_id
    AND nodes.is_published = true
  )
  OR auth.uid() IS NOT NULL
);

CREATE POLICY owner_write
ON nodes
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY owner_write
ON media_items
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
