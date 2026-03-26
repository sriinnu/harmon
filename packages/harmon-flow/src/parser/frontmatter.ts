/**
 * I normalize markdown frontmatter defaults first and then let Zod enforce the
 * declared contract so invalid journal metadata fails loudly.
 */

import {
  JournalEntryFrontmatterSchema,
  type JournalEntryFrontmatter,
} from '../types.js';

/**
 * I apply defaults only to missing values and preserve caller-supplied data so
 * schema validation can reject invalid frontmatter instead of silently casting it.
 */
export function parseJournalEntryFrontmatter(
  data: Record<string, unknown>,
): JournalEntryFrontmatter {
  return JournalEntryFrontmatterSchema.parse({
    ts: normalizeTimestamp(data.ts),
    source: data.source ?? 'cli',
    device: data.device ?? 'linux',
    sessionId: data.sessionId,
    policy: data.policy,
    moodTags: data.moodTags ?? [],
    energyLevel: data.energyLevel,
    context: data.context,
  });
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === 'undefined' ? new Date().toISOString() : (value as string);
}
