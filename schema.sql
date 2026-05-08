CREATE TABLE IF NOT EXISTS users_whitelist (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT
);

CREATE TABLE IF NOT EXISTS repositories (
  repo_name TEXT PRIMARY KEY,
  telegram_topic_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS sessions (
  jules_session_id TEXT PRIMARY KEY,
  telegram_topic_id TEXT,
  status TEXT,
  created_at DATETIME,
  updated_at DATETIME,
  last_activity_count INTEGER DEFAULT 0,
  FOREIGN KEY (telegram_topic_id) REFERENCES repositories(telegram_topic_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_topic_id ON sessions(telegram_topic_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
