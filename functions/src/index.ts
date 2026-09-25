import { createHash, randomInt, randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { configuredMode } from './integration/provider.js';
import { processIntegration } from './integration/service.js';
import { customerIntegrationMessage } from '../../shared/integration.js';
import { withBeverageOptions } from '../../shared/beverage-options.js';
export { getIntegrationReadiness, saveIntegrationMappings, retryOrderIntegration } from './integration/admin.js';

import {
  calculateCartPreview,
  calculateDeliveryFee,
  formatNextOpening,
  getStoreAvailability,
  getCustomerOrderStatusMessage,
  normalizePhone,
  ORDER_TRANSITIONS,
  type CatalogSnapshot,
  type OrderStatus,
  type PricedItem,
  type Role,
  type StorePublicConfig,
} from '../../shared/domain.js';
import { canTransitionDelivery, deliveryStatusMessage, recordDeliveryCodeFailure, type DeliveryStatus } from '../../shared/delivery.js';

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
    catalog: withBeverageOptions({
      products: productsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as CatalogSnapshot['products'],
      categories: categoriesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as CatalogSnapshot['categories'],
      groups: groupsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as CatalogSnapshot['groups'],
      modifiers: modifiersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as CatalogSnapshot['modifiers'],
    }),
  };
}

function makeOrderNumber(now = new Date(), timeZone = 'America/Sao_Paulo'): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: '2-digit', month: '2-digit', day: '2-digit' }).format(now).replace(/-/g, '');
  return `#A${day}${randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}
function makePublicCode(): string { return randomUUID().replace(/-/g, ''); }
function makeDeliveryCode(): string { return String(randomInt(1000, 10000)); }
function hashDeliveryCode(code: string): string { return createHash('sha256').update(code).digest('hex'); }
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
    pricingVerification: { status: 'VERIFIED', source: 'SERVER' },
    status: 'NEW' as OrderStatus,
    source: input.source,
    integration: { provider: configuredMode(), status: 'PENDING', attemptCount: 0 },
    notes: input.notes ?? '',
    statusHistory: [{ status: 'NEW', at: Timestamp.now(), actor: 'customer' }],
    clientRequestId: input.clientRequestId,
    estimatedMinutes: Math.min(240, Math.max(5, config.orderEstimateMinutes ?? 15)),
  };
  let finalOrderId = orderRef.id;
  await db.runTransaction(async (transaction) => {
    const idempotency = await transaction.get(requestRef);
    if (idempotency.exists) {
      if (idempotency.data()?.requestHash && idempotency.data()?.requestHash !== requestHash) throw new HttpsError('already-exists', 'Tentativa já usada com outro conteúdo.');
      finalOrderId = idempotency.data()?.orderId as string; return;
    }
    transaction.create(orderRef, orderData);
    transaction.create(db.doc(`publicOrders/${publicCode}`), { orderNumber, publicCode, createdAt: now, updatedAt: now, items: cart.items, fulfillment: { mode: input.fulfillment.mode }, pricing: { totalCents }, status: 'NEW', statusMessage: getCustomerOrderStatusMessage('NEW'), estimatedMinutes: orderData.estimatedMinutes, pricingReviewStatus: 'VERIFIED', integrationMessage: 'Pedido recebido pela loja. Não envie outro pedido.' });
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
  const history = Array.isArray(data.statusHistory) ? data.statusHistory as Array<{ status?: OrderStatus; reason?: string; at?: Timestamp }> : [];
  const latest = history[history.length - 1];
  return { orderNumber: data.orderNumber, publicCode: data.publicCode, createdAt: data.createdAt?.toDate?.().toISOString(), updatedAt: data.updatedAt?.toDate?.().toISOString(), estimatedMinutes: data.estimatedMinutes ?? 15, items: data.items, fulfillment: { mode: data.fulfillment.mode }, pricing: data.pricing, status: data.status, statusMessage: getCustomerOrderStatusMessage(data.status as OrderStatus, latest?.reason), integrationMessage: customerIntegrationMessage(data.integration), editProposal: data.editProposal };
});

async function requireRole(uid: string | undefined, allowed: Role[]): Promise<Role> {
  if (!uid) throw new HttpsError('unauthenticated', 'Entre novamente no painel.');
  const snapshot = await db.doc(`users/${uid}`).get();
  if (!snapshot.exists || snapshot.data()?.active === false) throw new HttpsError('permission-denied', 'Esta conta está desativada. Entre em contato com a loja.');
  const role = snapshot.data()?.role as Role | undefined;
  if (!role || !allowed.includes(role)) throw new HttpsError('permission-denied', 'Usuário sem permissão.');
  return role;
}

const cashOperationSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('OPEN'), clientRequestId: z.uuid(), initialBalanceCents: z.number().int().min(0).max(100_000_000), openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().trim().max(300).optional() }),
  z.object({ operation: z.literal('MOVEMENT'), clientRequestId: z.uuid(), registerId: z.string().min(1).max(128), type: z.enum(['WITHDRAWAL', 'SUPPLY']), amountCents: z.number().int().positive().max(100_000_000), note: z.string().trim().min(1).max(300) }),
  z.object({ operation: z.literal('LOCAL_SALE'), clientRequestId: z.uuid(), registerId: z.string().min(1).max(128), amountCents: z.number().int().positive().max(100_000_000), paymentMethod: z.enum(['PIX', 'CARD', 'CASH', 'OTHER']), description: z.string().trim().min(1).max(120), orderNumber: z.string().trim().max(40).optional(), note: z.string().trim().max(300).optional() }),
  z.object({ operation: z.literal('CLOSE'), registerId: z.string().min(1).max(128), countedCashCents: z.number().int().min(0).max(100_000_000), note: z.string().trim().max(300).optional() }),
]);

const financeEntrySchema = z.object({
  id: z.string().min(1).max(128).optional(),
  clientRequestId: z.uuid(),
  kind: z.enum(['INCOME', 'EXPENSE']),
  category: z.enum(['Vendas de açaí', 'Delivery', 'Insumos', 'Embalagens', 'Taxas', 'Estornos', 'Pró-labore', 'Outros']),
  description: z.string().trim().min(1).max(120),
  amountCents: z.number().int().positive().max(100_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['PAID', 'PENDING']),
  orderNumber: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(300).optional(),
});

export const saveFinanceEntry = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['admin']);
  const parsed = financeEntrySchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Lançamento financeiro inválido.');
  const input = parsed.data;
  const requestFingerprint = JSON.stringify({
    kind: input.kind,
    category: input.category,
    description: input.description,
    amountCents: input.amountCents,
    date: input.date,
    status: input.status,
    orderNumber: input.orderNumber || null,
    notes: input.notes || null,
  });
  const entryRef = input.id ? db.doc(`financeEntries/${input.id}`) : db.doc(`financeEntries/manual-${input.clientRequestId}`);
  let idempotent = false;
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(entryRef);
    if (input.id && !existing.exists) throw new HttpsError('not-found', 'Lançamento não encontrado.');
    if (!input.id && existing.exists) {
      if (existing.data()?.clientRequestId === input.clientRequestId && existing.data()?.requestFingerprint === requestFingerprint) { idempotent = true; return; }
      throw new HttpsError('already-exists', 'Esta tentativa já foi registrada com outros dados. Confira a lista antes de criar outro lançamento.');
    }
    if (existing.exists && (existing.data()?.sourceOrderId || existing.data()?.sourceLocalSaleId)) throw new HttpsError('failed-precondition', 'Lançamentos automáticos não podem ser editados manualmente.');
    const now = FieldValue.serverTimestamp();
    const updatedByUid = request.auth!.uid;
    const updatedByEmail = typeof request.auth?.token.email === 'string' ? request.auth.token.email : null;
    const entry = { kind: input.kind, category: input.category, description: input.description, amountCents: input.amountCents, date: input.date, status: input.status, orderNumber: input.orderNumber || null, notes: input.notes || null, clientRequestId: input.clientRequestId, requestFingerprint, updatedByUid, updatedByEmail, updatedAt: now };
    if (existing.exists) transaction.update(entryRef, entry);
    else transaction.create(entryRef, { ...entry, createdByUid: updatedByUid, createdAt: now });
  });
  return { entryId: entryRef.id, updated: Boolean(input.id), idempotent };
});

const financeStatusSchema = z.object({ id: z.string().min(1).max(128), status: z.enum(['PAID', 'PENDING']) });
export const updateFinanceStatus = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['admin']);
  const parsed = financeStatusSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Situação financeira inválida.');
  const entryRef = db.doc(`financeEntries/${parsed.data.id}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(entryRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Lançamento não encontrado.');
    if (snapshot.data()?.sourceOrderId || snapshot.data()?.sourceLocalSaleId) throw new HttpsError('failed-precondition', 'Lançamentos automáticos não podem ser alterados manualmente.');
    transaction.update(entryRef, { status: parsed.data.status, updatedByUid: request.auth!.uid, updatedByEmail: typeof request.auth?.token.email === 'string' ? request.auth.token.email : null, updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

export const operateCashRegister = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['admin', 'staff']);
  const parsed = cashOperationSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Operação de caixa inválida.');
  const input = parsed.data;
  const uid = request.auth!.uid;
  const email = typeof request.auth?.token.email === 'string' ? request.auth.token.email : null;

  if (input.operation === 'OPEN') {
    const registerRef = db.doc(`cashRegisters/${input.clientRequestId}`);
    const openingRef = db.doc(`cashMovements/opening-${input.clientRequestId}`);
    const controlRef = db.doc('cashControl/main');
    const requestFingerprint = JSON.stringify({ initialBalanceCents: input.initialBalanceCents, openingDate: input.openingDate, note: input.note?.trim() || null });
    let idempotent = false;
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(registerRef);
      if (existing.exists) {
        if (existing.data()?.openingRequestId === input.clientRequestId && existing.data()?.operatorUid === uid && existing.data()?.requestFingerprint === requestFingerprint) { idempotent = true; return; }
        throw new HttpsError('already-exists', 'Esta tentativa de abertura já foi registrada com outros dados. Confira o caixa antes de iniciar outra tentativa.');
      }
      const control = await transaction.get(controlRef);
      const openId = String(control.data()?.openRegisterId ?? '');
      if (openId) {
        const openRegister = await transaction.get(db.doc(`cashRegisters/${openId}`));
        if (openRegister.exists && openRegister.data()?.status === 'OPEN') throw new HttpsError('failed-precondition', 'Já existe um caixa aberto.');
      }
      const now = FieldValue.serverTimestamp();
      transaction.create(registerRef, { status: 'OPEN', operatorUid: uid, operatorEmail: email, openingRequestId: input.clientRequestId, requestFingerprint, openingDate: input.openingDate, initialBalanceCents: input.initialBalanceCents, expectedCashCents: input.initialBalanceCents, note: input.note?.trim() || null, openedAt: now, updatedAt: now });
      transaction.create(openingRef, { registerId: registerRef.id, type: 'OPENING', direction: 'IN', amountCents: input.initialBalanceCents, cashAmountCents: input.initialBalanceCents, operatorUid: uid, operatorEmail: email, note: input.note?.trim() || 'Saldo inicial do caixa.', createdAt: now });
      transaction.set(controlRef, { openRegisterId: registerRef.id, updatedAt: now }, { merge: true });
    });
    return { registerId: registerRef.id, idempotent };
  }

  if (input.operation === 'MOVEMENT') {
    const registerRef = db.doc(`cashRegisters/${input.registerId}`);
    const movementRef = db.doc(`cashMovements/manual-${input.clientRequestId}`);
    const controlRef = db.doc('cashControl/main');
    const requestFingerprint = JSON.stringify({ registerId: input.registerId, type: input.type, amountCents: input.amountCents, note: input.note.trim() });
    let idempotent = false;
    await db.runTransaction(async (transaction) => {
      const existingMovement = await transaction.get(movementRef);
      if (existingMovement.exists) {
        if (existingMovement.data()?.clientRequestId === input.clientRequestId && existingMovement.data()?.requestFingerprint === requestFingerprint) { idempotent = true; return; }
        throw new HttpsError('already-exists', 'Esta movimentação já foi registrada com outros dados. Confira o caixa antes de tentar novamente.');
      }
      const register = await transaction.get(registerRef);
      if (!register.exists || register.data()?.status !== 'OPEN') throw new HttpsError('failed-precondition', 'Este caixa não está aberto para novas movimentações.');
      const control = await transaction.get(controlRef);
      if (String(control.data()?.openRegisterId ?? '') !== input.registerId) throw new HttpsError('failed-precondition', 'Este não é o caixa aberto atual.');
      const expected = Number(register.data()?.expectedCashCents ?? register.data()?.initialBalanceCents ?? 0);
      if (!Number.isSafeInteger(expected) || expected < 0 || (input.type === 'WITHDRAWAL' && input.amountCents > expected)) throw new HttpsError('failed-precondition', 'A sangria não pode ser maior que o dinheiro esperado no caixa.');
      const now = FieldValue.serverTimestamp();
      transaction.create(movementRef, { registerId: input.registerId, type: input.type, direction: input.type === 'SUPPLY' ? 'IN' : 'OUT', amountCents: input.amountCents, cashAmountCents: input.amountCents, clientRequestId: input.clientRequestId, requestFingerprint, operatorUid: uid, operatorEmail: email, note: input.note.trim(), createdAt: now });
      transaction.update(registerRef, { expectedCashCents: expected + (input.type === 'SUPPLY' ? input.amountCents : -input.amountCents), lastMovementAt: now, updatedAt: now });
    });
    return { movementId: movementRef.id, idempotent };
  }

  if (input.operation === 'LOCAL_SALE') {
    const saleRef = db.doc(`cashMovements/local-${input.clientRequestId}`);
    const financeRef = db.doc(`financeEntries/local-${input.clientRequestId}`);
    const registerRef = db.doc(`cashRegisters/${input.registerId}`);
    const controlRef = db.doc('cashControl/main');
    const requestFingerprint = JSON.stringify({ registerId: input.registerId, amountCents: input.amountCents, paymentMethod: input.paymentMethod, description: input.description.trim(), orderNumber: input.orderNumber?.trim() || null, note: input.note?.trim() || null });
    let idempotent = false;
    await db.runTransaction(async (transaction) => {
      const existingSale = await transaction.get(saleRef);
      const existingFinance = await transaction.get(financeRef);
      if (existingSale.exists) {
        if (existingSale.data()?.clientRequestId !== input.clientRequestId || existingSale.data()?.requestFingerprint !== requestFingerprint) {
          throw new HttpsError('already-exists', 'Esta venda já foi registrada com outros dados. Confira o Caixa e o Financeiro antes de iniciar outra tentativa.');
        }
        idempotent = true;
        if (!existingFinance.exists) {
          const saleData = existingSale.data()!;
          const amountCents = Number(saleData.amountCents ?? 0);
          transaction.create(financeRef, {
            kind: 'INCOME',
            category: 'Vendas locais',
            description: String(saleData.note || 'Venda local'),
            amountCents,
            date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
            status: 'PAID',
            orderNumber: saleData.orderNumber ?? null,
            sourceLocalSaleId: input.clientRequestId,
            paymentMethod: saleData.paymentMethod ?? 'OTHER',
            notes: 'Lançamento recuperado automaticamente.',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        return;
      }
      const register = await transaction.get(registerRef);
      if (!register.exists || register.data()?.status !== 'OPEN') throw new HttpsError('failed-precondition', 'Abra o Caixa antes de registrar uma venda local.');
      const control = await transaction.get(controlRef);
      if (String(control.data()?.openRegisterId ?? '') !== input.registerId) throw new HttpsError('failed-precondition', 'Este não é o Caixa aberto atual.');
      const expected = Number(register.data()?.expectedCashCents ?? register.data()?.initialBalanceCents ?? 0);
      const cashAmountCents = input.paymentMethod === 'CASH' ? input.amountCents : 0;
      if (!Number.isSafeInteger(expected) || expected < 0 || !Number.isSafeInteger(cashAmountCents)) throw new HttpsError('failed-precondition', 'O saldo esperado do Caixa é inválido.');
      const now = FieldValue.serverTimestamp();
      transaction.create(saleRef, {
        registerId: input.registerId,
        type: 'SALE',
        direction: 'IN',
        amountCents: input.amountCents,
        cashAmountCents,
        paymentMethod: input.paymentMethod,
        orderNumber: input.orderNumber?.trim() || null,
        sourceLocalSaleId: input.clientRequestId,
        clientRequestId: input.clientRequestId,
        requestFingerprint,
        operatorUid: uid,
        operatorEmail: email,
        note: input.description.trim(),
        details: input.note?.trim() || null,
        createdAt: now,
      });
      transaction.create(financeRef, {
        kind: 'INCOME',
        category: 'Vendas locais',
        description: input.description.trim(),
        amountCents: input.amountCents,
        date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
        status: 'PAID',
        orderNumber: input.orderNumber?.trim() || null,
        sourceLocalSaleId: input.clientRequestId,
        paymentMethod: input.paymentMethod,
        notes: input.note?.trim() || 'Venda registrada manualmente no Caixa.',
        createdAt: now,
        updatedAt: now,
      });
      transaction.update(registerRef, { expectedCashCents: expected + cashAmountCents, lastMovementAt: now, updatedAt: now });
    });
    return { movementId: saleRef.id, idempotent };
  }

  const registerRef = db.doc(`cashRegisters/${input.registerId}`);
  const closingRef = db.doc(`cashMovements/closing-${input.registerId}`);
  const controlRef = db.doc('cashControl/main');
  const requestFingerprint = JSON.stringify({ registerId: input.registerId, countedCashCents: input.countedCashCents, note: input.note?.trim() || null });
  let differenceCents = 0;
  await db.runTransaction(async (transaction) => {
    const register = await transaction.get(registerRef);
    const closing = await transaction.get(closingRef);
    if (closing.exists && register.exists && register.data()?.status === 'CLOSED') {
      if (closing.data()?.requestFingerprint !== requestFingerprint) throw new HttpsError('already-exists', 'O fechamento já foi registrado com outros valores. Confira o histórico antes de tentar novamente.');
      differenceCents = Number(closing.data()?.differenceCents ?? 0);
      return;
    }
    if (!register.exists || register.data()?.status !== 'OPEN') throw new HttpsError('failed-precondition', 'Este caixa já está fechado ou não foi encontrado.');
    const control = await transaction.get(controlRef);
    if (String(control.data()?.openRegisterId ?? '') !== input.registerId) throw new HttpsError('failed-precondition', 'Este não é o caixa aberto atual.');
    const expected = Number(register.data()?.expectedCashCents ?? register.data()?.initialBalanceCents ?? 0);
    if (!Number.isSafeInteger(expected) || expected < 0) throw new HttpsError('failed-precondition', 'O saldo esperado do Caixa está inválido. Revise as movimentações antes de fechar.');
    differenceCents = input.countedCashCents - expected;
    if (differenceCents !== 0 && !input.note?.trim()) throw new HttpsError('invalid-argument', 'Explique a diferença antes de confirmar o fechamento.');
    const now = FieldValue.serverTimestamp();
    transaction.update(registerRef, { status: 'CLOSED', closedAt: now, countedCashCents: input.countedCashCents, differenceCents, closingNote: input.note?.trim() || null, updatedAt: now });
    transaction.create(closingRef, { registerId: input.registerId, type: 'CLOSING', direction: 'OUT', amountCents: 0, cashAmountCents: 0, countedCashCents: input.countedCashCents, differenceCents, requestFingerprint, operatorUid: uid, operatorEmail: email, note: input.note?.trim() || 'Fechamento conferido.', createdAt: now });
    transaction.set(controlRef, { openRegisterId: null, updatedAt: now }, { merge: true });
  });
  return { differenceCents };
});

const verifyOrderPricingSchema = z.object({ orderId: z.string().min(1).max(128) });
export const verifyOrderPricing = onCall({ region, timeoutSeconds: 20, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['admin', 'staff']);
  const parsed = verifyOrderPricingSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Pedido inválido.');
  const orderRef = db.doc(`orders/${parsed.data.orderId}`);
  const snapshot = await orderRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
  const data = snapshot.data()!;
  if (data.pricingVerification?.status === 'VERIFIED' && data.pricingVerification?.source === 'SERVER') return { verified: true, alreadyVerified: true };
  if (['COMPLETED', 'CANCELLED'].includes(String(data.status))) throw new HttpsError('failed-precondition', 'Pedidos encerrados não podem ser revalidados.');
  if (data.customerEditApproval?.status === 'PENDING') throw new HttpsError('failed-precondition', 'Aguarde a resposta do cliente sobre a alteração pendente.');
  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 30) throw new HttpsError('failed-precondition', 'Não foi possível conferir os itens salvos. Edite os itens e peça a aprovação do cliente.');
  const catalogData = await loadCatalog();
  let canonicalItems: PricedItem[];
  let canonicalFee: number;
  try {
    const drafts = data.items.map((raw: Record<string, unknown>, index: number) => ({
      cartItemId: String(index),
      productId: String(raw.productId ?? ''),
      sizeId: String(raw.sizeId ?? ''),
      quantity: Number(raw.quantity),
      notes: typeof raw.notes === 'string' ? raw.notes : undefined,
      selections: Array.isArray(raw.modifierSelections) ? raw.modifierSelections.map((group: Record<string, unknown>) => ({
        groupId: String(group.groupId ?? ''),
        items: Array.isArray(group.items) ? group.items.map((item: Record<string, unknown>) => ({ modifierId: String(item.modifierId ?? ''), quantity: Number(item.quantity) })) : [],
      })) : [],
    }));
    canonicalItems = calculateCartPreview(drafts, catalogData.catalog).items;
    const mode = data.fulfillment?.mode === 'DELIVERY' ? 'DELIVERY' : data.fulfillment?.mode === 'PICKUP' ? 'PICKUP' : null;
    if (!mode || !catalogData.config.fulfillmentModes.includes(mode)) throw new Error('Forma de recebimento inválida.');
    canonicalFee = calculateDeliveryFee(catalogData.config.deliveryConfig, mode, data.fulfillment?.zoneId);
  } catch (cause) {
    throw new HttpsError('failed-precondition', cause instanceof Error ? `${cause.message} Edite os itens antes de continuar.` : 'Não foi possível validar o cardápio atual.');
  }
  const subtotalCents = canonicalItems.reduce((sum, item) => sum + item.totalPriceCents, 0);
  const totalCents = subtotalCents + canonicalFee;
  const oldPricing = data.pricing ?? {};
  if (oldPricing.subtotalCents !== subtotalCents || oldPricing.deliveryFeeCents !== canonicalFee || oldPricing.totalCents !== totalCents) {
    throw new HttpsError('failed-precondition', `O total salvo difere do cardápio atual. Total conferido: ${(totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Edite os itens e solicite a aprovação do cliente.`);
  }
  const pricing = { ...oldPricing, subtotalCents, deliveryFeeCents: canonicalFee, totalCents, currency: 'BRL' };
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(orderRef);
    if (!current.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
    if (current.data()?.pricingVerification?.status === 'VERIFIED' && current.data()?.pricingVerification?.source === 'SERVER') return;
    if (current.updateTime?.toMillis() !== snapshot.updateTime?.toMillis()) throw new HttpsError('aborted', 'O pedido mudou durante a conferência. Atualize a tela e tente novamente.');
    if (current.data()?.customerEditApproval?.status === 'PENDING') throw new HttpsError('failed-precondition', 'Aguarde a resposta do cliente sobre a alteração pendente.');
    transaction.update(orderRef, { items: canonicalItems, pricing, pricingVerification: { status: 'VERIFIED', source: 'SERVER', verifiedAt: FieldValue.serverTimestamp(), verifiedBy: request.auth!.uid }, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(db.doc(`publicOrders/${String(data.publicCode || parsed.data.orderId)}`), { items: canonicalItems, pricing: { totalCents }, pricingReviewStatus: 'VERIFIED', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { verified: true, alreadyVerified: false, totalCents };
});

const updateStatusSchema = z.object({ orderId: z.string().min(1).max(128), status: z.enum(['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']), reason: z.string().trim().max(300).optional() });
export const updateOrderStatus = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  const role = await requireRole(request.auth?.uid, ['admin', 'staff']);
  const parsed = updateStatusSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Status inválido.');
  const { orderId, status, reason } = parsed.data;
  const orderRef = db.doc(`orders/${orderId}`);
  const deliveryEventId = `delivery-${orderId}-${randomUUID()}`;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
    if (snapshot.data()?.integration?.provider === 'saipos') throw new HttpsError('failed-precondition', 'Operação e cancelamento devem ser realizados no Saipos. Sincronização de status ainda não homologada.');
    const current = snapshot.data()?.status as OrderStatus;
    if (snapshot.data()?.customerEditApproval?.status === 'PENDING') throw new HttpsError('failed-precondition', 'Aguardando a aprovação do cliente para continuar este pedido.');
    if (status !== 'CANCELLED' && (snapshot.data()?.pricingVerification?.status !== 'VERIFIED' || snapshot.data()?.pricingVerification?.source !== 'SERVER')) {
      throw new HttpsError('failed-precondition', 'Os preços deste pedido ainda não foram validados pelo servidor. Use “Validar preços” no painel antes de continuar.');
    }
    if (!ORDER_TRANSITIONS[current]?.includes(status)) throw new HttpsError('failed-precondition', `Transição ${current} → ${status} não permitida.`);
    let completionRegister: DocumentSnapshot | null = null;
    let completionFinance: DocumentSnapshot | null = null;
    let completionSale: DocumentSnapshot | null = null;
    let completionExpectedCashCents = 0;
    const deliveryRef = db.doc(`deliveries/delivery-${orderId}`);
    let existingDelivery: DocumentSnapshot | null = null;
    if (status === 'READY' || status === 'CANCELLED' || status === 'COMPLETED') existingDelivery = await transaction.get(deliveryRef);
    let assignedDriver: DocumentSnapshot | null = null;
    const assignedDriverId = String(existingDelivery?.data()?.driverId ?? '');
    if (status === 'CANCELLED' && assignedDriverId) assignedDriver = await transaction.get(db.doc(`deliveryDrivers/${assignedDriverId}`));
    const deliverySecretRef = db.doc(`deliverySecrets/${deliveryRef.id}`);
    if (status === 'COMPLETED' && snapshot.data()?.fulfillment?.mode === 'DELIVERY' && (!existingDelivery?.exists || existingDelivery.data()?.status !== 'DELIVERED')) {
      throw new HttpsError('failed-precondition', 'Confirme a entrega com o código do cliente antes de concluir este delivery.');
    }
    if (status === 'COMPLETED') {
      const totalCents = Number(snapshot.data()?.pricing?.totalCents ?? 0);
      if (!Number.isSafeInteger(totalCents) || totalCents <= 0) throw new HttpsError('failed-precondition', 'O pedido precisa ter um total válido para ser concluído.');
      const control = await transaction.get(db.doc('cashControl/main'));
      const registerId = String(control.data()?.openRegisterId ?? '');
      if (!registerId) throw new HttpsError('failed-precondition', 'Abra o Caixa antes de concluir o pedido.');
      completionRegister = await transaction.get(db.doc(`cashRegisters/${registerId}`));
      if (!completionRegister.exists || completionRegister.data()?.status !== 'OPEN') throw new HttpsError('failed-precondition', 'Abra o Caixa antes de concluir o pedido.');
      completionExpectedCashCents = Number(completionRegister.data()?.expectedCashCents ?? completionRegister.data()?.initialBalanceCents ?? 0);
      if (!Number.isSafeInteger(completionExpectedCashCents) || completionExpectedCashCents < 0) throw new HttpsError('failed-precondition', 'O saldo esperado do Caixa está inválido. Revise as movimentações antes de concluir o pedido.');
      completionFinance = await transaction.get(db.doc(`financeEntries/order-${orderId}`));
      completionSale = await transaction.get(db.doc(`cashMovements/order-${orderId}`));
    }
    transaction.update(orderRef, { status, updatedAt: FieldValue.serverTimestamp(), statusHistory: FieldValue.arrayUnion({ status, at: Timestamp.now(), actorUid: request.auth!.uid, actorRole: role, ...(reason ? { reason } : {}) }), ...(status === 'CANCELLED' ? { cancelledAt: FieldValue.serverTimestamp(), cancellationReason: reason || '' } : {}) });
    const publicCode = String(snapshot.data()?.publicCode || orderId);
    transaction.set(db.doc(`publicOrders/${publicCode}`), { status, statusMessage: getCustomerOrderStatusMessage(status, reason), estimatedMinutes: snapshot.data()?.estimatedMinutes ?? 15, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (status === 'READY' && snapshot.data()?.fulfillment?.mode === 'DELIVERY') {
      const data = snapshot.data()!;
      const code = makeDeliveryCode();
      const delivery = {
        orderId,
        orderNumber: data.orderNumber,
        status: 'READY_FOR_DELIVERY' as const,
        customerName: data.customer?.name ?? 'Cliente',
        customerWhatsapp: data.customer?.whatsapp ?? null,
        address: data.customer?.address ?? null,
        totalCents: Number(data.pricing?.totalCents ?? 0),
        estimatedMinutes: data.estimatedMinutes ?? 15,
        ...(existingDelivery?.exists ? { publicCode: FieldValue.delete(), deliveryCodeHash: FieldValue.delete(), deliveryCodeHint: FieldValue.delete() } : {}),
        createdAt: existingDelivery?.exists ? existingDelivery.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (existingDelivery?.exists) transaction.set(deliveryRef, delivery, { merge: true });
      else transaction.create(deliveryRef, delivery);
      transaction.set(deliverySecretRef, { deliveryId: deliveryRef.id, codeHash: hashDeliveryCode(code), updatedAt: FieldValue.serverTimestamp(), ...(existingDelivery?.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
      transaction.set(db.doc(`publicOrders/${publicCode}`), { deliveryStatus: 'READY_FOR_DELIVERY', deliveryCode: code, deliveryCodeHint: `${code.slice(0, 2)}••`, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.create(db.doc(`deliveryEvents/${deliveryEventId}`), { deliveryId: deliveryRef.id, type: 'CREATED', actorUid: request.auth!.uid, actorRole: role, createdAt: FieldValue.serverTimestamp() });
    } else if (status === 'CANCELLED' && existingDelivery?.exists && !['DELIVERED', 'CANCELLED'].includes(String(existingDelivery.data()?.status))) {
      const now = FieldValue.serverTimestamp();
      const priorDeliveryStatus = String(existingDelivery.data()?.status ?? '');
      transaction.update(deliveryRef, { status: 'CANCELLED', cancelledAt: now, cancellationReason: reason || '', updatedAt: now, publicCode: FieldValue.delete() });
      transaction.update(orderRef, { deliveryStatus: 'CANCELLED', deliveryUpdatedAt: now, updatedAt: now });
      if (assignedDriver?.exists && assignedDriver.data()?.currentDeliveryId === deliveryRef.id) {
        transaction.update(assignedDriver.ref, { status: 'AVAILABLE', currentDeliveryId: FieldValue.delete(), updatedAt: now });
      }
      if (assignedDriverId) transaction.set(db.doc(`deliveryDrivers/${assignedDriverId}/deliveryHistory/${deliveryRef.id}`), { deliveryId: deliveryRef.id, orderNumber: existingDelivery.data()?.orderNumber ?? orderId, status: 'CANCELLED', note: reason || 'Pedido cancelado pela loja.', updatedAt: now }, { merge: true });
      transaction.set(db.doc(`publicOrders/${publicCode}`), { deliveryStatus: 'CANCELLED', deliveryDriverName: FieldValue.delete(), updatedAt: now }, { merge: true });
      transaction.create(db.doc(`deliveryEvents/${deliveryEventId}`), { deliveryId: deliveryRef.id, driverId: assignedDriverId || null, type: 'CANCELLED', actorUid: request.auth!.uid, actorRole: role, note: reason || `Pedido cancelado (${priorDeliveryStatus}).`, createdAt: now });
    }
    if (status === 'COMPLETED' && completionRegister && completionFinance && completionSale) {
      const data = snapshot.data()!;
      const totalCents = Number(data.pricing.totalCents);
      const paymentMethod = data.payment?.method === 'PIX' || data.payment?.method === 'CARD' || data.payment?.method === 'CASH' ? data.payment.method : 'OTHER';
      const now = FieldValue.serverTimestamp();
      if (!completionFinance.exists) transaction.create(db.doc(`financeEntries/order-${orderId}`), { kind: 'INCOME', category: 'Vendas de açaí', description: `Pedido ${data.orderNumber}`, amountCents: totalCents, date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()), status: 'PAID', orderNumber: data.orderNumber, sourceOrderId: orderId, paymentMethod, notes: 'Lançamento criado automaticamente ao concluir o pedido.', createdAt: now, updatedAt: now });
      if (!completionSale.exists) {
        const cashAmountCents = paymentMethod === 'CASH' ? totalCents : 0;
        transaction.create(db.doc(`cashMovements/order-${orderId}`), { registerId: completionRegister.id, type: 'SALE', direction: 'IN', amountCents: totalCents, cashAmountCents, paymentMethod, orderNumber: data.orderNumber, sourceOrderId: orderId, operatorUid: request.auth!.uid, operatorEmail: typeof request.auth?.token.email === 'string' ? request.auth.token.email : null, note: 'Venda registrada atomicamente ao concluir o pedido.', createdAt: now });
        transaction.update(completionRegister.ref, { expectedCashCents: completionExpectedCashCents + cashAmountCents, lastMovementAt: now, updatedAt: now });
      }
    }
  });
  logger.info('updateOrderStatus completed', { orderId, status, actorUid: request.auth?.uid });
  return { ok: true };
});

const refundOrderSchema = z.object({ orderId: z.string().min(1).max(128), reason: z.string().trim().min(1).max(300) });
export const refundCompletedOrder = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  const role = await requireRole(request.auth?.uid, ['admin', 'staff']);
  const parsed = refundOrderSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Motivo de estorno inválido.');
  const { orderId, reason } = parsed.data;
  await db.runTransaction(async (transaction) => {
    const orderRef = db.doc(`orders/${orderId}`);
    const saleRef = db.doc(`cashMovements/order-${orderId}`);
    const refundRef = db.doc(`cashMovements/refund-${orderId}`);
    const financeRef = db.doc(`financeEntries/refund-${orderId}`);
    const controlRef = db.doc('cashControl/main');
    const snapshot = await transaction.get(orderRef);
    const sale = await transaction.get(saleRef);
    const refund = await transaction.get(refundRef);
    const finance = await transaction.get(financeRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
    if (snapshot.data()?.status !== 'COMPLETED') throw new HttpsError('failed-precondition', 'Somente pedidos concluídos podem receber estorno.');
    if (snapshot.data()?.pricingVerification?.status !== 'VERIFIED' || snapshot.data()?.pricingVerification?.source !== 'SERVER') throw new HttpsError('failed-precondition', 'Este pedido não tem preços validados pelo servidor; revise-o antes de estornar.');
    if (snapshot.data()?.integration?.provider === 'saipos') throw new HttpsError('failed-precondition', 'Este pedido deve ser estornado no Saipos.');
    if (!sale.exists) throw new HttpsError('failed-precondition', 'A venda deste pedido não está registrada no Caixa.');
    if (refund.exists) return;
    const control = await transaction.get(controlRef);
    const registerId = String(control.data()?.openRegisterId ?? '');
    if (!registerId) throw new HttpsError('failed-precondition', 'Abra o Caixa antes de registrar o estorno.');
    const register = await transaction.get(db.doc(`cashRegisters/${registerId}`));
    if (!register.exists || register.data()?.status !== 'OPEN') throw new HttpsError('failed-precondition', 'Abra o Caixa antes de registrar o estorno.');
    const expected = Number(register.data()?.expectedCashCents ?? register.data()?.initialBalanceCents ?? 0);
    if (!Number.isSafeInteger(expected) || expected < 0) throw new HttpsError('failed-precondition', 'O saldo esperado do Caixa está inválido. Revise as movimentações antes de registrar o estorno.');
    const data = snapshot.data()!;
    const saleData = sale.data()!;
    const amountCents = Number(saleData.amountCents ?? data.pricing?.totalCents ?? 0);
    const cashAmountCents = Number(saleData.cashAmountCents ?? 0);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !Number.isSafeInteger(cashAmountCents) || cashAmountCents < 0) throw new HttpsError('failed-precondition', 'A venda possui valores inválidos para estorno.');
    const now = FieldValue.serverTimestamp();
    transaction.update(orderRef, { status: 'CANCELLED', cancelledAt: now, cancellationReason: reason, updatedAt: now, statusHistory: FieldValue.arrayUnion({ status: 'CANCELLED', at: Timestamp.now(), actorUid: request.auth!.uid, actorRole: role, reason }) });
    transaction.set(db.doc(`publicOrders/${String(data.publicCode || orderId)}`), { status: 'CANCELLED', statusMessage: getCustomerOrderStatusMessage('CANCELLED', reason), updatedAt: now }, { merge: true });
    transaction.create(refundRef, { registerId, type: 'REFUND', direction: 'OUT', amountCents, cashAmountCents, paymentMethod: saleData.paymentMethod ?? 'OTHER', orderNumber: data.orderNumber, sourceOrderId: orderId, operatorUid: request.auth!.uid, operatorEmail: typeof request.auth?.token.email === 'string' ? request.auth.token.email : null, note: `Estorno: ${reason}`, createdAt: now });
    if (!finance.exists) transaction.create(financeRef, { kind: 'EXPENSE', category: 'Estornos', description: `Estorno do pedido ${data.orderNumber}`, amountCents, date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()), status: 'PAID', orderNumber: data.orderNumber, sourceOrderId: orderId, paymentMethod: saleData.paymentMethod ?? 'OTHER', notes: reason, createdAt: now, updatedAt: now });
    if (cashAmountCents > expected) throw new HttpsError('failed-precondition', 'O estorno em dinheiro supera o saldo esperado do caixa.');
    transaction.update(register.ref, { expectedCashCents: expected - cashAmountCents, lastMovementAt: now, updatedAt: now });
  });
  logger.info('refundCompletedOrder completed', { orderId, actorUid: request.auth?.uid });
  return { ok: true };
});

const updateDetailsSchema = z.object({
  orderId: z.string().min(1).max(128),
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    whatsapp: z.string().min(8).max(30),
    address: z.object({ street: z.string().trim().min(2).max(120), number: z.string().trim().min(1).max(20), complement: z.string().trim().max(80).optional(), neighborhood: z.string().trim().min(2).max(80), reference: z.string().trim().max(120).optional() }).optional(),
  }),
  notes: z.string().trim().max(500).optional(),
  items: z.array(itemSchema).min(1).max(30).optional(),
  fulfillment: z.object({ mode: z.enum(['PICKUP', 'DELIVERY']), zoneId: z.string().max(100).optional() }).optional(),
  payment: z.object({ method: z.enum(['PIX', 'CARD', 'CASH']), needsChange: z.boolean(), changeForCents: z.number().int().min(0).max(1_000_000).optional() }).optional(),
});
export const updateOrderDetails = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['admin', 'staff']);
  const parsed = updateDetailsSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Dados do pedido inválidos.');
  const input = parsed.data;
  let whatsapp: string;
  try { whatsapp = normalizePhone(input.customer.whatsapp); } catch (cause) { throw new HttpsError('invalid-argument', cause instanceof Error ? cause.message : 'WhatsApp inválido.'); }
  const orderRef = db.doc(`orders/${input.orderId}`);
  const catalogData = input.items || input.fulfillment ? await loadCatalog() : null;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
    const current = snapshot.data()?.status as OrderStatus;
    const data = snapshot.data()!;
    const legacyPreparingPriceReview = current === 'PREPARING' && data.pricingVerification?.status !== 'VERIFIED' && Boolean(input.items);
    if (!['NEW', 'CONFIRMED'].includes(current) && !legacyPreparingPriceReview) throw new HttpsError('failed-precondition', 'Este pedido não pode mais ser editado porque já entrou em preparo.');
    const previous = { customer: data.customer, notes: data.notes ?? '', items: data.items ?? [], pricing: data.pricing, fulfillment: data.fulfillment, payment: data.payment, pricingVerification: data.pricingVerification ?? null };
    const nextFulfillment = input.fulfillment ?? data.fulfillment;
    if (!nextFulfillment || !['PICKUP', 'DELIVERY'].includes(nextFulfillment.mode)) throw new HttpsError('failed-precondition', 'Forma de recebimento inválida.');
    if (nextFulfillment.mode === 'DELIVERY' && !input.customer.address) throw new HttpsError('invalid-argument', 'Endereço obrigatório para delivery.');
    let nextItems: PricedItem[] = Array.isArray(data.items) ? data.items as PricedItem[] : [];
    let nextPricing = data.pricing;
    if (catalogData) {
      if (!catalogData.config.fulfillmentModes.includes(nextFulfillment.mode)) throw new HttpsError('failed-precondition', 'Forma de recebimento indisponível.');
      if (input.items) {
        try { nextItems = calculateCartPreview(input.items.map((item, index) => ({ ...item, cartItemId: String(index) })), catalogData.catalog).items; }
        catch (cause) { throw new HttpsError('failed-precondition', cause instanceof Error ? cause.message : 'Itens inválidos.'); }
      }
      let deliveryFeeCents: number;
      try { deliveryFeeCents = calculateDeliveryFee(catalogData.config.deliveryConfig, nextFulfillment.mode, nextFulfillment.zoneId); }
      catch (cause) { throw new HttpsError('failed-precondition', cause instanceof Error ? cause.message : 'Delivery inválido.'); }
      const subtotalCents = input.items ? nextItems.reduce((sum, item) => sum + item.totalPriceCents, 0) : Number(data.pricing?.subtotalCents ?? 0);
      nextPricing = { ...data.pricing, subtotalCents, deliveryFeeCents, totalCents: subtotalCents + deliveryFeeCents, currency: 'BRL' };
    }
    const nextPayment = input.payment ?? data.payment;
    if (nextPayment?.method !== 'CASH' && (nextPayment?.needsChange || nextPayment?.changeForCents !== undefined)) throw new HttpsError('invalid-argument', 'Troco só pode ser informado para dinheiro.');
    if (nextPayment?.method === 'CASH' && nextPayment.needsChange && (nextPayment.changeForCents === undefined || nextPayment.changeForCents < nextPricing.totalCents)) throw new HttpsError('invalid-argument', 'O valor para troco precisa ser igual ou maior que o total do pedido.');
    const finalFulfillment = catalogData && input.fulfillment ? { ...nextFulfillment, deliveryFeePending: nextFulfillment.mode === 'DELIVERY' && catalogData.config.deliveryConfig.mode === 'CONFIRM' } : nextFulfillment;
    const changes = [input.items ? 'itens e total' : '', input.fulfillment ? 'forma de recebimento' : '', input.payment ? 'pagamento' : '', 'dados do cliente'].filter(Boolean);
    const proposal = { status: 'PENDING', summary: `A loja ajustou ${changes.join(', ')}. Confira e escolha se concorda.`, requestedAt: Timestamp.now(), requestedBy: request.auth!.uid, before: { items: previous.items, pricing: { totalCents: previous.pricing.totalCents }, fulfillment: { mode: previous.fulfillment.mode === 'DELIVERY' ? 'DELIVERY' : 'PICKUP' } } };
    const orderUpdate = { customer: { name: input.customer.name, whatsapp, ...(input.customer.address ? { address: input.customer.address } : {}) }, notes: input.notes ?? '', customerEditApproval: { status: 'PENDING', requestedAt: Timestamp.now(), requestedBy: request.auth!.uid, previous }, updatedAt: FieldValue.serverTimestamp(), lastEditedAt: FieldValue.serverTimestamp(), lastEditedBy: request.auth!.uid, ...(input.items ? { items: nextItems, pricingVerification: { status: 'VERIFIED', source: 'SERVER' } } : {}), ...(catalogData && (input.items || input.fulfillment) ? { pricing: nextPricing } : {}), ...(input.fulfillment ? { fulfillment: finalFulfillment } : {}), ...(input.payment ? { payment: nextPayment } : {}) };
    transaction.update(orderRef, orderUpdate);
    transaction.set(db.doc(`publicOrders/${String(data.publicCode || input.orderId)}`), { editProposal: proposal, updatedAt: FieldValue.serverTimestamp(), ...(input.items ? { items: nextItems } : {}), ...(catalogData && (input.items || input.fulfillment) ? { pricing: { totalCents: nextPricing.totalCents } } : {}), ...(input.fulfillment ? { fulfillment: { mode: finalFulfillment.mode } } : {}) }, { merge: true });
  });
  logger.info('updateOrderDetails completed', { orderId: input.orderId, actorUid: request.auth?.uid });
  return { ok: true };
});

const finalizeEditSchema = z.object({ orderId: z.string().min(1).max(128), decision: z.enum(['ACCEPTED', 'REJECTED']) });
export const finalizeOrderEdit = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['admin', 'staff']);
  const parsed = finalizeEditSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Decisão de edição inválida.');
  const { orderId, decision } = parsed.data;
  const orderRef = db.doc(`orders/${orderId}`);
  await db.runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
    const current = orderSnapshot.data()!;
    const approval = current.customerEditApproval;
    if (!approval || approval.status !== 'PENDING') throw new HttpsError('failed-precondition', 'Não há alteração aguardando decisão.');
    const publicCode = String(current.publicCode || orderId);
    const publicRef = db.doc(`publicOrders/${publicCode}`);
    const publicSnapshot = await transaction.get(publicRef);
    const proposal = publicSnapshot.exists ? publicSnapshot.data()?.editProposal : null;
    if (!proposal || proposal.status !== decision) throw new HttpsError('failed-precondition', 'A decisão do cliente ainda não foi registrada.');
    const common = { customerEditApproval: { ...approval, status: decision, decidedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() };
    if (decision === 'REJECTED') {
      transaction.update(orderRef, { ...common, customer: approval.previous.customer, notes: approval.previous.notes, items: approval.previous.items, pricing: approval.previous.pricing, fulfillment: approval.previous.fulfillment, payment: approval.previous.payment, pricingVerification: approval.previous.pricingVerification ?? FieldValue.delete() });
      transaction.set(publicRef, { items: proposal.before.items, pricing: proposal.before.pricing, fulfillment: proposal.before.fulfillment, editProposal: { ...proposal, status: 'REJECTED', respondedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else {
      transaction.update(orderRef, common);
      transaction.set(publicRef, { editProposal: { ...proposal, status: 'ACCEPTED', respondedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  });
  return { ok: true };
});

const estimateSchema = z.object({ orderId: z.string().min(1).max(128), estimatedMinutes: z.number().int().min(5).max(240) });
export const updateOrderEstimate = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['admin', 'staff']);
  const parsed = estimateSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Previsão inválida.');
  const { orderId, estimatedMinutes } = parsed.data;
  const orderRef = db.doc(`orders/${orderId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
    if (['COMPLETED', 'CANCELLED'].includes(String(snapshot.data()?.status))) throw new HttpsError('failed-precondition', 'Este pedido não aceita mais alterações.');
    const now = FieldValue.serverTimestamp();
    transaction.update(orderRef, { estimatedMinutes, estimatedUpdatedAt: now, updatedAt: now });
    const publicCode = String(snapshot.data()?.publicCode || orderId);
    transaction.set(db.doc(`publicOrders/${publicCode}`), { estimatedMinutes, estimatedUpdatedAt: now, updatedAt: now }, { merge: true });
  });
  return { ok: true };
});

const createDriverSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(8).max(30),
  email: z.string().email().max(160),
  password: z.string().min(8).max(128),
});
export const createDeliveryDriver = onCall({ region, timeoutSeconds: 20, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['admin']);
  const parsed = createDriverSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Dados do motoboy inválidos.');
  const input = parsed.data;
  let created;
  try { created = await getAuth().createUser({ email: input.email, password: input.password, displayName: input.name }); }
  catch (cause) { throw new HttpsError('already-exists', cause instanceof Error ? cause.message : 'Não foi possível criar o acesso.'); }
  try {
    await db.runTransaction(async (transaction) => {
      const userRef = db.doc(`users/${created.uid}`);
      const driverRef = db.doc(`deliveryDrivers/${created.uid}`);
      const existing = await transaction.get(driverRef);
      if (existing.exists) throw new HttpsError('already-exists', 'Este motoboy já está cadastrado.');
      const now = FieldValue.serverTimestamp();
      transaction.set(userRef, { role: 'driver', name: input.name, email: input.email, phone: input.phone, active: true, createdAt: now, updatedAt: now }, { merge: true });
      transaction.create(driverRef, { userId: created.uid, name: input.name, email: input.email, phone: input.phone, status: 'OFFLINE', enabled: true, createdAt: now, updatedAt: now });
    });
  } catch (cause) {
    try { await getAuth().deleteUser(created.uid); } catch { /* não ocultar a falha original */ }
    if (cause instanceof HttpsError) throw cause;
    throw new HttpsError('internal', 'Não foi possível salvar o cadastro do motoboy.');
  }
  return { uid: created.uid, email: input.email };
});

const deliveryDriverEnabledSchema = z.object({ driverId: z.string().min(1).max(128), enabled: z.boolean() });
export const setDeliveryDriverEnabled = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['admin']);
  const parsed = deliveryDriverEnabledSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Motoboy ou situação inválida.');
  const { driverId, enabled } = parsed.data;
  try { await getAuth().getUser(driverId); }
  catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'auth/user-not-found') throw new HttpsError('not-found', 'A conta de acesso deste motoboy não existe.');
    logger.error('Não foi possível validar a conta Auth do motoboy.', { driverId, cause });
    throw new HttpsError('unavailable', 'Não foi possível validar a conta de acesso do motoboy.');
  }
  await db.runTransaction(async (transaction) => {
    const driverRef = db.doc(`deliveryDrivers/${driverId}`);
    const userRef = db.doc(`users/${driverId}`);
    const driver = await transaction.get(driverRef);
    if (!driver.exists) throw new HttpsError('not-found', 'Motoboy não encontrado.');
    if (driver.data()?.status === 'BUSY' || driver.data()?.currentDeliveryId) {
      throw new HttpsError('failed-precondition', 'Finalize ou devolva a entrega atual antes de alterar este acesso.');
    }
    const now = FieldValue.serverTimestamp();
    transaction.update(driverRef, { enabled, status: enabled ? 'OFFLINE' : 'INACTIVE', updatedAt: now });
    transaction.set(userRef, { active: enabled, updatedAt: now }, { merge: true });
  });

  // Auth and Firestore cannot share one transaction. Firestore remains the
  // authorization source; reconcile Auth to the latest persisted state and
  // retry if another admin changed the status concurrently.
  const driverRef = db.doc(`deliveryDrivers/${driverId}`);
  const userRef = db.doc(`users/${driverId}`);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const [driver, user] = await Promise.all([driverRef.get(), userRef.get()]);
    if (!driver.exists) throw new HttpsError('not-found', 'Motoboy não encontrado.');
    const shouldBeDisabled = driver.data()?.enabled === false || user.data()?.active === false;
    try {
      const authUser = await getAuth().getUser(driverId);
      if (authUser.disabled !== shouldBeDisabled) await getAuth().updateUser(driverId, { disabled: shouldBeDisabled });
    } catch (cause) {
      logger.error('Não foi possível sincronizar o status Auth do motoboy.', { driverId, shouldBeDisabled, cause });
      throw new HttpsError('unavailable', 'O cadastro foi atualizado, mas não foi possível sincronizar o acesso. Tente novamente.');
    }
    const [latestDriver, latestUser] = await Promise.all([driverRef.get(), userRef.get()]);
    const latestShouldBeDisabled = latestDriver.data()?.enabled === false || latestUser.data()?.active === false;
    if (latestDriver.exists && latestShouldBeDisabled === shouldBeDisabled) return { ok: true, enabled: !shouldBeDisabled };
  }
  logger.warn('O status Auth do motoboy mudou durante tentativas concorrentes de atualização.', { driverId });
  throw new HttpsError('aborted', 'O status mudou ao mesmo tempo em outra sessão. Atualize a tela e tente novamente.');
});

const updateDeliveryDriverSchema = z.object({ driverId: z.string().min(1).max(128), name: z.string().trim().min(2).max(80), phone: z.string().trim().min(8).max(30), email: z.string().trim().email().max(160) });
export const updateDeliveryDriver = onCall({ region, timeoutSeconds: 20, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['admin']);
  const parsed = updateDeliveryDriverSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Confira nome, telefone e e-mail do motoboy.');
  const { driverId, name, phone, email } = parsed.data;
  const driverRef = db.doc(`deliveryDrivers/${driverId}`);
  const userRef = db.doc(`users/${driverId}`);
  const driver = await driverRef.get();
  if (!driver.exists) throw new HttpsError('not-found', 'Motoboy não encontrado.');
  const authUser = await getAuth().getUser(driverId);
  try {
    await getAuth().updateUser(driverId, { displayName: name, email });
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(driverRef);
      if (!current.exists) throw new HttpsError('not-found', 'Motoboy não encontrado.');
      const now = FieldValue.serverTimestamp();
      transaction.update(driverRef, { name, phone, email, updatedAt: now });
      transaction.set(userRef, { name, phone, email, updatedAt: now }, { merge: true });
    });
  } catch (cause) {
    try { await getAuth().updateUser(driverId, { displayName: authUser.displayName ?? null, email: authUser.email }); } catch { /* manter erro original */ }
    if (cause instanceof HttpsError) throw cause;
    throw new HttpsError('internal', 'Não foi possível salvar os dados do motoboy.');
  }
  return { ok: true };
});

const availabilitySchema = z.object({ status: z.enum(['AVAILABLE', 'OFFLINE']) });
export const setDriverAvailability = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  const role = await requireRole(request.auth?.uid, ['driver', 'admin']);
  const parsed = availabilitySchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Disponibilidade inválida.');
  const uid = request.auth!.uid;
  const ref = db.doc(`deliveryDrivers/${uid}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Cadastro de motoboy não encontrado.');
    if (role === 'driver' && snapshot.data()?.enabled !== true) throw new HttpsError('permission-denied', 'Seu acesso de entregador está desativado.');
    if (snapshot.data()?.status === 'BUSY' || snapshot.data()?.currentDeliveryId) {
      throw new HttpsError('failed-precondition', 'Conclua ou devolva a entrega atual antes de alterar sua disponibilidade.');
    }
    transaction.update(ref, { status: parsed.data.status, updatedAt: FieldValue.serverTimestamp(), ...(role === 'admin' ? { enabled: true } : {}) });
  });
  return { ok: true, status: parsed.data.status };
});

const assignDeliverySchema = z.object({ deliveryId: z.string().min(1).max(160), driverId: z.string().min(1).max(128) });

function assertCurrentDriverDelivery(driver: DocumentSnapshot, deliveryId: string) {
  const data = driver.data();
  if (!driver.exists || data?.enabled !== true) throw new HttpsError('failed-precondition', 'Seu acesso de entregador está desativado.');
  if (data.status !== 'BUSY' || data.currentDeliveryId !== deliveryId) {
    throw new HttpsError('failed-precondition', 'Esta não é a entrega atual vinculada ao seu acesso. Atualize a tela ou peça ajuda à loja.');
  }
}

export const sanitizeLegacyDeliveryLinks = onCall({ region, timeoutSeconds: 30, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['admin']);
  const legacy = await db.collection('deliveries').where('publicCode', '!=', null).limit(450).get();
  if (legacy.empty) return { sanitized: 0, hasMore: false };
  const batch = db.batch();
  for (const snapshot of legacy.docs) batch.update(snapshot.ref, { publicCode: FieldValue.delete(), deliveryCodeHash: FieldValue.delete(), deliveryCodeHint: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { sanitized: legacy.size, hasMore: legacy.size === 450 };
});

export const assignDelivery = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  const role = await requireRole(request.auth?.uid, ['admin', 'staff']);
  const parsed = assignDeliverySchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Entrega ou motoboy inválido.');
  const { deliveryId, driverId } = parsed.data;
  const eventId = `delivery-${deliveryId}-${randomUUID()}`;
  await db.runTransaction(async (transaction) => {
    const deliveryRef = db.doc(`deliveries/${deliveryId}`);
    const driverRef = db.doc(`deliveryDrivers/${driverId}`);
    const driverUserRef = db.doc(`users/${driverId}`);
    const delivery = await transaction.get(deliveryRef);
    const driver = await transaction.get(driverRef);
    const driverUser = await transaction.get(driverUserRef);
    if (!delivery.exists) throw new HttpsError('not-found', 'Entrega não encontrada.');
    const orderRef = db.doc(`orders/${String(delivery.data()?.orderId ?? '')}`);
    const order = await transaction.get(orderRef);
    if (!order.exists || order.data()?.fulfillment?.mode !== 'DELIVERY') throw new HttpsError('failed-precondition', 'O pedido vinculado à entrega não é válido.');
    if (!driver.exists || driver.data()?.enabled !== true || !driverUser.exists || driverUser.data()?.role !== 'driver' || driverUser.data()?.active === false) throw new HttpsError('failed-precondition', 'Motoboy indisponível.');
    if (delivery.data()?.status !== 'READY_FOR_DELIVERY') throw new HttpsError('failed-precondition', 'Esta entrega não está aguardando atribuição.');
    if (driver.data()?.status !== 'AVAILABLE' || driver.data()?.currentDeliveryId) throw new HttpsError('failed-precondition', 'O motoboy precisa estar disponível e sem outra entrega vinculada.');
    const now = FieldValue.serverTimestamp();
    transaction.update(deliveryRef, { status: 'ASSIGNED', driverId, driverName: driver.data()?.name ?? 'Motoboy', assignedAt: now, updatedAt: now, publicCode: FieldValue.delete() });
    transaction.update(driverRef, { status: 'BUSY', currentDeliveryId: deliveryId, updatedAt: now });
    transaction.update(orderRef, { deliveryStatus: 'ASSIGNED', deliveryUpdatedAt: now, updatedAt: now });
    transaction.set(db.doc(`deliveryDrivers/${driverId}/deliveryHistory/${deliveryId}`), { deliveryId, orderId: orderRef.id, orderNumber: delivery.data()?.orderNumber ?? order.data()?.orderNumber ?? orderRef.id, customerName: delivery.data()?.customerName ?? 'Cliente', status: 'ASSIGNED', updatedAt: now }, { merge: true });
    transaction.create(db.doc(`deliveryEvents/${eventId}`), { deliveryId, driverId, type: 'ASSIGNED', actorUid: request.auth!.uid, actorRole: role, note: `Atribuída a ${driver.data()?.name ?? 'motoboy'}`, createdAt: now });
    const publicCode = String(order.data()?.publicCode ?? '');
    if (publicCode) transaction.set(db.doc(`publicOrders/${publicCode}`), { deliveryStatus: 'ASSIGNED', deliveryDriverName: driver.data()?.name ?? 'Motoboy', updatedAt: now }, { merge: true });
  });
  return { ok: true };
});

const deliveryDecisionSchema = z.object({ deliveryId: z.string().min(1).max(160), decision: z.enum(['ACCEPT', 'REJECT']) });
export const respondDelivery = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['driver']);
  const parsed = deliveryDecisionSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Decisão inválida.');
  const { deliveryId, decision } = parsed.data;
  const uid = request.auth!.uid;
  const eventId = `delivery-${deliveryId}-${randomUUID()}`;
  await db.runTransaction(async (transaction) => {
    const deliveryRef = db.doc(`deliveries/${deliveryId}`);
    const driverRef = db.doc(`deliveryDrivers/${uid}`);
    const delivery = await transaction.get(deliveryRef);
    const driver = await transaction.get(driverRef);
    if (!delivery.exists || delivery.data()?.driverId !== uid) throw new HttpsError('not-found', 'Entrega não encontrada.');
    assertCurrentDriverDelivery(driver, deliveryId);
    if (delivery.data()?.status !== 'ASSIGNED') throw new HttpsError('failed-precondition', 'Esta entrega já foi respondida.');
    const orderRef = db.doc(`orders/${String(delivery.data()?.orderId ?? '')}`);
    const order = await transaction.get(orderRef);
    if (!order.exists) throw new HttpsError('not-found', 'Pedido vinculado não encontrado.');
    const now = FieldValue.serverTimestamp();
    const publicCode = String(order.data()?.publicCode ?? '');
    if (decision === 'ACCEPT') {
      transaction.update(deliveryRef, { status: 'ACCEPTED', acceptedAt: now, updatedAt: now, publicCode: FieldValue.delete() });
      transaction.set(db.doc(`deliveryDrivers/${uid}/deliveryHistory/${deliveryId}`), { deliveryId, orderId: orderRef.id, orderNumber: delivery.data()?.orderNumber ?? order.data()?.orderNumber ?? orderRef.id, customerName: delivery.data()?.customerName ?? 'Cliente', status: 'ACCEPTED', updatedAt: now }, { merge: true });
      transaction.update(driverRef, { status: 'BUSY', updatedAt: now });
      transaction.update(orderRef, { deliveryStatus: 'ACCEPTED', deliveryUpdatedAt: now, updatedAt: now });
      if (publicCode) transaction.set(db.doc(`publicOrders/${publicCode}`), { deliveryStatus: 'ACCEPTED', updatedAt: now }, { merge: true });
    } else {
      transaction.update(deliveryRef, { status: 'READY_FOR_DELIVERY', driverId: null, driverName: null, assignedAt: FieldValue.delete(), acceptedAt: FieldValue.delete(), driverIds: FieldValue.delete(), updatedAt: now, publicCode: FieldValue.delete() });
      transaction.set(db.doc(`deliveryDrivers/${uid}/deliveryHistory/${deliveryId}`), { deliveryId, orderId: orderRef.id, orderNumber: delivery.data()?.orderNumber ?? order.data()?.orderNumber ?? orderRef.id, customerName: delivery.data()?.customerName ?? 'Cliente', status: 'DRIVER_REJECTED', updatedAt: now }, { merge: true });
      transaction.update(driverRef, { status: 'AVAILABLE', currentDeliveryId: FieldValue.delete(), updatedAt: now });
      transaction.update(orderRef, { deliveryStatus: 'READY_FOR_DELIVERY', deliveryUpdatedAt: now, updatedAt: now });
      if (publicCode) transaction.set(db.doc(`publicOrders/${publicCode}`), { deliveryStatus: 'READY_FOR_DELIVERY', deliveryDriverName: FieldValue.delete(), updatedAt: now }, { merge: true });
    }
    transaction.create(db.doc(`deliveryEvents/${eventId}`), { deliveryId, driverId: uid, type: decision === 'ACCEPT' ? 'ACCEPTED' : 'DRIVER_REJECTED', actorUid: uid, actorRole: 'driver', createdAt: now });
  });
  return { ok: true };
});

const deliveryProgressSchema = z.object({ deliveryId: z.string().min(1).max(160), status: z.enum(['PICKED_UP', 'ON_THE_WAY', 'ARRIVED']) });
export const progressDelivery = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['driver']);
  const parsed = deliveryProgressSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Status de entrega inválido.');
  const uid = request.auth!.uid;
  const { deliveryId, status } = parsed.data;
  const eventId = `delivery-${deliveryId}-${randomUUID()}`;
  await db.runTransaction(async (transaction) => {
    const deliveryRef = db.doc(`deliveries/${deliveryId}`);
    const driverRef = db.doc(`deliveryDrivers/${uid}`);
    const delivery = await transaction.get(deliveryRef);
    const driver = await transaction.get(driverRef);
    if (!delivery.exists || delivery.data()?.driverId !== uid) throw new HttpsError('not-found', 'Entrega não encontrada.');
    assertCurrentDriverDelivery(driver, deliveryId);
    const current = String(delivery.data()?.status) as DeliveryStatus;
    if (!canTransitionDelivery(current, status)) throw new HttpsError('failed-precondition', `Transição ${current} → ${status} não permitida.`);
    const orderRef = db.doc(`orders/${String(delivery.data()?.orderId ?? '')}`);
    const order = await transaction.get(orderRef);
    if (!order.exists) throw new HttpsError('not-found', 'Pedido vinculado não encontrado.');
    const now = FieldValue.serverTimestamp();
    transaction.update(deliveryRef, { status, ...(status === 'PICKED_UP' ? { pickedUpAt: now } : status === 'ON_THE_WAY' ? { startedAt: now } : { arrivedAt: now }), updatedAt: now, publicCode: FieldValue.delete() });
    transaction.set(db.doc(`deliveryDrivers/${uid}/deliveryHistory/${deliveryId}`), { deliveryId, orderId: orderRef.id, orderNumber: delivery.data()?.orderNumber ?? order.data()?.orderNumber ?? orderRef.id, customerName: delivery.data()?.customerName ?? 'Cliente', status, updatedAt: now }, { merge: true });
    const publicCode = String(order.data()?.publicCode ?? '');
    transaction.update(orderRef, { deliveryStatus: status, deliveryUpdatedAt: now, updatedAt: now });
    if (status === 'ON_THE_WAY') {
      transaction.update(orderRef, { status: 'OUT_FOR_DELIVERY', statusMessage: deliveryStatusMessage(status), updatedAt: now, statusHistory: FieldValue.arrayUnion({ status: 'OUT_FOR_DELIVERY', at: Timestamp.now(), actorUid: uid, actorRole: 'driver' }) });
      if (publicCode) transaction.set(db.doc(`publicOrders/${publicCode}`), { status: 'OUT_FOR_DELIVERY', deliveryStatus: status, statusMessage: deliveryStatusMessage(status), updatedAt: now }, { merge: true });
    } else if (publicCode) transaction.set(db.doc(`publicOrders/${publicCode}`), { deliveryStatus: status, ...(status === 'PICKED_UP' ? { statusMessage: deliveryStatusMessage(status) } : {}), updatedAt: now }, { merge: true });
    transaction.create(db.doc(`deliveryEvents/${eventId}`), { deliveryId, driverId: uid, type: status, actorUid: uid, actorRole: 'driver', createdAt: now });
  });
  return { ok: true };
});

const reassignDeliverySchema = z.object({ deliveryId: z.string().min(1).max(160), driverId: z.string().min(1).max(128) });
export const reassignDelivery = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  const role = await requireRole(request.auth?.uid, ['admin', 'staff']);
  const parsed = reassignDeliverySchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Entrega ou motoboy inválido.');
  const { deliveryId, driverId } = parsed.data;
  const eventId = `delivery-${deliveryId}-${randomUUID()}`;
  await db.runTransaction(async (transaction) => {
    const deliveryRef = db.doc(`deliveries/${deliveryId}`);
    const delivery = await transaction.get(deliveryRef);
    if (!delivery.exists || !['ASSIGNED', 'ACCEPTED'].includes(String(delivery.data()?.status))) throw new HttpsError('failed-precondition', 'Só é possível trocar o motoboy antes da retirada do pedido.');
    const oldDriverId = String(delivery.data()?.driverId ?? '');
    if (!oldDriverId || oldDriverId === driverId) throw new HttpsError('invalid-argument', 'Escolha um motoboy diferente do atual.');
    const oldDriverRef = db.doc(`deliveryDrivers/${oldDriverId}`);
    const newDriverRef = db.doc(`deliveryDrivers/${driverId}`);
    const newDriverUserRef = db.doc(`users/${driverId}`);
    const oldDriver = await transaction.get(oldDriverRef);
    const newDriver = await transaction.get(newDriverRef);
    const newDriverUser = await transaction.get(newDriverUserRef);
    const orderRef = db.doc(`orders/${String(delivery.data()?.orderId ?? '')}`);
    const order = await transaction.get(orderRef);
    if (!oldDriver.exists || oldDriver.data()?.status !== 'BUSY' || oldDriver.data()?.currentDeliveryId !== deliveryId) throw new HttpsError('failed-precondition', 'O vínculo do motoboy atual está inconsistente.');
    if (!newDriver.exists || newDriver.data()?.enabled !== true || !newDriverUser.exists || newDriverUser.data()?.role !== 'driver' || newDriverUser.data()?.active === false || newDriver.data()?.status !== 'AVAILABLE' || newDriver.data()?.currentDeliveryId) throw new HttpsError('failed-precondition', 'O novo motoboy precisa estar disponível e sem outra entrega vinculada.');
    if (!order.exists) throw new HttpsError('not-found', 'Pedido vinculado não encontrado.');
    const now = FieldValue.serverTimestamp();
    const driverName = String(newDriver.data()?.name ?? 'Motoboy');
    transaction.update(oldDriverRef, { status: 'AVAILABLE', currentDeliveryId: FieldValue.delete(), updatedAt: now });
    transaction.update(newDriverRef, { status: 'BUSY', currentDeliveryId: deliveryId, updatedAt: now });
    transaction.update(deliveryRef, { status: 'ASSIGNED', driverId, driverName, assignedAt: now, updatedAt: now, driverIds: FieldValue.delete() });
    transaction.update(orderRef, { deliveryStatus: 'ASSIGNED', deliveryUpdatedAt: now, updatedAt: now });
    for (const [historyDriverId, historyStatus] of [[oldDriverId, 'REASSIGNED'], [driverId, 'ASSIGNED']] as const) {
      transaction.set(db.doc(`deliveryDrivers/${historyDriverId}/deliveryHistory/${deliveryId}`), { deliveryId, orderId: orderRef.id, orderNumber: delivery.data()?.orderNumber ?? order.data()?.orderNumber ?? orderRef.id, customerName: delivery.data()?.customerName ?? 'Cliente', status: historyStatus, updatedAt: now }, { merge: true });
    }
    const publicCode = String(order.data()?.publicCode ?? '');
    if (publicCode) transaction.set(db.doc(`publicOrders/${publicCode}`), { deliveryStatus: 'ASSIGNED', deliveryDriverName: driverName, updatedAt: now }, { merge: true });
    transaction.create(db.doc(`deliveryEvents/${eventId}`), { deliveryId, driverId, previousDriverId: oldDriverId, type: 'REASSIGNED', actorUid: request.auth!.uid, actorRole: role, createdAt: now });
  });
  return { ok: true };
});

const deliveryFailureSchema = z.object({ deliveryId: z.string().min(1).max(160), reason: z.string().trim().min(3).max(300) });
export const reportDeliveryFailure = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['driver']);
  const parsed = deliveryFailureSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Informe o motivo da falha.');
  const { deliveryId, reason } = parsed.data;
  const uid = request.auth!.uid;
  const eventId = `delivery-${deliveryId}-${randomUUID()}`;
  await db.runTransaction(async (transaction) => {
    const deliveryRef = db.doc(`deliveries/${deliveryId}`);
    const driverRef = db.doc(`deliveryDrivers/${uid}`);
    const delivery = await transaction.get(deliveryRef);
    const driver = await transaction.get(driverRef);
    if (!delivery.exists || delivery.data()?.driverId !== uid) throw new HttpsError('not-found', 'Entrega não encontrada.');
    assertCurrentDriverDelivery(driver, deliveryId);
    const current = String(delivery.data()?.status) as DeliveryStatus;
    if (!['PICKED_UP', 'ON_THE_WAY', 'ARRIVED'].includes(current) || !canTransitionDelivery(current, 'DELIVERY_FAILED')) throw new HttpsError('failed-precondition', 'Esta entrega não pode ser marcada como falha agora.');
    const orderRef = db.doc(`orders/${String(delivery.data()?.orderId ?? '')}`);
    const order = await transaction.get(orderRef);
    if (!order.exists) throw new HttpsError('not-found', 'Pedido vinculado não encontrado.');
    const now = FieldValue.serverTimestamp();
    transaction.update(deliveryRef, { status: 'DELIVERY_FAILED', failureReason: reason, failedAt: now, updatedAt: now, publicCode: FieldValue.delete() });
    transaction.set(db.doc(`deliveryDrivers/${uid}/deliveryHistory/${deliveryId}`), { deliveryId, orderId: orderRef.id, orderNumber: delivery.data()?.orderNumber ?? order.data()?.orderNumber ?? orderRef.id, customerName: delivery.data()?.customerName ?? 'Cliente', status: 'DELIVERY_FAILED', note: reason, updatedAt: now }, { merge: true });
    transaction.update(driverRef, { status: 'AVAILABLE', currentDeliveryId: FieldValue.delete(), updatedAt: now });
    transaction.update(orderRef, { deliveryStatus: 'DELIVERY_FAILED', deliveryFailureReason: reason, deliveryUpdatedAt: now, updatedAt: now });
    const publicCode = String(order.data()?.publicCode ?? '');
    if (publicCode) transaction.set(db.doc(`publicOrders/${publicCode}`), { deliveryStatus: 'DELIVERY_FAILED', statusMessage: 'A loja está revisando um problema na entrega.', updatedAt: now }, { merge: true });
    transaction.create(db.doc(`deliveryEvents/${eventId}`), { deliveryId, driverId: uid, type: 'DELIVERY_FAILED', actorUid: uid, actorRole: 'driver', note: reason, createdAt: now });
  });
  return { ok: true };
});

const requeueDeliverySchema = z.object({ deliveryId: z.string().min(1).max(160) });
export const requeueDelivery = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  const role = await requireRole(request.auth?.uid, ['admin', 'staff']);
  const parsed = requeueDeliverySchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Entrega inválida.');
  const { deliveryId } = parsed.data;
  const eventId = `delivery-${deliveryId}-${randomUUID()}`;
  await db.runTransaction(async (transaction) => {
    const deliveryRef = db.doc(`deliveries/${deliveryId}`);
    const delivery = await transaction.get(deliveryRef);
    if (!delivery.exists) throw new HttpsError('not-found', 'Entrega não encontrada.');
    if (delivery.data()?.status !== 'DELIVERY_FAILED') throw new HttpsError('failed-precondition', 'Somente entregas com falha podem voltar para a fila.');
    const orderRef = db.doc(`orders/${String(delivery.data()?.orderId ?? '')}`);
    const order = await transaction.get(orderRef);
    if (!order.exists) throw new HttpsError('not-found', 'Pedido vinculado não encontrado.');
    const now = FieldValue.serverTimestamp();
    transaction.update(deliveryRef, {
      status: 'READY_FOR_DELIVERY', driverId: null, driverName: null,
      assignedAt: FieldValue.delete(), acceptedAt: FieldValue.delete(),
      pickedUpAt: FieldValue.delete(), startedAt: FieldValue.delete(), arrivedAt: FieldValue.delete(),
      failureReason: FieldValue.delete(), failedAt: FieldValue.delete(),
      driverIds: FieldValue.delete(), updatedAt: now, publicCode: FieldValue.delete(),
    });
    const previousDriverId = String(delivery.data()?.driverId ?? '');
    if (previousDriverId) transaction.set(db.doc(`deliveryDrivers/${previousDriverId}/deliveryHistory/${deliveryId}`), { deliveryId, orderId: orderRef.id, orderNumber: delivery.data()?.orderNumber ?? order.data()?.orderNumber ?? orderRef.id, customerName: delivery.data()?.customerName ?? 'Cliente', status: 'RETURNED_TO_QUEUE', note: delivery.data()?.failureReason ?? '', updatedAt: now }, { merge: true });
    transaction.update(orderRef, { deliveryStatus: 'READY_FOR_DELIVERY', deliveryFailureReason: FieldValue.delete(), deliveryUpdatedAt: now, updatedAt: now });
    const publicCode = String(order.data()?.publicCode ?? '');
    if (publicCode) transaction.set(db.doc(`publicOrders/${publicCode}`), { deliveryStatus: 'READY_FOR_DELIVERY', deliveryDriverName: FieldValue.delete(), statusMessage: 'A loja está organizando uma nova tentativa de entrega.', updatedAt: now }, { merge: true });
    transaction.create(db.doc(`deliveryEvents/${eventId}`), { deliveryId, driverId: delivery.data()?.driverId ?? null, type: 'READY_FOR_DELIVERY', actorUid: request.auth!.uid, actorRole: role, note: 'Entrega devolvida à fila após falha.', createdAt: now });
  });
  return { ok: true };
});

const confirmDeliverySchema = z.object({ deliveryId: z.string().min(1).max(160), code: z.string().regex(/^\d{4}$/) });
export const confirmDelivery = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck }, async (request) => {
  await requireRole(request.auth?.uid, ['driver']);
  const parsed = confirmDeliverySchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Informe o código de 4 dígitos.');
  const uid = request.auth!.uid;
  const { deliveryId, code } = parsed.data;
  const eventId = `delivery-${deliveryId}-${randomUUID()}`;
  let invalidCode = false;
  await db.runTransaction(async (transaction) => {
    invalidCode = false;
    const deliveryRef = db.doc(`deliveries/${deliveryId}`);
    const delivery = await transaction.get(deliveryRef);
    if (!delivery.exists || delivery.data()?.driverId !== uid) throw new HttpsError('not-found', 'Entrega não encontrada.');
    const driverRef = db.doc(`deliveryDrivers/${uid}`);
    const driver = await transaction.get(driverRef);
    assertCurrentDriverDelivery(driver, deliveryId);
    if (delivery.data()?.status !== 'ARRIVED') throw new HttpsError('failed-precondition', 'A entrega precisa estar no local antes da confirmação.');
    const secretRef = db.doc(`deliverySecrets/${deliveryId}`);
    const secret = await transaction.get(secretRef);
    if (!secret.exists) throw new HttpsError('failed-precondition', 'O código de recebimento não está disponível. Peça ajuda à loja.');
    const secretData = secret.data()!;
    const currentAttempts = {
      failedAttempts: Number(secretData.failedCodeAttempts ?? 0),
      windowStartedAtMs: Number(secretData.failedCodeWindowStartedAtMs ?? 0),
      lockedUntilMs: Number(secretData.failedCodeLockedUntilMs ?? 0),
    };
    if (currentAttempts.lockedUntilMs > Date.now()) throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
    if (String(secretData.codeHash ?? '') !== hashDeliveryCode(code)) {
      const nextAttempts = recordDeliveryCodeFailure(currentAttempts, Date.now());
      if (!nextAttempts) throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      transaction.update(secretRef, {
        failedCodeAttempts: nextAttempts.failedAttempts,
        failedCodeWindowStartedAtMs: nextAttempts.windowStartedAtMs,
        failedCodeLockedUntilMs: nextAttempts.lockedUntilMs,
      });
      invalidCode = true;
      return;
    }
    const orderRef = db.doc(`orders/${delivery.data()?.orderId}`);
    const order = await transaction.get(orderRef);
    if (!order.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
    if (order.data()?.status !== 'OUT_FOR_DELIVERY') throw new HttpsError('failed-precondition', 'O pedido não está em rota.');
    if (order.data()?.pricingVerification?.status !== 'VERIFIED' || order.data()?.pricingVerification?.source !== 'SERVER') throw new HttpsError('failed-precondition', 'A loja precisa validar os preços do pedido antes da confirmação. Peça ajuda à loja.');
    const totalCents = Number(order.data()?.pricing?.totalCents ?? 0);
    if (!Number.isSafeInteger(totalCents) || totalCents <= 0) throw new HttpsError('failed-precondition', 'O pedido precisa ter um total válido para ser concluído.');
    const control = await transaction.get(db.doc('cashControl/main'));
    const registerId = String(control.data()?.openRegisterId ?? '');
    if (!registerId) throw new HttpsError('failed-precondition', 'A loja precisa abrir o Caixa antes de concluir a entrega.');
    const register = await transaction.get(db.doc(`cashRegisters/${registerId}`));
    if (!register.exists || register.data()?.status !== 'OPEN') throw new HttpsError('failed-precondition', 'A loja precisa abrir o Caixa antes de concluir a entrega.');
    const financeRef = db.doc(`financeEntries/order-${delivery.data()?.orderId}`);
    const saleRef = db.doc(`cashMovements/order-${delivery.data()?.orderId}`);
    const finance = await transaction.get(financeRef);
    const sale = await transaction.get(saleRef);
    const expectedCashCents = Number(register.data()?.expectedCashCents ?? register.data()?.initialBalanceCents ?? 0);
    if (!Number.isSafeInteger(expectedCashCents) || expectedCashCents < 0) throw new HttpsError('failed-precondition', 'O saldo esperado do Caixa está inválido. Revise as movimentações antes de confirmar a entrega.');
    const now = FieldValue.serverTimestamp();
    const publicCode = String(order.data()?.publicCode ?? '');
    transaction.update(deliveryRef, { status: 'DELIVERED', deliveredAt: now, updatedAt: now, publicCode: FieldValue.delete() });
    transaction.set(db.doc(`deliveryDrivers/${uid}/deliveryHistory/${deliveryId}`), { deliveryId, orderId: orderRef.id, orderNumber: delivery.data()?.orderNumber ?? order.data()?.orderNumber ?? orderRef.id, customerName: delivery.data()?.customerName ?? 'Cliente', status: 'DELIVERED', updatedAt: now }, { merge: true });
    transaction.update(driverRef, { status: 'AVAILABLE', currentDeliveryId: FieldValue.delete(), updatedAt: now });
    transaction.update(orderRef, { status: 'COMPLETED', deliveryStatus: 'DELIVERED', deliveryUpdatedAt: now, statusMessage: getCustomerOrderStatusMessage('COMPLETED'), updatedAt: now, statusHistory: FieldValue.arrayUnion({ status: 'COMPLETED', at: Timestamp.now(), actorUid: uid, actorRole: 'driver', reason: 'Código confirmado na entrega' }) });
    if (publicCode) transaction.set(db.doc(`publicOrders/${publicCode}`), { status: 'COMPLETED', deliveryStatus: 'DELIVERED', statusMessage: getCustomerOrderStatusMessage('COMPLETED'), updatedAt: now }, { merge: true });
    const paymentMethod = order.data()?.payment?.method === 'PIX' || order.data()?.payment?.method === 'CARD' || order.data()?.payment?.method === 'CASH' ? order.data()?.payment?.method : 'OTHER';
    if (!finance.exists) transaction.create(financeRef, { kind: 'INCOME', category: 'Vendas de açaí', description: `Pedido ${order.data()?.orderNumber ?? delivery.data()?.orderId}`, amountCents: totalCents, date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()), status: 'PAID', orderNumber: order.data()?.orderNumber ?? null, sourceOrderId: delivery.data()?.orderId, paymentMethod, notes: 'Lançamento criado automaticamente ao confirmar a entrega.', createdAt: now, updatedAt: now });
    if (!sale.exists) {
      const cashAmountCents = paymentMethod === 'CASH' ? totalCents : 0;
      transaction.create(saleRef, { registerId, type: 'SALE', direction: 'IN', amountCents: totalCents, cashAmountCents, paymentMethod, orderNumber: order.data()?.orderNumber ?? null, sourceOrderId: delivery.data()?.orderId, operatorUid: uid, operatorEmail: typeof request.auth?.token.email === 'string' ? request.auth.token.email : null, note: 'Venda registrada ao confirmar a entrega.', createdAt: now });
      transaction.update(register.ref, { expectedCashCents: expectedCashCents + cashAmountCents, lastMovementAt: now, updatedAt: now });
    }
    transaction.create(db.doc(`deliveryEvents/${eventId}`), { deliveryId, driverId: uid, type: 'DELIVERED', actorUid: uid, actorRole: 'driver', createdAt: now });
  });
  if (invalidCode) throw new HttpsError('permission-denied', 'Código incorreto.');
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
