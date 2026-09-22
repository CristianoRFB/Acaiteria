import type { DeliveryMode, FulfillmentMode, StoreDayHours, StoreHoursWindow, StorePublicConfig } from './domain.js';

const defaultHours: StoreDayHours[] = [
  { day: 0, closed: false, windows: [{ open: '15:00', close: '21:50' }] },
  ...[1, 2, 3, 4, 5, 6].map((day) => ({ day, closed: false, windows: [{ open: '14:00', close: '21:50' }] })),
];
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const defaultStorePublicConfig: StorePublicConfig = {
  storeName: 'Açaí + Sabor',
  instagramHandle: '@acaimaissabor.stafedosul',
  address: 'Av. Navarro de Andrade, 246 - Centro, Santa Fé do Sul - SP, 15775-000, Brasil',
  city: 'Santa Fé do Sul/SP',
  phoneDisplay: '+55 17 98165-2600',
  whatsappNumber: '5517981652600',
  whatsappEnabled: true,
  orderingEnabled: true,
  pauseMessage: 'No momento, estamos fora do horário de entrega.',
  enforceHours: true,
  timezone: 'America/Sao_Paulo',
  hours: defaultHours,
  holidayDates: [],
  holidayHours: [{ open: '15:00', close: '21:50' }],
  fulfillmentModes: ['PICKUP', 'DELIVERY'],
  paymentMethods: ['PIX', 'CARD', 'CASH'],
  deliveryConfig: { mode: 'FIXED', fixedFeeCents: 400 },
  orderInstructions: 'Faça seu pedido e informe o endereço, a forma de pagamento e, caso precise, o valor para troco.',
  deliveryEstimate: 'O tempo de entrega varia de 30 a 40 minutos.',
  busyDeliveryEstimate: 'Aos finais de semana e feriados, o prazo pode ser de 60 minutos ou mais.',
  orderEstimateMinutes: 15,
  holidayHoursNote: 'Em feriados, entregamos das 15:00 às 21:50.',
  gratitudeMessage: 'Estamos à disposição! Somos gratos por essa troca! 🙏🏻🙏🏻🙏🏻',
  privacyNotice: 'Seus dados são usados apenas para preparar e entregar este pedido.',
  status: 'ACTIVE',
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized.includes('pendente') || normalized.includes('a confirmar') ? fallback : value.trim();
}

function bool(value: unknown, fallback: boolean): boolean { return typeof value === 'boolean' ? value : fallback; }

function safeWindows(value: unknown, fallback: StoreHoursWindow[]): StoreHoursWindow[] {
  if (!Array.isArray(value)) return fallback.map((window) => ({ ...window }));
  const windows = value.filter((item) => {
    const candidate = record(item);
    return typeof candidate.open === 'string' && timePattern.test(candidate.open) && typeof candidate.close === 'string' && timePattern.test(candidate.close);
  }).map((item) => ({ open: String(record(item).open), close: String(record(item).close) }));
  return windows.length ? windows : fallback.map((window) => ({ ...window }));
}

function safeHours(value: unknown): StoreDayHours[] {
  const input = Array.isArray(value) ? value : [];
  return defaultHours.map((fallback) => {
    const candidate = input.find((item) => record(item).day === fallback.day);
    if (!candidate) return { ...fallback, windows: fallback.windows.map((window: StoreHoursWindow) => ({ ...window })) };
    const data = record(candidate);
    return {
      day: fallback.day,
      closed: bool(data.closed, fallback.closed),
      windows: safeWindows(data.windows, fallback.windows),
    };
  });
}

function safeFulfillment(value: unknown): FulfillmentMode[] {
  const modes = Array.isArray(value) ? value.filter((item): item is FulfillmentMode => item === 'PICKUP' || item === 'DELIVERY') : [];
  return modes.length ? [...new Set(modes)] : [...defaultStorePublicConfig.fulfillmentModes];
}

function safePayments(value: unknown): StorePublicConfig['paymentMethods'] {
  const methods = Array.isArray(value) ? value.filter((item): item is StorePublicConfig['paymentMethods'][number] => item === 'PIX' || item === 'CARD' || item === 'CASH') : [];
  return methods.length ? [...new Set(methods)] : [...defaultStorePublicConfig.paymentMethods];
}

function safeDelivery(value: unknown): StorePublicConfig['deliveryConfig'] {
  const data = record(value);
  const mode: DeliveryMode = data.mode === 'NONE' || data.mode === 'CONFIRM' || data.mode === 'FIXED' || data.mode === 'ZONES' ? data.mode : defaultStorePublicConfig.deliveryConfig.mode;
  const fee = Number(data.fixedFeeCents);
  const zones = Array.isArray(data.zones) ? data.zones.filter((item) => {
    const zone = record(item);
    return typeof zone.id === 'string' && typeof zone.name === 'string' && Number.isSafeInteger(zone.feeCents);
  }).map((item) => {
    const zone = record(item);
    return { id: String(zone.id), name: String(zone.name), feeCents: Math.max(0, Number(zone.feeCents)), active: bool(zone.active, true) };
  }) : [];
  return {
    mode,
    ...(Number.isSafeInteger(fee) && fee >= 0 ? { fixedFeeCents: fee } : mode === 'FIXED' ? { fixedFeeCents: defaultStorePublicConfig.deliveryConfig.fixedFeeCents } : {}),
    ...(zones.length ? { zones } : {}),
  };
}

/** Converts legacy, partial or malformed Firestore data into a safe runtime config. */
export function normalizeStoreConfig(raw: unknown): StorePublicConfig {
  const data = record(raw);
  const fallback = defaultStorePublicConfig;
  const holidayDates = Array.isArray(data.holidayDates) ? data.holidayDates.filter((date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) : fallback.holidayDates;
  return {
    ...fallback,
    storeName: text(data.storeName, fallback.storeName),
    instagramHandle: text(data.instagramHandle, fallback.instagramHandle ?? ''),
    address: text(data.address, fallback.address ?? ''),
    city: text(data.city, fallback.city ?? ''),
    phoneDisplay: text(data.phoneDisplay, fallback.phoneDisplay ?? ''),
    whatsappNumber: text(data.whatsappNumber, fallback.whatsappNumber ?? ''),
    whatsappEnabled: bool(data.whatsappEnabled, fallback.whatsappEnabled),
    orderingEnabled: bool(data.orderingEnabled, fallback.orderingEnabled),
    pauseMessage: text(data.pauseMessage, fallback.pauseMessage ?? ''),
    enforceHours: bool(data.enforceHours, fallback.enforceHours),
    timezone: text(data.timezone, fallback.timezone),
    hours: safeHours(data.hours),
    holidayDates: [...new Set(holidayDates)],
    holidayHours: safeWindows(data.holidayHours, fallback.holidayHours ?? []),
    fulfillmentModes: safeFulfillment(data.fulfillmentModes),
    paymentMethods: safePayments(data.paymentMethods),
    deliveryConfig: safeDelivery(data.deliveryConfig),
    orderInstructions: text(data.orderInstructions, fallback.orderInstructions ?? ''),
    deliveryEstimate: text(data.deliveryEstimate, fallback.deliveryEstimate ?? ''),
    busyDeliveryEstimate: text(data.busyDeliveryEstimate, fallback.busyDeliveryEstimate ?? ''),
    orderEstimateMinutes: (() => {
      const minutes = Number(data.orderEstimateMinutes);
      return Number.isSafeInteger(minutes) && minutes >= 5 && minutes <= 240
        ? minutes
        : fallback.orderEstimateMinutes ?? 15;
    })(),
    holidayHoursNote: text(data.holidayHoursNote, fallback.holidayHoursNote ?? ''),
    gratitudeMessage: text(data.gratitudeMessage, fallback.gratitudeMessage ?? ''),
    privacyNotice: text(data.privacyNotice, fallback.privacyNotice ?? ''),
    status: data.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}),
  };
}
