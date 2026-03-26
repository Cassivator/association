/**
 * Operation decision for memory management
 *
 * Phase 3 of v0.3 RL integration.
 * Decides whether to ADD, UPDATE, DELETE, or NOOP for incoming content.
 */

import { AssociatedMemory, MemoryPerformance } from './types.js';

/**
 * Memory operation types
 */
export type MemoryOperation = 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP';

/**
 * Decision about what operation to perform
 */
export interface OperationDecision {
  /** The operation to perform */
  operation: MemoryOperation;
  /** Target memory ID for UPDATE/DELETE */
  targetId?: string;
  /** Confidence in this decision (0-1) */
  confidence: number;
  /** Reason for this decision */
  reason: string;
}

/**
 * Configuration for operation decisions
 */
export interface OperationConfig {
  /** Minimum content length to consider storing */
  minContentLength: number;
  /** Similarity threshold for considering UPDATE */
  updateSimilarityThreshold: number;
  /** Threshold for NOOP due to redundancy */
  redundancyThreshold: number;
  /** Keywords that suggest refinement/update */
  refinementKeywords: string[];
  /** Conversational patterns to skip */
  ephemeralPatterns: RegExp[];
}

export const DEFAULT_OPERATION_CONFIG: OperationConfig = {
  minContentLength: 20,
  updateSimilarityThreshold: 0.6,
  redundancyThreshold: 0.9,
  refinementKeywords: ['also', 'actually', 'update', 'now', 'but', 'however', 'instead'],
  ephemeralPatterns: [
    /^(ok|okay|k|yes|no|yeah|yep|nope|sure|thanks?|please|sorry?)([!.]?|s?)$/i,
    /^(lol|haha|heh|hm+|oh|ah|uh|um+)$/i,
    /^(got it|sounds good|will do|makes sense|i see)$/i,
  ],
};

/**
 * Decides what memory operation to perform
 */
export class OperationDecider {
  private config: OperationConfig;

  constructor(config: Partial<OperationConfig> = {}) {
    this.config = { ...DEFAULT_OPERATION_CONFIG, ...config };
  }

  /**
   * Decide what operation to perform for incoming content
   */
  decide(
    content: string,
    keywords: string[],
    surfaced: AssociatedMemory[]
  ): OperationDecision {
    // 1. Check NOOP - ephemeral content
    if (this.isEphemeral(content)) {
      return {
        operation: 'NOOP',
        confidence: 0.9,
        reason: 'ephemeral conversational content',
      };
    }

    // 2. Check NOOP - too short
    if (content.length < this.config.minContentLength) {
      return {
        operation: 'NOOP',
        confidence: 0.8,
        reason: `content too short (${content.length} chars)`,
      };
    }

    // 3. Check NOOP - redundant with surfaced memory
    const redundantMatch = this.findRedundantMatch(content, keywords, surfaced);
    if (redundantMatch) {
      return {
        operation: 'NOOP',
        confidence: 0.85,
        reason: `redundant with memory ${redundantMatch.memory.id}`,
      };
    }

    // 4. Check UPDATE - similar to existing memory with refinement
    const updateCandidate = this.findUpdateCandidate(content, keywords, surfaced);
    if (updateCandidate) {
      return {
        operation: 'UPDATE',
        targetId: updateCandidate.memory.id,
        confidence: 0.7,
        reason: `similar topic with new information`,
      };
    }

    // 5. Default to ADD
    return {
      operation: 'ADD',
      confidence: 0.6,
      reason: 'new unique content',
    };
  }

  /**
   * Check if content is ephemeral (conversational filler)
   */
  private isEphemeral(content: string): boolean {
    const trimmed = content.trim().toLowerCase();
    for (const pattern of this.config.ephemeralPatterns) {
      if (pattern.test(trimmed)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find a surfaced memory that makes this content redundant
   */
  private findRedundantMatch(
    content: string,
    keywords: string[],
    surfaced: AssociatedMemory[]
  ): AssociatedMemory | null {
    for (const am of surfaced) {
      if (am.relevance >= this.config.redundancyThreshold) {
        // Check if content is essentially the same
        const memoryKeywords = am.memory.keywords.map(k => k.toLowerCase());
        const contentKeywords = keywords.map(k => k.toLowerCase());
        const overlap = this.keywordOverlap(contentKeywords, memoryKeywords);
        if (overlap >= 0.8) {
          return am;
        }
      }
    }
    return null;
  }

  /**
   * Find a surfaced memory that should be updated with this content
   */
  private findUpdateCandidate(
    content: string,
    keywords: string[],
    surfaced: AssociatedMemory[]
  ): AssociatedMemory | null {
    const contentKeywords = keywords.map(k => k.toLowerCase());
    const hasRefinement = this.config.refinementKeywords.some(kw =>
      content.toLowerCase().includes(kw)
    );

    for (const am of surfaced) {
      const memoryKeywords = am.memory.keywords.map(k => k.toLowerCase());
      const overlap = this.keywordOverlap(contentKeywords, memoryKeywords);

      // Similar topic (but not redundant)
      if (overlap >= this.config.updateSimilarityThreshold && overlap < 0.9) {
        // Check if this is a refinement
        if (hasRefinement || this.isRefinement(content, am.memory.content)) {
          return am;
        }
      }
    }

    return null;
  }

  /**
   * Check if new content is a refinement of existing memory
   */
  private isRefinement(newContent: string, existingContent: string): boolean {
    const newLower = newContent.toLowerCase();
    const existingLower = existingContent.toLowerCase();

    // New content adds information
    if (newLower.length > existingLower.length * 1.2) {
      return true;
    }

    // New content has "also" or similar
    for (const kw of this.config.refinementKeywords) {
      if (newLower.includes(kw) && !existingLower.includes(kw)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate keyword overlap (Jaccard similarity)
   */
  private keywordOverlap(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Find memories that should be deleted (based on feedback)
   */
  findDeleteCandidates(
    performance: MemoryPerformance[],
    threshold: {
      minAge: number;
      maxSuccessRate: number;
      minSurfaces: number;
    }
  ): MemoryPerformance[] {
    return performance.filter(p => {
      const oldEnough = p.daysSinceUseful !== null && p.daysSinceUseful >= threshold.minAge;
      const lowSuccess = p.successRate <= threshold.maxSuccessRate;
      const enoughData = p.surfaceCount >= threshold.minSurfaces;
      return oldEnough && lowSuccess && enoughData;
    });
  }
}

/**
 * Create an operation decider
 */
export function createOperationDecider(config?: Partial<OperationConfig>): OperationDecider {
  return new OperationDecider(config);
}
