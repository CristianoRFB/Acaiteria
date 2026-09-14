'use client';

import { Boxes, LayoutDashboard, LogOut, Settings, ShoppingBag, SlidersHorizontal } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/components/providers';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';

const links = [{ href: '/admin/integracao', label: 'Integração Saipos', icon: SlidersHorizontal }, { href: '/admin', label: 'Visão geral', icon: LayoutDashboard }, { href: '/admin/pedidos', label: 'Pedidos', icon: ShoppingBag }, { href: '/admin/catalogo', label: 'Catálogo', icon: Boxes }, { href: '/admin/adicionais', label: 'Adicionais', icon: SlidersHorizontal }, { href: '/admin/configuracoes', label: 'Configurações', icon: Settings }];
export function AdminShell({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, role, loading } = useAuth();
  useEffect(() => { if (!loading && (!user || !role)) window.location.href = '/admin/login'; }, [loading, user, role]);
  if (!hasFirebaseConfig) return <AdminMessage title="Firebase não configurado" text="Configure .env.local antes de acessar o painel." />;
  if (loading) return <AdminMessage title="Carregando painel…" text="Validando sua sessão e permissão." />;
  if (!user || !role) return null;
  if (adminOnly && role !== 'admin') return <AdminMessage title="Acesso restrito" text="Esta área exige a função admin." />;
  return <div className="min-h-screen bg-[#f8f5f6] text-[#2b1722]"><aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#351924] p-5 text-white lg:flex"><a href="/admin" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#82204f] font-black">A+</span><span><strong className="block">Açaí + Sabor</strong><small className="text-white/50">Painel operacional</small></span></a><nav className="mt-8 space-y-1">{links.map(({ href, label, icon: Icon }) => <a key={href} href={href} className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold text-white/70 hover:bg-white/8 hover:text-white"><Icon className="size-4" />{label}</a>)}</nav><div className="mt-auto rounded-2xl bg-white/6 p-3"><span className="block truncate text-xs font-bold">{user.email}</span><span className="mt-1 block text-[10px] uppercase tracking-widest text-[#d7f04a]">{role}</span><button onClick={() => signOut(getFirebaseClient().auth)} className="mt-3 flex items-center gap-2 text-xs text-white/60 hover:text-white"><LogOut className="size-3.5" /> Sair</button></div></aside><div className="lg:pl-64"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-white/90 px-4 backdrop-blur lg:px-8"><a href="/admin" className="font-black lg:hidden">A+ Admin</a><nav className="flex gap-1 overflow-x-auto lg:hidden">{links.slice(1).map(({ href, icon: Icon }) => <a key={href} href={href} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-[#fff0f5]"><Icon className="size-4" /></a>)}</nav><span className="hidden text-sm text-[#826a75] lg:block">Operação em tempo real</span><span className="rounded-full bg-[#eaf8ef] px-3 py-1 text-xs font-bold text-emerald-700">Online</span></header><main className="p-4 sm:p-6 lg:p-8">{children}</main></div></div>;
}
function AdminMessage({ title, text }: { title: string; text: string }) { return <main className="grid min-h-screen place-items-center bg-[#f8f5f6] p-6 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-full bg-[#82204f] font-black text-white">A+</span><h1 className="mt-5 text-2xl font-black">{title}</h1><p className="mt-2 text-sm text-[#826a75]">{text}</p></div></main>; }
