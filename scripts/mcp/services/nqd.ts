import type { NqdPortfolio, PolicyEE } from '../domain/types.ts';
import { upsertPolicy, getPolicy } from '../storage/policies.ts';

export async function nqdGenerate(input: {
  ctx: string;
  descriptorMapRef: string;
  distanceDefRef: string;
  objectives: { N: number; U: number; C: number };
  archive?: unknown;
  S?: string[];
  policy: string; // policy::E/E/*
}): Promise<NqdPortfolio> {
  // Placeholder: return empty portfolio with basic illumination heuristic
  const illumination = Math.max(0, Math.min(1, (input.objectives.N + input.objectives.U + input.objectives.C) / 3));
  return { portfolio: [], illumination, pins: { editions: input.S || [], PathSliceId: null } };
}

export async function eePolicySet(input: { policyId: string; explore_share: number; dominance: 'ParetoOnly' | string; scaleProbe?: { S: string; points: number } }): Promise<PolicyEE> {
  const now = new Date().toISOString();
  const item: PolicyEE = { id: input.policyId, explore_share: input.explore_share, dominance: input.dominance, scaleProbe: input.scaleProbe, createdAt: now, updatedAt: now };
  await upsertPolicy(item);
  return item;
}
