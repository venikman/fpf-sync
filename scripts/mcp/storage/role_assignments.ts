import { makeJsonStore } from './base.ts';
import type { RoleAssignment } from '../domain/types.ts';

const store = makeJsonStore<RoleAssignment>('role_assignments.json');

export async function listRoleAssignments() {
  return store.list();
}

export async function getRoleAssignment(id: string) {
  return store.get(id);
}

export async function upsertRoleAssignment(input: Omit<RoleAssignment,'createdAt'|'updatedAt'> & Partial<Pick<RoleAssignment,'createdAt'|'updatedAt'>>) {
  const now = new Date().toISOString();
  const item: RoleAssignment = { createdAt: input.createdAt || now, updatedAt: now, ...input } as RoleAssignment;
  return store.upsert(item);
}
