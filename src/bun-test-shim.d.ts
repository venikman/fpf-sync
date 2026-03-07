type BunExpectation = {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toMatchObject(expected: object): void;
  toThrow(expected?: Error | RegExp | string): void;
  rejects: {
    toThrow(expected?: Error | RegExp | string): Promise<void>;
  };
};

declare module 'bun:test' {
  export const afterEach: (handler: () => Promise<void> | void) => void;
  export const beforeEach: (handler: () => Promise<void> | void) => void;
  export const describe: (name: string, handler: () => void) => void;
  export const expect: (value: unknown) => BunExpectation;
  export const test: (name: string, handler: () => Promise<void> | void) => void;
}
