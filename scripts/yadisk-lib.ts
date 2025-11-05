const DEFAULT_FILENAME = 'downloaded-file';
const INVALID_PATH_CHARS = /[\\/:*?"<>|]/g;
const ONLY_DOTS = /^\.+$/;

export function sanitizeFilename(filename: string | undefined): string {
  const fallback = DEFAULT_FILENAME;
  const input = (filename ?? fallback).toString();
  const basename = input.split(/[\\/]/).pop() ?? fallback;
  const withoutInvalidChars = basename.replace(INVALID_PATH_CHARS, '_');
  const withoutDotNames = withoutInvalidChars.replace(ONLY_DOTS, '_');
  return withoutDotNames || fallback;
}

function isFlag(arg: string): boolean {
  return arg.startsWith('--');
}

function kebabToSnakeCase(str: string): string {
  return str.toUpperCase().replace(/-/g, '_');
}

export function getConfigValue(
  argv: string[],
  env: Record<string, string | undefined>,
  paramName: string,
  defaultValue?: string,
): string | undefined {
  const flagName = `--${paramName}`;
  const flagIndex = argv.indexOf(flagName);

  if (flagIndex !== -1 && flagIndex + 1 < argv.length) {
    const nextArg = argv[flagIndex + 1];
    if (!isFlag(nextArg)) {
      return nextArg;
    }
  }

  const envKey = kebabToSnakeCase(paramName);
  const legacyEnvKey = `YANDEX_${envKey}`;

  return env[envKey] ?? env[legacyEnvKey] ?? defaultValue;
}

export const envArg = getConfigValue;

function exceedsLimit(size: number, limit: number): boolean {
  return limit > 0 && size > limit;
}

export function validateFileSize(args: {
  reportedSize?: number;
  downloadedBytes?: number;
  maxBytes: number;
}) {
  const { reportedSize = 0, downloadedBytes = 0, maxBytes } = args;

  if (exceedsLimit(reportedSize, maxBytes)) {
    throw new Error(`Remote file too large: ${reportedSize} bytes exceeds cap ${maxBytes}`);
  }

  if (exceedsLimit(downloadedBytes, maxBytes)) {
    throw new Error(`Downloaded file too large: ${downloadedBytes} bytes exceeds cap ${maxBytes}`);
  }
}

export const enforceSizeCap = validateFileSize;

function formatErrorMessage(url: string, status: number, body: string): string {
  let message = `HTTP ${status} for ${url}`;
  try {
    const json = JSON.parse(body);
    message += `\n${JSON.stringify(json, null, 2)}`;
  } catch {
    message += `\n${body}`;
  }
  return message;
}

export async function fetchJson<T = unknown>(url: string, opts: RequestInit = {}): Promise<T> {
  const response = await fetch(url, opts);

  if (response.ok) {
    return response.json() as Promise<T>;
  }

  const body = await response.text();
  throw new Error(formatErrorMessage(url, response.status, body));
}
