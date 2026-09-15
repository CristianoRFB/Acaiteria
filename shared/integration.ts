export type ProviderMode = 'disabled' | 'local' | 'saipos';
export type IntegrationStatus = 'PENDING' | 'SENDING' | 'ACCEPTED' | 'ERROR' | 'UNKNOWN' | 'DISABLED' | 'SKIPPED';
export interface IntegrationState {
  provider: ProviderMode;
  status: IntegrationStatus;
  attemptCount: number;
  externalOrderId?: string;
  errorCode?: string;
  message?: string;
  retryable?: boolean;
  nextAttemptAtMs?: number;
  leaseUntilMs?: number;
}
export interface IntegrationMappings {
  products: Record<string, string>;
  variants: Record<string, string>;
  modifiers: Record<string, string>;
  payments: Record<string, string>;
}
export const emptyMappings = (): IntegrationMappings => ({ products: {}, variants: {}, modifiers: {}, payments: {} });
export const variantMappingKey = (productId: string, sizeId: string) => `${productId}:${sizeId}`;
export function customerIntegrationMessage(state?: IntegrationState): string {
  if (!state) return 'Pedido recebido pela loja. Acompanhe a atualização nesta página.';
  if (state.provider === 'local') return 'Pedido de teste recebido no ambiente local. Nenhuma venda foi enviada ao Saipos.';
  if (state.status === 'ACCEPTED' && state.provider === 'saipos') return 'Pedido recebido pelo Saipos. Aguarde a confirmação operacional da loja.';
  return 'Recebemos seu pedido e estamos confirmando com a loja. Não envie outro pedido.';
}
