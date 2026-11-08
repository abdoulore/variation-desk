import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let database;

function getDatabase() {
  if (database) return database;
  const path = process.env.DATABASE_PATH || './data/variation-desk.sqlite';
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS daily_usage (day TEXT PRIMARY KEY, runs INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS evidence_requests (
      draft_id TEXT PRIMARY KEY,
      requested_at TEXT NOT NULL,
      attached_at TEXT,
      measurement_id TEXT,
      revised_draft_id TEXT UNIQUE
    );
  `);
  database = db;
  return database;
}

export function reserveInferenceRun() {
  const day = new Date().toISOString().slice(0, 10);
  const limit = 60;
  const result = getDatabase().prepare(`
    INSERT INTO daily_usage (day, runs) VALUES (?, 1)
    ON CONFLICT(day) DO UPDATE SET runs = runs + 1 WHERE runs < ?
  `).run(day, limit);
  return result.changes === 1;
}

export function saveDraft(draft) {
  getDatabase().prepare('INSERT INTO drafts (id, created_at, body) VALUES (?, ?, ?)')
    .run(draft.id, draft.createdAt, JSON.stringify(draft));
  return draft;
}

function getDraft(id) {
  const row = getDatabase().prepare('SELECT body FROM drafts WHERE id = ?').get(id);
  return row ? JSON.parse(row.body) : null;
}

export function getEvidenceRequest(id) {
  const row = getDatabase().prepare(`
    SELECT requested_at AS requestedAt, attached_at AS attachedAt,
           measurement_id AS measurementId, revised_draft_id AS revisedDraftId
    FROM evidence_requests WHERE draft_id = ?
  `).get(id);
  if (!row) return null;
  return {
    requestedAt: row.requestedAt,
    attachedAt: row.attachedAt,
    measurementId: row.measurementId,
    original: getDraft(id),
    revised: row.revisedDraftId ? getDraft(row.revisedDraftId) : null,
  };
}

export function requestEvidence(id) {
  const original = getDraft(id);
  if (original?.scenario !== 'partial' || original.calculation.pending <= 0) return null;
  getDatabase().prepare(`
    INSERT INTO evidence_requests (draft_id, requested_at) VALUES (?, ?)
    ON CONFLICT(draft_id) DO NOTHING
  `).run(id, new Date().toISOString());
  return getEvidenceRequest(id);
}

export function attachEvidence(id, measurementId) {
  getDatabase().prepare(`
    UPDATE evidence_requests SET attached_at = ?, measurement_id = ?
    WHERE draft_id = ? AND attached_at IS NULL
  `).run(new Date().toISOString(), measurementId, id);
  return getEvidenceRequest(id);
}

export function saveRevisedDraft(id, draft) {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const evidence = getEvidenceRequest(id);
    if (!evidence?.attachedAt) throw new Error('Revised evidence is required.');
    const saved = evidence.revised ?? saveDraft(draft);
    if (!evidence.revised) {
      db.prepare('UPDATE evidence_requests SET revised_draft_id = ? WHERE draft_id = ?').run(saved.id, id);
    }
    db.exec('COMMIT');
    return saved;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
