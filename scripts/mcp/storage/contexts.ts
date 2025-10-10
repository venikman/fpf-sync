import { makeJsonStore } from './base.ts';
import type { Context } from '../domain/types.ts';
import { IDS } from '../domain/ids.ts';

const store = makeJsonStore<Context>('contexts.json');

export async function listContexts() {
  return store.list();
}

export async function getContext(id: string) {
  return store.get(id);
}

export async function upsertContext(input: Omit<Context, 'createdAt'|'updatedAt'> & Partial<Pick<Context,'createdAt'|'updatedAt'>>) {
  const now = new Date().toISOString();
  const item: Context = {
    createdAt: input.createdAt || now,
    updatedAt: now,
    ...input,
  } as Context;
  return store.upsert(item);
}
