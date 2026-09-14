import type { PricedItem } from '../../../shared/domain.js';
import { variantMappingKey, type IntegrationMappings, type ProviderMode } from '../../../shared/integration.js';

export interface ProviderOrder {
  id: string;
  items: PricedItem[];
  payment: { method: string };
  pricing: { totalCents: number };
}
export interface OrderProvider {
  mode: ProviderMode;
  safeReplay: boolean;
  submitOrder(order: ProviderOrder, attempt: number): Promise<{ externalOrderId: string }>;
}
export class IntegrationError extends Error {
  constructor(public code: string, public category: 'TRANSIENT' | 'PERMANENT' | 'UNKNOWN', message: string) { super(message); }
}
export type LocalScenario = 'accept' | 'reject' | 'timeout' | 'transient' | 'permanent';
export class LocalOrderProvider implements OrderProvider {
  mode = 'local' as const;
  safeReplay = true;
  constructor(private scenario: LocalScenario = 'accept') {}
  async submitOrder(order: ProviderOrder, attempt: number) {
    if (this.scenario === 'reject') throw new IntegrationError('REJECTED', 'PERMANENT', 'Simulação: pedido rejeitado.');
    if (this.scenario === 'permanent') throw new IntegrationError('INVALID_PAYLOAD', 'PERMANENT', 'Simulação: dados inválidos.');
    if (this.scenario === 'timeout') throw new IntegrationError('TIMEOUT', 'TRANSIENT', 'Simulação: tempo esgotado.');
    if (this.scenario === 'transient' && attempt === 1) throw new IntegrationError('UNAVAILABLE', 'TRANSIENT', 'Simulação: indisponibilidade temporária.');
    return { externalOrderId: `LOCAL-${order.id}` };
  }
}
// No HTTP request is possible until the project's official order contract is available.
export class SaiposOrderProvider implements OrderProvider {
  mode = 'saipos' as const;
  safeReplay = false;
  async submitOrder(): Promise<{ externalOrderId: string }> {
    throw new IntegrationError('CONTRACT_UNCONFIRMED', 'PERMANENT', 'Contrato de pedidos Saipos e homologação pendentes.');
  }
}
export function configuredMode(): ProviderMode {
  const value = process.env.ORDER_PROVIDER ?? 'disabled';
  if (value === 'local' || value === 'saipos' || value === 'disabled') return value;
  throw new IntegrationError('INVALID_PROVIDER', 'PERMANENT', 'ORDER_PROVIDER inválido.');
}
export function providerFor(mode: ProviderMode): OrderProvider {
  if (mode === 'local') {
    if (process.env.FUNCTIONS_EMULATOR !== 'true' || !process.env.FIRESTORE_EMULATOR_HOST) throw new IntegrationError('LOCAL_FORBIDDEN', 'PERMANENT', 'Simulador permitido somente nos emuladores Firebase.');
    const scenario = process.env.LOCAL_PROVIDER_SCENARIO ?? 'accept';
    if (!['accept', 'reject', 'timeout', 'transient', 'permanent'].includes(scenario)) throw new IntegrationError('INVALID_SCENARIO', 'PERMANENT', 'Cenário local inválido.');
    return new LocalOrderProvider(scenario as LocalScenario);
  }
  if (mode === 'saipos') return new SaiposOrderProvider();
  throw new IntegrationError('DISABLED', 'PERMANENT', 'Integração desabilitada; pedido aguardando a loja.');
}
export function missingMappings(order: ProviderOrder, mappings: IntegrationMappings): string[] {
  const missing = new Set<string>();
  const check = (kind: keyof IntegrationMappings, key: string) => { if (!mappings[kind]?.[key]?.trim()) missing.add(`${kind}:${key}`); };
  for (const item of order.items) {
    check('products', item.productId);
    check('variants', variantMappingKey(item.productId, item.sizeId));
    for (const group of item.modifierSelections) for (const modifier of group.items) check('modifiers', modifier.modifierId);
  }
  check('payments', order.payment.method);
  return [...missing];
}
export function safeError(error: unknown): IntegrationError {
  return error instanceof IntegrationError ? error : new IntegrationError('UNKNOWN_RESULT', 'UNKNOWN', 'Resultado não confirmado. Reconciliação necessária antes de reenviar.');
}
export function retryDelay(attempt: number): number { return Math.min(300_000, 30_000 * 2 ** Math.max(0, attempt - 1)); }
export const MAX_ATTEMPTS = 3;
