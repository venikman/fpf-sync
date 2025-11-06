import { makeSqliteStore } from './sqlite.ts';
import type { Service } from '../domain/types.ts';

const store = makeSqliteStore<Service>('services');

export async function listServices() {
  return store.list();
}

export async function getService(id: string) {
  return store.get(id);
}

export async function upsertService(item: Service) {
  return store.upsert(item);
}
