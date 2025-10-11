import { expect, test } from "bun:test";
import { parityRun } from "../../scripts/mcp/services/parity.ts";

test("parity.run computes Pareto front (minimize by default)", () => {
  const candidates = [
    { id: "a", metrics: { cost: 10, time: 5 } },
    { id: "b", metrics: { cost: 8, time: 6 } },
    { id: "c", metrics: { cost: 7, time: 9 } },
    { id: "d", metrics: { cost: 12, time: 4 } },
  ];
  const { pareto } = parityRun({ candidates, metrics: ["cost", "time"] });
  const ids = pareto.map(p => p.id).sort();
  expect(ids).toEqual(["a","b","c","d"].sort());
});
