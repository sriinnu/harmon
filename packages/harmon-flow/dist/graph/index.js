/**
 * Pattern Graph - Build and query graph-based patterns from journal entries
 */
export class PatternGraphBuilder {
    graph;
    entries;
    constructor(entries) {
        this.entries = entries;
        this.graph = {
            nodes: new Map(),
            edges: new Map(),
            embeddings: new Map(),
        };
    }
    /**
     * Build the complete pattern graph from entries
     */
    build() {
        // Clear existing graph
        this.graph = {
            nodes: new Map(),
            edges: new Map(),
            embeddings: new Map(),
        };
        // Build nodes and edges for each entry
        for (const entry of this.entries) {
            this.addEntryNodes(entry);
            this.addEntryEdges(entry);
        }
        // Calculate edge weights
        this.normalizeEdgeWeights();
        return this.graph;
    }
    /**
     * Add nodes for an entry
     */
    addEntryNodes(entry) {
        // Mood nodes
        for (const mood of entry.moodTags) {
            this.addNode('mood', mood, {
                moods: [mood],
                entryCount: 1,
            });
        }
        // Energy node
        if (entry.energyLevel) {
            this.addNode('energy', entry.energyLevel, {
                level: entry.energyLevel,
                entryCount: 1,
            });
            // Connect mood to energy
            for (const mood of entry.moodTags) {
                this.addEdge(`mood:${mood}`, `energy:${entry.energyLevel}`, 'has_energy', 1);
            }
        }
        // Time node
        if (entry.context?.timeOfDay) {
            this.addNode('time', entry.context.timeOfDay, {
                timeOfDay: entry.context.timeOfDay,
                entryCount: 1,
            });
            for (const mood of entry.moodTags) {
                this.addEdge(`time:${entry.context.timeOfDay}`, `mood:${mood}`, 'commonly_mood', 1);
            }
        }
        // Activity node
        if (entry.context?.activity) {
            this.addNode('activity', entry.context.activity, {
                activity: entry.context.activity,
                entryCount: 1,
            });
            for (const mood of entry.moodTags) {
                this.addEdge(`activity:${entry.context.activity}`, `mood:${mood}`, 'evokes_mood', 1);
            }
        }
        // Device node
        this.addNode('device', entry.device, {
            device: entry.device,
            entryCount: 1,
        });
        // Source node
        this.addNode('source', entry.source, {
            source: entry.source,
            entryCount: 1,
        });
    }
    /**
     * Add edges for an entry (temporal relationships)
     */
    addEntryEdges(entry) {
        // Find previous entry for temporal transitions
        const prevEntry = this.findPreviousEntry(entry);
        if (prevEntry) {
            // Mood transitions
            for (const mood of entry.moodTags) {
                for (const prevMood of prevEntry.moodTags) {
                    this.addEdge(`mood:${prevMood}`, `mood:${mood}`, 'transitions_to', 1);
                }
            }
            // Energy transitions
            if (entry.energyLevel && prevEntry.energyLevel) {
                this.addEdge(`energy:${prevEntry.energyLevel}`, `energy:${entry.energyLevel}`, 'changes_to', 1);
            }
        }
        // Mood co-occurrence
        const moods = entry.moodTags;
        for (let i = 0; i < moods.length; i++) {
            for (let j = i + 1; j < moods.length; j++) {
                this.addEdge(`mood:${moods[i]}`, `mood:${moods[j]}`, 'co_occurs_with', 1);
            }
        }
    }
    /**
     * Add a node to the graph
     */
    addNode(type, label, properties) {
        const key = this.getNodeKey({ type, label });
        const existing = this.graph.nodes.get(key);
        if (existing) {
            existing.weight += 1;
            // Merge properties
            if (existing.properties.entryCount) {
                existing.properties.entryCount = existing.properties.entryCount + 1;
            }
        }
        else {
            this.graph.nodes.set(key, {
                id: key,
                type: type,
                label,
                properties,
                weight: 1,
            });
        }
    }
    /**
     * Add an edge to the graph
     */
    addEdge(source, target, relationship, weight) {
        const edgeKey = `${source}::${relationship}::${target}`;
        const existing = this.graph.edges.get(edgeKey);
        if (existing) {
            existing.weight += weight;
            existing.count += 1;
        }
        else {
            this.graph.edges.set(edgeKey, {
                source,
                target,
                relationship,
                weight,
                count: 1,
            });
        }
    }
    /**
     * Normalize edge weights by count
     */
    normalizeEdgeWeights() {
        for (const edge of this.graph.edges.values()) {
            edge.weight = edge.weight / edge.count;
        }
    }
    /**
     * Find the previous entry in chronological order
     */
    findPreviousEntry(current) {
        let prev = null;
        for (const entry of this.entries) {
            if (entry.timestamp < current.timestamp) {
                prev = entry;
            }
            else {
                break;
            }
        }
        return prev;
    }
    getNodeKey(node) {
        return `${node.type}:${node.label}`;
    }
    /**
     * Get the built graph
     */
    getGraph() {
        return this.graph;
    }
}
/**
 * Pattern Detector - Extract high-level patterns from the graph
 */
export class PatternDetector {
    graph;
    entries;
    constructor(graph, entries) {
        this.graph = graph;
        this.entries = entries;
    }
    /**
     * Detect time-based patterns
     */
    detectTimePatterns() {
        const timePatterns = new Map();
        // Group entries by time of day
        for (const entry of this.entries) {
            const timeOfDay = entry.context?.timeOfDay || 'unknown';
            const existing = timePatterns.get(timeOfDay);
            if (existing) {
                existing.commonMoods.push(...entry.moodTags);
                existing.frequency += 1;
                if (entry.energyLevel) {
                    // Track most common energy
                }
            }
            else {
                timePatterns.set(timeOfDay, {
                    timeOfDay,
                    commonMoods: [...entry.moodTags],
                    commonEnergy: entry.energyLevel || 'medium',
                    avgSessionDuration: entry.policy?.durationMs ? entry.policy.durationMs / 60000 : 0,
                    frequency: 1,
                });
            }
        }
        // Process patterns
        const results = [];
        for (const [_, pattern] of timePatterns) {
            // Count mood frequencies
            const moodCounts = new Map();
            for (const mood of pattern.commonMoods) {
                moodCounts.set(mood, (moodCounts.get(mood) || 0) + 1);
            }
            const sortedMoods = [...moodCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([mood]) => mood);
            results.push({
                ...pattern,
                commonMoods: sortedMoods,
            });
        }
        return results;
    }
    /**
     * Detect mood-energy transition patterns
     */
    detectMoodEnergyPatterns() {
        const patterns = [];
        const moodEnergyMap = new Map();
        for (const entry of this.entries) {
            const key = `${entry.energyLevel || 'unknown'}:${entry.moodTags.join(',')}`;
            if (!moodEnergyMap.has(key)) {
                moodEnergyMap.set(key, {
                    mood: entry.moodTags[0] || 'calm',
                    energy: entry.energyLevel || 'medium',
                    transitionProbability: 0,
                    commonActivities: [],
                });
            }
        }
        // Calculate transitions
        for (let i = 1; i < this.entries.length; i++) {
            const curr = this.entries[i];
            const prev = this.entries[i - 1];
            if (curr.energyLevel && prev.energyLevel && curr.energyLevel !== prev.energyLevel) {
                const key = `${prev.energyLevel}:${prev.moodTags.join(',')}`;
                const pattern = moodEnergyMap.get(key);
                if (pattern) {
                    pattern.nextMood = curr.moodTags[0];
                    pattern.transitionProbability += 0.1;
                }
            }
            if (curr.context?.activity) {
                const key = `${curr.energyLevel || 'medium'}:${curr.moodTags.join(',')}`;
                const pattern = moodEnergyMap.get(key);
                if (pattern && !pattern.commonActivities.includes(curr.context.activity)) {
                    pattern.commonActivities.push(curr.context.activity);
                }
            }
        }
        return [...moodEnergyMap.values()];
    }
    /**
     * Cluster similar policies to find patterns
     */
    detectPolicyPatterns() {
        const clusters = new Map();
        for (const entry of this.entries) {
            if (!entry.policy)
                continue;
            // Create a simple hash based on policy structure
            const policyHash = this.hashPolicy(entry.policy);
            const key = `${policyHash}`;
            if (!clusters.has(key)) {
                clusters.set(key, {
                    policyHash,
                    moodTags: entry.moodTags,
                    energyLevel: entry.energyLevel,
                    count: 0,
                    avgDuration: 0,
                    hardConstraints: entry.policy.hard || {},
                    softWeights: entry.policy.soft || {},
                });
            }
            const cluster = clusters.get(key);
            cluster.count += 1;
            cluster.avgDuration =
                (cluster.avgDuration * (cluster.count - 1) + (entry.policy.durationMs || 0)) / cluster.count;
        }
        return [...clusters.values()]
            .filter((c) => c.count >= 2)
            .map((c) => ({
            patternId: c.policyHash,
            moodTags: c.moodTags,
            energyLevel: c.energyLevel,
            typicalDuration: c.avgDuration,
            hardConstraints: c.hardConstraints,
            softWeights: c.softWeights,
            usageCount: c.count,
        }));
    }
    /**
     * Simple hash function for policy objects
     */
    hashPolicy(policy) {
        const str = JSON.stringify(policy, Object.keys(policy).sort());
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
    /**
     * Get all detected patterns
     */
    getAllPatterns() {
        return {
            timePatterns: this.detectTimePatterns(),
            moodEnergyPatterns: this.detectMoodEnergyPatterns(),
            policyPatterns: this.detectPolicyPatterns(),
        };
    }
}
/**
 * Suggestion Engine - Generate suggestions based on patterns
 */
export class SuggestionEngine {
    graph;
    entries;
    timePatterns;
    moodEnergyPatterns;
    policyPatterns;
    constructor(graph, entries) {
        this.graph = graph;
        this.entries = entries;
        const detector = new PatternDetector(graph, entries);
        const patterns = detector.getAllPatterns();
        this.timePatterns = patterns.timePatterns;
        this.moodEnergyPatterns = patterns.moodEnergyPatterns;
        this.policyPatterns = patterns.policyPatterns;
    }
    /**
     * Generate suggestions based on current context
     */
    suggest(currentMood, energy, timeOfDay) {
        const suggestions = [];
        // Find matching time pattern
        const timePattern = timeOfDay
            ? this.timePatterns.find((p) => p.timeOfDay === timeOfDay)
            : undefined;
        // Suggest based on mood-energy combination
        const moodEnergyMatch = this.moodEnergyPatterns.find((p) => p.mood === currentMood[0] && p.energy === energy);
        if (moodEnergyMatch?.nextMood) {
            suggestions.push({
                id: `shift-${Date.now()}`,
                type: 'mood_shift',
                confidence: moodEnergyMatch.transitionProbability,
                reasoning: `Based on your patterns, ${currentMood[0]} with ${energy} energy often leads to ${moodEnergyMatch.nextMood}`,
                moodTags: [moodEnergyMatch.nextMood],
                basedOnEntries: this.entries.slice(-10).map((e) => e.id),
            });
        }
        // Find matching policy pattern
        const policyMatch = this.policyPatterns.find((p) => p.moodTags.some((m) => currentMood.includes(m)) &&
            (!p.energyLevel || p.energyLevel === energy));
        if (policyMatch) {
            suggestions.push({
                id: `policy-${Date.now()}`,
                type: 'policy',
                confidence: Math.min(0.9, policyMatch.usageCount / 10),
                reasoning: `You often use this policy pattern when feeling ${currentMood.join(', ')}`,
                suggestedPolicy: {
                    version: 1,
                    mode: 'custom',
                    durationMs: policyMatch.typicalDuration,
                    hard: policyMatch.hardConstraints,
                    soft: { weights: policyMatch.softWeights },
                },
                moodTags: currentMood,
                energyLevel: energy,
                basedOnEntries: this.entries.slice(-policyMatch.usageCount).map((e) => e.id),
            });
        }
        // Time-based suggestion
        if (timePattern && timePattern.commonMoods.length > 0) {
            suggestions.push({
                id: `time-${Date.now()}`,
                type: 'session',
                confidence: Math.min(0.7, timePattern.frequency / 5),
                reasoning: `During ${timeOfDay || 'this time'}, you often feel ${timePattern.commonMoods.slice(0, 3).join(', ')}`,
                moodTags: timePattern.commonMoods.slice(0, 3),
                energyLevel: timePattern.commonEnergy,
                basedOnEntries: this.entries.filter((e) => e.context?.timeOfDay === timeOfDay).map((e) => e.id),
            });
        }
        return suggestions.sort((a, b) => b.confidence - a.confidence);
    }
    /**
     * Get similar historical entries
     */
    findSimilarEntries(mood, energy, limit = 5) {
        const scored = this.entries.map((entry) => {
            let similarity = 0;
            // Mood overlap
            const moodOverlap = entry.moodTags.filter((m) => mood.includes(m)).length;
            similarity += moodOverlap / Math.max(entry.moodTags.length, mood.length);
            // Energy match
            if (energy && entry.energyLevel === energy) {
                similarity += 0.5;
            }
            return { entry, similarity };
        });
        return scored
            .filter((s) => s.similarity > 0)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }
    /**
     * Get pattern statistics
     */
    getStats() {
        return {
            totalEntries: this.entries.length,
            timePatterns: this.timePatterns.length,
            moodEnergyPatterns: this.moodEnergyPatterns.length,
            policyPatterns: this.policyPatterns.length,
            topMoodTags: this.getTopMoodTags(),
            topEnergyLevels: this.getTopEnergyLevels(),
        };
    }
    getTopMoodTags() {
        const counts = new Map();
        for (const entry of this.entries) {
            for (const mood of entry.moodTags) {
                counts.set(mood, (counts.get(mood) || 0) + 1);
            }
        }
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([mood, count]) => ({ mood, count }));
    }
    getTopEnergyLevels() {
        const counts = new Map();
        for (const entry of this.entries) {
            if (entry.energyLevel) {
                counts.set(entry.energyLevel, (counts.get(entry.energyLevel) || 0) + 1);
            }
        }
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([level, count]) => ({ level, count }));
    }
}
//# sourceMappingURL=index.js.map