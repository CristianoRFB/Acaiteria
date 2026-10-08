import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'demo-acai-mais-sabor';
const firebaseCli = process.platform === 'win32'
  ? join(projectRoot, 'node_modules/firebase-tools/lib/bin/firebase.js')
  : join(projectRoot, 'node_modules/.bin/firebase');

async function findFreePort(usedPorts) {
  while (true) {
    const server = createServer();
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolveListen);
    });
    const { port } = server.address();
    await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    if (!usedPorts.has(port)) {
      usedPorts.add(port);
      return port;
    }
  }
}

const usedPorts = new Set();
const [authPort, firestorePort, firestoreWebsocketPort, functionsPort, loggingPort, hubPort, eventarcPort, tasksPort] = await Promise.all(
  Array.from({ length: 8 }, () => findFreePort(usedPorts)),
);
const configPath = join(projectRoot, `.firebase.integration.${randomUUID()}.json`);
const firebaseConfig = JSON.parse(await readFile(join(projectRoot, 'firebase.json'), 'utf8'));
firebaseConfig.emulators = {
  ...firebaseConfig.emulators,
  auth: { ...firebaseConfig.emulators.auth, port: authPort },
  firestore: { ...firebaseConfig.emulators.firestore, port: firestorePort, websocketPort: firestoreWebsocketPort },
  functions: { ...firebaseConfig.emulators.functions, port: functionsPort },
  logging: { ...firebaseConfig.emulators.logging, port: loggingPort },
  hub: { ...firebaseConfig.emulators.hub, port: hubPort },
  eventarc: { ...firebaseConfig.emulators.eventarc, port: eventarcPort },
  tasks: { ...firebaseConfig.emulators.tasks, port: tasksPort },
  ui: { enabled: false },
};

await writeFile(configPath, JSON.stringify(firebaseConfig), { flag: 'wx' });
try {
  const exitCode = await new Promise((resolveExit) => {
    const child = spawn(process.execPath, [firebaseCli, 'emulators:exec', '--config', configPath, '--project', projectId, '--only', 'auth,firestore,functions', 'npm --prefix functions run test:integration'], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: false,
      env: {
        ...process.env,
        GCLOUD_PROJECT: projectId,
        FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
        FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
        FUNCTIONS_EMULATOR_HOST: `127.0.0.1:${functionsPort}`,
        FUNCTIONS_DISCOVERY_TIMEOUT: process.env.FUNCTIONS_DISCOVERY_TIMEOUT ?? '30000',
      },
    });
    child.once('error', (error) => {
      console.error('Não foi possível iniciar os emuladores Firebase:', error);
      resolveExit(1);
    });
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  await unlink(configPath).catch(() => {});
}
