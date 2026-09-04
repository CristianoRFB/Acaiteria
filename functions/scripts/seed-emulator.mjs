import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { menuCatalog, storePublicConfigSeed } from '../../shared/menu-data.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Seed bloqueado: FIRESTORE_EMULATOR_HOST e FIREBASE_AUTH_EMULATOR_HOST são obrigatórios. Nunca execute este script contra produção.');
}

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-acai-mais-sabor' });
const db = getFirestore();
const now = Timestamp.now();
const batch = db.batch();

batch.set(db.doc('storePublicConfig/main'), {
  ...storePublicConfigSeed,
  updatedAt: now,
  developmentSeed: true,
});

for (const category of menuCatalog.categories) {
  const { id, ...data } = category;
  batch.set(db.doc(`categories/${id}`), { ...data, developmentSeed: true });
}

for (const product of menuCatalog.products) {
  const { id, ...data } = product;
  batch.set(db.doc(`products/${id}`), { ...data, updatedAt: now, developmentSeed: true });
}

for (const group of menuCatalog.groups) {
  const { id, ...data } = group;
  batch.set(db.doc(`modifierGroups/${id}`), { ...data, developmentSeed: true });
}

for (const modifier of menuCatalog.modifiers) {
  const { id, ...data } = modifier;
  batch.set(db.doc(`modifiers/${id}`), { ...data, updatedAt: now, developmentSeed: true });
}

await batch.commit();

if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
  let user;
  try {
    user = await getAuth().getUserByEmail(process.env.SEED_ADMIN_EMAIL);
  } catch {
    user = await getAuth().createUser({
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
      emailVerified: true,
    });
  }
  await db.doc(`users/${user.uid}`).set({ role: 'admin', email: process.env.SEED_ADMIN_EMAIL, developmentSeed: true });
  process.stdout.write('Cardápio completo criado no emulador, incluindo o usuário admin informado por ambiente.\n');
} else {
  process.stdout.write('Cardápio completo criado no emulador. Admin omitido: defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD para criá-lo.\n');
}
