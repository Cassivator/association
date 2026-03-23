/**
 * Association - Automatic semantic memory recall for AI agents
 *
 * @packageDocumentation
 */

export { Association, createAssociation, type ProcessResult } from './association.js';
export { MemoryStore, DEFAULT_CONFIG } from './store.js';
export { extractKeywords, flattenKeywords, keywordMatchScore } from './extractor.js'; export { compressMemory, shouldCompress, getDisplayContent } from './compressor.js';
export type {
  Memory,
  MemoryAssociation,
  ExtractedKeywords,
  AssociationConfig,
  AssociatedMemory,
  IncomingMessage,
} from './types.js';
