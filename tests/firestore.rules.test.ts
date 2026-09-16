import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, collection, Timestamp } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;
beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8180').split(':');
  env = await initializeTestEnvironment({ projectId: 'demo-acai-mais-sabor', firestore: { host, port: Number(port), rules: readFileSync(resolve('firestore.rules'), 'utf8') } });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'products', 'active'), { name: 'Produto ativo', slug: 'produto-ativo', description: 'Descrição', active: true, categoryId: 'acai', productType: 'SIMPLE', displayOrder: 1, sizes: [], modifierGroupIds: [] });
    await setDoc(doc(db, 'orders', 'secret'), { status: 'NEW' });
    await setDoc(doc(db, 'users', 'admin-uid'), { role: 'admin' });
    await setDoc(doc(db, 'users', 'staff-uid'), { role: 'staff' });
    await setDoc(doc(db, 'cashRegisters', 'open'), { status: 'OPEN', expectedCashCents: 1000 });
    await setDoc(doc(db, 'cashMovements', 'movement'), { registerId: 'open', type: 'SUPPLY', direction: 'IN', amountCents: 100, cashAmountCents: 100 });
  });
});
afterAll(() => env.cleanup());

describe('Firestore Rules deny by default', () => {
  it('público lê catálogo ativo, mas não escreve nem acessa pedidos/usuários', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'products', 'active')));
    await assertFails(setDoc(doc(db, 'products', 'hacked'), { active: true }));
    await assertFails(getDocs(collection(db, 'orders')));
    await assertFails(getDoc(doc(db, 'orders', 'secret')));
    await assertFails(getDoc(doc(db, 'users', 'admin-uid')));
    await assertFails(getDoc(doc(db, 'integrationConfig', 'saipos')));
    await assertFails(getDocs(collection(db, 'orders', 'secret', 'integrationAttempts')));
  });
  it('staff lê pedidos, mas não ganha escrita administrativa', async () => {
    const db = env.authenticatedContext('staff-uid').firestore();
    await assertSucceeds(getDoc(doc(db, 'orders', 'secret')));
    await assertFails(setDoc(doc(db, 'products', 'blocked'), { active: true }));
    await assertFails(setDoc(doc(db, 'users', 'staff-uid'), { role: 'admin' }));
    await assertFails(setDoc(doc(db, 'cashRegisters', 'open'), { expectedCashCents: 999999 }, { merge: true }));
    await assertFails(setDoc(doc(db, 'cashMovements', 'forged'), { registerId: 'open', type: 'SALE', direction: 'IN', amountCents: 100, cashAmountCents: 100 }));
    await assertFails(setDoc(doc(db, 'financeEntries', 'order-forged'), { kind: 'INCOME', status: 'PAID', sourceOrderId: 'secret', amountCents: 100 }));
  });
  it('admin gerencia catálogo e configuração, mas não escreve pedido direto', async () => {
    const db = env.authenticatedContext('admin-uid').firestore();
    await assertSucceeds(setDoc(doc(db, 'products', 'new'), { name: 'Produto novo', slug: 'produto-novo', description: 'Descrição', active: true, categoryId: 'acai', productType: 'SIMPLE', displayOrder: 2, sizes: [], modifierGroupIds: [] }));
    await assertSucceeds(setDoc(doc(db, 'storePublicConfig', 'main'), { orderingEnabled: true }));
    await assertFails(setDoc(doc(db, 'orders', 'bypass'), { status: 'COMPLETED' }));
    await assertFails(setDoc(doc(db, 'financeEntries', 'manual'), { kind: 'EXPENSE', category: 'Insumos', description: 'Frutas', amountCents: 1200, date: '2026-09-16', status: 'PAID', orderNumber: null, notes: null, createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
    await assertFails(setDoc(doc(db, 'financeEntries', 'forged-source'), { kind: 'INCOME', category: 'Vendas de açaí', description: 'Fraude', amountCents: 999999, date: '2026-09-16', status: 'PAID', sourceOrderId: 'secret', createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
    await assertFails(setDoc(doc(db, 'publicOrders', 'spoofed'), { publicCode: 'spoofed', status: 'NEW', orderNumber: '#HACK', items: [{ productId: 'x' }], pricing: { totalCents: 1 } }));
    await assertFails(setDoc(doc(db, 'integrationConfig', 'saipos'), { mappings: {} }));
  });
});
