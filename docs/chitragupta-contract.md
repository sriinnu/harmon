# Chitragupta Integration Contract

> How Claude Code (or any MCP-capable AI assistant) communicates with Chitragupta,
> what surfaces are exposed, and what data flows in each direction.

---

## Overview

Chitragupta is a persistent memory and agent orchestration layer that runs as an MCP server.
It gives AI assistants **memory across sessions**, **multi-agent deliberation**, **skill discovery**,
and **stigmergic knowledge sharing** (Akasha).

Claude Code connects to Chitragupta via the Model Context Protocol. Every tool call below
is a function the assistant can invoke during a conversation.

---

## 1. Memory Layer — What Chitragupta Remembers

### What I send TO Chitragupta

| Tool | What I send | When |
|------|-------------|------|
| `chitragupta_record_conversation` | `[{ role, content }]` conversation turns | Periodically during sessions to capture context |
| `episodic_record` | Description, error signature, file path, solution, tags | After fixing a bug, discovering a pattern, or learning something reusable |
| `akasha_deposit` | Knowledge content, type (solution/warning/pattern/correction/preference/shortcut), topic tags | After completing significant work worth sharing with future agents |
| `memory` (write/append) | Free-form text at global/project/agent scope | When persisting decisions, conventions, or facts |

### What Chitragupta sends BACK to me

| Tool | What I get back | When I ask |
|------|----------------|-----------|
| `chitragupta_recall` | Unified results across ALL memory layers (sessions, memory, knowledge graph, day files, akasha) | Natural language question about past work |
| `chitragupta_memory_search` | GraphRAG-backed project memory entries | Searching for past decisions, patterns, conventions |
| `episodic_recall` | Past episodes matching error pattern, file context, or tool name | When encountering an error that might have been seen before |
| `akasha_traces` | Warnings, corrections, solutions, patterns from past sessions | BEFORE modifying code that might have been problematic |
| `memory` (read/search) | Stored facts at global/project/agent scope | When needing persistent context |
| `chitragupta_context` | Global facts + project memory + recent session summaries | At session start for warm-up context |

### Memory Scopes

```
global    — shared across ALL projects (user preferences, identity)
project   — specific to this workspace (architecture decisions, conventions)
agent     — specific to this session (ephemeral working state)
```

---

## 2. Session Layer — Conversation History

### What I send

| Tool | What I send | Purpose |
|------|-------------|---------|
| `chitragupta_record_conversation` | `turns: [{ role: 'user'|'assistant', content: string }]` | Capture conversation for future recall |

### What I get back

| Tool | What I get back | Purpose |
|------|----------------|---------|
| `chitragupta_session_list` | Session IDs, titles, timestamps, turn counts | Browse past sessions |
| `chitragupta_session_show` | Full conversation of a session | Replay past work |
| `session` (search) | Sessions matching a query | Find relevant past conversations |
| `session` (branch) | New session branched from existing | Fork a conversation |

---

## 3. Knowledge Layer — Akasha (Stigmergic Shared Intelligence)

Akasha is a shared knowledge field. Agents deposit traces; other agents discover and reinforce them.

### Trace Types

| Type | When to deposit | Example |
|------|----------------|---------|
| `solution` | After solving a non-obvious problem | "Harmon daemon decomposition: DaemonContext interface pattern..." |
| `warning` | After discovering something dangerous | "SQLite concurrent writes can lose data without WAL mode" |
| `shortcut` | After finding a faster approach | "Use `pnpm exec vitest run` not `pnpm test` for single runs" |
| `pattern` | After identifying a reusable design | "Auto-refresh auth: check expiry 60s before, dedup with promise" |
| `correction` | After fixing a misconception | "Express v5 req.params.id is string\|string[], not string" |
| `preference` | After learning user/project preferences | "User prefers parallel agents, strict LOC limits, file-level docs" |

### Contract

```
I DEPOSIT:
  akasha_deposit({ content, type, topics[] })
  → Returns: trace ID (e.g. "aks-88b33150")

I QUERY:
  akasha_traces({ query, type?, limit? })
  → Returns: matching traces with content, type, topics, timestamps

LIFECYCLE:
  Traces persist across sessions and projects.
  Other agents (including future me) discover them via topic matching.
  High-value traces get reinforced; low-value traces decay.
```

---

## 4. Day Files — Daily Activity Journals

Chitragupta consolidates sessions into daily summaries.

| Tool | Direction | What |
|------|-----------|------|
| `chitragupta_day_list` | ← from Chitragupta | List of dates with activity |
| `chitragupta_day_show` | ← from Chitragupta | Full diary for a date (projects, sessions, tools, files) |
| `chitragupta_day_search` | ← from Chitragupta | Search across all day files |

I don't write day files directly — Chitragupta generates them from recorded sessions.

---

## 5. Handover Layer — Context Continuity

When approaching context limits or switching sessions:

| Tool | Direction | What |
|------|-----------|------|
| `chitragupta_handover` | ← from Chitragupta | Structured work-state summary (files modified, decisions, errors, commands) |
| `chitragupta_handover_since` | ← from Chitragupta | Incremental delta since last cursor |

This is NOT identity — it's work state. For identity, use `atman_report`.

---

## 6. Agent Orchestration — Sabha & Mesh

### Sabha (Multi-Agent Deliberation)

```
I SEND:
  sabha_deliberate({ proposal: "Should we refactor the auth module?", agents: [...] })

I GET BACK:
  Combined findings from specialized sub-agents:
  - memory    — recalls past decisions about auth
  - akasha    — checks for known issues
  - code      — searches codebase for patterns
  - reasoning — analyzes tradeoffs
  - reviewer  — evaluates quality
  - writer    — drafts content

7 local actors always available. No external calls needed.
```

### Mesh (P2P Actor Network)

| Tool | Direction | What |
|------|-----------|------|
| `mesh_status` | ← | Actor count, peer count, connectivity state |
| `mesh_topology` | ← | Full actor map with capabilities and locations |
| `mesh_peers` | ← | Peer list with liveness (alive/suspect/dead) |
| `mesh_gossip` | ← | Gossip protocol state |
| `mesh_spawn` | → | Create new actor with capabilities |
| `mesh_send` | → | Fire-and-forget message to actor |
| `mesh_ask` | →← | Request-reply with timeout |
| `mesh_find_capability` | ← | Find actor that handles a capability |

### Samiti (Ambient Channels)

| Tool | Direction | What |
|------|-----------|------|
| `samiti_channels` | ← | List channels + recent messages |
| `samiti_broadcast` | → | Broadcast to a topic channel (#security, #performance, etc.) |

---

## 7. Skill Ecosystem

### What I can query

| Tool | What I get | Purpose |
|------|-----------|---------|
| `skills_list` | All registered skills with tags and capabilities | Browse available skills |
| `skills_find` | Ranked matches for a natural language query (TVM, <1ms) | Find the right skill for a task |
| `skills_recommend` | Best skill + readiness assessment for a task | "Should I use skill X or learn a new one?" |
| `skills_ecosystem` | Stats: total skills, tag distribution, lifecycle stages | Ecosystem overview |
| `skills_health` | Pancha Kosha health score (5 sheaths: structural, runtime, docs, wisdom, mastery) | Assess skill quality |

### What I can do

| Tool | What I send | Purpose |
|------|-------------|---------|
| `skills_learn` | Task description → triggers Shiksha pipeline | Auto-generate a new skill from 5 tiers |
| `skills_scan` | Skill content → Suraksha security scan | Check skill for malicious patterns |

---

## 8. Codebase Tools

Chitragupta exposes filesystem and code intelligence tools:

| Tool | Direction | What |
|------|-----------|------|
| `read` | ← | Read file with line numbers (supports ranges) |
| `write` | → | Create/overwrite file (auto-creates directories) |
| `edit` | → | Surgical text replacement (find/replace) |
| `diff` | ← | Unified diff between files or file vs. content |
| `find` | ← | Glob-based file search |
| `grep` | ← | Regex search with context lines |
| `ls` | ← | Directory listing (recursive with depth control) |
| `watch` | ← | File change events over a time window |
| `bash` | →← | Execute shell command, get stdout/stderr |
| `ast_query` | ← | Structured AST: imports, exports, classes, functions, symbol search |
| `repo_map` | ← | Repository structure overview |
| `project_analysis` | ← | Full project report: files, frameworks, dependencies, git state |

---

## 9. AI Completion & Delegation

| Tool | Direction | What |
|------|-----------|------|
| `chitragupta_completion` | →← | Send prompt to LLM via smart routing (local CLI → Ollama → API) |
| `chitragupta_prompt` | →← | Delegate task to Chitragupta's agent (async, returns jobId if >45s) |
| `chitragupta_prompt_status` | ← | Check status of long-running prompt job |
| `coding_agent` | →← | Delegate coding task to specialized agent |

### Smart routing order
```
1. Local CLI provider (if available)
2. Local Ollama (if running)
3. Cloud API (Anthropic/OpenAI, requires key)
```

---

## 10. Introspection

| Tool | What I get | Purpose |
|------|-----------|---------|
| `atman_report` | Consciousness state, identity, tool mastery, behavioral tendencies, health | Self-report on agent state |
| `vasana_tendencies` | Crystallized behavioral patterns (Bayesian change-point detection) | What patterns has the agent settled into? |
| `health_status` | System health metrics | Is Chitragupta healthy? |
| `chitragupta_vidhis` | Learned procedures from session consolidation | What tool sequences have been extracted? |
| `chitragupta_consolidate` | Run Swapna consolidation on demand | Extract rules and procedures from recent sessions |
| `chitragupta_ui_extensions` | Widgets, keybinds, panels from skills | What UI is available? |

---

## 11. External API Integration (Tap)

| Tool | Direction | What |
|------|-----------|------|
| `tap_add` | → | Register OpenAPI/GraphQL/MCP source, generate skills |
| `tap_list` | ← | List registered API sources |
| `tap_describe` | ← | Describe a registered API |
| `tap_call` | →← | Call a registered API endpoint |
| `tap_auth` | → | Configure auth for an API source |

---

## 12. Sync (Cross-Machine)

| Tool | Direction | What |
|------|-----------|------|
| `chitragupta_sync_export` | → file | Export day files + memory to portable JSON snapshot |
| `chitragupta_sync_import` | ← file | Import snapshot with conflict strategy (safe/prefer-remote/prefer-local) |
| `chitragupta_sync_status` | ← | Last export/import metadata |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Claude Code (me)                       │
│                                                           │
│  I SEND:                         I RECEIVE:               │
│  ─────────                       ──────────               │
│  • Conversation turns            • Recalled memories      │
│  • Episodic memories             • Past sessions          │
│  • Akasha traces                 • Akasha warnings        │
│  • Memory writes                 • Day file summaries     │
│  • File edits/writes             • File contents          │
│  • Shell commands                • Command output         │
│  • Sabha proposals               • Multi-agent findings   │
│  • Mesh messages                 • Actor responses        │
│  • Skill learning tasks          • Generated skills       │
│  • LLM prompts                   • Completions            │
│  • Sync exports                  • Sync imports           │
└────────────────────┬────────────────────────────────────┘
                     │ MCP (stdio/HTTP)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    Chitragupta                            │
│                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Sessions │  │  Memory  │  │  Akasha  │               │
│  │ (turns)  │  │ (G/P/A)  │  │ (traces) │               │
│  └──────────┘  └──────────┘  └──────────┘               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Episodic │  │ Day Files│  │  Skills  │               │
│  │ (errors) │  │ (diaries)│  │  (TVM)   │               │
│  └──────────┘  └──────────┘  └──────────┘               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │  Sabha   │  │   Mesh   │  │   Tap    │               │
│  │ (agents) │  │  (P2P)   │  │  (APIs)  │               │
│  └──────────┘  └──────────┘  └──────────┘               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ Swapna   │  │ Vasana   │  │  Atman   │               │
│  │(consolidate)│(tendencies)│  │(identity)│               │
│  └──────────┘  └──────────┘  └──────────┘               │
└─────────────────────────────────────────────────────────┘
```

---

## Usage Protocol

### Session Start
```
1. chitragupta_context()           → Load persistent memory
2. akasha_traces({ query })        → Check for known issues in work area
3. episodic_recall({ file_context })→ Recall past problems with these files
```

### During Work
```
4. chitragupta_record_conversation() → Periodically capture turns
5. episodic_record()                 → After fixing bugs or discovering patterns
6. akasha_deposit()                  → After completing significant work
7. memory(write, project)            → After making architectural decisions
8. sabha_deliberate()                → When needing multiple perspectives
```

### Session End
```
9. chitragupta_record_conversation() → Final turn capture
10. akasha_deposit()                  → Summary trace of session work
11. episodic_record()                 → Key learnings
```

### Context Recovery (after compaction)
```
12. chitragupta_handover()           → Get work state summary
13. chitragupta_recall()             → Answer specific questions about past work
```

---

## Tool Count Summary

| Category | Tools | Direction |
|----------|-------|-----------|
| Memory (read) | 6 | ← from Chitragupta |
| Memory (write) | 4 | → to Chitragupta |
| Sessions | 4 | ← from Chitragupta |
| Akasha | 2 | bidirectional |
| Day Files | 3 | ← from Chitragupta |
| Handover | 2 | ← from Chitragupta |
| Sabha/Mesh | 10 | bidirectional |
| Skills | 7 | mostly ← |
| Codebase | 12 | bidirectional |
| AI/Delegation | 4 | → to Chitragupta |
| Introspection | 6 | ← from Chitragupta |
| Tap (APIs) | 5 | bidirectional |
| Sync | 3 | bidirectional |
| **Total** | **68** | |

---

## Security Boundaries

- **Memory is scoped**: global/project/agent isolation prevents cross-project leaks
- **Skills are scanned**: Suraksha security scan before execution
- **Mesh is local-first**: P2P actors are local by default; remote requires explicit config
- **Tap auth is per-source**: Each API registration manages its own credentials
- **Sync uses conflict strategies**: safe/prefer-remote/prefer-local for cross-machine merges
- **Episodic memories are file-scoped**: recalled by error pattern, not broadcasted
