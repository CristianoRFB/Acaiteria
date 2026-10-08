import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const versionRoot = join(root, 'docs', 'versions', '0.1.0');
const sourceRoot = join(versionRoot, 'diagrams', 'source');
const renderedRoot = join(versionRoot, 'diagrams', 'rendered');
const packageRoot = join(root, 'node_modules', '@mermaid-js', 'mermaid-cli');
const packageJsonPath = join(packageRoot, 'package.json');

try { await access(packageJsonPath); }
catch {
  process.stderr.write('Mermaid CLI ausente. Execute npm install antes de gerar SVGs.\n');
  process.exit(1);
}

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const cliRelativePath = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.mmdc;
if (!cliRelativePath) throw new Error('O pacote Mermaid CLI não declara o comando mmdc.');
const cliPath = join(packageRoot, cliRelativePath);
const entries = await readdir(sourceRoot, { withFileTypes: true });
const sources = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.mmd'));
if (!sources.length) throw new Error(`Nenhuma fonte Mermaid encontrada em ${sourceRoot}.`);
await mkdir(renderedRoot, { recursive: true });

const environment = { ...process.env };
if (process.platform === 'win32' && !environment.PUPPETEER_EXECUTABLE_PATH) {
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  try { await access(edge); environment.PUPPETEER_EXECUTABLE_PATH = edge; } catch { /* usa o Chromium instalado pelo Puppeteer */ }
}

for (const source of sources) {
  const input = join(sourceRoot, source.name);
  const output = join(renderedRoot, `${source.name.slice(0, -4)}.svg`);
  process.stdout.write(`Renderizando ${source.name}…\n`);
  const result = spawnSync(process.execPath, [cliPath, '-i', input, '-o', output, '-t', 'neutral', '-b', 'transparent'], {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Mermaid CLI falhou ao renderizar ${source.name} (código ${result.status}).`);
}
process.stdout.write(`${sources.length} diagrama(s) renderizados em ${renderedRoot}.\n`);
