import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = join(root, 'docs');
const manifestPath = join(docsRoot, 'LEADS_MANIFEST.md');
const current = await readFile(join(docsRoot, 'CURRENT.md'), 'utf8');
const version = current.match(/versions\/([^/\s)]+)\/README\.md/)?.[1];
const errors = [];
const exists = async (path) => access(path).then(() => true, () => false);

if (!version) throw new Error('docs/CURRENT.md não aponta para a versão vigente.');
const versionRoot = join(docsRoot, 'versions', version);
const overview = await readFile(join(versionRoot, 'LEADS_OVERVIEW.md'), 'utf8').catch(() => '');
const manifest = await readFile(manifestPath, 'utf8').catch(() => '');
const tableStart = manifest.split(/\r?\n/).findIndex((line) => /^\|\s*Lead\s*\|/i.test(line));
if (tableStart < 0) errors.push('LEADS_MANIFEST.md não contém a tabela canônica de leads.');

const rows = tableStart < 0 ? [] : manifest.split(/\r?\n/).slice(tableStart + 2)
  .filter((line) => /^\|/.test(line))
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
const realLeads = [];
for (const row of rows) {
  if (row.length !== 8) {
    errors.push(`Linha do manifesto deve ter 8 colunas; recebeu ${row.length}: ${row.join(' | ')}`);
    continue;
  }
  if (/^(nenhum|—|-|vazio)$/i.test(row[0])) continue;
  const relativePath = row[7].replace(/[`]/g, '').replace(/\/$/, '');
  const leadPath = resolve(docsRoot, relativePath);
  const fromVersion = relative(versionRoot, leadPath);
  if (!relativePath.startsWith(`versions/${version}/leads/`) || fromVersion.startsWith('..') || isAbsolute(fromVersion)) {
    errors.push(`Caminho de lead fora da pasta da versão: ${row[7]}`);
    continue;
  }
  realLeads.push(leadPath);
  for (const file of ['LEAD_CONTEXT.md', 'LEAD_REFERENCE_SUMMARY.md', 'LEAD_VISUAL_DIRECTION.md']) {
    if (!await exists(join(leadPath, file))) errors.push(`Lead ${row[0]} não possui ${file}.`);
  }
  for (const directory of ['assets', 'captures', 'generated']) {
    if (!await exists(join(leadPath, directory))) errors.push(`Lead ${row[0]} não possui ${directory}/.`);
  }
  if (row.slice(1, 7).some((cell) => !cell || cell === '—')) errors.push(`Lead ${row[0]} tem campos sem informação; use “não informado” quando aplicável.`);
}

const leadsRoot = join(versionRoot, 'leads');
if (!await exists(leadsRoot)) errors.push(`Estrutura leads/ ausente: ${leadsRoot}`);
else {
  const directories = (await readdir(leadsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => join(leadsRoot, entry.name));
  for (const directory of directories) {
    if (!realLeads.includes(resolve(directory))) errors.push(`Pasta de lead não listada no manifesto: ${directory}`);
  }
}
if (!overview.includes('Não há leads confirmados')) errors.push('LEADS_OVERVIEW.md não confirma explicitamente a ausência ou a lista de leads reais.');

if (errors.length) {
  process.stderr.write(`docs:leads encontrou ${errors.length} problema(s):\n${errors.map((error) => `- ${error}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`docs:leads OK — ${realLeads.length} lead(s) confirmado(s); nenhum dado fictício foi criado.\n`);
}
