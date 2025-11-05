/**
 * Sanitizes a filename to prevent directory traversal and invalid characters.
 *
 * Security features:
 * - Strips directory paths (keeps only basename)
 * - Replaces invalid characters with underscores
 * - Handles edge cases like ".." or "."
 *
 * @param n - The filename to sanitize (can be undefined)
 * @returns A safe filename suitable for filesystem operations
 *
 * @example
 * sanitizeFilename("../../etc/passwd") // Returns: "passwd"
 * sanitizeFilename("file:name?.txt")   // Returns: "file_name_.txt"
 * sanitizeFilename(undefined)          // Returns: "downloaded-file"
 */
export function sanitizeFilename(n: string | undefined): string {
  const base = (n ?? 'downloaded-file').toString();
  const justName = base.split(/[\\/]/).pop() ?? 'downloaded-file';
  const cleaned = justName.replace(/[\\/:*?"<>|]/g, '_');
  const safe = cleaned.replace(/^\.+$/, '_');
  return safe || 'downloaded-file';
}

/**
 * Gets a configuration value from command-line arguments or environment variables.
 *
 * Priority:
 * 1. Command-line flag (e.g., --public-url)
 * 2. Environment variable (e.g., PUBLIC_URL)
 * 3. Default value
 *
 * @param argv - Command-line arguments array (typically process.argv)
 * @param env - Environment variables object (typically process.env)
 * @param name - Parameter name in kebab-case (e.g., "public-url")
 * @param def - Default value if not found
 * @returns The parameter value or undefined
 *
 * @example
 * // Command: node script.js --public-url "https://disk.yandex.ru/d/abc"
 * envArg(process.argv, process.env, "public-url")
 * // Returns: "https://disk.yandex.ru/d/abc"
 *
 * // Environment: PUBLIC_URL="https://disk.yandex.ru/d/xyz"
 * envArg(process.argv, process.env, "public-url")
 * // Returns: "https://disk.yandex.ru/d/xyz"
 */
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

/**
 * Enforces file size limits to prevent resource exhaustion and zip-bomb attacks.
 *
 * Checks both reported size (from API) and actual downloaded size.
 *
 * @param args - Size check parameters
 * @param args.reportedSize - File size reported by API (optional)
 * @param args.downloadedBytes - Actual size of downloaded file (optional)
 * @param args.maxBytes - Maximum allowed size in bytes (0 = no limit)
 * @throws {Error} If either size exceeds the maximum
 *
 * @example
 * // Check reported size before download
 * enforceSizeCap({ reportedSize: 5_000_000, maxBytes: 10_485_760 }); // OK
 *
 * // Check actual size after download
 * enforceSizeCap({ downloadedBytes: 15_000_000, maxBytes: 10_485_760 }); // Throws error
 */
export function enforceSizeCap(args: {
  reportedSize?: number;
  downloadedBytes?: number;
  maxBytes: number;
}) {
  const { reportedSize = 0, downloadedBytes = 0, maxBytes } = args;
  if (maxBytes > 0 && reportedSize > maxBytes) {
    throw new Error(`Remote file too large: ${reportedSize} bytes exceeds cap ${maxBytes}`);
  }
  if (maxBytes > 0 && downloadedBytes > maxBytes) {
    throw new Error(`Downloaded file too large: ${downloadedBytes} bytes exceeds cap ${maxBytes}`);
  }
}

/**
 * Fetches JSON from a URL with enhanced error handling.
 *
 * Features:
 * - Parses JSON response automatically
 * - Includes detailed error messages with response body
 * - Attempts to pretty-print JSON errors when possible
 *
 * @param url - The URL to fetch from
 * @param opts - Fetch options (headers, method, etc.)
 * @returns Parsed JSON response
 * @throws {Error} If request fails, includes HTTP status and response body
 *
 * @example
 * interface YandexMeta {
 *   type: 'file' | 'dir';
 *   name: string;
 *   size: number;
 * }
 *
 * const meta = await fetchJson<YandexMeta>(
 *   'https://cloud-api.yandex.net/v1/disk/public/resources?public_key=...'
 * );
 * console.log(meta.name, meta.size);
 */
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
