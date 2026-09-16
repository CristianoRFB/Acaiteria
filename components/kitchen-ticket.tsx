import type { PricedItem } from '@/shared/domain';
import { formatBRL } from '@/shared/domain';

interface KitchenTicketProps {
  orderNumber: string;
  customerName: string;
  fulfillmentMode: string;
  items: PricedItem[];
  notes?: string;
  paymentMethod: string;
  totalCents: number;
}

export function KitchenTicket({ orderNumber, customerName, fulfillmentMode, items, notes, paymentMethod, totalCents }: KitchenTicketProps) {
  return (
    <section id="kitchen-ticket" className="kitchen-ticket" aria-label={`Ficha de cozinha ${orderNumber}`}>
      <header className="kitchen-ticket__header">
        <p>Açaí + Sabor • Cozinha</p>
        <h1>{orderNumber}</h1>
        <strong>{fulfillmentMode === 'DELIVERY' ? 'ENTREGA' : 'RETIRADA'} • {customerName}</strong>
      </header>
      <div className="kitchen-ticket__divider" />
      <ol className="kitchen-ticket__items">
        {items.map((item, index) => (
          <li key={`${item.productId}-${index}`}>
            <div className="kitchen-ticket__item-title"><strong>{item.quantity}× {item.productName}</strong><span>{item.sizeLabel}</span></div>
            {item.modifierSelections.filter((group) => group.items.length).map((group) => (
              <p key={group.groupId}><b>{group.groupName}:</b> {group.items.map((selected) => `${selected.quantity > 1 ? `${selected.quantity}× ` : ''}${selected.name}`).join(', ')}</p>
            ))}
            {item.notes && <p className="kitchen-ticket__note">Obs. do item: {item.notes}</p>}
          </li>
        ))}
      </ol>
      {notes && <p className="kitchen-ticket__global-note"><b>OBSERVAÇÃO:</b> {notes}</p>}
      <footer>
        <span>Pagamento: {paymentMethod}</span>
        <strong>Total: {formatBRL(totalCents)}</strong>
      </footer>
    </section>
  );
}
