import { makeJsonStore } from './base.ts';

export interface EvidenceLink { id: string; work: string; episteme: string; evidenceRole: string; ctx: string; createdAt: string; }

const store = makeJsonStore<EvidenceLink>('evidence_links.json');

export async function upsertEvidenceLink(item: EvidenceLink) { return store.upsert(item); }
export async function listEvidenceLinks() { return store.list(); }
