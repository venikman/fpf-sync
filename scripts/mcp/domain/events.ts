import { appendFile, mkdir } from 'node:fs/promises';
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

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export async function appendEvent(rec: EventRecord): Promise<void> {
  await ensureDir(DATA_DIR);
  const line = JSON.stringify(rec) + '\n';
  const path = join(DATA_DIR, 'events.log');
  await appendFile(path, line, { encoding: 'utf8' });
}
