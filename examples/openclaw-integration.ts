/**
 * OpenClaw Integration Example for Association
 *
 * This shows how to use Association with OpenClaw's memory system.
 * Place this in your workspace and import it from your HEARTBEAT.md processing.
 */

import { createAssociation, type ProcessResult } from '../src/index.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// OpenClaw workspace memory directory
const OPENCLAW_MEMORY_DIR = process.env.OPENCLAW_WORKSPACE || '/home/sophie/.openclaw/workspace';

/**
 * Create an Association instance configured for OpenClaw
 */
export function createOpenClawAssociation() {
  return createAssociation({
    memoryDir: join(OPENCLAW_MEMORY_DIR, 'association-memory'),
    maxWorkingSet: 100,
    similarityThreshold: 0.1, // Lower threshold for better recall
    minKeywordMatches: 1,
    compressionAgeDays: 7,
    maxSurfacedMemories: 5,
  });
}

/**
 * Process an incoming message and surface relevant memories
 *
 * Call this from your heartbeat handler or message processor
 */
export async function processMessage(
  content: string,
  metadata?: { sender?: string; channel?: string }
): Promise<ProcessResult> {
  const association = createOpenClawAssociation();
  await association.init();

  // Process the message - this surfaces relevant memories
  const result = await association.process({
    content,
    metadata: {
      ...metadata,
      timestamp: new Date(),
    },
  });

  // If memories were surfaced, they're available in result.surfaced
  if (result.surfaced.length > 0) {
    console.log(`[Association] Surfaced ${result.surfaced.length} memories:`);
    for (const m of result.surfaced) {
      console.log(` - "${m.memory.content.slice(0, 50)}..." (${m.reason}, relevance: ${m.relevance.toFixed(2)})`);
    }
  }

  return result;
}

/**
 * Save a memory from conversation
 *
 * Call this when something important happens that should be remembered
 */
export async function saveMemory(
  content: string,
  tags?: string[],
  source?: string
): Promise<string> {
  const association = createOpenClawAssociation();
  await association.init();
  const memory = await association.remember(content, { tags, source });
  console.log(`[Association] Saved memory ${memory.id}`);
  return memory.id;
}

/**
 * Example: Integrate with OpenClaw heartbeat
 *
 * Add this to your HEARTBEAT.md processing:
 *
 * ```
 * ### Memory Association Check
 * - Run processMessage on current context
 * - Surface relevant past memories
 * - Save important new context
 * ```
 */
export async function heartbeatMemoryCheck(
  currentContext: string,
  importantFacts?: string[]
): Promise<{
  surfacedMemories: ProcessResult['surfaced'];
  newMemoryIds: string[];
}> {
  // Process current context to surface relevant memories
  const result = await processMessage(currentContext);

  // Save any important facts as new memories
  const newMemoryIds: string[] = [];
  if (importantFacts) {
    for (const fact of importantFacts) {
      const id = await saveMemory(fact, ['heartbeat', 'important']);
      newMemoryIds.push(id);
    }
  }

  return {
    surfacedMemories: result.surfaced,
    newMemoryIds,
  };
}

/**
 * Example: Sync with MEMORY.md
 *
 * This reads your MEMORY.md and imports it into Association
 */
export async function syncFromMemoryDotMd(): Promise<number> {
  const memoryPath = join(OPENCLAW_MEMORY_DIR, 'MEMORY.md');
  if (!existsSync(memoryPath)) {
    console.log('[Association] No MEMORY.md found');
    return 0;
  }

  const content = readFileSync(memoryPath, 'utf-8');
  const association = createOpenClawAssociation();
  await association.init();

  // Parse sections by tracking headings (## and ###)
  const lines = content.split('\n');
  const sections: { title: string; content: string }[] = [];
  let currentTitle = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    // Match ## or ### headings
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      // Save previous section if it has content
      if (currentContent.length > 0) {
        const body = currentContent.join('\n').trim();
        if (body.length > 20) {
          sections.push({ title: currentTitle, content: body });
        }
      }
      currentTitle = headingMatch[2];
      currentContent = [];
    } else if (!line.match(/^---/) && !line.match(/^# MEMORY/)) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentContent.length > 0) {
    const body = currentContent.join('\n').trim();
    if (body.length > 20) {
      sections.push({ title: currentTitle, content: body });
    }
  }

  let imported = 0;
  for (const section of sections) {
    await association.remember(
      `${section.title}\n\n${section.content}`,
      { tags: ['memory-md', 'imported'], source: 'MEMORY.md' }
    );
    imported++;
  }

  console.log(`[Association] Imported ${imported} sections from MEMORY.md`);
  return imported;
}

// Export a default configured instance
export default createOpenClawAssociation;
