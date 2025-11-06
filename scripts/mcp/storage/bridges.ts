import { makeSqliteStore } from './sqlite.ts';
import type { Bridge } from '../domain/types.ts';

const store = makeSqliteStore<Bridge>('bridges');

export async function listBridges() {
  return store.list();
}

export async function getBridge(id: string) {
  return store.get(id);
}

export async function upsertBridge(item: Bridge) {
  return store.upsert(item);
}
