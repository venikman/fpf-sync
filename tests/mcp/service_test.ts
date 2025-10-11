import { expect, test } from "bun:test";
import { evaluateService } from "../../scripts/mcp/services/service.ts";
import { upsertWork } from "../../scripts/mcp/storage/work.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function tmpdirPath() {
  return mkdtempSync(join(tmpdir(), "fpf-"));
}

test("service.evaluate computes metrics from Work", async () => {
  const dir = tmpdirPath();
  process.env.FPF_DATA_DIR = dir;

  const svcId = "svc::demo@ctx::test@1.0.0";
  const start = new Date('2025-01-01T00:00:00Z').toISOString();
  const end1 = new Date('2025-01-01T00:10:00Z').toISOString();
  const end2 = new Date('2025-01-01T00:20:00Z').toISOString();

  await upsertWork({ id: crypto.randomUUID(), md: 'md::m@v1', stepId: 's1', performedBy: 'ra::system#role:ctx::test@x@t0..t1', startedAt: start, endedAt: end1, outcome: 'success', links: { claimsService: [svcId] } });
  await upsertWork({ id: crypto.randomUUID(), md: 'md::m@v1', stepId: 's1', performedBy: 'ra::system#role:ctx::test@x@t0..t1', startedAt: start, endedAt: end2, outcome: 'rejected', links: { claimsService: [svcId] } });

  const metrics = await evaluateService(svcId, { from: '2024-12-31T00:00:00Z', to: '2025-01-02T00:00:00Z' }, ['leadTime','rejectRate','uptime']);
  expect(metrics.leadTime).toBeGreaterThan(0);
  expect(metrics.rejectRate).toBeGreaterThan(0);
  expect(metrics.uptime).toBeGreaterThan(0);
});
