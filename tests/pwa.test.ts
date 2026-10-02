import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const publicDirectory = resolve(process.cwd(), 'public');
const manifests = ['/manifest.webmanifest', '/admin/manifest.webmanifest', '/entregador/manifest.webmanifest'].map((path) => JSON.parse(
  readFileSync(resolve(publicDirectory, path.slice(1)), 'utf8'),
) as {
  display: string;
  icons: Array<{ purpose: string; sizes: string; src: string; type: string }>;
  name: string;
  scope: string;
  start_url: string;
});
const workerSource = readFileSync(resolve(publicDirectory, 'sw.js'), 'utf8');

function readPngDimension(image: Uint8Array, offset: number) {
  return image[offset]! * 0x1000000 + image[offset + 1]! * 0x10000 + image[offset + 2]! * 0x100 + image[offset + 3]!;
}

function createWorkerHarness(fetchImplementation = vi.fn()) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const cache = {
    add: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
  };
  const cacheStorage = {
    delete: vi.fn().mockResolvedValue(true),
    keys: vi.fn().mockResolvedValue([]),
    match: vi.fn().mockResolvedValue(undefined),
    open: vi.fn().mockResolvedValue(cache),
  };
  const serviceWorker = {
    addEventListener: (type: string, listener: (event: unknown) => void) => { listeners[type] = listener; },
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    location: { origin: 'https://acai.example' },
  };

  runInNewContext(workerSource, {
    caches: cacheStorage,
    fetch: fetchImplementation,
    self: serviceWorker,
    URL,
  });

  return { cache, cacheStorage, listeners, serviceWorker };
}

describe('PWA assets and offline safety', () => {
  it('provides distinct install entry points for customer, admin, and driver with valid icons', () => {
    expect(manifests.map(({ start_url }) => start_url)).toEqual(['/', '/admin/login', '/entregador/login']);

    for (const manifest of manifests) {
      expect(manifest.name).toContain('Açaí Mais Sabor');
      expect(manifest.display).toBe('standalone');
      expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

      for (const size of ['192x192', '512x512']) {
        const icon = manifest.icons.find((item) => item.sizes === size && item.type === 'image/png');
        expect(icon).toBeDefined();
        const image = readFileSync(resolve(publicDirectory, icon!.src.slice(1)));
        const signature = Array.from(image.subarray(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');
        expect(signature).toBe('89504e470d0a1a0a');
        expect(readPngDimension(image, 16)).toBe(Number(size.split('x')[0]));
      }
    }
  });

  it('only caches hashed same-origin build assets, never application/API responses', async () => {
    const response = { clone: vi.fn(() => ({ immutableCopy: true })), ok: true, type: 'basic' };
    const fetchMock = vi.fn().mockResolvedValue(response);
    const { cache, listeners } = createWorkerHarness(fetchMock);
    const assetEvent = {
      request: { method: 'GET', mode: 'same-origin', url: 'https://acai.example/_next/static/chunks/app-abc123.js' },
      respondWith: vi.fn(),
    };
    listeners.fetch(assetEvent);
    await assetEvent.respondWith.mock.calls[0]?.[0];
    expect(cache.put).toHaveBeenCalledOnce();

    const privateEvent = {
      request: { method: 'GET', mode: 'cors', url: 'https://acai.example/api/orders' },
      respondWith: vi.fn(),
    };
    listeners.fetch(privateEvent);
    expect(privateEvent.respondWith).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('serves only the generic offline page when a navigation cannot reach the network', async () => {
    const offlinePage = { html: 'generic, non-personal fallback' };
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    const { cacheStorage, listeners } = createWorkerHarness(fetchMock);
    cacheStorage.match.mockResolvedValue(offlinePage);
    const navigationEvent = {
      request: { method: 'GET', mode: 'navigate', url: 'https://acai.example/admin/entregas' },
      respondWith: vi.fn(),
    };

    listeners.fetch(navigationEvent);

    await expect(navigationEvent.respondWith.mock.calls[0]?.[0]).resolves.toBe(offlinePage);
    expect(cacheStorage.match).toHaveBeenCalledWith('/offline.html');
  });

  it('pre-caches the generic fallback without forcing an update over open sessions', async () => {
    const { cache, listeners, serviceWorker } = createWorkerHarness();
    const installEvent = { waitUntil: vi.fn() };

    listeners.install(installEvent);
    await installEvent.waitUntil.mock.calls[0]?.[0];

    expect(cache.add).toHaveBeenCalledWith('/offline.html');
    expect('skipWaiting' in serviceWorker).toBe(false);
  });
});
