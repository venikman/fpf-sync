import { readFile, mkdir } from 'node:fs/promises';
import { EPISTEMES_PATH, DATA_DIR, writeFileAtomic } from './util.ts';
import type { Episteme, CreateEpistemeInput, UpdateEpistemePatch } from './types.ts';

// Simple in-process mutex to serialize writes
class Mutex {
  private p: Promise<void> = Promise.resolve();
  lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = () => fn();
    const prev = this.p;
    let resolveNext: () => void;
    this.p = new Promise<void>(r => (resolveNext = r));
    return prev.then(run).finally(() => resolveNext!());
  }
}
const mutex = new Mutex();

async function ensureStoreFile(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(EPISTEMES_PATH, 'utf8');
  } catch {
    await writeFileAtomic(EPISTEMES_PATH, '[]');
  }
}

export async function listEpistemes(): Promise<Episteme[]> {
  await ensureStoreFile();
  const raw = await readFile(EPISTEMES_PATH, 'utf8');
  try {
    const arr = JSON.parse(raw) as Episteme[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function getEpistemeById(id: string): Promise<Episteme | undefined> {
  const all = await listEpistemes();
  return all.find(e => e.id === id);
}

export function createEpisteme(input: CreateEpistemeInput): Promise<Episteme> {
  return mutex.lock(async () => {
    const now = new Date().toISOString();
    const ep: Episteme = {
      id: crypto.randomUUID(),
      object: input.object,
      concept: input.concept,
      symbol: input.symbol,
      targets: input.targets,
      createdAt: now,
      updatedAt: now,
    };
    const all = await listEpistemes();
    all.push(ep);
    await writeFileAtomic(EPISTEMES_PATH, JSON.stringify(all, null, 2));
    return ep;
  });
}

export function updateEpisteme(id: string, patch: UpdateEpistemePatch): Promise<Episteme | undefined> {
  return mutex.lock(async () => {
    const all = await listEpistemes();
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return undefined;
    const cur = all[idx];
    const next: Episteme = {
      ...cur,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    all[idx] = next;
    await writeFileAtomic(EPISTEMES_PATH, JSON.stringify(all, null, 2));
    return next;
  });
}

export function deleteEpisteme(id: string): Promise<boolean> {
  return mutex.lock(async () => {
    const all = await listEpistemes();
    const next = all.filter(e => e.id !== id);
    const changed = next.length !== all.length;
    if (changed) {
      await writeFileAtomic(EPISTEMES_PATH, JSON.stringify(next, null, 2));
    }
    return changed;
  });
}
