import { spawn } from 'node:child_process';

const firebaseCli = process.platform === 'win32'
  ? 'node_modules/firebase-tools/lib/bin/firebase.js'
  : 'node_modules/.bin/firebase';
const child = spawn(process.execPath, [firebaseCli, 'emulators:exec', '--project', 'demo-acai-mais-sabor', '--only', 'auth,firestore,functions', 'npm --prefix functions run test:integration'], {
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: process.env.FUNCTIONS_DISCOVERY_TIMEOUT ?? '30000' },
});
child.on('exit', (code) => process.exit(code ?? 1));
