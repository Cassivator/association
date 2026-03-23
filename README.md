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

✅ 67 tests passing  
🚧 Work in progress - core features stable

## License

MIT
