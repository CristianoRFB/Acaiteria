import { randomUUID } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { emptyMappings, type IntegrationState, type IntegrationMappings } from '../../../shared/integration.js';
import { IntegrationError, MAX_ATTEMPTS, missingMappings, providerFor, retryDelay, safeError, type ProviderOrder } from './provider.js';

// The persisted integration field is the outbox. Claims are atomic and never silently expire into a replay.
export async function processIntegration(orderId: string): Promise<IntegrationState | null> {
  const db = getFirestore();
  const ref = db.doc(`orders/${orderId}`);
  const correlationId = randomUUID();
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const order = snap.data()!;
    const state = order.integration as IntegrationState | undefined;
    if (!state || state.status === 'ACCEPTED' || state.status === 'UNKNOWN' || order.status === 'CANCELLED') return null;
    if (state.provider === 'disabled') {
      tx.update(ref, { 'integration.status': 'DISABLED', 'integration.retryable': false, 'integration.message': 'Pedido salvo internamente. Integração externa desabilitada.', updatedAt: FieldValue.serverTimestamp() });
      return null;
    }
    if (state.status === 'SENDING') {
      if ((state.leaseUntilMs ?? 0) < Date.now()) {
        tx.update(ref, { 'integration.status': 'UNKNOWN', 'integration.retryable': false, 'integration.errorCode': 'LEASE_EXPIRED', 'integration.message': 'Tentativa interrompida. Reconcilie antes de reenviar.', updatedAt: FieldValue.serverTimestamp() });
      }
      return null;
    }
    if (state.status === 'ERROR' && (!state.retryable || (state.nextAttemptAtMs ?? 0) > Date.now())) return null;
    if (state.attemptCount >= MAX_ATTEMPTS) return null;
    const next: IntegrationState = { ...state, status: 'SENDING', attemptCount: state.attemptCount + 1, retryable: false, leaseUntilMs: Date.now() + 60_000 };
    tx.update(ref, { integration: next, updatedAt: FieldValue.serverTimestamp() });
    tx.create(ref.collection('integrationAttempts').doc(String(next.attemptCount)), { provider: state.provider, attempt: next.attemptCount, correlationId, status: 'SENDING', startedAt: FieldValue.serverTimestamp() });
    return { order: { ...order, id: orderId } as unknown as ProviderOrder, state: next };
  });
  if (!claimed) return ((await ref.get()).data()?.integration as IntegrationState | undefined) ?? null;
  let result: Partial<IntegrationState>;
  let mappingSnapshot: IntegrationMappings | undefined;
  try {
    const provider = providerFor(claimed.state.provider);
    if (provider.mode === 'saipos') {
      const mappingDoc = await db.doc('integrationConfig/saipos').get();
      const mappings = (mappingDoc.data()?.mappings ?? emptyMappings()) as IntegrationMappings;
      const missing = missingMappings(claimed.order, mappings);
      if (missing.length) throw new IntegrationError('MAPPING_MISSING', 'PERMANENT', `Mapeamentos ausentes: ${missing.slice(0, 12).join(', ')}`);
      mappingSnapshot = mappings;
    }
    const accepted = await provider.submitOrder(claimed.order, claimed.state.attemptCount);
    result = { status: 'ACCEPTED', externalOrderId: accepted.externalOrderId, retryable: false, message: provider.mode === 'local' ? 'Aceite simulado no emulador.' : 'Recebido pelo provider.' };
  } catch (cause) {
    const error = safeError(cause);
    const retryable = error.category === 'TRANSIENT' && claimed.state.provider === 'local' && claimed.state.attemptCount < MAX_ATTEMPTS;
    result = { status: error.category === 'UNKNOWN' ? 'UNKNOWN' : 'ERROR', errorCode: error.code, message: error.message, retryable, ...(retryable ? { nextAttemptAtMs: Date.now() + retryDelay(claimed.state.attemptCount) } : {}) };
  }
  const final: IntegrationState = { provider: claimed.state.provider, attemptCount: claimed.state.attemptCount, status: 'ERROR', ...result };
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.data()?.integration?.attemptCount !== final.attemptCount || snap.data()?.integration?.status !== 'SENDING') return;
    tx.update(ref, { integration: final, updatedAt: FieldValue.serverTimestamp() });
    tx.update(ref.collection('integrationAttempts').doc(String(final.attemptCount)), { ...result, finishedAt: FieldValue.serverTimestamp(), ...(mappingSnapshot ? { mappingSnapshot } : {}) });
  });
  logger.info('order integration result', { orderId, provider: final.provider, attempt: final.attemptCount, correlationId, status: final.status, errorCode: final.errorCode ?? null });
  return final;
}
