import type { CatalogSnapshot, StorePublicConfig } from '@/shared/domain';
import { menuCatalog, storePublicConfigSeed } from '@/shared/menu-data.mjs';

export const developmentStoreConfig = storePublicConfigSeed as StorePublicConfig;
export const developmentCatalog = menuCatalog as CatalogSnapshot;
