import type { CatalogSnapshot, StorePublicConfig } from '@/shared/domain';
import { menuCatalog, storePublicConfigSeed } from '@/shared/menu-data.mjs';
import { defaultStorePublicConfig, normalizeStoreConfig } from '@/shared/store-config';

export const developmentStoreConfig = storePublicConfigSeed as StorePublicConfig;
export const developmentCatalog = menuCatalog as CatalogSnapshot;
export const developmentTenantBConfig = normalizeStoreConfig({
  ...defaultStorePublicConfig,
  storeName: 'Amora Açaí — Demonstração',
  address: 'Endereço fictício de demonstração',
  city: 'Local de demonstração',
  phoneDisplay: '',
  whatsappNumber: '',
  instagramHandle: '',
  whatsappEnabled: false,
  deliveryConfig: { mode: 'FIXED', fixedFeeCents: 500 },
  deliveryEstimate: 'Prazo fictício para validar a loja de demonstração.',
  busyDeliveryEstimate: 'Prazo fictício em períodos de demonstração movimentados.',
  gratitudeMessage: 'Obrigado por testar a loja de demonstração.',
  privacyNotice: 'Use somente dados fictícios nesta demonstração.',
});
