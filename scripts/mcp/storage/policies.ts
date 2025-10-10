import { makeJsonStore } from './base.ts';
import type { PolicyEE } from '../domain/types.ts';

const store = makeJsonStore<PolicyEE>('policies.json');

export async function listPolicies() { return store.list(); }
export async function getPolicy(id: string) { return store.get(id); }
export async function upsertPolicy(item: PolicyEE) { return store.upsert(item); }
