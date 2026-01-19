/**
 * Harmon Store - SQLite persistence layer with migrations
 */

import { createClient, type Client } from '@libsql/client';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import fs from 'node:fs';

// ============================================================================
// Types
// ============================================================================

export interface Database {
  client: Client;
}

export interface JournalEntry {
  id: string;
  filename: string;
  timestamp: string;
  source: string;
  device: string;
  sessionId?: string;
  moodTags: string;
  energyLevel?: string;
  context?: string;
  content: string;
  policy?: string;
  embedding?: number[];
  createdAt: string;
}

export interface Session {
  id: string;
  policy: string;
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'cancelled';
}

export interface EventLog {
  id: string;
  sessionId?: string;
  type: string;
  payload: string;
  createdAt: string;
}

// ============================================================================
// Schema
// ============================================================================

const MIGRATIONS = [
  // Initial schema
  `
    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      source TEXT NOT NULL,
      device TEXT NOT NULL,
      sessionId TEXT,
      moodTags TEXT,
      energyLevel TEXT,
      context TEXT,
      content TEXT NOT NULL,
      policy TEXT,
      embedding BLOB,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_journal_timestamp ON journal_entries(timestamp);
    CREATE INDEX IF NOT EXISTS idx_journal_moodTags ON journal_entries(moodTags);
    CREATE INDEX IF NOT EXISTS idx_journal_sessionId ON journal_entries(sessionId);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      policy TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      endedAt TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_startedAt ON sessions(startedAt);

    CREATE TABLE IF NOT EXISTS event_log (
      id TEXT PRIMARY KEY,
      sessionId TEXT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_event_log_sessionId ON event_log(sessionId);
    CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(type);
    CREATE INDEX IF NOT EXISTS idx_event_log_createdAt ON event_log(createdAt);
  `,
  `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT DEFAULT (datetime('now'))
    );
  `,
];

// ============================================================================
// Store Implementation
// ============================================================================

export interface HarmonStoreConfig {
  dbPath?: string;
  memory?: boolean;
}

export class HarmonStore {
  private client: Client;
  private dbPath: string;

  constructor(config: HarmonStoreConfig = {}) {
    const dbPath = config.dbPath || '.harmon.db';
    this.dbPath = path.resolve(dbPath);

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const url = config.memory ? 'file::memory:' : `file:${this.dbPath}`;

    this.client = createClient({
      url,
    });
  }

  /**
   * Run migrations
   */
  async migrate(): Promise<void> {
    for (const migration of MIGRATIONS) {
      await this.client.execute(migration);
    }
  }

  /**
   * Close the database
   */
  async close(): Promise<void> {
    // libsql client doesn't have explicit close, but we could clean up resources
  }

  // ============================================================================
  // Journal Entries
  // ============================================================================

  async addJournalEntry(entry: Omit<JournalEntry, 'id' | 'createdAt'>): Promise<string> {
    const id = uuidv4();
    const now = new Date().toISOString();

    await this.client.execute({
      sql: `
        INSERT INTO journal_entries
        (id, filename, timestamp, source, device, sessionId, moodTags, energyLevel, context, content, policy, embedding, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        entry.filename,
        entry.timestamp,
        entry.source,
        entry.device,
        entry.sessionId || null,
        entry.moodTags,
        entry.energyLevel || null,
        entry.context || null,
        entry.content,
        entry.policy || null,
        entry.embedding ? Buffer.from(JSON.stringify(entry.embedding)) : null,
        now,
      ],
    });

    return id;
  }

  async getJournalEntry(id: string): Promise<JournalEntry | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM journal_entries WHERE id = ?',
      args: [id],
    });

    if (result.rows.length === 0) return null;
    return this.rowToJournalEntry(result.rows[0]);
  }

  async getJournalEntries(limit = 100, offset = 0): Promise<JournalEntry[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM journal_entries ORDER BY timestamp DESC LIMIT ? OFFSET ?',
      args: [limit.toString(), offset.toString()],
    });

    return result.rows.map((row) => this.rowToJournalEntry(row));
  }

  async getJournalEntriesByMood(mood: string, limit = 50): Promise<JournalEntry[]> {
    const result = await this.client.execute({
      sql: `
        SELECT * FROM journal_entries
        WHERE moodTags LIKE ?
        ORDER BY timestamp DESC
        LIMIT ?
      `,
      args: [`%${ mood }%`, limit.toString()],
    });

    return result.rows.map((row) => this.rowToJournalEntry(row));
  }

  async getRecentJournalEntries(days = 7, limit = 100): Promise<JournalEntry[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = await this.client.execute({
      sql: `
        SELECT * FROM journal_entries
        WHERE timestamp >= ?
        ORDER BY timestamp DESC
        LIMIT ?
      `,
      args: [cutoff, limit.toString()],
    });

    return result.rows.map((row) => this.rowToJournalEntry(row));
  }

  private rowToJournalEntry(row: Record<string, unknown>): JournalEntry {
    return {
      id: row.id as string,
      filename: row.filename as string,
      timestamp: row.timestamp as string,
      source: row.source as string,
      device: row.device as string,
      sessionId: row.sessionId as string | undefined,
      moodTags: row.moodTags as string,
      energyLevel: row.energyLevel as string | undefined,
      context: row.context as string | undefined,
      content: row.content as string,
      policy: row.policy as string | undefined,
      embedding: row.embedding ? JSON.parse((row.embedding as Buffer).toString()) : undefined,
      createdAt: row.createdAt as string,
    };
  }

  // ============================================================================
  // Sessions
  // ============================================================================

  async createSession(policy: string): Promise<string> {
    const id = `sess_${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();

    await this.client.execute({
      sql: `
        INSERT INTO sessions (id, policy, startedAt, status)
        VALUES (?, ?, ?, 'active')
      `,
      args: [id, policy, now],
    });

    return id;
  }

  async endSession(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `
        UPDATE sessions
        SET endedAt = ?, status = 'completed'
        WHERE id = ?
      `,
      args: [now, id],
    });
  }

  async cancelSession(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `
        UPDATE sessions
        SET endedAt = ?, status = 'cancelled'
        WHERE id = ?
      `,
      args: [now, id],
    });
  }

  async getSession(id: string): Promise<Session | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM sessions WHERE id = ?',
      args: [id],
    });

    if (result.rows.length === 0) return null;
    return this.rowToSession(result.rows[0]);
  }

  async getActiveSession(): Promise<Session | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM sessions WHERE status = ? ORDER BY startedAt DESC LIMIT 1',
      args: ['active'],
    });

    if (result.rows.length === 0) return null;
    return this.rowToSession(result.rows[0]);
  }

  async getRecentSessions(limit = 20): Promise<Session[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM sessions ORDER BY startedAt DESC LIMIT ?',
      args: [limit.toString()],
    });

    return result.rows.map((row) => this.rowToSession(row));
  }

  private rowToSession(row: Record<string, unknown>): Session {
    return {
      id: row.id as string,
      policy: row.policy as string,
      startedAt: row.startedAt as string,
      endedAt: row.endedAt as string | undefined,
      status: row.status as 'active' | 'completed' | 'cancelled',
    };
  }

  // ============================================================================
  // Event Log
  // ============================================================================

  async logEvent(
    type: string,
    payload: Record<string, unknown>,
    sessionId?: string
  ): Promise<string> {
    const id = uuidv4();
    const now = new Date().toISOString();

    await this.client.execute({
      sql: `
        INSERT INTO event_log (id, sessionId, type, payload, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [id, sessionId || null, type, JSON.stringify(payload), now],
    });

    return id;
  }

  async getEvents(sessionId?: string, limit = 100): Promise<EventLog[]> {
    let sql = 'SELECT * FROM event_log';
    const args: string[] = [];

    if (sessionId) {
      sql += ' WHERE sessionId = ?';
      args.push(sessionId);
    }

    sql += ' ORDER BY createdAt DESC LIMIT ?';
    args.push(limit.toString());

    const result = await this.client.execute({ sql, args });
    return result.rows.map((row) => this.rowToEventLog(row));
  }

  async getRecentEvents(limit = 50): Promise<EventLog[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM event_log ORDER BY createdAt DESC LIMIT ?',
      args: [limit.toString()],
    });

    return result.rows.map((row) => this.rowToEventLog(row));
  }

  private rowToEventLog(row: Record<string, unknown>): EventLog {
    return {
      id: row.id as string,
      sessionId: row.sessionId as string | undefined,
      type: row.type as string,
      payload: row.payload as string,
      createdAt: row.createdAt as string,
    };
  }

  // ============================================================================
  // Settings
  // ============================================================================

  async getSetting(key: string): Promise<string | null> {
    const result = await this.client.execute({
      sql: 'SELECT value FROM settings WHERE key = ?',
      args: [key],
    });

    if (result.rows.length === 0) return null;
    return result.rows[0]?.value as string;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.client.execute({
      sql: `
        INSERT INTO settings (key, value, updatedAt)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updatedAt = datetime('now')
      `,
      args: [key, value],
    });
  }

  async deleteSetting(key: string): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM settings WHERE key = ?',
      args: [key],
    });
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  async getStats(): Promise<{
    totalEntries: number;
    totalSessions: number;
    activeSessions: number;
    eventsLogged: number;
    recentMoodDistribution: Record<string, number>;
  }> {
    const entriesResult = await this.client.execute({
      sql: 'SELECT COUNT(*) as count FROM journal_entries',
      args: [],
    });

    const sessionsResult = await this.client.execute({
      sql: 'SELECT COUNT(*) as count FROM sessions WHERE status = ?',
      args: ['active'],
    });

    const totalSessionsResult = await this.client.execute({
      sql: 'SELECT COUNT(*) as count FROM sessions',
      args: [],
    });

    const eventsResult = await this.client.execute({
      sql: 'SELECT COUNT(*) as count FROM event_log',
      args: [],
    });

    // Get mood distribution from last 7 days
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const moodResult = await this.client.execute({
      sql: `
        SELECT moodTags, COUNT(*) as count FROM journal_entries
        WHERE timestamp >= ?
        GROUP BY moodTags
        ORDER BY count DESC
      `,
      args: [cutoff],
    });

    const recentMoodDistribution: Record<string, number> = {};
    for (const row of moodResult.rows) {
      const tags = (row.moodTags as string).split(',').map((t) => t.trim());
      for (const tag of tags) {
        if (tag) {
          recentMoodDistribution[tag] = (recentMoodDistribution[tag] || 0) + (row.count as number);
        }
      }
    }

    return {
      totalEntries: entriesResult.rows[0]?.count as number || 0,
      totalSessions: totalSessionsResult.rows[0]?.count as number || 0,
      activeSessions: sessionsResult.rows[0]?.count as number || 0,
      eventsLogged: eventsResult.rows[0]?.count as number || 0,
      recentMoodDistribution,
    };
  }

  /**
   * Get database path
   */
  getDbPath(): string {
    return this.dbPath;
  }
}

/**
 * Create a store with default configuration
 */
export function createStore(config?: HarmonStoreConfig): HarmonStore {
  const store = new HarmonStore(config);
  // Auto-migrate
  store.migrate().catch(console.error);
  return store;
}
