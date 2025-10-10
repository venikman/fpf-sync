import { expect } from "@std/expect";
import { declareCapability, checkCapability } from "../../scripts/mcp/services/capability.ts";

function tmpdir() {
  const d = `${Deno.makeTempDirSync()}`;
  return d;
}

Deno.test({ name: "capability.declare/check thresholds", sanitizeResources: false, sanitizeOps: false, fn: async () => {
  const dir = tmpdir();
  Deno.env.set('FPF_DATA_DIR', dir);

  const cap = await declareCapability({ id: crypto.randomUUID(), holder: 'system', ctx: 'ctx::lab@v1', taskFamily: 'md::foo@v1', measures: { precision: 0.91 } });
  expect(cap.id).toBeDefined();

  const ok = await checkCapability('system', { md: 'md::foo@v1', stepId: 's1', thresholds: { precision: 0.9 } }, new Date().toISOString());
  expect(ok.admissible).toBe(true);

  const bad = await checkCapability('system', { md: 'md::foo@v1', stepId: 's1', thresholds: { precision: 0.95 } }, new Date().toISOString());
  expect(bad.admissible).toBe(false);
} });
