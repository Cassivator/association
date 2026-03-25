/**
 * Adaptive scoring weights based on feedback
 *
 * Phase 2 of v0.3 RL integration.
 * Analyzes feedback to adjust scoring weights over time.
 */

import { MemoryPerformance } from './types.js';
import { ScorerConfig, DEFAULT_SCORER_CONFIG } from './scorer.js';

/**
 * Weight adaptation configuration
 */
export interface AdaptiveConfig {
  /** Minimum samples before adjusting weights */
  minSamples: number;
  /** Learning rate for weight adjustments (0-1) */
  learningRate: number;
  /** Minimum weight value */
  minWeight: number;
  /** Maximum weight value */
  maxWeight: number;
  /** How often to adjust weights (in feedback samples) */
  adjustmentInterval: number;
}

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveConfig = {
  minSamples: 10,
  learningRate: 0.1,
  minWeight: 0.05,
  maxWeight: 0.5,
  adjustmentInterval: 20,
};

/**
 * Tracks which weight contributed to a memory's ranking
 */
export interface WeightContribution {
  memoryId: string;
  weight: 'recency' | 'importance' | 'novelty' | 'keyword';
  contribution: number; // 0-1, how much this weight affected the ranking
  used: boolean; // Whether this memory was used
  timestamp: Date;
}

/**
 * Analyzes feedback to adapt scoring weights
 */
export class WeightAdapter {
  private config: AdaptiveConfig;
  private contributions: WeightContribution[] = [];
  private currentConfig: ScorerConfig;
  private totalFeedback: number = 0;

  constructor(
    scorerConfig: ScorerConfig = DEFAULT_SCORER_CONFIG,
    adaptiveConfig: AdaptiveConfig = DEFAULT_ADAPTIVE_CONFIG
  ) {
    this.currentConfig = { ...scorerConfig };
    this.config = adaptiveConfig;
  }

  /**
   * Record a weight contribution for a surfaced memory
   */
  recordContribution(contribution: Omit<WeightContribution, 'timestamp'>): void {
    this.contributions.push({
      ...contribution,
      timestamp: new Date(),
    });
    this.totalFeedback++;

    // Check if we should adapt
    if (this.totalFeedback % this.config.adjustmentInterval === 0) {
      this.adaptWeights();
    }
  }

  /**
   * Analyze contributions and adjust weights
   */
  private adaptWeights(): void {
    if (this.contributions.length < this.config.minSamples) {
      return;
    }

    // Calculate success rates per weight
    const weightStats = this.calculateWeightStats();

    // Adjust weights based on success rates
    const avgSuccess = this.calculateAverageSuccess();

    for (const [weight, stats] of weightStats) {
      if (stats.sampleCount < this.config.minSamples) continue;

      const weightKey = weight as 'recency' | 'importance' | 'novelty';
      const currentWeight = this.getWeightValue(weightKey);

      // If this weight's success rate is above average, increase its weight
      // If below average, decrease
      const delta = (stats.successRate - avgSuccess) * this.config.learningRate;
      const newWeight = this.clamp(
        currentWeight + delta,
        this.config.minWeight,
        this.config.maxWeight
      );

      this.setWeightValue(weightKey, newWeight);
    }
  }

  /**
   * Calculate success rates per weight type
   */
  private calculateWeightStats(): Map<string, { successRate: number; sampleCount: number }> {
    const stats = new Map<string, { used: number; total: number }>();

    for (const c of this.contributions) {
      const existing = stats.get(c.weight) || { used: 0, total: 0 };
      existing.total++;
      if (c.used) existing.used++;
      stats.set(c.weight, existing);
    }

    const result = new Map<string, { successRate: number; sampleCount: number }>();
    for (const [weight, { used, total }] of stats) {
      result.set(weight, {
        successRate: total > 0 ? used / total : 0,
        sampleCount: total,
      });
    }

    return result;
  }

  /**
   * Calculate average success rate across all weights
   */
  private calculateAverageSuccess(): number {
    const stats = this.calculateWeightStats();
    let total = 0;
    let count = 0;

    for (const [, s] of stats) {
      total += s.successRate * s.sampleCount;
      count += s.sampleCount;
    }

    return count > 0 ? total / count : 0;
  }

  /**
   * Get current weight value
   */
  private getWeightValue(weight: 'recency' | 'importance' | 'novelty'): number {
    switch (weight) {
      case 'recency': return this.currentConfig.recencyWeight;
      case 'importance': return this.currentConfig.importanceWeight;
      case 'novelty': return this.currentConfig.noveltyWeight;
      default: return 0;
    }
  }

  /**
   * Set weight value
   */
  private setWeightValue(weight: 'recency' | 'importance' | 'novelty', value: number): void {
    switch (weight) {
      case 'recency':
        this.currentConfig.recencyWeight = value;
        break;
      case 'importance':
        this.currentConfig.importanceWeight = value;
        break;
      case 'novelty':
        this.currentConfig.noveltyWeight = value;
        break;
    }
  }

  /**
   * Clamp a value between min and max
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Get the current adapted scorer config
   */
  getConfig(): ScorerConfig {
    return { ...this.currentConfig };
  }

  /**
   * Get weight statistics for analysis
   */
  getStats(): Map<string, { successRate: number; sampleCount: number }> {
    return this.calculateWeightStats();
  }

  /**
   * Reset to default weights
   */
  reset(): void {
    this.currentConfig = { ...DEFAULT_SCORER_CONFIG };
    this.contributions = [];
    this.totalFeedback = 0;
  }
}

/**
 * Create a weight adapter
 */
export function createWeightAdapter(
  scorerConfig?: ScorerConfig,
  adaptiveConfig?: Partial<AdaptiveConfig>
): WeightAdapter {
  return new WeightAdapter(
    scorerConfig,
    { ...DEFAULT_ADAPTIVE_CONFIG, ...adaptiveConfig }
  );
}
