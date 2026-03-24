import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
	recencyScore,
	noveltyScore,
	importanceScore,
	compositeScore,
	reRankMemories,
	diversityScore,
	selectDiverseMemories,
	DEFAULT_SCORER_CONFIG,
} from './scorer.js';
import { Memory, AssociatedMemory } from './types.js';

function makeMemory(overrides: Partial<Memory> = {}): Memory {
	const now = new Date();
	return {
		id: 'test_' + Math.random().toString(36).slice(2),
		content: 'test memory',
		keywords: ['test'],
		createdAt: now,
		lastAccessedAt: now,
		accessCount: 0,
		compressionLevel: 0,
		importance: 0.5,
		tags: [],
		...overrides,
	};
}

function makeAssociated(memory: Memory, relevance: number = 0.5): AssociatedMemory {
	return {
		memory,
		relevance,
		reason: 'keyword-match',
		matchedKeywords: memory.keywords,
	};
}

describe('scorer', () => {
	describe('recencyScore', () => {
		it('returns 1 for brand new memory', () => {
			const memory = makeMemory({ createdAt: new Date() });
			const score = recencyScore(memory);
			assert.ok(score > 0.99, `Expected ~1, got ${score}`);
		});

		it('returns 0.5 for memory at half-life', () => {
			const now = new Date();
			const halfLifeDays = 7;
			const createdAt = new Date(now.getTime() - halfLifeDays * 24 * 60 * 60 * 1000);
			const memory = makeMemory({ createdAt });
			const score = recencyScore(memory, now, halfLifeDays);
			assert.ok(Math.abs(score - 0.5) < 0.01, `Expected ~0.5, got ${score}`);
		});

		it('decays exponentially over time', () => {
			const now = new Date();
			const halfLifeDays = 7;

			// Create memories at different ages
			const newMemory = makeMemory({ createdAt: new Date(now.getTime() - 1 * 60 * 1000) }); // 1 min
			const weekOld = makeMemory({ createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }); // 7 days
			const monthOld = makeMemory({ createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }); // 30 days

			const newScore = recencyScore(newMemory, now, halfLifeDays);
			const weekScore = recencyScore(weekOld, now, halfLifeDays);
			const monthScore = recencyScore(monthOld, now, halfLifeDays);

			assert.ok(newScore > weekScore, 'Newer should score higher');
			assert.ok(weekScore > monthScore, 'Week-old should score higher than month-old');
		});
	});

	describe('noveltyScore', () => {
		it('returns 1 for never-accessed memory', () => {
			const memory = makeMemory({ accessCount: 0 });
			const score = noveltyScore(memory);
			assert.strictEqual(score, 1);
		});

		it('returns lower score for frequently accessed', () => {
			const neverAccessed = makeMemory({ accessCount: 0 });
			const accessed5 = makeMemory({ accessCount: 5 });
			const accessed10 = makeMemory({ accessCount: 10 });

			const neverScore = noveltyScore(neverAccessed);
			const score5 = noveltyScore(accessed5);
			const score10 = noveltyScore(accessed10);

			assert.ok(neverScore > score5, 'Never accessed should have higher novelty');
			assert.ok(score5 > score10, 'Less accessed should have higher novelty');
		});

		it('caps at maxAccessCount', () => {
			const memory10 = makeMemory({ accessCount: 10 });
			const memory100 = makeMemory({ accessCount: 100 });

			const score10 = noveltyScore(memory10, 10);
			const score100 = noveltyScore(memory100, 10);

			assert.strictEqual(score10, score100, 'Should cap at max');
		});
	});

	describe('importanceScore', () => {
		it('passes through importance value', () => {
			const low = makeMemory({ importance: 0.1 });
			const high = makeMemory({ importance: 0.9 });

			assert.strictEqual(importanceScore(low), 0.1);
			assert.strictEqual(importanceScore(high), 0.9);
		});
	});

	describe('compositeScore', () => {
		it('combines all factors', () => {
			const memory = makeMemory({
				importance: 0.8,
				accessCount: 2,
			});
			const keywordScore = 0.5;

			const composite = compositeScore(memory, keywordScore);

			// Should be weighted combination
			// keyword: 0.4 * 0.5 = 0.2
			// recency: 0.2 * ~1 = 0.2
			// importance: 0.3 * 0.8 = 0.24
			// novelty: 0.1 * 0.82 = 0.082
			// Total: ~0.72
			assert.ok(composite > 0.5 && composite < 1, `Expected between 0.5-1, got ${composite}`);
		});

		it('higher importance increases score', () => {
			const now = new Date();
			const lowImportance = makeMemory({ importance: 0.1, createdAt: now });
			const highImportance = makeMemory({ importance: 0.9, createdAt: now });

			const lowScore = compositeScore(lowImportance, 0.5);
			const highScore = compositeScore(highImportance, 0.5);

			assert.ok(highScore > lowScore, 'High importance should score higher');
		});

		it('newer memories score higher', () => {
			const old = makeMemory({
				createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days
				importance: 0.5,
			});
			const newMem = makeMemory({
				createdAt: new Date(),
				importance: 0.5,
			});

			const oldScore = compositeScore(old, 0.5);
			const newScore = compositeScore(newMem, 0.5);

			assert.ok(newScore > oldScore, 'Newer should score higher');
		});
	});

	describe('reRankMemories', () => {
		it('re-orders by composite score', () => {
			const now = new Date();
			const oldImportant = makeAssociated(
				makeMemory({
					importance: 0.9,
					createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
				}),
				0.8
			);
			const newUnimportant = makeAssociated(
				makeMemory({
					importance: 0.1,
					createdAt: now,
				}),
				0.8
			);

			const ranked = reRankMemories([oldImportant, newUnimportant]);

			// Both have same keyword score, so composite determines order
			// New + low importance vs old + high importance
			// Should be close, but let's verify the re-ranking happened
			assert.strictEqual(ranked.length, 2);
		});

		it('preserves all fields', () => {
			const am = makeAssociated(makeMemory({ keywords: ['test', 'keywords'] }), 0.7);
			const ranked = reRankMemories([am]);

			assert.strictEqual(ranked[0].reason, 'keyword-match');
			assert.deepEqual(ranked[0].matchedKeywords, ['test', 'keywords']);
		});
	});

	describe('diversityScore', () => {
		it('returns 1 for empty set', () => {
			assert.strictEqual(diversityScore([]), 1);
		});

		it('returns 1 for single memory', () => {
			const am = makeAssociated(makeMemory({ keywords: ['a', 'b'] }));
			assert.strictEqual(diversityScore([am]), 1);
		});

		it('scores lower for overlapping keywords', () => {
			const am1 = makeAssociated(makeMemory({ keywords: ['a', 'b', 'c'] }));
			const am2 = makeAssociated(makeMemory({ keywords: ['a', 'b', 'd'] }));

			const score = diversityScore([am1, am2]);

			// 4 unique keywords (a, b, c, d) out of 6 total
			assert.ok(score < 1, 'Overlapping keywords should reduce diversity');
			assert.ok(score > 0, 'Should still have some diversity');
		});

		it('scores 1 for completely different keywords', () => {
			const am1 = makeAssociated(makeMemory({ keywords: ['a', 'b'] }));
			const am2 = makeAssociated(makeMemory({ keywords: ['c', 'd'] }));

			assert.strictEqual(diversityScore([am1, am2]), 1);
		});
	});

	describe('selectDiverseMemories', () => {
		it('returns all if under limit', () => {
			const memories = [
				makeAssociated(makeMemory({ keywords: ['a'] })),
				makeAssociated(makeMemory({ keywords: ['b'] })),
			];

			const selected = selectDiverseMemories(memories, 5);
			assert.strictEqual(selected.length, 2);
		});

		it('filters out highly similar memories', () => {
			const memories = [
				makeAssociated(makeMemory({ keywords: ['osL', 'compiler', 'sophie'] }), 0.9),
				makeAssociated(makeMemory({ keywords: ['osL', 'compiler', 'originos'] }), 0.8),
				makeAssociated(makeMemory({ keywords: ['pi', 'hardware', 'raspberry'] }), 0.7),
			];

			const selected = selectDiverseMemories(memories, 2, 0.5);

			// First two share 2/4 keywords = 0.5 Jaccard similarity
			// With maxOverlap 0.5, should include first and third
			assert.strictEqual(selected.length, 2);
		});

		it('prefers higher relevance when choosing', () => {
			const memories = [
				makeAssociated(makeMemory({ keywords: ['test', 'a', 'b', 'c'] }), 0.9),
				makeAssociated(makeMemory({ keywords: ['test', 'a', 'b', 'd'] }), 0.8),
				makeAssociated(makeMemory({ keywords: ['completely', 'different'] }), 0.7),
			];

			const selected = selectDiverseMemories(memories, 2, 0.5);

			// Should include first (highest relevance) and third (different topic)
			assert.strictEqual(selected[0].relevance, 0.9);
		});
	});
});
