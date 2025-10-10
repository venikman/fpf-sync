import type { TrustScore } from '../domain/types.ts';

export type TrustInput = {
  claim: unknown;
  evidence: Array<{ episteme: string; role: string; timespan: { from: string; to: string }; decay?: number }>;
  bridges?: string[];
  formalityF: number;
  scopeG: number;
  reliabilityR?: number;
};

export function computeTrustScore(input: TrustInput): TrustScore {
  const notes: string[] = [];
  let F = clamp(input.formalityF, 0, 1);
  let G = clamp(input.scopeG, 0, 1);
  let R = input.reliabilityR != null ? clamp(input.reliabilityR, 0, 1) : 0.5;

  // CL penalty (bridges reduce confidence)
  if (input.bridges && input.bridges.length > 0) {
    const penalty = Math.min(0.2, input.bridges.length * 0.05);
    R = clamp(R - penalty, 0, 1);
    notes.push(`Applied CL penalty for ${input.bridges.length} bridge(s): -${penalty.toFixed(2)}`);
  }

  // Freshness penalty based on newest evidence timespan end
  const newestEnd = input.evidence?.map(e => e.timespan?.to).filter(Boolean).sort().slice(-1)[0];
  if (newestEnd) {
    const ageDays = daysSince(newestEnd);
    const decay = Math.min(0.3, ageDays / 365 * 0.3);
    R = clamp(R - decay, 0, 1);
    notes.push(`Applied freshness decay for ${ageDays.toFixed(0)} days: -${decay.toFixed(2)}`);
  }

  return { F, G, R, notes };
}

function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }
function daysSince(iso: string): number { const ms = Date.now() - Date.parse(iso); return ms / (1000*60*60*24); }
