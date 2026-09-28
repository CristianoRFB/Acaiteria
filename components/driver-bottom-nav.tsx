'use client';

import { History, Home, PackageCheck, UserRound } from 'lucide-react';

export type DriverTab = 'HOME' | 'ORDERS' | 'HISTORY' | 'PROFILE';

const items: { id: DriverTab; label: string; icon: typeof Home; href: string }[] = [
  { id: 'HOME', label: 'Início', icon: Home, href: '/entregador?tab=home' },
  { id: 'ORDERS', label: 'Pedidos', icon: PackageCheck, href: '/entregador?tab=orders' },
  { id: 'HISTORY', label: 'Histórico', icon: History, href: '/entregador?tab=history' },
  { id: 'PROFILE', label: 'Perfil', icon: UserRound, href: '/entregador?tab=profile' },
];

export function DriverBottomNav({ active, onNavigate }: { active: DriverTab; onNavigate?: (tab: DriverTab) => void }) {
  return (
    <nav aria-label="Navegação do entregador" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e5e1ed] bg-white/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-around">
        {items.map(({ id, label, icon: Icon, href }) => {
          const className = `flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold ${active === id ? 'text-[#6f2bc5]' : 'text-[#6f6878]'}`;
          return onNavigate ? (
            <button key={id} type="button" aria-current={active === id ? 'page' : undefined} onClick={() => onNavigate(id)} className={className}>
              <Icon aria-hidden="true" className="size-5" />{label}
            </button>
          ) : (
            <a key={id} href={href} aria-current={active === id ? 'page' : undefined} className={className}>
              <Icon aria-hidden="true" className="size-5" />{label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
