import { expect, test } from "bun:test";
import { computeTrustScore } from "../../scripts/mcp/services/trust.ts";

test("trust.score applies CL and freshness penalties", () => {
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString();
  const base = computeTrustScore({
    claim: { id: "c1" },
    evidence: [{ episteme: "epi://a", role: "observer", timespan: { from: now, to: now } }],
    formalityF: 0.8,
    scopeG: 0.7,
    reliabilityR: 0.9,
  });
  expect(base.F).toBeGreaterThan(0.7);
  expect(base.G).toBeGreaterThan(0.6);
  expect(base.R).toBeGreaterThan(0.5);

  const withBridge = computeTrustScore({
    claim: { id: "c1" },
    evidence: [{ episteme: "epi://a", role: "observer", timespan: { from: old, to: old } }],
    bridges: ["bridge::a@ctx::x->b@ctx::y"],
    formalityF: 0.8,
    scopeG: 0.7,
    reliabilityR: 0.9,
  });
  expect(withBridge.R).toBeLessThan(base.R);
  expect(withBridge.notes?.length ?? 0).toBeGreaterThan(0);
});
