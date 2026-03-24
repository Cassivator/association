/**
 * Relevance scoring for memory retrieval
 *
 * Addresses the "retrieval noise" problem identified in memory-augmented systems.
 * Uses multiple signals to rank memories more accurately than simple keyword match.
 */

import { Memory, AssociatedMemory } from './types.js';

/**
 * Scoring configuration
 */
export interface ScorerConfig {
	/** How much recency matters (0-1, default 0.2) */
	recencyWeight: number;
	/** How much importance matters (0-1, default 0.3) */
	importanceWeight: number;
	/** How much novelty matters (0-1, default 0.1) - penalizes frequently accessed */
	noveltyWeight: number;
	/** Half-life for recency decay in days (default 7) */
	recencyHalfLifeDays: number;
	/** Maximum access count to consider for novelty (default 10) */
	maxAccessCountForNovelty: number;
}

export const DEFAULT_SCORER_CONFIG: ScorerConfig = {
	recencyWeight: 0.2,
	importanceWeight: 0.3,
	noveltyWeight: 0.1,
	recencyHalfLifeDays: 7,
	maxAccessCountForNovelty: 10,
};

/**
 * Calculate recency score (0-1, higher = more recent)
 * Uses exponential decay with configurable half-life
 */
export function recencyScore(
	memory: Memory,
	now: Date = new Date(),
	halfLifeDays: number = 7
): number {
	const ageMs = now.getTime() - memory.createdAt.getTime();
	const ageDays = ageMs / (24 * 60 * 60 * 1000);
	// Exponential decay: score = 0.5 ^ (age / halfLife)
	return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Calculate novelty score (0-1, higher = less accessed)
 * Penalizes memories that have been surfaced many times
 */
export function noveltyScore(
	memory: Memory,
	maxAccessCount: number = 10
): number {
	// Score decreases as access count increases
	// At maxAccessCount, score is ~0.1
	const normalized = Math.min(memory.accessCount, maxAccessCount) / maxAccessCount;
	return 1 - normalized * 0.9; // Range: 1.0 (never accessed) to 0.1 (max accessed)
}

/**
 * Calculate importance score (just passes through the importance field)
 */
export function importanceScore(memory: Memory): number {
	return memory.importance;
}

/**
 * Calculate composite relevance score for a memory
 * Combines keyword match score with recency, importance, and novelty
 */
export function compositeScore(
	memory: Memory,
	keywordScore: number,
	config: ScorerConfig = DEFAULT_SCORER_CONFIG
): number {
	const recency = recencyScore(memory, new Date(), config.recencyHalfLifeDays);
	const importance = importanceScore(memory);
	const novelty = noveltyScore(memory, config.maxAccessCountForNovelty);

	// Keyword match is the primary signal (weight = 1 - other weights)
	const keywordWeight = 1 - config.recencyWeight - config.importanceWeight - config.noveltyWeight;

	// Weighted combination
	return (
		keywordWeight * keywordScore +
		config.recencyWeight * recency +
		config.importanceWeight * importance +
		config.noveltyWeight * novelty
	);
}

/**
 * Re-rank associated memories using composite scoring
 */
export function reRankMemories(
	memories: AssociatedMemory[],
	config: ScorerConfig = DEFAULT_SCORER_CONFIG
): AssociatedMemory[] {
	// Calculate composite scores
	const scored = memories.map(am => ({
		...am,
		relevance: compositeScore(am.memory, am.relevance, config),
	}));

	// Sort by composite score
	scored.sort((a, b) => b.relevance - a.relevance);

	return scored;
}

/**
 * Calculate diversity score for a set of memories
 * Helps avoid surfacing multiple memories about the same topic
 */
export function diversityScore(memories: AssociatedMemory[]): number {
	if (memories.length === 0) return 1;

	// Count unique keywords across all memories
	const allKeywords = new Set<string>();
	for (const am of memories) {
		for (const kw of am.memory.keywords) {
			allKeywords.add(kw.toLowerCase());
		}
	}

	// Higher diversity = more unique keywords relative to total
	const totalKeywords = memories.reduce(
		(sum, am) => sum + am.memory.keywords.length,
		0
	);

	if (totalKeywords === 0) return 1;
	return allKeywords.size / totalKeywords;
}

/**
 * Select diverse memories from candidates
 * Avoids returning multiple memories with high keyword overlap
 */
export function selectDiverseMemories(
	candidates: AssociatedMemory[],
	maxResults: number,
	maxOverlapRatio: number = 0.7
): AssociatedMemory[] {
	if (candidates.length <= maxResults) return candidates;

	const selected: AssociatedMemory[] = [];

	for (const candidate of candidates) {
		if (selected.length >= maxResults) break;

		// Check overlap with already selected memories
		let tooSimilar = false;
		const candidateKeywords = new Set(candidate.memory.keywords.map(k => k.toLowerCase()));

		for (const existing of selected) {
			const existingKeywords = new Set(existing.memory.keywords.map(k => k.toLowerCase()));

			// Calculate Jaccard similarity
			const intersection = new Set(
				[...candidateKeywords].filter(k => existingKeywords.has(k))
			);
			const union = new Set([...candidateKeywords, ...existingKeywords]);

			if (union.size > 0 && intersection.size / union.size > maxOverlapRatio) {
				tooSimilar = true;
				break;
			}
		}

		if (!tooSimilar) {
			selected.push(candidate);
		}
	}

	return selected;
}
