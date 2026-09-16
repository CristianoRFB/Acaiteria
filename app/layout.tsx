import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';
import { AppProviders } from '@/components/providers';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

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
  return <html lang="pt-BR"><body className={`${geistSans.variable} ${geistMono.variable} antialiased`}><AppProviders>{children}</AppProviders></body></html>;
}
