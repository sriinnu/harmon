/**
 * Markdown Parser - Parse harmon-flow journal entries
 */
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
const DEFAULT_FLOW_DIR = '.harmonic-flow';
export class MarkdownParser {
    flowDir;
    constructor(config) {
        this.flowDir = path.resolve(config.path);
    }
    /**
     * Parse a single markdown file into a JournalEntry
     */
    parseFile(filename) {
        const filepath = path.join(this.flowDir, filename);
        if (!fs.existsSync(filepath)) {
            return null;
        }
        const content = fs.readFileSync(filepath, 'utf-8');
        const parsed = matter(content);
        // Parse frontmatter
        const frontmatter = this.parseFrontmatter(parsed.data);
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
    parseFrontmatter(data) {
        return {
            ts: data.ts || new Date().toISOString(),
            source: data.source || 'cli',
            device: data.device || 'linux',
            sessionId: data.sessionId,
            policy: data.policy,
            moodTags: data.moodTags || [],
            energyLevel: data.energyLevel,
            context: data.context,
        };
    }
    /**
     * Scan directory for all markdown entries
     */
    scanDirectory() {
        if (!fs.existsSync(this.flowDir)) {
            return [];
        }
        const entries = [];
        const files = this.scanFiles(this.flowDir);
        for (const file of files) {
            const entry = this.parseFile(path.relative(this.flowDir, file));
            if (entry) {
                entries.push(entry);
            }
        }
        // Sort by timestamp
        entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        return entries;
    }
    /**
     * Scan files recursively
     */
    scanFiles(dir) {
        const files = [];
        const traverse = (currentDir) => {
            const entries = fs.readdirSync(currentDir);
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    traverse(fullPath);
                }
                else if (entry.endsWith('.md')) {
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
    extractMoodTags(content) {
        const moodPatterns = [
            /\*\*Mood:\*\*\s*([^\n]+)/gi,
            /mood[:\s]+([^\n]+)/gi,
        ];
        const moods = [];
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
    extractEnergyLevel(content) {
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
    extractIdFromFilename(filename) {
        const match = filename.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-(.+)\.md$/);
        return match ? match[1] : null;
    }
    /**
     * Write a new journal entry
     */
    writeEntry(entry) {
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
    getFlowDir() {
        return this.flowDir;
    }
}
/**
 * Create a parser for the default .harmonic-flow directory
 */
export function createFlowParser(flowDir) {
    return new MarkdownParser({
        path: flowDir || DEFAULT_FLOW_DIR,
    });
}
//# sourceMappingURL=index.js.map