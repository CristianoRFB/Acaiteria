'use client';

import { doc, getDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { getFirebaseClient, hasFirebaseConfig, useDevelopmentSeed } from '@/lib/firebase/client';
import {
  TENANT_A,
  TENANT_B,
  resolveTenantRoute,
  type TenantPublic,
  type TenantRouteResolution,
  type TenantStatus,
} from '@/shared/tenancy';

export type TenantResolutionStatus = 'loading' | 'active' | 'suspended' | 'archived' | 'not-found' | 'invalid' | 'unavailable' | 'platform';

interface TenantContextValue {
  tenant: TenantPublic | null;
  slug: string | null;
  status: TenantResolutionStatus;
  error?: string;
}

const TenantContext = createContext<TenantContextValue>({ tenant: null, slug: null, status: 'loading' });

const developmentTenants: Record<string, TenantPublic> = {
  [TENANT_A.slug]: {
    id: TENANT_A.id,
    slug: TENANT_A.slug,
    displayName: TENANT_A.displayName,
    status: 'ACTIVE',
    branding: { primaryColor: '#82204f', secondaryColor: '#d7f04a', logoUrl: '/logo-acai-sabor.jpg' },
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    currency: 'BRL',
  },
  [TENANT_B.slug]: {
    id: TENANT_B.id,
    slug: TENANT_B.slug,
    displayName: TENANT_B.displayName,
    status: 'ACTIVE',
    branding: { primaryColor: '#5634a5', secondaryColor: '#ffb6c9' },
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    currency: 'BRL',
  },
};

function isTenantStatus(value: unknown): value is TenantStatus {
  return value === 'ACTIVE' || value === 'SUSPENDED' || value === 'ARCHIVED';
}

function safeBrandColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function parsePublicTenant(id: string, value: Record<string, unknown>, requestedSlug: string): TenantPublic | null {
  const branding = value.branding;
  if (
    value.slug !== requestedSlug || typeof value.displayName !== 'string' || !value.displayName.trim() ||
    !isTenantStatus(value.status) || !branding || typeof branding !== 'object' ||
    typeof (branding as Record<string, unknown>).primaryColor !== 'string' ||
    typeof (branding as Record<string, unknown>).secondaryColor !== 'string' ||
    typeof value.locale !== 'string' || typeof value.timezone !== 'string' || typeof value.currency !== 'string'
  ) return null;

  return {
    id,
    slug: requestedSlug,
    displayName: value.displayName,
    status: value.status,
    branding: branding as TenantPublic['branding'],
    locale: value.locale,
    timezone: value.timezone,
    currency: value.currency,
  };
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState('/');
  useEffect(() => {
    const syncPathname = () => setPathname(window.location.pathname);
    syncPathname();
    window.addEventListener('popstate', syncPathname);
    return () => window.removeEventListener('popstate', syncPathname);
  }, []);
  const resolution = useMemo<TenantRouteResolution>(() => {
    return resolveTenantRoute(pathname);
  }, [pathname]);
  const requestedSlug = resolution.kind === 'tenant' ? resolution.slug : null;
  const [state, setState] = useState<TenantContextValue>({ tenant: null, slug: null, status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    if (resolution.kind === 'platform') {
      setState({ tenant: null, slug: null, status: 'platform' });
      return () => { cancelled = true; };
    }
    if (resolution.kind === 'asset') {
      setState({ tenant: null, slug: null, status: 'platform' });
      return () => { cancelled = true; };
    }
    if (resolution.kind === 'invalid') {
      setState({ tenant: null, slug: null, status: 'invalid' });
      return () => { cancelled = true; };
    }
    if (resolution.kind === 'legacy') {
      setState({ tenant: null, slug: resolution.slug, status: 'loading' });
      return () => { cancelled = true; };
    }

    setState({ tenant: null, slug: resolution.slug, status: 'loading' });
    if (useDevelopmentSeed) {
      const tenant = developmentTenants[resolution.slug];
      setState(tenant
        ? { tenant, slug: resolution.slug, status: 'active' }
        : { tenant: null, slug: resolution.slug, status: 'not-found' });
      return () => { cancelled = true; };
    }
    if (!hasFirebaseConfig) {
      setState({ tenant: null, slug: resolution.slug, status: 'unavailable', error: 'Firebase não está configurado para resolver este estabelecimento.' });
      return () => { cancelled = true; };
    }

    void (async () => {
      try {
        const { db } = getFirebaseClient();
        const slugSnapshot = await getDoc(doc(db, 'tenantSlugs', resolution.slug));
        if (!slugSnapshot.exists()) {
          if (!cancelled) setState({ tenant: null, slug: resolution.slug, status: 'not-found' });
          return;
        }
        const tenantId = slugSnapshot.data().tenantId;
        if (typeof tenantId !== 'string' || !tenantId || tenantId.includes('/')) {
          if (!cancelled) setState({ tenant: null, slug: resolution.slug, status: 'unavailable', error: 'O cadastro público deste estabelecimento está inválido.' });
          return;
        }
        const tenantSnapshot = await getDoc(doc(db, 'tenants', tenantId));
        if (!tenantSnapshot.exists()) {
          if (!cancelled) setState({ tenant: null, slug: resolution.slug, status: 'not-found' });
          return;
        }
        const tenant = parsePublicTenant(tenantSnapshot.id, tenantSnapshot.data(), resolution.slug);
        if (!tenant) {
          if (!cancelled) setState({ tenant: null, slug: resolution.slug, status: 'unavailable', error: 'Os dados públicos deste estabelecimento não passaram na validação.' });
          return;
        }
        if (!cancelled) setState({ tenant, slug: resolution.slug, status: tenant.status === 'ACTIVE' ? 'active' : tenant.status === 'SUSPENDED' ? 'suspended' : 'archived' });
      } catch {
        if (!cancelled) setState({ tenant: null, slug: resolution.slug, status: 'unavailable', error: 'Não foi possível consultar o cadastro do estabelecimento.' });
      }
    })();

    return () => { cancelled = true; };
  }, [resolution]);

  const routeMismatch = resolution.kind === 'tenant' && state.slug !== requestedSlug;
  const value = routeMismatch
    ? { tenant: null, slug: requestedSlug, status: 'loading' as const }
    : state;

  const primaryColor = safeBrandColor(value.tenant?.branding.primaryColor, '#82204f');
  const secondaryColor = safeBrandColor(value.tenant?.branding.secondaryColor, '#d7f04a');
  useEffect(() => {
    if (!value.tenant || typeof document === 'undefined') return;
    const previousTitle = document.title;
    const htmlLanguage = document.documentElement.lang;
    document.title = `${value.tenant.displayName} | Cardápio`;
    document.documentElement.lang = value.tenant.locale;
    document.documentElement.style.setProperty('--tenant-primary', primaryColor);
    document.documentElement.style.setProperty('--tenant-secondary', secondaryColor);
    let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const createdDescription = !description;
    if (!description) {
      description = document.createElement('meta');
      description.name = 'description';
      document.head.appendChild(description);
    }
    const previousDescription = description.content;
    description.content = `${value.tenant.displayName}: confira o cardápio, monte seu pedido e acompanhe a preparação.`;
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = theme?.content;
    if (theme) theme.content = primaryColor;
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const createdIcon = !icon;
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.appendChild(icon);
    }
    const previousIcon = icon.href;
    if (value.tenant.branding.faviconUrl) icon.href = value.tenant.branding.faviconUrl;
    return () => {
      document.title = previousTitle;
      document.documentElement.lang = htmlLanguage;
      document.documentElement.style.removeProperty('--tenant-primary');
      document.documentElement.style.removeProperty('--tenant-secondary');
      if (createdDescription) description?.remove();
      else if (previousDescription) description!.content = previousDescription;
      if (theme && previousTheme) theme.content = previousTheme;
      if (createdIcon) icon?.remove();
      else if (previousIcon) icon!.href = previousIcon;
    };
  }, [primaryColor, secondaryColor, value.tenant]);

  const themeStyle = {
    '--tenant-primary': primaryColor,
    '--tenant-secondary': secondaryColor,
    '--brand': primaryColor,
    '--brand-strong': `color-mix(in srgb, ${primaryColor} 65%, #000000)`,
    '--brand-deep': `color-mix(in srgb, ${primaryColor} 45%, #000000)`,
    '--primary': primaryColor,
    '--secondary': secondaryColor,
    '--secondary-foreground': '#351924',
    '--accent': secondaryColor,
    '--accent-foreground': '#351924',
    '--ring': primaryColor,
  } as CSSProperties;
  return <TenantContext.Provider value={value}><div data-tenant-root={value.slug ?? undefined} style={themeStyle}>{children}</div></TenantContext.Provider>;
}

export function useTenant() {
  return useContext(TenantContext);
}

export function TenantBoundary({ children }: { children: ReactNode }) {
  const { tenant, slug, status, error } = useTenant();
  if (status === 'platform') return children;
  if (status === 'active' && tenant) return children;

  const title = status === 'suspended'
    ? 'Estabelecimento temporariamente suspenso'
    : status === 'archived'
      ? 'Estabelecimento indisponível'
      : status === 'not-found'
        ? 'Estabelecimento não encontrado'
        : status === 'invalid'
          ? 'Endereço inválido'
          : status === 'unavailable'
            ? 'Não foi possível validar o estabelecimento'
            : 'Carregando estabelecimento…';
  const message = status === 'suspended'
    ? 'Este estabelecimento está suspenso no momento. Nenhum dado foi apagado.'
    : status === 'archived'
      ? 'Este estabelecimento não está mais disponível.'
      : status === 'not-found'
        ? `Não encontramos um estabelecimento com o endereço “${slug ?? ''}”.`
        : status === 'invalid'
          ? 'Confira o link e tente novamente.'
          : status === 'unavailable'
            ? error ?? 'Tente novamente mais tarde.'
            : 'Estamos confirmando a identidade e o estado deste estabelecimento.';

  return (
    <main className="grid min-h-screen place-items-center bg-[#fffaf5] p-6 text-center text-[#2b1722]">
      <section className="max-w-md rounded-3xl border border-[#82204f]/10 bg-white p-7 shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#82204f] font-black text-white">A+</span>
        <h1 className="mt-5 text-2xl font-black">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#826a75]">{message}</p>
      </section>
    </main>
  );
}
