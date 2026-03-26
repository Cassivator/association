/**
 * Association - Automatic semantic memory recall for AI agents
 *
 * @packageDocumentation
 */

export { Association, createAssociation, type ProcessResult } from './association.js';
export { MemoryStore, DEFAULT_CONFIG } from './store.js';
export { extractKeywords, flattenKeywords, keywordMatchScore } from './extractor.js';
export { compressMemory, shouldCompress, getDisplayContent } from './compressor.js';
export {
	levenshteinDistance,
	similarity,
	isSimilarKeyword,
	findBestMatch,
	ngrams,
	ngramSimilarity,
	fuzzyKeywordMatchScore,
} from './fuzzy.js';
export {
	recencyScore,
	noveltyScore,
	importanceScore,
	compositeScore,
	reRankMemories,
	diversityScore,
	selectDiverseMemories,
	DEFAULT_SCORER_CONFIG,
} from './scorer.js';
export type {
	Memory,
	MemoryAssociation,
	ExtractedKeywords,
	AssociationConfig,
	AssociatedMemory,
	IncomingMessage,
} from './types.js';

export type {
  MemoryFeedback,
  MemoryPerformance,
} from './types.js';

export { FeedbackTracker, createFeedbackTracker } from './feedback.js';

export { WeightAdapter, createWeightAdapter, DEFAULT_ADAPTIVE_CONFIG } from './adaptive.js';

export type {
  AdaptiveConfig,
  WeightContribution,
} from './adaptive.js';

export { OperationDecider, createOperationDecider, DEFAULT_OPERATION_CONFIG } from './operations.js';

export type {
  MemoryOperation,
  OperationDecision,
  OperationConfig,
} from './operations.js';
