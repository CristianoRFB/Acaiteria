'use client';

import { ArrowLeft, Bike, CheckCircle2, Loader2, MapPin, Store } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { useMemo, useState, type FormEvent } from 'react';

import { PublicHeader } from '@/components/public-header';
import { useCart, useCatalog } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import { calculateCartPreview, calculateDeliveryFee, formatBRL, type FulfillmentMode } from '@/shared/domain';

const paymentLabels = { PIX: 'Pix', CARD: 'Cartão na entrega', CASH: 'Dinheiro' } as const;

export default function CheckoutPage() {
  const cart = useCart();
  const { catalog, config, development } = useCatalog();
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>(config.fulfillmentModes[0] ?? 'PICKUP');
  const [paymentMethod, setPaymentMethod] = useState(config.paymentMethods[0] ?? 'PIX');
  const [zoneId, setZoneId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const preview = useMemo(() => { try { return calculateCartPreview(cart.items, catalog); } catch { return { items: [], subtotalCents: 0 }; } }, [cart.items, catalog]);
  let deliveryFee = 0;
  try { deliveryFee = calculateDeliveryFee(config.deliveryConfig, fulfillment, zoneId); } catch { deliveryFee = 0; }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    if (!cart.items.length) { setError('Seu carrinho está vazio.'); return; }
    if (!hasFirebaseConfig) { setError('Firebase ainda não foi configurado. O pedido não foi enviado.'); return; }
    const data = new FormData(event.currentTarget);
    const clientRequestId = sessionStorage.getItem('acai-checkout-request-id') ?? crypto.randomUUID();
    sessionStorage.setItem('acai-checkout-request-id', clientRequestId);
    const payload = {
      clientRequestId,
      customer: { name: data.get('name'), whatsapp: data.get('whatsapp'), address: fulfillment === 'DELIVERY' ? { street: data.get('street'), number: data.get('number'), neighborhood: data.get('neighborhood'), reference: data.get('reference') } : undefined },
      items: cart.items.map(({ productId, sizeId, selections, quantity, notes }) => ({ productId, sizeId, selections, quantity, notes })),
      fulfillment: { mode: fulfillment, zoneId: zoneId || undefined },
      payment: { method: paymentMethod, changeForCents: paymentMethod === 'CASH' && data.get('changeFor') ? Math.round(Number(String(data.get('changeFor')).replace(',', '.')) * 100) : undefined },
      notes: data.get('orderNotes'),
      clientPreviewTotalCents: preview.subtotalCents + deliveryFee,
    };
    setSubmitting(true);
    try {
      const { functions } = getFirebaseClient();
      const createOrder = httpsCallable<typeof payload, { publicCode: string; orderNumber: string; totalCents: number }>(functions, 'createOrder');
      const response = await createOrder(payload);
      cart.clear(); sessionStorage.removeItem('acai-checkout-request-id');
      window.location.href = `/pedido/${response.data.publicCode}?novo=1`;
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message.replace(/^FirebaseError:\s*/, '') : 'Não foi possível enviar o pedido.';
      setError(message); setSubmitting(false);
    }
  }

  if (!cart.items.length) return <main className="min-h-screen bg-[#fffaf5]"><PublicHeader /><div className="mx-auto max-w-lg px-6 py-24 text-center"><h1 className="text-3xl font-black">Carrinho vazio</h1><p className="mt-2 text-sm text-[#826a75]">Adicione um produto antes de ir ao checkout.</p><Button className="mt-6 rounded-full bg-[#82204f] text-white" render={<a href="/" />}>Ver cardápio</Button></div></main>;
  return <main className="min-h-screen bg-[#fffaf5] pb-12 text-[#2b1722]"><PublicHeader /><form onSubmit={submit} className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_360px]"><div><a href="/carrinho" className="inline-flex items-center gap-2 text-sm font-bold text-[#82204f]"><ArrowLeft className="size-4" /> Voltar ao carrinho</a><h1 className="mt-5 text-4xl font-black tracking-[-.05em]">Finalizar pedido</h1><p className="mt-2 text-sm text-[#826a75]">Só o essencial para a loja preparar e entregar corretamente.</p>{development && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900"><strong>Ambiente de desenvolvimento.</strong> O envio exige que os emuladores Firebase estejam rodando; nenhum pedido é fingido como concluído.</div>}
    <section className="mt-8 rounded-[28px] bg-white p-5 shadow-sm sm:p-6"><h2 className="text-xl font-black">Como você quer receber?</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{config.fulfillmentModes.map((mode) => <button type="button" key={mode} onClick={() => setFulfillment(mode)} className={`flex min-h-20 items-center gap-3 rounded-[20px] border-2 p-4 text-left ${fulfillment === mode ? 'border-[#82204f] bg-[#fff0f5]' : 'border-[#efe4e8]'}`}><span className={`grid size-10 place-items-center rounded-full ${fulfillment === mode ? 'bg-[#82204f] text-white' : 'bg-[#f8f1f4]'}`}>{mode === 'PICKUP' ? <Store className="size-5" /> : <Bike className="size-5" />}</span><span><strong className="block">{mode === 'PICKUP' ? 'Retirar na loja' : 'Receber em casa'}</strong><small className="text-[#826a75]">{mode === 'PICKUP' ? 'Sem taxa de entrega' : config.deliveryConfig.mode === 'CONFIRM' ? 'Taxa confirmada pela loja' : 'Taxa calculada abaixo'}</small></span></button>)}</div></section>
    <section className="mt-5 rounded-[28px] bg-white p-5 shadow-sm sm:p-6"><h2 className="text-xl font-black">Seus dados</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Nome" name="name" placeholder="Como podemos chamar você?" required maxLength={80} /><Field label="WhatsApp" name="whatsapp" placeholder="(17) 99999-9999" required inputMode="tel" maxLength={20} /></div></section>
    {fulfillment === 'DELIVERY' && <section className="mt-5 rounded-[28px] bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-2"><MapPin className="size-5 text-[#82204f]" /><h2 className="text-xl font-black">Endereço de entrega</h2></div>{config.deliveryConfig.mode === 'ZONES' && <label className="mt-5 block text-sm font-bold">Bairro/região<select required value={zoneId} onChange={(event) => setZoneId(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-[#82204f]/15 bg-[#fffaf5] px-4 font-normal outline-none focus:border-[#82204f]"><option value="">Selecione</option>{config.deliveryConfig.zones?.filter((zone) => zone.active).map((zone) => <option key={zone.id} value={zone.id}>{zone.name} • {formatBRL(zone.feeCents)}</option>)}</select></label>}<div className="mt-4 grid gap-4 sm:grid-cols-[1fr_120px]"><Field label="Rua/Avenida" name="street" required maxLength={120} /><Field label="Número" name="number" required maxLength={20} /></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Bairro" name="neighborhood" required maxLength={80} /><Field label="Referência" name="reference" maxLength={120} /></div></section>}
    <section className="mt-5 rounded-[28px] bg-white p-5 shadow-sm sm:p-6"><h2 className="text-xl font-black">Pagamento na retirada/entrega</h2><p className="mt-1 text-xs text-[#826a75]">Não coletamos dados de cartão.</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{config.paymentMethods.map((method) => <button key={method} type="button" onClick={() => setPaymentMethod(method)} className={`min-h-14 rounded-2xl border-2 p-3 text-sm font-bold ${paymentMethod === method ? 'border-[#82204f] bg-[#fff0f5]' : 'border-[#efe4e8]'}`}>{paymentLabels[method]}</button>)}</div>{paymentMethod === 'CASH' && <div className="mt-4 max-w-xs"><Field label="Troco para (R$)" name="changeFor" placeholder="Ex.: 50,00" inputMode="decimal" /></div>}</section>
    <section className="mt-5 rounded-[28px] bg-white p-5 shadow-sm sm:p-6"><label htmlFor="orderNotes" className="text-xl font-black">Observação geral</label><textarea id="orderNotes" name="orderNotes" maxLength={500} className="mt-3 min-h-24 w-full rounded-[18px] border border-[#82204f]/15 bg-[#fffaf5] p-4 text-sm outline-none focus:border-[#82204f]" placeholder="Opcional" /></section>
    {error && <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{error}<span className="mt-1 block font-normal">Seu carrinho foi preservado. Você pode corrigir ou tentar novamente.</span></div>}
  </div><aside><div className="sticky top-26 rounded-[28px] bg-[#351924] p-6 text-white"><h2 className="text-xl font-black">Resumo</h2><div className="mt-5 space-y-3 border-b border-white/10 pb-5">{preview.items.map((item, index) => <div key={index} className="flex justify-between gap-3 text-sm"><span className="text-white/70">{item.quantity}x {item.productName} <small className="block text-white/40">{item.sizeLabel}</small></span><strong>{formatBRL(item.totalPriceCents)}</strong></div>)}</div><div className="mt-4 flex justify-between text-sm text-white/70"><span>Subtotal</span><strong className="text-white">{formatBRL(preview.subtotalCents)}</strong></div><div className="mt-2 flex justify-between text-sm text-white/70"><span>Entrega</span><strong className="text-white">{fulfillment === 'DELIVERY' && config.deliveryConfig.mode === 'CONFIRM' ? 'A confirmar' : formatBRL(deliveryFee)}</strong></div><div className="mt-5 flex items-end justify-between"><span className="text-sm">Total previsto</span><strong className="text-3xl font-black text-[#ffcf3d]">{formatBRL(preview.subtotalCents + deliveryFee)}</strong></div><p className="mt-3 text-[11px] leading-relaxed text-white/45">O servidor recalcula o valor com o cardápio atual. Em caso de mudança, o pedido não será confirmado silenciosamente.</p><Button type="submit" disabled={submitting} className="mt-6 h-12 w-full rounded-full bg-[#d7f04a] font-black text-[#351924] hover:bg-[#c4dd36]">{submitting ? <><Loader2 className="animate-spin" /> Enviando…</> : <><CheckCircle2 /> Confirmar pedido</>}</Button><p className="mt-4 text-center text-[11px] text-white/45">Ao confirmar, seus dados são usados apenas para atender este pedido.</p></div></aside></form></main>;
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) { const { label, name, ...input } = props; return <label className="block text-sm font-bold">{label}<input name={name} {...input} className="mt-2 h-12 w-full rounded-2xl border border-[#82204f]/15 bg-[#fffaf5] px-4 font-normal outline-none focus:border-[#82204f]" /></label>; }
