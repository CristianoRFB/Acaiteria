'use client';

import { Info, ShoppingBag } from 'lucide-react';
import { useCart } from '@/components/providers';

export function PublicHeader() {
  const { items } = useCart();
  const count = items.reduce((total, item) => total + item.quantity, 0);
  return <header className="sticky top-0 z-30 border-b border-[#82204f]/10 bg-[#fffaf5]/92 backdrop-blur-xl"><div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-4 sm:px-6"><a className="flex items-center gap-2" href="/" aria-label="Açaí mais Sabor, início"><span className="grid size-9 place-items-center rounded-full bg-[#82204f] text-sm font-black text-white">A+</span><span className="text-base font-black tracking-[-0.03em]">Açaí + Sabor</span></a><nav className="flex items-center gap-1" aria-label="Navegação principal"><a className="grid size-10 place-items-center rounded-full text-[#6a4a5a] hover:bg-[#82204f]/8" href="/informacoes" aria-label="Informações"><Info className="size-5" /></a><a className="relative grid size-11 place-items-center rounded-full bg-[#2b1722] text-white" href="/carrinho" aria-label={`Carrinho com ${count} itens`}><ShoppingBag className="size-5" /><span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-[#d7f04a] text-[10px] font-black text-[#2b1722]">{count}</span></a></nav></div></header>;
}
