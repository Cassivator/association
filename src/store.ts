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

  /**
   * Prune memories that exceed working set limit
   * Removes least important, least accessed, oldest memories first
   */
  async prune(maxKeep?: number): Promise<number> {
    const limit = maxKeep ?? this.config.maxWorkingSet;
    const current = this.index.memories.size;

    if (current <= limit) {
      return 0;
    }

    const toRemove = current - limit;

    // Score memories for removal (higher = more likely to remove)
    const scored = Array.from(this.index.memories.values()).map(m => ({
      memory: m,
      removeScore: this.calculateRemovalScore(m),
    }));

    // Sort by removal score (highest first)
    scored.sort((a, b) => b.removeScore - a.removeScore);

    // Remove the top candidates
    let removed = 0;
    for (let i = 0; i < toRemove && i < scored.length; i++) {
      const { memory } = scored[i];
      await this.delete(memory.id);
      removed++;
    }

    return removed;
  }

  /**
   * Calculate how likely a memory should be removed (0-1, higher = more likely)
   */
  private calculateRemovalScore(memory: Memory): number {
    let score = 0;

    // Lower importance = more likely to remove
    score += (1 - memory.importance) * 0.4;

    // Lower access count = more likely to remove
    score += Math.max(0, 1 - memory.accessCount / 10) * 0.3;

    // Older = more likely to remove (but less weight)
    const ageDays = (Date.now() - memory.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    score += Math.min(1, ageDays / 30) * 0.2;

    // Higher compression level = more likely to remove
    score += (memory.compressionLevel / 2) * 0.1;

    return score;
  }

  /**
   * Delete a memory by ID
   */
  async delete(id: string): Promise<boolean> {
    const memory = this.index.memories.get(id);
    if (!memory) {
      return false;
    }

    // Remove from keyword index
    for (const keyword of memory.keywords) {
      const ids = this.index.keywordToMemories.get(keyword);
      if (ids) {
        ids.delete(id);
        if (ids.size === 0) {
          this.index.keywordToMemories.delete(keyword);
        }
      }
    }

    // Remove from memory index
    this.index.memories.delete(id);

    // Delete file
    const filePath = path.join(this.memoryDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return true;
  }

  /**
   * Get statistics about the memory store
   */
  getStats(): {
    count: number;
    totalSize: number;
    avgImportance: number;
    avgAccessCount: number;
    compressionLevels: { raw: number; summarized: number; distilled: number };
  } {
    const memories = Array.from(this.index.memories.values());
    const totalSize = memories.reduce((sum, m) => sum + m.content.length, 0);
    const avgImportance = memories.length > 0
      ? memories.reduce((sum, m) => sum + m.importance, 0) / memories.length
      : 0;
    const avgAccessCount = memories.length > 0
      ? memories.reduce((sum, m) => sum + m.accessCount, 0) / memories.length
      : 0;

    const compressionLevels = {
      raw: memories.filter(m => m.compressionLevel === 0).length,
      summarized: memories.filter(m => m.compressionLevel === 1).length,
      distilled: memories.filter(m => m.compressionLevel === 2).length,
    };

    return {
      count: memories.length,
      totalSize,
      avgImportance,
      avgAccessCount,
      compressionLevels,
    };
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
