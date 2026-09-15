'use client';

import { httpsCallable } from 'firebase/functions';
import { ArrowLeft, Bike, CheckCircle2, Clock3, Loader2, MapPin, Store } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { PublicHeader } from '@/components/public-header';
import { useCart, useCatalog } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import { calculateCartPreview, calculateDeliveryFee, formatBRL, formatNextOpening, getStoreAvailability, type FulfillmentMode } from '@/shared/domain';

const paymentLabels = { PIX: 'Pix', CARD: 'Cartão na entrega', CASH: 'Dinheiro' } as const;
type PaymentMethod = keyof typeof paymentLabels;

interface CheckoutFields {
  name: string;
  whatsapp: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  reference: string;
  orderNotes: string;
}

const emptyFields: CheckoutFields = { name: '', whatsapp: '', street: '', number: '', complement: '', neighborhood: '', reference: '', orderNotes: '' };

export default function CheckoutPage() {
  const cart = useCart();
  const { catalog, config, development } = useCatalog();
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>(config.fulfillmentModes[0] ?? 'PICKUP');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(config.paymentMethods[0] ?? 'PIX');
  const [needsChange, setNeedsChange] = useState<boolean | null>(null);
  const [changeFor, setChangeFor] = useState('');
  const [fields, setFields] = useState<CheckoutFields>(emptyFields);
  const [zoneId, setZoneId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [whatsappFallbackUrl, setWhatsappFallbackUrl] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!config.fulfillmentModes.includes(fulfillment)) setFulfillment(config.fulfillmentModes[0] ?? 'PICKUP');
    if (!config.paymentMethods.includes(paymentMethod)) selectPayment(config.paymentMethods[0] ?? 'PIX');
  // The available methods are configuration state; current selections are intentionally preserved while valid.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.fulfillmentModes, config.paymentMethods]);

  const preview = useMemo(() => { try { return calculateCartPreview(cart.items, catalog); } catch { return { items: [], subtotalCents: 0 }; } }, [cart.items, catalog]);
  let deliveryFee = 0;
  try { deliveryFee = calculateDeliveryFee(config.deliveryConfig, fulfillment, zoneId); } catch { deliveryFee = 0; }
  let deliveryOptionFee = 0;
  try { deliveryOptionFee = calculateDeliveryFee(config.deliveryConfig, 'DELIVERY', zoneId); } catch { deliveryOptionFee = 0; }
  const totalCents = preview.subtotalCents + deliveryFee;
  const availability = getStoreAvailability(now, config);
  const changeForCents = parseCurrencyToCents(changeFor);

  function updateField(name: keyof CheckoutFields, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
  }

  function selectPayment(method: PaymentMethod) {
    setPaymentMethod(method);
    setError('');
    if (method !== 'CASH') {
      setNeedsChange(null);
      setChangeFor('');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!cart.items.length) { setError('Seu carrinho está vazio.'); return; }
    if (!availability.acceptingOrders) { setError(`A loja está fechada para novos pedidos. ${formatNextOpening(availability.nextOpening)}.`); return; }
    if (paymentMethod === 'CASH' && needsChange === null) { setError('Informe se precisa de troco.'); return; }
    if (paymentMethod === 'CASH' && needsChange && changeForCents === null) { setError('Informe um valor válido para o troco.'); return; }
    if (paymentMethod === 'CASH' && needsChange && changeForCents! < totalCents) { setError('O valor para troco precisa ser igual ou maior que o total do pedido.'); return; }
    if (!hasFirebaseConfig) { setError('Firebase ainda não foi configurado. O pedido não foi enviado.'); return; }

    const clientRequestId = sessionStorage.getItem('acai-checkout-request-id') ?? crypto.randomUUID();
    sessionStorage.setItem('acai-checkout-request-id', clientRequestId);
    const payload = {
      clientRequestId,
      customer: {
        name: fields.name,
        whatsapp: fields.whatsapp,
        address: fulfillment === 'DELIVERY' ? {
          street: fields.street,
          number: fields.number,
          complement: fields.complement || undefined,
          neighborhood: fields.neighborhood,
          reference: fields.reference || undefined,
        } : undefined,
      },
      items: cart.items.map(({ productId, sizeId, selections, quantity, notes }) => ({ productId, sizeId, selections, quantity, notes })),
      fulfillment: { mode: fulfillment, zoneId: zoneId || undefined },
      payment: {
        method: paymentMethod,
        needsChange: paymentMethod === 'CASH' ? Boolean(needsChange) : false,
        ...(paymentMethod === 'CASH' && needsChange ? { changeForCents } : {}),
      },
      notes: fields.orderNotes || undefined,
      clientPreviewTotalCents: totalCents,
    };

    setSubmitting(true);
    try {
      const { functions } = getFirebaseClient();
      const createOrder = httpsCallable<typeof payload, { publicCode: string; orderNumber: string; totalCents: number }>(functions, 'createOrder');
      const response = await createOrder(payload);
      cart.clear();
      sessionStorage.removeItem('acai-checkout-request-id');
      window.location.href = `/pedido/${response.data.publicCode}?novo=1`;
    } catch (cause: unknown) {
      const rawMessage = cause instanceof Error ? cause.message.replace(/^FirebaseError:\s*/, '') : 'Não foi possível enviar o pedido.';
      const errorCode = typeof cause === 'object' && cause && 'code' in cause ? String((cause as { code?: unknown }).code) : '';
      const ambiguous = /deadline|timeout|unavailable|internal|network|failed-precondition/i.test(`${errorCode} ${rawMessage}`);
      const message = ambiguous
        ? 'Estamos confirmando se seu pedido chegou. Não envie outro pedido ainda. Aguarde alguns instantes e tente novamente.'
        : rawMessage;
      setError(message);
      const number = config.whatsappNumber?.replace(/\D/g, '');
      if (number && !ambiguous) {
        const lines = [
          'Olá! Quero fazer este pedido:',
          ...preview.items.map((item) => `- ${item.quantity}x ${item.productName} (${item.sizeLabel}) — ${formatBRL(item.totalPriceCents)}`),
          `Total previsto: ${formatBRL(totalCents)}`,
          `Nome: ${fields.name}`,
          `WhatsApp: ${fields.whatsapp}`,
          fulfillment === 'DELIVERY' ? `Endereço: ${fields.street}, ${fields.number} - ${fields.neighborhood}` : 'Retirada na loja',
          `Pagamento: ${paymentLabels[paymentMethod]}${paymentMethod === 'CASH' && needsChange ? ` (troco para ${formatBRL(changeForCents ?? 0)})` : ''}`,
          fields.orderNotes ? `Observação: ${fields.orderNotes}` : '',
        ].filter(Boolean).join('\n');
        setWhatsappFallbackUrl(`https://wa.me/${number}?text=${encodeURIComponent(lines)}`);
      }
      setSubmitting(false);
    }
  }

  if (!cart.items.length) return <main className="min-h-screen bg-[#fffaf5]"><PublicHeader /><div className="mx-auto max-w-lg px-6 py-24 text-center"><h1 className="text-3xl font-black">Carrinho vazio</h1><p className="mt-2 text-sm text-[#826a75]">Adicione um produto antes de ir ao checkout.</p><Button className="mt-6 rounded-full bg-[#82204f] text-white" render={<a href="/" />}>Ver cardápio</Button></div></main>;

  return <main className="min-h-screen bg-[#fffaf5] pb-12 text-[#2b1722]">
    <PublicHeader />
    <form onSubmit={submit} className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_380px]">
      <div>
        <a href="/carrinho" className="inline-flex items-center gap-2 text-sm font-bold text-[#82204f]"><ArrowLeft className="size-4" /> Voltar ao carrinho</a>
        <h1 className="mt-5 text-4xl font-black tracking-[-.05em]">Revisar e finalizar</h1>
        <p className="mt-2 text-sm text-[#826a75]">Informe onde receber, a forma de pagamento e o troco, se precisar.</p>
        <div className={`mt-5 rounded-2xl border p-4 text-sm ${availability.acceptingOrders ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
          <strong className="flex items-center gap-2"><Clock3 className="size-4" />{availability.acceptingOrders ? `ABERTO AGORA${availability.closesAt ? ` · pedidos até ${availability.closesAt}` : ''}` : 'FECHADO NO MOMENTO'}</strong>
          <span className="mt-1 block text-xs">Tempo estimado: {availability.estimate.label}. {availability.estimate.detail}</span>
          {!availability.acceptingOrders && <span className="mt-1 block text-xs font-bold">{availability.reason === 'OUTSIDE_HOURS' ? `Próxima abertura: ${formatNextOpening(availability.nextOpening)}.` : config.pauseMessage}</span>}
        </div>
        {development && <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900"><strong>Ambiente de desenvolvimento.</strong> O envio exige que os emuladores Firebase estejam rodando; nenhum pedido é fingido como concluído.</div>}

        <CheckoutSection title="Como você quer receber?">
          <div className="grid gap-3 sm:grid-cols-2">{config.fulfillmentModes.map((mode) => <button type="button" key={mode} aria-pressed={fulfillment === mode} onClick={() => { setFulfillment(mode); setError(''); }} className={`flex min-h-20 items-center gap-3 rounded-[20px] border-2 p-4 text-left ${fulfillment === mode ? 'border-[#82204f] bg-[#fff0f5]' : 'border-[#efe4e8]'}`}><span className={`grid size-10 place-items-center rounded-full ${fulfillment === mode ? 'bg-[#82204f] text-white' : 'bg-[#f8f1f4]'}`}>{mode === 'PICKUP' ? <Store className="size-5" /> : <Bike className="size-5" />}</span><span><strong className="block">{mode === 'PICKUP' ? 'Retirar na loja' : 'Receber em casa'}</strong><small className="text-[#826a75]">{mode === 'PICKUP' ? 'Sem taxa de entrega' : config.deliveryConfig.mode === 'CONFIRM' ? 'Taxa confirmada pela loja' : config.deliveryConfig.mode === 'ZONES' && !zoneId ? 'Taxa conforme a região' : `Taxa de ${formatBRL(deliveryOptionFee)}`}</small></span></button>)}</div>
        </CheckoutSection>

        <CheckoutSection title="Seus dados">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Nome" name="name" value={fields.name} onChange={(event) => updateField('name', event.target.value)} placeholder="Como podemos chamar você?" required maxLength={80} /><Field label="WhatsApp" name="whatsapp" value={fields.whatsapp} onChange={(event) => updateField('whatsapp', event.target.value)} placeholder="(17) 99999-9999" required inputMode="tel" maxLength={20} /></div>
        </CheckoutSection>

        {fulfillment === 'DELIVERY' && <CheckoutSection title="Endereço de entrega" icon={<MapPin className="size-5 text-[#82204f]" />}>
          {config.deliveryConfig.mode === 'ZONES' && <label className="mb-4 block text-sm font-bold">Bairro/região<select required value={zoneId} onChange={(event) => setZoneId(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-[#82204f]/15 bg-[#fffaf5] px-4 font-normal outline-none focus:border-[#82204f]"><option value="">Selecione</option>{config.deliveryConfig.zones?.filter((zone) => zone.active).map((zone) => <option key={zone.id} value={zone.id}>{zone.name} • {formatBRL(zone.feeCents)}</option>)}</select></label>}
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]"><Field label="Rua/Avenida" name="street" value={fields.street} onChange={(event) => updateField('street', event.target.value)} required maxLength={120} /><Field label="Número" name="number" value={fields.number} onChange={(event) => updateField('number', event.target.value)} required maxLength={20} /></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Complemento" name="complement" value={fields.complement} onChange={(event) => updateField('complement', event.target.value)} maxLength={80} placeholder="Opcional" /><Field label="Bairro" name="neighborhood" value={fields.neighborhood} onChange={(event) => updateField('neighborhood', event.target.value)} required maxLength={80} /></div>
          <div className="mt-4"><Field label="Referência" name="reference" value={fields.reference} onChange={(event) => updateField('reference', event.target.value)} maxLength={120} placeholder="Opcional" /></div>
        </CheckoutSection>}

        <CheckoutSection title="Pagamento na retirada/entrega">
          <p className="mb-4 text-xs text-[#826a75]">Não coletamos dados de cartão.</p>
          <div className="grid gap-3 sm:grid-cols-3">{config.paymentMethods.map((method) => <button key={method} type="button" aria-pressed={paymentMethod === method} onClick={() => selectPayment(method)} className={`min-h-14 rounded-2xl border-2 p-3 text-sm font-bold ${paymentMethod === method ? 'border-[#82204f] bg-[#fff0f5]' : 'border-[#efe4e8]'}`}>{paymentLabels[method]}</button>)}</div>
          {paymentMethod === 'CASH' && <div className="mt-5 rounded-[20px] bg-[#fffaf5] p-4"><p className="text-sm font-black">Precisa de troco?</p><div className="mt-3 grid grid-cols-2 gap-3"><button type="button" aria-pressed={needsChange === false} onClick={() => { setNeedsChange(false); setChangeFor(''); setError(''); }} className={`min-h-12 rounded-2xl border-2 text-sm font-bold ${needsChange === false ? 'border-[#82204f] bg-white text-[#82204f]' : 'border-[#e7dce1]'}`}>Não</button><button type="button" aria-pressed={needsChange === true} onClick={() => { setNeedsChange(true); setError(''); }} className={`min-h-12 rounded-2xl border-2 text-sm font-bold ${needsChange === true ? 'border-[#82204f] bg-white text-[#82204f]' : 'border-[#e7dce1]'}`}>Sim</button></div>{needsChange && <div className="mt-4 max-w-xs"><Field label="Troco para quanto? (R$)" name="changeFor" value={changeFor} onChange={(event) => { setChangeFor(event.target.value); setError(''); }} placeholder="Ex.: 50,00" inputMode="decimal" required /></div>}</div>}
        </CheckoutSection>

        <CheckoutSection title="Observação geral">
          <textarea id="orderNotes" name="orderNotes" maxLength={500} value={fields.orderNotes} onChange={(event) => updateField('orderNotes', event.target.value)} className="min-h-24 w-full rounded-[18px] border border-[#82204f]/15 bg-[#fffaf5] p-4 text-sm outline-none focus:border-[#82204f]" placeholder="Opcional" />
        </CheckoutSection>

        {error && <div role="alert" aria-live="assertive" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><p>{error}</p><span className="mt-1 block font-normal">Seu carrinho e os dados preenchidos foram preservados.</span>{whatsappFallbackUrl && <a href={whatsappFallbackUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-full bg-[#1f9d55] px-4 py-2 font-bold text-white">Enviar pedido pelo WhatsApp</a>}</div>}
      </div>

      <aside><div className="sticky top-26 rounded-[28px] bg-[#351924] p-6 text-white shadow-[0_22px_50px_rgba(53,25,36,.16)]">
        <h2 className="text-xl font-black">Resumo final</h2>
        <div className="mt-5 space-y-4 border-b border-white/10 pb-5">{preview.items.map((item, index) => <div key={`${item.productId}-${index}`} className="text-sm"><div className="flex justify-between gap-3"><span className="text-white/75">{item.quantity}x {item.productName}<small className="block text-white/45">{item.sizeLabel}</small></span><strong>{formatBRL(item.totalPriceCents)}</strong></div>{item.modifierSelections.filter((group) => group.items.length).map((group) => <p key={group.groupId} className="mt-1 text-[11px] leading-relaxed text-white/45"><strong className="text-white/60">{group.groupName}:</strong> {group.items.map((modifier) => `${modifier.quantity > 1 ? `${modifier.quantity}x ` : ''}${modifier.name}`).join(', ')}</p>)}{item.notes && <p className="mt-1 text-[11px] italic text-white/45">“{item.notes}”</p>}</div>)}</div>
        <dl className="mt-5 space-y-3 text-sm"><SummaryLine label="Recebimento" value={fulfillment === 'DELIVERY' ? 'Entrega' : 'Retirada'} />{fulfillment === 'DELIVERY' && <SummaryLine label="Endereço" value={fields.street ? `${fields.street}, ${fields.number || 's/n'}${fields.neighborhood ? ` · ${fields.neighborhood}` : ''}` : 'Preencha o endereço'} />}<SummaryLine label="Pagamento" value={paymentLabels[paymentMethod]} />{paymentMethod === 'CASH' && <SummaryLine label="Troco" value={needsChange === null ? 'Informe se precisa' : needsChange ? changeForCents === null ? 'Informe o valor' : `Para ${formatBRL(changeForCents)}` : 'Não precisa'} />}<SummaryLine label="Estimativa" value={availability.estimate.label} /></dl>
        <div className="mt-5 border-t border-white/10 pt-4"><SummaryLine label="Subtotal" value={formatBRL(preview.subtotalCents)} /><div className="mt-2"><SummaryLine label="Entrega" value={fulfillment === 'DELIVERY' && config.deliveryConfig.mode === 'CONFIRM' ? 'A confirmar' : formatBRL(deliveryFee)} /></div><div className="mt-5 flex items-end justify-between"><span className="text-sm">Total previsto</span><strong className="text-3xl font-black text-[#ffcf3d]">{formatBRL(totalCents)}</strong></div></div>
        <p className="mt-3 text-[11px] leading-relaxed text-white/45">O servidor recalcula o valor com o cardápio atual antes de salvar o pedido.</p>
        <Button type="submit" disabled={submitting || !availability.acceptingOrders} className="mt-6 h-12 w-full rounded-full bg-[#d7f04a] font-black text-[#351924] hover:bg-[#c4dd36] disabled:bg-white/15 disabled:text-white/55">{submitting ? <><Loader2 className="animate-spin" /> Enviando…</> : !availability.acceptingOrders ? <><Clock3 /> Loja fechada</> : <><CheckCircle2 /> Confirmar pedido</>}</Button>
        {!availability.acceptingOrders && <p className="mt-3 text-center text-xs text-white/60">Seu carrinho ficará salvo para a próxima abertura.</p>}
      </div></aside>
    </form>
  </main>;
}

function CheckoutSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <section className="mt-5 rounded-[28px] bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-2">{icon}<h2 className="text-xl font-black">{title}</h2></div>{children}</section>;
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, name, ...input } = props;
  return <label className="block text-sm font-bold">{label}<input name={name} {...input} className="mt-2 h-12 w-full rounded-2xl border border-[#82204f]/15 bg-[#fffaf5] px-4 font-normal outline-none focus:border-[#82204f] focus:ring-2 focus:ring-[#82204f]/15" /></label>;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4"><dt className="text-white/55">{label}</dt><dd className="text-right font-bold text-white">{value}</dd></div>;
}

function parseCurrencyToCents(value: string): number | null {
  const normalized = value.trim().replace(/[^\d,.]/g, '');
  if (!normalized) return null;
  const decimal = normalized.includes(',') ? normalized.replace(/\./g, '').replace(',', '.') : normalized;
  const amount = Number(decimal);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}
