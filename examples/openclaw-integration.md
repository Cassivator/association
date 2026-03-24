# OpenClaw Integration Example

This example shows how to use Association with OpenClaw's memory system.

## Setup

```typescript
import { createAssociation } from 'association';
import * as fs from 'fs';
import * as path from 'path';

// Create association instance pointing to OpenClaw's memory directory
const association = createAssociation({
  memoryDir: path.join(process.env.HOME, '.openclaw', 'workspace', 'memory'),
  similarityThreshold: 0.1,
  maxSurfacedMemories: 3,
});

await association.init();
```

## Processing Messages

```typescript
// When a message comes in, process it to surface relevant memories
async function handleMessage(content: string, metadata?: any) {
  const result = await association.process({
    content,
    metadata,
  });

  if (result.surfaced.length > 0) {
    console.log('Relevant memories surfaced:');
    for (const { memory, relevance, matchedKeywords } of result.surfaced) {
      console.log(`  [${relevance.toFixed(2)}] ${memory.content.slice(0, 100)}...`);
      console.log(`    Matched: ${matchedKeywords.join(', ')}`);
    }
  }

  return result;
}
```

## Integration with OpenClaw MEMORY.md

Association can work alongside OpenClaw's existing MEMORY.md system:

```typescript
// Parse MEMORY.md for initial memories
async function importFromMemoryMd() {
  const memoryPath = path.join(process.env.HOME, '.openclaw', 'workspace', 'MEMORY.md');
  const content = fs.readFileSync(memoryPath, 'utf-8');

  // Simple section-based parsing
  const sections = content.split(/^## /m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();

    if (body.length > 50) {
      await association.remember(body, {
        tags: [title.toLowerCase().replace(/[^a-z0-9]/g, '-')],
        importance: 0.7,
        source: 'MEMORY.md',
      });
    }
  }
}
```

## Using with Heartbeat

Add to your HEARTBEAT.md:

```markdown
## Memory Association Check
- Process recent messages through association
- Surface any relevant memories for current context
- Store important new learnings
```

Then in your heartbeat handler:

```typescript
// In heartbeat processing
const recentMessages = getRecentMessages(); // from session history
for (const msg of recentMessages.slice(-5)) {
  await association.process(msg);
}
```

## Example Output

```
User: "remember that sophie is building OriginOS"

Association stored:
  - Keywords: sophie, building, originos, remember
  - Importance: 0.65
  - Tags: [important, user-preference]

User: "what's sophie working on?"

Association surfaced:
  [0.82] remember that sophie is building OriginOS
    Matched: sophie, originos
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `memoryDir` | `./memories` | Directory to store memory files |
| `similarityThreshold` | `0.1` | Minimum relevance to surface |
| `maxSurfacedMemories` | `5` | Max memories per message |
| `compressionAgeDays` | `7` | Days before compression |
