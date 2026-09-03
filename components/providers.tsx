'use client';

import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { developmentCatalog, developmentStoreConfig } from '@/lib/development-seed';
import { getFirebaseClient, hasFirebaseConfig, useDevelopmentSeed } from '@/lib/firebase/client';
import type { CartItemDraft, CatalogSnapshot, Role, StorePublicConfig } from '@/shared/domain';

interface CatalogState { catalog: CatalogSnapshot; config: StorePublicConfig; loading: boolean; error?: string; development: boolean }
const CatalogContext = createContext<CatalogState>({ catalog: developmentCatalog, config: developmentStoreConfig, loading: true, development: true });

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CatalogState>({ catalog: developmentCatalog, config: developmentStoreConfig, loading: !useDevelopmentSeed, development: useDevelopmentSeed });
  useEffect(() => {
    if (useDevelopmentSeed || !hasFirebaseConfig) {
      setState({ catalog: developmentCatalog, config: developmentStoreConfig, loading: false, development: true });
      return;
    }
    const { db } = getFirebaseClient();
    const stops: Array<() => void> = [];
    const next = { catalog: { products: [], categories: [], groups: [], modifiers: [] } as CatalogSnapshot, config: developmentStoreConfig };
    const publish = () => setState({ ...next, catalog: { ...next.catalog }, loading: false, development: false });
    stops.push(onSnapshot(doc(db, 'storePublicConfig', 'main'), (snap) => { if (snap.exists()) next.config = snap.data() as StorePublicConfig; publish(); }, (error) => setState((old) => ({ ...old, loading: false, error: error.message }))));
    const subscribe = <T,>(name: string, key: keyof CatalogSnapshot) => onSnapshot(query(collection(db, name), where('active', '==', true), orderBy('displayOrder')), (snap) => { (next.catalog[key] as T[]) = snap.docs.map((item) => ({ id: item.id, ...item.data() }) as T); publish(); }, (error) => setState((old) => ({ ...old, loading: false, error: error.message })));
    stops.push(subscribe('categories', 'categories'), subscribe('products', 'products'), subscribe('modifierGroups', 'groups'), subscribe('modifiers', 'modifiers'));
    return () => stops.forEach((stop) => stop());
  }, []);
  return <CatalogContext.Provider value={state}>{children}</CatalogContext.Provider>;
}
export const useCatalog = () => useContext(CatalogContext);

interface CartState {
  items: CartItemDraft[];
  add: (item: Omit<CartItemDraft, 'cartItemId'>) => string;
  update: (id: string, item: Omit<CartItemDraft, 'cartItemId'>) => void;
  remove: (id: string) => void;
  setQuantity: (id: string, quantity: number) => void;
  duplicate: (id: string) => void;
  clear: () => void;
}
const CartContext = createContext<CartState | null>(null);
const CART_KEY = 'acai-mais-sabor-cart-v1';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItemDraft[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { try { const saved = localStorage.getItem(CART_KEY); if (saved) setItems(JSON.parse(saved)); } catch { localStorage.removeItem(CART_KEY); } setHydrated(true); }, []);
  useEffect(() => { if (hydrated) localStorage.setItem(CART_KEY, JSON.stringify(items)); }, [hydrated, items]);
  const add = useCallback((item: Omit<CartItemDraft, 'cartItemId'>) => { const id = crypto.randomUUID(); setItems((old) => [...old, { ...item, cartItemId: id }]); return id; }, []);
  const update = useCallback((id: string, item: Omit<CartItemDraft, 'cartItemId'>) => setItems((old) => old.map((candidate) => candidate.cartItemId === id ? { ...item, cartItemId: id } : candidate)), []);
  const remove = useCallback((id: string) => setItems((old) => old.filter((item) => item.cartItemId !== id)), []);
  const setQuantity = useCallback((id: string, quantity: number) => setItems((old) => old.map((item) => item.cartItemId === id ? { ...item, quantity: Math.max(1, Math.min(20, quantity)) } : item)), []);
  const duplicate = useCallback((id: string) => setItems((old) => { const item = old.find((candidate) => candidate.cartItemId === id); return item ? [...old, { ...item, cartItemId: crypto.randomUUID() }] : old; }), []);
  const clear = useCallback(() => setItems([]), []);
  const value = useMemo(() => ({ items, add, update, remove, setQuantity, duplicate, clear }), [items, add, update, remove, setQuantity, duplicate, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart() { const context = useContext(CartContext); if (!context) throw new Error('CartProvider ausente.'); return context; }

interface AuthState { user: User | null; role: Role | null; loading: boolean }
const AuthContext = createContext<AuthState>({ user: null, role: null, loading: true });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, role: null, loading: true });
  useEffect(() => {
    if (!hasFirebaseConfig) { setState({ user: null, role: null, loading: false }); return; }
    const { auth, db } = getFirebaseClient();
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { setState({ user: null, role: null, loading: false }); return; }
      const roleDoc = await getDoc(doc(db, 'users', user.uid));
      const role = roleDoc.exists() ? roleDoc.data().role as Role : null;
      setState({ user, role, loading: false });
    });
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);

export function AppProviders({ children }: { children: ReactNode }) {
  return <AuthProvider><CatalogProvider><CartProvider>{children}</CartProvider></CatalogProvider></AuthProvider>;
}
