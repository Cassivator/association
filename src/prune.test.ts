import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { MemoryStore, DEFAULT_CONFIG } from './store.js';

const TEST_DIR = '/tmp/association-prune-test-' + Date.now();

describe('MemoryStore pruning', () => {
  let store: MemoryStore;

  beforeEach(async () => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    store = new MemoryStore({
      ...DEFAULT_CONFIG,
      memoryDir: TEST_DIR,
      maxWorkingSet: 5,
    });
    await store.init();
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('does nothing when under limit', async () => {
    await store.store('memory 1', ['test']);
    const removed = await store.prune();
    assert.strictEqual(removed, 0);
    assert.strictEqual(store.count, 1);
  });

  it('removes excess memories', async () => {
    // Add more than limit
    for (let i = 0; i < 10; i++) {
      await store.store(`memory ${i}`, ['test']);
    }
    assert.strictEqual(store.count, 10);

    const removed = await store.prune(5);
    assert.strictEqual(removed, 5);
    assert.strictEqual(store.count, 5);
  });

  it('prefers keeping important memories', async () => {
    // Add low importance
    await store.store('low importance', ['test'], { importance: 0.1 });
    // Add high importance
    await store.store('high importance', ['test'], { importance: 0.9 });

    await store.prune(1);

    // Should keep high importance
    const remaining = store.getAll();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].content, 'high importance');
  });

  it('prefers keeping frequently accessed memories', async () => {
    // Add rarely accessed
    await store.store('rarely accessed', ['test']);
    // Add frequently accessed
    const frequent = await store.store('frequently accessed', ['test']);
    for (let i = 0; i < 5; i++) {
      await store.touch(frequent.id);
    }

    await store.prune(1);

    // Should keep frequently accessed
    const remaining = store.getAll();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].content, 'frequently accessed');
  });

  it('deletes memory and removes from index', async () => {
    const mem = await store.store('to delete', ['unique', 'keywords']);
    assert.strictEqual(store.count, 1);

    const deleted = await store.delete(mem.id);
    assert.strictEqual(deleted, true);
    assert.strictEqual(store.count, 0);

    // Verify file is deleted
    const files = fs.readdirSync(TEST_DIR);
    assert.ok(!files.some(f => f.includes(mem.id)));
  });

  it('returns false when deleting non-existent memory', async () => {
    const deleted = await store.delete('non-existent-id');
    assert.strictEqual(deleted, false);
  });

  it('provides statistics', async () => {
    await store.store('mem1', ['test'], { importance: 0.5 });
    await store.store('mem2', ['test'], { importance: 0.8 });

    const stats = store.getStats();
    assert.strictEqual(stats.count, 2);
    assert.ok(stats.totalSize > 0);
    assert.ok(stats.avgImportance > 0);
    assert.strictEqual(stats.compressionLevels.raw, 2);
    assert.strictEqual(stats.compressionLevels.summarized, 0);
    assert.strictEqual(stats.compressionLevels.distilled, 0);
  });
});
