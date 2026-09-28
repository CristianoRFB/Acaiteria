import type { Metadata, Viewport } from 'next';

import './globals.css';
import { AppProviders } from '@/components/providers';

export const metadata: Metadata = {
  title: 'Açaí + Sabor | Monte do seu jeito',
  description: 'Monte seu açaí, acompanhe o preço e envie seu pedido direto para a loja.',
};

// Keep mobile browsers from rendering the ordering flow with a desktop viewport.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className="antialiased"><AppProviders>{children}</AppProviders></body></html>;
}
