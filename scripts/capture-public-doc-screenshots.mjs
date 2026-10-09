import { access, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(root, 'docs', 'versions', '0.1.0', 'screenshots');
const baseUrl = (process.argv.find((argument) => argument.startsWith('--base-url='))?.slice('--base-url='.length) || 'http://localhost:3001').replace(/\/$/, '');
const replaceExisting = process.argv.includes('--replace-existing');
const browserPath = process.env.PUPPETEER_EXECUTABLE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const captures = [
  { slug: 'acai-mais-sabor', file: 'storefront-tenant-a-desktop-viewport.png', viewport: { width: 1440, height: 1000 } },
  { slug: 'amora-acai-demo', file: 'storefront-tenant-b-desktop-viewport.png', viewport: { width: 1440, height: 1000 } },
  { slug: 'acai-mais-sabor', file: 'storefront-tenant-a-mobile-viewport.png', viewport: { width: 390, height: 844 }, mobile: true },
  { slug: 'acai-mais-sabor', path: '/acai-mais-sabor/montar/acai-monte-seu', file: 'product-builder-tenant-a-desktop-viewport.png', viewport: { width: 1440, height: 1100 }, expectedText: 'Escolha o tamanho' },
  { slug: 'acai-mais-sabor', path: '/acai-mais-sabor/carrinho', file: 'cart-empty-tenant-a-mobile-viewport.png', viewport: { width: 390, height: 844 }, mobile: true, expectedText: 'Seu carrinho está vazio' },
  { slug: 'acai-mais-sabor', path: '/acai-mais-sabor/checkout', file: 'checkout-empty-tenant-a-mobile-viewport.png', viewport: { width: 390, height: 844 }, mobile: true, expectedText: 'Carrinho vazio' },
];

await mkdir(outputDirectory, { recursive: true });
for (const capture of captures) {
  const exists = await access(join(outputDirectory, capture.file)).then(() => true, () => false);
  if (exists && !replaceExisting) throw new Error(`Recusando sobrescrever screenshot existente: ${capture.file}. Use --replace-existing após confirmar que deseja atualizá-lo.`);
}

const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ['--disable-gpu', '--no-first-run'] });
try {
  for (const capture of captures) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewport({ ...capture.viewport, isMobile: Boolean(capture.mobile), deviceScaleFactor: capture.mobile ? 2 : 1 });
    const url = `${baseUrl}${capture.path ?? `/${capture.slug}`}`;
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!response?.ok()) throw new Error(`${url} respondeu ${response?.status() ?? 'sem resposta'}.`);
    await page.waitForSelector('main', { timeout: 20000 });
    const expectedBrand = capture.slug === 'acai-mais-sabor' ? 'Açaí + Sabor' : 'Amora Açaí';
    const expectedColor = capture.slug === 'acai-mais-sabor' ? '#82204f' : '#5634a5';
    await page.waitForFunction(({ brand, color, expectedText }) => {
      if (expectedText) return document.body.innerText.includes(expectedText);
      const tenantRoot = document.querySelector('[data-tenant-root]');
      return Boolean(tenantRoot && document.body.innerText.includes(brand) && getComputedStyle(tenantRoot).getPropertyValue('--brand').trim().toLowerCase() === color);
    }, { timeout: 25000 }, { brand: expectedBrand, color: expectedColor, expectedText: capture.expectedText });
    await page.evaluate(() => document.fonts?.ready);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    const bodyText = await page.$eval('body', (element) => element.innerText);
    if (capture.expectedText && !bodyText.includes(capture.expectedText)) {
      throw new Error(`${capture.path}: estado esperado ausente (${capture.expectedText}).`);
    }
    const browserContext = await page.evaluate(() => {
      const tenantRoot = document.querySelector('[data-tenant-root]');
      return { pathname: location.pathname, title: document.title, tenantRoot: tenantRoot?.getAttribute('data-tenant-root'), brandColor: tenantRoot ? getComputedStyle(tenantRoot).getPropertyValue('--brand').trim() : '' };
    });
    if (!capture.expectedText && !bodyText.includes(expectedBrand)) throw new Error(`${capture.slug}: identidade ausente. Browser=${JSON.stringify(browserContext)}. Conteúdo: ${bodyText.slice(0, 500)}`);
    if (!capture.expectedText && browserContext.brandColor.toLowerCase() !== expectedColor) throw new Error(`${capture.slug}: token de cor esperado ${expectedColor}, recebido ${browserContext.brandColor || 'vazio'}.`);
    if (capture.slug === 'amora-acai-demo' && ['Santa Fé do Sul', '98165-2600', 'Navarro de Andrade'].some((value) => bodyText.includes(value))) {
      throw new Error('Tenant B mostrou contato/endereço operacional de Tenant A. Screenshot bloqueada para evitar registrar vazamento de dados.');
    }
    if (pageErrors.length) throw new Error(`${capture.slug}: erro de navegador: ${pageErrors.join(' | ')}`);
    await page.screenshot({ path: join(outputDirectory, capture.file) });
    process.stdout.write(`${capture.file} — ${response.status()} ${url} — ${capture.viewport.width}x${capture.viewport.height}${capture.mobile ? ' mobile' : ' desktop'}\n`);
    await page.close();
  }
} finally {
  await browser.close();
}
