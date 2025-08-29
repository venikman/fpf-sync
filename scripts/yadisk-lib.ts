export function sanitizeFilename(n: string | undefined): string {
  const base = (n ?? 'downloaded-file').toString();
  const justName = base.split(/[\\/]/).pop() ?? 'downloaded-file';
  const cleaned = justName.replace(/[\\\/:*?"<>|]/g, '_');
  const safe = cleaned.replace(/^\.+$/, '_');
  return safe || 'downloaded-file';
}

export function envArg(
  argv: string[],
  env: Record<string, string | undefined>,
  name: string,
  def?: string,
): string | undefined {
  const flag = `--${name}`;
  const idx = argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1];
  // Use underscore format for env vars (PUBLIC_URL, MAX_BYTES, etc.)
  const envKey = name.toUpperCase().replace(/-/g, '_');
  return env[envKey] ?? def;
}

export function enforceSizeCap(args: {
  reportedSize?: number;
  downloadedBytes?: number;
  maxBytes: number;
}) {
  const { reportedSize = 0, downloadedBytes = 0, maxBytes } = args;
  if (maxBytes > 0 && reportedSize > 0 && reportedSize > maxBytes) {
    throw new Error(`Remote file too large: ${reportedSize} bytes exceeds cap ${maxBytes}`);
  }
  if (maxBytes > 0 && downloadedBytes > maxBytes) {
    throw new Error(`Downloaded file too large: ${downloadedBytes} bytes exceeds cap ${maxBytes}`);
  }
}

export async function fetchJson<T = unknown>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, opts);
  if (res.ok) {
    return res.json() as Promise<T>;
  }
  const text = await res.text();
  let message = `HTTP ${res.status} for ${url}`;
  try {
    const json = JSON.parse(text);
    message += `\n${JSON.stringify(json, null, 2)}`;
  } catch {
    message += `\n${text}`;
  }
  throw new Error(message);
}
