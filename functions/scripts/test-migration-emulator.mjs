import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT;
if (!process.env.FIRESTORE_EMULATOR_HOST || !projectId?.startsWith('demo-')) {
  throw new Error('Teste de migração bloqueado: exige Firestore Emulator e project ID demo-.');
}
if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = resolve(root, 'functions/scripts/migrate-single-tenant-to-tenant-a.mjs');
const tenantPath = 'tenants/acai-mais-sabor';
const fixtures = [
  ['categories/migration-category', { name: 'Categoria de teste', active: true, displayOrder: 1 }],
  ['products/migration-product', { name: 'Produto de teste', slug: 'produto-de-teste', description: 'Fixture fictícia', active: true, categoryId: 'migration-category', productType: 'SIMPLE', displayOrder: 1, sizes: [{ id: 'unico', label: 'Único', active: true, basePriceCents: 1000, displayOrder: 1 }], modifierGroupIds: [] }],
  ['modifierGroups/migration-group', { name: 'Grupo de teste', modifierIds: ['migration-modifier'] }],
  ['modifiers/migration-modifier', { name: 'Adicional de teste', priceCents: 100 }],
  ['orders/migration-order', { status: 'COMPLETED', publicCode: 'MIGRATION-CODE', pricing: { totalCents: 1000 } }],
  ['publicOrders/MIGRATION-CODE', { publicCode: 'MIGRATION-CODE', status: 'COMPLETED' }],
  ['deliveryDrivers/migration-driver', { name: 'Entregador fictício' }],
  ['deliveries/migration-delivery', { orderId: 'migration-order', driverId: 'migration-driver' }],
  ['financeEntries/migration-finance', { sourceOrderId: 'migration-order', amountCents: 1000 }],
  ['cashRegisters/migration-register', { status: 'CLOSED' }],
  ['cashMovements/migration-movement', { registerId: 'migration-register', amountCents: 1000 }],
  ['users/migration-owner', { role: 'admin', active: true }],
];

for (const [path, data] of fixtures) await db.doc(path).set(data);
await Promise.all([
  db.doc('storePublicConfig/main').set({ storeName: 'Loja fictícia de teste', timezone: 'America/Sao_Paulo' }),
  db.doc('storePrivateConfig/migration-config').set({ integration: 'fixture-only' }),
  db.doc('orders/migration-order/integrationAttempts/attempt-1').set({ status: 'PENDING' }),
  db.doc('deliveryDrivers/migration-driver/deliveryHistory/history-1').set({ status: 'DELIVERED' }),
]);

const dryRun = runMigration([]);
assert.equal(dryRun.status, 0, dryRun.stderr);
const dryReport = parseReport(dryRun.stdout);
assert.equal(dryReport.mode, 'DRY_RUN');
assert.equal(dryReport.sourceCollections.categories.before, 1);
assert.equal(dryReport.sourceCollections.categories.toCopy, 1);
assert.deepEqual(dryReport.referenceErrors, []);
assert.equal(dryReport.sourceRetained, true);
assert.equal(dryReport.destructiveDeletes, 0);
assert.equal((await db.doc(`${tenantPath}/products/migration-product`).get()).exists, false);
process.stdout.write('✓ dry-run informa contagens/referências e não grava destino\n');

const firstApply = runMigration(['--apply', '--confirm-tenant-a-copy']);
assert.equal(firstApply.status, 0, firstApply.stderr);
const firstReport = parseReport(firstApply.stdout);
assert.equal(firstReport.mode, 'APPLY_COPY_ONLY');
assert.equal(firstReport.sourceCollections.categories.after, 1);
assert.equal((await db.doc(`${tenantPath}/products/migration-product`).get()).data()?.migrationMetadata?.source, 'legacy-single-tenant-v1');
assert.equal((await db.doc(`${tenantPath}/members/migration-owner`).get()).data()?.role, 'tenant_owner');
assert.equal((await db.doc(`${tenantPath}/private/storePrivateConfig/documents/migration-config`).get()).exists, true);
assert.equal((await db.doc(`${tenantPath}/orders/migration-order/integrationAttempts/attempt-1`).get()).exists, true);
assert.equal((await db.doc(`${tenantPath}/deliveryDrivers/migration-driver/deliveryHistory/history-1`).get()).exists, true);
assert.equal((await db.doc('products/migration-product').get()).exists, true);
process.stdout.write('✓ primeira execução copia dados, memberships e subdocumentos sem remover a origem\n');

await db.doc(`${tenantPath}/products/migration-product`).delete();
const retry = runMigration(['--apply', '--confirm-tenant-a-copy']);
assert.equal(retry.status, 0, retry.stderr);
const retryReport = parseReport(retry.stdout);
assert.equal(retryReport.sourceCollections.categories.toCopy, 0);
assert.equal(retryReport.sourceCollections.categories.alreadyPresent, 1);
assert.equal(retryReport.sourceCollections.products.toCopy, 1);
assert.equal((await db.doc(`${tenantPath}/products/migration-product`).get()).exists, true);
process.stdout.write('✓ reexecução é idempotente e retoma uma cópia parcial sem sobrescrever o restante\n');

await db.doc('financeEntries/migration-orphan').set({ sourceOrderId: 'missing-order', amountCents: 50 });
const invalidReferences = runMigration([]);
assert.equal(invalidReferences.status, 2);
assert.equal(parseReport(invalidReferences.stdout).referenceErrors.some((error) => error.referencedId === 'missing-order'), true);
assert.equal((await db.doc(`${tenantPath}/financeEntries/migration-orphan`).get()).exists, false);
process.stdout.write('✓ referência quebrada falha antes de qualquer gravação\n');

const conflictingCategory = { name: 'Conteúdo divergente', active: true, displayOrder: 1 };
await db.doc(`${tenantPath}/categories/migration-category`).set(conflictingCategory);
const conflict = runMigration([]);
assert.equal(conflict.status, 2);
assert.equal(parseReport(conflict.stdout).conflicts.some((entry) => entry.target.endsWith('/categories/migration-category')), true);
assert.deepEqual((await db.doc(`${tenantPath}/categories/migration-category`).get()).data(), conflictingCategory);
process.stdout.write('✓ conflito no destino é preservado e bloqueia sobrescrita\n');
process.stdout.write('Migração de teste concluída somente no Emulator.\n');

function runMigration(extraArguments) {
  return spawnSync(process.execPath, [migration, `--project=${projectId}`, ...extraArguments], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
}

function parseReport(output) {
  const match = output.match(/^\{[\s\S]*?^\}/m);
  assert.ok(match, `Relatório JSON ausente na saída da migração: ${output.slice(0, 500)}`);
  return JSON.parse(match[0]);
}
