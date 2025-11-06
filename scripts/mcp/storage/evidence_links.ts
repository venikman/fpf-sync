import { makeSqliteStore } from './sqlite.ts';

export interface EvidenceLink { id: string; work: string; episteme: string; evidenceRole: string; ctx: string; createdAt: string; }

const store = makeSqliteStore<EvidenceLink>('evidence_links');

export async function upsertEvidenceLink(item: EvidenceLink) { return store.upsert(item); }
export async function listEvidenceLinks() { return store.list(); }
