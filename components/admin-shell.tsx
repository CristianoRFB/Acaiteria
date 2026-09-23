'use client';

import {
  Boxes,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  WalletCards,
  CircleDollarSign,
  CircleHelp,
  Bike,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/components/providers';
import { AdminNotifications } from '@/components/admin-notifications';
import { AdminTutorial } from '@/components/admin-tutorial';
import { BrandLogo } from '@/components/brand-logo';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import { usePathname } from 'next/navigation';

const links = [
  {
    href: '/admin/integracao',
    label: 'Integração Saipos',
    icon: SlidersHorizontal,
  },
  { href: '/admin/financas', label: 'Finanças', icon: WalletCards },
  { href: '/admin/caixa', label: 'Caixa', icon: CircleDollarSign },
  { href: '/admin/ajuda', label: 'Central de ajuda', icon: CircleHelp },
  { href: '/admin', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/admin/pedidos', label: 'Pedidos', icon: ShoppingBag },
  { href: '/admin/entregas', label: 'Entregas', icon: Bike },
  { href: '/admin/entregadores', label: 'Entregadores', icon: Bike },
  { href: '/admin/catalogo', label: 'Catálogo', icon: Boxes },
  { href: '/admin/promocoes', label: 'Promoções', icon: Megaphone },
  { href: '/admin/adicionais', label: 'Adicionais', icon: SlidersHorizontal },
  { href: '/admin/configuracoes', label: 'Configurações', icon: Settings },
];
export function AdminShell({
  children,
  adminOnly = false,
}: {
  children: ReactNode;
  adminOnly?: boolean;
}) {
  const { user, role, loading } = useAuth();
  const pathname = usePathname();
  useEffect(() => {
    if (!hasFirebaseConfig) return;
    if (!loading && (!user || !role)) window.location.href = '/admin/login';
    if (!loading && user && role === 'driver') window.location.href = '/entregador';
  }, [loading, user, role]);
  if (!hasFirebaseConfig)
    return (
      <AdminMessage
        title="Firebase não configurado"
        text="Configure .env.local antes de acessar o painel."
      />
    );
  if (loading)
    return (
      <AdminMessage
        title="Carregando painel…"
        text="Validando sua sessão e permissão."
      />
    );
  if (!user || !role || role === 'driver') return null;
  if (adminOnly && role !== 'admin')
    return (
      <AdminMessage
        title="Acesso restrito"
        text="Esta área exige a função admin."
      />
    );
  return (
    <div className="min-h-screen bg-surface-warm text-text-strong">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#351924] p-5 text-white lg:flex">
        <a href="/admin" className="flex items-center gap-3">
          <BrandLogo inverse />
          <span className="sr-only">Painel operacional</span>
        </a>
        <nav className="mt-8 space-y-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`));
            return <a
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold transition ${active ? 'bg-white text-brand-deep' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
            >
              <Icon className="size-4" />
              {label}
            </a>;
          })}
        </nav>
        <div className="mt-auto rounded-2xl bg-white/6 p-3">
          <span className="block truncate text-xs font-bold">{user.email}</span>
          <span className="mt-1 block text-[10px] uppercase tracking-widest text-[#d7f04a]">
            {role}
          </span>
          <button
            onClick={() => signOut(getFirebaseClient().auth)}
            className="mt-3 flex items-center gap-2 text-xs text-white/60 hover:text-white"
          >
            <LogOut className="size-3.5" /> Sair
          </button>
        </div>
      </aside>
      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 min-w-0 items-center gap-2 border-b bg-white/90 px-3 backdrop-blur sm:px-4 lg:px-8">
          <a
            href="/admin"
            className="shrink-0 font-black lg:hidden"
            aria-label="Açaí + Sabor, painel"
          >
            <BrandLogo compact />
          </a>
          <nav
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto overscroll-x-contain py-1 lg:hidden"
            aria-label="Navegação do painel"
          >
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`));
              return <a
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                title={label}
                className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${active ? 'bg-brand text-white' : 'text-text-muted hover:bg-white hover:text-brand'}`}
              >
                <Icon className="size-4" />
                <span className="text-[11px] font-black">{label}</span>
              </a>;
            })}
          </nav>
          <span className="hidden text-sm text-text-muted lg:block">
            Operação em tempo real
          </span>
          <span className="hidden shrink-0 rounded-full bg-[#eaf8ef] px-3 py-1 text-xs font-bold text-emerald-700 min-[430px]:block">
            Online
          </span>
        </header>
        <main className="min-w-0 p-4 pb-24 sm:p-6 lg:p-8">{children}</main>
      </div>
      <AdminNotifications />
      <AdminTutorial />
    </div>
  );
}
function AdminMessage({ title, text }: { title: string; text: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f8f5f6] p-6 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#82204f] font-black text-white">
          A+
        </span>
        <h1 className="mt-5 text-2xl font-black">{title}</h1>
        <p className="mt-2 text-sm text-[#826a75]">{text}</p>
      </div>
    </main>
  );
}
