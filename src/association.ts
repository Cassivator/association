/**
 * Association - Main API
 *
 * Automatic semantic memory recall for AI agents.
 */

import { MemoryStore, DEFAULT_CONFIG } from './store.js';
import { extractKeywords, flattenKeywords } from './extractor.js';
import { AssociationConfig, AssociatedMemory, IncomingMessage, Memory } from './types.js';

/**
 * Result of processing a message
 */
export interface ProcessResult {
  /** Memories that were surfaced */
  surfaced: AssociatedMemory[];

  /** Keywords extracted from the message */
  keywords: string[];

  /** Whether a new memory was created */
  memoryCreated: boolean;
}

/**
 * Main Association class
 */
export class Association {
  private store: MemoryStore;
  private config: AssociationConfig;
  private autoStore: boolean;
  private minImportance: number;

  constructor(config?: Partial<AssociationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = new MemoryStore(this.config);
    this.autoStore = true; // Automatically store memories
    this.minImportance = 0.3; // Minimum importance to store
  }

  /**
   * Initialize the association system
   */
  async init(): Promise<void> {
    await this.store.init();
  }

  /**
   * Process an incoming message and surface relevant memories
   *
   * This is the main entry point - call this for every message
   * to automatically surface relevant memories.
   */
  async process(message: IncomingMessage): Promise<ProcessResult> {
    // Extract keywords from the message
    const extracted = extractKeywords(message.content);
    const keywords = flattenKeywords(extracted);

    // Find matching memories
    const surfaced = this.store.findMatchingMemories(
      keywords,
      this.config.maxSurfacedMemories
    );

    // Mark surfaced memories as accessed
    for (const { memory } of surfaced) {
      await this.store.touch(memory.id);
    }

    // Decide whether to store this as a new memory
    let memoryCreated = false;

    if (this.autoStore && this.shouldStore(message, extracted, surfaced)) {
      const importance = this.calculateImportance(message, extracted, surfaced);
      await this.store.store(message.content, keywords, {
        source: message.metadata?.channel,
        importance,
        tags: extracted.context,
      });
      memoryCreated = true;
    }

    return { surfaced, keywords, memoryCreated };
  }

  /**
   * Determine if a message should be stored as a memory
   */
  private shouldStore(
    message: IncomingMessage,
    extracted: ReturnType<typeof extractKeywords>,
    surfaced: AssociatedMemory[]
  ): boolean {
    // Don't store if it's very similar to existing memories
    if (surfaced.some(s => s.relevance > 0.8)) {
      return false;
    }

    // Don't store very short messages
    if (message.content.length < 20) {
      return false;
    }

    // Store if it has interesting keywords
    const hasKeywords =
      extracted.topics.length > 0 ||
      extracted.entities.length > 0 ||
      extracted.actions.length > 0;

    // Store if it has context markers
    const hasContext = extracted.context.length > 0;

    return hasKeywords || hasContext;
  }

  /**
   * Calculate importance score for a message
   */
  private calculateImportance(
    message: IncomingMessage,
    extracted: ReturnType<typeof extractKeywords>,
    surfaced: AssociatedMemory[]
  ): number {
    let importance = 0.5; // Base importance

    // Boost for context markers
    importance += extracted.context.length * 0.1;

    // Boost for named entities
    importance += extracted.entities.length * 0.05;

    // Boost for action words
    importance += extracted.actions.length * 0.03;

    // Boost for length (up to a point)
    if (message.content.length > 100) {
      importance += 0.1;
    }
    if (message.content.length > 500) {
      importance += 0.1;
    }

    // Reduce for being too similar to existing memories
    if (surfaced.length > 0) {
      const maxRelevance = Math.max(...surfaced.map(s => s.relevance));
      importance -= maxRelevance * 0.3;
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, importance));
  }

  /**
   * Manually store a memory
   */
  async remember(
    content: string,
    options?: {
      importance?: number;
      tags?: string[];
      source?: string;
    }
  ): Promise<Memory> {
    const keywords = flattenKeywords(extractKeywords(content));
    return this.store.store(content, keywords, options);
  }

  /**
   * Search memories by query
   */
  async search(query: string, limit?: number): Promise<AssociatedMemory[]> {
    const keywords = flattenKeywords(extractKeywords(query));
    return this.store.findMatchingMemories(keywords, limit);
  }

  /**
   * Get all memories (for debugging/analysis)
   */
  getAll(): Memory[] {
    return this.store.getAll();
  }

  /**
   * Get memory count
   */
  get count(): number {
    return this.store.count;
  }

  /**
   * Run maintenance (compression, cleanup)
   */
  async maintain(): Promise<{ compressed: number }> {
    const compressed = await this.store.compress();
    return { compressed };
  }

  /**
   * Format surfaced memories for inclusion in context
   */
  formatForContext(surfaced: AssociatedMemory[]): string {
    if (surfaced.length === 0) {
      return '';
    }

    const lines = ['**Relevant memories:**'];

    for (const { memory, reason, matchedKeywords } of surfaced) {
      const content = memory.compressedContent || memory.content;
      const truncated = content.length > 200
        ? content.slice(0, 200) + '...'
        : content;

      lines.push(`- ${truncated}`);
      if (matchedKeywords.length > 0) {
        lines.push(`  (matched: ${matchedKeywords.join(', ')})`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Create a new Association instance
 */
export function createAssociation(config?: Partial<AssociationConfig>): Association {
  return new Association(config);
}
