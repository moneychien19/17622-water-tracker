import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Migrate one template SQLite DB; each test file copies it (fast, isolated). */
export default function setup(project: TestProject): () => void {
  const dir = mkdtempSync(join(tmpdir(), 'water-test-'));
  const templatePath = join(dir, 'template.db');
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: `file:${templatePath}` },
    stdio: 'pipe',
  });
  project.provide('templateDbPath', templatePath);
  return () => {
    rmSync(dir, { recursive: true, force: true });
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    templateDbPath: string;
  }
}
