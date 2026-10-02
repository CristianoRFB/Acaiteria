import type { Metadata } from 'next';

export const metadata: Metadata = { manifest: '/admin/manifest.webmanifest' };

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
