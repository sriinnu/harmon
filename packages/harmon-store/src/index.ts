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

interface Migration {
  version: number;
  statements: string[];
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
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
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_journal_timestamp ON journal_entries(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_journal_moodTags ON journal_entries(moodTags)',
      'CREATE INDEX IF NOT EXISTS idx_journal_sessionId ON journal_entries(sessionId)',
      `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        policy TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        endedAt TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        createdAt TEXT DEFAULT (datetime('now'))
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_startedAt ON sessions(startedAt)',
      `
      CREATE TABLE IF NOT EXISTS event_log (
        id TEXT PRIMARY KEY,
        sessionId TEXT,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        createdAt TEXT DEFAULT (datetime('now'))
      )
      `,
      'CREATE INDEX IF NOT EXISTS idx_event_log_sessionId ON event_log(sessionId)',
      'CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(type)',
      'CREATE INDEX IF NOT EXISTS idx_event_log_createdAt ON event_log(createdAt)',
    ],
  },
  {
    version: 2,
    statements: [`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt TEXT DEFAULT (datetime('now'))
      )
    `],
  },
  {
    version: 3,
    statements: ['PRAGMA journal_mode=WAL'],
  },
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
  private memory: boolean;

  constructor(config: HarmonStoreConfig = {}) {
    const dbPath = config.dbPath || '.harmon.db';
    this.dbPath = path.resolve(dbPath);
    this.memory = config.memory === true;

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    if (!this.memory) {
      this.ensureDatabaseFiles();
    }

    const url = this.memory ? 'file::memory:' : `file:${this.dbPath}`;

    this.client = createClient({
      url,
    });
  }

  /**
   * Run migrations
   */
  async migrate(): Promise<void> {
    // Ensure migration tracking table exists
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        appliedAt TEXT DEFAULT (datetime('now'))
      )
    `);

    // Get current version
    const result = await this.client.execute('SELECT MAX(version) as v FROM _migrations');
    const currentVersion = (result.rows[0]?.v as number) || 0;

    // Run pending migrations
    for (const migration of MIGRATIONS) {
      if (migration.version > currentVersion) {
        for (const statement of migration.statements) {
          await this.client.execute(statement.trim());
        }
        await this.client.execute({
          sql: 'INSERT INTO _migrations (version) VALUES (?)',
          args: [migration.version],
        });
      }
    }

    this.enforceDatabaseFilePermissions();
  }

  /**
   * Close the database
   */
  async close(): Promise<void> {
    this.client.close();
  }

  /**
   * I create the SQLite files myself so the daemon never relies on process
   * umask to keep journal data owner-only.
   */
  private ensureDatabaseFiles(): void {
    const handle = fs.openSync(this.dbPath, 'a', 0o600);
    fs.closeSync(handle);
    this.enforceDatabaseFilePermissions();
  }

  /**
   * I keep the main DB and SQLite sidecars private to the current user.
   */
  private enforceDatabaseFilePermissions(): void {
    if (this.memory) {
      return;
    }

    for (const filePath of [this.dbPath, `${this.dbPath}-shm`, `${this.dbPath}-wal`]) {
      if (!fs.existsSync(filePath)) {
        continue;
      }
      fs.chmodSync(filePath, 0o600);
    }
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
    const result = await this.client.execute({
      sql: `
        UPDATE sessions
        SET endedAt = ?, status = 'completed'
        WHERE id = ? AND status = 'active'
      `,
      args: [now, id],
    });
    if (result.rowsAffected === 0) {
      throw new Error(`Session ${id} not found or not active`);
    }
  }

  async cancelSession(id: string): Promise<void> {
    const now = new Date().toISOString();
    const result = await this.client.execute({
      sql: `
        UPDATE sessions
        SET endedAt = ?, status = 'cancelled'
        WHERE id = ? AND status = 'active'
      `,
      args: [now, id],
    });
    if (result.rowsAffected === 0) {
      throw new Error(`Session ${id} not found or not active`);
    }
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
      const tags = ((row.moodTags as string) || '').split(',').map((t) => t.trim());
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

  /**
   * Validate encryption is enabled in production
   * This should be called after the store is initialized
   */
  static validateEncryptionInProduction(encryptionEnabled: boolean): void {
    if (process.env.NODE_ENV === 'production' && !encryptionEnabled) {
      throw new Error(
        'Encryption is required in production. Set HARMON_ENCRYPTION_SECRET environment variable.'
      );
    }
  }

  /**
   * Check if encryption should be required based on environment
   */
  static isEncryptionRequired(): boolean {
    return process.env.NODE_ENV === 'production';
  }
}

/**
 * Create a store with default configuration
 */
export async function createStore(config?: HarmonStoreConfig): Promise<HarmonStore> {
  const store = new HarmonStore(config);
  await store.migrate();
  return store;
}
