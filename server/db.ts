import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { localDay } from '../shared/dates.ts';

/**
 * Database changes are added to this list, never edited, so an update can bring
 * an existing database forward without losing a learner's progress.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE lesson_progress (
    lesson_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'not_started',
    step TEXT NOT NULL DEFAULT 'predict',
    predict_answer INTEGER,
    recall_passed INTEGER NOT NULL DEFAULT 0,
    recall_attempts INTEGER NOT NULL DEFAULT 0,
    recall_best REAL,
    need_review INTEGER NOT NULL DEFAULT 0,
    come_back_later INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    completed_at TEXT
  );
  CREATE TABLE task_results (
    lesson_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    passed INTEGER NOT NULL DEFAULT 0,
    best_score REAL,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (lesson_id, task_id)
  );
  CREATE TABLE attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    ref TEXT,
    passed INTEGER,
    score REAL,
    detail TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX attempts_lesson ON attempts (lesson_id, kind);
  CREATE TABLE notes (lesson_id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL,
    due TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX cards_due ON cards (due);
  CREATE TABLE card_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    rating TEXT NOT NULL,
    day TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX card_reviews_day ON card_reviews (day);
  CREATE TABLE time_log (
    day TEXT NOT NULL,
    lesson_id TEXT NOT NULL DEFAULT '',
    seconds INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, lesson_id)
  );
  CREATE TABLE problems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id TEXT NOT NULL,
    message TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  `,
  // 2: rewritten-lesson tracking, and feedback that can be sent to the developer.
  `
  ALTER TABLE lesson_progress ADD COLUMN completed_revision INTEGER;
  ALTER TABLE problems ADD COLUMN sent_at TEXT;
  ALTER TABLE problems ADD COLUMN updated_at TEXT;
  CREATE TABLE lesson_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id TEXT NOT NULL,
    clarity INTEGER,
    unclear_concepts TEXT NOT NULL DEFAULT '[]',
    assumed TEXT NOT NULL DEFAULT '',
    other TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sent_at TEXT
  );
  CREATE INDEX lesson_feedback_lesson ON lesson_feedback (lesson_id);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;
/** Every table that holds learner data, in the order backups restore them. */
export const TABLES = ['settings', 'lesson_progress', 'task_results', 'attempts', 'notes', 'cards', 'card_reviews', 'time_log', 'problems', 'lesson_feedback'];

const versionOf = (db: DatabaseSync) => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

export function backupTo(db: DatabaseSync, file: string) {
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file)) rmSync(file);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
}

/** One automatic copy a day, keeping the newest ten, in case something ever goes wrong. */
export function dailyBackup(db: DatabaseSync, backupDir: string) {
  const file = join(backupDir, `progress-${localDay()}.db`);
  if (existsSync(file)) return;
  backupTo(db, file);
  const old = readdirSync(backupDir).filter((f) => /^progress-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(10);
  for (const f of old) rmSync(join(backupDir, f));
}

export function openDatabase(file: string, backupDir: string): DatabaseSync {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const version = versionOf(db);
  if (version > SCHEMA_VERSION) {
    db.close();
    throw new Error('Your progress was saved by a newer version of Groundwork. Double-click update.bat to update the app.');
  }
  if (version > 0 && version < SCHEMA_VERSION) backupTo(db, join(backupDir, `before-update-v${version}-${Date.now()}.db`));
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}
