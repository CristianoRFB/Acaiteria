import fs from 'node:fs';

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

const env = { ...readEnvFile('.env.production.local'), ...process.env };
const required = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY',
];
const missing = required.filter((key) => !String(env[key] ?? '').trim());
const invalid = [];
if (String(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID).startsWith('demo-')) invalid.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID não pode ser um projeto demo');
if (env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true') invalid.push('NEXT_PUBLIC_USE_FIREBASE_EMULATORS deve ser false');
if (env.NEXT_PUBLIC_USE_DEVELOPMENT_SEED === 'true') invalid.push('NEXT_PUBLIC_USE_DEVELOPMENT_SEED deve ser false');
if (env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY === 'COLE_AQUI') invalid.push('substitua a chave de exemplo do App Check');

if (missing.length || invalid.length) {
  console.error('Configuração de produção incompleta.');
  for (const key of missing) console.error(`- variável ausente: ${key}`);
  for (const message of invalid) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`Configuração de produção válida para o projeto ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.`);
