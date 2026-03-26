import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { OperationDecider, createOperationDecider, DEFAULT_OPERATION_CONFIG } from './operations.js';
import { AssociatedMemory, Memory } from './types.js';

// Helper to create test memories
function createMemory(id: string, content: string, keywords: string[]): Memory {
  return {
    id,
    content,
    keywords,
    createdAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 1,
    compressionLevel: 0,
    importance: 0.5,
    tags: [],
  };
}

// Helper to create associated memory
function createAssociatedMemory(memory: Memory, relevance: number): AssociatedMemory {
  return {
    memory,
    reason: 'keyword-match',
    relevance,
    matchedKeywords: memory.keywords,
  };
}

describe('OperationDecider', () => {
  let decider: OperationDecider;

  beforeEach(() => {
    decider = createOperationDecider();
  });

  describe('NOOP decisions', () => {
    it('should NOOP on ephemeral content', () => {
      const decision = decider.decide('ok', [], []);
      assert.strictEqual(decision.operation, 'NOOP');
      assert.strictEqual(decision.reason, 'ephemeral conversational content');
    });

    it('should NOOP on short content', () => {
      const decision = decider.decide('hi there', [], []);
      assert.strictEqual(decision.operation, 'NOOP');
      assert.ok(decision.reason.includes('too short'));
    });

    it('should NOOP on redundant content', () => {
      const existingMemory = createMemory('m1', 'Sophie builds OriginOS', ['sophie', 'originos']);
      const surfaced = [createAssociatedMemory(existingMemory, 0.95)];

      const decision = decider.decide('Sophie builds OriginOS', ['sophie', 'originos'], surfaced);
      assert.strictEqual(decision.operation, 'NOOP');
      assert.ok(decision.reason.includes('redundant'));
    });
  });

  describe('UPDATE decisions', () => {
    it('should UPDATE when content refines existing memory', () => {
      // Same entity (sophie), similar topic - should UPDATE
      const existingMemory = createMemory('m1', 'Sophie builds OriginOS', ['sophie', 'builds', 'originos']);
      const surfaced = [createAssociatedMemory(existingMemory, 0.7)];

      const testDecider = createOperationDecider({ updateSimilarityThreshold: 0.2 });
      const decision = testDecider.decide(
        'Sophie also builds OSL language for OriginOS',
        ['sophie', 'builds', 'osl', 'language', 'originos'],
        surfaced
      );
      assert.strictEqual(decision.operation, 'UPDATE');
      assert.strictEqual(decision.targetId, 'm1');
    });

    it('should UPDATE when content has refinement keywords', () => {
      const existingMemory = createMemory('m1', 'The project uses TypeScript', ['project', 'typescript', 'uses']);
      const surfaced = [createAssociatedMemory(existingMemory, 0.65)];

      const testDecider = createOperationDecider({ updateSimilarityThreshold: 0.3 });
      const decision = testDecider.decide(
        'The project actually now also uses JavaScript',
        ['project', 'uses', 'javascript'],
        surfaced
      );
      assert.strictEqual(decision.operation, 'UPDATE');
    });
  });

  describe('ADD decisions', () => {
    it('should ADD new unique content', () => {
      const decision = decider.decide(
        'I started a new project called Association',
        ['project', 'association'],
        []
      );
      assert.strictEqual(decision.operation, 'ADD');
    });

    it('should ADD when no similar memories exist', () => {
      const existingMemory = createMemory('m1', 'Pi temperature is 50C', ['pi', 'temperature']);
      const surfaced = [createAssociatedMemory(existingMemory, 0.3)];

      const decision = decider.decide(
        'Working on memory systems for AI agents',
        ['memory', 'ai', 'agents'],
        surfaced
      );
      assert.strictEqual(decision.operation, 'ADD');
    });
  });

  describe('findDeleteCandidates', () => {
    it('should find memories eligible for deletion', () => {
      const performance = [
        { memoryId: 'old-unused', surfaceCount: 5, usedCount: 0, successRate: 0, lastAccessedAt: new Date(), daysSinceUseful: 35 },
        { memoryId: 'recent-used', surfaceCount: 3, usedCount: 3, successRate: 1, lastAccessedAt: new Date(), daysSinceUseful: 1 },
      ];

      const candidates = decider.findDeleteCandidates(performance, {
        minAge: 30,
        maxSuccessRate: 0.2,
        minSurfaces: 3,
      });

      assert.strictEqual(candidates.length, 1);
      assert.strictEqual(candidates[0].memoryId, 'old-unused');
    });

    it('should not delete memories with insufficient data', () => {
      const performance = [
        { memoryId: 'new', surfaceCount: 1, usedCount: 0, successRate: 0, lastAccessedAt: new Date(), daysSinceUseful: 40 },
      ];

      const candidates = decider.findDeleteCandidates(performance, {
        minAge: 30,
        maxSuccessRate: 0.2,
        minSurfaces: 3,
      });

      assert.strictEqual(candidates.length, 0);
    });
  });

  describe('confidence scores', () => {
    it('should have high confidence for NOOP on ephemeral', () => {
      const decision = decider.decide('thanks', [], []);
      assert.ok(decision.confidence >= 0.8);
    });

    it('should have lower confidence for ADD', () => {
      const decision = decider.decide('Some new information about a project', ['project'], []);
      assert.ok(decision.confidence < 0.8);
    });
  });
});
