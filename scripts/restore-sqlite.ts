#!/usr/bin/env bun

/**
 * SQLite Restore Utility
 *
 * Restores a previously created SQLite database backup with:
 * - Checksum verification for integrity
 * - Automatic pre-restore backup of current database
 * - Database validation after restore
 *
 * Usage:
 *   bun run scripts/restore-sqlite.ts <backup-file> [options]
 *
 * Options:
 *   --force              Skip confirmation prompt
 *   --no-backup          Don't create pre-restore backup
 *   --skip-checksum      Skip checksum verification
 *
 * Examples:
 *   bun run scripts/restore-sqlite.ts data/backups/fpf-backup-2025-01-15T10-30-00.db
 *   bun run scripts/restore-sqlite.ts backup.db --force
 *   bun run scripts/restore-sqlite.ts backup.db --no-backup --skip-checksum
 */

import { copyFile, stat, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { Database } from 'bun:sqlite';
import { DATA_DIR, ensureDir } from './mcp/util.ts';
import { getDatabase, getStats, closeDatabase } from './mcp/storage/sqlite.ts';

interface RestoreOptions {
  backupPath: string;
  force: boolean;
  createPreRestoreBackup: boolean;
  verifyChecksum: boolean;
}

function parseArgs(): RestoreOptions {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0].startsWith('--')) {
    console.error(`\n❌ Error: Backup file path is required\n`);
    console.log(`Usage: bun run scripts/restore-sqlite.ts <backup-file> [options]\n`);
    console.log(`Options:`);
    console.log(`  --force              Skip confirmation prompt`);
    console.log(`  --no-backup          Don't create pre-restore backup`);
    console.log(`  --skip-checksum      Skip checksum verification\n`);
    process.exit(1);
  }

  const backupPath = resolve(args[0]);

  const options: RestoreOptions = {
    backupPath,
    force: args.includes('--force'),
    createPreRestoreBackup: !args.includes('--no-backup'),
    verifyChecksum: !args.includes('--skip-checksum'),
  };

  return options;
}

async function calculateChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function verifyBackupChecksum(backupPath: string): Promise<boolean> {
  const checksumPath = `${backupPath}.sha256`;

  try {
    await stat(checksumPath);
  } catch {
    console.log(`   ⚠️  Warning: Checksum file not found (${basename(checksumPath)})`);
    return false;
  }

  console.log(`\n🔐 Verifying checksum...`);

  const checksumContent = await Bun.file(checksumPath).text();
  const expectedChecksum = checksumContent.trim().split(/\s+/)[0];

  const actualChecksum = await calculateChecksum(backupPath);

  if (actualChecksum === expectedChecksum) {
    console.log(`   ✓ Checksum verified: ${actualChecksum}`);
    return true;
  } else {
    console.log(`   ❌ Checksum mismatch!`);
    console.log(`      Expected: ${expectedChecksum}`);
    console.log(`      Actual:   ${actualChecksum}`);
    return false;
  }
}

async function validateDatabase(dbPath: string): Promise<boolean> {
  try {
    const db = new Database(dbPath, { readonly: true });

    // Run integrity check
    const result = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };

    db.close();

    if (result.integrity_check === 'ok') {
      console.log(`   ✓ Database integrity check passed`);
      return true;
    } else {
      console.log(`   ❌ Database integrity check failed: ${result.integrity_check}`);
      return false;
    }
  } catch (err) {
    console.error(`   ❌ Failed to validate database:`, err);
    return false;
  }
}

async function getBackupStats(backupPath: string) {
  try {
    const db = new Database(backupPath, { readonly: true });

    const collectionsStmt = db.prepare(`
      SELECT collection, COUNT(*) as count
      FROM entities
      GROUP BY collection
    `);
    const collections = collectionsStmt.all() as Array<{ collection: string; count: number }>;

    const sizeStmt = db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()');
    const sizeRow = sizeStmt.get() as { size: number };

    db.close();

    return {
      collections,
      size: sizeRow.size,
    };
  } catch (err) {
    console.error(`Failed to read backup stats:`, err);
    return null;
  }
}

async function promptConfirmation(message: string): Promise<boolean> {
  console.log(`\n${message}`);
  console.log(`Type 'yes' to continue, or anything else to cancel:`);

  // Simple prompt without readline dependency
  const response = prompt('> ');

  return response?.toLowerCase() === 'yes';
}

async function performRestore(options: RestoreOptions) {
  console.log(`\n🔄 FPF SQLite Restore Utility`);
  console.log(`${'='.repeat(50)}\n`);

  // Verify backup file exists
  try {
    await stat(options.backupPath);
  } catch {
    console.error(`❌ Error: Backup file not found: ${options.backupPath}`);
    process.exit(1);
  }

  console.log(`📦 Backup file: ${options.backupPath}`);

  const backupSize = (await stat(options.backupPath)).size;
  console.log(`   Size: ${(backupSize / 1024 / 1024).toFixed(2)} MB`);

  // Verify checksum if requested
  if (options.verifyChecksum) {
    const checksumValid = await verifyBackupChecksum(options.backupPath);
    if (!checksumValid) {
      if (!options.force) {
        const confirmed = await promptConfirmation(`⚠️  Checksum verification failed. Continue anyway?`);
        if (!confirmed) {
          console.log(`\nRestore cancelled.`);
          process.exit(0);
        }
      }
    }
  }

  // Validate backup database
  console.log(`\n🔍 Validating backup database...`);
  const isValid = await validateDatabase(options.backupPath);

  if (!isValid) {
    console.error(`\n❌ Error: Backup database is corrupted or invalid`);
    process.exit(1);
  }

  // Show backup stats
  const backupStats = await getBackupStats(options.backupPath);
  if (backupStats) {
    console.log(`\n📊 Backup contains:`);
    if (backupStats.collections.length > 0) {
      for (const col of backupStats.collections) {
        console.log(`   - ${col.collection}: ${col.count} items`);
      }
    } else {
      console.log(`   (empty database)`);
    }
  }

  // Get current database stats (if exists)
  const dbPath = join(DATA_DIR, 'fpf.db');
  let currentExists = false;

  try {
    await stat(dbPath);
    currentExists = true;

    console.log(`\n📊 Current database:`);
    const currentStats = await getStats();
    console.log(`   Path: ${currentStats.databasePath}`);
    console.log(`   Size: ${(currentStats.databaseSize / 1024 / 1024).toFixed(2)} MB`);

    if (currentStats.collections.length > 0) {
      for (const col of currentStats.collections) {
        console.log(`   - ${col.collection}: ${col.count} items`);
      }
    } else {
      console.log(`   (empty database)`);
    }

    // Close database before restore
    closeDatabase();
  } catch {
    console.log(`\n📊 Current database: (not found - will be created)`);
  }

  // Confirmation prompt
  if (!options.force) {
    const confirmed = await promptConfirmation(
      `⚠️  WARNING: This will replace the current database. Continue?`
    );

    if (!confirmed) {
      console.log(`\nRestore cancelled.`);
      process.exit(0);
    }
  }

  // Create pre-restore backup if requested
  if (options.createPreRestoreBackup && currentExists) {
    console.log(`\n💾 Creating pre-restore backup...`);

    await ensureDir(join(DATA_DIR, 'backups'));

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
    const preRestoreBackupPath = join(DATA_DIR, 'backups', `fpf-pre-restore-${timestamp}.db`);

    await copyFile(dbPath, preRestoreBackupPath);
    console.log(`   ✓ Pre-restore backup saved: ${basename(preRestoreBackupPath)}`);
  }

  // Perform restore
  console.log(`\n🔄 Restoring database...`);

  await ensureDir(DATA_DIR);

  // Delete current database if it exists
  if (currentExists) {
    try {
      await unlink(dbPath);
      // Also delete WAL and SHM files if they exist
      try { await unlink(`${dbPath}-wal`); } catch {}
      try { await unlink(`${dbPath}-shm`); } catch {}
    } catch (err) {
      console.error(`   ❌ Failed to delete current database:`, err);
      process.exit(1);
    }
  }

  // Copy backup to database location
  await copyFile(options.backupPath, dbPath);
  console.log(`   ✓ Database restored from backup`);

  // Validate restored database
  console.log(`\n🔍 Validating restored database...`);
  const restoredValid = await validateDatabase(dbPath);

  if (!restoredValid) {
    console.error(`\n❌ Error: Restored database failed validation`);
    process.exit(1);
  }

  // Show final stats
  const restoredStats = await getBackupStats(dbPath);
  if (restoredStats) {
    console.log(`\n📊 Restored database contains:`);
    if (restoredStats.collections.length > 0) {
      for (const col of restoredStats.collections) {
        console.log(`   - ${col.collection}: ${col.count} items`);
      }
    } else {
      console.log(`   (empty database)`);
    }
  }

  console.log(`\n✅ Database restored successfully!`);
  console.log(`   Database path: ${dbPath}\n`);
}

async function main() {
  try {
    const options = parseArgs();
    await performRestore(options);
  } catch (err) {
    console.error(`\n❌ Restore failed:`, err);
    process.exit(1);
  }
}

main();
