import { makeSqliteStore } from './sqlite.ts';
import type { MethodDescription } from '../domain/types.ts';

const store = makeSqliteStore<MethodDescription>('methods');

export async function listMethods() {
  return store.list();
}

export async function getMethod(id: string) {
  return store.get(id);
}

export async function upsertMethod(item: MethodDescription) {
  return store.upsert(item);
}
