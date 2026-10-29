'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers';
import { useTenant } from '@/components/tenant-provider';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import { tenantCallable } from '@/lib/firebase/callable';
import type { ResolvedEntitlements } from '@/shared/entitlements';

export type TenantCommercialCapabilities =
  | { mode: 'UNASSIGNED'; planId: null; features: null; limits: null }
  | ({ mode: 'ASSIGNED' } & ResolvedEntitlements);

/**
 * UI is explanatory only. Backend authorization and quotas remain authoritative.
 * Never read private/subscription with the Firestore browser SDK.
 */
export function useTenantCommercialCapabilities() {
  const { user, role } = useAuth();
  const { slug } = useTenant();
  const [state, setState] = useState<{
    slug: string | null;
    capabilities: TenantCommercialCapabilities | null;
    loading: boolean;
    error: string | null;
  }>({ slug: null, capabilities: null, loading: false, error: null });

  useEffect(() => {
    let disposed = false;
    if (!hasFirebaseConfig || !user || !slug || (role !== 'tenant_owner' && role !== 'admin')) {
      return () => { disposed = true; };
    }
    const currentSlug = slug;
    const fetchCapabilities = async () => {
      try {
        const request = tenantCallable<Record<string, never>, TenantCommercialCapabilities>(
          getFirebaseClient().functions, 'getTenantCommercialCapabilities',
        );
        const result = await request({});
        if (!disposed) {
          setState({ slug: currentSlug, capabilities: result.data, loading: false, error: null });
        }
      } catch {
        if (!disposed) {
          setState({
            slug: currentSlug, capabilities: null, loading: false,
            error: 'Não foi possível carregar as informações comerciais. A autorização permanece no servidor.',
          });
        }
      }
    };
    void fetchCapabilities();
    return () => { disposed = true; };
  }, [slug, user?.uid, role]);

  // A tenant switch or logout may not reuse the previous tenant's capabilities.
  const active = Boolean(user && slug && (role === 'tenant_owner' || role === 'admin'));
  return {
    loading: active && state.slug !== slug ? true : state.loading,
    capabilities: active && state.slug === slug ? state.capabilities : null,
    error: active && state.slug === slug ? state.error : null,
  };
}
