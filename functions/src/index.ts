import { createHash, randomBytes } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { configuredMode } from './integration/provider.js';
import { processIntegration } from './integration/service.js';
import { customerIntegrationMessage } from '../../shared/integration.js';
export { getIntegrationReadiness, saveIntegrationMappings, retryOrderIntegration } from './integration/admin.js';

import {
  calculateCartPreview,
  calculateDeliveryFee,
  formatNextOpening,
  getStoreAvailability,
  normalizePhone,
  ORDER_TRANSITIONS,
  type CatalogSnapshot,
  type OrderStatus,
  type Role,
  type StorePublicConfig,
} from '../../shared/domain.js';

if (!getApps().length) initializeApp();
const db = getFirestore();
const region = 'southamerica-east1';
const enforceAppCheck = process.env.ENFORCE_APP_CHECK === 'true';

const selectionSchema = z.object({ groupId: z.string().min(1).max(100), items: z.array(z.object({ modifierId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(20) })).max(60) });
const itemSchema = z.object({ productId: z.string().min(1).max(100), sizeId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(20), selections: z.array(selectionSchema).max(30), notes: z.string().trim().max(300).optional() });
export const createOrderSchema = z.object({
  clientRequestId: z.uuid(),
  source: z.enum(['WEB', 'QR', 'TABLET', 'TOTEM']).default('WEB'),
  customer: z.object({ name: z.string().trim().min(2).max(80), whatsapp: z.string().min(8).max(30), address: z.object({ street: z.string().trim().min(2).max(120), number: z.string().trim().min(1).max(20), complement: z.string().trim().max(80).optional(), neighborhood: z.string().trim().min(2).max(80), reference: z.string().trim().max(120).optional() }).optional() }),
  items: z.array(itemSchema).min(1).max(30),
  fulfillment: z.object({ mode: z.enum(['PICKUP', 'DELIVERY']), zoneId: z.string().max(100).optional() }),
  payment: z.object({ method: z.enum(['PIX', 'CARD', 'CASH']), needsChange: z.boolean(), changeForCents: z.number().int().min(0).max(1_000_000).optional() }),
  notes: z.string().trim().max(500).optional(),
  clientPreviewTotalCents: z.number().int().min(0).max(10_000_000).optional(),
}).superRefine((value, context) => {
  if (value.fulfillment.mode === 'DELIVERY' && !value.customer.address) context.addIssue({ code: 'custom', message: 'Endereço obrigatório para delivery.', path: ['customer', 'address'] });
  if (value.payment.method !== 'CASH' && (value.payment.needsChange || value.payment.changeForCents !== undefined)) context.addIssue({ code: 'custom', message: 'Troco só pode ser informado para dinheiro.', path: ['payment', 'needsChange'] });
  if (value.payment.method === 'CASH' && value.payment.needsChange && value.payment.changeForCents === undefined) context.addIssue({ code: 'custom', message: 'Informe para quanto precisa de troco.', path: ['payment', 'changeForCents'] });
  if (value.payment.method === 'CASH' && !value.payment.needsChange && value.payment.changeForCents !== undefined) context.addIssue({ code: 'custom', message: 'Remova o valor do troco ou marque que precisa de troco.', path: ['payment', 'changeForCents'] });
});

async function loadCatalog(): Promise<{ catalog: CatalogSnapshot; config: StorePublicConfig }> {
  const [configSnap, productsSnap, categoriesSnap, groupsSnap, modifiersSnap] = await Promise.all([
    db.doc('storePublicConfig/main').get(), db.collection('products').get(), db.collection('categories').get(), db.collection('modifierGroups').get(), db.collection('modifiers').get(),
  ]);
  if (!configSnap.exists) throw new HttpsError('failed-precondition', 'Loja ainda não configurada.');
  return {
    config: configSnap.data() as StorePublicConfig,
    catalog: {
      products: productsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as CatalogSnapshot['products'],
      categories: categoriesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as CatalogSnapshot['categories'],
      groups: groupsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as CatalogSnapshot['groups'],
      modifiers: modifiersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as CatalogSnapshot['modifiers'],
    },
  };
}

function makeOrderNumber(now = new Date(), timeZone = 'America/Sao_Paulo'): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: '2-digit', month: '2-digit', day: '2-digit' }).format(now).replace(/-/g, '');
  return `#A${day}${randomBytes(2).toString('hex').toUpperCase()}`;
}
function makePublicCode(): string { return randomBytes(16).toString('base64url'); }
function requestIdFrom(data: unknown): string { return typeof data === 'object' && data && 'clientRequestId' in data ? String((data as { clientRequestId?: unknown }).clientRequestId).slice(0, 80) : 'unknown'; }

export const createOrder = onCall({ region, timeoutSeconds: 30, memory: '256MiB', enforceAppCheck }, async (request) => {
  const requestId = requestIdFrom(request.data);
  const parsed = createOrderSchema.safeParse(request.data);
  if (!parsed.success) { logger.warn('createOrder invalid payload', { requestId, issues: parsed.error.issues.map((issue) => issue.message) }); throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Pedido inválido.'); }
  const input = parsed.data;
  const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const existingRequest = await db.doc(`orderRequests/${input.clientRequestId}`).get();
  if (existingRequest.exists) {
    if (existingRequest.data()?.requestHash && existingRequest.data()?.requestHash !== requestHash) throw new HttpsError('already-exists', 'Esta tentativa já pertence a outro pedido. Confira seu pedido anterior.');
    const existing = await db.doc(`orders/${existingRequest.data()?.orderId}`).get();
    if (existing.exists) { const data = existing.data()!; return { orderNumber: data.orderNumber, publicCode: data.publicCode, subtotalCents: data.pricing.subtotalCents, deliveryFeeCents: data.pricing.deliveryFeeCents, totalCents: data.pricing.totalCents, idempotent: true }; }
  }

  const { catalog, config } = await loadCatalog();
  const requestTime = new Date();
  const availability = getStoreAvailability(requestTime, config);
  if (!availability.acceptingOrders) {
    const message = availability.reason === 'INACTIVE' || availability.reason === 'PAUSED'
      ? config.pauseMessage || 'Pedidos pausados pela loja.'
      : 'A loja está fechada para novos pedidos.';
    const nextOpening = availability.nextOpening ? ` Próxima abertura: ${formatNextOpening(availability.nextOpening)}.` : '';
    throw new HttpsError('failed-precondition', `${message}${nextOpening}`);
  }
  if (!config.fulfillmentModes.includes(input.fulfillment.mode)) throw new HttpsError('failed-precondition', 'Forma de recebimento indisponível.');
  if (!config.paymentMethods.includes(input.payment.method)) throw new HttpsError('failed-precondition', 'Forma de pagamento indisponível.');

  let cart;
  try { cart = calculateCartPreview(input.items.map((item, index) => ({ ...item, cartItemId: String(index) })), catalog); } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Cardápio inválido.';
    logger.warn('createOrder catalog validation rejected', { requestId, message }); throw new HttpsError('failed-precondition', message);
  }
  let deliveryFeeCents: number;
  try { deliveryFeeCents = calculateDeliveryFee(config.deliveryConfig, input.fulfillment.mode, input.fulfillment.zoneId); } catch (cause) { throw new HttpsError('failed-precondition', cause instanceof Error ? cause.message : 'Delivery inválido.'); }
  const totalCents = cart.subtotalCents + deliveryFeeCents;
  if (input.payment.method === 'CASH' && input.payment.needsChange && input.payment.changeForCents! < totalCents) {
    throw new HttpsError('invalid-argument', 'O valor para troco precisa ser igual ou maior que o total do pedido.');
  }
  if (input.clientPreviewTotalCents !== undefined && input.clientPreviewTotalCents !== totalCents) {
    logger.info('createOrder price changed', { requestId, preview: input.clientPreviewTotalCents, canonical: totalCents });
    throw new HttpsError('failed-precondition', `O cardápio mudou. O novo total é ${(totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Revise e confirme novamente.`);
  }
  let whatsapp: string;
  try { whatsapp = normalizePhone(input.customer.whatsapp); } catch (cause) { throw new HttpsError('invalid-argument', cause instanceof Error ? cause.message : 'WhatsApp inválido.'); }

  const orderRef = db.collection('orders').doc();
  const requestRef = db.doc(`orderRequests/${input.clientRequestId}`);
  const orderNumber = makeOrderNumber(requestTime, config.timezone);
  const publicCode = makePublicCode();
  const now = FieldValue.serverTimestamp();
  const orderData = {
    orderNumber, publicCode, createdAt: now, updatedAt: now,
    customer: { name: input.customer.name, whatsapp, ...(input.fulfillment.mode === 'DELIVERY' ? { address: input.customer.address } : {}) },
    items: cart.items,
    fulfillment: { ...input.fulfillment, deliveryFeePending: input.fulfillment.mode === 'DELIVERY' && config.deliveryConfig.mode === 'CONFIRM' },
    payment: input.payment,
    pricing: { subtotalCents: cart.subtotalCents, deliveryFeeCents, totalCents, currency: 'BRL' },
    status: 'NEW' as OrderStatus,
    source: input.source,
    integration: { provider: configuredMode(), status: 'PENDING', attemptCount: 0 },
    notes: input.notes ?? '',
    statusHistory: [{ status: 'NEW', at: Timestamp.now(), actor: 'customer' }],
    clientRequestId: input.clientRequestId,
  };
  let finalOrderId = orderRef.id;
  await db.runTransaction(async (transaction) => {
    const idempotency = await transaction.get(requestRef);
    if (idempotency.exists) {
      if (idempotency.data()?.requestHash && idempotency.data()?.requestHash !== requestHash) throw new HttpsError('already-exists', 'Tentativa já usada com outro conteúdo.');
      finalOrderId = idempotency.data()?.orderId as string; return;
    }
    transaction.create(orderRef, orderData);
    transaction.create(requestRef, { orderId: orderRef.id, requestHash, createdAt: now });
  });
  if (finalOrderId !== orderRef.id) {
    const existing = await db.doc(`orders/${finalOrderId}`).get(); const data = existing.data();
    if (!data) throw new HttpsError('internal', 'Falha ao recuperar pedido idempotente.');
    return { orderNumber: data.orderNumber, publicCode: data.publicCode, subtotalCents: data.pricing.subtotalCents, deliveryFeeCents: data.pricing.deliveryFeeCents, totalCents: data.pricing.totalCents, idempotent: true };
  }
  logger.info('createOrder completed', { requestId, orderId: orderRef.id, status: 'NEW' });
  return { orderNumber, publicCode, subtotalCents: cart.subtotalCents, deliveryFeeCents, totalCents, idempotent: false };
});

const publicCodeSchema = z.object({ publicCode: z.string().min(20).max(80).regex(/^[A-Za-z0-9_-]+$/) });
export const getPublicOrder = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  const parsed = publicCodeSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Código inválido.');
  const snapshot = await db.collection('orders').where('publicCode', '==', parsed.data.publicCode).limit(1).get();
  if (snapshot.empty) throw new HttpsError('not-found', 'Pedido não encontrado.');
  const data = snapshot.docs[0].data();
  return { orderNumber: data.orderNumber, createdAt: data.createdAt?.toDate?.().toISOString(), updatedAt: data.updatedAt?.toDate?.().toISOString(), items: data.items, fulfillment: { mode: data.fulfillment.mode }, pricing: data.pricing, status: data.status, integrationMessage: customerIntegrationMessage(data.integration) };
});

async function requireRole(uid: string | undefined, allowed: Role[]): Promise<Role> {
  if (!uid) throw new HttpsError('unauthenticated', 'Entre novamente no painel.');
  const snapshot = await db.doc(`users/${uid}`).get();
  const role = snapshot.data()?.role as Role | undefined;
  if (!role || !allowed.includes(role)) throw new HttpsError('permission-denied', 'Usuário sem permissão.');
  return role;
}
const updateStatusSchema = z.object({ orderId: z.string().min(1).max(128), status: z.enum(['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']), reason: z.string().trim().max(300).optional() });
export const updateOrderStatus = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  const role = await requireRole(request.auth?.uid, ['admin', 'staff']);
  const parsed = updateStatusSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Status inválido.');
  const { orderId, status, reason } = parsed.data;
  const orderRef = db.doc(`orders/${orderId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
    if (snapshot.data()?.integration?.provider === 'saipos') throw new HttpsError('failed-precondition', 'Operação e cancelamento devem ser realizados no Saipos. Sincronização de status ainda não homologada.');
    const current = snapshot.data()?.status as OrderStatus;
    if (!ORDER_TRANSITIONS[current]?.includes(status)) throw new HttpsError('failed-precondition', `Transição ${current} → ${status} não permitida.`);
    transaction.update(orderRef, { status, updatedAt: FieldValue.serverTimestamp(), statusHistory: FieldValue.arrayUnion({ status, at: Timestamp.now(), actorUid: request.auth!.uid, actorRole: role, ...(reason ? { reason } : {}) }), ...(status === 'CANCELLED' ? { cancelledAt: FieldValue.serverTimestamp(), cancellationReason: reason || '' } : {}) });
  });
  logger.info('updateOrderStatus completed', { orderId, status, actorUid: request.auth?.uid });
  return { ok: true };
});

export const integrateCreatedOrder = onDocumentCreated({ document: 'orders/{orderId}', region, retry: true }, async (event) => { if (event.data?.data().integration) await processIntegration(event.params.orderId); });
export const recoverOrderIntegrations = onSchedule({ schedule: 'every 5 minutes', region }, async () => {
  // Bounded work per run; composite index is versioned in firestore.indexes.json.
  for (const status of ['PENDING', 'SENDING', 'ERROR']) {
    const pending = await db.collection('orders').where('integration.status', '==', status).orderBy('updatedAt').limit(25).get();
    for (const order of pending.docs) {
      await processIntegration(order.id);
      // Rotate deferred/permanent entries so they cannot starve later records.
      await order.ref.update({ updatedAt: FieldValue.serverTimestamp() });
    }
  }
});

// Renderiza o frontend Vinext no Firebase Functions; o Hosting serve os assets
// estáticos diretamente e encaminha apenas as rotas da aplicação para cá.
export const web = onRequest({ region, timeoutSeconds: 30, memory: '512MiB', minInstances: 0 }, async (req, res) => {
  const modulePath = '../../site-server/index.js';
  const siteModule = await import(modulePath) as { default: { fetch: (request: Request, env?: Record<string, unknown>, context?: Record<string, unknown>) => Promise<Response> } };
  const protocol = req.get('x-forwarded-proto')?.split(',')[0] || req.protocol || 'https';
  const host = req.get('host') || 'localhost';
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  const requestInit: RequestInit & { duplex?: 'half' } = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method)) {
    const body = new ArrayBuffer(req.rawBody.byteLength);
    new Uint8Array(body).set(req.rawBody);
    requestInit.body = body;
    requestInit.duplex = 'half';
  }
  const response = await siteModule.default.fetch(new Request(`${protocol}://${host}${req.originalUrl}`, requestInit), {}, { waitUntil: (promise: Promise<unknown>) => promise.catch((cause) => logger.error('web waitUntil failed', cause)) });
  res.status(response.status);
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.send(Buffer.from(await response.arrayBuffer()));
});
