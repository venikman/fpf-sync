import { makeJsonStore } from './base.ts';
import type { Bridge } from '../domain/types.ts';

const store = makeJsonStore<Bridge>('bridges.json');

export async function listBridges() {
  return store.list();
}

export async function getBridge(id: string) {
  return store.get(id);
}

export async function upsertBridge(item: Bridge) {
  return store.upsert(item);
}
