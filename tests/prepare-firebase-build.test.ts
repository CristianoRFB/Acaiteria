import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const prepareScript = fileURLToPath(new URL('../scripts/prepare-firebase-build.mjs', import.meta.url));

describe('Firebase build packaging', () => {
  it('copies the server runtime without copying Wrangler local secrets', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'acai-firebase-build-'));
    const source = join(projectRoot, 'dist', 'server');
    const destination = join(projectRoot, 'functions', 'lib', 'site-server');

    try {
      await mkdir(source, { recursive: true });
      await writeFile(join(source, 'index.js'), 'export default {}');
      await writeFile(join(source, '.dev.vars'), 'QA_SECRET=must-not-be-packaged');

      await execFileAsync(process.execPath, [prepareScript], { cwd: projectRoot });

      expect(await readFile(join(destination, 'index.js'), 'utf8')).toBe('export default {}');
      expect(existsSync(join(destination, '.dev.vars'))).toBe(false);
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});
