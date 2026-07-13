/**
 * Markdown Parser - Parse harmon-flow journal entries
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
import type { JournalEntry, JournalEntryFrontmatter } from '../types.js';
import { parseJournalEntryFrontmatter } from './frontmatter.js';

const DEFAULT_FLOW_DIR = '.harmonic-flow';

export interface FlowDirectoryConfig {
  path: string;
  recursive?: boolean;
}

export class MarkdownParser {
  private flowDir: string;

  constructor(config: FlowDirectoryConfig) {
    this.flowDir = path.resolve(config.path);
  }

  /**
   * Parse a single markdown file into a JournalEntry
   */
  parseFile(filename: string): JournalEntry | null {
    const filepath = path.join(this.flowDir, filename);

    if (!fs.existsSync(filepath)) {
      return null;
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const parsed = matter(content);

    let frontmatter: JournalEntryFrontmatter;
    try {
      frontmatter = this.parseFrontmatter(parsed.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown frontmatter error';
      throw new Error(`Invalid journal frontmatter in ${filename}: ${message}`);
    }

    // Extract mood tags and energy from content if not in frontmatter
    const contentMoodTags = this.extractMoodTags(parsed.content);
    const contentEnergy = this.extractEnergyLevel(parsed.content);

    return {
      id: this.extractIdFromFilename(filename) || uuidv4(),
      filename,
      timestamp: new Date(frontmatter.ts),
      source: frontmatter.source,
      device: frontmatter.device,
      sessionId: frontmatter.sessionId,
      policy: frontmatter.policy,
      moodTags: frontmatter.moodTags || contentMoodTags,
      energyLevel: frontmatter.energyLevel || contentEnergy,
      context: frontmatter.context,
      content: parsed.content,
    };
  }

  /**
   * Parse frontmatter with defaults
   */
  private parseFrontmatter(data: Record<string, unknown>): JournalEntryFrontmatter {
    return parseJournalEntryFrontmatter(data);
  }

  /**
   * Scan directory for all markdown entries
   */
  scanDirectory(): JournalEntry[] {
    if (!fs.existsSync(this.flowDir)) {
      return [];
    }

    const entries: JournalEntry[] = [];
    const files = this.scanFiles(this.flowDir);

    for (const file of files) {
      // One malformed journal file must not take down every journal/graph
      // surface — skip it and keep scanning.
      try {
        const entry = this.parseFile(path.relative(this.flowDir, file));
        if (entry) {
          entries.push(entry);
        }
      } catch (error) {
        console.error(
          `[harmon-flow] Skipping unreadable journal entry ${file}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Sort by timestamp
    entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return entries;
  }

  /**
   * Scan files recursively
   */
  private scanFiles(dir: string): string[] {
    const files: string[] = [];

    const traverse = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir);

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue; // broken symlink or race-deleted file
        }

        if (stat.isDirectory()) {
          traverse(fullPath);
        } else if (entry.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    };

    traverse(dir);
    return files;
  }

  /**
   * Extract mood tags from content (looking for **Mood:** or similar patterns)
   */
  private extractMoodTags(content: string): string[] {
    const moodPatterns = [
      /\*\*Mood:\*\*\s*([^\n]+)/gi,
      /mood[:\s]+([^\n]+)/gi,
    ];

    const moods: string[] = [];

    for (const pattern of moodPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const moodList = match[1].split(/[,\s]+/).map((m) => m.trim().toLowerCase());
        moods.push(...moodList.filter((m) => m.length > 0));
      }
    }

    return [...new Set(moods)];
  }

  /**
   * Extract energy level from content
   */
  private extractEnergyLevel(content: string): 'low' | 'medium' | 'high' | undefined {
    const energyLower = content.toLowerCase();

    if (energyLower.includes('low energy') || energyLower.includes('tired') || energyLower.includes('drained')) {
      return 'low';
    }
    if (energyLower.includes('high energy') || energyLower.includes('energetic') || energyLower.includes('excited')) {
      return 'high';
    }
    if (energyLower.includes('medium') || energyLower.includes('moderate') || energyLower.includes('balanced')) {
      return 'medium';
    }

    return undefined;
  }

  /**
   * Extract ID from filename (format: YYYY-MM-DDTHH-MM-SS-uuid.md)
   */
  private extractIdFromFilename(filename: string): string | null {
    const match = filename.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-(.+)\.md$/);
    return match ? match[1] : null;
  }

  /**
   * Write a new journal entry
   */
  writeEntry(entry: Omit<JournalEntry, 'id' | 'filename'>): string {
    const id = uuidv4();
    const timestamp = entry.timestamp.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${timestamp}-${id}.md`;

    const frontmatter = {
      ts: entry.timestamp.toISOString(),
      source: entry.source,
      device: entry.device,
      sessionId: entry.sessionId,
      policy: entry.policy,
      moodTags: entry.moodTags,
      energyLevel: entry.energyLevel,
      context: entry.context,
    };

    const fileContent = matter.stringify(entry.content, frontmatter);
    const filepath = path.join(this.flowDir, filename);

    // Ensure directory exists
    if (!fs.existsSync(this.flowDir)) {
      fs.mkdirSync(this.flowDir, { recursive: true });
    }

    fs.writeFileSync(filepath, fileContent);

    return filename;
  }

  /**
   * Get flow directory path
   */
  getFlowDir(): string {
    return this.flowDir;
  }
}

/**
 * Create a parser for the default .harmonic-flow directory
 */
export function createFlowParser(flowDir?: string): MarkdownParser {
  return new MarkdownParser({
    path: flowDir || DEFAULT_FLOW_DIR,
  });
}
