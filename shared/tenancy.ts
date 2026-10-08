export const TENANT_A = {
  id: 'acai-mais-sabor',
  slug: 'acai-mais-sabor',
  displayName: 'Açaí + Sabor',
} as const;

export const TENANT_B = {
  id: 'amora-acai-demo',
  slug: 'amora-acai-demo',
  displayName: 'Amora Açaí — Demonstração',
} as const;

export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type TenantRole = 'tenant_owner' | 'admin' | 'staff' | 'driver';
export type PlatformRole = 'platform_owner';

export interface TenantBranding {
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  faviconUrl?: string;
}

export interface TenantPublic {
  id: string;
  slug: string;
  displayName: string;
  status: TenantStatus;
  branding: TenantBranding;
  locale: string;
  timezone: string;
  currency: string;
}

export type TenantRouteResolution =
  | { kind: 'platform' }
  | { kind: 'asset' }
  | { kind: 'legacy'; slug: string; destination: string }
  | { kind: 'tenant'; slug: string; internalPath: string }
  | { kind: 'invalid' };

const legacyRootRoutes = new Set([
  'admin',
  'carrinho',
  'checkout',
  'entregador',
  'informacoes',
  'montar',
  'pedido',
]);

const publicRootFiles = new Set([
  'favicon.ico',
  'favicon.svg',
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
  'sw.js',
]);

const publicRootDirectories = new Set(['_next', '_vercel', 'api', 'docs', 'icons', 'menu', 'products']);

export function isValidTenantSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function resolveTenantRoute(pathname: string): TenantRouteResolution {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const parts = normalized.split('/').filter(Boolean);
  const first = parts[0];

  if (!first) return { kind: 'legacy', slug: TENANT_A.slug, destination: `/${TENANT_A.slug}` };
  if (first === 'platform') return { kind: 'platform' };
  if (publicRootFiles.has(first) || publicRootDirectories.has(first) || first.includes('.')) return { kind: 'asset' };
  if (legacyRootRoutes.has(first)) {
    return {
      kind: 'legacy',
      slug: TENANT_A.slug,
      destination: `/${TENANT_A.slug}${normalized === '/' ? '' : normalized}`,
    };
  }
  if (!isValidTenantSlug(first)) return { kind: 'invalid' };

  const internalPath = `/${parts.slice(1).join('/')}`;
  return { kind: 'tenant', slug: first, internalPath: internalPath === '/' ? '/' : internalPath.replace(/\/$/, '') };
}

export function tenantPath(slug: string, path = '/'): string {
  if (!isValidTenantSlug(slug)) throw new Error('Slug de tenant inválido.');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `/${slug}${normalizedPath === '/' ? '' : normalizedPath}`;
}

export function tenantCollectionPath(tenantId: string, collectionName: string): string {
  assertFirestoreSegment(tenantId, 'tenantId');
  assertFirestoreSegment(collectionName, 'collectionName');
  return `tenants/${tenantId}/${collectionName}`;
}

export function tenantDocumentPath(tenantId: string, collectionName: string, documentId: string): string {
  assertFirestoreSegment(documentId, 'documentId');
  return `${tenantCollectionPath(tenantId, collectionName)}/${documentId}`;
}

export function tenantPathSegments(tenantId: string, ...segments: string[]): string {
  assertFirestoreSegment(tenantId, 'tenantId');
  if (segments.length === 0) throw new Error('O caminho do tenant precisa conter uma coleção.');
  for (const segment of segments) assertFirestoreSegment(segment, 'segmento');
  return ['tenants', tenantId, ...segments].join('/');
}

export function tenantStorageKey(tenantId: string, localKey: string): string {
  assertFirestoreSegment(tenantId, 'tenantId');
  return `tenant:${tenantId}:${localKey}`;
}

export function isTenantAdminRole(role: unknown): boolean {
  return role === 'tenant_owner' || role === 'admin';
}

export function isTenantStaffRole(role: unknown): boolean {
  return isTenantAdminRole(role) || role === 'staff';
}

function assertFirestoreSegment(value: string, label: string): void {
  if (!value || value.includes('/') || value === '.' || value === '..') {
    throw new Error(`${label} inválido.`);
  }
}
