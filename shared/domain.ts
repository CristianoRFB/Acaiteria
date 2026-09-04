export type OrderStatus = 'NEW' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'COMPLETED' | 'CANCELLED';
export type FulfillmentMode = 'PICKUP' | 'DELIVERY';
export type DeliveryMode = 'NONE' | 'CONFIRM' | 'FIXED' | 'ZONES';
export type Role = 'admin' | 'staff';

export interface StoreHoursWindow { open: string; close: string }
export interface StoreDayHours { day: number; closed: boolean; windows: StoreHoursWindow[] }
export interface DeliveryZone { id: string; name: string; feeCents: number; active: boolean }
export type StoreScheduleConfig = Pick<StorePublicConfig, 'hours' | 'timezone'> & Partial<Pick<StorePublicConfig, 'holidayDates' | 'holidayHours'>>;
export interface BusinessHoursForDate extends StoreDayHours { date: string; isHoliday: boolean }
export interface NextOpening { date: string; day: number; open: string; close: string; isHoliday: boolean; dayOffset: number }
export interface DeliveryEstimate { label: string; detail: string; busy: boolean }
export interface StoreAvailability {
  acceptingOrders: boolean;
  scheduleOpen: boolean;
  reason: 'OPEN' | 'INACTIVE' | 'PAUSED' | 'OUTSIDE_HOURS';
  today: BusinessHoursForDate;
  closesAt?: string;
  nextOpening: NextOpening | null;
  estimate: DeliveryEstimate;
}
export interface StorePublicConfig {
  storeName: string;
  instagramHandle?: string;
  address?: string;
  city?: string;
  phoneDisplay?: string;
  whatsappNumber?: string;
  whatsappEnabled: boolean;
  orderingEnabled: boolean;
  pauseMessage?: string;
  enforceHours: boolean;
  timezone: string;
  hours: StoreDayHours[];
  holidayDates?: string[];
  holidayHours?: StoreHoursWindow[];
  fulfillmentModes: FulfillmentMode[];
  paymentMethods: Array<'PIX' | 'CARD' | 'CASH'>;
  deliveryConfig: { mode: DeliveryMode; fixedFeeCents?: number; zones?: DeliveryZone[] };
  orderInstructions?: string;
  deliveryEstimate?: string;
  busyDeliveryEstimate?: string;
  holidayHoursNote?: string;
  gratitudeMessage?: string;
  privacyNotice?: string;
  status: 'ACTIVE' | 'INACTIVE';
  updatedAt?: unknown;
}

export interface ProductCategory { id: string; name: string; active: boolean; displayOrder: number }
export interface ProductSize {
  id: string;
  label: string;
  active: boolean;
  basePriceCents: number;
  includedModifiersCount?: number;
  displayOrder: number;
}
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  categoryId: string;
  productType: 'CUSTOMIZABLE' | 'SIMPLE';
  imageUrl?: string;
  displayOrder: number;
  sizes: ProductSize[];
  modifierGroupIds: string[];
  updatedAt?: unknown;
}
export interface ModifierGroup {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  freeIncludedCount?: number;
  allowDuplicate: boolean;
  maxPerModifier?: number;
  appliesToSizeIds?: string[];
  displayOrder: number;
  pricingMode: 'individual' | 'includedQuota';
  modifierIds: string[];
}
export interface Modifier {
  id: string;
  name: string;
  active: boolean;
  available: boolean;
  priceCents: number;
  premium: boolean;
  maxQuantity?: number;
  allergenKeys: string[];
  displayOrder: number;
  imageUrl?: string;
  updatedAt?: unknown;
}
export interface ModifierSelection { modifierId: string; quantity: number }
export interface GroupSelection { groupId: string; items: ModifierSelection[] }
export interface CartItemDraft {
  cartItemId: string;
  productId: string;
  sizeId: string;
  selections: GroupSelection[];
  quantity: number;
  notes?: string;
  catalogVersion?: string;
}
export interface CatalogSnapshot {
  products: Product[];
  categories: ProductCategory[];
  groups: ModifierGroup[];
  modifiers: Modifier[];
}

export interface GroupValidation { valid: boolean; errors: string[]; selectionCount: number }
export interface PricedModifierSelection extends ModifierSelection {
  name: string;
  unitChargeCents: number;
  totalChargeCents: number;
  premium: boolean;
}
export interface PricedGroupSelection { groupId: string; groupName: string; items: PricedModifierSelection[] }
export interface PricedItem {
  productId: string;
  productName: string;
  sizeId: string;
  sizeLabel: string;
  quantity: number;
  modifierSelections: PricedGroupSelection[];
  unitPriceCents: number;
  totalPriceCents: number;
  notes?: string;
}

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function sumMoney(values: number[]): number {
  return values.reduce((total, value) => {
    if (!Number.isSafeInteger(value)) throw new Error('Valor monetário inválido.');
    return total + value;
  }, 0);
}

export function normalizeSelections(selections: GroupSelection[]): GroupSelection[] {
  const groups = new Map<string, Map<string, number>>();
  for (const selection of selections) {
    const items = groups.get(selection.groupId) ?? new Map<string, number>();
    for (const item of selection.items) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) continue;
      items.set(item.modifierId, (items.get(item.modifierId) ?? 0) + item.quantity);
    }
    groups.set(selection.groupId, items);
  }
  return [...groups.entries()].map(([groupId, items]) => ({
    groupId,
    items: [...items.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([modifierId, quantity]) => ({ modifierId, quantity })),
  })).sort((a, b) => a.groupId.localeCompare(b.groupId));
}

export function getEffectiveGroupRules(group: ModifierGroup, sizeId: string): ModifierGroup | null {
  if (!group.active) return null;
  if (group.appliesToSizeIds?.length && !group.appliesToSizeIds.includes(sizeId)) return null;
  return group;
}

export function validateGroupSelection(group: ModifierGroup, selection: GroupSelection | undefined, modifiersById: Map<string, Modifier>): GroupValidation {
  const errors: string[] = [];
  const items = selection?.items ?? [];
  const count = items.reduce((total, item) => total + item.quantity, 0);
  if (count < group.minSelections || (group.required && count === 0)) errors.push(`Escolha pelo menos ${Math.max(group.minSelections, 1)} em ${group.name}.`);
  if (count > group.maxSelections) errors.push(`Escolha no máximo ${group.maxSelections} em ${group.name}.`);
  for (const item of items) {
    const modifier = modifiersById.get(item.modifierId);
    if (!group.modifierIds.includes(item.modifierId) || !modifier?.active) errors.push('Adicional inválido.');
    else if (!modifier.available) errors.push(`${modifier.name} está indisponível.`);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) errors.push('Quantidade inválida.');
    const max = Math.min(group.maxPerModifier ?? Number.MAX_SAFE_INTEGER, modifier?.maxQuantity ?? Number.MAX_SAFE_INTEGER);
    if ((!group.allowDuplicate && item.quantity > 1) || item.quantity > max) errors.push(`Quantidade de ${modifier?.name ?? 'adicional'} acima do permitido.`);
  }
  return { valid: errors.length === 0, errors, selectionCount: count };
}

export function validateProductConfiguration(product: Product, groups: ModifierGroup[], modifiers: Modifier[]): string[] {
  const errors: string[] = [];
  if (!product.sizes.some((size) => size.active)) errors.push('Produto sem tamanho ativo.');
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const modifierMap = new Map(modifiers.map((modifier) => [modifier.id, modifier]));
  for (const groupId of product.modifierGroupIds) {
    const group = groupMap.get(groupId);
    if (!group) errors.push(`Grupo ${groupId} não existe.`);
    else {
      if (group.minSelections > group.maxSelections) errors.push(`Limites inválidos em ${group.name}.`);
      for (const modifierId of group.modifierIds) if (!modifierMap.has(modifierId)) errors.push(`Adicional ${modifierId} não existe.`);
    }
  }
  return errors;
}

export function calculateIncludedUsage(group: ModifierGroup, size: ProductSize, selections: ModifierSelection[], modifiersById: Map<string, Modifier>, remainingGlobalQuota: number): { freeUnits: number; remainingGlobalQuota: number } {
  if (group.pricingMode !== 'includedQuota') return { freeUnits: 0, remainingGlobalQuota };
  const eligible = selections.reduce((total, item) => total + (modifiersById.get(item.modifierId)?.premium ? 0 : item.quantity), 0);
  if (typeof group.freeIncludedCount === 'number') return { freeUnits: Math.min(eligible, group.freeIncludedCount), remainingGlobalQuota };
  const freeUnits = Math.min(eligible, remainingGlobalQuota, size.includedModifiersCount ?? 0);
  return { freeUnits, remainingGlobalQuota: remainingGlobalQuota - freeUnits };
}

export function calculateModifierCharges(group: ModifierGroup, size: ProductSize, selections: ModifierSelection[], modifiersById: Map<string, Modifier>, remainingGlobalQuota: number): { items: PricedModifierSelection[]; remainingGlobalQuota: number } {
  const usage = calculateIncludedUsage(group, size, selections, modifiersById, remainingGlobalQuota);
  let freeLeft = usage.freeUnits;
  const items: PricedModifierSelection[] = [];
  for (const selection of selections) {
    const modifier = modifiersById.get(selection.modifierId);
    if (!modifier) continue;
    const free = modifier.premium || group.pricingMode === 'individual' ? 0 : Math.min(freeLeft, selection.quantity);
    freeLeft -= free;
    const chargedQuantity = selection.quantity - free;
    items.push({ ...selection, name: modifier.name, premium: modifier.premium, unitChargeCents: modifier.priceCents, totalChargeCents: chargedQuantity * modifier.priceCents });
  }
  return { items, remainingGlobalQuota: usage.remainingGlobalQuota };
}

export function calculateItemPrice(draft: CartItemDraft, catalog: CatalogSnapshot): PricedItem {
  const product = catalog.products.find((candidate) => candidate.id === draft.productId && candidate.active);
  if (!product) throw new Error('Produto indisponível.');
  const size = product.sizes.find((candidate) => candidate.id === draft.sizeId && candidate.active);
  if (!size) throw new Error('Tamanho indisponível.');
  if (!Number.isSafeInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > 20) throw new Error('Quantidade inválida.');

  const normalized = normalizeSelections(draft.selections);
  const selectionMap = new Map(normalized.map((selection) => [selection.groupId, selection]));
  const groupsById = new Map(catalog.groups.map((group) => [group.id, group]));
  const modifiersById = new Map(catalog.modifiers.map((modifier) => [modifier.id, modifier]));
  const pricedGroups: PricedGroupSelection[] = [];
  let remainingGlobalQuota = size.includedModifiersCount ?? 0;
  let modifiersTotal = 0;

  const effectiveGroups = product.modifierGroupIds
    .map((groupId) => groupsById.get(groupId))
    .filter((group): group is ModifierGroup => Boolean(group))
    .sort((a, b) => a.displayOrder - b.displayOrder);
  for (const rawGroup of effectiveGroups) {
    const group = getEffectiveGroupRules(rawGroup, size.id);
    if (!group) continue;
    const selection = selectionMap.get(group.id);
    const validation = validateGroupSelection(group, selection, modifiersById);
    if (!validation.valid) throw new Error(validation.errors[0]);
    const charges = calculateModifierCharges(group, size, selection?.items ?? [], modifiersById, remainingGlobalQuota);
    remainingGlobalQuota = charges.remainingGlobalQuota;
    modifiersTotal += sumMoney(charges.items.map((item) => item.totalChargeCents));
    pricedGroups.push({ groupId: group.id, groupName: group.name, items: charges.items });
  }
  for (const selection of normalized) if (!effectiveGroups.some((group) => group.id === selection.groupId)) throw new Error('Grupo de adicionais inválido.');
  const unitPriceCents = size.basePriceCents + modifiersTotal;
  return { productId: product.id, productName: product.name, sizeId: size.id, sizeLabel: size.label, quantity: draft.quantity, modifierSelections: pricedGroups, unitPriceCents, totalPriceCents: unitPriceCents * draft.quantity, ...(draft.notes ? { notes: draft.notes.slice(0, 300) } : {}) };
}

export function calculateCartPreview(items: CartItemDraft[], catalog: CatalogSnapshot): { items: PricedItem[]; subtotalCents: number } {
  const priced = items.map((item) => calculateItemPrice(item, catalog));
  return { items: priced, subtotalCents: sumMoney(priced.map((item) => item.totalPriceCents)) };
}

const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getZonedParts(now: Date, timezone: string): { date: string; day: number; minutes: number } {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    day: dayMap[parts.weekday],
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function getBusinessHours(now: Date, config: StoreScheduleConfig): BusinessHoursForDate {
  const zoned = getZonedParts(now, config.timezone);
  const isHoliday = Boolean(config.holidayDates?.includes(zoned.date));
  if (isHoliday) return { date: zoned.date, day: zoned.day, closed: !(config.holidayHours?.length), windows: config.holidayHours ?? [], isHoliday: true };
  const weekly = config.hours.find((candidate) => candidate.day === zoned.day);
  return { date: zoned.date, day: zoned.day, closed: weekly?.closed ?? true, windows: weekly?.windows ?? [], isHoliday: false };
}

export function getTodayDeliveryHours(now: Date, config: StoreScheduleConfig): string {
  const schedule = getBusinessHours(now, config);
  return schedule.closed || !schedule.windows.length ? 'Fechado' : schedule.windows.map((window) => `${window.open} às ${window.close}`).join(' / ');
}

export function isStoreOpen(now: Date, config: StoreScheduleConfig): boolean {
  try {
    const schedule = getBusinessHours(now, config);
    if (schedule.closed) return false;
    const minutes = getZonedParts(now, config.timezone).minutes;
    return schedule.windows.some((window) => {
      const start = timeToMinutes(window.open);
      const end = timeToMinutes(window.close);
      return Number.isFinite(start) && Number.isFinite(end) && (end >= start ? minutes >= start && minutes < end : minutes >= start || minutes < end);
    });
  } catch {
    return false;
  }
}

export function getNextOpening(now: Date, config: StoreScheduleConfig): NextOpening | null {
  try {
    const current = getZonedParts(now, config.timezone);
    const seenDates = new Set<string>();
    for (let offset = 0; offset <= 370; offset += 1) {
      const probe = new Date(now.getTime() + offset * 86_400_000);
      const zoned = getZonedParts(probe, config.timezone);
      if (seenDates.has(zoned.date)) continue;
      seenDates.add(zoned.date);
      const schedule = getBusinessHours(probe, config);
      if (schedule.closed) continue;
      for (const window of [...schedule.windows].sort((a, b) => a.open.localeCompare(b.open))) {
        const startsAt = timeToMinutes(window.open);
        if (!Number.isFinite(startsAt) || !Number.isFinite(timeToMinutes(window.close))) continue;
        if (zoned.date === current.date && startsAt <= current.minutes) continue;
        return { date: zoned.date, day: zoned.day, open: window.open, close: window.close, isHoliday: schedule.isHoliday, dayOffset: seenDates.size - 1 };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function formatNextOpening(next: NextOpening | null): string {
  if (!next) return 'Sem próxima abertura configurada';
  if (next.dayOffset === 0) return `Hoje às ${next.open}`;
  if (next.dayOffset === 1) return `Amanhã às ${next.open}`;
  const names = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  return `${names[next.day]} às ${next.open}`;
}

export function getDeliveryEstimate(now: Date, config: StoreScheduleConfig): DeliveryEstimate {
  let busy = true;
  try {
    const schedule = getBusinessHours(now, config);
    busy = schedule.isHoliday || schedule.day === 0 || schedule.day === 6;
  } catch {
    // An invalid timezone/configuration must never produce an optimistic promise.
  }
  return busy
    ? { label: 'a partir de 60 min', detail: 'O tempo pode variar conforme a demanda.', busy: true }
    : { label: '30–40 min', detail: 'O tempo pode variar conforme a demanda.', busy: false };
}

export function getStoreAvailability(now: Date, config: StorePublicConfig): StoreAvailability {
  let today: BusinessHoursForDate;
  try {
    today = getBusinessHours(now, config);
  } catch {
    today = { date: '', day: 0, closed: true, windows: [], isHoliday: false };
  }
  const scheduleOpen = isStoreOpen(now, config);
  const active = config.status === 'ACTIVE';
  const enabled = config.orderingEnabled;
  const acceptingOrders = active && enabled && (!config.enforceHours || scheduleOpen);
  const reason = !active ? 'INACTIVE' : !enabled ? 'PAUSED' : config.enforceHours && !scheduleOpen ? 'OUTSIDE_HOURS' : 'OPEN';
  const minutes = (() => { try { return getZonedParts(now, config.timezone).minutes; } catch { return -1; } })();
  const currentWindow = scheduleOpen ? today.windows.find((window) => {
    const start = timeToMinutes(window.open);
    const end = timeToMinutes(window.close);
    return end >= start ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  }) : undefined;
  return {
    acceptingOrders,
    scheduleOpen,
    reason,
    today,
    ...(currentWindow ? { closesAt: currentWindow.close } : {}),
    nextOpening: scheduleOpen ? null : getNextOpening(now, config),
    estimate: getDeliveryEstimate(now, config),
  };
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const withCountry = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (withCountry.length < 12 || withCountry.length > 13) throw new Error('WhatsApp inválido.');
  return withCountry;
}

export function calculateDeliveryFee(config: StorePublicConfig['deliveryConfig'], fulfillment: FulfillmentMode, zoneId?: string): number {
  if (fulfillment === 'PICKUP') return 0;
  if (config.mode === 'NONE') throw new Error('Delivery indisponível.');
  if (config.mode === 'CONFIRM') return 0;
  if (config.mode === 'FIXED') return config.fixedFeeCents ?? 0;
  const zone = config.zones?.find((candidate) => candidate.id === zoneId && candidate.active);
  if (!zone) throw new Error('Selecione uma região de entrega válida.');
  return zone.feeCents;
}
