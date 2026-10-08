import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const tenantId = 'acai-mais-sabor';
const tenantSlug = 'acai-mais-sabor';
const apply = process.argv.includes('--apply');
const confirmCopy = process.argv.includes('--confirm-tenant-a-copy');
const projectArg = process.argv.find((value) => value.startsWith('--project='))?.slice('--project='.length);
const projectId = projectArg || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if (!projectId) throw new Error('Informe --project=<id> ou GOOGLE_CLOUD_PROJECT.');
if (apply && !emulator && !confirmCopy) throw new Error('Cópia bloqueada fora do Emulator. Revise o dry-run e repita com --apply --confirm-tenant-a-copy.');
if (emulator && !projectId.startsWith('demo-')) throw new Error('Emulator exige um Firebase project ID demo-.');
if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();
const base = `tenants/${tenantId}`;
const migrationMarker = 'legacy-single-tenant-v1';

const collectionMappings = [
  ['categories', 'categories'],
  ['products', 'products'],
  ['modifierGroups', 'modifierGroups'],
  ['modifiers', 'modifiers'],
  ['promotions', 'promotions'],
  ['orders', 'orders'],
  ['publicOrders', 'publicOrders'],
  ['orderRequests', 'orderRequests'],
  ['financeEntries', 'financeEntries'],
  ['cashControl', 'cashControl'],
  ['cashControlEvents', 'cashControlEvents'],
  ['cashRegisters', 'cashRegisters'],
  ['cashMovements', 'cashMovements'],
  ['deliveryDrivers', 'deliveryDrivers'],
  ['deliveries', 'deliveries'],
  ['deliveryEvents', 'deliveryEvents'],
  ['deliverySecrets', 'deliverySecrets'],
  ['integrationConfig', 'integrationConfig'],
];

const source = new Map();
const plannedWrites = [];
const counts = {};
const referenceErrors = [];
const conflicts = [];

const tenantSnapshot = await db.doc(`tenants/${tenantId}`).get();
const slugSnapshot = await db.doc(`tenantSlugs/${tenantSlug}`).get();
const migrationCreatedAt = tenantSnapshot.data()?.createdAt ?? slugSnapshot.data()?.createdAt ?? Timestamp.now();
if (slugSnapshot.exists && slugSnapshot.data()?.tenantId !== tenantId) {
  throw new Error(`Slug ${tenantSlug} já aponta para outro tenant; nenhum dado foi alterado.`);
}
if (tenantSnapshot.exists && tenantSnapshot.data()?.slug !== tenantSlug) {
  throw new Error(`Documento ${tenantId} já existe com outro slug; nenhum dado foi alterado.`);
}

for (const [sourceName, targetName] of collectionMappings) {
  const snapshot = await db.collection(sourceName).get();
  source.set(sourceName, snapshot.docs);
  counts[sourceName] = { before: snapshot.size, after: 0, toCopy: 0, alreadyPresent: 0 };
  for (const document of snapshot.docs) {
    await planWrite(document.ref.path, `${base}/${targetName}/${document.id}`, { ...document.data(), tenantId }, sourceName);
  }
}

const publicConfig = await db.doc('storePublicConfig/main').get();
if (publicConfig.exists) {
  source.set('storePublicConfig', [publicConfig]);
  counts.storePublicConfig = { before: 1, after: 0, toCopy: 0, alreadyPresent: 0 };
  await planWrite(publicConfig.ref.path, `${base}/settings/public`, publicConfig.data(), 'storePublicConfig');
}

const privateConfig = await db.collection('storePrivateConfig').get();
source.set('storePrivateConfig', privateConfig.docs);
counts.storePrivateConfig = { before: privateConfig.size, after: 0, toCopy: 0, alreadyPresent: 0 };
for (const document of privateConfig.docs) {
  await planWrite(document.ref.path, `${base}/private/storePrivateConfig/documents/${document.id}`, document.data(), 'storePrivateConfig');
}

const users = await db.collection('users').get();
source.set('users', users.docs);
counts.memberships = { before: 0, after: 0, toCopy: 0, alreadyPresent: 0 };
for (const user of users.docs) {
  const role = user.data()?.role;
  if (!['admin', 'staff', 'driver', 'tenant_owner'].includes(role)) continue;
  counts.memberships.before += 1;
  const membershipRole = role === 'admin' ? 'tenant_owner' : role;
  const status = user.data()?.active === false ? 'SUSPENDED' : 'ACTIVE';
  const accountCreatedAt = user.data()?.createdAt ?? user.createTime;
  await planWrite(user.ref.path, `${base}/members/${user.id}`, {
    userId: user.id,
    tenantId,
    role: membershipRole,
    status,
    createdAt: accountCreatedAt,
    updatedAt: user.data()?.updatedAt ?? accountCreatedAt,
  }, 'memberships');
}

await planNestedDocuments('deliveryDrivers', 'deliveryHistory');
await planNestedDocuments('orders', 'integrationAttempts');

const tenantData = {
  slug: tenantSlug,
  displayName: 'Açaí + Sabor',
  status: 'ACTIVE',
  branding: { primaryColor: '#82204f', secondaryColor: '#d7f04a', logoUrl: '/logo-acai-sabor.jpg' },
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  createdAt: migrationCreatedAt,
  updatedAt: tenantSnapshot.data()?.updatedAt ?? migrationCreatedAt,
};
await planWrite('legacy-config', `tenants/${tenantId}`, tenantData, 'tenant');
await planWrite('legacy-config', `tenantSlugs/${tenantSlug}`, { tenantId, createdAt: slugSnapshot.data()?.createdAt ?? migrationCreatedAt }, 'tenantSlug');

validateReferences();
for (const entry of Object.values(counts)) entry.after = entry.toCopy + entry.alreadyPresent;

const report = {
  mode: apply ? 'APPLY_COPY_ONLY' : 'DRY_RUN',
  projectId,
  tenantId,
  sourceCollections: Object.fromEntries(Object.entries(counts).map(([name, value]) => [name, { ...value }])),
  nestedDocuments: plannedWrites.filter((write) => write.sourcePath.includes('/deliveryHistory/') || write.sourcePath.includes('/integrationAttempts/')).length,
  referenceErrors,
  conflicts,
  sourceRetained: true,
  destructiveDeletes: 0,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (referenceErrors.length || conflicts.length) process.exitCode = 2;
else if (apply) await commitWrites();
else process.stdout.write('Dry-run concluído: nenhuma gravação foi executada.\n');

async function planWrite(sourcePath, targetPath, data, sourceName) {
  const ref = db.doc(targetPath);
  const existing = await ref.get();
  if (existing.exists) {
    if (hashForCompare(existing.data()) !== hashForCompare(data)) {
      conflicts.push({ source: sourcePath, target: targetPath, reason: 'Destino já existe com conteúdo diferente.' });
      return;
    }
    increment(sourceName, 'alreadyPresent');
    return;
  }
  const isTenantRoot = targetPath === `tenants/${tenantId}`;
  const isSlugIndex = targetPath === `tenantSlugs/${tenantSlug}`;
  const targetData = { ...data };
  if (!isTenantRoot && !isSlugIndex) {
    if (!('tenantId' in targetData)) targetData.tenantId = tenantId;
    targetData.migrationMetadata = { source: migrationMarker };
  }
  plannedWrites.push({ sourcePath, targetPath, data: targetData, sourceName });
  increment(sourceName, 'toCopy');
}

async function planNestedDocuments(parentCollection, childCollection) {
  for (const parent of source.get(parentCollection) ?? []) {
    const snapshot = await db.collection(parentCollection).doc(parent.id).collection(childCollection).get();
    for (const child of snapshot.docs) {
      await planWrite(
        `${parent.ref.path}/${childCollection}/${child.id}`,
        `${base}/${parentCollection}/${parent.id}/${childCollection}/${child.id}`,
        child.data(),
        `${parentCollection}.${childCollection}`,
      );
    }
  }
}

function increment(name, field) {
  counts[name] ??= { before: 0, after: 0, toCopy: 0, alreadyPresent: 0 };
  counts[name][field] += 1;
}

function validateReferences() {
  const ids = (name) => new Set((source.get(name) ?? []).map((document) => document.id));
  const categoryIds = ids('categories');
  const productIds = ids('products');
  const groupIds = ids('modifierGroups');
  const modifierIds = ids('modifiers');
  const orderDocs = source.get('orders') ?? [];
  const orderIds = new Set(orderDocs.map((document) => document.id));
  const publicCodes = new Set(orderDocs.map((document) => document.data()?.publicCode).filter(Boolean));
  const driverIds = ids('deliveryDrivers');
  const registerIds = ids('cashRegisters');

  for (const product of source.get('products') ?? []) {
    const data = product.data();
    if (data.categoryId && !categoryIds.has(data.categoryId)) missing(product.ref.path, 'categoryId', data.categoryId);
    for (const groupId of data.modifierGroupIds ?? []) if (!groupIds.has(groupId)) missing(product.ref.path, 'modifierGroupIds', groupId);
  }
  for (const group of source.get('modifierGroups') ?? []) {
    for (const modifierId of group.data()?.modifierIds ?? []) if (!modifierIds.has(modifierId)) missing(group.ref.path, 'modifierIds', modifierId);
  }
  for (const delivery of source.get('deliveries') ?? []) {
    const data = delivery.data();
    if (data.orderId && !orderIds.has(data.orderId)) missing(delivery.ref.path, 'orderId', data.orderId);
    if (data.driverId && !driverIds.has(data.driverId)) missing(delivery.ref.path, 'driverId', data.driverId);
  }
  for (const publicOrder of source.get('publicOrders') ?? []) {
    const code = publicOrder.data()?.publicCode ?? publicOrder.id;
    if (!publicCodes.has(code)) missing(publicOrder.ref.path, 'publicCode', code);
  }
  for (const finance of source.get('financeEntries') ?? []) {
    const orderId = finance.data()?.sourceOrderId;
    if (orderId && !orderIds.has(orderId)) missing(finance.ref.path, 'sourceOrderId', orderId);
  }
  for (const movement of source.get('cashMovements') ?? []) {
    const registerId = movement.data()?.registerId;
    if (registerId && !registerIds.has(registerId)) missing(movement.ref.path, 'registerId', registerId);
  }

  function missing(path, field, value) {
    referenceErrors.push({ path, field, referencedId: String(value).slice(0, 160) });
  }
}

function hashForCompare(value) {
  const normalized = normalize(value);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function normalize(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    if (typeof value.path === 'string' && value.constructor?.name === 'DocumentReference') return `ref:${value.path}`;
    return Object.fromEntries(Object.keys(value)
      .filter((key) => !['tenantId', 'migrationMetadata'].includes(key))
      .sort()
      .map((key) => [key, normalize(value[key])]));
  }
  return value;
}

async function commitWrites() {
  let index = 0;
  while (index < plannedWrites.length) {
    const batch = db.batch();
    const chunk = plannedWrites.slice(index, index + 450);
    for (const write of chunk) batch.create(db.doc(write.targetPath), write.data);
    await batch.commit();
    index += chunk.length;
    process.stdout.write(`Copiadas ${index}/${plannedWrites.length} gravações de forma idempotente.\n`);
  }
  process.stdout.write('Migração copy-only concluída. Os dados de origem permanecem intactos para validação e recuperação.\n');
}
