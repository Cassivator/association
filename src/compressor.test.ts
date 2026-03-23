import { describe, it } from 'node:test';
import assert from 'node:assert';
import { compressMemory, shouldCompress, getDisplayContent } from './compressor.js';
import type { Memory } from './types.js';

describe('compressMemory', () => {
  const createMemory = (content: string, keywords: string[] = []): Memory => ({
    id: 'test-id',
    content,
    keywords,
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 1,
    compressionLevel: 0,
    importance: 0.5,
    tags: [],
  });

  it('returns original content if already short enough', () => {
    const memory = createMemory('Short content.', ['test']);
    const result = compressMemory(memory, 1);
    assert.strictEqual(result, 'Short content.');
  });

  it('compresses to summarized level (3 sentences)', () => {
    const memory = createMemory(
      'First sentence about testing. Second sentence with details. Third sentence has more info. Fourth sentence is extra.',
      ['testing']
    );
    const result = compressMemory(memory, 1);
    const sentences = result.split(/[.!?]+/).filter(s => s.trim());
    assert.ok(sentences.length <= 3);
  });

  it('compresses to distilled level (1 sentence)', () => {
    const memory = createMemory(
      'First sentence about testing. Second sentence with details. Third sentence has more info.',
      ['testing']
    );
    const result = compressMemory(memory, 2);
    const sentences = result.split(/[.!?]+/).filter(s => s.trim());
    assert.ok(sentences.length <= 1);
  });

  it('prioritizes sentences with keywords', () => {
    const memory = createMemory(
      'Generic statement. Testing is important. Another generic line.',
      ['testing']
    );
    const result = compressMemory(memory, 2);
    assert.ok(result.toLowerCase().includes('testing'));
  });

  it('uses compressedContent if available', () => {
    const memory: Memory = {
      id: 'test-id',
      content: 'Original very long content that has many sentences. This keeps going. And more.',
      compressedContent: 'Already compressed.',
      keywords: [],
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 1,
      compressionLevel: 1,
      importance: 0.5,
      tags: [],
    };
    const result = compressMemory(memory, 2);
    assert.ok(result.length < memory.content.length);
  });
});

describe('shouldCompress', () => {
  const createMemory = (level: 0 | 1 | 2, ageDays: number): Memory => ({
    id: 'test-id',
    content: 'Test content',
    keywords: [],
    createdAt: new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000),
    lastAccessedAt: new Date(),
    accessCount: 1,
    compressionLevel: level,
    importance: 0.5,
    tags: [],
  });

  it('returns null for fresh memories', () => {
    const memory = createMemory(0, 3);
    const result = shouldCompress(memory, 7);
    assert.strictEqual(result, null);
  });

  it('returns 1 for raw memory past compression age', () => {
    const memory = createMemory(0, 10);
    const result = shouldCompress(memory, 7);
    assert.strictEqual(result, 1);
  });

  it('returns 2 for summarized memory past double compression age', () => {
    const memory = createMemory(1, 20);
    const result = shouldCompress(memory, 7);
    assert.strictEqual(result, 2);
  });

  it('returns null for already distilled memory', () => {
    const memory = createMemory(2, 30);
    const result = shouldCompress(memory, 7);
    assert.strictEqual(result, null);
  });
});

describe('getDisplayContent', () => {
  it('returns content when no compressed version', () => {
    const memory: Memory = {
      id: 'test',
      content: 'Original content',
      keywords: [],
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 1,
      compressionLevel: 0,
      importance: 0.5,
      tags: [],
    };
    assert.strictEqual(getDisplayContent(memory), 'Original content');
  });

  it('returns compressedContent when available', () => {
    const memory: Memory = {
      id: 'test',
      content: 'Original very long content',
      compressedContent: 'Compressed.',
      keywords: [],
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 1,
      compressionLevel: 1,
      importance: 0.5,
      tags: [],
    };
    assert.strictEqual(getDisplayContent(memory), 'Compressed.');
  });
});
