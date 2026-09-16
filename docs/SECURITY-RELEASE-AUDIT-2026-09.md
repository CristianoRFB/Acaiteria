# Auditoria de segurança e prontidão comercial

Data: 16/09/2026  
Escopo: painel administrativo, pedidos, Financeiro, Caixa, regras do Firestore e visão comercial.

## Correções aplicadas

- Escritas de pedidos e do espelho público foram fechadas para o cliente. Criação, alteração de itens/preços, status, previsão e estorno passam pelas funções autenticadas.
- O checkout não usa mais fallback de gravação direta no Firestore. Quando o backend não responde, o pedido fica preservado no formulário e o cliente recebe a alternativa de contato pelo WhatsApp.
- Edição e mudança de situação do Financeiro passaram para funções autenticadas. Lançamentos automáticos vinculados a pedido ou venda local não podem ser editados nem apagados pelo painel.
- O registro de venda local continua transacional: Caixa e Financeiro são gravados juntos, com idempotência e efeito correto por forma de pagamento.
- A consulta de pedidos concluídos usada pela visão comercial ganhou índice por `status` e `updatedAt`.
- O catálogo passou a normalizar documentos antigos sem `sizes`, sinalizar esses produtos no painel e ocultá-los do cardápio público até revisão.
- As Rules agora exigem os campos mínimos de produto, incluindo `sizes` e `modifierGroupIds`, para impedir novos registros incompletos.

## Auditoria por área

| Área | Resultado | Observação |
|---|---|---|
| Autenticação e papéis | Passou | Funções administrativas exigem `admin` ou `staff`; Financeiro exige `admin`. |
| Pedidos e preços | Passou | Backend recalcula catálogo, preço e taxa; escrita direta foi bloqueada. |
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

- O projeto Firebase de produção `food-5fb44` e o alvo `.firebaserc` foram configurados; `.env.production.local` foi preparado com a configuração pública do app, mas ainda falta a chave reCAPTCHA v3 do App Check.
- O Firebase CLI desta máquina não possui conta autenticada; por isso Rules, índices, Functions e Hosting ainda não foram publicados.
- A integração Saipos permanece desativada até existir contrato oficial de pedidos, credencial de homologação, mapeamentos reais e adapter homologado.
- O ranking de produtos considera itens detalhados dos pedidos online; vendas locais entram no faturamento, ticket e canais, mas precisam de itemização própria para aparecerem como produto.
- Antes de cobrar clientes reais, executar um pedido sandbox ponta a ponta com o provedor escolhido e confirmar os índices no projeto Firebase de produção.
