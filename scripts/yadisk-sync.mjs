#!/usr/bin/env bun
/**
 * Yandex Disk Sync - Download files from Yandex Disk public shares
 *
 * This script downloads files from Yandex Disk public shares and saves them
 * to the repository. Designed for use in GitHub Actions for automated syncing.
 *
 * Features:
 * - Supports both file and folder shares
 * - Filename sanitization and size limits
 * - Pre/post-download validation
 * - Configurable via CLI args or environment variables
 *
 * Usage:
 *   bun scripts/yadisk-sync.mjs --public-url "URL" --dest-path "yadisk"
 *
 * See DEVELOPERS.md for full documentation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { envArg, fetchJson, sanitizeFilename, enforceSizeCap } from './yadisk-lib.ts';
import process from "node:process";

// Constants
const DEFAULT_MAX_FILE_SIZE = 10_485_760; // 10MB in bytes
const DEFAULT_DEST_PATH = 'yadisk';
const DEFAULT_FILENAME = 'downloaded-file';
const YANDEX_API_BASE = 'https://cloud-api.yandex.net/v1/disk/public/resources';
const MAX_FOLDER_ITEMS = 1000; // Limit for folder listing

// Helper to get configuration from args or environment
const getArg = (name, def = undefined) => envArg(process.argv, process.env, name, def);

/**
 * Ensures a directory exists, creating it if necessary.
 * @param {string} dir - Directory path to create
 * @returns {Promise<void>}
 */
async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}


async function main() {
  // ==========================
  // Parse Configuration
  // ==========================
  const publicUrl = getArg('public-url');
  if (!publicUrl) {
    console.error('Error: Missing required --public-url or PUBLIC_URL environment variable');
    console.error('Usage: bun scripts/yadisk-sync.mjs --public-url "https://disk.yandex.ru/d/..."');
    process.exit(1);
  }

  // Optional parameters
  const publicPath = getArg('public-path');   // Path within the share (for folder shares)
  const targetName = getArg('target-name');   // Specific filename to pick from folder
  const destPath = getArg('dest-path', DEFAULT_DEST_PATH);
  const destFilename = getArg('dest-filename'); // Override saved filename
  const verbose = getArg('verbose', 'false') === 'true';

  // Parse max file size with validation
  const maxBytesArg = getArg('max-bytes');
  const parsedMax = (maxBytesArg != null && String(maxBytesArg).trim() !== '')
    ? parseInt(String(maxBytesArg), 10)
    : NaN;
  const maxBytes = Number.isFinite(parsedMax) && parsedMax >= 0
    ? parsedMax
    : DEFAULT_MAX_FILE_SIZE;

  if (verbose) {
    console.log('Configuration:');
    console.log(`  Public URL: ${publicUrl}`);
    console.log(`  Destination: ${destPath}/`);
    console.log(`  Max size: ${maxBytes} bytes (${(maxBytes / 1024 / 1024).toFixed(2)} MB)`);
  }

  // ==========================
  // Fetch File Metadata
  // ==========================
  const q = new URLSearchParams({ public_key: publicUrl });
  if (publicPath) q.set('path', publicPath);
  const metaUrl = `${YANDEX_API_BASE}?${q.toString()}`;

  if (verbose) console.log('\nFetching metadata from:', metaUrl);
  const meta = await fetchJson(metaUrl);

  /**
   * Resolves file metadata, handling both file and folder shares.
   * @param {Object} m - Metadata object from Yandex API
   * @returns {Promise<Object>} File metadata
   */
  async function resolveFileMeta(m) {
    // Direct file share - use as-is
    if (m.type === 'file') {
      if (verbose) console.log('Share type: Direct file');
      return m;
    }

    // Folder share - need to find the specific file
    if (m.type === 'dir') {
      if (verbose) console.log('Share type: Folder - listing contents...');

      const listQ = new URLSearchParams({
        public_key: publicUrl,
        path: m.path,
        limit: String(MAX_FOLDER_ITEMS)
      });
      const listUrl = `${YANDEX_API_BASE}?${listQ.toString()}`;
      if (verbose) console.log('Listing directory:', listUrl);

      const dirMeta = await fetchJson(listUrl);
      const items = dirMeta?._embedded?.items ?? [];

      if (!items.length) {
        throw new Error('Directory is empty or not accessible');
      }

      if (verbose) console.log(`Found ${items.length} items in folder`);

      // Find file by name if specified
      if (targetName) {
        const found = items.find((it) => it.type === 'file' && it.name === targetName);
        if (!found) {
          throw new Error(`File named "${targetName}" not found in folder share`);
        }
        if (verbose) console.log(`Selected file: ${found.name}`);
        return found;
      }

      throw new Error(
        'Share points to a folder. Use --public-path to specify file path ' +
        'or --target-name to select by filename'
      );
    }

    throw new Error(`Unknown resource type: ${m.type}`);
  }

  // ==========================
  // Validate File
  // ==========================
  const fileMeta = await resolveFileMeta(meta);

  // Check reported file size
  const reportedSizeRaw = Number(fileMeta.size);
  if (Number.isFinite(reportedSizeRaw) && reportedSizeRaw >= 0) {
    if (verbose) console.log(`Reported file size: ${reportedSizeRaw} bytes`);
    enforceSizeCap({ reportedSize: reportedSizeRaw, maxBytes });
  }

  const filePath = fileMeta.path; // Path within the Yandex Disk
  const name = sanitizeFilename(destFilename || fileMeta.name || DEFAULT_FILENAME);

  if (verbose) console.log(`Sanitized filename: ${name}`);

  // ==========================
  // Download File
  // ==========================
  // First, get the actual download URL
  const dlQ = new URLSearchParams({ public_key: publicUrl, path: filePath });
  const dlUrl = `${YANDEX_API_BASE}/download?${dlQ.toString()}`;
  if (verbose) console.log('\nResolving download URL...');

  const dl = await fetchJson(dlUrl);
  if (!dl?.href) {
    throw new Error('No download URL returned from Yandex API');
  }

  if (verbose) console.log('Downloading from:', dl.href);
  const fileRes = await fetch(dl.href);

  if (!fileRes.ok) {
    throw new Error(`Failed to download file: HTTP ${fileRes.status}`);
  }

  // Verify content-length header if present
  const contentLength = Number(fileRes.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength >= 0) {
    if (verbose) console.log(`Content-Length: ${contentLength} bytes`);
    enforceSizeCap({ reportedSize: contentLength, maxBytes });
  }

  // ==========================
  // Save to Filesystem
  // ==========================
  const outFile = path.join(destPath, name);
  await ensureDir(path.dirname(outFile));

  const ab = await fileRes.arrayBuffer();
  const u8 = new Uint8Array(ab);

  // Final size check on actual downloaded bytes
  const written = u8.byteLength;
  enforceSizeCap({ downloadedBytes: written, maxBytes });

  await fs.promises.writeFile(outFile, u8);

  console.log(`\n✓ Success!`);
  console.log(`  File: ${name}`);
  console.log(`  Size: ${written} bytes (${(written / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  Path: ${outFile}`);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
