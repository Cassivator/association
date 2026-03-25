import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { FeedbackTracker, createFeedbackTracker } from './feedback.js';
import { promises as fs } from 'fs';
import * as path from 'path';

const TEST_DIR = './test-feedback-' + Date.now();

describe('FeedbackTracker', () => {
  let tracker: FeedbackTracker;

  beforeEach(async () => {
    tracker = createFeedbackTracker({ dataDir: TEST_DIR });
    await tracker.init();
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('recordFeedback', () => {
    it('should record a feedback entry', async () => {
      await tracker.recordFeedback({
        memoryId: 'test-1',
        surfaced: true,
        used: true,
        helpful: true,
      });

      const performance = tracker.getPerformance('test-1');
      assert.strictEqual(performance.surfaceCount, 1);
      assert.strictEqual(performance.usedCount, 1);
    });

    it('should track multiple feedbacks for same memory', async () => {
      await tracker.recordFeedback({ memoryId: 'test-1', surfaced: true, used: true, helpful: true });
      await tracker.recordFeedback({ memoryId: 'test-1', surfaced: true, used: false, helpful: false });
      await tracker.recordFeedback({ memoryId: 'test-1', surfaced: true, used: true, helpful: null });

      const performance = tracker.getPerformance('test-1');
      assert.strictEqual(performance.surfaceCount, 3);
      assert.strictEqual(performance.usedCount, 2);
      assert.strictEqual(performance.successRate, 2/3);
    });
  });

  describe('markUsed/markUnused', () => {
    it('should mark memory as used', async () => {
      await tracker.markUsed('test-1');
      
      const performance = tracker.getPerformance('test-1');
      assert.strictEqual(performance.usedCount, 1);
    });

    it('should mark memory as unused (noise)', async () => {
      await tracker.markUnused('test-2');
      
      const performance = tracker.getPerformance('test-2');
      assert.strictEqual(performance.usedCount, 0);
      assert.strictEqual(performance.surfaceCount, 1);
    });
  });

  describe('getPerformance', () => {
    it('should return empty performance for unknown memory', async () => {
      const performance = tracker.getPerformance('unknown');
      assert.strictEqual(performance.surfaceCount, 0);
      assert.strictEqual(performance.usedCount, 0);
      assert.strictEqual(performance.successRate, 0);
    });

    it('should calculate daysSinceUseful', async () => {
      await tracker.recordFeedback({ memoryId: 'test-1', surfaced: true, used: true, helpful: true });
      
      const performance = tracker.getPerformance('test-1');
      assert.strictEqual(performance.daysSinceUseful, 0); // Just used
    });
  });

  describe('getAllPerformance', () => {
    it('should return performance for all memories', async () => {
      await tracker.recordFeedback({ memoryId: 'a', surfaced: true, used: true, helpful: true });
      await tracker.recordFeedback({ memoryId: 'b', surfaced: true, used: false, helpful: false });
      await tracker.recordFeedback({ memoryId: 'c', surfaced: true, used: true, helpful: null });

      const all = tracker.getAllPerformance();
      assert.strictEqual(all.length, 3);
      assert.strictEqual(all.find(m => m.memoryId === 'a')?.successRate, 1);
      assert.strictEqual(all.find(m => m.memoryId === 'b')?.successRate, 0);
    });
  });

  describe('findPrunableMemories', () => {
    it('should find memories that are consistently not useful', async () => {
      // Memory 'prune-me' is surfaced 5 times but never used
      for (let i = 0; i < 5; i++) {
        await tracker.recordFeedback({ memoryId: 'prune-me', surfaced: true, used: false, helpful: false });
      }
      // Memory 'keep-me' is used most of the time
      for (let i = 0; i < 5; i++) {
        await tracker.recordFeedback({ memoryId: 'keep-me', surfaced: true, used: true, helpful: true });
      }

      const prunable = tracker.findPrunableMemories({
        minSurfaces: 3,
        maxSuccessRate: 0.3,
        minDaysSinceUseful: 0,
      });

      assert.strictEqual(prunable.length, 1);
      assert.strictEqual(prunable[0].memoryId, 'prune-me');
    });
  });

  describe('persistence', () => {
    it('should persist feedback to disk', async () => {
      await tracker.recordFeedback({ memoryId: 'persist-test', surfaced: true, used: true, helpful: true });
      
      // Create new tracker instance to test persistence
      const tracker2 = createFeedbackTracker({ dataDir: TEST_DIR });
      await tracker2.init();
      
      const performance = tracker2.getPerformance('persist-test');
      assert.strictEqual(performance.surfaceCount, 1);
    });
  });

  describe('cleanup', () => {
    it('should remove old feedback records', async () => {
      // This test would need to manipulate timestamps
      // For now, just test that cleanup runs without error
      await tracker.recordFeedback({ memoryId: 'test', surfaced: true, used: true, helpful: true });
      const removed = await tracker.cleanup();
      assert.strictEqual(typeof removed, 'number');
    });
  });
});
