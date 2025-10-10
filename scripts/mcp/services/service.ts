import type { Service, Work } from '../domain/types.ts';
import { upsertService, listServices } from '../storage/services.ts';
import { listWork } from '../storage/work.ts';

export function defineService(input: Omit<Service,'createdAt'|'updatedAt'> & { createdAt?: string; updatedAt?: string }): Promise<Service> {
  const now = new Date().toISOString();
  const item: Service = { ...input, createdAt: input.createdAt || now, updatedAt: now } as Service;
  return upsertService(item);
}

export async function evaluateService(svcId: string, window: { from: string; to: string }, kpis: string[]): Promise<Record<string, number>> {
  const all = await listWork();
  const slice = all.filter(w => w.links?.claimsService?.includes(svcId) && w.endedAt && w.startedAt && w.startedAt >= window.from && w.endedAt <= window.to);
  const metrics: Record<string, number> = {};

  if (kpis.includes('leadTime')) {
    const times = slice.map(w => Date.parse(w.endedAt!) - Date.parse(w.startedAt));
    metrics.leadTime = times.length ? avg(times) : 0;
  }

  if (kpis.includes('rejectRate')) {
    const total = slice.length;
    const rejected = slice.filter(w => (w.outcome || '').toLowerCase() === 'rejected').length;
    metrics.rejectRate = total ? rejected / total : 0;
  }

  if (kpis.includes('uptime')) {
    // Approximate: fraction of successful work vs total
    const total = slice.length;
    const ok = slice.filter(w => (w.outcome || '').toLowerCase() === 'success').length;
    metrics.uptime = total ? ok / total : 0;
  }

  if (kpis.includes('costToServe')) {
    // Placeholder: lack of resource costs => return 0
    metrics.costToServe = 0;
  }

  return metrics;
}

function avg(xs: number[]) { return xs.reduce((a,b)=>a+b,0) / xs.length; }
