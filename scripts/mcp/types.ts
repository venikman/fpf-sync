export type EpistemeTargets = {
  F?: number; // Formality
  R?: number; // Reliability
  G?: number; // Generality/Granularity
  CL?: number; // Congruence Level
};

export interface Episteme {
  id: string;
  object: string;
  concept: string;
  symbol: string;
  targets?: EpistemeTargets;
  tags?: string[];
  docRefs?: { path: string; heading?: string; anchor?: string }[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface CreateEpistemeInput {
  object: string;
  concept: string;
  symbol: string;
  targets?: EpistemeTargets;
}

export interface UpdateEpistemePatch {
  object?: string;
  concept?: string;
  symbol?: string;
  targets?: EpistemeTargets;
  tags?: string[];
  docRefs?: { path: string; heading?: string; anchor?: string }[];
}

export function sanitizeId(id: string): string {
  const s = id.trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(s)) {
    throw new Error('Invalid id: only [a-zA-Z0-9._-] allowed');
  }
  return s;
}

export function validateCreateEpisteme(input: Record<string, unknown>): CreateEpistemeInput {
  if (!input || typeof input !== 'object') throw new Error('Invalid body');
  const { object, concept, symbol, targets } = input;
  if (typeof object !== 'string' || !object.trim()) throw new Error('object is required');
  if (typeof concept !== 'string' || !concept.trim()) throw new Error('concept is required');
  if (typeof symbol !== 'string' || !symbol.trim()) throw new Error('symbol is required');
  if (targets) validateTargets(targets as Record<string, unknown>);
  return { object: object.trim(), concept: concept.trim(), symbol: symbol.trim(), targets: targets as EpistemeTargets };
}

export function validateUpdatePatch(patch: Record<string, unknown>): UpdateEpistemePatch {
  if (!patch || typeof patch !== 'object') throw new Error('Invalid patch');
  const out: UpdateEpistemePatch = {};
  if (patch.object != null) {
    if (typeof patch.object !== 'string' || !patch.object.trim()) throw new Error('object must be non-empty string');
    out.object = patch.object.trim();
  }
  if (patch.concept != null) {
    if (typeof patch.concept !== 'string' || !patch.concept.trim()) throw new Error('concept must be non-empty string');
    out.concept = patch.concept.trim();
  }
  if (patch.symbol != null) {
    if (typeof patch.symbol !== 'string' || !patch.symbol.trim()) throw new Error('symbol must be non-empty string');
    out.symbol = patch.symbol.trim();
  }
  if (patch.targets != null) {
    validateTargets(patch.targets as Record<string, unknown>);
    out.targets = patch.targets as EpistemeTargets;
  }
  if (patch.tags != null) {
    if (!Array.isArray(patch.tags) || patch.tags.some((t: unknown) => typeof t !== 'string')) throw new Error('tags must be string[]');
    out.tags = patch.tags.map((t: string) => t.trim()).filter(Boolean);
  }
  if (patch.docRefs != null) {
    if (!Array.isArray(patch.docRefs)) throw new Error('docRefs must be an array');
    out.docRefs = (patch.docRefs as Record<string, unknown>[]).map((r: Record<string, unknown>) => ({
      path: String(r.path || '').trim(),
      heading: r.heading ? String(r.heading).trim() : undefined,
      anchor: r.anchor ? String(r.anchor).trim() : undefined,
    }));
  }
  return out;
}

export function validateTargets(t: Record<string, unknown>): asserts t is EpistemeTargets {
  if (typeof t !== 'object') throw new Error('targets must be an object');
  for (const k of ['F','R','G','CL'] as const) {
    if (t[k] != null) {
      if (typeof t[k] !== 'number' || !Number.isFinite(t[k])) {
        throw new Error(`targets.${k} must be a finite number`);
      }
    }
  }
}
