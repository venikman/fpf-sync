import type { Capability, MethodDescription } from '../domain/types.ts';
import { listCapabilities, upsertCapability } from '../storage/capabilities.ts';

export function declareCapability(input: Omit<Capability,'id'|'createdAt'|'updatedAt'> & { id: string }): Promise<Capability> {
  const now = new Date().toISOString();
  const item: Capability = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  return upsertCapability(item);
}

export async function checkCapability(holder: string, step: { md: string; stepId: string; jobSlice?: unknown; thresholds?: Record<string, number> }, at: string): Promise<{ admissible: boolean; why: string[] }>{
  const items = await listCapabilities();
  const caps = items.filter(c => c.holderRef === holder || holder === 'system');
  // Simple heuristic: if thresholds not provided, admissible
  if (!step.thresholds || Object.keys(step.thresholds).length === 0) return { admissible: true, why: ['no thresholds specified'] };
  const why: string[] = [];
  let ok = true;
  for (const [k, v] of Object.entries(step.thresholds)) {
    const best = caps.map(c => c.measures?.[k] ?? -Infinity).reduce((a,b) => Math.max(a,b), -Infinity);
    if (!(best >= v)) { ok = false; why.push(`measure ${k}=${best} < threshold ${v}`); }
  }
  if (ok) why.push('all thresholds satisfied');
  return { admissible: ok, why };
}
