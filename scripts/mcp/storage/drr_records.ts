import { makeJsonStore } from './base.ts';

export interface DrrRecordStoreItem {
  id: string;
  change: string;
  context: string;
  rationale: string;
  alternatives?: string[];
  consequences?: string[];
  refs?: string[];
  createdAt: string;
}

const store = makeJsonStore<DrrRecordStoreItem>('drr_records.json');

export async function upsertDrrRecord(item: DrrRecordStoreItem) { return store.upsert(item); }
export async function listDrrRecords() { return store.list(); }
