import { makeSqliteStore } from './sqlite.ts';
import type { PolicyEE } from '../domain/types.ts';

const store = makeSqliteStore<PolicyEE>('policies');

export async function listPolicies() { return store.list(); }
export async function getPolicy(id: string) { return store.get(id); }
export async function upsertPolicy(item: PolicyEE) { return store.upsert(item); }
