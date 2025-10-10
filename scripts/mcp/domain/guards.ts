import type { Role, RoleAssignment, StateAssertion, Bridge, Rsg } from './types.ts';
import { raise } from '../util/errors.ts';

function withinWindow(ts: string, from: string, to: string): boolean {
  return ts >= from && ts <= to;
}

export function guardEnactable(rsg: Rsg, assertionState: string, at: string) {
  if (!rsg.enactable.includes(assertionState)) {
    raise('RSG.NOT_ENACTABLE', `Role state '${assertionState}' is not enactable at ${at}`);
  }
}

export function guardWorkWindow(ra: RoleAssignment, at: string) {
  if (!withinWindow(at, ra.window.from, ra.window.to)) {
    raise('WIN.INVALID', `Work time ${at} not within window ${ra.window.from}..${ra.window.to}`);
  }
}

export function guardEligibility(holder: RoleAssignment['holder']) {
  if (holder === 'episteme') {
    raise('ELIG.VIOLATION', `Episteme holder cannot perform Work`);
  }
}

export function guardSeparationOfDuties(assignments: RoleAssignment[], newAssignment: RoleAssignment, incompatibleRoles: string[]) {
  const holder = newAssignment.holderRef || newAssignment.holder;
  const overlaps = assignments.filter(a => (a.holderRef || a.holder) === holder);
  for (const a of overlaps) {
    if (incompatibleRoles.includes(a.role) && incompatibleRoles.includes(newAssignment.role)) {
      // Overlap if windows intersect
      if (!(a.window.to < newAssignment.window.from || a.window.from > newAssignment.window.to)) {
        raise('SOD.CONFLICT', `Incompatible roles overlap for holder`);
      }
    }
  }
}

export function guardBridgeCL(bridge: Bridge, requiredCL: number) {
  if (bridge.CL < requiredCL) {
    raise('BRIDGE.CL_TOO_LOW', `Bridge CL ${bridge.CL} below required ${requiredCL}`);
  }
}

export function guardMixedScale(units: string[] | undefined) {
  if (!units || units.length <= 1) return;
  const unique = Array.from(new Set(units));
  if (unique.length > 1) {
    raise('CG.MIXED_SCALE', `Mixed or incompatible units: ${unique.join(', ')}`);
  }
}

export function guardGammaTyping(holons: unknown[], hasBoundary: boolean) {
  if (!Array.isArray(holons) || holons.length === 0 || !hasBoundary) {
    raise('Γ.MISTYPED', `Γ on non-holons or without boundary`);
  }
}
