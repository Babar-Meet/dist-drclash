-- Rate limiting and OAuth state table
-- Uses ON CONFLICT for upsert semantics
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_key INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (key, window_key)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at);
