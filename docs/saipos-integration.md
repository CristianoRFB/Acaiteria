# Integração Saipos — estado PARCIAL

Auditoria em 08/09/2026. Baseline: branch main limpa, React 19/Vinext/Vite/Tailwind, Firebase Auth, Firestore Admin SDK (sem ORM), Functions v2, testes Vitest e Emulator Suite. Já existiam catálogo, montagem, checkout com preço canônico em centavos, idempotência transacional, pedidos e painel. Não existia integração Saipos. Typecheck e testes existentes passaram antes das mudanças.

## Decisões

Manter catálogo local, montagem, preço, horários, entrega e pagamentos. Refatorar apenas a fronteira de integração, sem segundo PDV. Manter operação manual para pedidos antigos e modo desabilitado; pedidos destinados ao Saipos não permitem atualização operacional/cancelamento pelo painel local. Adiar sincronização externa, impressão, webhook e cancelamento até contrato oficial. Nenhum módulo útil removido.

Catálogo local administrável é fonte da experiência do canal; códigos opacos fazem o vínculo ao Saipos. Saipos é a fonte oficial de caixa, fiscal, estoque, produção e impressão após integração real. Aceite técnico não significa confirmação operacional ou pagamento.

## Fluxo implementado

createOrder valida catálogo, quantidades, disponibilidade, horário, endereço e troco; recalcula preço; cria orders + orderRequests na mesma transação. O campo integration é uma outbox persistida junto do pedido. Um trigger de criação a processa. Um agendador a cada 5 minutos recupera pendências e tentativas transitórias em lotes limitados. Admin pode pedir retry permitido.

Cada claim é transacional: PENDING → SENDING → ACCEPTED / ERROR / UNKNOWN. Tentativas ficam em orders/{id}/integrationAttempts/{n}, com início, fim, correlação, classificação e mensagem sanitizada. Erro externo não apaga pedido. Claim interrompido torna-se UNKNOWN após 60 segundos e exige reconciliação, sem replay cego.

Limite de três tentativas; backoff 30/60 segundos, execução sujeita ao ciclo de 5 minutos. Somente falhas transitórias do simulador idempotente admitem replay. Rejeição, configuração ou mapping ausente não admitem retry automático. Saipos não terá retry habilitado sem garantia documental de idempotência/reconciliação. Após corrigir mapping, reprocessamento Saipos continua bloqueado até a homologação do adapter.

Mesma clientRequestId retorna o mesmo pedido. Hash do conteúdo validado rejeita reuso da chave com outro conteúdo; documentos antigos sem hash permanecem compatíveis. O cliente preserva a chave nos retries e só limpa carrinho após resposta de persistência. Refresh do acompanhamento apenas consulta.

## Modos e execução

Em functions/.env.local (somente emulador): ORDER_PROVIDER=local e LOCAL_PROVIDER_SCENARIO=accept. Cenários: accept, reject, timeout, transient (falha na primeira tentativa), permanent. O ID fictício LOCAL-{internalId} é determinístico. Timeout é simulado de modo determinístico, não uma chamada HTTP real. Local é recusado fora de FUNCTIONS_EMULATOR=true + FIRESTORE_EMULATOR_HOST.

ORDER_PROVIDER=disabled é o padrão explícito. O pedido é salvo e aguarda a loja, sem confirmação externa. O processamento marca a integração como `DISABLED` sem criar tentativa externa, retry ou erro falso. ORDER_PROVIDER=saipos registra intenção de integração, verifica mappings e falha com CONTRACT_UNCONFIRMED. Não existe URL, autenticação ou POST inventado. Somente mudar a variável NÃO conecta o Saipos.

Comandos: npm run emulators e npm run dev. Para seed local: npm run seed:emulator. Não executar seed contra produção. O frontend de produção recusa configuração demo/emulador.

## Mapping/admin

/admin/integracao consulta readiness e permite busca, filtro de ausentes e confirmação de edição. integrationConfig/saipos guarda mappings e revision. Escrita somente pela Function autenticada com role admin, schema e controle de revisão concorrente. Sem credenciais nessa coleção ou na UI.

Chaves: products[productId], variants[productId:sizeId], modifiers[modifierId], payments[PIX|CARD|CASH]. Códigos são opacos; não há regra universal PAI/FILHO. Variantes são exigidas conservadoramente até contrato específico. A tela verifica todo catálogo ativo; envio verifica todos os itens do pedido. Nenhum código real foi inventado. Mapeamento efetivamente utilizado fica no histórico de tentativa quando o preflight completo passa.

## Segurança/compatibilidade/deploy

Rules negam acesso direto a integrationConfig e escrita de tentativas/pedidos, inclusive para admin; Functions fazem autorização. Staff lê histórico. DTO público contém só mensagem de integração, nunca erro técnico, mappings ou credenciais. SaiposOrderProvider é um adapter bloqueado, sem rede.

Migração aditiva: campo integration apenas em pedidos novos, coleção de mappings e subcoleção de tentativas. Pedidos antigos não recebem provider retroativamente. Nenhum reset ou recadastro. Implantar firestore.indexes.json (índice integration.status + updatedAt), Rules e Functions em conjunto. Rollback preserva todos os registros; desabilitar trigger/agendador antes de reverter o código de integração.

Sites publica a interface; não implanta Firebase Functions. Operação real exige projeto Firebase de produção configurado e implantação de Functions/Rules/índices. Nenhum backend Saipos/produção é declarado conectado pela publicação da interface.

## Evidências e readiness

Fontes oficiais consultadas em 08/09/2026:

- https://developer.saipos.com/ — portal de APIs, credenciais e webhooks confirmado.
- https://saipos-data-api.readme.io/reference/introducao — API de consulta de dados; não comprova criação de pedidos.
- https://saipos-api-logistica.readme.io/reference/introducao — API de logística, credenciamento e homologação; não comprova contrato de criação de vendas deste canal.
- https://meajuda.saipos.com/hc/pt-br/articles/39419901087636-Como-configurar-a-integra%C3%A7%C3%A3o-com-a-Pedidos-10 — parametrização de parceiro específica; não é contrato universal.

CONFIRMADO: portal oficial e existência de integrações parceiras. PENDENTE: credenciamento deste canal, autorização da loja, acesso técnico, códigos reais, contrato homologado e ambiente de testes. NÃO DOCUMENTADO PUBLICAMENTE nas fontes acessadas para este projeto: endpoint/payload de criação de vendas, auth específica, exigência store/partner/processor, idempotência, rate limits, erros, consulta/status, cancelamento, webhook/assinatura, menu sync e impressão customizada. INCERTEZA RESIDUAL — NÃO HÁ EVIDÊNCIA SUFICIENTE.

Para habilitar de verdade: obter da Saipos o contrato de integração de pedidos e credenciais de homologação; implementar somente o adapter server-side conforme esse contrato; cadastrar os códigos oficiais no painel; validar payload, referência externa, duplicação, timeout e reconciliação em homologação; só depois configurar ORDER_PROVIDER=saipos em produção. Não basta um token da API de consulta ou logística. Não foi criada venda real.

## Validação

Scripts: npm run lint, npm run typecheck, npm test, npm run test:functions, npm run test:rules, npm run test:functions:integration, npm run build:firebase. Testes incluem identidade estável do provider, mappings, classificação, isolamento local, concorrência/idempotência, persistência de erros/tentativas, backoff e claim expirado. Validação real Saipos permanece pendente do contrato/ambiente.
