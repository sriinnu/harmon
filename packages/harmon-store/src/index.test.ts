import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { HarmonStore } from './index.js';

describe('HarmonStore', () => {
  let store: HarmonStore;

  beforeEach(async () => {
    store = new HarmonStore({ memory: true });
    await store.migrate();
  });

  describe('journal entries', () => {
    it('adds and retrieves a journal entry', async () => {
      const id = await store.addJournalEntry({
        filename: 'test.md',
        timestamp: new Date().toISOString(),
        source: 'cli',
        device: 'macos',
        moodTags: 'calm, focused',
        content: 'Test entry',
      });
      expect(id).toBeTruthy();
      const entry = await store.getJournalEntry(id);
      expect(entry).not.toBeNull();
      expect(entry!.content).toBe('Test entry');
      expect(entry!.moodTags).toBe('calm, focused');
    });

    it('returns null for non-existent entry', async () => {
      expect(await store.getJournalEntry('nonexistent')).toBeNull();
    });

    it('lists entries ordered by timestamp desc', async () => {
      await store.addJournalEntry({
        filename: 'a.md', timestamp: '2024-01-01T00:00:00Z',
        source: 'cli', device: 'macos', moodTags: 'calm', content: 'First',
      });
      await store.addJournalEntry({
        filename: 'b.md', timestamp: '2024-01-02T00:00:00Z',
        source: 'cli', device: 'macos', moodTags: 'energized', content: 'Second',
      });
      const entries = await store.getJournalEntries(10, 0);
      expect(entries).toHaveLength(2);
      expect(entries[0].content).toBe('Second');
    });

    it('filters by mood tag', async () => {
      await store.addJournalEntry({
        filename: 'a.md', timestamp: new Date().toISOString(),
        source: 'cli', device: 'macos', moodTags: 'calm, focused', content: 'A',
      });
      await store.addJournalEntry({
        filename: 'b.md', timestamp: new Date().toISOString(),
        source: 'cli', device: 'macos', moodTags: 'energized', content: 'B',
      });
      const calm = await store.getJournalEntriesByMood('calm');
      expect(calm).toHaveLength(1);
      expect(calm[0].content).toBe('A');
    });
  });

  describe('sessions', () => {
    it('creates session with sess_ prefix', async () => {
      const id = await store.createSession('{"version":1}');
      expect(id).toMatch(/^sess_/);
    });

    it('ends a session', async () => {
      const id = await store.createSession('{"version":1}');
      await store.endSession(id);
      const session = await store.getSession(id);
      expect(session!.status).toBe('completed');
      expect(session!.endedAt).toBeTruthy();
    });

    it('cancels a session', async () => {
      const id = await store.createSession('{"version":1}');
      await store.cancelSession(id);
      const session = await store.getSession(id);
      expect(session!.status).toBe('cancelled');
    });

    it('gets active session', async () => {
      await store.createSession('{"version":1}');
      const active = await store.getActiveSession();
      expect(active).not.toBeNull();
      expect(active!.status).toBe('active');
    });

    it('returns null when no active session', async () => {
      expect(await store.getActiveSession()).toBeNull();
    });
  });

  describe('event log', () => {
    it('logs and retrieves events', async () => {
      await store.logEvent('test.event', { key: 'value' });
      const events = await store.getRecentEvents(10);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('test.event');
      expect(JSON.parse(events[0].payload)).toEqual({ key: 'value' });
    });

    it('filters events by sessionId', async () => {
      const sessId = await store.createSession('{}');
      await store.logEvent('a', {}, sessId);
      await store.logEvent('b', {});
      const sessEvents = await store.getEvents(sessId);
      expect(sessEvents).toHaveLength(1);
      expect(sessEvents[0].type).toBe('a');
    });
  });

  describe('settings', () => {
    it('sets and gets a setting', async () => {
      await store.setSetting('theme', 'dark');
      expect(await store.getSetting('theme')).toBe('dark');
    });

    it('returns null for missing setting', async () => {
      expect(await store.getSetting('nonexistent')).toBeNull();
    });

    it('upserts settings', async () => {
      await store.setSetting('k', 'v1');
      await store.setSetting('k', 'v2');
      expect(await store.getSetting('k')).toBe('v2');
    });

    it('deletes a setting', async () => {
      await store.setSetting('k', 'v');
      await store.deleteSetting('k');
      expect(await store.getSetting('k')).toBeNull();
    });
  });

  describe('stats', () => {
    it('returns zero counts on empty db', async () => {
      const stats = await store.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.totalSessions).toBe(0);
      expect(stats.activeSessions).toBe(0);
      expect(stats.eventsLogged).toBe(0);
    });
  });

  describe('filesystem hardening', () => {
    it('creates on-disk database files with owner-only permissions', async () => {
      const dir = fs.mkdtempSync(path.join(tmpdir(), 'harmon-store-'));
      const dbPath = path.join(dir, 'store.db');
      const diskStore = new HarmonStore({ dbPath });

      try {
        await diskStore.migrate();

        const stats = fs.statSync(dbPath);
        expect(stats.mode & 0o777).toBe(0o600);
      } finally {
        await diskStore.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
