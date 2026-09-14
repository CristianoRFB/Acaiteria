'use client';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient } from '@/lib/firebase/client';
import type { IntegrationState } from '@/shared/integration';
export function IntegrationOrderPanel({ orderId, state }: { orderId: string; state?: IntegrationState }) {
  const { role } = useAuth();
  const [attempts, setAttempts] = useState<Array<{ id: string; status: string; message?: string; correlationId: string }>>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!role) return; return onSnapshot(query(collection(getFirebaseClient().db, 'orders', orderId, 'integrationAttempts'), orderBy('startedAt', 'desc')), (snapshot) => setAttempts(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as typeof attempts[number]))), () => setMessage('Histórico indisponível.')); }, [orderId, role]);
  async function retry() { setBusy(true); try { await httpsCallable(getFirebaseClient().functions, 'retryOrderIntegration')({ orderId }); setMessage('Solicitação processada. O servidor respeita o intervalo e os limites de tentativa.'); } catch { setMessage('Reenvio não permitido ou indisponível.'); } finally { setBusy(false); } }
  return <section className="my-5 rounded-2xl border bg-white p-5"><h2 className="text-lg font-black">Integração do pedido</h2><p>{state ? `${state.provider} · ${state.status} · ${state.attemptCount} tentativa(s)` : 'Pedido anterior à integração; operação local preservada.'}</p>{state?.message && <p className="mt-2 text-sm">{state.message}</p>}{state?.externalOrderId && <p className="mt-2 break-all text-sm">Referência externa: {state.externalOrderId}</p>}{state?.provider === 'saipos' && <p className="mt-2 text-sm">Status operacional e cancelamento devem ser conferidos no Saipos.</p>}{role === 'admin' && state?.retryable && <Button disabled={busy} onClick={retry} className="mt-3">Tentar integrar novamente</Button>}{message && <p role="status">{message}</p>}<details className="mt-3"><summary>Histórico de tentativas</summary>{attempts.map((attempt) => <p key={attempt.id} className="mt-2 break-all text-xs">#{attempt.id} · {attempt.status} · {attempt.message ?? 'Tentativa registrada'} · {attempt.correlationId}</p>)}</details></section>;
}
