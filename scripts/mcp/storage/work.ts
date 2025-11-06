import { makeSqliteStore } from './sqlite.ts';
import type { Work } from '../domain/types.ts';

const store = makeSqliteStore<Work>('work');

export async function listWork() {
  return store.list();
}

export async function getWork(id: string) {
  return store.get(id);
}

export async function upsertWork(item: Work) {
  return store.upsert(item);
}
