import type { Metadata, Viewport } from 'next';

import './globals.css';
import { AppProviders } from '@/components/providers';
import { PwaServiceWorker } from '@/components/pwa-service-worker';
import { TenantBoundary } from '@/components/tenant-provider';

export const metadata: Metadata = {
  title: 'Cardápio online | Faça seu pedido',
  description: 'Confira o cardápio, monte seu pedido e acompanhe a preparação.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

// Keep mobile browsers from rendering the ordering flow with a desktop viewport.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#6f2bc5',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className="antialiased"><AppProviders><TenantBoundary><PwaServiceWorker />{children}</TenantBoundary></AppProviders></body></html>;
}
