import { expect, test } from "bun:test";
import { declareCapability, checkCapability } from "../../scripts/mcp/services/capability.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function tmpdirPath() {
  const d = `${mkdtempSync(join(tmpdir(), 'fpf-'))}`;
  return d;
}

test("capability.declare/check thresholds", async () => {
  const dir = tmpdirPath();
  process.env.FPF_DATA_DIR = dir;

  const cap = await declareCapability({ id: crypto.randomUUID(), holder: 'system', ctx: 'ctx::lab@v1', taskFamily: 'md::foo@v1', measures: { precision: 0.91 } });
  expect(cap.id).toBeDefined();

  const ok = await checkCapability('system', { md: 'md::foo@v1', stepId: 's1', thresholds: { precision: 0.9 } }, new Date().toISOString());
  expect(ok.admissible).toBe(true);

  const bad = await checkCapability('system', { md: 'md::foo@v1', stepId: 's1', thresholds: { precision: 0.95 } }, new Date().toISOString());
  expect(bad.admissible).toBe(false);
});
