'use client';

import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { developmentCatalog, developmentStoreConfig, developmentTenantBConfig } from '@/lib/development-seed';
import { getFirebaseClient, hasFirebaseConfig, useDevelopmentSeed } from '@/lib/firebase/client';
import type { CartItemDraft, CatalogSnapshot, Promotion, Role, StorePublicConfig } from '@/shared/domain';
import { optimizedMenuImage, resolveModifierImage, resolveProductImage } from '@/shared/catalog-images';
import { isOrderableCatalogProduct, normalizeCatalogProduct } from '@/shared/catalog-normalization';
import { normalizeStoreConfig } from '@/shared/store-config';
import { withBeverageOptions } from '@/shared/beverage-options';
import { TENANT_A, tenantStorageKey } from '@/shared/tenancy';
import { TenantProvider, useTenant } from '@/components/tenant-provider';

interface CatalogState { catalog: CatalogSnapshot; config: StorePublicConfig; promotions: Promotion[]; loading: boolean; error?: string; development: boolean }
const CatalogContext = createContext<CatalogState>({ catalog: developmentCatalog, config: developmentStoreConfig, promotions: [], loading: true, development: true });

function enrichCatalogImages(catalog: CatalogSnapshot): CatalogSnapshot {
  return {
    ...catalog,
    products: catalog.products.map((product) => ({ ...product, imageUrl: resolveProductImage(product.id, product.imageUrl) })),
    modifiers: catalog.modifiers.map((modifier) => ({ ...modifier, imageUrl: resolveModifierImage(modifier.id, modifier.imageUrl) })),
  };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { tenant, status: tenantStatus } = useTenant();
  const tenantId = tenant?.id;
  const tenantName = tenant?.displayName;
  const [state, setState] = useState<CatalogState>({ catalog: developmentCatalog, config: developmentStoreConfig, promotions: [], loading: !useDevelopmentSeed, development: useDevelopmentSeed });
  useEffect(() => {
    if (tenantStatus !== 'active' || !tenantId) {
      setState((old) => ({ ...old, loading: true }));
      return;
    }
    if (useDevelopmentSeed || !hasFirebaseConfig) {
      const demoTenant = tenantId !== TENANT_A.id;
      const catalog = demoTenant ? {
        ...developmentCatalog,
        categories: developmentCatalog.categories.map((item) => ({ ...item, name: `Amora • ${item.name}` })),
        products: developmentCatalog.products.map((item) => ({
          ...item,
          name: `Amora ${item.name}`,
          slug: `amora-${item.slug}`,
          description: `Demonstração independente: ${item.description}`,
          sizes: item.sizes.map((size) => ({ ...size, basePriceCents: size.basePriceCents + 150 })),
        })),
        groups: developmentCatalog.groups.map((item) => ({ ...item, name: `Amora • ${item.name}` })),
        modifiers: developmentCatalog.modifiers.map((item) => ({ ...item, name: `Amora • ${item.name}`, priceCents: item.priceCents + 50 })),
      } : developmentCatalog;
      const config = demoTenant ? { ...developmentTenantBConfig, storeName: tenantName ?? developmentTenantBConfig.storeName } : developmentStoreConfig;
      setState({ catalog: enrichCatalogImages(withBeverageOptions(catalog)), config, promotions: [], loading: false, development: true });
      return;
    }
    let db;
    try { db = getFirebaseClient().db; } catch (error) {
      setState((old) => ({ ...old, loading: false, error: error instanceof Error ? error.message : 'Firebase indisponível.' }));
      return;
    }
    const stops: Array<() => void> = [];
    const next = { catalog: { products: [], categories: [], groups: [], modifiers: [] } as CatalogSnapshot, config: developmentStoreConfig, promotions: [] as Promotion[] };
    const publish = () => setState({ ...next, catalog: enrichCatalogImages(withBeverageOptions(next.catalog)), promotions: next.promotions.map((promotion) => ({ ...promotion, imageUrl: optimizedMenuImage(promotion.imageUrl) })), loading: false, development: false });
    stops.push(onSnapshot(doc(db, 'tenants', tenantId, 'settings', 'public'), (snap) => { next.config = normalizeStoreConfig(snap.exists() ? snap.data() : undefined); publish(); }, (error) => setState((old) => ({ ...old, loading: false, error: error.message }))));
    const subscribe = <T,>(name: string, key: keyof CatalogSnapshot) => onSnapshot(query(collection(db, 'tenants', tenantId, name), where('active', '==', true), orderBy('displayOrder')), (snap) => {
      const values = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      (next.catalog[key] as T[]) = key === 'products'
        ? values.map((value) => normalizeCatalogProduct(value)).filter(isOrderableCatalogProduct) as T[]
        : values as T[];
      publish();
    }, (error) => setState((old) => ({ ...old, loading: false, error: error.message })));
    stops.push(subscribe('categories', 'categories'), subscribe('products', 'products'), subscribe('modifierGroups', 'groups'), subscribe('modifiers', 'modifiers'));
    stops.push(onSnapshot(query(collection(db, 'tenants', tenantId, 'promotions'), where('active', '==', true)), (snap) => {
      next.promotions = snap.docs
        .map((item) => ({ id: item.id, ...item.data() }) as Promotion)
        .sort((a, b) => a.displayOrder - b.displayOrder);
      publish();
    }, (error) => setState((old) => ({ ...old, loading: false, error: error.message }))));
    const timeout = window.setTimeout(() => setState((old) => old.loading ? { ...old, loading: false, error: 'Não foi possível conectar ao Firebase. Verifique a configuração e tente novamente.' } : old), 10000);
    return () => { window.clearTimeout(timeout); stops.forEach((stop) => stop()); };
  }, [tenantId, tenantName, tenantStatus]);
  return <CatalogContext.Provider value={state}>{children}</CatalogContext.Provider>;
}
export const useCatalog = () => useContext(CatalogContext);

interface CartState {
  items: CartItemDraft[];
  hydrated: boolean;
  add: (item: Omit<CartItemDraft, 'cartItemId'>) => string;
  update: (id: string, item: Omit<CartItemDraft, 'cartItemId'>) => void;
  remove: (id: string) => void;
  setQuantity: (id: string, quantity: number) => void;
  duplicate: (id: string) => void;
  clear: () => void;
}
const CartContext = createContext<CartState | null>(null);
// The old global key is only imported once for Tenant A; Tenant B never reads it.
const CART_KEY = 'acai-mais-sabor-cart-v2';
const EMPTY_CART_ITEMS: CartItemDraft[] = [];
interface CartSnapshot { key: string | null; items: CartItemDraft[]; hydrated: boolean }

function newCartItemId(prefix = 'cart') {
  try { return `${prefix}-${crypto.randomUUID()}`; } catch { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

/**
 * localStorage é editável pelo usuário e pode conter JSON quebrado ou um
 * carrinho gigantesco. Normalize antes de renderizar para que isso nunca
 * derrube o cardápio/checkout.
 */
function sanitizeCartDrafts(value: unknown): CartItemDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const raw = candidate as Record<string, unknown>;
    if (typeof raw.productId !== 'string' || !raw.productId.trim() || typeof raw.sizeId !== 'string' || !raw.sizeId.trim()) return [];
    const quantity = typeof raw.quantity === 'number' && Number.isSafeInteger(raw.quantity)
      ? Math.max(1, Math.min(20, raw.quantity))
      : 1;
    const selections = Array.isArray(raw.selections) ? raw.selections.flatMap((group) => {
      if (!group || typeof group !== 'object' || Array.isArray(group)) return [];
      const groupValue = group as Record<string, unknown>;
      if (typeof groupValue.groupId !== 'string' || !groupValue.groupId.trim() || !Array.isArray(groupValue.items)) return [];
      const items = groupValue.items.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const itemValue = item as Record<string, unknown>;
        if (typeof itemValue.modifierId !== 'string' || !itemValue.modifierId.trim()) return [];
        const itemQuantity = typeof itemValue.quantity === 'number' && Number.isSafeInteger(itemValue.quantity)
          ? Math.max(1, Math.min(20, itemValue.quantity))
          : 1;
        return [{ modifierId: itemValue.modifierId.trim(), quantity: itemQuantity }];
      }).slice(0, 60);
      return [{ groupId: groupValue.groupId.trim(), items }];
    }).slice(0, 30) : [];
    return [{
      cartItemId: typeof raw.cartItemId === 'string' && raw.cartItemId.trim() ? raw.cartItemId.slice(0, 120) : newCartItemId(`restored-${index}`),
      productId: raw.productId.trim().slice(0, 120),
      sizeId: raw.sizeId.trim().slice(0, 120),
      selections,
      quantity,
      ...(typeof raw.notes === 'string' && raw.notes.trim() ? { notes: raw.notes.slice(0, 300) } : {}),
      ...(typeof raw.catalogVersion === 'string' ? { catalogVersion: raw.catalogVersion.slice(0, 80) } : {}),
    }];
  }).slice(0, 30);
}

function removeStoredCart(key: string) { try { localStorage.removeItem(key); } catch { /* armazenamento bloqueado */ } }
function persistCart(key: string, value: CartItemDraft[]): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; /* quota/modo privado: a sessão continua em memória */ }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { tenant, status: tenantStatus } = useTenant();
  const tenantId = tenant?.id;
  const cartKey = tenantId && tenantStatus === 'active' ? tenantStorageKey(tenantId, CART_KEY) : null;
  const [snapshot, setSnapshot] = useState<CartSnapshot>({ key: null, items: [], hydrated: false });
  const itemsRef = useRef<{ key: string | null; items: CartItemDraft[] }>({ key: null, items: [] });
  useEffect(() => {
    if (!cartKey) {
      itemsRef.current = { key: null, items: [] };
      setSnapshot({ key: null, items: [], hydrated: true });
      return;
    }
    try {
      const saved = localStorage.getItem(cartKey);
      const legacySaved = !saved && tenantId === TENANT_A.id ? localStorage.getItem(CART_KEY) : null;
      const stored = saved ?? legacySaved;
      const items = sanitizeCartDrafts(stored ? JSON.parse(stored) : []);
      itemsRef.current = { key: cartKey, items };
      setSnapshot({ key: cartKey, items, hydrated: true });
      if (legacySaved && persistCart(cartKey, items)) removeStoredCart(CART_KEY);
    } catch {
      removeStoredCart(cartKey);
      itemsRef.current = { key: cartKey, items: [] };
      setSnapshot({ key: cartKey, items: [], hydrated: true });
    }
  }, [cartKey, tenantId]);
  const commit = useCallback((updateItems: (current: CartItemDraft[]) => CartItemDraft[]) => {
    if (!cartKey || itemsRef.current.key !== cartKey) return;
    const next = updateItems(itemsRef.current.items);
    itemsRef.current = { key: cartKey, items: next };
    persistCart(cartKey, next);
    setSnapshot({ key: cartKey, items: next, hydrated: true });
  }, [cartKey]);
  const add = useCallback((item: Omit<CartItemDraft, 'cartItemId'>) => { const id = newCartItemId(); commit((old) => [...old, { ...item, cartItemId: id }].slice(0, 30)); return id; }, [commit]);
  const update = useCallback((id: string, item: Omit<CartItemDraft, 'cartItemId'>) => commit((old) => old.map((candidate) => candidate.cartItemId === id ? { ...item, cartItemId: id } : candidate)), [commit]);
  const remove = useCallback((id: string) => commit((old) => old.filter((item) => item.cartItemId !== id)), [commit]);
  const setQuantity = useCallback((id: string, quantity: number) => commit((old) => old.map((item) => item.cartItemId === id ? { ...item, quantity: Math.max(1, Math.min(20, quantity)) } : item)), [commit]);
  const duplicate = useCallback((id: string) => commit((old) => { const item = old.find((candidate) => candidate.cartItemId === id); return item ? [...old, { ...item, cartItemId: newCartItemId() }].slice(0, 30) : old; }), [commit]);
  const clear = useCallback(() => commit(() => []), [commit]);
  const currentSnapshot = snapshot.key === cartKey && snapshot.hydrated;
  const items = cartKey !== null && currentSnapshot ? snapshot.items : EMPTY_CART_ITEMS;
  const hydrated = currentSnapshot;
  const value = useMemo(() => ({ items, hydrated, add, update, remove, setQuantity, duplicate, clear }), [items, hydrated, add, update, remove, setQuantity, duplicate, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart() { const context = useContext(CartContext); if (!context) throw new Error('CartProvider ausente.'); return context; }

interface AuthState { user: User | null; role: Role | null; loading: boolean }
const AuthContext = createContext<AuthState>({ user: null, role: null, loading: true });
export function AuthProvider({ children }: { children: ReactNode }) {
  const { tenant, status: tenantStatus } = useTenant();
  const tenantId = tenant?.id;
  const [state, setState] = useState<AuthState>({ user: null, role: null, loading: true });
  useEffect(() => {
    if (!hasFirebaseConfig) { setState({ user: null, role: null, loading: false }); return; }
    let auth: ReturnType<typeof getFirebaseClient>['auth'];
    let db: ReturnType<typeof getFirebaseClient>['db'];
    try {
      ({ auth, db } = getFirebaseClient());
    } catch {
      setState({ user: null, role: null, loading: false });
      return;
    }
    setState((old) => ({ ...old, loading: true }));
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { setState({ user: null, role: null, loading: false }); return; }
      try {
        const identity = await getDoc(doc(db, 'users', user.uid));
        if (identity.exists() && identity.data().active === false) {
          await signOut(auth);
          setState({ user: null, role: null, loading: false });
          return;
        }
        if (tenantStatus === 'platform') {
          const role = identity.data()?.platformRole === 'platform_owner' ? 'platform_owner' : null;
          setState({ user, role, loading: false });
          return;
        }
        if (tenantStatus !== 'active' || !tenantId) {
          setState({ user, role: null, loading: false });
          return;
        }
        const membership = await getDoc(doc(db, 'tenants', tenantId, 'members', user.uid));
        const membershipData = membership.data();
        const validRoles: Role[] = ['tenant_owner', 'admin', 'staff', 'driver'];
        const role = membership.exists() && membershipData?.status === 'ACTIVE' && validRoles.includes(membershipData.role as Role)
          ? membershipData.role as Role
          : null;
        setState({ user, role, loading: false });
      } catch {
        // Uma falha de perfil ou membership nunca concede acesso por papel legado.
        setState({ user, role: null, loading: false });
      }
    });
  }, [tenantId, tenantStatus]);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

export function AppProviders({ children }: { children: ReactNode }) {
  return <TenantProvider><AuthProvider><CatalogProvider><CartProvider>{children}</CartProvider></CatalogProvider></AuthProvider></TenantProvider>;
}
