/**
 * Association - Main API
 *
 * Automatic semantic memory recall for AI agents.
 */

import { MemoryStore, DEFAULT_CONFIG } from './store.js';
import { extractKeywords, flattenKeywords } from './extractor.js';
import { reRankMemories, selectDiverseMemories, DEFAULT_SCORER_CONFIG } from './scorer.js';
import { FeedbackTracker, createFeedbackTracker, DEFAULT_FEEDBACK_CONFIG } from './feedback.js';
import { AssociationConfig, AssociatedMemory, IncomingMessage, Memory, MemoryPerformance } from './types.js';

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
  /** IDs of surfaced memories (for feedback tracking) */
  surfacedIds: string[];
}

/**
 * Main Association class
 */
export class Association {
  private store: MemoryStore;
  private config: AssociationConfig;
  private autoStore: boolean;
  private minImportance: number;
  private feedbackTracker: FeedbackTracker;

  constructor(config?: Partial<AssociationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.store = new MemoryStore(this.config);
    this.autoStore = true; // Automatically store memories
    this.minImportance = 0.3; // Minimum importance to store
    this.feedbackTracker = createFeedbackTracker({
      dataDir: this.config.memoryDir + '/feedback',
    });
  }

  /**
   * Initialize the association system
   */
  async init(): Promise<void> {
    await this.store.init();
    await this.feedbackTracker.init();
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

    // Find matching memories (get extra candidates for re-ranking)
    const candidates = this.store.findMatchingMemories(
      keywords,
      this.config.maxSurfacedMemories * 3
    );

    // Re-rank using composite scoring (recency, importance, novelty)
    const reRanked = reRankMemories(candidates, DEFAULT_SCORER_CONFIG);

    // Select diverse memories to avoid topic repetition
    const surfaced = selectDiverseMemories(
      reRanked,
      this.config.maxSurfacedMemories,
      0.6 // Max overlap ratio
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

    const surfacedIds = surfaced.map(s => s.memory.id);

    return { surfaced, keywords, memoryCreated, surfacedIds };
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
    options?: { importance?: number; tags?: string[]; source?: string }
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
  async maintain(): Promise<{ compressed: number; pruned: number }> {
    const compressed = await this.store.compress();
    const pruned = await this.store.prune();
    return { compressed, pruned };
  }

  /**
   * Delete a specific memory
   */
  async forget(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  /**
   * Get statistics about the memory store
   */
  getStats(): ReturnType<MemoryStore['getStats']> {
    return this.store.getStats();
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
      const truncated = content.length > 200 ? content.slice(0, 200) + '...' : content;
      lines.push(`- ${truncated}`);
      if (matchedKeywords.length > 0) {
        lines.push(` (matched: ${matchedKeywords.join(', ')})`);
      }
    }

    return lines.join('\n');
  }

  // ============================================
  // Feedback API (v0.3 RL integration)
  // ============================================

  /**
   * Mark a surfaced memory as used by the agent
   *
   * Call this when you reference or use a surfaced memory in your response.
   * This provides positive feedback for the RL system.
   *
   * @param memoryId - The ID of the memory that was used
   * @param helpful - Whether the memory led to a good outcome (optional)
   */
  async markUsed(memoryId: string, helpful: boolean | null = null): Promise<void> {
    await this.feedbackTracker.markUsed(memoryId, helpful);
  }

  /**
   * Mark a surfaced memory as NOT used (noise signal)
   *
   * Call this when a surfaced memory was not relevant to your response.
   * This provides negative feedback for the RL system.
   *
   * @param memoryId - The ID of the memory that was surfaced but not used
   */
  async markUnused(memoryId: string): Promise<void> {
    await this.feedbackTracker.markUnused(memoryId);
  }

  /**
   * Get performance metrics for a specific memory
   *
   * Shows how often the memory is surfaced vs actually used.
   */
  getMemoryPerformance(memoryId: string): MemoryPerformance {
    return this.feedbackTracker.getPerformance(memoryId);
  }

  /**
   * Get performance metrics for all memories
   */
  getAllPerformance(): MemoryPerformance[] {
    return this.feedbackTracker.getAllPerformance();
  }

  /**
   * Find memories that should be pruned (consistently not useful)
   */
  findPrunableMemories(threshold?: {
    minSurfaces: number;
    maxSuccessRate: number;
    minDaysSinceUseful: number;
  }): MemoryPerformance[] {
    return this.feedbackTracker.findPrunableMemories(threshold || {
      minSurfaces: 3,
      maxSuccessRate: 0.2,
      minDaysSinceUseful: 7,
    });
  }

  /**
   * Clean up old feedback records
   */
  async cleanupFeedback(): Promise<number> {
    return this.feedbackTracker.cleanup();
  }
}

/**
 * Create a new Association instance
 */
export function createAssociation(config?: Partial<AssociationConfig>): Association {
  return new Association(config);
}
