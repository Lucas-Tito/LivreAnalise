export const SCHEMA_DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS project_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guid TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  app_version TEXT NOT NULL DEFAULT '0.1.0'
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  plain_text TEXT NOT NULL,
  original_format TEXT NOT NULL,
  source_filename TEXT,
  char_count INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#2563eb',
  description TEXT,
  parent_id INTEGER REFERENCES codes(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS code_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  parent_group_id INTEGER REFERENCES code_groups(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS code_group_members (
  group_id INTEGER NOT NULL REFERENCES code_groups(id) ON DELETE CASCADE,
  code_id INTEGER NOT NULL REFERENCES codes(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, code_id)
);

CREATE TABLE IF NOT EXISTS codings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guid TEXT NOT NULL UNIQUE,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  code_id INTEGER NOT NULL REFERENCES codes(id) ON DELETE CASCADE,
  start_pos INTEGER NOT NULL,
  end_pos INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS codings_unique_span
  ON codings(document_id, code_id, start_pos, end_pos);

CREATE INDEX IF NOT EXISTS codings_by_document ON codings(document_id);
CREATE INDEX IF NOT EXISTS codings_by_code ON codings(code_id);
CREATE INDEX IF NOT EXISTS codes_by_parent ON codes(parent_id);
CREATE INDEX IF NOT EXISTS groups_by_parent ON code_groups(parent_group_id);
`
