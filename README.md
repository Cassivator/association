# Association

Automatic semantic memory recall for AI agents. Memories that surface when you need them.

## The Problem

Current agent memory systems are either:
1. **Manual** - you have to explicitly search for memories
2. **Lost to context limits** - old conversations get compressed/summarized, losing detail
3. **Not contextual** - memories don't automatically surface when relevant topics come up

## The Solution

**Association** makes memory work more like human memory:
- **Automatic semantic recall** - relevant memories surface when topics come up
- **Fuzzy matching** - catches typos and partial matches (e.g., "orignos" → "OriginOS")
- **Progressive compression** - raw → summarized → distilled over time
- **Keyword indexing** - memories get tagged with keywords for fast retrieval
- **Context-aware** - only surfaces memories relevant to the current conversation

## How It Works

```
Incoming Message → Keyword Extraction → Fuzzy Matching → Memory Association
                                        ↓
                    Relevant memories surface in agent's context
```

## Installation

```bash
npm install @cassivator/association
```

## Quick Start

```typescript
import { createAssociation } from '@cassivator/association';

const association = createAssociation({
  memoryDir: './memories',
});

// Initialize (loads existing memories)
await association.init();

// Process a message - automatically surfaces relevant memories
const result = await association.process({ 
  content: "I'm working on the OSL compiler fix" 
});

console.log(result.surfaced); // Relevant past memories about OSL, compilers, etc

// Save something important
await association.remember("Sophie uses Europe/London timezone", { 
  tags: ['preference', 'user'] 
});
```

## Configuration

```typescript
createAssociation({
  // Where to store memory files (required)
  memoryDir: './memories',
  
  // Maximum memories to return per query (default: 5)
  maxSurfacedMemories: 5,
  
  // Minimum similarity to surface a memory (default: 0.05)
  // Lower = more results, higher = stricter matching
  similarityThreshold: 0.05,
  
  // Enable fuzzy matching for typos (default: true)
  enableFuzzy: true,
  
  // Fuzzy match threshold 0-1 (default: 0.75)
  // Lower = more permissive fuzzy matching
  fuzzyThreshold: 0.75,
  
  // Days before compressing old memories (default: 7)
  compressionAgeDays: 7,
});
```

## API

### `createAssociation(config?)`

Create a new Association instance.

### `association.init()`

Initialize the association system. Must be called before using other methods. Loads existing memories from disk.

### `association.process(message)`

Process a message and surface relevant memories.

```typescript
const result = await association.process({
  content: "working on the compiler",
  metadata: { sender: "user", channel: "general" }
});

result.surfaced  // Array of relevant memories
result.keywords  // Keywords extracted from message
result.memoryCreated  // Whether message was stored as new memory
```

### `association.remember(content, options?)`

Manually store a memory.

```typescript
const memory = await association.remember("Important fact", {
  tags: ['important'],
  source: 'conversation',
  importance: 0.8  // 0-1, affects retrieval order
});
```

### `association.search(query, limit?)`

Search memories by keyword.

```typescript
const results = await association.search("OriginOS", 10);
```

### `association.maintain()`

Run maintenance (compress old memories).

```typescript
const { compressed } = await association.maintain();
console.log(`Compressed ${compressed} memories`);
```

### `association.formatForContext(memories)`

Format surfaced memories for including in context.

```typescript
const text = association.formatForContext(result.surfaced);
// "**Relevant memories:**
//  - Sophie builds OriginOS..."
```

## Fuzzy Matching

Association uses Levenshtein distance and n-gram similarity to catch typos and partial matches:

```typescript
// Without fuzzy: "orignos" doesn't match "originos"
// With fuzzy: "orignos" → "originos" ✓

// Matches are indicated in the reason field:
result.surfaced[0].reason  // 'keyword-match' or 'fuzzy-match'
result.surfaced[0].matchedKeywords  // ['orignos~originos'] for fuzzy
```

## OpenClaw Integration

See `examples/openclaw-integration.ts` for a full example of integrating with OpenClaw agents:

- Sync with MEMORY.md
- Process heartbeat context
- Save and surface memories automatically

```typescript
import { syncFromMemoryDotMd, processMessage } from './examples/openclaw-integration.js';

// Import existing MEMORY.md
await syncFromMemoryDotMd();

// Process messages
const result = await processMessage("tell me about Sophie");
```

## Use Cases

- **Personal agents** - remember user preferences, past conversations, important context
- **Coding agents** - remember code patterns, past debugging sessions, project decisions
- **Research agents** - remember findings, sources, connections between topics
## Status

✅ 93 tests passing
✅ v0.1: keyword extraction, fuzzy matching, progressive compression
✅ v0.2: composite scoring (recency, importance, novelty), diversity selection
✅ v0.3: feedback tracking (Phase 1 of RL integration)

## Feedback API (v0.3)

Association can learn from feedback about which surfaced memories are actually useful:

```typescript
const result = await association.process({ content: "what do you know about Sophie?" });

// After using surfaced memories in your response, mark them as used
await association.markUsed(result.surfacedIds[0], true);

// If a memory was not relevant, mark as unused (noise signal)
await association.markUnused(result.surfacedIds[1]);

// Check performance metrics
const perf = association.getMemoryPerformance(memoryId);
console.log(perf.successRate); // How often this memory is useful

// Find memories that should be pruned
const prunable = association.findPrunableMemories();
```

This feedback enables future RL-based improvements:
- Adaptive scoring weights
- Automatic memory pruning
- Learning which memories to store

## Relevance Scoring (v0.2)

✅ 93 tests passing
✅ v0.1: keyword extraction, fuzzy matching, progressive compression
✅ v0.2: composite scoring (recency, importance, novelty), diversity selection

## Relevance Scoring (v0.2)

Association uses composite scoring to rank memories, addressing the "retrieval noise" problem:

- **Keyword match**: primary signal (how many keywords overlap)
- **Recency**: exponential decay with 7-day half-life (recent memories rank higher)
- **Importance**: weighted by memory.importance field
- **Novelty**: penalizes over-accessed memories

This helps surface the *right* memories, not just any matching memories.

## License

MIT

## Feedback API (v0.3)

Association can learn from feedback about which surfaced memories are actually useful:

```typescript
const result = await association.process({ content: "what do you know about Sophie?" });

// After using surfaced memories in your response, mark them as used
await association.markUsed(result.surfacedIds[0], true);

// If a memory was not relevant, mark as unused (noise signal)
await association.markUnused(result.surfacedIds[1]);

// Check performance metrics
const perf = association.getMemoryPerformance(memoryId);
console.log(perf.successRate); // How often this memory is useful

// Find memories that should be pruned
const prunable = association.findPrunableMemories();
```

This feedback enables future RL-based improvements:
- Adaptive scoring weights
- Automatic memory pruning
- Learning which memories to store

## Adaptive Scoring (v0.3 Phase 2)

Association can learn which scoring weights work best over time:

```typescript
import { createWeightAdapter } from '@cassivator/association';

const adapter = createWeightAdapter();

// Record which weight contributed to each surfaced memory
adapter.recordContribution({
  memoryId: 'mem-123',
  weight: 'recency',  // Which weight was most influential
  contribution: 0.7,  // How much this weight affected ranking (0-1)
  used: true,         // Whether the memory was actually used
});

// Get adapted weights after enough feedback
const newConfig = adapter.getConfig();
console.log(newConfig.recencyWeight);  // May have increased/decreased

// Check which weights are performing well
const stats = adapter.getStats();
console.log(stats.get('recency')?.successRate);
```

This enables:
- Automatic weight tuning based on actual usage
- Better retrieval quality over time
- Data-driven decisions about what matters

Note: Requires integration with the scorer to track which weight contributed most to each memory's ranking.
