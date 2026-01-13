/**
 * Harmon Store - SQLite persistence layer with migrations
 */
import { type Client } from '@libsql/client';
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
export interface HarmonStoreConfig {
    dbPath?: string;
    memory?: boolean;
}
export declare class HarmonStore {
    private client;
    private dbPath;
    constructor(config?: HarmonStoreConfig);
    /**
     * Run migrations
     */
    migrate(): Promise<void>;
    /**
     * Close the database
     */
    close(): Promise<void>;
    addJournalEntry(entry: Omit<JournalEntry, 'id' | 'createdAt'>): Promise<string>;
    getJournalEntry(id: string): Promise<JournalEntry | null>;
    getJournalEntries(limit?: number, offset?: number): Promise<JournalEntry[]>;
    getJournalEntriesByMood(mood: string, limit?: number): Promise<JournalEntry[]>;
    getRecentJournalEntries(days?: number, limit?: number): Promise<JournalEntry[]>;
    private rowToJournalEntry;
    createSession(policy: string): Promise<string>;
    endSession(id: string): Promise<void>;
    cancelSession(id: string): Promise<void>;
    getSession(id: string): Promise<Session | null>;
    getActiveSession(): Promise<Session | null>;
    getRecentSessions(limit?: number): Promise<Session[]>;
    private rowToSession;
    logEvent(type: string, payload: Record<string, unknown>, sessionId?: string): Promise<string>;
    getEvents(sessionId?: string, limit?: number): Promise<EventLog[]>;
    getRecentEvents(limit?: number): Promise<EventLog[]>;
    private rowToEventLog;
    getStats(): Promise<{
        totalEntries: number;
        totalSessions: number;
        activeSessions: number;
        eventsLogged: number;
        recentMoodDistribution: Record<string, number>;
    }>;
    /**
     * Get database path
     */
    getDbPath(): string;
}
/**
 * Create a store with default configuration
 */
export declare function createStore(config?: HarmonStoreConfig): HarmonStore;
//# sourceMappingURL=index.d.ts.map