import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const openDatabase = (databasePath: string): DatabaseSync => {
  const absolute = path.resolve(process.cwd(), databasePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const db = new DatabaseSync(absolute, { timeout: 5_000 });
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
};

export const initSchema = (db: DatabaseSync): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sale_date TEXT NOT NULL,
      contractor_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      ksef_reference TEXT,
      ksef_document_id TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS ksef_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_attempt_id INTEGER NOT NULL,
      event_time TEXT NOT NULL DEFAULT (datetime('now')),
      event_type TEXT NOT NULL,
      request_json TEXT,
      response_json TEXT,
      http_status INTEGER,
      error_code TEXT,
      FOREIGN KEY(invoice_attempt_id) REFERENCES invoice_attempts(id)
    );

    CREATE TABLE IF NOT EXISTS pending_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_attempt_id INTEGER NOT NULL,
      job_type TEXT NOT NULL,
      run_after TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      FOREIGN KEY(invoice_attempt_id) REFERENCES invoice_attempts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_pending_jobs_run_after
      ON pending_jobs(status, run_after);
  `);
};
