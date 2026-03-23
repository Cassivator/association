/**
 * Fuzzy matching utilities for memory association
 *
 * Provides simple string similarity without requiring ML embeddings.
 * Good enough for catching typos and partial matches.
 */

/**
 * Calculate Levenshtein distance between two strings
 * The minimum number of single-character edits to transform a into b
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Create a matrix of size (m+1) x (n+1)
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  // Initialize base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill in the rest
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity ratio between two strings (0 to 1)
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

/**
 * Check if two keywords are similar enough to be considered a match
 */
export function isSimilarKeyword(a: string, b: string, threshold = 0.8): boolean {
  // Exact match
  if (a.toLowerCase() === b.toLowerCase()) return true;

  // Prefix match (common for typos like "originos" vs "originos")
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower.startsWith(bLower) || bLower.startsWith(aLower)) return true;

  // Check similarity
  return similarity(a, b) >= threshold;
}

/**
 * Find the best fuzzy match for a keyword in a list of candidates
 */
export function findBestMatch(
  keyword: string,
  candidates: string[],
  threshold = 0.7
): { candidate: string; similarity: number } | null {
  let best: { candidate: string; similarity: number } | null = null;

  for (const candidate of candidates) {
    const sim = similarity(keyword, candidate);
    if (sim >= threshold && (!best || sim > best.similarity)) {
      best = { candidate, similarity: sim };
    }
  }

  return best;
}

/**
 * Extract n-grams from a string
 * Useful for partial matching
 */
export function ngrams(str: string, n: number = 2): Set<string> {
  const normalized = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const grams = new Set<string>();

  for (let i = 0; i <= normalized.length - n; i++) {
    grams.add(normalized.slice(i, i + n));
  }

  return grams;
}

/**
 * Calculate Jaccard similarity between two sets of n-grams
 */
export function ngramSimilarity(a: string, b: string, n: number = 2): number {
  const gramsA = ngrams(a, n);
  const gramsB = ngrams(b, n);

  if (gramsA.size === 0 || gramsB.size === 0) return 0;

  let intersection = 0;
  for (const g of gramsA) {
    if (gramsB.has(g)) intersection++;
  }

  const union = gramsA.size + gramsB.size - intersection;
  return intersection / union;
}

/**
 * Enhanced keyword match score with fuzzy matching
 */
export function fuzzyKeywordMatchScore(
  keywords1: string[],
  keywords2: string[],
  options: {
    exactWeight?: number;
    fuzzyWeight?: number;
    fuzzyThreshold?: number;
  } = {}
): number {
  const { exactWeight = 1, fuzzyWeight = 0.5, fuzzyThreshold = 0.8 } = options;

  if (keywords1.length === 0 || keywords2.length === 0) return 0;

  const set1 = new Set(keywords1.map(k => k.toLowerCase()));
  const set2 = new Set(keywords2.map(k => k.toLowerCase()));

  let exactMatches = 0;
  let fuzzyMatches = 0;

  for (const k1 of set1) {
    if (set2.has(k1)) {
      exactMatches++;
    } else {
      // Try fuzzy match
      for (const k2 of set2) {
        if (isSimilarKeyword(k1, k2, fuzzyThreshold) && k1 !== k2) {
          fuzzyMatches++;
          break;
        }
      }
    }
  }

  const weightedMatches = exactMatches * exactWeight + fuzzyMatches * fuzzyWeight;
  const union = set1.size + set2.size - exactMatches;

  return weightedMatches / union;
}
