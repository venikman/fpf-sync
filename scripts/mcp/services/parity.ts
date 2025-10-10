export type Candidate = { id: string; metrics: Record<string, number> };

// Simple Pareto front computation assuming all metrics are minimized unless name ends with '+' to indicate maximize.
export function parityRun(input: { candidates: Candidate[]; isoScale?: { S: string; budget: number }; metrics?: string[] }): { report: unknown; pareto: Candidate[] } {
  const metrics = input.metrics && input.metrics.length ? input.metrics : guessMetrics(input.candidates);
  const pareto = nondominated(input.candidates, metrics);
  const report = { metrics, total: input.candidates.length, pareto: pareto.length };
  return { report, pareto };
}

function guessMetrics(cands: Candidate[]): string[] {
  const first = cands[0];
  return first ? Object.keys(first.metrics) : [];
}

function dominates(a: Candidate, b: Candidate, metrics: string[]): boolean {
  let betterOrEqual = true;
  let strictlyBetter = false;
  for (const m of metrics) {
    const maximize = m.endsWith('+');
    const am = a.metrics[m.replace(/\+$/, '')] ?? 0;
    const bm = b.metrics[m.replace(/\+$/, '')] ?? 0;
    if (maximize) {
      if (am < bm) betterOrEqual = false;
      if (am > bm) strictlyBetter = true;
    } else {
      if (am > bm) betterOrEqual = false;
      if (am < bm) strictlyBetter = true;
    }
    if (!betterOrEqual) return false;
  }
  return betterOrEqual && strictlyBetter;
}

function nondominated(cands: Candidate[], metrics: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const c of cands) {
    let dominatedFlag = false;
    for (const d of cands) {
      if (d === c) continue;
      if (dominates(d, c, metrics)) { dominatedFlag = true; break; }
    }
    if (!dominatedFlag) out.push(c);
  }
  return out;
}
