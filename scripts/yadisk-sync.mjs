#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import process from "node:process";

// Inlined helpers (formerly from scripts/yadisk-lib.ts)
const INVALID_PATH_CHARS = /[\\/:*?"<>|]/g;
const ONLY_DOTS = /^\.+$/;

function sanitizeFilename(filename) {
  const fallback = DEFAULT_FILENAME;
  const input = String(filename ?? fallback);
  const basename = input.split(/[\\/]/).pop() ?? fallback;
  const withoutInvalidChars = basename.replace(INVALID_PATH_CHARS, '_');
  const withoutDotNames = withoutInvalidChars.replace(ONLY_DOTS, '_');
  return withoutDotNames || fallback;
}

function isFlag(arg) { return String(arg).startsWith('--'); }
function kebabToSnakeCase(str) { return String(str).toUpperCase().replace(/-/g, '_'); }

function getConfigValue(argv, env, paramName, defaultValue) {
  const flagName = `--${paramName}`;
  const flagIndex = argv.indexOf(flagName);
  if (flagIndex !== -1 && flagIndex + 1 < argv.length) {
    const nextArg = argv[flagIndex + 1];
    if (!isFlag(nextArg)) return nextArg;
  }
  const envKey = kebabToSnakeCase(paramName);
  const legacyEnvKey = `YANDEX_${envKey}`;
  return env[envKey] ?? env[legacyEnvKey] ?? defaultValue;
}

const envArg = getConfigValue;

function exceedsLimit(size, limit) { return limit > 0 && size > limit; }

function enforceSizeCap(args) {
  const reportedSize = Number(args?.reportedSize ?? 0);
  const downloadedBytes = Number(args?.downloadedBytes ?? 0);
  const maxBytes = Number(args?.maxBytes ?? 0);
  if (exceedsLimit(reportedSize, maxBytes)) {
    throw new Error(`Remote file too large: ${reportedSize} bytes exceeds cap ${maxBytes}`);
  }
  if (exceedsLimit(downloadedBytes, maxBytes)) {
    throw new Error(`Downloaded file too large: ${downloadedBytes} bytes exceeds cap ${maxBytes}`);
  }
}

function formatErrorMessage(url, status, body) {
  let message = `HTTP ${status} for ${url}`;
  try {
    const json = JSON.parse(body);
    message += `\n${JSON.stringify(json, null, 2)}`;
  } catch {
    message += `\n${body}`;
  }
  return message;
}

async function fetchJson(url, opts = {}) {
  const response = await fetch(url, opts);
  if (response.ok) {
    return response.json();
  }
  const body = await response.text();
  throw new Error(formatErrorMessage(url, response.status, body));
}

const DEFAULT_MAX_FILE_SIZE = 10_485_760;
const DEFAULT_DEST_PATH = 'yadisk';
const DEFAULT_FILENAME = 'downloaded-file';
const YANDEX_API_BASE = 'https://cloud-api.yandex.net/v1/disk/public/resources';
const ITEMS_PER_PAGE = 1000;

const getConfig = (name, defaultValue) => envArg(process.argv, process.env, name, defaultValue);

async function ensureDirectoryExists(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

function parseMaxFileSize(arg) {
  if (arg == null || String(arg).trim() === '') {
    return DEFAULT_MAX_FILE_SIZE;
  }
  const parsed = parseInt(String(arg), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MAX_FILE_SIZE;
}

function logConfig(config, verbose) {
  if (!verbose) return;
  console.log('Configuration:');
  console.log(`  Public URL: ${config.publicUrl}`);
  console.log(`  Destination: ${config.destPath}/`);
  console.log(`  Max size: ${config.maxBytes} bytes (${(config.maxBytes / 1024 / 1024).toFixed(2)} MB)`);
}


async function findFileInFolder(publicUrl, folderPath, targetName, verbose) {
  if (!targetName) {
    throw new Error('Share points to a folder. Use --public-path or --target-name');
  }

  let offset = 0;
  let totalChecked = 0;

  while (true) {
    const params = new URLSearchParams({
      public_key: publicUrl,
      path: folderPath,
      limit: String(ITEMS_PER_PAGE),
      offset: String(offset)
    });
    const listUrl = `${YANDEX_API_BASE}?${params.toString()}`;

    if (verbose && offset === 0) console.log('Searching folder:', listUrl);
    if (verbose && offset > 0) console.log(`Checking items ${offset}-${offset + ITEMS_PER_PAGE}...`);

    const dirMeta = await fetchJson(listUrl);
    const items = dirMeta?._embedded?.items ?? [];

    if (offset === 0 && !items.length) {
      throw new Error('Directory is empty or not accessible');
    }

    if (!items.length) break;

    totalChecked += items.length;

    const found = items.find((it) => it.type === 'file' && it.name === targetName);
    if (found) {
      if (verbose) console.log(`Found file: ${found.name} (checked ${totalChecked} items)`);
      return found;
    }

    if (items.length < ITEMS_PER_PAGE) break;

    offset += items.length;
  }

  throw new Error(`File "${targetName}" not found in folder (checked ${totalChecked} items)`);
}

async function resolveFileMetadata(publicUrl, publicPath, targetName, verbose) {
  const params = new URLSearchParams({ public_key: publicUrl });
  if (publicPath) params.set('path', publicPath);
  const metaUrl = `${YANDEX_API_BASE}?${params.toString()}`;

  if (verbose) console.log('\nFetching metadata from:', metaUrl);
  const meta = await fetchJson(metaUrl);

  if (meta.type === 'file') {
    if (verbose) console.log('Share type: Direct file');
    return meta;
  }

  if (meta.type === 'dir') {
    if (verbose) console.log('Share type: Folder - listing contents...');
    return await findFileInFolder(publicUrl, meta.path, targetName, verbose);
  }

  throw new Error(`Unknown resource type: ${meta.type}`);
}

function validateAndLogFileSize(fileSize, maxBytes, verbose) {
  const size = Number(fileSize);
  if (Number.isFinite(size) && size >= 0) {
    if (verbose) console.log(`Reported file size: ${size} bytes`);
    enforceSizeCap({ reportedSize: size, maxBytes });
  }
}

async function getDownloadUrl(publicUrl, filePath, verbose) {
  const params = new URLSearchParams({ public_key: publicUrl, path: filePath });
  const downloadMetaUrl = `${YANDEX_API_BASE}/download?${params.toString()}`;
  if (verbose) console.log('\nResolving download URL...');

  const downloadMeta = await fetchJson(downloadMetaUrl);
  if (!downloadMeta?.href) {
    throw new Error('No download URL returned from Yandex API');
  }

  return downloadMeta.href;
}

async function downloadFile(url, maxBytes, verbose) {
  if (verbose) console.log('Downloading from:', url);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download file: HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength >= 0) {
    if (verbose) console.log(`Content-Length: ${contentLength} bytes`);
    enforceSizeCap({ reportedSize: contentLength, maxBytes });
  }

  return response;
}

async function saveFile(response, destPath, filename, maxBytes) {
  const outputPath = path.join(destPath, filename);
  await ensureDirectoryExists(path.dirname(outputPath));

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  enforceSizeCap({ downloadedBytes: bytes.byteLength, maxBytes });

  await fs.promises.writeFile(outputPath, bytes);

  return { path: outputPath, size: bytes.byteLength };
}

function showSuccess(filename, fileSize, filePath) {
  console.log(`\n✓ Success!`);
  console.log(`  File: ${filename}`);
  console.log(`  Size: ${fileSize} bytes (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  Path: ${filePath}`);
}

async function main() {
  const publicUrl = getConfig('public-url');
  if (!publicUrl) {
    console.error('Error: Missing required --public-url or PUBLIC_URL environment variable');
    console.error('Usage: bun scripts/yadisk-sync.mjs --public-url "https://disk.yandex.ru/d/..."');
    process.exit(1);
  }

  const config = {
    publicUrl,
    publicPath: getConfig('public-path'),
    targetName: getConfig('target-name'),
    destPath: getConfig('dest-path', DEFAULT_DEST_PATH),
    destFilename: getConfig('dest-filename'),
    maxBytes: parseMaxFileSize(getConfig('max-bytes')),
    verbose: getConfig('verbose', 'false') === 'true',
  };

  logConfig(config, config.verbose);

  const fileMeta = await resolveFileMetadata(
    config.publicUrl,
    config.publicPath,
    config.targetName,
    config.verbose
  );

  validateAndLogFileSize(fileMeta.size, config.maxBytes, config.verbose);

  const filename = sanitizeFilename(config.destFilename || fileMeta.name || DEFAULT_FILENAME);
  if (config.verbose) console.log(`Sanitized filename: ${filename}`);

  const downloadUrl = await getDownloadUrl(config.publicUrl, fileMeta.path, config.verbose);
  const response = await downloadFile(downloadUrl, config.maxBytes, config.verbose);
  const result = await saveFile(response, config.destPath, filename, config.maxBytes);

  showSuccess(filename, result.size, result.path);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
