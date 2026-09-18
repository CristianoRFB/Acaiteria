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
  steps: Array<{ title: string; text: string; image?: string; imageAlt?: string; hint?: string }>;
};

export const ADMIN_TUTORIALS: AdminTutorialDefinition[] = [
  {
    id: 'admin-first-use',
    title: 'Primeiros passos do administrador',
    description: 'O caminho curto para deixar a loja pronta para operar.',
    steps: [
      { title: 'Bem-vindo ao painel', text: 'Aqui você acompanha pedidos, cardápio, Caixa e Finanças da Açaí + Sabor.', image: '/docs/screens/admin-login.png', imageAlt: 'Tela de entrada do painel administrativo', hint: 'Entre por aqui' },
      { title: 'Configure o básico', text: 'Em Configurações, confira nome, endereço, horários, formas de pagamento e entrega antes de abrir os pedidos.', image: '/docs/screens/admin-configuracoes.png', imageAlt: 'Tela de configurações da loja', hint: 'Confira estas seções' },
      { title: 'Prepare o cardápio', text: 'Em Catálogo, mantenha produtos, tamanhos, preços e disponibilidade corretos para o cliente.', image: '/docs/screens/admin-catalogo.png', imageAlt: 'Tela de catálogo de produtos', hint: 'Edite o produto' },
      { title: 'Abra o Caixa', text: 'Abra o turno informando o dinheiro disponível para troco antes de concluir o primeiro pedido.', image: '/docs/screens/admin-pedido.png', imageAlt: 'Tela operacional de um pedido', hint: 'Acompanhe o turno' },
      { title: 'Acompanhe e confira', text: 'Os pedidos concluídos entram automaticamente em Finanças e no Caixa. No fim do turno, confira o dinheiro e feche o Caixa.', image: '/docs/screens/admin-pedido.png', imageAlt: 'Tela de acompanhamento operacional', hint: 'Confira antes de fechar' },
    ],
  },
  {
    id: 'admin-orders',
    title: 'Operar pedidos',
    description: 'Como receber, preparar, concluir e estornar pedidos com segurança.',
    steps: [
      { title: 'Confira o pedido', text: 'Abra o pedido, confira itens, endereço ou retirada e a forma de pagamento.', image: '/docs/screens/admin-pedido.png', imageAlt: 'Detalhes de um pedido no painel', hint: 'Abra os detalhes' },
      { title: 'Atualize o andamento', text: 'Use os botões na ordem indicada: confirmado, em preparo, pronto e concluído.', image: '/docs/screens/admin-pedido.png', imageAlt: 'Botões de atualização de status do pedido', hint: 'Avance o status' },
      { title: 'Conclua com o Caixa aberto', text: 'Ao concluir, o sistema registra a venda uma única vez em Finanças e no Caixa.', image: '/docs/screens/admin-pedido.png', imageAlt: 'Pedido pronto para conclusão', hint: 'Conclua só após conferir' },
      { title: 'Se houver desistência', text: 'Em um pedido concluído, use Estornar e cancelar pedido. O histórico original permanece preservado.', image: '/docs/screens/admin-pedido.png', imageAlt: 'Histórico e ações do pedido', hint: 'Use o cancelamento com cuidado' },
    ],
  },
  {
    id: 'admin-cash',
    title: 'Usar o Caixa',
    description: 'Abertura, movimentações, conferência e fechamento do turno.',
    steps: [
      { title: 'Comece pela abertura', text: 'Informe o saldo inicial para troco. Só existe um Caixa aberto por vez.', image: '/docs/screens/admin-configuracoes.png', imageAlt: 'Área de configurações da loja', hint: 'Comece pelo turno' },
      { title: 'Acompanhe o turno', text: 'Vendas, sangrias, suprimentos e estornos aparecem nas movimentações recentes.', image: '/docs/screens/admin-pedido.png', imageAlt: 'Operação do pedido durante o turno', hint: 'Observe as movimentações' },
      { title: 'Registre ajustes', text: 'Sangria é retirada de dinheiro e suprimento é entrada para reforçar o troco. Informe sempre o motivo.', image: '/docs/screens/admin-pedido.png', imageAlt: 'Ações disponíveis no painel operacional', hint: 'Registre o motivo' },
      { title: 'Feche com conferência', text: 'Conte o dinheiro, informe o valor contado e explique qualquer diferença antes de confirmar o fechamento.', image: '/docs/screens/admin-configuracoes.png', imageAlt: 'Configurações e controles da loja', hint: 'Revise antes de fechar' },
    ],
  },
  {
    id: 'admin-finances',
    title: 'Conferir Finanças',
    description: 'Como ler receitas, despesas, pagamentos e estornos.',
    steps: [
      { title: 'Escolha o mês', text: 'Use o filtro de mês para consultar somente o período que deseja conferir.', image: '/docs/screens/admin-configuracoes.png', imageAlt: 'Painel administrativo da loja', hint: 'Escolha o período' },
      { title: 'Leia o resumo', text: 'Receitas, despesas, saldo pago e valores pendentes ficam separados no topo da tela.', image: '/docs/screens/admin-pedido.png', imageAlt: 'Resumo operacional da loja', hint: 'Leia os totais' },
      { title: 'Compare pagamentos', text: 'Confira a divisão entre dinheiro, Pix, cartão e outras formas com o fechamento do Caixa.', image: '/docs/screens/checkout.png', imageAlt: 'Tela de checkout com forma de pagamento', hint: 'Compare os recebimentos' },
      { title: 'Faça lançamentos manuais', text: 'Use Novo lançamento apenas para despesas ou ajustes autorizados. Vendas de pedidos concluídos entram automaticamente.', image: '/docs/screens/admin-configuracoes.png', imageAlt: 'Controles administrativos', hint: 'Lance somente ajustes' },
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
