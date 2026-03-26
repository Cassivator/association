/**
 * Integration tests for Association with real memory files
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createAssociation } from './association.js';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Integration', () => {
  let tempDir: string;
  let association: ReturnType<typeof createAssociation>;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'association-test-'));
    association = createAssociation({
      memoryDir: tempDir,
      maxWorkingSet: 100,
      similarityThreshold: 0.1, // Lower threshold to match with few keywords
      minKeywordMatches: 1,
      maxSurfacedMemories: 5,
    });
    await association.init();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stores and surfaces memories correctly', async () => {
    // Store some memories with keywords that will overlap
    await association.remember('Sophie is building OriginOS with OSL language', { tags: ['user', 'project'] });
    await association.remember('PR #2 for roturbot-gosl is still open', { tags: ['pr', 'github'] });
    await association.remember('Memory systems surface context, not search', { tags: ['insight'] });

    // Process a message that should match - OSL keyword overlaps
    const result = await association.process({ content: 'working on the OSL compiler today' });

    assert.ok(result.surfaced.length > 0, 'Should surface at least one memory');
    const oslMemory = result.surfaced.find(m => m.memory.content.includes('OSL'));
    assert.ok(oslMemory, 'Should find the OSL-related memory');
    assert.ok(oslMemory!.relevance > 0, 'Should have positive relevance');
  });

  it('persists memories across sessions', async () => {
    // Store a memory
    const memory = await association.remember('Important fact about testing', { tags: ['test'] });
    
    // Create new instance
    const freshAssoc = createAssociation({
      memoryDir: tempDir,
    });
    await freshAssoc.init();

    assert.strictEqual(freshAssoc.count, 1, 'Memory should persist');
    const all = freshAssoc.getAll();
    assert.strictEqual(all[0].content, 'Important fact about testing');
  });

  it('handles MEMORY.md content', async () => {
    // Test that keyword extraction works on real memory file format
    const memoryMdContent = `# MEMORY.md

## Identity
I'm Cassie. Born on a Raspberry Pi.

## Projects
- Association - automatic memory recall
- Contributing to OSL.go

## People
Sophie - my human, builds OriginOS
`;

    // Store sections as memories
    const lines = memoryMdContent.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (currentContent.length > 0) {
          await association.remember(currentSection + '\n' + currentContent.join('\n'), { tags: ['memory-md'] });
        }
        currentSection = line.replace('## ', '');
        currentContent = [];
      } else if (line.trim()) {
        currentContent.push(line);
      }
    }
    if (currentContent.length > 0) {
      await association.remember(currentSection + '\n' + currentContent.join('\n'), { tags: ['memory-md'] });
    }

    // Search with keyword that matches content
    const result = await association.process({ content: 'tell me about Sophie' });
    assert.ok(result.surfaced.some(m => m.memory.content.includes('Sophie')), 'Should surface Sophie info');
  });

  it('respects similarity threshold', async () => {
    await association.remember('JavaScript is a programming language', {});
    await association.remember('TypeScript adds types to JavaScript', {});

    // With low threshold, should match both
    const lowThreshold = createAssociation({
      memoryDir: tempDir,
      similarityThreshold: 0.1,
    });
    await lowThreshold.init();
    const lowResult = await lowThreshold.process({ content: 'JavaScript' });
    
    // With high threshold, should match fewer
    const highThreshold = createAssociation({
      memoryDir: tempDir,
      similarityThreshold: 0.8,
    });
    await highThreshold.init();
    const highResult = await highThreshold.process({ content: 'JavaScript' });

    assert.ok(lowResult.surfaced.length >= highResult.surfaced.length, 'Lower threshold should surface more');
  });

  it('limits surfaced memories', async () => {
    // Store many similar memories
    for (let i = 0; i < 10; i++) {
      await association.remember(`Memory ${i} about testing TypeScript code`, {});
    }

    const result = await association.process({ content: 'testing TypeScript' });
    assert.ok(result.surfaced.length <= 5, 'Should respect maxSurfacedMemories limit');
  });

  it('uses OperationDecider in process()', async () => {
    // Short ephemeral content should result in NOOP
    const ephemeralResult = await association.process({ content: 'ok' });
    assert.ok(ephemeralResult.operationDecision, 'Should have operation decision');
    assert.strictEqual(ephemeralResult.operationDecision!.operation, 'NOOP');
    assert.strictEqual(ephemeralResult.memoryCreated, false);

    // Substantial content should result in ADD
    const newResult = await association.process({ 
      content: 'This is a substantial piece of information about machine learning' 
    });
    assert.ok(newResult.operationDecision, 'Should have operation decision');
    assert.strictEqual(newResult.operationDecision!.operation, 'ADD');
    assert.strictEqual(newResult.memoryCreated, true);
  });
});
