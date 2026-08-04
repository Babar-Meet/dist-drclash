-- The posts.upvotes counter drifted from the votes table under older buggy
-- code (replays, outbox, clamp-on-switch). Counts are now derived from
-- SUM(value) on the votes table at read time, so reconcile the leftover column
-- to match reality (floored at 0, matching what is displayed).
UPDATE posts
SET upvotes = MAX(0, COALESCE((SELECT SUM(v.value) FROM votes v WHERE v.post_id = posts.id), 0));

-- No longer ordered by this column; drop the now-unused index.
DROP INDEX IF EXISTS idx_posts_upvotes;
