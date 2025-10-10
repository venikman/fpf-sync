import { expect, test } from "bun:test";
import { guardEligibility } from "../../scripts/mcp/domain/guards.ts";
import { FpfError } from "../../scripts/mcp/util/errors.ts";

test("guardEligibility throws for episteme", () => {
  let threw = false;
  try {
    // @ts-ignore testing bad case
    guardEligibility('episteme');
  } catch (e) {
    threw = e instanceof FpfError && e.code === 'ELIG.VIOLATION';
  }
  expect(threw).toBe(true);
});
