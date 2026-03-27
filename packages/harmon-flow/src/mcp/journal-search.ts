/**
 * Journal search helpers for MCP-compatible knowledge tools.
 */

import type { JournalEntry } from '../types.js';

export interface JournalSearchResult {
  id: string;
  title: string;
  text: string;
  url: string;
}

export interface JournalFetchResult {
  id: string;
  metadata: Record<string, unknown>;
  text: string;
  title: string;
  url: string;
}

/**
 * I search parsed journal entries with a simple scoring model that favors exact
 * text hits, mood tags, and newer entries.
 */
export function searchJournalEntries(entries: JournalEntry[], query: string, limit = 5): JournalSearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, normalized) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.entry.timestamp.getTime() - left.entry.timestamp.getTime();
    })
    .slice(0, limit)
    .map(({ entry }) => ({
      id: entry.id,
      text: createSnippet(entry.content, normalized),
      title: buildEntryTitle(entry),
      url: getJournalEntryUrl(entry.id),
    }));
}

/**
 * I fetch a single entry in the shape expected by ChatGPT-compatible `fetch`.
 */
export function fetchJournalEntry(entries: JournalEntry[], id: string): JournalFetchResult | null {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    metadata: {
      energyLevel: entry.energyLevel ?? null,
      moodTags: entry.moodTags,
      timestamp: entry.timestamp.toISOString(),
    },
    text: entry.content,
    title: buildEntryTitle(entry),
    url: getJournalEntryUrl(entry.id),
  };
}

/**
 * I keep the journal URL stable for citations inside MCP clients.
 */
export function getJournalEntryUrl(id: string): string {
  return `harmon-flow://entry/${id}`;
}

function scoreEntry(entry: JournalEntry, query: string): number {
  let score = 0;
  const content = entry.content.toLowerCase();

  if (content.includes(query)) {
    score += 4;
  }

  for (const mood of entry.moodTags) {
    if (mood.toLowerCase().includes(query)) {
      score += 3;
    }
  }

  if (entry.energyLevel?.toLowerCase() === query) {
    score += 2;
  }

  if (entry.filename.toLowerCase().includes(query)) {
    score += 1;
  }

  return score;
}

function createSnippet(content: string, query: string): string {
  const normalized = content.toLowerCase();
  const matchIndex = normalized.indexOf(query);

  if (matchIndex === -1) {
    return content.slice(0, 240);
  }

  const start = Math.max(matchIndex - 80, 0);
  const end = Math.min(matchIndex + query.length + 120, content.length);
  const snippet = content.slice(start, end).trim();

  return `${start > 0 ? '...' : ''}${snippet}${end < content.length ? '...' : ''}`;
}

function buildEntryTitle(entry: JournalEntry): string {
  const mood = entry.moodTags.length > 0 ? ` ${entry.moodTags.join(', ')}` : '';
  return `${entry.timestamp.toISOString()}${mood}`.trim();
}
