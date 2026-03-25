/**
 * Core types for Association memory system
 */

/**
 * A single memory entry
 */
export interface Memory {
  /** Unique identifier */
  id: string;
  /** Raw content of the memory */
  content: string;
  /** Extracted keywords for fast retrieval */
  keywords: string[];
  /** Semantic embedding vector (optional, for similarity search) */
  embedding?: number[];
  /** When the memory was created */
  createdAt: Date;
  /** When the memory was last accessed */
  lastAccessedAt: Date;
  /** Access count - how often this memory has been surfaced */
  accessCount: number;
  /** Compression level: 0=raw, 1=summarized, 2=distilled */
  compressionLevel: 0 | 1 | 2;
  /** If compressed, the compressed version */
  compressedContent?: string;
  /** Source of the memory (conversation id, file, etc) */
  source?: string;
  /** Importance score (0-1) */
  importance: number;
  /** Tags for categorization */
  tags: string[];
}

/**
 * A memory association - links between memories
 */
export interface MemoryAssociation {
  /** Source memory id */
  fromId: string;
  /** Target memory id */
  toId: string;
  /** Association strength (0-1) */
  strength: number;
  /** How the memories are related */
  relationType: 'same-topic' | 'cause-effect' | 'reference' | 'temporal' | 'semantic';
}

/**
 * Result of keyword extraction
 */
export interface ExtractedKeywords {
  /** Main topics/entities */
  topics: string[];
  /** Named entities mentioned */
  entities: string[];
  /** Action words */
  actions: string[];
  /** Emotional/contextual keywords */
  context: string[];
}

/**
 * Configuration for Association
 */
export interface AssociationConfig {
  /** Directory to store memories */
  memoryDir: string;
  /** Maximum memories to keep in working set */
  maxWorkingSet: number;
  /** Threshold for semantic similarity (0-1) */
  similarityThreshold: number;
  /** Minimum keyword match count to surface memory */
  minKeywordMatches: number;
  /** Days before memory is compressed */
  compressionAgeDays: number;
  /** Maximum memories to surface per message */
  maxSurfacedMemories: number;
  /** Enable fuzzy keyword matching */
  enableFuzzy?: boolean;
  /** Fuzzy match threshold (0-1, default 0.8) */
  fuzzyThreshold?: number;
}

/**
 * Result of memory association lookup
 */
export interface AssociatedMemory {
  memory: Memory;
  /** Why this memory was surfaced */
  reason: 'keyword-match' | 'semantic-similarity' | 'association' | 'temporal' | 'fuzzy-match';
  /** Relevance score (0-1) */
  relevance: number;
  /** Matched keywords */
  matchedKeywords: string[];
}

/**
 * A message being processed
 */
export interface IncomingMessage {
  /** Message content */
  content: string;
  /** Message metadata */
  metadata?: {
    sender?: string;
    channel?: string;
    timestamp?: Date;
    replyTo?: string;
  };
}

/**
 * Feedback on memory retrieval quality (for RL-based improvement)
 */
export interface MemoryFeedback {
  /** Memory that was surfaced or considered */
  memoryId: string;
  /** Whether this memory was surfaced to the agent */
  surfaced: boolean;
  /** Whether the agent referenced/used this memory */
  used: boolean;
  /** Whether this memory led to a good outcome (null if unknown) */
  helpful: boolean | null;
  /** When feedback was recorded */
  timestamp: Date;
  /** Context of the feedback (optional) */
  context?: string;
}

/**
 * Aggregate performance metrics for a memory
 */
export interface MemoryPerformance {
  /** Memory ID */
  memoryId: string;
  /** How often this memory was surfaced */
  surfaceCount: number;
  /** How often surfaced memories were used */
  usedCount: number;
  /** Success rate (usedCount / surfaceCount) */
  successRate: number;
  /** Last time this memory was accessed */
  lastAccessedAt: Date;
  /** Days since last useful access (used=true) */
  daysSinceUseful: number | null;
}
