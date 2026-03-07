declare global {
  const Bun: {
    file(path: string): {
      exists(): Promise<boolean>;
      text(): Promise<string>;
    };
    write(path: string, data: string): Promise<number>;
  };
}

export {};
