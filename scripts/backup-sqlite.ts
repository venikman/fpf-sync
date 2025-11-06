#!/usr/bin/env bun

/**
 * SQLite Backup Utility
 *
 * Creates timestamped backups of the FPF SQLite database with optional:
 * - JSON exports for human-readable format
 * - Automatic backup rotation (keeps last N backups)
 * - Integrity verification with checksums
 *
 * Usage:
 *   bun run scripts/backup-sqlite.ts [options]
 *
 * Options:
 *   --json         Also export data as JSON files
 *   --keep=N       Keep last N backups (default: 10)
 *   --output=DIR   Custom output directory (default: data/backups)
 *
 * Examples:
 *   bun run scripts/backup-sqlite.ts
 *   bun run scripts/backup-sqlite.ts --json --keep=5
 *   bun run scripts/backup-sqlite.ts --output=/mnt/backups
 */

import { copyFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { join, basename } from 'node:path';
import { DATA_DIR, BACKUP_DIR, ensureDir } from './mcp/util.ts';
import { getDatabase, getStats, exportToJson } from './mcp/storage/sqlite.ts';

interface BackupOptions {
  exportJson: boolean;
  keepBackups: number;
  outputDir: string;
}

function parseArgs(): BackupOptions {
  const args = process.argv.slice(2);

  const options: BackupOptions = {
    exportJson: args.includes('--json'),
    keepBackups: 10,
    outputDir: BACKUP_DIR,
  };

  for (const arg of args) {
    if (arg.startsWith('--keep=')) {
      options.keepBackups = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--output=')) {
      options.outputDir = arg.split('=')[1];
    }
  }

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

async function rotateBackups(backupDir: string, keepCount: number) {
  try {
    const files = await readdir(backupDir);
    const backupFiles = files
      .filter(f => f.startsWith('fpf-backup-') && f.endsWith('.db'))
      .sort()
      .reverse(); // Most recent first

    if (backupFiles.length > keepCount) {
      console.log(`\n📦 Rotating backups (keeping ${keepCount} most recent)...`);

      const toDelete = backupFiles.slice(keepCount);
      for (const file of toDelete) {
        const filePath = join(backupDir, file);
        await unlink(filePath);
        console.log(`   Deleted: ${file}`);

        // Also delete associated checksum and JSON files if they exist
        try {
          await unlink(`${filePath}.sha256`);
        } catch {}
        try {
          await unlink(filePath.replace('.db', '.json'));
        } catch {}
      }
    }
  } catch (err) {
    console.warn(`Warning: Failed to rotate backups:`, err);
  }
}

async function exportCollectionsToJson(outputDir: string, timestamp: string) {
  console.log(`\n📄 Exporting collections to JSON...`);

  const stats = await getStats();
  const collections = stats.collections.map(c => c.collection);

  if (collections.length === 0) {
    console.log(`   No collections to export`);
    return;
  }

  const jsonExportDir = join(outputDir, `fpf-backup-${timestamp}`);
  await ensureDir(jsonExportDir);

  for (const collection of collections) {
    const data = await exportToJson(collection);
    const jsonPath = join(jsonExportDir, `${collection}.json`);
    await Bun.write(jsonPath, JSON.stringify(data, null, 2));
    console.log(`   Exported: ${collection}.json (${data.length} items)`);
  }

  console.log(`   JSON exports saved to: ${jsonExportDir}`);
}

async function createBackup(options: BackupOptions) {
  console.log(`\n🔄 FPF SQLite Backup Utility`);
  console.log(`${'='.repeat(50)}\n`);

  // Ensure backup directory exists
  await ensureDir(options.outputDir);

  // Get database stats
  const stats = await getStats();
  const dbPath = stats.databasePath;

  console.log(`📊 Database Statistics:`);
  console.log(`   Path: ${dbPath}`);
  console.log(`   Size: ${(stats.databaseSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Collections: ${stats.collections.length}`);

  if (stats.collections.length > 0) {
    for (const col of stats.collections) {
      console.log(`     - ${col.collection}: ${col.count} items`);
    }
  }

  // Check if database file exists
  try {
    await stat(dbPath);
  } catch (err) {
    console.error(`\n❌ Error: Database file not found at ${dbPath}`);
    console.log(`   The database will be created when the MCP server starts.`);
    process.exit(1);
  }

  // Create backup filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const backupFilename = `fpf-backup-${timestamp}.db`;
  const backupPath = join(options.outputDir, backupFilename);

  console.log(`\n💾 Creating backup...`);

  // Use SQLite VACUUM INTO for atomic backup (requires Bun SQLite support)
  // Fallback to file copy if not available
  try {
    const db = await getDatabase();
    // SQLite VACUUM INTO creates a clean copy of the database
    db.exec(`VACUUM INTO '${backupPath}'`);
    console.log(`   ✓ Backup created: ${backupFilename}`);
  } catch (err: any) {
    if (err.message?.includes('VACUUM INTO')) {
      // Fallback to file copy
      console.log(`   Note: Using file copy (VACUUM INTO not available)`);
      await copyFile(dbPath, backupPath);
      console.log(`   ✓ Backup created: ${backupFilename}`);
    } else {
      throw err;
    }
  }

  // Calculate checksum
  console.log(`\n🔐 Calculating checksum...`);
  const checksum = await calculateChecksum(backupPath);
  const checksumPath = `${backupPath}.sha256`;
  await Bun.write(checksumPath, `${checksum}  ${backupFilename}\n`);
  console.log(`   SHA256: ${checksum}`);
  console.log(`   Checksum saved: ${basename(checksumPath)}`);

  // Export to JSON if requested
  if (options.exportJson) {
    await exportCollectionsToJson(options.outputDir, timestamp);
  }

  // Rotate old backups
  await rotateBackups(options.outputDir, options.keepBackups);

  // Final summary
  console.log(`\n✅ Backup completed successfully!`);
  console.log(`   Backup file: ${backupPath}`);
  console.log(`   Checksum file: ${checksumPath}`);
  if (options.exportJson) {
    console.log(`   JSON exports: ${join(options.outputDir, `fpf-backup-${timestamp}`)}`);
  }
  console.log(`\nTo restore this backup, run:`);
  console.log(`   bun run scripts/restore-sqlite.ts ${backupPath}\n`);
}

async function main() {
  try {
    const options = parseArgs();
    await createBackup(options);
  } catch (err) {
    console.error(`\n❌ Backup failed:`, err);
    process.exit(1);
  }
}

main();
