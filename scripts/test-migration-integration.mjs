import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'demo-acai-migration';
const firebaseCli = process.platform === 'win32'
  ? join(projectRoot, 'node_modules/firebase-tools/lib/bin/firebase.js')
  : join(projectRoot, 'node_modules/.bin/firebase');

async function findFreePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const { port } = server.address();
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

const [firestorePort, websocketPort] = await Promise.all([findFreePort(), findFreePort()]);
const configPath = join(projectRoot, `.firebase.migration.${randomUUID()}.json`);
const firebaseConfig = JSON.parse(await readFile(join(projectRoot, 'firebase.json'), 'utf8'));
firebaseConfig.emulators = {
  ...firebaseConfig.emulators,
  firestore: { ...firebaseConfig.emulators.firestore, port: firestorePort, websocketPort },
  ui: { enabled: false },
};

await writeFile(configPath, JSON.stringify(firebaseConfig), { flag: 'wx' });
try {
  const exitCode = await new Promise((resolveExit) => {
    const child = spawn(process.execPath, [firebaseCli, 'emulators:exec', '--config', configPath, '--project', projectId, '--only', 'firestore', 'node functions/scripts/test-migration-emulator.mjs'], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: false,
      env: {
        ...process.env,
        GCLOUD_PROJECT: projectId,
        FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
      },
    });
    child.once('error', (error) => {
      console.error('Não foi possível iniciar o emulador Firestore para testar a migração:', error);
      resolveExit(1);
    });
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  await unlink(configPath).catch(() => {});
}
