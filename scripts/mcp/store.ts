import { makeSqliteStore } from './storage/sqlite.ts';
import type { Episteme, CreateEpistemeInput, UpdateEpistemePatch } from './types.ts';

const store = makeSqliteStore<Episteme>('epistemes');

export async function listEpistemes(): Promise<Episteme[]> {
  return store.list();
}

export async function getEpistemeById(id: string): Promise<Episteme | undefined> {
  return store.get(id);
}

export async function createEpisteme(input: CreateEpistemeInput): Promise<Episteme> {
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
  return store.upsert(ep);
}

export async function updateEpisteme(id: string, patch: UpdateEpistemePatch): Promise<Episteme | undefined> {
  return store.update(id, patch);
}

export async function deleteEpisteme(id: string): Promise<boolean> {
  return store.remove(id);
}
