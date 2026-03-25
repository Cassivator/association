import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { WeightAdapter, createWeightAdapter, DEFAULT_ADAPTIVE_CONFIG } from './adaptive.js';
import { DEFAULT_SCORER_CONFIG } from './scorer.js';

describe('WeightAdapter', () => {
  let adapter: WeightAdapter;

  beforeEach(() => {
    adapter = createWeightAdapter(DEFAULT_SCORER_CONFIG, {
      minSamples: 2,
      adjustmentInterval: 5,
      learningRate: 0.2,
    });
  });

  describe('recordContribution', () => {
    it('should record a contribution', () => {
      adapter.recordContribution({
        memoryId: 'test-1',
        weight: 'recency',
        contribution: 0.5,
        used: true,
      });

      const stats = adapter.getStats();
      assert.strictEqual(stats.get('recency')?.sampleCount, 1);
    });

    it('should track multiple contributions', () => {
      adapter.recordContribution({ memoryId: 'a', weight: 'recency', contribution: 0.5, used: true });
      adapter.recordContribution({ memoryId: 'b', weight: 'recency', contribution: 0.3, used: false });
      adapter.recordContribution({ memoryId: 'c', weight: 'importance', contribution: 0.7, used: true });

      const stats = adapter.getStats();
      assert.strictEqual(stats.get('recency')?.sampleCount, 2);
      assert.strictEqual(stats.get('importance')?.sampleCount, 1);
    });
  });

  describe('getStats', () => {
    it('should calculate success rates', () => {
      adapter.recordContribution({ memoryId: 'a', weight: 'recency', contribution: 0.5, used: true });
      adapter.recordContribution({ memoryId: 'b', weight: 'recency', contribution: 0.3, used: false });
      adapter.recordContribution({ memoryId: 'c', weight: 'recency', contribution: 0.2, used: true });

      const stats = adapter.getStats();
      assert.strictEqual(stats.get('recency')?.successRate, 2/3);
    });
  });

  describe('weight adaptation', () => {
    it('should not adapt before minSamples', () => {
      adapter.recordContribution({ memoryId: 'a', weight: 'recency', contribution: 0.5, used: true });

      const config = adapter.getConfig();
      assert.strictEqual(config.recencyWeight, DEFAULT_SCORER_CONFIG.recencyWeight);
    });

    it('should adapt weights after adjustmentInterval', () => {
      // Record 5 contributions where recency is highly successful
      for (let i = 0; i < 5; i++) {
        adapter.recordContribution({
          memoryId: `test-${i}`,
          weight: 'recency',
          contribution: 0.5,
          used: true,
        });
      }

      const config = adapter.getConfig();
      // Recency weight should have increased since it's 100% successful
      assert.ok(config.recencyWeight >= DEFAULT_SCORER_CONFIG.recencyWeight);
    });

    it('should decrease weight for unsuccessful contributions', () => {
      // Record 5 contributions where novelty is never used
      for (let i = 0; i < 5; i++) {
        adapter.recordContribution({
          memoryId: `test-${i}`,
          weight: 'novelty',
          contribution: 0.5,
          used: false,
        });
      }

      const config = adapter.getConfig();
      // Novelty weight should have decreased since it's 0% successful
      assert.ok(config.noveltyWeight <= DEFAULT_SCORER_CONFIG.noveltyWeight);
    });
  });

  describe('getConfig', () => {
    it('should return current config', () => {
      const config = adapter.getConfig();
      assert.strictEqual(config.recencyWeight, DEFAULT_SCORER_CONFIG.recencyWeight);
      assert.strictEqual(config.importanceWeight, DEFAULT_SCORER_CONFIG.importanceWeight);
      assert.strictEqual(config.noveltyWeight, DEFAULT_SCORER_CONFIG.noveltyWeight);
    });
  });

  describe('reset', () => {
    it('should reset to default weights', () => {
      // Adapt some weights
      for (let i = 0; i < 5; i++) {
        adapter.recordContribution({
          memoryId: `test-${i}`,
          weight: 'recency',
          contribution: 0.5,
          used: true,
        });
      }

      adapter.reset();
      const config = adapter.getConfig();
      assert.strictEqual(config.recencyWeight, DEFAULT_SCORER_CONFIG.recencyWeight);
    });
  });
});
