import type { Metadata } from 'next';

export const metadata: Metadata = { manifest: '/entregador/manifest.webmanifest' };

export default function DeliveryDriverLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
