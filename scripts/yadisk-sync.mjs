#!/usr/bin/env bun
// Minimal Node script to download a file from a Yandex Disk public share
// and save it into the repo. Designed for use in CI (GitHub Actions).

import fs from 'node:fs';
import path from 'node:path';
import { envArg, fetchJson, sanitizeFilename, enforceSizeCap } from './yadisk-lib.ts';

const getArg = (name, def = undefined) => envArg(process.argv, process.env, name, def);

// fetchJson imported from library

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function writeFileBytes(filePath, bytes) {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, Buffer.from(bytes));
}

async function main() {
  const publicUrl = getArg('public-url');
  if (!publicUrl) {
    console.error('Missing required --public-url or PUBLIC_URL env');
    process.exit(1);
  }

  const publicPath = getArg('public-path'); // optional, path within the share
  const targetName = getArg('target-name'); // optional, pick a file by name from a folder share
  const destPath = getArg('dest-path', 'yadisk'); // directory to write into
  const destFilename = getArg('dest-filename'); // optional, override filename
  const maxBytesArg = getArg('max-bytes'); // optional, cap max file size in bytes
  const parsedMax = (maxBytesArg != null && String(maxBytesArg).trim() !== '')
    ? parseInt(String(maxBytesArg), 10)
    : NaN;
  const maxBytes = Number.isFinite(parsedMax) && parsedMax >= 0 ? parsedMax : 10_485_760; // default 10MB
  const verbose = getArg('verbose', 'false') === 'true';

  const apiBase = 'https://cloud-api.yandex.net/v1/disk/public/resources';
  const q = new URLSearchParams({ public_key: publicUrl });
  if (publicPath) q.set('path', publicPath);
  let metaUrl = `${apiBase}?${q.toString()}`;

  if (verbose) console.log('Fetching meta:', metaUrl);
  let meta = await fetchJson(metaUrl);

  async function resolveFileMeta(m) {
    if (m.type === 'file') return m;
    if (m.type === 'dir') {
      // Either publicPath points to a file, or we need to find by targetName
      // Re-query to list directory contents deterministically
      const listQ = new URLSearchParams({ public_key: publicUrl, path: m.path, limit: '1000' });
      const listUrl = `${apiBase}?${listQ.toString()}`;
      if (verbose) console.log('Listing dir:', listUrl);
      const dirMeta = await fetchJson(listUrl);
      const items = dirMeta?._embedded?.items ?? [];
      if (!items.length) throw new Error('Directory is empty or not accessible');
      if (targetName) {
        const found = items.find((it) => it.type === 'file' && it.name === targetName);
        if (!found) throw new Error(`File named ${targetName} not found in folder share`);
        return found;
      }
      throw new Error('Share points to a folder. Provide --public-path to a file or --target-name');
    }
    throw new Error(`Unknown resource type: ${m.type}`);
  }

  const fileMeta = await resolveFileMeta(meta);
  const reportedSizeRaw = Number(fileMeta.size);
  if (Number.isFinite(reportedSizeRaw) && reportedSizeRaw >= 0) {
    enforceSizeCap({ reportedSize: reportedSizeRaw, maxBytes });
  }
  const filePath = fileMeta.path; // path within the public disk
  const name = sanitizeFilename(destFilename || fileMeta.name || 'downloaded-file');

  // Get the actual download link
  const dlQ = new URLSearchParams({ public_key: publicUrl, path: filePath });
  const dlUrl = `${apiBase}/download?${dlQ.toString()}`;
  if (verbose) console.log('Resolving download URL:', dlUrl);
  const dl = await fetchJson(dlUrl);

  if (!dl?.href) throw new Error('No download href returned');
  if (verbose) console.log('Downloading:', dl.href);
  const fileRes = await fetch(dl.href);
  if (!fileRes.ok) throw new Error(`Failed to download file: HTTP ${fileRes.status}`);
  const bytes = await fileRes.arrayBuffer();
  enforceSizeCap({ downloadedBytes: bytes.byteLength, maxBytes });

  const outFile = path.join(destPath, name);
  await writeFileBytes(outFile, bytes);
  console.log(`Saved ${name} (${bytes.byteLength} bytes) to ${outFile}`);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
