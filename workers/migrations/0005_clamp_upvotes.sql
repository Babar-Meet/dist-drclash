-- Repair negative upvote counts persisted before MAX(0, ...) clamping existed.
UPDATE posts SET upvotes = 0 WHERE upvotes < 0;
