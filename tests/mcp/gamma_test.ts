import { expect } from "@std/expect";
import { gammaAggregate } from "../../scripts/mcp/services/gamma.ts";
import { FpfError } from "../../scripts/mcp/util/errors.ts";

Deno.test("gamma.aggregate returns whole and invariants", () => {
  const res = gammaAggregate({ ctx: "ctx::x@y", holons: [{id:1},{id:2}], fold: "WLNK", units: ["ms"] });
  expect(res.whole).toBeDefined();
  expect((res.whole as any).count).toBe(2);
  expect(res.invariants).toBeDefined();
});

Deno.test("gamma.aggregate guard for mixed scales", () => {
  let threw = false;
  try {
    gammaAggregate({ ctx: "ctx::x@y", holons: [{id:1}], fold: "WLNK", units: ["ms","kg"] });
  } catch (e) {
    threw = e instanceof FpfError && e.code === 'CG.MIXED_SCALE';
  }
  expect(threw).toBe(true);
});
