# Auditoria de segurança e prontidão comercial

Data: 25/09/2026
Escopo: painel administrativo, pedidos, Financeiro, Caixa, regras do Firestore e visão comercial.

## Retomada de QA — 25/09/2026

Na revisão dos fluxos de pedido foi encontrado um bypass: o cliente Firebase ainda podia gravar pedidos/status e alguns documentos financeiros diretamente, evitando validações que já existiam nas Cloud Functions. A escrita direta foi bloqueada nas Rules e as telas de checkout, pedidos, notificações e Financeiro foram direcionadas às funções autenticadas do backend. A resposta do cliente a uma proposta de edição continua limitada à decisão pendente.

Pedidos legados sem comprovante de preço do servidor agora precisam ser conferidos contra catálogo, tamanho, adicionais, disponibilidade, modalidade e taxa atuais. Se os valores coincidirem, a conferência é registrada; se divergirem, o avanço fica bloqueado até a loja corrigir o pedido e o cliente aceitar a nova proposta. Conclusão/estorno e confirmação de entrega também recusam pedidos sem preço validado pelo servidor.

No Financeiro, uma chave de repetição agora também fica vinculada ao conteúdo do lançamento. Reenviar os mesmos dados é idempotente; reutilizar a chave com valor ou descrição diferentes é recusado, evitando que a tela informe sucesso enquanto deixa de gravar a alteração.

Verificações executadas nesta retomada, em Firebase Emulator com projeto demo e sem importar os dados locais:

- `npm run ci` — passou: lint, typecheck, 39 testes do app e build.
- `npm run test:functions` — passou: 14 testes unitários.
- `npm run test:rules` — passou: 6 testes das Rules.
- `npm run test:functions:integration` — passou: 37 testes de pedidos, entregas e Financeiro.
- O build emitiu apenas avisos de bundle cliente acima de 500 kB; não impediu a compilação.

Isso valida código e fluxos automatizados no emulador, não substitui um pedido real de homologação nem comprova o projeto Firebase publicado.

## Correções aplicadas

- O checkout usa a callable `createOrder`, que recalcula catálogo, preços, taxa e disponibilidade no servidor. Escrita direta de pedidos e do espelho público foi removida das Rules.
- Quando a gravação do checkout perde a conexão depois do envio, o mesmo `clientRequestId` é reutilizado para evitar duplicação; se o envio não for confirmado, o formulário permanece preservado e o cliente recebe a alternativa de contato pelo WhatsApp.
- Edição e mudança de situação do Financeiro passaram para funções autenticadas. Lançamentos automáticos vinculados a pedido ou venda local não podem ser editados nem apagados pelo painel.
- O registro de venda local continua transacional: Caixa e Financeiro são gravados juntos, com idempotência e efeito correto por forma de pagamento.
- A consulta de pedidos concluídos usada pela visão comercial ganhou índice por `status` e `updatedAt`.
- O catálogo passou a normalizar documentos antigos sem `sizes`, sinalizar esses produtos no painel e ocultá-los do cardápio público até revisão.
- As Rules agora exigem os campos mínimos de produto, incluindo `sizes` e `modifierGroupIds`, para impedir novos registros incompletos.

## Auditoria por área

| Área | Resultado | Observação |
|---|---|---|
| Autenticação e papéis | Passou | Funções administrativas exigem `admin` ou `staff`; Financeiro exige `admin`. |
| Pedidos e preços | Corrigido nesta retomada | O checkout passa pelo backend; pedidos legados exigem validação canônica antes de avançar, concluir ou gerar financeiro. |
| Caixa | Passou | Operações usam função autenticada, caixa aberto e transação. |
| Financeiro | Passou | Manual e automático passam pelo backend; exclusão direta bloqueada. |
| Cliente e acompanhamento | Passou | Leitura pública fica limitada ao espelho/código; resposta de edição aceita somente decisão pendente. |
| Banco e consultas | Passou | Consultas críticas têm limite/filtros; a visão comercial usa consulta mensal indexada. |
| Interface comercial | Passou | Visão comercial separada dentro do Financeiro, com estados vazios e dados reais do mês. |
| Catálogo | Passou | Produto legado sem tamanhos não derruba o painel nem fica disponível para compra. |

## Verificações executadas

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:functions`
- `npm run test:rules` com Java 21
- `npm run build`
- `npm run check:production` — bloqueado corretamente pela ausência da chave real do App Check.
- Operação real no localhost: Financeiro → Inteligência de vendas, gráficos, mix de pagamentos, ranking e canais.

## Risco residual antes de produção

- Publicar Rules, índices, Functions e frontend como uma versão coordenada. A proteção nova nega gravações diretas de pedidos, finanças, caixa, perfis e entregadores; um frontend antigo não terá compatibilidade operacional com essas Rules.
- Confirmar App Check no ambiente de produção e habilitar faturamento/Cloud Functions no plano Firebase apropriado (o uso pode exigir Blaze); nenhum deploy foi feito nesta retomada.
- O projeto Firebase de produção `food-5fb44` e o alvo `.firebaserc` estão configurados.
- Neste ambiente, `.env.production.local` e `functions/.env` não estão presentes: `npm run check:production` aponta ausência das sete variáveis públicas obrigatórias de Firebase/App Check. Rules, índices, Functions e Hosting não foram publicados nesta retomada.
- A integração Saipos permanece desativada até existir contrato oficial de pedidos, credencial de homologação, mapeamentos reais e adapter homologado.
- O ranking de produtos considera itens detalhados dos pedidos online; vendas locais entram no faturamento, ticket e canais, mas precisam de itemização própria para aparecerem como produto.
- Antes de cobrar clientes reais, executar um pedido sandbox ponta a ponta com o provedor escolhido e confirmar os índices no projeto Firebase de produção.
