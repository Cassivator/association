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
    similarityThreshold: 0.3,
    minKeywordMatches: 2,
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
  
  // Process the message - this surfaces relevant memories
  const result = await association.process({
    content,
    metadata: {
      ...metadata,
      timestamp: new Date(),
    },
  });
  
  // If memories were surfaced, they're available in result.memories
  if (result.memories.length > 0) {
    console.log(`[Association] Surfaced ${result.memories.length} memories:`);
    for (const m of result.memories) {
      console.log(`  - "${m.memory.content.slice(0, 50)}..." (${m.reason}, relevance: ${m.relevance.toFixed(2)})`);
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
  const id = await association.remember(content, { tags, source });
  console.log(`[Association] Saved memory ${id}`);
  return id;
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
  surfacedMemories: ProcessResult['memories'];
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
    surfacedMemories: result.memories,
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
  
  // Split into sections and import each
  const sections = content.split(/^## /m).filter(Boolean);
  let imported = 0;
  
  for (const section of sections) {
    const lines = section.trim().split('\n');
    const title = lines[0];
    const body = lines.slice(1).join('\n').trim();
    
    if (body.length > 20) { // Only import substantial content
      await association.remember(
        `${title}\n\n${body}`,
        { 
          tags: ['memory-md', 'imported'],
          source: 'MEMORY.md'
        }
      );
      imported++;
    }
  }
  
  console.log(`[Association] Imported ${imported} sections from MEMORY.md`);
  return imported;
}

// Export a default configured instance
export default createOpenClawAssociation;
