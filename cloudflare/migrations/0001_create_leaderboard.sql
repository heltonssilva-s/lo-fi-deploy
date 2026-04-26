-- Lo-Fi Super Neon Drive
-- D1 leaderboard schema

CREATE TABLE IF NOT EXISTS leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 99999999),
    distance INTEGER NOT NULL DEFAULT 0 CHECK (distance >= 0),
    date TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS leaderboard_score_distance_created_idx
    ON leaderboard (score DESC, distance DESC, created_at ASC, id ASC);
