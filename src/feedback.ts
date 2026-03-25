/**
 * Feedback tracking for RL-based memory improvement
 *
 * Collects outcome signals to improve memory retrieval quality.
 * Phase 1 of v0.3 RL integration.
 */

import { MemoryFeedback, MemoryPerformance } from './types.js';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Feedback store configuration
 */
export interface FeedbackConfig {
  /** Directory to store feedback data */
  dataDir: string;
  /** How long to keep feedback records (days) */
  retentionDays: number;
}

export const DEFAULT_FEEDBACK_CONFIG: FeedbackConfig = {
  dataDir: './feedback',
  retentionDays: 30,
};

/**
 * Tracks memory retrieval feedback for RL-based improvement
 */
export class FeedbackTracker {
  private config: FeedbackConfig;
  private feedbackFile: string;
  private feedbackCache: MemoryFeedback[] = [];
  private initialized = false;

  constructor(config: FeedbackConfig) {
    this.config = config;
    this.feedbackFile = path.join(config.dataDir, 'feedback.json');
  }

  /**
   * Initialize feedback tracker (load existing data)
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      const data = await fs.readFile(this.feedbackFile, 'utf-8');
      this.feedbackCache = JSON.parse(data, (key, value) => {
        if (key === 'timestamp') return new Date(value);
        return value;
      });
    } catch {
      // File doesn't exist yet, start fresh
      this.feedbackCache = [];
    }
    this.initialized = true;
  }

  /**
   * Record feedback on a memory retrieval
   */
  async recordFeedback(feedback: Omit<MemoryFeedback, 'timestamp'>): Promise<void> {
    if (!this.initialized) throw new Error('FeedbackTracker not initialized');

    const fullFeedback: MemoryFeedback = {
      ...feedback,
      timestamp: new Date(),
    };

    this.feedbackCache.push(fullFeedback);
    await this.persist();
  }

  /**
   * Record that a surfaced memory was used by the agent
   */
  async markUsed(memoryId: string, helpful: boolean | null = null): Promise<void> {
    await this.recordFeedback({
      memoryId,
      surfaced: true,
      used: true,
      helpful,
    });
  }

  /**
   * Record that a surfaced memory was NOT used (noise signal)
   */
  async markUnused(memoryId: string): Promise<void> {
    await this.recordFeedback({
      memoryId,
      surfaced: true,
      used: false,
      helpful: false,
    });
  }

  /**
   * Get performance metrics for a specific memory
   */
  getPerformance(memoryId: string): MemoryPerformance {
    const memoryFeedback = this.feedbackCache.filter(f => f.memoryId === memoryId);
    
    const surfaceCount = memoryFeedback.filter(f => f.surfaced).length;
    const usedCount = memoryFeedback.filter(f => f.used).length;
    const lastAccessedAt = memoryFeedback.reduce<Date | null>(
      (max, f) => (!max || f.timestamp > max) ? f.timestamp : max,
      null
    ) || new Date();

    const usefulFeedback = memoryFeedback.filter(f => f.used && f.helpful === true);
    const lastUseful = usefulFeedback.reduce<Date | null>(
      (max, f) => (!max || f.timestamp > max) ? f.timestamp : max,
      null
    );

    const daysSinceUseful = lastUseful 
      ? Math.floor((Date.now() - lastUseful.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      memoryId,
      surfaceCount,
      usedCount,
      successRate: surfaceCount > 0 ? usedCount / surfaceCount : 0,
      lastAccessedAt,
      daysSinceUseful,
    };
  }

  /**
   * Get performance metrics for all memories
   */
  getAllPerformance(): MemoryPerformance[] {
    const memoryIds = new Set(this.feedbackCache.map(f => f.memoryId));
    return Array.from(memoryIds).map(id => this.getPerformance(id));
  }

  /**
   * Find memories that should be pruned (consistently not useful)
   */
  findPrunableMemories(threshold: { minSurfaces: number; maxSuccessRate: number; minDaysSinceUseful: number }): MemoryPerformance[] {
    const all = this.getAllPerformance();
    return all.filter(m => 
      m.surfaceCount >= threshold.minSurfaces &&
      m.successRate <= threshold.maxSuccessRate &&
      (m.daysSinceUseful !== null && m.daysSinceUseful >= threshold.minDaysSinceUseful)
    );
  }

  /**
   * Get weight performance statistics (for adaptive scoring)
   */
  getWeightPerformance(): Map<string, { successRate: number; sampleCount: number }> {
    // This would need integration with the scorer to track which weight
    // contributed most to each surfaced memory.
    // For MVP, return empty map - implement in Phase 2.
    return new Map();
  }

  /**
   * Clean up old feedback records
   */
  async cleanup(): Promise<number> {
    const cutoff = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    const before = this.feedbackCache.length;
    this.feedbackCache = this.feedbackCache.filter(f => f.timestamp >= cutoff);
    await this.persist();
    return before - this.feedbackCache.length;
  }

  /**
   * Persist feedback cache to disk
   */
  private async persist(): Promise<void> {
    await fs.mkdir(this.config.dataDir, { recursive: true });
    await fs.writeFile(this.feedbackFile, JSON.stringify(this.feedbackCache, null, 2));
  }

  /**
   * Export feedback for analysis
   */
  exportFeedback(): MemoryFeedback[] {
    return [...this.feedbackCache];
  }
}

/**
 * Create a feedback tracker
 */
export function createFeedbackTracker(config?: Partial<FeedbackConfig>): FeedbackTracker {
  return new FeedbackTracker({ ...DEFAULT_FEEDBACK_CONFIG, ...config });
}
