import { spawn } from 'node:child_process';
import { access, cp, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';

import puppeteer from 'puppeteer-core';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'docs', 'versions', '0.1.0', 'screenshots');
const replaceExisting = process.argv.includes('--replace-existing');
const worker = process.argv.includes('--worker');
const screenshots = [
  { file: 'admin-login-tenant-a-desktop.png', route: '/acai-mais-sabor/admin/login', expected: 'Entrar no painel', width: 1440, height: 1000, slug: 'acai-mais-sabor' },
  { file: 'admin-dashboard-tenant-a-desktop.png', route: '/acai-mais-sabor/admin', expected: 'Bom trabalho, equipe.', width: 1440, height: 1000, slug: 'acai-mais-sabor' },
  { file: 'admin-orders-tenant-a-desktop.png', route: '/acai-mais-sabor/admin/pedidos', expected: 'Pedidos', width: 1440, height: 1000, slug: 'acai-mais-sabor' },
  { file: 'admin-catalog-tenant-a-desktop.png', route: '/acai-mais-sabor/admin/catalogo', expected: 'Produtos', width: 1440, height: 1000, slug: 'acai-mais-sabor' },
  { file: 'admin-settings-tenant-a-desktop.png', route: '/acai-mais-sabor/admin/configuracoes', expected: 'Configurações', width: 1440, height: 1000, slug: 'acai-mais-sabor' },
  { file: 'admin-settings-tenant-a-mobile.png', route: '/acai-mais-sabor/admin/configuracoes', expected: 'Configurações', width: 390, height: 844, mobile: true, slug: 'acai-mais-sabor' },
  { file: 'admin-deliveries-tenant-a-desktop.png', route: '/acai-mais-sabor/admin/entregas', expected: 'Central de entregas', width: 1440, height: 1000, slug: 'acai-mais-sabor' },
  { file: 'admin-deliveries-tenant-a-mobile.png', route: '/acai-mais-sabor/admin/entregas', expected: 'Central de entregas', width: 390, height: 844, mobile: true, slug: 'acai-mais-sabor' },
  { file: 'admin-cash-tenant-a-desktop.png', route: '/acai-mais-sabor/admin/caixa', expected: 'Caixa', width: 1440, height: 1000, slug: 'acai-mais-sabor' },
  { file: 'admin-finance-tenant-a-desktop.png', route: '/acai-mais-sabor/admin/financas', expected: 'Finanças', width: 1440, height: 1000, slug: 'acai-mais-sabor' },
  { file: 'driver-login-tenant-b-mobile.png', route: '/amora-acai-demo/entregador/login', expected: 'Área do entregador', width: 390, height: 844, mobile: true, slug: 'amora-acai-demo' },
  { file: 'driver-dashboard-tenant-b-mobile.png', route: '/amora-acai-demo/entregador', expected: 'Nenhuma entrega agora', width: 390, height: 844, mobile: true, slug: 'amora-acai-demo' },
  { file: 'platform-owner-desktop.png', route: '/platform', expected: 'Estabelecimentos', width: 1440, height: 1000 },
  { file: 'platform-owner-mobile.png', route: '/platform', expected: 'Estabelecimentos', width: 390, height: 844, mobile: true },
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente para captura local: ${name}.`);
  return value;
}

function assertDemoEnvironment() {
  if (process.env.GCLOUD_PROJECT !== 'demo-acai-docs') {
    throw new Error('Capturas protegidas exigem somente o projeto local demo-acai-docs.');
  }
  const authUrl = new URL(required('NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL'));
  const firestoreHost = `${required('NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST')}:${required('NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT')}`;
  const authHost = `${authUrl.hostname}:${authUrl.port}`;
  const localHosts = new Set(['127.0.0.1', 'localhost']);
  if (!localHosts.has(authUrl.hostname)
    || !localHosts.has(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST)
    || process.env.FIRESTORE_EMULATOR_HOST !== firestoreHost
    || process.env.FIREBASE_AUTH_EMULATOR_HOST !== authHost) {
    throw new Error('Capturas protegidas exigem Auth e Firestore Emulator nos endpoints locais configurados.');
  }
}

async function launchWorker() {
  assertDemoEnvironment();
  const credentials = {
    adminEmail: required('DOCS_ADMIN_EMAIL'),
    adminPassword: required('DOCS_ADMIN_PASSWORD'),
    driverEmail: required('DOCS_DRIVER_EMAIL'),
    driverPassword: required('DOCS_DRIVER_PASSWORD'),
    platformEmail: required('DOCS_PLATFORM_EMAIL'),
    platformPassword: required('DOCS_PLATFORM_PASSWORD'),
  };
  const baseUrl = required('DOCS_SCREENSHOT_BASE_URL');
  const port = new URL(baseUrl).port;
  if (!port) throw new Error('DOCS_SCREENSHOT_BASE_URL precisa informar uma porta local.');
  await runSeed();
  const server = spawn(process.execPath, [join(projectRoot, 'node_modules', 'vinext', 'dist', 'cli.js'), 'dev', '--host', '127.0.0.1', '--port', port], {
    cwd: projectRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let serverOutput = '';
  server.stdout.on('data', (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-6000); });
  server.stderr.on('data', (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-6000); });

  try {
    await waitForServer(baseUrl, server, () => serverOutput);
    await captureScreenshots(baseUrl, credentials);
  } finally {
    server.kill('SIGINT');
    await waitForExit(server, 5000);
  }
}

async function runSeed() {
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [join(projectRoot, 'functions', 'scripts', 'seed-emulator.mjs')], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`O seed fictício do Emulator Suite terminou com código ${exitCode}.`);
}

async function captureScreenshots(baseUrl, credentials) {
  const browserPath = process.env.PUPPETEER_EXECUTABLE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  await access(browserPath);
  await mkdir(outputDirectory, { recursive: true });
  for (const screenshot of screenshots) {
    const path = join(outputDirectory, screenshot.file);
    const exists = await access(path).then(() => true, () => false);
    if (exists && !replaceExisting) throw new Error(`Recusando sobrescrever screenshot existente: ${screenshot.file}. Use --replace-existing após confirmar que deseja atualizá-lo.`);
  }

  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ['--disable-gpu', '--no-first-run'] });
  try {
    const adminContext = await browser.createBrowserContext();
    const adminPage = await adminContext.newPage();
    await preparePage(adminPage, screenshots[0]);
    await signIn(adminPage, `${baseUrl}/acai-mais-sabor/admin/login`, credentials.adminEmail, credentials.adminPassword, 'Operação em tempo real');
    await preparePage(adminPage, screenshots[1], { navigate: false });
    for (const screenshot of screenshots.slice(2, 10)) await preparePage(adminPage, screenshot);
    await adminContext.close();

    const driverContext = await browser.createBrowserContext();
    const driverPage = await driverContext.newPage();
    await preparePage(driverPage, screenshots[10]);
    await signIn(driverPage, `${baseUrl}/amora-acai-demo/entregador/login`, credentials.driverEmail, credentials.driverPassword, 'Nenhuma entrega agora', '/amora-acai-demo/entregador');
    await preparePage(driverPage, screenshots[11], { navigate: false });
    await driverContext.close();

    const platformContext = await browser.createBrowserContext();
    const platformPage = await platformContext.newPage();
    await signIn(platformPage, `${baseUrl}/platform`, credentials.platformEmail, credentials.platformPassword, 'Lojas cadastradas', '/platform');
    await preparePage(platformPage, screenshots[12], { navigate: false });
    await preparePage(platformPage, screenshots[13]);
    await platformContext.close();
  } finally {
    await browser.close();
  }
}

async function signIn(page, url, email, password, successText, expectedPath) {
  const requestFailures = [];
  const requestPaths = [];
  const navigationPaths = [];
  const pageErrors = [];
  const emulatorPorts = new Set([
    new URL(required('NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL')).port,
    required('NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT'),
  ]);
  const onRequest = (request) => {
    const requestUrl = new URL(request.url());
    if (emulatorPorts.has(requestUrl.port)) requestPaths.push(`${request.method()} ${requestUrl.origin}${requestUrl.pathname}`);
  };
  const onPageError = (error) => pageErrors.push(error.message);
  const onRequestFailed = (request) => {
    const requestUrl = new URL(request.url());
    requestFailures.push(`${requestUrl.origin}${requestUrl.pathname}: ${request.failure()?.errorText ?? 'request failed'}`);
  };
  const onFrameNavigated = (frame) => {
    if (!frame.parentFrame()) {
      try { navigationPaths.push(new URL(frame.url()).pathname); } catch { /* ignore non-http URLs */ }
    }
  };
  page.on('request', onRequest);
  page.on('requestfailed', onRequestFailed);
  page.on('framenavigated', onFrameNavigated);
  page.on('pageerror', onPageError);
  const expectedLoginPath = new URL(url).pathname;
  const currentPath = await page.evaluate(() => location.pathname).catch(() => '');
  if (currentPath !== expectedLoginPath) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.waitForFunction(() => {
    const form = document.querySelector('form');
    const reactPropsKey = form && Object.keys(form).find((key) => key.startsWith('__reactProps$'));
    return Boolean(reactPropsKey && typeof form[reactPropsKey].onSubmit === 'function');
  }, { timeout: 20000 });
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  const fieldsFilled = await page.evaluate(() => Boolean(document.querySelector('input[type="email"]')?.value && document.querySelector('input[type="password"]')?.value));
  if (!fieldsFilled) throw new Error(`O formulário de login não recebeu os dados de teste em ${url}.`);
  const submitHandled = await page.$eval('form', (form) => {
    let submitEvent;
    window.addEventListener('submit', (event) => { submitEvent = event; }, { once: true });
    const button = form.querySelector('button[type="submit"]');
    if (!button) return false;
    form.requestSubmit(button);
    return Boolean(submitEvent?.defaultPrevented);
  });
  if (!submitHandled) throw new Error(`O handler React do formulário ainda não intercepta submit em ${url}.`);
  try {
    await page.waitForFunction((expected) => document.body.innerText.includes(expected) || Boolean(document.querySelector('[role="alert"]')), { timeout: 45000 }, successText);
  } catch {
    const state = await page.evaluate(() => ({
      pathname: location.pathname,
      title: document.title,
      headings: [...document.querySelectorAll('h1')].map((element) => element.innerText.trim()),
      alert: document.querySelector('[role="alert"]')?.innerText.trim() ?? '',
      loginFormVisible: Boolean(document.querySelector('input[type="email"]') && document.querySelector('input[type="password"]')),
      loginFieldsFilled: Boolean(document.querySelector('input[type="email"]')?.value && document.querySelector('input[type="password"]')?.value),
      submitButton: document.querySelector('button[type="submit"]')?.innerText.trim() ?? '',
      submitDisabled: document.querySelector('button[type="submit"]')?.disabled ?? null,
      adminShellVisible: document.body.innerText.includes('Operação em tempo real'),
      driverReadyVisible: document.body.innerText.includes('Nenhuma entrega agora'),
      platformReadyVisible: document.body.innerText.includes('Lojas cadastradas'),
    }));
    throw new Error(`Login sem estado final reconhecido em ${url}: ${JSON.stringify({ ...state, requestPaths: requestPaths.filter((path) => path.includes(':9099/')), navigationPaths, requestFailures, pageErrors })}`);
  }
  page.off('request', onRequest);
  page.off('requestfailed', onRequestFailed);
  page.off('framenavigated', onFrameNavigated);
  page.off('pageerror', onPageError);
  const alert = await page.$eval('[role="alert"]', (element) => element.innerText).catch(() => '');
  if (alert) throw new Error(`Não foi possível autenticar em ${url}: ${alert}`);
  if (expectedPath) await page.waitForFunction((path) => location.pathname === path, { timeout: 30000 }, expectedPath);
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1200));
}

async function preparePage(page, screenshot, { navigate = true } = {}) {
  await page.setViewport({ width: screenshot.width, height: screenshot.height, isMobile: Boolean(screenshot.mobile), deviceScaleFactor: screenshot.mobile ? 2 : 1 });
  const pageErrors = [];
  const onPageError = (error) => pageErrors.push(error.message);
  page.on('pageerror', onPageError);
  if (navigate) {
    const response = await page.goto(`${process.env.DOCS_SCREENSHOT_BASE_URL}${screenshot.route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!response?.ok()) throw new Error(`${screenshot.route} respondeu ${response?.status() ?? 'sem resposta'}.`);
  }
  try {
    await page.waitForFunction((expected) => document.body.innerText.includes(expected), { timeout: 45000 }, screenshot.expected);
  } catch {
    const state = await page.evaluate(() => ({
      pathname: location.pathname,
      title: document.title,
      headings: [...document.querySelectorAll('h1, h2')].slice(0, 8).map((element) => element.innerText.trim()),
      alert: document.querySelector('[role="alert"]')?.innerText.trim() ?? '',
      tenantRoot: document.querySelector('[data-tenant-root]')?.getAttribute('data-tenant-root') ?? '',
    }));
    throw new Error(`Rota não apresentou o conteúdo esperado (${screenshot.expected}): ${JSON.stringify({ route: screenshot.route, state, pageErrors })}`);
  }
  await page.waitForSelector('main h1, main h2', { timeout: 15000 });
  if (screenshot.slug) {
    await page.waitForFunction((slug) => document.querySelector('[data-tenant-root]')?.getAttribute('data-tenant-root') === slug, { timeout: 15000 }, screenshot.slug);
  }
  await page.evaluate(() => document.fonts?.ready);
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 350));
  if (pageErrors.length) throw new Error(`${screenshot.route}: erro de navegador: ${pageErrors.join(' | ')}`);
  const filePath = join(outputDirectory, screenshot.file);
  await page.screenshot({ path: filePath });
  process.stdout.write(`${screenshot.file} — ${screenshot.route} — ${screenshot.width}x${screenshot.height}${screenshot.mobile ? ' mobile' : ' desktop'}\n`);
  page.off('pageerror', onPageError);
}

async function prepareSandbox() {
  for (const screenshot of screenshots) {
    const destination = join(outputDirectory, screenshot.file);
    const exists = await access(destination).then(() => true, () => false);
    if (exists && !replaceExisting) throw new Error(`Recusando sobrescrever screenshot existente: ${screenshot.file}. Use --replace-existing após confirmar que deseja atualizá-lo.`);
  }

  const sandbox = await mkdtemp(join(tmpdir(), 'acai-docs-protected-'));
  try {
    await cp(projectRoot, sandbox, {
      recursive: true,
      filter: (source) => {
        const path = relative(projectRoot, source);
        if (!path) return true;
        const parts = path.split(sep);
        const file = parts.at(-1) ?? '';
        if (parts.some((part) => ['.git', 'node_modules', '.next', 'dist', '.firebase-data', '.wrangler', 'coverage'].includes(part))) return false;
        if (file === '.dev.vars' || /^\.env(?:\.|$)/.test(file) || file.startsWith('.firebase.integration.')) return false;
        if (parts[0] === 'functions' && parts[1] === 'lib') return false;
        return true;
      },
    });
    await symlink(join(projectRoot, 'node_modules'), join(sandbox, 'node_modules'), 'junction');
    await symlink(join(projectRoot, 'functions', 'node_modules'), join(sandbox, 'functions', 'node_modules'), 'junction');
    return sandbox;
  } catch (error) {
    await rm(sandbox, { recursive: true, force: true });
    throw error;
  }
}

async function runInSandbox() {
  const sandbox = await prepareSandbox();
  const configPath = join(sandbox, `firebase.docs.${randomUUID()}.json`);
  const projectId = 'demo-acai-docs';
  const adminEmail = 'qa-owner@acai-docs.test';
  const driverEmail = 'qa-driver@acai-docs.test';
  const platformEmail = 'qa-platform@acai-docs.test';
  const adminPassword = randomBytes(24).toString('base64url');
  const driverPassword = randomBytes(24).toString('base64url');
  const platformPassword = randomBytes(24).toString('base64url');
  const appId = '1:000000000000:web:0000000000000000000000';
  const [authPort, firestorePort, functionsPort, port] = await freePorts(4);
  const inheritedEnvironmentKeys = new Set([
    'PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA',
    'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'PATHEXT', 'COMSPEC', 'JAVA_HOME',
  ]);
  const safeEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => inheritedEnvironmentKeys.has(key)));
  const environment = {
    ...safeEnvironment,
    GCLOUD_PROJECT: projectId,
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
    SEED_ADMIN_EMAIL: adminEmail,
    SEED_ADMIN_PASSWORD: adminPassword,
    SEED_DEMO_DRIVER_EMAIL: driverEmail,
    SEED_DEMO_DRIVER_PASSWORD: driverPassword,
    SEED_PLATFORM_OWNER_EMAIL: platformEmail,
    SEED_PLATFORM_OWNER_PASSWORD: platformPassword,
    DOCS_ADMIN_EMAIL: adminEmail,
    DOCS_ADMIN_PASSWORD: adminPassword,
    DOCS_DRIVER_EMAIL: driverEmail,
    DOCS_DRIVER_PASSWORD: driverPassword,
    DOCS_PLATFORM_EMAIL: platformEmail,
    DOCS_PLATFORM_PASSWORD: platformPassword,
    NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
    NEXT_PUBLIC_FIREBASE_APP_ID: appId,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true',
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: `http://127.0.0.1:${authPort}`,
    NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: '127.0.0.1',
    NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: String(firestorePort),
    NEXT_PUBLIC_FUNCTIONS_EMULATOR_HOST: '127.0.0.1',
    NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT: String(functionsPort),
    NEXT_PUBLIC_USE_DEVELOPMENT_SEED: 'false',
    NEXT_TELEMETRY_DISABLED: '1',
    NO_PROXY: 'localhost,127.0.0.1',
    PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
    DOCS_SCREENSHOT_BASE_URL: '',
  };
  let emulatorOutput = '';
  let hasCopiedCaptures = false;

  try {
    const firebaseConfig = JSON.parse(await readFile(join(sandbox, 'firebase.json'), 'utf8'));
    firebaseConfig.emulators = {
      ...firebaseConfig.emulators,
      auth: { ...firebaseConfig.emulators?.auth, host: '127.0.0.1', port: authPort },
      firestore: { ...firebaseConfig.emulators?.firestore, host: '127.0.0.1', port: firestorePort },
      functions: { ...firebaseConfig.emulators?.functions, host: '127.0.0.1', port: functionsPort },
      ui: { ...firebaseConfig.emulators?.ui, enabled: false },
      singleProjectMode: true,
    };
    await writeFile(configPath, JSON.stringify(firebaseConfig), { flag: 'wx' });

    const firebaseCli = join(sandbox, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
    const command = 'node scripts/capture-protected-doc-screenshots.mjs --worker';
    const result = await new Promise((resolveExit, reject) => {
      const child = spawn(process.execPath, [firebaseCli, 'emulators:exec', '--config', configPath, '--project', projectId, '--only', 'auth,firestore', command], {
        cwd: sandbox,
        env: { ...environment, DOCS_SCREENSHOT_BASE_URL: `http://127.0.0.1:${port}` },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      child.stdout.on('data', (chunk) => { const output = String(chunk); emulatorOutput = `${emulatorOutput}${output}`.slice(-12000); process.stdout.write(output); });
      child.stderr.on('data', (chunk) => { const output = String(chunk); emulatorOutput = `${emulatorOutput}${output}`.slice(-12000); process.stderr.write(output); });
      child.once('error', reject);
      child.once('exit', (code) => resolveExit(code ?? 1));
    });
    if (result !== 0) throw new Error(`A captura isolada falhou (código ${result}). Consulte o log do emulador acima.`);

    for (const screenshot of screenshots) {
      const source = join(sandbox, 'docs', 'versions', '0.1.0', 'screenshots', screenshot.file);
      await access(source);
      await copyFile(source, join(outputDirectory, screenshot.file));
      process.stdout.write(`Copiada prova local: ${screenshot.file}\n`);
    }
    hasCopiedCaptures = true;
  } finally {
    await rm(sandbox, { recursive: true, force: true });
    if (!hasCopiedCaptures && emulatorOutput.includes('SEED_')) {
      // Do not echo environment or seed output here; the seed intentionally creates temporary credentials.
      process.stderr.write('A execução terminou sem copiar as capturas; credenciais e emuladores ficaram restritos ao diretório temporário.\n');
    }
  }
}

async function freePorts(count) {
  const ports = new Set();
  while (ports.size < count) {
    const server = createServer();
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolveListen);
    });
    const address = server.address();
    await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    if (!address || typeof address === 'string') throw new Error('Não foi possível reservar a porta do servidor local.');
    ports.add(address.port);
  }
  return [...ports];
}

async function waitForServer(url, child, readOutput) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Servidor local encerrou durante a inicialização. ${readOutput()}`);
    try {
      const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
      if (response.status > 0) return;
    } catch { /* aguarda início do servidor */ }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`Tempo excedido ao iniciar o servidor de captura. ${readOutput()}`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, timeoutMs)),
  ]);
  if (child.exitCode === null) child.kill();
}

if (worker) await launchWorker();
else await runInSandbox();
