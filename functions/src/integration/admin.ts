import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { emptyMappings, variantMappingKey, type IntegrationMappings } from '../../../shared/integration.js';
import { configuredMode, providerFor } from './provider.js';
import { processIntegration } from './service.js';
import { currentTenant, requireTenantRole, tenantDb, tenantOnCall } from '../tenant.js';

const options = { region: 'southamerica-east1', enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' };
const code = z.string().trim().min(1).max(120).refine((value) => [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127), 'Código contém caracteres de controle.');
const codes = z.record(z.string().min(1).max(220), code);
const schema = z.object({ revision: z.number().int().min(0), mappings: z.object({ products: codes, variants: codes, modifiers: codes, payments: codes }) });
export const saveIntegrationMappings = tenantOnCall(options, async (request) => {
  await requireTenantRole(request.auth?.uid, ['tenant_owner', 'admin']);
  const parsed = schema.safeParse(request.data);
  if (!parsed.success || JSON.stringify(request.data).length > 300_000) throw new HttpsError('invalid-argument', 'Revise os códigos e o tamanho do cadastro.');
  const ref = tenantDb.doc('integrationConfig/saipos');
  await tenantDb.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const revision = doc.data()?.revision ?? 0;
    if (revision !== parsed.data.revision) throw new HttpsError('aborted', 'Outro administrador alterou os códigos. Recarregue antes de salvar.');
    tx.set(ref, { mappings: parsed.data.mappings, revision: revision + 1, updatedBy: request.auth!.uid, updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});
export const getIntegrationReadiness = tenantOnCall(options, async (request) => {
  await requireTenantRole(request.auth?.uid, ['tenant_owner', 'admin']);
  const db = tenantDb;
  const [config, products, modifiers, store] = await Promise.all([db.doc('integrationConfig/saipos').get(), db.collection('products').where('active', '==', true).get(), db.collection('modifiers').where('active', '==', true).get(), db.doc('settings/public').get()]);
  const mappings = (config.data()?.mappings ?? emptyMappings()) as IntegrationMappings;
  const rows: Array<{ kind: keyof IntegrationMappings; key: string; label: string }> = [];
  for (const product of products.docs) {
    rows.push({ kind: 'products', key: product.id, label: product.data().name });
    for (const size of product.data().sizes ?? []) if (size.active) rows.push({ kind: 'variants', key: variantMappingKey(product.id, size.id), label: `${product.data().name} · ${size.label}` });
  }
  for (const modifier of modifiers.docs) rows.push({ kind: 'modifiers', key: modifier.id, label: modifier.data().name });
  for (const payment of store.data()?.paymentMethods ?? []) rows.push({ kind: 'payments', key: payment, label: payment });
  let mode = 'invalid'; let status = 'CONFIGURATION_INCOMPLETE'; let message = 'Configuração inválida.';
  try {
    mode = configuredMode();
    if (mode === 'disabled') { status = 'DISABLED'; message = 'Pedidos são salvos internamente. Integração desabilitada.'; }
    else if (mode === 'local') { providerFor('local'); status = 'LOCAL_TEST'; message = 'Simulador restrito ao emulador; nenhuma venda real.'; }
    else { message = 'Contrato de criação de pedidos, credenciais e homologação Saipos pendentes. Não conectado.'; }
  } catch { message = 'Modo local proibido fora dos emuladores ou configuração inválida.'; }
  return { mode, status, message, mappings, revision: config.data()?.revision ?? 0, rows, missingCount: rows.filter((row) => !mappings[row.kind]?.[row.key]).length };
});
export const retryOrderIntegration = tenantOnCall(options, async (request) => {
  await requireTenantRole(request.auth?.uid, ['tenant_owner', 'admin']);
  const input = z.object({ orderId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/) }).safeParse(request.data);
  if (!input.success) throw new HttpsError('invalid-argument', 'Pedido inválido.');
  const state = await processIntegration(currentTenant().tenantId, input.data.orderId);
  if (!state) throw new HttpsError('failed-precondition', 'Pedido antigo ou sem integração.');
  return state;
});
