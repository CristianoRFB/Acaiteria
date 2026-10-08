import { readdir, readFile, access } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = join(root, 'docs');
const currentPath = join(docsRoot, 'CURRENT.md');
const required = [
  'README.md', 'STATUS.md', 'ARCHITECTURE.md', 'DATA_MODEL.md', 'SECURITY.md',
  'FIREBASE_STRUCTURE.md', 'PROJECT_STRUCTURE.md', 'SCREENS.md',
  'GENERATED_VISUALS.md', 'LEADS_OVERVIEW.md', 'DEPLOYMENT.md', 'MIGRATION.md', 'ROADMAP.md',
];
const errors = [];

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

if (!await exists(currentPath)) errors.push('docs/CURRENT.md não existe.');
const current = await readFile(currentPath, 'utf8').catch(() => '');
const versionMatch = current.match(/versions\/([^/\s)]+)\/README\.md/);
if (!versionMatch) errors.push('docs/CURRENT.md não aponta para versions/<versão>/README.md.');
const versionDirectory = versionMatch ? join(docsRoot, 'versions', versionMatch[1]) : '';
if (versionDirectory && !await exists(versionDirectory)) errors.push(`Versão documental não existe: ${versionDirectory}`);

for (const name of required) {
  const file = join(versionDirectory, name);
  if (!versionDirectory || !await exists(file)) errors.push(`Documento obrigatório ausente: ${file || name}`);
}
for (const file of [join(docsRoot, 'DIAGRAMS_MANIFEST.md'), join(docsRoot, 'LEADS_MANIFEST.md')]) {
  if (!await exists(file)) errors.push(`Manifesto obrigatório ausente: ${file}`);
}

const markdownFiles = (await walk(docsRoot)).filter((file) => extname(file).toLowerCase() === '.md');
for (const markdownFile of markdownFiles) {
  const content = await readFile(markdownFile, 'utf8');
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].trim().split('#')[0];
    if (!target || /^(?:https?:|mailto:|data:|#)/i.test(target)) continue;
    const decoded = decodeURIComponent(target);
    const localPath = resolve(dirname(markdownFile), decoded);
    if (!localPath.startsWith(docsRoot) || !await exists(localPath)) {
      errors.push(`Link local inexistente em ${markdownFile}: ${target}`);
    }
  }
}

if (versionDirectory) {
  const sourceDirectory = join(versionDirectory, 'diagrams', 'source');
  const renderedDirectory = join(versionDirectory, 'diagrams', 'rendered');
  if (!await exists(sourceDirectory)) errors.push('Pasta diagrams/source ausente.');
  if (!await exists(renderedDirectory)) errors.push('Pasta diagrams/rendered ausente.');
  else {
    const sources = (await walk(sourceDirectory)).filter((file) => extname(file) === '.mmd');
    for (const source of sources) {
      const rendered = join(renderedDirectory, `${source.slice(sourceDirectory.length + 1, -4)}.svg`);
      if (!await exists(rendered)) errors.push(`Render SVG ausente para ${source}: ${rendered}`);
    }
  }
  const screenshots = join(versionDirectory, 'screenshots');
  const declaredScreenshots = new Set();
  const screensManifest = await readFile(join(versionDirectory, 'SCREENS.md'), 'utf8').catch(() => '');
  for (const line of screensManifest.split(/\r?\n/).filter((entry) => /^\|/.test(entry))) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 7 || cells[0] === 'Tela' || cells[0].startsWith('---')) continue;
    const file = cells[4].replace(/[`]/g, '');
    if (cells[5] === 'Sim' && file && file !== '—') {
      const screenshotPath = resolve(versionDirectory, file);
      const fromScreenshots = relative(screenshots, screenshotPath);
      if (fromScreenshots.startsWith('..') || isAbsolute(fromScreenshots)) {
        errors.push(`Screenshot real declarada fora de screenshots/: ${file}`);
      } else {
        declaredScreenshots.add(screenshotPath);
        if (!await exists(screenshotPath)) errors.push(`Screenshot real declarada não existe em screenshots/: ${file}`);
      }
    }
  }
  const generated = join(versionDirectory, 'generated');
  if (await exists(screenshots)) {
    const files = await walk(screenshots);
    for (const file of files) {
      const extension = extname(file).toLowerCase();
      if (extension === '.md') continue;
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) errors.push(`Tipo de arquivo não suportado em screenshots/: ${file}`);
      if (!declaredScreenshots.has(resolve(file))) errors.push(`Screenshot sem registro real em SCREENS.md: ${file}`);
    }
  }
  if (await exists(generated)) {
    const generatedFiles = await walk(generated);
    if (generatedFiles.some((file) => file.includes(`${join('screenshots', '')}`))) errors.push('Conteúdo gerado não pode ficar dentro de screenshots/.');
    const generatedManifest = await readFile(join(versionDirectory, 'GENERATED_VISUALS.md'), 'utf8').catch(() => '');
    for (const line of generatedManifest.split(/\r?\n/).filter((entry) => /^\|/.test(entry) && /\]\(/.test(entry))) {
      const target = line.match(/\]\(([^)]+)\)/)?.[1];
      if (!target) continue;
      const visualPath = resolve(versionDirectory, target);
      const fromGenerated = relative(generated, visualPath);
      if (fromGenerated.startsWith('..') || isAbsolute(fromGenerated) || !await exists(visualPath)) {
        errors.push(`Visual gerado fora de generated/ ou inexistente em GENERATED_VISUALS.md: ${target}`);
      }
    }
  }
}

if (errors.length) {
  process.stderr.write(`docs:check encontrou ${errors.length} problema(s):\n${errors.map((error) => `- ${error}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`docs:check OK — ${markdownFiles.length} documentos, manifests e referências locais válidos.\n`);
}
