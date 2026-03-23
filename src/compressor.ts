/**
 * Memory compression for Association
 *
 * Implements progressive compression: raw → summarized → distilled
 * This helps manage memory growth while preserving what matters.
 */

import type { Memory } from './types.js';

/**
 * Compression rules - what to preserve at each level
 */
const COMPRESSION_RULES = {
  // Level 1: Summarized - keep key facts, lose details
  summarized: {
    maxSentences: 3,
    preserveKeywords: true,
    preserveEntities: true,
  },
  // Level 2: Distilled - just the essence
  distilled: {
    maxSentences: 1,
    preserveKeywords: true,
    preserveEntities: false,
  },
};

/**
 * Simple sentence splitter
 */
function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Extract key sentences that contain important keywords/entities
 */
function extractKeySentences(
  sentences: string[],
  keywords: string[],
  maxSentences: number
): string[] {
  // Score each sentence by keyword presence
  const scored = sentences.map(sentence => {
    const lower = sentence.toLowerCase();
    let score = 0;
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    return { sentence, score };
  });

  // Sort by score, take top N
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .map(s => s.sentence);
}

/**
 * Compress a memory to the next level
 *
 * @param memory - The memory to compress
 * @param targetLevel - The target compression level (1 or 2)
 * @returns Compressed content
 */
export function compressMemory(
  memory: Memory,
  targetLevel: 1 | 2
): string {
  const content = memory.compressedContent || memory.content;
  const rules = targetLevel === 1
    ? COMPRESSION_RULES.summarized
    : COMPRESSION_RULES.distilled;

  const sentences = splitSentences(content);

  if (sentences.length <= rules.maxSentences) {
    // Already short enough
    return content;
  }

  // Build keyword list for scoring
  const keywords = [
    ...memory.keywords,
    ...(rules.preserveEntities ? memory.tags : []),
  ];

  const keySentences = extractKeySentences(
    sentences,
    keywords,
    rules.maxSentences
  );

  // Join with proper punctuation
  return keySentences
    .map(s => s.endsWith('.') ? s : s + '.')
    .join(' ');
}

/**
 * Check if a memory should be compressed
 *
 * @param memory - The memory to check
 * @param compressionAgeDays - Days before compression
 * @returns The target compression level, or null if no compression needed
 */
export function shouldCompress(
  memory: Memory,
  compressionAgeDays: number
): 1 | 2 | null {
  const ageDays =
    (Date.now() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // Already at max compression
  if (memory.compressionLevel === 2) {
    return null;
  }

  // Upgrade to distilled (from summarized)
  if (memory.compressionLevel === 1 && ageDays > compressionAgeDays * 2) {
    return 2;
  }

  // Upgrade to summarized (from raw)
  if (memory.compressionLevel === 0 && ageDays > compressionAgeDays) {
    return 1;
  }

  return null;
}

/**
 * Get the display content for a memory
 * (uses compressed version if available)
 */
export function getDisplayContent(memory: Memory): string {
  return memory.compressedContent || memory.content;
}
