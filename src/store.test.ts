import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { MemoryStore, DEFAULT_CONFIG } from './store.js';

const TEST_DIR = '/tmp/association-test-' + Date.now();

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(async () => {
    // Create test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    store = new MemoryStore({ ...DEFAULT_CONFIG, memoryDir: TEST_DIR });
    await store.init();
  });

  afterEach(() => {
    // Cleanup test directory
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('starts empty', () => {
    assert.strictEqual(store.count, 0);
  });

  it('stores a memory', async () => {
    const memory = await store.store('test content', ['test', 'keywords']);
    assert.ok(memory.id);
    assert.strictEqual(memory.content, 'test content');
    assert.strictEqual(memory.keywords.length, 2);
    assert.strictEqual(store.count, 1);
  });

  it('persists memory to disk', async () => {
    await store.store('persistent content', ['persist']);
    const files = fs.readdirSync(TEST_DIR);
    assert.ok(files.some(f => f.endsWith('.json')));
  });

  it('loads existing memories on init', async () => {
    await store.store('existing memory', ['existing']);
    const newStore = new MemoryStore({ ...DEFAULT_CONFIG, memoryDir: TEST_DIR });
    await newStore.init();
    assert.strictEqual(newStore.count, 1);
  });

  it('finds matching memories by keyword', async () => {
    await store.store('memory one', ['apple', 'banana']);
    await store.store('memory two', ['cherry', 'date']);

    const matches = store.findMatchingMemories(['apple']);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].memory.content, 'memory one');
  });

  it('returns empty array when no matches', () => {
    const matches = store.findMatchingMemories(['nonexistent']);
    assert.strictEqual(matches.length, 0);
  });

  it('limits results to maxResults', async () => {
    for (let i = 0; i < 10; i++) {
      await store.store(`memory ${i}`, ['common', `unique${i}`]);
    }

    const matches = store.findMatchingMemories(['common'], 3);
    assert.strictEqual(matches.length, 3);
  });

  it('updates access count on touch', async () => {
    const memory = await store.store('touch test', ['test']);
    assert.strictEqual(memory.accessCount, 0);

    await store.touch(memory.id);
    const updated = store.getAll().find(m => m.id === memory.id);
    assert.strictEqual(updated?.accessCount, 1);
  });

  it('calculates keyword match relevance', async () => {
    await store.store('exact match', ['exact', 'match', 'keywords']);
    await store.store('partial match', ['partial', 'match']);

    const matches = store.findMatchingMemories(['exact', 'match']);
    assert.strictEqual(matches.length, 2);
    // Exact match should have higher relevance
    assert.ok(matches[0].relevance > matches[1].relevance);
  });
});
