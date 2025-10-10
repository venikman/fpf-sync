import { join } from 'node:path';
import { slugify } from '../util.ts';

// ID helpers for FPF entities. Opaque but readable per spec.
// Formats:
//  ctx::{Name}@{edition}
//  role::{Role}@{ctx}
//  ra::{Holder}#{Role}:{ctx}@{t0..t1}
//  md::{Name}@{rev}
//  work::{UUID}
//  svc::{Name}@{ctx}@{ver}
//  epi::{URI-or-hash}
//  bridge::{A@ctxA}->{B@ctxB}
//  policy::E/E/{id}

function cleanSegment(s: string): string {
  const t = s.trim();
  if (!t) return '_';
  // Use slugify for safety (lowercase, hyphens). Keep readability.
  return slugify(t);
}

export function makeCtxId(name: string, edition: string): string {
  return `ctx::${cleanSegment(name)}@${cleanSegment(edition)}`;
}

export function makeRoleId(role: string, ctxId: string): string {
  return `role::${cleanSegment(role)}@${ctxId}`;
}

export function makeRaId(holder: string, role: string, ctxId: string, t0: string, t1: string): string {
  return `ra::${cleanSegment(holder)}#${cleanSegment(role)}:${ctxId}@${t0}..${t1}`;
}

export function makeMdId(name: string, rev: string): string {
  return `md::${cleanSegment(name)}@${cleanSegment(rev)}`;
}

export function makeWorkId(uuid: string): string {
  return `work::${uuid}`;
}

export function makeSvcId(name: string, ctxId: string, ver: string): string {
  return `svc::${cleanSegment(name)}@${ctxId}@${cleanSegment(ver)}`;
}

export function makeBridgeId(aLabel: string, aCtxId: string, bLabel: string, bCtxId: string): string {
  return `bridge::${cleanSegment(aLabel)}@${aCtxId}->${cleanSegment(bLabel)}@${bCtxId}`;
}

export function makePolicyId_EE(id: string): string {
  return `policy::E/E/${cleanSegment(id)}`;
}

export function makeNqdId(id: string): string {
  return `nqd::${cleanSegment(id)}`;
}

export const IDS = {
  makeCtxId,
  makeRoleId,
  makeRaId,
  makeMdId,
  makeWorkId,
  makeSvcId,
  makeBridgeId,
  makePolicyId_EE,
  makeNqdId,
};

export const FILES = {
  eventsLog: (dataDir: string) => join(dataDir, 'events.log'),
};
