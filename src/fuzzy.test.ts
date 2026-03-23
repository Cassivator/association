import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  levenshteinDistance,
  similarity,
  isSimilarKeyword,
  findBestMatch,
  ngrams,
  ngramSimilarity,
  fuzzyKeywordMatchScore,
} from './fuzzy.js';

describe('Fuzzy Matching', () => {
  describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      assert.strictEqual(levenshteinDistance('hello', 'hello'), 0);
    });

    it('returns length for empty comparison', () => {
      assert.strictEqual(levenshteinDistance('hello', ''), 5);
      assert.strictEqual(levenshteinDistance('', 'world'), 5);
    });

    it('calculates single substitution', () => {
      assert.strictEqual(levenshteinDistance('cat', 'bat'), 1);
      assert.strictEqual(levenshteinDistance('hello', 'hallo'), 1);
    });

    it('calculates insertion', () => {
      assert.strictEqual(levenshteinDistance('cat', 'cats'), 1);
    });

    it('calculates deletion', () => {
      assert.strictEqual(levenshteinDistance('cats', 'cat'), 1);
    });

    it('is case insensitive when normalized', () => {
      const dist1 = levenshteinDistance('Hello', 'hello');
      const dist2 = levenshteinDistance('hello', 'hello');
      // Note: levenshteinDistance itself is case-sensitive, but similarity normalizes
      assert.strictEqual(dist1, 1); // H vs h
      assert.strictEqual(dist2, 0);
    });
  });

  describe('similarity', () => {
    it('returns 1 for identical strings', () => {
      assert.strictEqual(similarity('hello', 'hello'), 1);
    });

    it('returns 0 for empty strings', () => {
      assert.strictEqual(similarity('', 'hello'), 0);
      assert.strictEqual(similarity('hello', ''), 0);
    });

    it('returns correct ratio for similar strings', () => {
      const sim = similarity('kitten', 'sitten'); // 1 substitution
      assert.ok(sim >= 0.8 && sim <= 0.85);
    });

    it('is case insensitive', () => {
      assert.strictEqual(similarity('Hello', 'hello'), 1);
    });
  });

  describe('isSimilarKeyword', () => {
    it('returns true for exact matches', () => {
      assert.ok(isSimilarKeyword('originos', 'originos'));
    });

    it('returns true for case-insensitive matches', () => {
      assert.ok(isSimilarKeyword('OriginOS', 'originos'));
    });

    it('returns true for prefix matches', () => {
      assert.ok(isSimilarKeyword('association', 'assoc'));
      assert.ok(isSimilarKeyword('assoc', 'association'));
    });

    it('returns true for similar strings above threshold', () => {
      assert.ok(isSimilarKeyword('kitten', 'sitten', 0.7));
    });

    it('returns false for dissimilar strings', () => {
      assert.ok(!isSimilarKeyword('abc', 'xyz', 0.8));
    });
  });

  describe('findBestMatch', () => {
    it('finds exact match', () => {
      const result = findBestMatch('hello', ['world', 'hello', 'test']);
      assert.ok(result);
      assert.strictEqual(result!.candidate, 'hello');
      assert.strictEqual(result!.similarity, 1);
    });

    it('finds fuzzy match', () => {
      const result = findBestMatch('hallo', ['hello', 'world'], 0.7);
      assert.ok(result);
      assert.strictEqual(result!.candidate, 'hello');
    });

    it('returns null when no match meets threshold', () => {
      const result = findBestMatch('xyz', ['abc', 'def'], 0.8);
      assert.strictEqual(result, null);
    });
  });

  describe('ngrams', () => {
    it('extracts bigrams', () => {
      const grams = ngrams('hello', 2);
      assert.ok(grams.has('he'));
      assert.ok(grams.has('el'));
      assert.ok(grams.has('ll'));
      assert.ok(grams.has('lo'));
      assert.strictEqual(grams.size, 4);
    });

    it('handles short strings', () => {
      const grams = ngrams('hi', 2);
      assert.ok(grams.has('hi'));
      assert.strictEqual(grams.size, 1);
    });

    it('normalizes to lowercase', () => {
      const grams = ngrams('Hi!');
      assert.ok(grams.has('hi'));
    });
  });

  describe('ngramSimilarity', () => {
    it('returns 1 for identical strings', () => {
      assert.strictEqual(ngramSimilarity('hello', 'hello'), 1);
    });

    it('returns high for similar strings', () => {
      const sim = ngramSimilarity('hello', 'hallo');
      // hello: he, el, ll, lo (4 bigrams)
      // hallo: ha, al, ll, lo (4 bigrams)
      // intersection: ll, lo (2)
      // union: he, el, ll, lo, ha, al (6)
      // similarity: 2/6 = 0.333
      assert.ok(sim > 0.2);
    });

    it('returns low for dissimilar strings', () => {
      const sim = ngramSimilarity('abc', 'xyz');
      assert.ok(sim < 0.2);
    });
  });

  describe('fuzzyKeywordMatchScore', () => {
    it('returns 1 for identical keyword sets', () => {
      const score = fuzzyKeywordMatchScore(['a', 'b'], ['a', 'b']);
      assert.strictEqual(score, 1);
    });

    it('counts exact matches', () => {
      const score = fuzzyKeywordMatchScore(['a', 'b', 'c'], ['a', 'b', 'd']);
      // 2 exact matches out of union of 4
      assert.ok(score > 0 && score < 1);
    });

    it('counts fuzzy matches with lower weight', () => {
      const exactOnly = fuzzyKeywordMatchScore(['hello'], ['hello'], {
        fuzzyWeight: 0.5,
      });
      const fuzzyMatch = fuzzyKeywordMatchScore(['hallo'], ['hello'], {
        fuzzyThreshold: 0.7,
        fuzzyWeight: 0.5,
      });

      // Exact match should score higher than fuzzy
      assert.ok(exactOnly > fuzzyMatch);
      // But fuzzy should still give some score
      assert.ok(fuzzyMatch > 0);
    });

    it('returns 0 for empty keyword sets', () => {
      assert.strictEqual(fuzzyKeywordMatchScore([], ['a']), 0);
      assert.strictEqual(fuzzyKeywordMatchScore(['a'], []), 0);
    });
  });
});
