#!/usr/bin/env bun
/**
 * Migration script: JSON → SQLite
 *
 * Converts all JSON-based storage to SQLite with ACID guarantees.
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   bun run scripts/migrate-to-sqlite.ts [--dry-run]
 */

import { readFile, rename, access } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from './mcp/util.ts';
import { makeSqliteStore, getStats } from './mcp/storage/sqlite.ts';
import type { WithId } from './mcp/storage/sqlite.ts';

const DRY_RUN = process.argv.includes('--dry-run');

interface MigrationTask {
  collection: string;
  jsonFile: string;
  description: string;
}

const MIGRATIONS: MigrationTask[] = [
  { collection: 'epistemes', jsonFile: 'epistemes.json', description: 'Episteme registry' },
  { collection: 'contexts', jsonFile: 'contexts.json', description: 'FPF contexts' },
  { collection: 'bridges', jsonFile: 'bridges.json', description: 'Context bridges' },
  { collection: 'roles', jsonFile: 'roles.json', description: 'Role definitions' },
  { collection: 'role_assignments', jsonFile: 'role_assignments.json', description: 'Role assignments' },
  { collection: 'state_assertions', jsonFile: 'state_assertions.json', description: 'State assertions' },
  { collection: 'methods', jsonFile: 'methods.json', description: 'Method descriptions' },
  { collection: 'work', jsonFile: 'work.json', description: 'Work records' },
  { collection: 'evidence_links', jsonFile: 'evidence_links.json', description: 'Evidence links' },
  { collection: 'services', jsonFile: 'services.json', description: 'Service definitions' },
  { collection: 'capabilities', jsonFile: 'capabilities.json', description: 'Capability declarations' },
  { collection: 'policies', jsonFile: 'policies.json', description: 'E/E policies' },
];

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadJsonFile(path: string): Promise<any[]> {
  try {
    const content = await readFile(path, 'utf8');
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn(`  ⚠️  Could not read ${path}: ${err}`);
    return [];
  }
}

async function backupJsonFile(path: string) {
  const backupPath = path + '.backup';
  const backupExists = await fileExists(backupPath);

  if (backupExists) {
    console.log(`  ℹ️  Backup already exists: ${backupPath}`);
    return;
  }

  await rename(path, backupPath);
  console.log(`  ✅ Backed up: ${path} → ${backupPath}`);
}

async function migrateCollectionData<T extends WithId>(
  collectionName: string,
  jsonData: T[]
): Promise<void> {
  const store = makeSqliteStore<T>(collectionName);

  console.log(`  🔄 Migrating ${jsonData.length} items to SQLite...`);

  for (const item of jsonData) {
    await store.upsert(item);
  }

  console.log(`  ✅ Migration complete`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  FPF MCP Server: JSON → SQLite Migration');
  console.log('═══════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  console.log(`Data directory: ${DATA_DIR}\n`);

  let totalItems = 0;
  let migratedCollections = 0;

  for (const task of MIGRATIONS) {
    const jsonPath = join(DATA_DIR, task.jsonFile);
    const exists = await fileExists(jsonPath);

    console.log(`📦 ${task.description} (${task.collection})`);

    if (!exists) {
      console.log(`  ⏭️  No JSON file found, skipping\n`);
      continue;
    }

    const data = await loadJsonFile(jsonPath);
    console.log(`  📊 Found ${data.length} items`);

    if (data.length === 0) {
      console.log(`  ⏭️  Empty file, skipping\n`);
      continue;
    }

    if (!DRY_RUN) {
      // Migrate to SQLite
      await migrateCollectionData(task.collection, data);

      // Backup original JSON file
      await backupJsonFile(jsonPath);
    } else {
      console.log(`  [DRY RUN] Would migrate ${data.length} items to SQLite`);
      console.log(`  [DRY RUN] Would backup ${jsonPath} to ${jsonPath}.backup`);
    }

    totalItems += data.length;
    migratedCollections++;
    console.log('');
  }

  console.log('───────────────────────────────────────────────────────');
  console.log(`✨ Migration Summary`);
  console.log(`  Collections migrated: ${migratedCollections}/${MIGRATIONS.length}`);
  console.log(`  Total items: ${totalItems}`);

  if (!DRY_RUN) {
    const stats = await getStats();
    console.log(`\n📊 Database Statistics:`);
    console.log(`  Location: ${stats.databasePath}`);
    console.log(`  Size: ${(stats.databaseSize / 1024).toFixed(2)} KB`);
    console.log(`\n  Collections:`);
    for (const c of stats.collections) {
      console.log(`    - ${c.collection}: ${c.count} items`);
    }

    console.log('\n✅ Migration complete!');
    console.log('\nNext steps:');
    console.log('  1. Test the servers: bun run scripts/mcp/server.ts');
    console.log('  2. If everything works, you can delete *.json.backup files');
    console.log('  3. Update storage imports to use sqlite.ts instead of base.ts');
  } else {
    console.log('\n🔍 Dry run complete. Run without --dry-run to perform migration.');
  }

  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
