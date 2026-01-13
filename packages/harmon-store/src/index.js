/**
 * Harmon Store - SQLite persistence layer with migrations
 */
import { createClient } from '@libsql/client';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import fs from 'node:fs';
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
];
export class HarmonStore {
    client;
    dbPath;
    constructor(config = {}) {
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
    async migrate() {
        for (const migration of MIGRATIONS) {
            await this.client.execute(migration);
        }
    }
    /**
     * Close the database
     */
    async close() {
        // libsql client doesn't have explicit close, but we could clean up resources
    }
    // ============================================================================
    // Journal Entries
    // ============================================================================
    async addJournalEntry(entry) {
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
    async getJournalEntry(id) {
        const result = await this.client.execute({
            sql: 'SELECT * FROM journal_entries WHERE id = ?',
            args: [id],
        });
        if (result.rows.length === 0)
            return null;
        return this.rowToJournalEntry(result.rows[0]);
    }
    async getJournalEntries(limit = 100, offset = 0) {
        const result = await this.client.execute({
            sql: 'SELECT * FROM journal_entries ORDER BY timestamp DESC LIMIT ? OFFSET ?',
            args: [limit.toString(), offset.toString()],
        });
        return result.rows.map((row) => this.rowToJournalEntry(row));
    }
    async getJournalEntriesByMood(mood, limit = 50) {
        const result = await this.client.execute({
            sql: `
        SELECT * FROM journal_entries
        WHERE moodTags LIKE ?
        ORDER BY timestamp DESC
        LIMIT ?
      `,
            args: [`%${mood}%`, limit.toString()],
        });
        return result.rows.map((row) => this.rowToJournalEntry(row));
    }
    async getRecentJournalEntries(days = 7, limit = 100) {
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
    rowToJournalEntry(row) {
        return {
            id: row.id,
            filename: row.filename,
            timestamp: row.timestamp,
            source: row.source,
            device: row.device,
            sessionId: row.sessionId,
            moodTags: row.moodTags,
            energyLevel: row.energyLevel,
            context: row.context,
            content: row.content,
            policy: row.policy,
            embedding: row.embedding ? JSON.parse(row.embedding.toString()) : undefined,
            createdAt: row.createdAt,
        };
    }
    // ============================================================================
    // Sessions
    // ============================================================================
    async createSession(policy) {
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
    async endSession(id) {
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
    async cancelSession(id) {
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
    async getSession(id) {
        const result = await this.client.execute({
            sql: 'SELECT * FROM sessions WHERE id = ?',
            args: [id],
        });
        if (result.rows.length === 0)
            return null;
        return this.rowToSession(result.rows[0]);
    }
    async getActiveSession() {
        const result = await this.client.execute({
            sql: 'SELECT * FROM sessions WHERE status = ? ORDER BY startedAt DESC LIMIT 1',
            args: ['active'],
        });
        if (result.rows.length === 0)
            return null;
        return this.rowToSession(result.rows[0]);
    }
    async getRecentSessions(limit = 20) {
        const result = await this.client.execute({
            sql: 'SELECT * FROM sessions ORDER BY startedAt DESC LIMIT ?',
            args: [limit.toString()],
        });
        return result.rows.map((row) => this.rowToSession(row));
    }
    rowToSession(row) {
        return {
            id: row.id,
            policy: row.policy,
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            status: row.status,
        };
    }
    // ============================================================================
    // Event Log
    // ============================================================================
    async logEvent(type, payload, sessionId) {
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
    async getEvents(sessionId, limit = 100) {
        let sql = 'SELECT * FROM event_log';
        const args = [];
        if (sessionId) {
            sql += ' WHERE sessionId = ?';
            args.push(sessionId);
        }
        sql += ' ORDER BY createdAt DESC LIMIT ?';
        args.push(limit.toString());
        const result = await this.client.execute({ sql, args });
        return result.rows.map((row) => this.rowToEventLog(row));
    }
    async getRecentEvents(limit = 50) {
        const result = await this.client.execute({
            sql: 'SELECT * FROM event_log ORDER BY createdAt DESC LIMIT ?',
            args: [limit.toString()],
        });
        return result.rows.map((row) => this.rowToEventLog(row));
    }
    rowToEventLog(row) {
        return {
            id: row.id,
            sessionId: row.sessionId,
            type: row.type,
            payload: row.payload,
            createdAt: row.createdAt,
        };
    }
    // ============================================================================
    // Statistics
    // ============================================================================
    async getStats() {
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
        const recentMoodDistribution = {};
        for (const row of moodResult.rows) {
            const tags = row.moodTags.split(',').map((t) => t.trim());
            for (const tag of tags) {
                if (tag) {
                    recentMoodDistribution[tag] = (recentMoodDistribution[tag] || 0) + row.count;
                }
            }
        }
        return {
            totalEntries: entriesResult.rows[0]?.count || 0,
            totalSessions: totalSessionsResult.rows[0]?.count || 0,
            activeSessions: sessionsResult.rows[0]?.count || 0,
            eventsLogged: eventsResult.rows[0]?.count || 0,
            recentMoodDistribution,
        };
    }
    /**
     * Get database path
     */
    getDbPath() {
        return this.dbPath;
    }
}
/**
 * Create a store with default configuration
 */
export function createStore(config) {
    const store = new HarmonStore(config);
    // Auto-migrate
    store.migrate().catch(console.error);
    return store;
}
//# sourceMappingURL=index.js.map