import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";

import { listWhitelistedFpfDocs, isAllowedFpfPath, getFpfDir } from "../../scripts/mcp/util.ts";

function toPosix(pathname: string): string {
  return pathname.split(/\\+/g).join("/");
}

test("listWhitelistedFpfDocs respects override, sorts deterministically, and normalizes paths", async () => {
  const repoDir = process.cwd();
  const docsDir = mkdtempSync(join(repoDir, "tmp-fpf-docs-"));
  const previousOverride = process.env.FPF_DOCS_DIR;
  try {
    writeFileSync(join(docsDir, "b.md"), "# B\n");
    writeFileSync(join(docsDir, "a.md"), "# A\n");
    writeFileSync(join(docsDir, "c.txt"), "plain text");
    mkdirSync(join(docsDir, "nested"));
    writeFileSync(join(docsDir, "nested", "ignored.md"), "# nested\n");

    process.env.FPF_DOCS_DIR = docsDir;

    const docs = await listWhitelistedFpfDocs();
    const expected = ["a.md", "b.md", "c.txt"].map(name => {
      const rel = relative(repoDir, join(docsDir, name));
      return toPosix(rel);
    });

    expect(docs).toEqual(expected);

    for (const relPath of docs) {
      const abs = isAllowedFpfPath(relPath);
      const baseName = relPath.split("/").pop();
      expect(baseName).toBeTruthy();
      expect(abs).toBe(join(docsDir, baseName!));
    }
  } finally {
    if (previousOverride === undefined) {
      delete process.env.FPF_DOCS_DIR;
    } else {
      process.env.FPF_DOCS_DIR = previousOverride;
    }
    rmSync(docsDir, { recursive: true, force: true });
  }
});

test("getFpfDir enforces repo-root subdirectory constraint", () => {
  const repoDir = process.cwd();
  const previousOverride = process.env.FPF_DOCS_DIR;
  try {
    process.env.FPF_DOCS_DIR = ".";
    expect(() => getFpfDir()).toThrow(/subdirectory/i);

    process.env.FPF_DOCS_DIR = "../outside";
    expect(() => getFpfDir()).toThrow(/escapes base/i);

    process.env.FPF_DOCS_DIR = "yadisk";
    expect(getFpfDir()).toBe(join(repoDir, "yadisk"));
  } finally {
    if (previousOverride === undefined) {
      delete process.env.FPF_DOCS_DIR;
    } else {
      process.env.FPF_DOCS_DIR = previousOverride;
    }
  }
});
