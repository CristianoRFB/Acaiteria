import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, collection } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;
beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8180').split(':');
  env = await initializeTestEnvironment({ projectId: 'demo-acai-mais-sabor', firestore: { host, port: Number(port), rules: readFileSync(resolve('firestore.rules'), 'utf8') } });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'products', 'active'), { active: true, displayOrder: 1 });
    await setDoc(doc(db, 'orders', 'secret'), { status: 'NEW' });
    await setDoc(doc(db, 'users', 'admin-uid'), { role: 'admin' });
    await setDoc(doc(db, 'users', 'staff-uid'), { role: 'staff' });
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
  });
  it('admin gerencia catálogo e configuração, mas não escreve pedido direto', async () => {
    const db = env.authenticatedContext('admin-uid').firestore();
    await assertSucceeds(setDoc(doc(db, 'products', 'new'), { active: true, displayOrder: 2 }));
    await assertSucceeds(setDoc(doc(db, 'storePublicConfig', 'main'), { orderingEnabled: true }));
    await assertFails(setDoc(doc(db, 'orders', 'bypass'), { status: 'COMPLETED' }));
    await assertFails(setDoc(doc(db, 'integrationConfig', 'saipos'), { mappings: {} }));
  });
});
