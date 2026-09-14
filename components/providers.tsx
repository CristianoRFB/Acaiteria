'use client';

import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

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
    let db;
    try { db = getFirebaseClient().db; } catch (error) {
      setState((old) => ({ ...old, loading: false, error: error instanceof Error ? error.message : 'Firebase indisponível.' }));
      return;
    }
    const stops: Array<() => void> = [];
    const next = { catalog: { products: [], categories: [], groups: [], modifiers: [] } as CatalogSnapshot, config: developmentStoreConfig };
    const publish = () => setState({ ...next, catalog: { ...next.catalog }, loading: false, development: false });
    stops.push(onSnapshot(doc(db, 'storePublicConfig', 'main'), (snap) => { if (snap.exists()) next.config = snap.data() as StorePublicConfig; publish(); }, (error) => setState((old) => ({ ...old, loading: false, error: error.message }))));
    const subscribe = <T,>(name: string, key: keyof CatalogSnapshot) => onSnapshot(query(collection(db, name), where('active', '==', true), orderBy('displayOrder')), (snap) => { (next.catalog[key] as T[]) = snap.docs.map((item) => ({ id: item.id, ...item.data() }) as T); publish(); }, (error) => setState((old) => ({ ...old, loading: false, error: error.message })));
    stops.push(subscribe('categories', 'categories'), subscribe('products', 'products'), subscribe('modifierGroups', 'groups'), subscribe('modifiers', 'modifiers'));
    const timeout = window.setTimeout(() => setState((old) => old.loading ? { ...old, loading: false, error: 'Não foi possível conectar ao Firebase. Verifique a configuração e tente novamente.' } : old), 10000);
    return () => { window.clearTimeout(timeout); stops.forEach((stop) => stop()); };
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
const CART_KEY = 'acai-mais-sabor-cart-v2';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItemDraft[]>([]);
  const itemsRef = useRef<CartItemDraft[]>([]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);
      const loaded = saved ? JSON.parse(saved) as CartItemDraft[] : [];
      itemsRef.current = Array.isArray(loaded) ? loaded : [];
      setItems(itemsRef.current);
    } catch {
      localStorage.removeItem(CART_KEY);
      itemsRef.current = [];
      setItems([]);
    }
  }, []);
  const commit = useCallback((updateItems: (current: CartItemDraft[]) => CartItemDraft[]) => {
    const next = updateItems(itemsRef.current);
    itemsRef.current = next;
    localStorage.setItem(CART_KEY, JSON.stringify(next));
    setItems(next);
  }, []);
  const add = useCallback((item: Omit<CartItemDraft, 'cartItemId'>) => { const id = crypto.randomUUID(); commit((old) => [...old, { ...item, cartItemId: id }]); return id; }, [commit]);
  const update = useCallback((id: string, item: Omit<CartItemDraft, 'cartItemId'>) => commit((old) => old.map((candidate) => candidate.cartItemId === id ? { ...item, cartItemId: id } : candidate)), [commit]);
  const remove = useCallback((id: string) => commit((old) => old.filter((item) => item.cartItemId !== id)), [commit]);
  const setQuantity = useCallback((id: string, quantity: number) => commit((old) => old.map((item) => item.cartItemId === id ? { ...item, quantity: Math.max(1, Math.min(20, quantity)) } : item)), [commit]);
  const duplicate = useCallback((id: string) => commit((old) => { const item = old.find((candidate) => candidate.cartItemId === id); return item ? [...old, { ...item, cartItemId: crypto.randomUUID() }] : old; }), [commit]);
  const clear = useCallback(() => commit(() => []), [commit]);
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
