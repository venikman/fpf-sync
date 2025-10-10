export class FpfError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'FpfError';
  }
}

export function raise(code: string, message: string): never {
  throw new FpfError(code, message);
}

export function assertOr(code: string, cond: unknown, message: string): asserts cond {
  if (!cond) throw new FpfError(code, message);
}

export function isFpfError(e: unknown): e is FpfError {
  return !!e && typeof e === 'object' && (e as any).name === 'FpfError' && typeof (e as any).code === 'string';
}
