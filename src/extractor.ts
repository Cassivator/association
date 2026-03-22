/**
 * Keyword extraction for memory association
 *
 * Extracts keywords from messages that can be used to surface relevant memories.
 * This is the core mechanism that makes memories "pop up" when you need them.
 */

import { ExtractedKeywords } from './types.js';

/**
 * Common stopwords to filter out
 */
const STOPWORDS = new Set([
  // English
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
  'we', 'they', 'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'not', 'only', 'same', 'so', 'than', 'too', 'very',
  'just', 'also', 'now', 'here', 'there', 'then', 'once', 'again',
  'if', 'because', 'until', 'while', 'about', 'against', 'between',
  'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
  'out', 'off', 'over', 'under', 'into', 'away', 'back', 'well',
]);

/**
 * Patterns for extracting different keyword types
 */
const PATTERNS = {
  // Technical terms (camelCase, PascalCase, snake_case, etc)
  technical: /\b([A-Z][a-z]+[A-Z][a-z]+|[a-z]+_[a-z_]+|[a-z]+\.[a-z.]+)\b/g,

  // URLs and file paths
  url: /(https?:\/\/[^\s]+|[\/~][\w\/.-]+)/g,

  // Numbers with units
  measurement: /\b(\d+(?:\.\d+)?)\s*(bytes?|kb|mb|gb|tb|ms|s|m|h|d|px|%)\b/gi,

  // Version numbers
  version: /\b(v?\d+\.\d+(?:\.\d+)?(?:-[a-z0-9]+)?)\b/gi,

  // Code-like identifiers
  identifier: /\b([a-z_][a-z0-9_]*(?:\(\)|\.[a-z_][a-z0-9_]*)+)\b/gi,
};

/**
 * Action words that indicate what's happening
 */
const ACTION_WORDS = new Set([
  'fix', 'fixes', 'fixed', 'fixing',
  'add', 'adds', 'added', 'adding',
  'remove', 'removes', 'removed', 'removing',
  'update', 'updates', 'updated', 'updating',
  'create', 'creates', 'created', 'creating',
  'delete', 'deletes', 'deleted', 'deleting',
  'change', 'changes', 'changed', 'changing',
  'build', 'builds', 'built', 'building',
  'run', 'runs', 'ran', 'running',
  'test', 'tests', 'tested', 'testing',
  'check', 'checks', 'checked', 'checking',
  'find', 'finds', 'found', 'finding',
  'search', 'searches', 'searched', 'searching',
  'load', 'loads', 'loaded', 'loading',
  'save', 'saves', 'saved', 'saving',
  'send', 'sends', 'sent', 'sending',
  'receive', 'receives', 'received', 'receiving',
  'connect', 'connects', 'connected', 'connecting',
  'disconnect', 'disconnects', 'disconnected', 'disconnecting',
  'start', 'starts', 'started', 'starting',
  'stop', 'stops', 'stopped', 'stopping',
  'error', 'errors', 'errored', 'erroring',
  'fail', 'fails', 'failed', 'failing',
  'succeed', 'succeeds', 'succeeded', 'succeeding',
  'work', 'works', 'worked', 'working',
  'learn', 'learns', 'learned', 'learning',
  'remember', 'remembers', 'remembered', 'remembering',
  'forget', 'forgets', 'forgot', 'forgetting',
  'think', 'thinks', 'thought', 'thinking',
  'want', 'wants', 'wanted', 'wanting',
  'need', 'needs', 'needed', 'needing',
  'like', 'likes', 'liked', 'liking',
  'love', 'loves', 'loved', 'loving',
  'hate', 'hates', 'hated', 'hating',
  'prefer', 'prefers', 'preferred', 'preferring',
]);

/**
 * Context words that set the scene
 */
const CONTEXT_WORDS = new Set([
  'important', 'urgent', 'critical', 'minor', 'major',
  'bug', 'feature', 'issue', 'problem', 'solution',
  'idea', 'thought', 'question', 'answer', 'decision',
  'todo', 'task', 'project', 'goal', 'plan',
  'today', 'tomorrow', 'yesterday', 'later', 'soon',
  'always', 'never', 'sometimes', 'often', 'rarely',
  'maybe', 'probably', 'definitely', 'possibly', 'likely',
  'better', 'worse', 'best', 'worst', 'good', 'bad',
]);

/**
 * Extract keywords from a message
 */
export function extractKeywords(text: string): ExtractedKeywords {
  const normalizedText = text.toLowerCase();

  // Extract words, filtering stopwords
  const words = normalizedText
    .replace(/[^\w\s.-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));

  // Categorize words
  const topics: string[] = [];
  const entities: string[] = [];
  const actions: string[] = [];
  const context: string[] = [];

  // Check each word
  for (const word of words) {
    if (ACTION_WORDS.has(word)) {
      actions.push(word);
    } else if (CONTEXT_WORDS.has(word)) {
      context.push(word);
    } else if (/^[A-Z]/.test(word) || word.includes('_') || word.includes('.')) {
      // Likely an entity/technical term
      entities.push(word);
    } else {
      topics.push(word);
    }
  }

  // Extract pattern-based keywords
  const technical = text.match(PATTERNS.technical) || [];
  const urls = text.match(PATTERNS.url) || [];
  const versions = text.match(PATTERNS.version) || [];

  entities.push(...technical, ...urls, ...versions);

  // Deduplicate
  return {
    topics: [...new Set(topics)],
    entities: [...new Set(entities)],
    actions: [...new Set(actions)],
    context: [...new Set(context)],
  };
}

/**
 * Flatten extracted keywords into a single array
 */
export function flattenKeywords(extracted: ExtractedKeywords): string[] {
  return [
    ...extracted.topics,
    ...extracted.entities,
    ...extracted.actions,
    ...extracted.context,
  ];
}

/**
 * Calculate keyword match score between two keyword sets
 */
export function keywordMatchScore(
  keywords1: string[],
  keywords2: string[]
): number {
  if (keywords1.length === 0 || keywords2.length === 0) {
    return 0;
  }

  const set1 = new Set(keywords1.map(k => k.toLowerCase()));
  const set2 = new Set(keywords2.map(k => k.toLowerCase()));

  let matches = 0;
  for (const k of set1) {
    if (set2.has(k)) {
      matches++;
    }
  }

  // Jaccard similarity
  const union = set1.size + set2.size - matches;
  return matches / union;
}
