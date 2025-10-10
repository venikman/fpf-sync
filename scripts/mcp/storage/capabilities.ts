import { makeJsonStore } from './base.ts';
import type { Capability } from '../domain/types.ts';

const store = makeJsonStore<Capability>('capabilities.json');

export async function listCapabilities() {
  return store.list();
}

export async function getCapability(id: string) {
  return store.get(id);
}

export async function upsertCapability(item: Capability) {
  return store.upsert(item);
}
