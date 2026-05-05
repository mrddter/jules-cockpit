-- Jules Telegram Cockpit Database Schema

DROP TABLE IF EXISTS users_whitelist;
CREATE TABLE users_whitelist (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS repositories;
CREATE TABLE repositories (
    repo_name TEXT PRIMARY KEY,
    telegram_topic_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
    jules_session_id TEXT PRIMARY KEY,
    telegram_topic_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active' or 'archived'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying sessions by topic
CREATE INDEX idx_sessions_topic ON sessions(telegram_topic_id);
-- Index for quick active session lookup
CREATE INDEX idx_active_sessions ON sessions(telegram_topic_id, status);
