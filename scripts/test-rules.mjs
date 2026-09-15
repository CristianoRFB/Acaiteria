import net from 'node:net';
import { spawn } from 'node:child_process';

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.setTimeout(700, () => { socket.destroy(); resolve(false); });
  });
}

const existing = await portOpen(8180);
const command = existing
  ? ['npx', ['vitest', 'run', '--config', 'vitest.config.ts', 'tests/firestore.rules.test.ts']]
  : ['npx', ['firebase-tools', 'emulators:exec', '--project', 'demo-acai-mais-sabor', '--only', 'firestore', 'vitest run --config vitest.config.ts tests/firestore.rules.test.ts']];
const executable = process.platform === 'win32' ? `${command[0]}.cmd` : command[0];
const child = spawn(executable, command[1], { stdio: 'inherit', shell: false, env: { ...process.env, ...(existing ? { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180' } : {}) } });
child.on('exit', (code) => process.exit(code ?? 1));
