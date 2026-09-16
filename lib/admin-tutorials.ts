export type AdminTutorialId =
  | 'admin-first-use'
  | 'admin-orders'
  | 'admin-cash'
  | 'admin-finances';

export type AdminTutorialProgress = Partial<
  Record<AdminTutorialId, { status: 'completed' | 'skipped'; at: string }>
>;

export type AdminTutorialDefinition = {
  id: AdminTutorialId;
  title: string;
  description: string;
  steps: Array<{ title: string; text: string }>;
};

export const ADMIN_TUTORIALS: AdminTutorialDefinition[] = [
  {
    id: 'admin-first-use',
    title: 'Primeiros passos do administrador',
    description: 'O caminho curto para deixar a loja pronta para operar.',
    steps: [
      { title: 'Bem-vindo ao painel', text: 'Aqui você acompanha pedidos, cardápio, Caixa e Finanças da Açaí + Sabor.' },
      { title: 'Configure o básico', text: 'Em Configurações, confira nome, endereço, horários, formas de pagamento e entrega antes de abrir os pedidos.' },
      { title: 'Prepare o cardápio', text: 'Em Catálogo, mantenha produtos, tamanhos, preços e disponibilidade corretos para o cliente.' },
      { title: 'Abra o Caixa', text: 'Abra o turno informando o dinheiro disponível para troco antes de concluir o primeiro pedido.' },
      { title: 'Acompanhe e confira', text: 'Os pedidos concluídos entram automaticamente em Finanças e no Caixa. No fim do turno, confira o dinheiro e feche o Caixa.' },
    ],
  },
  {
    id: 'admin-orders',
    title: 'Operar pedidos',
    description: 'Como receber, preparar, concluir e estornar pedidos com segurança.',
    steps: [
      { title: 'Confira o pedido', text: 'Abra o pedido, confira itens, endereço ou retirada e a forma de pagamento.' },
      { title: 'Atualize o andamento', text: 'Use os botões na ordem indicada: confirmado, em preparo, pronto e concluído.' },
      { title: 'Conclua com o Caixa aberto', text: 'Ao concluir, o sistema registra a venda uma única vez em Finanças e no Caixa.' },
      { title: 'Se houver desistência', text: 'Em um pedido concluído, use Estornar e cancelar pedido. O histórico original permanece preservado.' },
    ],
  },
  {
    id: 'admin-cash',
    title: 'Usar o Caixa',
    description: 'Abertura, movimentações, conferência e fechamento do turno.',
    steps: [
      { title: 'Comece pela abertura', text: 'Informe o saldo inicial para troco. Só existe um Caixa aberto por vez.' },
      { title: 'Acompanhe o turno', text: 'Vendas, sangrias, suprimentos e estornos aparecem nas movimentações recentes.' },
      { title: 'Registre ajustes', text: 'Sangria é retirada de dinheiro e suprimento é entrada para reforçar o troco. Informe sempre o motivo.' },
      { title: 'Feche com conferência', text: 'Conte o dinheiro, informe o valor contado e explique qualquer diferença antes de confirmar o fechamento.' },
    ],
  },
  {
    id: 'admin-finances',
    title: 'Conferir Finanças',
    description: 'Como ler receitas, despesas, pagamentos e estornos.',
    steps: [
      { title: 'Escolha o mês', text: 'Use o filtro de mês para consultar somente o período que deseja conferir.' },
      { title: 'Leia o resumo', text: 'Receitas, despesas, saldo pago e valores pendentes ficam separados no topo da tela.' },
      { title: 'Compare pagamentos', text: 'Confira a divisão entre dinheiro, Pix, cartão e outras formas com o fechamento do Caixa.' },
      { title: 'Faça lançamentos manuais', text: 'Use Novo lançamento apenas para despesas ou ajustes autorizados. Vendas de pedidos concluídos entram automaticamente.' },
    ],
  },
];

export const ADMIN_TUTORIAL_OPEN_EVENT = 'acai-admin-tutorial-open';
export const ADMIN_TUTORIAL_PROGRESS_EVENT = 'acai-admin-tutorial-progress';

function storageKey(uid: string) {
  return `acai-admin-tutorials-v1:${uid}`;
}

export function readAdminTutorialProgress(uid: string): AdminTutorialProgress {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(uid)) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      ADMIN_TUTORIALS.flatMap(({ id }) => {
        const value = parsed[id];
        if (!value || typeof value !== 'object') return [];
        const status = (value as { status?: unknown }).status;
        const at = (value as { at?: unknown }).at;
        return (status === 'completed' || status === 'skipped') && typeof at === 'string'
          ? [[id, { status, at }]]
          : [];
      }),
    ) as AdminTutorialProgress;
  } catch {
    return {};
  }
}

export function setAdminTutorialProgress(uid: string, id: AdminTutorialId, status: 'completed' | 'skipped') {
  if (typeof window === 'undefined') return;
  const next = { ...readAdminTutorialProgress(uid), [id]: { status, at: new Date().toISOString() } };
  window.localStorage.setItem(storageKey(uid), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(ADMIN_TUTORIAL_PROGRESS_EVENT));
}

export function resetAdminTutorial(uid: string, id: AdminTutorialId) {
  if (typeof window === 'undefined') return;
  const next = readAdminTutorialProgress(uid);
  delete next[id];
  window.localStorage.setItem(storageKey(uid), JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(ADMIN_TUTORIAL_PROGRESS_EVENT));
}

export function openAdminTutorial(id: AdminTutorialId) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ADMIN_TUTORIAL_OPEN_EVENT, { detail: { id } }));
}
