import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { DATA_DIR, ensureDir } from '../util.ts';

export type WithId = { id: string };

// Singleton database connection
let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (db) return db;

  await ensureDir(DATA_DIR);
  const dbPath = join(DATA_DIR, 'fpf.db');

  db = new Database(dbPath, { create: true });

  // Enable WAL mode for better concurrency
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');

  // Initialize schema
  await initSchema(db);

  return db;
}

async function initSchema(db: Database) {
  // Generic entity storage: one table per entity type
  // Schema: id (PK), data (JSON), createdAt, updatedAt

  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS idx_entities_collection ON entities(collection);
    CREATE INDEX IF NOT EXISTS idx_entities_updated ON entities(collection, updatedAt DESC);
  `);
}

/**
 * Create a SQLite-backed store with ACID guarantees
 */
export function makeSqliteStore<T extends WithId>(collectionName: string) {
  async function list(): Promise<T[]> {
    const database = await getDatabase();
    const stmt = database.prepare('SELECT data FROM entities WHERE collection = ? ORDER BY updatedAt DESC');
    const rows = stmt.all(collectionName) as Array<{ data: string }>;

    return rows.map(row => {
      try {
        return JSON.parse(row.data) as T;
      } catch (err) {
        console.error(`[sqlite] ${collectionName}: Failed to parse row data:`, err);
        return null;
      }
    }).filter(Boolean) as T[];
  }

  async function get(id: string): Promise<T | undefined> {
    const database = await getDatabase();
    const stmt = database.prepare('SELECT data FROM entities WHERE collection = ? AND id = ?');
    const row = stmt.get(collectionName, id) as { data: string } | undefined;

    if (!row) return undefined;

    try {
      return JSON.parse(row.data) as T;
    } catch (err) {
      console.error(`[sqlite] ${collectionName}: Failed to parse data for id ${id}:`, err);
      return undefined;
    }
  }

  async function upsert(item: T): Promise<T> {
    const database = await getDatabase();
    const now = new Date().toISOString();

    // Check if exists to preserve createdAt
    const existing = await get(item.id);
    const createdAt = existing ? (existing as any).createdAt || now : now;

    // Merge with timestamps
    const itemWithTimestamps = {
      ...item,
      createdAt,
      updatedAt: now,
    };

    const stmt = database.prepare(`
      INSERT INTO entities (collection, id, data, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET
        data = excluded.data,
        updatedAt = excluded.updatedAt
    `);

    stmt.run(
      collectionName,
      item.id,
      JSON.stringify(itemWithTimestamps),
      createdAt,
      now
    );

    return itemWithTimestamps as T;
  }

  async function update(id: string, patch: Partial<T>): Promise<T | undefined> {
    const existing = await get(id);

    if (!existing) return undefined;

    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() } as T;
    return await upsert(updated);
  }

  async function remove(id: string): Promise<boolean> {
    const database = await getDatabase();
    const stmt = database.prepare('DELETE FROM entities WHERE collection = ? AND id = ?');
    const result = stmt.run(collectionName, id);
    return result.changes > 0;
  }

  return { list, get, upsert, update, remove };
}

/**
 * Export all data from SQLite to JSON for backup
 */
export async function exportToJson(collectionName: string): Promise<any[]> {
  const database = await getDatabase();
  const stmt = database.prepare('SELECT data FROM entities WHERE collection = ?');
  const rows = stmt.all(collectionName) as Array<{ data: string }>;

  return rows.map(row => JSON.parse(row.data));
}

/**
 * Get database statistics
 */
export async function getStats() {
  const database = await getDatabase();

  const collectionsStmt = database.prepare(`
    SELECT collection, COUNT(*) as count
    FROM entities
    GROUP BY collection
  `);
  const collections = collectionsStmt.all() as Array<{ collection: string; count: number }>;

  const sizeStmt = database.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()');
  const sizeRow = sizeStmt.get() as { size: number };

  return {
    collections,
    databaseSize: sizeRow.size,
    databasePath: join(DATA_DIR, 'fpf.db'),
  };
}

/**
 * Close database connection (for graceful shutdown)
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
