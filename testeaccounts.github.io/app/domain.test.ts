import {describe,expect,it} from 'vitest';
import {balance,completedQuantity,orderQuantity,validateState} from './domain';
import {createSeed} from './seed';

describe('domínio da demonstração de açaís e sorvetes',()=>{
  const state=createSeed(new Date('2026-08-27T12:00:00'));

  it('gera IDs, números e referências consistentes',()=>{
    expect(new Set(state.orders.map(o=>o.id)).size).toBe(state.orders.length);
    expect(new Set(state.orders.map(o=>o.number)).size).toBe(state.orders.length);
    for(const order of state.orders){
      expect(state.customers.some(c=>c.id===order.customerId)).toBe(true);
      for(const item of order.items){
        expect(item.completed).toBeGreaterThanOrEqual(0);
        expect(item.completed).toBeLessThanOrEqual(item.quantity);
        expect(item.personalizations.length).toBeLessThanOrEqual(item.quantity);
        if(item.matrixId)expect(state.matrices.some(m=>m.id===item.matrixId)).toBe(true);
      }
    }
    expect(validateState(state)).toBe(true);
  });

  it('mantém versão atual e aprovada como conceitos independentes',()=>{
    const art=state.artworks.find(a=>a.id==='a1')!;
    expect(art.currentVersionId).toBe('a1v3');
    expect(art.approvedVersionId).toBe('a1v2');
    expect(art.versions.some(v=>v.id===art.currentVersionId)).toBe(true);
    expect(art.versions.some(v=>v.id===art.approvedVersionId)).toBe(true);
  });

  it('deriva quantidade, progresso e saldo do pedido',()=>{
    const order=state.orders.find(o=>o.number===1048)!;
    expect(orderQuantity(order)).toBe(30);
    expect(completedQuantity(order)).toBe(18);
    expect(balance(order)).toBe(1425);
  });

  it('preserva os casos comerciais obrigatórios no seed',()=>{
    const descriptions=state.orders.flatMap(o=>o.items.map(i=>i.description)).join(' ');
    expect(descriptions).toContain('Toalha de banho');
    expect(descriptions).toContain('Polo corporativa');
    expect(descriptions).toContain('Boné estruturado');
    expect(descriptions).toContain('Jaqueta jeans');
    expect(state.quotes.some(q=>q.status==='approved'&&!q.convertedOrderId)).toBe(true);
  });

  it('rejeita payload corrompido ou fora da versão',()=>{
    expect(validateState({version:1,orders:[]})).toBe(false);
    const invalid=createSeed(new Date('2026-08-27T12:00:00'));
    invalid.orders[0].items[0].completed=999;
    expect(validateState(invalid)).toBe(false);
  });
});
