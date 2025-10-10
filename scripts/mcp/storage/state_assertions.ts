import { makeJsonStore } from './base.ts';
import type { StateAssertion } from '../domain/types.ts';

const store = makeJsonStore<StateAssertion>('state_assertions.json');

export async function listStateAssertions() {
  return store.list();
}

export async function upsertStateAssertion(item: StateAssertion) {
  return store.upsert(item);
}
