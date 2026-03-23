/**
 * Memory storage for Association
 *
 * Handles persistence, retrieval, and lifecycle of memories.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Memory, AssociationConfig, AssociatedMemory } from './types.js';
import { flattenKeywords, keywordMatchScore } from './extractor.js';
import { isSimilarKeyword, fuzzyKeywordMatchScore } from './fuzzy.js';

/**
 * In-memory index for fast keyword lookup
 */
interface MemoryIndex {
  keywordToMemories: Map<string, Set<string>>;
  memories: Map<string, Memory>;
}

/**
 * Memory store implementation
 */
export class MemoryStore {
  private config: AssociationConfig;
  private index: MemoryIndex;
  private memoryDir: string;

  constructor(config: AssociationConfig) {
    this.config = config;
    this.memoryDir = config.memoryDir;
    this.index = {
      keywordToMemories: new Map(),
      memories: new Map(),
    };
  }

  /**
   * Initialize the store, loading existing memories
   */
  async init(): Promise<void> {
    // Ensure directory exists
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }

    // Load existing memories
    await this.loadMemories();
  }

  /**
   * Load memories from disk into the index
   */
  private async loadMemories(): Promise<void> {
    const files = fs.readdirSync(this.memoryDir)
      .filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(this.memoryDir, file), 'utf-8');
        const memory: Memory = JSON.parse(data);

        // Parse dates
        memory.createdAt = new Date(memory.createdAt);
        memory.lastAccessedAt = new Date(memory.lastAccessedAt);

        // Add to index
        this.index.memories.set(memory.id, memory);

        // Build keyword index
        for (const keyword of memory.keywords) {
          const lowerKeyword = keyword.toLowerCase();
          if (!this.index.keywordToMemories.has(lowerKeyword)) {
            this.index.keywordToMemories.set(lowerKeyword, new Set());
          }
          this.index.keywordToMemories.get(lowerKeyword)!.add(memory.id);
        }
      } catch (err) {
        console.error(`Failed to load memory ${file}:`, err);
      }
    }
  }

  /**
   * Generate a unique ID for a new memory
   */
  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Store a new memory
   */
  async store(
    content: string,
    keywords: string[],
    options?: {
      source?: string;
      importance?: number;
      tags?: string[];
    }
  ): Promise<Memory> {
    const memory: Memory = {
      id: this.generateId(),
      content,
      keywords: keywords.map(k => k.toLowerCase()),
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      compressionLevel: 0,
      importance: options?.importance ?? 0.5,
      tags: options?.tags ?? [],
      source: options?.source,
    };

    // Add to index
    this.index.memories.set(memory.id, memory);

    // Build keyword index
    for (const keyword of memory.keywords) {
      if (!this.index.keywordToMemories.has(keyword)) {
        this.index.keywordToMemories.set(keyword, new Set());
      }
      this.index.keywordToMemories.get(keyword)!.add(memory.id);
    }

    // Persist to disk
    await this.persist(memory);

    return memory;
  }

  /**
   * Persist a memory to disk
   */
  private async persist(memory: Memory): Promise<void> {
    const filePath = path.join(this.memoryDir, `${memory.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(memory, null, 2));
  }

  /**
   * Find memories matching given keywords
   */
  findMatchingMemories(
    keywords: string[],
    maxResults: number = this.config.maxSurfacedMemories
  ): AssociatedMemory[] {
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    const candidateIds = new Set<string>();

    // Find all memories with at least one matching keyword
    for (const keyword of lowerKeywords) {
      const matchingIds = this.index.keywordToMemories.get(keyword);
      if (matchingIds) {
        for (const id of matchingIds) {
          candidateIds.add(id);
        }
      }

      // If fuzzy matching enabled, also find similar keywords
      if (this.config.enableFuzzy) {
        const fuzzyThreshold = this.config.fuzzyThreshold ?? 0.8;
        for (const [storedKeyword, ids] of this.index.keywordToMemories) {
          if (isSimilarKeyword(keyword, storedKeyword, fuzzyThreshold)) {
            for (const id of ids) {
              candidateIds.add(id);
            }
          }
        }
      }
    }

    // Score each candidate
    const scored: AssociatedMemory[] = [];
    for (const id of candidateIds) {
      const memory = this.index.memories.get(id);
      if (!memory) continue;

      // Calculate relevance - use fuzzy score if enabled
      let relevance: number;
      let matchedKeywords: string[];
      let reason: AssociatedMemory['reason'];

      if (this.config.enableFuzzy) {
        relevance = fuzzyKeywordMatchScore(lowerKeywords, memory.keywords, {
          fuzzyThreshold: this.config.fuzzyThreshold ?? 0.8,
        });
        // Find matched keywords (exact and fuzzy)
        const memoryKeywordSet = new Set(memory.keywords.map(k => k.toLowerCase()));
        matchedKeywords = [];
        for (const k of lowerKeywords) {
          if (memoryKeywordSet.has(k)) {
            matchedKeywords.push(k);
          } else {
            // Check for fuzzy match
            for (const mk of memoryKeywordSet) {
              if (isSimilarKeyword(k, mk, this.config.fuzzyThreshold ?? 0.8)) {
                matchedKeywords.push(`${k}~${mk}`);
                break;
              }
            }
          }
        }
        reason = matchedKeywords.some(k => k.includes('~')) ? 'fuzzy-match' : 'keyword-match';
      } else {
        relevance = keywordMatchScore(lowerKeywords, memory.keywords);
        const memoryKeywordSet = new Set(memory.keywords.map(k => k.toLowerCase()));
        matchedKeywords = lowerKeywords.filter(k => memoryKeywordSet.has(k));
        reason = 'keyword-match';
      }

      if (relevance >= this.config.similarityThreshold) {
        scored.push({
          memory,
          reason,
          relevance,
          matchedKeywords,
        });
      }
    }

    // Sort by relevance, then by access count (favor less accessed)
    scored.sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      return a.memory.accessCount - b.memory.accessCount;
    });

    return scored.slice(0, maxResults);
  }

  /**
   * Mark a memory as accessed
   */
  async touch(memoryId: string): Promise<void> {
    const memory = this.index.memories.get(memoryId);
    if (memory) {
      memory.lastAccessedAt = new Date();
      memory.accessCount++;
      await this.persist(memory);
    }
  }

  /**
   * Get all memories (for maintenance/analysis)
   */
  getAll(): Memory[] {
    return Array.from(this.index.memories.values());
  }

  /**
   * Get memory count
   */
  get count(): number {
    return this.index.memories.size;
  }

  /**
   * Clean up old memories (compression)
   */
  async compress(): Promise<number> {
    const now = new Date();
    const thresholdDays = this.config.compressionAgeDays;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;

    let compressed = 0;

    for (const memory of this.index.memories.values()) {
      const age = now.getTime() - memory.createdAt.getTime();

      // Check if memory should be compressed
      if (age > thresholdMs && memory.compressionLevel < 2) {
        // For now, just mark as compressed
        // In a full implementation, we'd use an LLM to summarize
        memory.compressionLevel = Math.min(2, memory.compressionLevel + 1) as 0 | 1 | 2;
        await this.persist(memory);
        compressed++;
      }
    }

    return compressed;
  }
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: AssociationConfig = {
  memoryDir: './memories',
  maxWorkingSet: 100,
  similarityThreshold: 0.05, // Lower default for fuzzy matching
  minKeywordMatches: 1,
  compressionAgeDays: 7,
  maxSurfacedMemories: 5,
  enableFuzzy: true, // Enable by default
  fuzzyThreshold: 0.75,
};
