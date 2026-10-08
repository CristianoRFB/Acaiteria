'use client';

import { httpsCallable, type Functions } from 'firebase/functions';

import { resolveTenantRoute } from '@/shared/tenancy';

function activeTenantSlug(): string {
  if (typeof window === 'undefined') throw new Error('A operação precisa ser feita dentro de um estabelecimento.');
  const route = resolveTenantRoute(window.location.pathname);
  if (route.kind !== 'tenant') throw new Error('Não foi possível identificar o estabelecimento desta tela.');
  return route.slug;
}

export function tenantCallable<T extends Record<string, unknown> = Record<string, unknown>, R = unknown>(functions: Functions, name: string) {
  const callable = httpsCallable<T & { tenantSlug: string }, R>(functions, name);
  return (data: T) => callable({ ...data, tenantSlug: activeTenantSlug() });
}

export function platformCallable<T extends Record<string, unknown> = Record<string, unknown>, R = unknown>(functions: Functions, name: string) {
  const callable = httpsCallable<T, R>(functions, name);
  return (data: T) => callable(data);
}
