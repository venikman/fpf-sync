export type Window = { from: string; to: string };

export interface Context {
  id: string; // ctx::
  name: string;
  edition: string;
  glossary?: Record<string, string>;
  invariants?: string[];
  roles?: string[]; // role names declared in context
  createdAt: string;
  updatedAt: string;
}

export interface BridgeEnd {
  role?: string;
  kind?: string;
  plane?: string;
  ctx: string; // ctx id
}

export interface Bridge {
  id: string; // bridge::
  from: BridgeEnd;
  to: BridgeEnd;
  CL: number;
  lossNotes?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Rcs {
  // role character set (freeform list)
  chars: string[];
}

export interface Rsg {
  states: string[];
  transitions: Array<{ from: string; to: string }>;
  enactable: string[]; // states which allow Work
}

export interface RoleAlgebra {
  le?: string[]; // partial order declarations
  incompatible?: string[]; // role names mutually exclusive (SoD)
  bundles?: string[][]; // named bundles/groups
}

export interface Role {
  id: string; // role::
  ctx: string; // ctx id
  role: string; // role name
  rcs: Rcs;
  rsg: Rsg;
  algebra: RoleAlgebra;
  createdAt: string;
  updatedAt: string;
}

export type HolderKind = 'system' | 'episteme';

export interface RoleAssignment {
  id: string; // ra::
  holder: HolderKind;
  holderRef?: string; // optional id reference of the holder
  role: string; // role name (redundant for convenience)
  roleId?: string; // role:: id
  ctx: string; // ctx id
  window: Window; // ISO timespan
  createdAt: string;
  updatedAt: string;
}

export interface StateAssertion {
  id: string;
  ra: string; // ra id
  state: string;
  checklistEvidence?: string[];
  at: string; // ISO timestamp
}

export interface MethodStep {
  id: string;
  requiredRoles?: string[];
  capabilityThresholds?: Record<string, number>;
}

export interface MethodDescription {
  id: string; // md::
  ctx: string; // ctx id
  md: string; // name@rev (human readable)
  io?: unknown;
  steps: MethodStep[];
  references?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkLinks {
  claimsService?: string[]; // svc ids
  evidence?: string[]; // evidence link ids
}

export interface Work {
  id: string; // work::
  md: string; // md id
  stepId: string;
  performedBy: string; // ra id
  startedAt: string;
  endedAt?: string;
  outcome?: string; // 'success' | 'failure' | 'rejected' | etc.
  observations?: string[];
  resources?: Record<string, unknown>;
  links?: WorkLinks;
}

export interface Service {
  id: string; // svc::
  ctx: string; // ctx id
  name: string;
  providerRole: string;
  consumerRole?: string;
  claimScope: string;
  accessSpec?: string; // md id
  acceptanceSpec: string; // freeform or md id
  unit?: string;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface Capability {
  id: string;
  holder: 'system';
  holderRef?: string; // system id
  ctx: string; // ctx id
  taskFamily: string; // md or tag
  workScope?: string;
  measures?: Record<string, number>;
  qualWindow?: Window;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyEE {
  id: string; // policy::E/E/{id}
  explore_share: number;
  dominance: 'ParetoOnly' | string; // or policy ref
  scaleProbe?: { S: string; points: number };
  createdAt: string;
  updatedAt: string;
}

export interface NqdPortfolio {
  portfolio: unknown[]; // set of candidates
  illumination: number; // gauge 0..1
  pins: { editions?: string[]; PathSliceId?: string | null };
}

export interface ParityResult {
  report: unknown;
  pareto: unknown[];
}

export interface TrustScore {
  F: number;
  G: number;
  R: number;
  notes?: string[];
}

export interface GammaAggregate {
  whole: unknown;
  invariants: unknown;
}

export interface UTSRowInput {
  kind?: string;
  role?: string;
  service?: string;
  generator?: string;
  N?: number;
  U?: number;
  C?: number;
  Diversity_P?: number;
  referencePlane?: string;
  units?: string;
  scales?: string;
  polarity?: string;
  policyIds?: string[];
  pins?: unknown;
}

export interface DrrRecord {
  id: string;
  change: string;
  context: string;
  rationale: string;
  alternatives?: string[];
  consequences?: string[];
  refs?: string[];
  createdAt: string;
}
