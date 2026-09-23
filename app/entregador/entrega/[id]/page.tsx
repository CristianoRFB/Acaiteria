'use client';

import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Navigation,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import {
  deliveryStatusLabels,
  deliveryStatusMessage,
  type DeliveryRecord,
} from '@/shared/delivery';

interface DeliveryRow extends DeliveryRecord {
  id: string;
}

export default function DriverDeliveryPage() {
  const { user, role, loading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [delivery, setDelivery] = useState<DeliveryRow | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const [showFailure, setShowFailure] = useState(false);
  useEffect(() => {
    if (!hasFirebaseConfig || !user || role !== 'driver' || !id)
      return undefined;
    return onSnapshot(
      doc(getFirebaseClient().db, 'deliveries', id),
      (snapshot) =>
        setDelivery(
          snapshot.exists()
            ? ({ id: snapshot.id, ...snapshot.data() } as DeliveryRow)
            : null,
        ),
      () => setError('Não foi possível carregar esta entrega.'),
    );
  }, [id, role, user]);
  useEffect(() => {
    if (!loading && (!user || role !== 'driver'))
      window.location.href = '/entregador/login';
  }, [loading, role, user]);
  async function call(name: string, payload: Record<string, string>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await httpsCallable(getFirebaseClient().functions, name)(payload);
      setNotice('Atualização salva.');
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atualizar a entrega.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function reportFailure() {
    if (failureReason.trim().length < 3) {
      setError('Descreva o motivo da falha.');
      return;
    }
    const succeeded = await call('reportDeliveryFailure', {
      deliveryId: delivery?.id ?? '',
      reason: failureReason.trim(),
    });
    if (succeeded) {
      setShowFailure(false);
      setFailureReason('');
    }
  }
  if (loading || !user || role !== 'driver')
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8f7ff] p-6 text-center">
        <p className="text-sm font-bold text-[#6f6878]">Carregando entrega…</p>
      </main>
    );
  if (!delivery)
    return (
      <main className="min-h-screen bg-[#f8f7ff] p-5">
        <a href="/entregador" className="font-bold text-[#6f2bc5]">
          ← Voltar
        </a>
        <div className="mx-auto mt-16 max-w-md rounded-3xl bg-white p-8 text-center">
          <h1 className="text-xl font-black">Entrega não encontrada</h1>
          <p className="mt-2 text-sm text-[#6f6878]">
            Ela pode ter sido cancelada ou atribuída a outro entregador.
          </p>
        </div>
      </main>
    );
  const address = delivery.address
    ? `${delivery.address.street}, ${delivery.address.number} - ${delivery.address.neighborhood}`
    : 'Endereço não informado';
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const canAccept = delivery.status === 'ASSIGNED';
  const canStart = delivery.status === 'ACCEPTED';
  const canArrive = delivery.status === 'ON_THE_WAY';
  const canConfirm = delivery.status === 'ARRIVED';
  return (
    <main className="min-h-screen bg-[#f8f7ff] pb-8 text-[#171521]">
      <header className="border-b border-[#e5e1ed] bg-white px-5 py-5">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <a
            href="/entregador"
            aria-label="Voltar"
            className="grid size-10 place-items-center rounded-full text-[#6f2bc5] hover:bg-[#f3ecfa]"
          >
            <ArrowLeft className="size-5" />
          </a>
          <div>
            <h1 className="text-2xl font-black">
              {delivery.status === 'ASSIGNED'
                ? 'Nova entrega'
                : 'Entrega em andamento'}
            </h1>
            <p className="text-sm text-[#6f6878]">
              Pedido {delivery.orderNumber}
            </p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 py-6 sm:px-8">
        <span className="inline-flex rounded-full bg-[#eee3fb] px-3 py-1 text-xs font-black text-[#6f2bc5]">
          {deliveryStatusLabels[delivery.status]}
        </span>
        <section className="mt-4 rounded-3xl bg-[#2f153d] p-5 text-white">
          <p className="text-xs font-black uppercase tracking-widest text-[#d8c2e9]">
            Destino
          </p>
          <h2 className="mt-3 text-2xl font-black">{delivery.customerName}</h2>
          <p className="mt-2 text-base text-white/85">{address}</p>
          {delivery.address?.complement && (
            <p className="mt-1 text-sm text-white/65">
              {delivery.address.complement}
            </p>
          )}
          {delivery.address?.reference && (
            <p className="mt-1 text-sm text-white/65">
              Referência: {delivery.address.reference}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#3270d8] px-4 text-sm font-black text-white"
            >
              <Navigation className="size-4" /> Abrir navegação
            </a>
            {delivery.customerWhatsapp && (
              <a
                href={`tel:${delivery.customerWhatsapp}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-black text-white"
              >
                <Phone className="size-4" /> Ligar
              </a>
            )}
          </div>
        </section>
        <div className="mt-4 rounded-3xl border border-[#e5e1ed] bg-white p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#e4f7ed] text-[#1d9560]">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className="font-black">Código de recebimento</h2>
              <p className="mt-1 text-sm leading-relaxed text-[#6f6878]">
                Peça os 4 dígitos ao cliente somente depois de chegar. O código
                não fica visível nesta tela.
              </p>
            </div>
          </div>
        </div>
        {(error || notice) && (
          <p
            role={error ? 'alert' : 'status'}
            className={`mt-4 rounded-2xl p-4 text-sm font-bold ${error ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}
          >
            {error || notice}
          </p>
        )}
        {showFailure && (
          <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-5">
            <label className="block text-sm font-black text-red-900">
              O que aconteceu?
              <textarea
                value={failureReason}
                onChange={(event) => setFailureReason(event.target.value)}
                maxLength={300}
                rows={3}
                className="mt-3 w-full rounded-xl border border-red-200 bg-white p-3 text-sm outline-none focus:border-red-500"
                placeholder="Ex.: cliente não estava no endereço"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <Button
                disabled={busy}
                onClick={() => void reportFailure()}
                className="min-h-11 flex-1 rounded-full bg-red-700 text-white"
              >
                {busy ? 'Registrando…' : 'Registrar falha'}
              </Button>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => setShowFailure(false)}
                className="min-h-11 rounded-full"
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
        <p className="mt-5 text-sm text-[#6f6878]">
          {deliveryStatusMessage(delivery.status)}
        </p>
        <div className="mt-5 space-y-2">
          {canAccept && (
            <>
              <Button
                disabled={busy}
                onClick={() =>
                  void call('respondDelivery', {
                    deliveryId: delivery.id,
                    decision: 'ACCEPT',
                  })
                }
                className="min-h-12 w-full rounded-full bg-[#20a661] text-white"
              >
                {busy ? 'Salvando…' : 'Aceitar entrega'}
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  void call('respondDelivery', {
                    deliveryId: delivery.id,
                    decision: 'REJECT',
                  })
                }
                variant="outline"
                className="min-h-12 w-full rounded-full"
              >
                Agora não
              </Button>
            </>
          )}
          {canStart && (
            <Button
              disabled={busy}
              onClick={() =>
                void call('progressDelivery', {
                  deliveryId: delivery.id,
                  status: 'ON_THE_WAY',
                })
              }
              className="min-h-12 w-full rounded-full bg-[#6f2bc5] text-white"
            >
              Iniciar entrega
            </Button>
          )}
          {canArrive && (
            <Button
              disabled={busy}
              onClick={() =>
                void call('progressDelivery', {
                  deliveryId: delivery.id,
                  status: 'ARRIVED',
                })
              }
              className="min-h-12 w-full rounded-full bg-[#6f2bc5] text-white"
            >
              Cheguei ao local
            </Button>
          )}
          {(canArrive || canConfirm) && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => setShowFailure(true)}
              className="min-h-11 w-full rounded-full border-red-200 text-red-700"
            >
              <AlertTriangle className="size-4" /> Informar falha na entrega
            </Button>
          )}
          {canConfirm && (
            <div className="rounded-3xl border-2 border-[#d9c5ea] bg-white p-5">
              <label className="block text-sm font-black">
                Digite o código informado pelo cliente
                <input
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={4}
                  className="mt-3 h-14 w-full rounded-xl border border-[#e5e1ed] bg-[#f8f7ff] text-center font-mono text-3xl tracking-[.4em] outline-none focus:border-[#6f2bc5]"
                  placeholder="••••"
                />
              </label>
              <Button
                disabled={busy || code.length !== 4}
                onClick={() =>
                  void call('confirmDelivery', {
                    deliveryId: delivery.id,
                    code,
                  })
                }
                className="mt-4 min-h-12 w-full rounded-full bg-[#6f2bc5] text-white"
              >
                {busy ? 'Validando…' : 'Confirmar entrega'}
              </Button>
            </div>
          )}
          {['DELIVERED', 'CANCELLED', 'DELIVERY_FAILED'].includes(
            delivery.status,
          ) && (
            <div className="rounded-3xl bg-white p-6 text-center">
              <CheckCircle2 className="mx-auto size-8 text-[#1d9560]" />
              <p className="mt-2 font-black">
                Esta entrega não aceita novas ações.
              </p>
              <a
                href="/entregador"
                className="mt-4 inline-flex font-bold text-[#6f2bc5]"
              >
                Voltar para o início
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
