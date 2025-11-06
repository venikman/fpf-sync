import { appendFile, mkdir, stat, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from '../util.ts';

export type EventEnvelope = {
  ctx: string;
  PathId?: string;
  PathSliceId?: string;
  editions?: string[];
  performedBy?: string;
};

export type EventRecord = {
  type:
    | 'RoleAssigned'
    | 'StateAsserted'
    | 'WorkStarted'
    | 'WorkEnded'
    | 'EvidenceBound'
    | 'ServiceEvaluated'
    | 'ParityRun'
    | 'TrustScored'
    | 'UTSPublished'
    | 'DRRRecorded';
  ts: string; // ISO timestamp
  envelope: EventEnvelope;
  payload: unknown;
};

// Log rotation configuration
const MAX_LOG_SIZE = Number(process.env.FPF_MAX_LOG_SIZE) || 100 * 1024 * 1024; // 100MB default
const MAX_ROTATIONS = Number(process.env.FPF_MAX_LOG_ROTATIONS) || 5; // Keep 5 rotated logs

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

/**
 * Rotate log files: current → .1, .1 → .2, ..., .4 → .5
 * Deletes .5 if it exists (oldest log)
 */
async function rotateLog(logPath: string): Promise<void> {
  // Delete oldest rotation if it exists
  const oldestPath = `${logPath}.${MAX_ROTATIONS}`;
  try {
    await unlink(oldestPath);
    console.log(`[events] Deleted oldest log: ${oldestPath}`);
  } catch {
    // File doesn't exist, that's fine
  }

  // Shift existing rotations: .4 → .5, .3 → .4, .2 → .3, .1 → .2
  for (let i = MAX_ROTATIONS - 1; i >= 1; i--) {
    const fromPath = `${logPath}.${i}`;
    const toPath = `${logPath}.${i + 1}`;
    try {
      await rename(fromPath, toPath);
    } catch {
      // File doesn't exist, continue
    }
  }

  // Rotate current log to .1
  try {
    await rename(logPath, `${logPath}.1`);
    console.log(`[events] Rotated log: ${logPath} → ${logPath}.1`);
  } catch (err) {
    console.error(`[events] Failed to rotate log:`, err);
  }
}

/**
 * Check log size and rotate if needed, then append event
 */
export async function appendEvent(rec: EventRecord): Promise<void> {
  await ensureDir(DATA_DIR);
  const path = join(DATA_DIR, 'events.log');

  // Check if rotation is needed
  try {
    const stats = await stat(path);
    if (stats.size > MAX_LOG_SIZE) {
      console.log(`[events] Log size ${stats.size} exceeds limit ${MAX_LOG_SIZE}, rotating...`);
      await rotateLog(path);
    }
  } catch (err) {
    // File doesn't exist yet, that's fine
    if ((err as any).code !== 'ENOENT') {
      console.error(`[events] Error checking log size:`, err);
    }
  }

  // Append the event
  const line = JSON.stringify(rec) + '\n';
  await appendFile(path, line, { encoding: 'utf8' });
}

/**
 * Get event log statistics
 */
export async function getEventLogStats() {
  const logPath = join(DATA_DIR, 'events.log');
  const stats = {
    currentLogSize: 0,
    currentLogPath: logPath,
    rotatedLogs: [] as Array<{ path: string; size: number }>,
    totalSize: 0,
  };

  // Check current log
  try {
    const s = await stat(logPath);
    stats.currentLogSize = s.size;
    stats.totalSize += s.size;
  } catch {
    // File doesn't exist
  }

  // Check rotated logs
  for (let i = 1; i <= MAX_ROTATIONS; i++) {
    const rotatedPath = `${logPath}.${i}`;
    try {
      const s = await stat(rotatedPath);
      stats.rotatedLogs.push({ path: rotatedPath, size: s.size });
      stats.totalSize += s.size;
    } catch {
      // File doesn't exist
    }
  }

  return stats;
}
