'use client';

import { Check, ChefHat, Clock3, MessageCircle, PackageCheck, RefreshCw } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { PublicHeader } from '@/components/public-header';
import { Button } from '@/components/ui/button';
import { useCatalog } from '@/components/providers';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import { formatBRL, type OrderStatus, type PricedItem } from '@/shared/domain';

interface PublicOrder { integrationMessage?: string; orderNumber: string; createdAt?: string; items: PricedItem[]; pricing: { totalCents: number }; fulfillment: { mode: 'PICKUP' | 'DELIVERY' }; status: OrderStatus; updatedAt?: string }
const steps: Array<{ statuses: OrderStatus[]; label: string; icon: typeof Clock3 }> = [
  { statuses: ['NEW'], label: 'Recebido', icon: Check },
  { statuses: ['CONFIRMED'], label: 'Confirmado', icon: Clock3 },
  { statuses: ['PREPARING'], label: 'Em preparo', icon: ChefHat },
  { statuses: ['READY', 'OUT_FOR_DELIVERY'], label: 'Pronto', icon: PackageCheck },
  { statuses: ['COMPLETED'], label: 'Concluído', icon: Check },
];

export default function OrderPage() {
  const { publicCode } = useParams<{ publicCode: string }>();
  const search = useSearchParams();
  const { config } = useCatalog();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!hasFirebaseConfig) { setError('Firebase não configurado.'); setLoading(false); return; }
    try { const { functions } = getFirebaseClient(); const lookup = httpsCallable<{ publicCode: string }, PublicOrder>(functions, 'getPublicOrder'); const response = await lookup({ publicCode }); setOrder(response.data); setError(''); } catch { setError('Pedido não encontrado ou temporariamente indisponível.'); } finally { setLoading(false); }
  }, [publicCode]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 20000); return () => clearInterval(timer); }, [load]);
  function whatsappUrl() { if (!order || !config.whatsappNumber) return '#'; const summary = order.items.map((item) => `${item.quantity}x ${item.productName} (${item.sizeLabel})`).join('\n'); const message = `Olá! Pedido ${order.orderNumber}\n${summary}\nTotal: ${formatBRL(order.pricing.totalCents)}\n${order.fulfillment.mode === 'PICKUP' ? 'Retirada' : 'Delivery'}`; return `https://wa.me/${config.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`; }
  if (loading) return <main className="grid min-h-screen place-items-center bg-[#fffaf5]"><RefreshCw className="size-6 animate-spin text-[#82204f]" /></main>;
  if (!order) return <main className="min-h-screen bg-[#fffaf5]"><PublicHeader /><div className="mx-auto max-w-lg px-6 py-24 text-center"><h1 className="text-3xl font-black">Não encontramos esse pedido</h1><p className="mt-2 text-sm text-[#826a75]">{error}</p><Button className="mt-6 rounded-full bg-[#82204f] text-white" onClick={load}>Tentar novamente</Button></div></main>;
  const activeIndex = steps.findIndex((step) => step.statuses.includes(order.status));
  return <main className="min-h-screen bg-[#fffaf5] text-[#2b1722]"><PublicHeader /><div className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><div className="rounded-[32px] bg-[#351924] p-6 text-white sm:p-9">{search.get('novo') === '1' && <span className="inline-flex items-center gap-2 rounded-full bg-[#d7f04a] px-3 py-1.5 text-xs font-black text-[#351924]"><Check className="size-3.5" /> Pedido salvo</span>}<p className="mt-5 text-sm text-white/60">Acompanhe seu pedido</p><h1 className="mt-1 text-4xl font-black tracking-[-.05em]">{order.orderNumber}</h1><p className="mt-3 text-sm leading-relaxed text-white/65">{order.integrationMessage ?? 'Pedido recebido pela loja. Acompanhe a atualização nesta página.'}</p><div className="mt-8 grid grid-cols-5 gap-1">{steps.map((step, index) => { const Icon = step.icon; const done = activeIndex >= index && order.status !== 'CANCELLED'; return <div key={step.label} className="text-center"><span className={`mx-auto grid size-9 place-items-center rounded-full ${done ? 'bg-[#d7f04a] text-[#351924]' : 'bg-white/10 text-white/35'}`}><Icon className="size-4" /></span><span className={`mt-2 block text-[10px] font-bold ${done ? 'text-white' : 'text-white/35'}`}>{step.label}</span></div>; })}</div>{order.status === 'CANCELLED' && <div className="mt-6 rounded-2xl bg-red-400/15 p-4 text-sm font-bold text-red-100">Este pedido foi cancelado. Entre em contato com a loja se precisar de ajuda.</div>}</div>
    <section className="mt-6 rounded-[28px] bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Resumo</h2><strong className="text-xl font-black text-[#82204f]">{formatBRL(order.pricing.totalCents)}</strong></div><div className="mt-5 space-y-4">{order.items.map((item, index) => <div key={index} className="border-t border-[#82204f]/8 pt-4 first:border-0 first:pt-0"><div className="flex justify-between gap-3"><strong>{item.quantity}x {item.productName}</strong><span className="text-sm font-bold">{formatBRL(item.totalPriceCents)}</span></div><p className="mt-1 text-xs text-[#826a75]">{item.sizeLabel}</p>{item.modifierSelections.filter((group) => group.items.length).map((group) => <p key={group.groupId} className="mt-1 text-xs text-[#826a75]">{group.groupName}: {group.items.map((selected) => `${selected.quantity > 1 ? `${selected.quantity}x ` : ''}${selected.name}`).join(', ')}</p>)}</div>)}</div></section>
    <div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button variant="outline" className="h-12 flex-1 rounded-full" onClick={load}><RefreshCw /> Atualizar status</Button>{config.whatsappEnabled && config.whatsappNumber && <Button className="h-12 flex-1 rounded-full bg-[#1f9d55] text-white hover:bg-[#178447]" render={<a href={whatsappUrl()} target="_blank" rel="noreferrer" />}><MessageCircle /> Abrir WhatsApp</Button>}</div><p className="mt-5 text-center text-xs text-[#826a75]">Guarde este link para acompanhar o pedido. O código não permite listar outros pedidos.</p></div></main>;
}
