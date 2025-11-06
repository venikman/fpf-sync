import { makeSqliteStore } from './sqlite.ts';
import type { Role } from '../domain/types.ts';

const store = makeSqliteStore<Role>('roles');

export async function listRoles() {
  return store.list();
}

export async function getRole(id: string) {
  return store.get(id);
}

export async function upsertRole(input: Omit<Role,'createdAt'|'updatedAt'> & Partial<Pick<Role,'createdAt'|'updatedAt'>>) {
  const now = new Date().toISOString();
  const item: Role = { createdAt: input.createdAt || now, updatedAt: now, ...input } as Role;
  return store.upsert(item);
}
