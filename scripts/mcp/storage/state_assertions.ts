import { makeSqliteStore } from './sqlite.ts';
import type { StateAssertion } from '../domain/types.ts';

const store = makeSqliteStore<StateAssertion>('state_assertions');

export async function listStateAssertions() {
  return store.list();
}

export async function upsertStateAssertion(item: StateAssertion) {
  return store.upsert(item);
}
