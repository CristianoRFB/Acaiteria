import { AsyncLocalStorage } from 'node:async_hooks';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall as firebaseOnCall, type CallableOptions, type CallableRequest } from 'firebase-functions/v2/https';
import type { Role } from '../../shared/domain.js';

export interface TenantScope {
  tenantId: string;
  slug: string;
}

if (!getApps().length) initializeApp();
export const rawDb = getFirestore();
const tenantScope = new AsyncLocalStorage<TenantScope>();

function scopedPath(path: string, scope = tenantScope.getStore()): string {
  if (!scope || /^(users|tenants|tenantSlugs)\//.test(path)) return path;
  return `tenants/${scope.tenantId}/${path}`;
}

export const tenantDb = new Proxy(rawDb, {
  get(target, property) {
    if (property === 'doc') return (path: string) => target.doc(scopedPath(path));
    if (property === 'collection') return (path: string) => target.collection(scopedPath(path));
    return Reflect.get(target, property, target) as unknown;
  },
}) as Firestore;

export function tenantCollection(tenantId: string, collectionName: string) {
  return rawDb.collection(`tenants/${tenantId}/${collectionName}`);
}

export function tenantDocument(tenantId: string, collectionName: string, documentId: string) {
  return rawDb.doc(`tenants/${tenantId}/${collectionName}/${documentId}`);
}

export function currentTenant(): TenantScope {
  const scope = tenantScope.getStore();
  if (!scope) throw new HttpsError('failed-precondition', 'Estabelecimento não identificado.');
  return scope;
}

export async function resolveTenantSlug(slug: string): Promise<TenantScope> {
  const mapping = await rawDb.doc(`tenantSlugs/${slug}`).get();
  const tenantId = mapping.data()?.tenantId;
  if (!mapping.exists || typeof tenantId !== 'string' || !tenantId || tenantId.includes('/')) {
    throw new HttpsError('not-found', 'Estabelecimento não encontrado.');
  }
  const tenant = await rawDb.doc(`tenants/${tenantId}`).get();
  if (!tenant.exists || tenant.data()?.slug !== slug) throw new HttpsError('not-found', 'Estabelecimento não encontrado.');
  if (tenant.data()?.status !== 'ACTIVE') throw new HttpsError('failed-precondition', 'Este estabelecimento está indisponível no momento.');
  return { tenantId, slug };
}

function readTenantSlug(data: unknown): string {
  const value = data && typeof data === 'object' && 'tenantSlug' in data
    ? (data as { tenantSlug?: unknown }).tenantSlug
    : undefined;
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new HttpsError('invalid-argument', 'Estabelecimento inválido ou não informado.');
  }
  return value;
}

export function tenantOnCall<T = unknown, R = unknown>(
  options: CallableOptions<T>,
  handler: (request: CallableRequest<T>) => R | Promise<R>,
) {
  return firebaseOnCall<T, R | Promise<R>>(options, async (request) => {
    const scope = await resolveTenantSlug(readTenantSlug(request.data));
    return tenantScope.run(scope, () => handler(request));
  });
}

export async function requireTenantRole(uid: string | undefined, allowed: Role[]): Promise<Role> {
  if (!uid) throw new HttpsError('unauthenticated', 'Entre no painel.');
  const scope = currentTenant();
  const [identity, tenant, membership] = await Promise.all([
    rawDb.doc(`users/${uid}`).get(),
    rawDb.doc(`tenants/${scope.tenantId}`).get(),
    rawDb.doc(`tenants/${scope.tenantId}/members/${uid}`).get(),
  ]);
  const role = membership.data()?.role as Role | undefined;
  if (!identity.exists || identity.data()?.active === false || !tenant.exists || tenant.data()?.status !== 'ACTIVE' ||
      !membership.exists || membership.data()?.status !== 'ACTIVE' || membership.data()?.tenantId !== scope.tenantId ||
      !role || !(allowed.includes(role) || (role === 'tenant_owner' && allowed.includes('admin')))) {
    throw new HttpsError('permission-denied', 'Você não tem permissão para esta ação neste estabelecimento.');
  }
  return role;
}
