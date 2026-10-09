import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const source = resolve('dist/server');
const destination = resolve('functions/lib/site-server');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, {
  recursive: true,
  filter: (path) => basename(path) !== '.dev.vars',
});
if (existsSync(resolve(destination, '.dev.vars'))) {
  throw new Error('Arquivo local .dev.vars não pode fazer parte do pacote de Cloud Functions.');
}
process.stdout.write(`Frontend server copiado para ${destination}\n`);
