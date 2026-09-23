export type DeliveryStatus =
  | 'READY_FOR_DELIVERY'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'CANCELLED';

export type DeliveryDriverStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE' | 'INACTIVE';

export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  READY_FOR_DELIVERY: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['ACCEPTED', 'READY_FOR_DELIVERY', 'CANCELLED'],
  ACCEPTED: ['ON_THE_WAY', 'CANCELLED'],
  ON_THE_WAY: ['ARRIVED', 'DELIVERY_FAILED', 'CANCELLED'],
  ARRIVED: ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERED: [],
  DELIVERY_FAILED: ['READY_FOR_DELIVERY', 'CANCELLED'],
  CANCELLED: [],
};

export const deliveryStatusLabels: Record<DeliveryStatus, string> = {
  READY_FOR_DELIVERY: 'Pronto para entrega',
  ASSIGNED: 'Aguardando aceite',
  ACCEPTED: 'Aceita pelo motoboy',
  ON_THE_WAY: 'Em rota',
  ARRIVED: 'Chegou ao local',
  DELIVERED: 'Entregue',
  DELIVERY_FAILED: 'Falha na entrega',
  CANCELLED: 'Cancelada',
};

export const driverStatusLabels: Record<DeliveryDriverStatus, string> = {
  AVAILABLE: 'Disponível',
  BUSY: 'Em entrega',
  OFFLINE: 'Offline',
  INACTIVE: 'Inativo',
};

export interface DeliveryAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  reference?: string;
}

export interface DeliveryRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  publicCode?: string;
  status: DeliveryStatus;
  driverId?: string;
  driverName?: string;
  customerName: string;
  customerWhatsapp?: string;
  address: DeliveryAddress;
  totalCents: number;
  estimatedMinutes?: number;
  assignedAt?: unknown;
  acceptedAt?: unknown;
  startedAt?: unknown;
  arrivedAt?: unknown;
  deliveredAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
}

export interface DeliveryEvent {
  id: string;
  deliveryId: string;
  type: DeliveryStatus | 'CREATED' | 'DRIVER_REJECTED';
  actorUid?: string;
  actorRole?: string;
  note?: string;
  createdAt?: unknown;
}

export function canTransitionDelivery(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return DELIVERY_TRANSITIONS[from]?.includes(to) ?? false;
}

export function deliveryStatusMessage(status: DeliveryStatus): string {
  if (status === 'READY_FOR_DELIVERY') return 'Pedido pronto e aguardando um motoboy.';
  if (status === 'ASSIGNED') return 'Uma entrega foi atribuída e aguarda aceite.';
  if (status === 'ACCEPTED') return 'O motoboy aceitou a entrega.';
  if (status === 'ON_THE_WAY') return 'O pedido saiu para entrega.';
  if (status === 'ARRIVED') return 'O motoboy chegou ao local. Informe o código de recebimento.';
  if (status === 'DELIVERED') return 'Entrega confirmada. Obrigado!';
  if (status === 'DELIVERY_FAILED') return 'Não foi possível concluir a entrega. A loja precisa revisar o pedido.';
  return 'Entrega cancelada.';
}

export function maskDeliveryCode(code: string): string {
  return /^\d{4}$/.test(code) ? `${code.slice(0, 2)}••` : '••••';
}
