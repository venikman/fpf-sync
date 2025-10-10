import { makeJsonStore } from './base.ts';

export interface UtsRow {
  id: string;
  ctx: string;
  rows: unknown[];
  createdAt: string;
}

const store = makeJsonStore<UtsRow>('uts_rows.json');

export async function upsertUtsRow(item: UtsRow) { return store.upsert(item); }
export async function listUtsRows() { return store.list(); }
