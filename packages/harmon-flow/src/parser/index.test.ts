import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MarkdownParser } from './index.js';

describe('MarkdownParser', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('applies defaults for missing frontmatter fields', () => {
    const flowDir = createFlowDir(tempDirs);
    writeEntry(
      flowDir,
      'entry.md',
      `---
ts: 2026-03-26T10:00:00.000Z
---
Calm start`,
    );

    const entry = new MarkdownParser({ path: flowDir }).parseFile('entry.md');

    expect(entry).toMatchObject({
      source: 'cli',
      device: 'linux',
      moodTags: [],
      timestamp: new Date('2026-03-26T10:00:00.000Z'),
    });
  });

  it('rejects invalid frontmatter instead of silently casting it', () => {
    const flowDir = createFlowDir(tempDirs);
    writeEntry(
      flowDir,
      'invalid.md',
      `---
ts: 2026-03-26T10:00:00.000Z
source: unsupported
moodTags:
  - focused
---
Bad metadata`,
    );

    const parser = new MarkdownParser({ path: flowDir });
    expect(() => parser.parseFile('invalid.md')).toThrow(
      'Invalid journal frontmatter in invalid.md',
    );
  });

  it('sorts scanned entries by timestamp', () => {
    const flowDir = createFlowDir(tempDirs);
    writeEntry(
      flowDir,
      'late.md',
      `---
ts: 2026-03-26T11:00:00.000Z
---
Later`,
    );
    writeEntry(
      flowDir,
      'early.md',
      `---
ts: 2026-03-26T09:00:00.000Z
---
Earlier`,
    );

    const entries = new MarkdownParser({ path: flowDir }).scanDirectory();

    expect(entries.map((entry) => entry.content.trim())).toEqual(['Earlier', 'Later']);
  });
});

function createFlowDir(tempDirs: string[]): string {
  const flowDir = fs.mkdtempSync(path.join(tmpdir(), 'harmon-flow-'));
  tempDirs.push(flowDir);
  return flowDir;
}

function writeEntry(flowDir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(flowDir, filename), content, 'utf8');
}
