'use client';

import { ArrowRight, Search, TicketCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

interface RecentOrder { publicCode: string; orderNumber?: string; savedAt: number }

export function OrderLookup() {
  const [code, setCode] = useState('');
  const [recent, setRecent] = useState<RecentOrder | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('acai-mais-sabor-recent-orders') || '[]') as RecentOrder[];
      const first = Array.isArray(saved) ? saved.find((item) => item?.publicCode && Date.now() - item.savedAt < 30 * 86400000) : undefined;
      if (first) setRecent(first);
    } catch {
      localStorage.removeItem('acai-mais-sabor-recent-orders');
    }
  }, []);

  function go(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.trim().replace(/^#/, '');
    if (!normalized) { setError('Digite o código do pedido para acompanhar.'); return; }
    window.location.href = `/pedido/${encodeURIComponent(normalized)}`;
  }

  return <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
    <div className="grid gap-5 rounded-[30px] border border-[#82204f]/12 bg-white p-6 shadow-[0_12px_40px_rgba(88,32,58,.07)] sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
      <div><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full bg-[#fff0f5] text-[#82204f]"><TicketCheck className="size-5" /></span><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#a62c63]">Pedido online</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em] text-[#351924]">Acompanhe seu pedido</h2></div></div><p className="mt-3 max-w-xl text-sm leading-relaxed text-[#826a75]">Digite o código que aparece depois de confirmar o pedido. Você também pode salvar este link para consultar as atualizações sem entrar em uma conta.</p>
        <form onSubmit={go} className="mt-5 flex flex-col gap-2 sm:flex-row sm:max-w-xl"><label className="sr-only" htmlFor="order-lookup-code">Código do pedido</label><input id="order-lookup-code" value={code} onChange={(event) => { setCode(event.target.value); setError(''); }} placeholder="Ex.: A1509265F6E" autoComplete="off" className="h-12 min-w-0 flex-1 rounded-full border border-[#82204f]/15 bg-[#fffaf5] px-5 text-sm font-bold outline-none focus:border-[#82204f] focus:ring-2 focus:ring-[#82204f]/15" /><button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#82204f] px-5 text-sm font-black text-white transition hover:bg-[#6d183f]"><Search className="size-4" /> Acompanhar <ArrowRight className="size-4" /></button></form>{error && <p role="alert" className="mt-2 text-sm font-bold text-red-700">{error}</p>}</div>
      {recent && <div className="rounded-2xl bg-[#fff0f5] p-4 lg:min-w-56"><p className="text-xs font-bold uppercase tracking-wider text-[#a62c63]">Último pedido</p><p className="mt-1 text-lg font-black text-[#351924]">{recent.orderNumber || `#${recent.publicCode.slice(-6).toUpperCase()}`}</p><a href={`/pedido/${encodeURIComponent(recent.publicCode)}`} className="mt-3 inline-flex items-center gap-1 text-sm font-black text-[#82204f]">Abrir acompanhamento <ArrowRight className="size-4" /></a></div>}
    </div>
  </section>;
}
