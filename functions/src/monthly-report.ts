import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';

import { canUseFeature } from '../../shared/entitlements.js';
import { getReportPeriod, localDateKey } from '../../shared/report-window.js';
import { resolveSubscriptionAccess } from '../../shared/subscription-status.js';
import { currentTenant, rawDb, requireTenantRole, tenantOnCall } from './tenant.js';

const schema = z.object({
  tenantSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
}).strict();

/**
 * Tenant-scoped commercial report, independently enforced by the backend.
 * Ledger records continue to exist outside the commercial reporting window.
 * Only the fields required for sales insights leave the backend. No customer
 * names, addresses, phone numbers, payment credentials or arbitrary order data.
 */
export const getTenantMonthlySalesReport = tenantOnCall({
  region: 'southamerica-east1',
  timeoutSeconds: 30,
  memory: '256MiB',
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
}, async (request) => {
  await requireTenantRole(request.auth?.uid, ['admin']);
  const parsed = schema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Mês de relatório inválido.');
  const { tenantId } = currentTenant();
  const [subscription, tenant] = await Promise.all([
    rawDb.doc(`tenants/${tenantId}/private/subscription`).get(),
    rawDb.doc(`tenants/${tenantId}`).get(),
  ]);
  const access = resolveSubscriptionAccess(subscription.data(), Date.now());
  if (access.state === 'BLOCKED') throw new HttpsError('failed-precondition', 'A assinatura não permite consultar relatórios comerciais.');
  const entitlements = access.entitlements;
  if (entitlements && !canUseFeature(entitlements, 'FINANCE_INSIGHTS')) {
    throw new HttpsError('permission-denied', 'Relatórios financeiros avançados não estão disponíveis neste plano.');
  }
  const timezone = tenant.data()?.timezone;
  if (typeof timezone !== 'string') throw new HttpsError('failed-precondition', 'Fuso horário não configurado.');
  let period;
  try { period = getReportPeriod(parsed.data.month, new Date(), entitlements?.limits.reportLookbackDays ?? null, timezone); }
  catch { throw new HttpsError('failed-precondition', 'Fuso horário ou janela de relatório inválidos.'); }
  if (!period) throw new HttpsError('permission-denied', 'Período fora do histórico comercial permitido pelo plano.');

  const { fromDate, untilDate } = period;
  // Extend the UTC query by 14h on both sides to include every valid
  // tenant-local day. Filter again using localDateKey for exact boundaries.
  const begin = Timestamp.fromMillis(Date.parse(`${fromDate}T00:00:00.000Z`) - 14 * 3600_000);
  const end = Timestamp.fromMillis(Date.parse(`${untilDate}T00:00:00.000Z`) + 14 * 3600_000);
  const [entries, orders] = await Promise.all([
    rawDb.collection(`tenants/${tenantId}/financeEntries`)
      .where('date', '>=', fromDate)
      .where('date', '<', untilDate).orderBy('date', 'desc').limit(1000).get(),
    rawDb.collection(`tenants/${tenantId}/orders`)
      .where('status', '==', 'COMPLETED')
      .where('updatedAt', '>=', begin)
      .where('updatedAt', '<', end)
      .orderBy('updatedAt', 'desc').limit(500).get(),
  ]);

  return {
    month: period.month,
    fromDate,
    untilDate,
    limited: period.limited,
    entries: entries.docs.map((entry) => {
      const d = entry.data();
      return {
        id: entry.id, date: d.date, kind: d.kind,
        status: d.status, category: d.category, amountCents: d.amountCents,
        paymentMethod: d.paymentMethod ?? 'OTHER',
        sourceOrderId: d.sourceOrderId ?? null, sourceLocalSaleId: d.sourceLocalSaleId ?? null,
      };
    }),
    orders: orders.docs.filter((order) => {
      const date = order.data().updatedAt;
      return date instanceof Timestamp && localDateKey(date.toDate(), timezone) >= fromDate &&
        localDateKey(date.toDate(), timezone) < untilDate;
    }).map((order) => {
      const d = order.data();
      return {
        id: order.id,
        items: Array.isArray(d.items) ? d.items.map((item: Record<string, unknown>) => ({
          productName: item.productName,
          quantity: item.quantity,
          totalPriceCents: item.totalPriceCents,
        })) : [],
        fulfillment: { mode: d.fulfillment?.mode },
        pricing: { totalCents: d.pricing?.totalCents },
      };
    }),
  };
});
