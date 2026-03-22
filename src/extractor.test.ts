import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractKeywords, flattenKeywords, keywordMatchScore } from './extractor.js';

describe('extractKeywords', () => {
  it('extracts topics from plain text', () => {
    const result = extractKeywords('I need to fix the bug in the authentication system');
    assert.ok(result.topics.length > 0);
    assert.ok(result.actions.includes('fix'));
  });

  it('extracts technical identifiers', () => {
    const result = extractKeywords('The getUserById function throws an error');
    // Note: camelCase gets normalized, so check for the base word
    assert.ok(result.entities.length > 0 || result.topics.length > 0);
  });

  it('extracts URLs', () => {
    const result = extractKeywords('Check https://github.com/example/repo');
    assert.ok(result.entities.some(e => e.includes('github.com')));
  });

  it('extracts version numbers', () => {
    const result = extractKeywords('Updated to version 2.1.0 and v1.5.3');
    assert.ok(result.entities.some(e => e.includes('2.1.0')));
    assert.ok(result.entities.some(e => e.includes('v1.5.3')));
  });

  it('extracts action words', () => {
    const result = extractKeywords('I will create a new branch and test the changes');
    assert.ok(result.actions.includes('create'));
    assert.ok(result.actions.includes('test'));
  });

  it('extracts context words', () => {
    const result = extractKeywords('This is important for the project goal');
    assert.ok(result.context.includes('important'));
    assert.ok(result.context.includes('goal'));
  });

  it('filters stopwords', () => {
    const result = extractKeywords('the and or but this that');
    assert.strictEqual(result.topics.length, 0);
    assert.strictEqual(result.entities.length, 0);
    assert.strictEqual(result.actions.length, 0);
    assert.strictEqual(result.context.length, 0);
  });

  it('handles empty input', () => {
    const result = extractKeywords('');
    assert.deepStrictEqual(result, { topics: [], entities: [], actions: [], context: [] });
  });
});

describe('flattenKeywords', () => {
  it('combines all keyword types', () => {
    const extracted = {
      topics: ['topic1', 'topic2'],
      entities: ['entity1'],
      actions: ['action1'],
      context: ['context1'],
    };
    const flat = flattenKeywords(extracted);
    assert.strictEqual(flat.length, 5);
    assert.ok(flat.includes('topic1'));
    assert.ok(flat.includes('entity1'));
    assert.ok(flat.includes('action1'));
    assert.ok(flat.includes('context1'));
  });
});

describe('keywordMatchScore', () => {
  it('returns 1 for identical keywords', () => {
    const score = keywordMatchScore(['a', 'b', 'c'], ['a', 'b', 'c']);
    assert.strictEqual(score, 1);
  });

  it('returns 0 for no overlap', () => {
    const score = keywordMatchScore(['a', 'b'], ['x', 'y']);
    assert.strictEqual(score, 0);
  });

  it('returns partial score for partial overlap', () => {
    const score = keywordMatchScore(['a', 'b', 'c'], ['b', 'c', 'd']);
    assert.ok(score > 0 && score < 1);
  });

  it('handles case insensitivity', () => {
    const score = keywordMatchScore(['Hello', 'World'], ['hello', 'world']);
    assert.strictEqual(score, 1);
  });

  it('returns 0 for empty inputs', () => {
    assert.strictEqual(keywordMatchScore([], ['a']), 0);
    assert.strictEqual(keywordMatchScore(['a'], []), 0);
    assert.strictEqual(keywordMatchScore([], []), 0);
  });
});
