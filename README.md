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
- **Progressive compression** - raw → summarized → distilled over time
- **Keyword indexing** - memories get tagged with keywords for fast retrieval
- **Context-aware** - only surfaces memories relevant to the current conversation

## How It Works

```
Incoming Message → Keyword Extraction → Semantic Search → Memory Association
                                                              ↓
                                                    Relevant memories surface
                                                    in agent's context
```

## Use Cases

- **Personal agents** - remember user preferences, past conversations, important context
- **Coding agents** - remember code patterns, past debugging sessions, project decisions
- **Research agents** - remember findings, sources, connections between topics

## Status

🚧 Work in progress - building the prototype

## License

MIT
