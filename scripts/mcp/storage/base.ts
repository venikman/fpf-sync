import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR, writeFileAtomic } from '../util.ts';

// Minimal JSON-array store with atomic writes
// Note: For high-concurrency scenarios, consider using SQLite or adding file locking

export type WithId = { id: string };

async function ensureFile(path: string, initial = '[]') {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(path, 'utf8');
  } catch {
    await writeFileAtomic(path, initial);
  }
}

export function makeJsonStore<T extends WithId>(fileName: string) {
  const filePath = join(DATA_DIR, fileName);

  async function list(): Promise<T[]> {
    await ensureFile(filePath);
    const raw = await readFile(filePath, 'utf8');
    try {
      const arr = JSON.parse(raw) as T[];
      if (!Array.isArray(arr)) {
        console.error(`[storage] ${filePath}: Data is not an array, returning empty array`);
        return [];
      }
      return arr;
    } catch (err) {
      console.error(`[storage] ${filePath}: JSON parse error, returning empty array:`, err);
      return [];
    }
  }

  function saveAll(items: T[]): Promise<void> {
    return writeFileAtomic(filePath, JSON.stringify(items, null, 2));
  }

  async function get(id: string): Promise<T | undefined> {
    const all = await list();
    return all.find((x) => x.id === id);
  }

  function upsert(item: T): Promise<T> {
    return (async () => {
      const all = await list();
      const idx = all.findIndex((x) => x.id === item.id);
      if (idx === -1) all.push(item);
      else all[idx] = item;
      await saveAll(all);
      return item;
    })();
  }

  function update(id: string, patch: Partial<T>): Promise<T | undefined> {
    return (async () => {
      const all = await list();
      const idx = all.findIndex((x) => x.id === id);
      if (idx === -1) return undefined;
      const next = { ...all[idx], ...patch } as T;
      all[idx] = next;
      await saveAll(all);
      return next;
    })();
  }

  function remove(id: string): Promise<boolean> {
    return (async () => {
      const all = await list();
      const next = all.filter((x) => x.id !== id);
      const changed = next.length !== all.length;
      if (changed) await saveAll(next);
      return changed;
    })();
  }

  return { filePath, list, get, upsert, update, remove };
}
