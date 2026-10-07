# Auditoria total do módulo de motoboys

Data: 23/09/2026. Base inicial: `680e1a8` (`main` sincronizada com `origin/main`, árvore limpa antes do trabalho). Escopo guiado por `GOAL_Acai_Mais_Sabor_Auditoria_Total_Motoboy.txt`.

Legenda: **OK** = comprovado em teste executado; **PARCIAL** = implementação presente, mas sem prova completa ou depende de infraestrutura; **QUEBRADA** = risco/comportamento reproduzível; **AUSENTE** = não encontrado.

## Matriz inicial da retomada — 07/10/2026 — `f90eaf8`

Base verificada: `main`, `HEAD=f90eaf8`, atualizado por `git pull origin main`; `680e1a8` existe na história; working tree limpo após o pull. Há um stash local preexistente, preservado e fora da árvore. A matriz abaixo classifica o estado inicial desta retomada: a presença de implementação/teste não será marcada como **OK** até a prova ser executada contra este HEAD; os resultados de checkpoints anteriores são históricos.

| Área | Requisito individual | Estado inicial | Fonte que será verificada |
| --- | --- | --- | --- |
| Motoboy | Login próprio | PARCIAL | `app/entregador/login/page.tsx`, Firebase Auth |
| Motoboy | Papel `driver` | PARCIAL | `components/providers.tsx`, `firestore.rules`, Functions |
| Motoboy | Proteção das rotas | PARCIAL | `app/entregador/layout.tsx`, páginas do entregador |
| Motoboy | Dashboard | PARCIAL | `app/entregador/page.tsx` |
| Motoboy | Ficar disponível | PARCIAL | `setDriverAvailability`, integração |
| Motoboy | Ficar ocupado | PARCIAL | atribuição/transações, integração |
| Motoboy | Ficar offline | PARCIAL | `setDriverAvailability`, integração |
| Motoboy | Receber entrega atribuída | PARCIAL | listeners do dashboard e `assignDelivery` |
| Motoboy | Notificação de nova corrida | PARCIAL | atualização in-app; FCM/Web Push ainda sem prova |
| Motoboy | Aceitar corrida | PARCIAL | `respondDelivery`, tela e concorrência |
| Motoboy | Confirmar retirada | PARCIAL | `progressDelivery(PICKED_UP)` |
| Motoboy | Iniciar rota | PARCIAL | `progressDelivery(ON_THE_WAY)` |
| Motoboy | Abrir mapa | PARCIAL | página de detalhe e URL de navegação |
| Motoboy | Marcar chegada | PARCIAL | `progressDelivery(ARRIVED)` |
| Motoboy | Confirmar código | PARCIAL | `confirmDelivery`, segredo e rate limit |
| Motoboy | Registrar falha | PARCIAL | `reportDeliveryFailure` e tela de detalhe |
| Motoboy | Ver pedidos | PARCIAL | dashboard/listeners e filtros |
| Motoboy | Ver histórico | PARCIAL | `deliveryHistory` e filtros |
| Motoboy | Editar perfil/contato | PARCIAL | `updateDriverContact` e formulário |
| Motoboy | Logout | PARCIAL | Firebase Auth e navegação |
| Admin | Cadastrar motoboy | PARCIAL | `/admin/entregadores`, callable e teste |
| Admin | Editar motoboy | PARCIAL | callable/formulário e integração |
| Admin | Ativar motoboy | PARCIAL | callable/Auth/usuário/perfil |
| Admin | Desativar motoboy | PARCIAL | callable/Auth/usuário/perfil |
| Admin | Listar motoboys | PARCIAL | `/admin/entregadores` |
| Admin | Ver disponibilidade | PARCIAL | listeners e perfil do entregador |
| Admin | Ver entrega atual | PARCIAL | `currentDeliveryId` e central |
| Admin | Atribuir pedido | PARCIAL | `assignDelivery` |
| Admin | Impedir dupla atribuição | PARCIAL | transação e testes concorrentes |
| Admin | Acompanhar status em tempo real | PARCIAL | listeners da central e pedidos |
| Admin | Ver falhas e motivos | PARCIAL | filtro `DELIVERY_FAILED` e detalhe |
| Admin | Devolver falha à fila | PARCIAL | `requeueDelivery` |
| Admin | Reassociar entregador | PARCIAL | `reassignDelivery` |
| Admin | Consultar histórico/eventos | PARCIAL | `deliveryEvents` e tela central |
| Admin | Preservar consistência pedido/entrega/caixa | PARCIAL | transações de status, cancelamento e conclusão |
| Cliente | Acompanhar a própria entrega | PARCIAL | `/pedido/[publicCode]`, espelho público e Rules |
| Cliente | Ver entregador quando aplicável | PARCIAL | `deliveryDriverName` e rastreio |
| Cliente | Ver código de recebimento | PARCIAL | espelho público e página de rastreio |
| Cliente | Impedir que outros perfis leiam o código | PARCIAL | Rules, callable de entregador e testes |
| Cliente | Ver status final entregue | PARCIAL | transação final e rastreio |
| Backend/banco | Vincular entrega a pedido real | PARCIAL | criação em `updateOrderStatus`, schema e integração |
| Backend/banco | Vincular entregador a usuário Auth | PARCIAL | `createDeliveryDriver`, `users`, `deliveryDrivers` |
| Backend/banco | Registrar timestamps de transição | PARCIAL | `functions/src/index.ts` e eventos |
| Backend/banco | Validar transições permitidas | PARCIAL | `shared/delivery.ts` e Functions |
| Backend/banco | Guardar segredo fora dos payloads de entregador | PARCIAL | `deliverySecrets`, callable e Rules |
| Backend/banco | Bloquear código errado/limitar tentativas | PARCIAL | integração de `confirmDelivery` |
| Backend/banco | Bloquear duplicidade e retry alterado | PARCIAL | IDs/fingerprints e testes de concorrência |
| Backend/banco | Fazer conclusão e financeiro atomicamente | PARCIAL | `confirmDelivery`, Caixa/Financeiro e integração |
| Backend/banco | Manter falha sem conclusão financeira | PARCIAL | `reportDeliveryFailure` e integração |
| Backend/banco | Manter requeue/reassignment consistentes | PARCIAL | `requeueDelivery`, `reassignDelivery`, histórico |
| Backend/banco | Preservar histórico após liberar/trocar motoboy | PARCIAL | `deliveryHistory`, `deliveryEvents` |
| Segurança | Impedir cliente de ler entrega alheia | PARCIAL | Rules e testes de Rules |
| Segurança | Impedir motoboy de ler corrida alheia | PARCIAL | Rules e callable de detalhe |
| Segurança | Impedir motoboy de acessar Admin/Financeiro | PARCIAL | layouts, RBAC de Functions e Rules |
| Segurança | Impedir alteração de role pelo próprio usuário | PARCIAL | Rules e Functions administrativas |
| Segurança | Impedir escrita direta em campos protegidos | PARCIAL | Rules e testes |
| Segurança | Rules negarem acessos indevidos | PARCIAL | `scripts/test-rules.mjs` |
| Segurança | Não vazar código em tela/payload/logs | PARCIAL | callable, UI e testes de privacidade |
| Segurança | Limitar dados pessoais expostos ao motoboy | PARCIAL | schema de `deliveries` e UI |
| Mobile/PWA | Viewport 360 px | PARCIAL | QA visual deste HEAD pendente |
| Mobile/PWA | Viewport 390 px | PARCIAL | QA visual deste HEAD pendente |
| Mobile/PWA | Viewport 430 px | PARCIAL | QA visual deste HEAD pendente |
| Mobile/PWA | Teclado aberto | PARCIAL | QA visual autenticado pendente |
| Mobile/PWA | Navegação inferior | PARCIAL | `components/driver-bottom-nav.tsx` |
| Mobile/PWA | Alvos de toque | PARCIAL | telas do entregador; QA manual pendente |
| Mobile/PWA | Estados loading e erro | PARCIAL | telas/listeners; execução visual pendente |
| Mobile/PWA | Offline e reconexão | PARCIAL | `public/sw.js`, `public/offline.html`, teste PWA |
| Mobile/PWA | Refresh e retorno do background | PARCIAL | listeners/Auth; QA real pendente |
| Mobile/PWA | Deep link para Maps | PARCIAL | detalhe da corrida; Maps real não testado |
| Mobile/PWA | Manifest e instalação PWA | PARCIAL | manifests/icons; teste de instalação real pendente |
| Mobile/PWA | Service worker | PARCIAL | `public/sw.js`, registro e testes |
| Mobile/PWA | Push com app fechado | AUSENTE | FCM/Web Push não localizado no inventário |

Esta matriz é o baseline de trabalho, não o veredito. Será atualizada somente com resultado observado em testes atuais e execução real; limitações externas e evidência ausente continuarão explícitas.

## Matriz inicial

| Área | Fluxo | Status inicial | Evidência no baseline |
| --- | --- | --- | --- |
| Entregador | Login, papel e sessão inativa | PARCIAL/QUEBRADA | Rotas tinham proteção visual, mas Rules e `requireRole` não negavam conta desativada com sessão válida. |
| Entregador | Disponibilidade, entrega atual, aceite/recusa | PARCIAL | Operação concentrada em `app/entregador/*`; sem integração autenticada executada. |
| Entregador | Retirada antes da rota | AUSENTE | A transição saltava de aceite para rota; não existia `PICKED_UP`. |
| Entregador | Código de recebimento | QUEBRADA | Limite de tentativas ausente; código e token de acompanhamento alcançáveis pela leitura da coleção `publicOrders`. |
| Entregador | Falha, histórico, perfil e navegação | PARCIAL | Falha sem estado privado consistente; histórico sumia quando o vínculo do entregador era removido; navegação inferior tinha destinos sem implementação. |
| Administração | Cadastro, edição, ativação, atribuição e reassociação | PARCIAL | Criar/ativar/atribuir existia; editar perfil e trocar responsável antes da retirada não existiam. |
| Administração | Cancelar corrida e liberar motoboy | QUEBRADA | Cancelamento do pedido não limpava `currentDeliveryId` nem liberava o motoboy associado. |
| Administração | Auditoria dos eventos | PARCIAL | `deliveryEvents` era gravado, mas não havia consulta visual do histórico. |
| Cliente | Acompanhamento, responsável e código | QUEBRADA | Enumeração/leitura pública da coleção; nome do motoboy ausente no acompanhamento. |
| Financeiro/caixa | Conclusão do delivery e idempotência | PARCIAL | IDs determinísticos e transação já existiam, mas sem prova integrada. |
| Segurança | Isolamento por papel e usuário | PARCIAL | Regras tinham cobertura parcial; sessão inativa e consulta pública não eram seguras. |
| Mobile/PWA | Layout, instalação, push e mapas | PARCIAL/AUSENTE | Não havia manifest, service worker, FCM ou prova visual nos tamanhos móveis. |
| QA | Fluxos autenticados e dispositivos reais | AUSENTE | Sem `test:e2e`; as 11 referências visuais citadas pela especificação não estavam disponíveis no repositório/anexos. |

## Alterações implementadas

- Firestore bloqueia enumeração/listagem pública de pedidos; a leitura individual exige o token exato do pedido. Acesso de entregador/admin/staff depende de usuário ativo, preservando compatibilidade com cadastros antigos que não têm o campo `active`.
- `AuthProvider` encerra sessão desativada; Functions recusam contas desativadas.
- Código de confirmação usa aleatoriedade criptográfica; após cinco erros em 15 minutos, bloqueia por cinco minutos. O hash permanece em `deliverySecrets`, fora do acesso do cliente/motoboy.
- Etapa `PICKED_UP` obrigatória entre aceite e rota; registra hora, status privado/público e evento.
- Cancelamento libera o motoboy somente quando ele ainda está vinculado àquela entrega, atualiza pedido/acompanhamento e grava evento/histórico.
- Novo fluxo de reassociação permitido só antes da retirada; libera o anterior e ocupa o novo na mesma transação.
- Novo cadastro editável sincroniza Firebase Auth e documentos; se o banco falhar, tenta restaurar o perfil Auth anterior.
- Histórico privado por entregador persiste recusa, falha, devolução à fila, reassociação, cancelamento e entrega concluída. A central administrativa permite consultar eventos por corrida.
- Acompanhamento do cliente mostra status da entrega e nome do responsável. Documentos novos não copiam o token de acompanhamento; transições apagam campos legados e uma callable administrativa remove tokens antigos em lotes limitados.
- Runner de integração amplia descoberta de Functions para 30 segundos e executa os testes sequencialmente, evitando falsos timeouts em emuladores lentos.

## Matriz final

| Área | Fluxo | Status final | Evidência/limitação |
| --- | --- | --- | --- |
| Entregador | Papel, conta inativa e isolamento Firestore | **OK** | 6 testes de Rules passaram; teste explícito nega leitura para conta inativa e documentos alheios. |
| Entregador | Código, limite de tentativas e corrida financeira | **OK** | Integração autenticada: cinco códigos errados bloqueiam; confirmação concorrente gera uma conclusão, uma receita e um movimento de caixa. |
| Entregador | Aceite, recusa, disponibilidade e sessão real no celular | **PARCIAL** | Implementado; sem jornada E2E de interface/móvel nem prova de todos os callable endpoints. |
| Entregador | Retirada antes da rota | **PARCIAL** | Estados e botões implementados; não houve E2E da sequência completa em navegador. |
| Entregador | Histórico | **PARCIAL** | Persistência privada implementada; conclusão verificada na integração; demais resultados sem teste integrado individual. |
| Administração | Cancelamento e liberação | **OK** | Integração autenticada confirmou cancelamento, liberação do driver e estado público. |
| Administração | Editar entregador, reassociar, consultar eventos | **PARCIAL** | Edição/reassociação e histórico têm cobertura integrada; a consulta visual dos eventos e o fluxo autenticado na interface ainda não foram homologados. |
| Cliente | Evitar enumeração e ler link individual | **OK** | Rules emulator: acesso individual permitido; listagem pública negada. |
| Cliente | Exibir nome/status do entregador | **PARCIAL** | Dados e interface implementados; sem teste visual/autenticado completo no cliente. |
| Compatibilidade financeira | Venda em dinheiro concorrente/idempotente no callable | **OK (emuladores)** | A integração atual abre pelo `operateCashRegister`, repete e concorre vendas; verifica lançamento e movimento únicos. |
| Compatibilidade financeira | Abertura de caixa → conclusão da entrega | **OK (backend/emuladores), PARCIAL (interface ponta a ponta)** | A interface usa `operateCashRegister`; a integração confirma a entrega usando o controle criado pela mesma callable. Ainda falta percorrer os cliques autenticados de Caixa e entregador em navegador. |
| Compatibilidade financeira | Caixa fechado, PIX/cartão, inconsistências e estornos | **OK (emuladores)** | Integração cobre bloqueio sem escrita parcial, pagamento sem efeito sobre dinheiro físico, caixa inconsistente e estorno idempotente. Não equivale à homologação contábil/operacional em produção. |
| Segurança | Código legado nos documentos antigos | **PARCIAL** | Callable de limpeza limitada a 450 por execução; não foi executada em staging/produção. A Function ainda falta no projeto de produção, portanto a limpeza não pode ser concluída pela central publicada atual. |
| Mobile/PWA | Instalação e push com app fechado | **AUSENTE** | Não há manifest/service worker nem FCM/VAPID. Atualização em tempo real funciona enquanto o painel está aberto, mas não substitui push. |
| QA visual | 360/390/430 px e telas de referência | **PARCIAL** | Quatro telas públicas foram verificadas manualmente nesses viewports em 24/09; não há E2E configurado nem comparação autenticada/completa de todas as telas de referência. |

## Validações executadas

- `npm run ci`: lint, TypeScript, build e **38 testes de aplicação aprovados** no último checkpoint.
- `npm run test:functions`: **14 testes aprovados**.
- `npm run test:rules`: **6 testes aprovados** no Firestore Emulator.
- `npm run test:functions:integration`: **14 testes aprovados** (pedido/outbox, confirmação concorrente, bloqueio de código, cancelamento, reassociação, edição de cadastro e saneamento legado) nos emuladores Auth, Firestore e Functions.
- `npm audit --omit=dev --audit-level=moderate`: **0 vulnerabilidades de produção**. Instalação completa reportou 7 moderadas em dependências de desenvolvimento; não foi aplicado upgrade automático.
- O ambiente usa Node 24 apesar do runtime Functions declarado como Node 22; o Firebase Emulator emitiu aviso. Firebase de produção, App Check, FCM e dispositivos reais não foram testados.

## Situação vigente — 28/09/2026

**Estado geral: NÃO HOMOLOGADO PARA PRODUÇÃO.** A auditoria local desta retomada passou nos testes e builds executáveis, mas a configuração Firebase real e a jornada autenticada visual continuam sem homologação. Nenhum deploy foi feito.

### Base e revisão

- Branch `main`, HEAD `6a6124a` (`feat: continue delivery driver system`), sincronizada com `origin/main` antes deste checkpoint. Arquivos temporários locais não rastreados foram preservados e não fazem parte do registro.
- Reconciliado o achado histórico de 23/09 sobre a abertura de caixa: ele foi corrigido depois. `lib/cash-register.ts` encaminha a abertura à callable `operateCashRegister`, que grava `cashRegisters` e `cashControl/main` na mesma transação; a conclusão da entrega exige esse vínculo. A matriz acima substitui o status antigo de **QUEBRADA** por evidência atual dos emuladores.
- A inspeção local do portal cobriu apenas a página pública de login do entregador. O navegador ofereceu preenchimento automático; não usei esses dados, não autentiquei e fechei a aba de teste. Não houve teste visual das telas autenticadas nem medição de viewport mobile nesta rodada.

### Testes executados nesta retomada

- `npm run ci`: **passou** — lint, TypeScript, 40 testes de aplicação e build.
- `npm run test:functions`: **passou** — 14 testes unitários.
- `npm run test:rules`: **passou** — 6 testes do Firestore Rules Emulator.
- `npm run test:functions:integration`: **passou** — 49 testes nos emuladores Auth, Firestore e Functions. Cobertura inclui pedido/preço, atribuição e aceite concorrentes, vínculo/isolamento, código inválido e limite de tentativas, conclusão idempotente, recusa/falha/requeue/reassociação/cancelamento, caixa, dinheiro/PIX/cartão, estornos e edição/ativação de entregadores.
- `npm run build:firebase`: **passou** — app, Functions e preparação do servidor Firebase.
- `npm exec wrangler -- deploy --dry-run --config dist/server/wrangler.json`: **passou sem publicar** — 147 módulos e 440 assets (2.257,42 KiB total; 620,66 KiB gzip).
- `npm audit --omit=dev --audit-level=moderate` e `npm --prefix functions audit --omit=dev --audit-level=moderate`: **0 vulnerabilidades** de produção em ambos os pacotes.
- `git diff --check`: sem erros. O host continua em Node 24, diferente do runtime Node 22 declarado; a build também mantém o aviso de chunk cliente acima de 500 kB.

### Gates e próximos passos

- `npm run check:production` bloqueia pelo placeholder da chave App Check; `npm run check:production:backend` encontrou **28 Functions requeridas ausentes** no projeto `food-5fb44`. O projeto está no plano Spark. É preciso que o responsável habilite o plano de faturamento compatível e forneça/configure a chave App Check real por canal seguro; não alterei billing, segredos nem produção.
- A conta Cloudflare está autenticada neste host e o Wrangler lista oito versões existentes para `acai-mais-sabor`, a mais recente datada de 18/09/2026. Isso não comprova que a versão publicada corresponda ao HEAD atual. O dry-run acima só validou o artefato local; nenhum upload/deploy foi feito.
- Falta E2E autenticado no navegador para concluir a jornada cliente → painel/admin → entregador → cliente/financeiro, bem como QA visual real nas larguras 360/390/430 px para as telas autenticadas e estados de erro/loading. O backend integrado não substitui essa validação.
- Antes de release: resolver os gates de Firebase/App Check, publicar Functions + Rules + índices + frontend como conjunto coordenado; validar em ambiente de staging com contas e endereços sintéticos; reexecutar o fluxo completo e verificar rastreio, histórico, caixa e Financeiro sem duplicidade; só então considerar deploy Cloudflare.
- PWA/FCM/Web Push continuam ausentes; telas conectadas recebem atualizações em tempo real, mas não há push com o app fechado. Maps externos, aparelhos físicos e reconciliação contábil real não foram homologados.

## Checkpoint de continuidade — 23/09/2026

**Estado geral: NÃO HOMOLOGADO.** A matriz anterior registra resultados automatizados, mas não substitui esta jornada pela interface nem os gates móveis/produção ainda pendentes.

Base desta retomada: `c64c6e9` em `main`; a árvore estava limpa antes das alterações deste checkpoint.

### Jornada real percorrida no ambiente local

- Loja pública abriu com categorias e produtos; foi possível montar um açaí e concluir um pedido sintético de entrega.
- O pedido percorreu `Novo → Confirmado → Em preparo → Pronto`; o painel refletiu as mudanças.
- Foi criado um entregador de teste, ele entrou no portal, ficou disponível, recebeu a corrida, aceitou, confirmou a retirada, iniciou a rota e marcou chegada. A página do entregador exibiu endereço e mapa, mas não revelou o código secreto; esse código apareceu apenas no acompanhamento do cliente.
- **Bloqueio crítico reproduzido:** ao confirmar a entrega com o código correto, a Function respondeu `A loja precisa abrir o Caixa antes de concluir a entrega` (`failed-precondition`/400), embora a página Caixa mostrasse `Caixa aberto` e R$ 100,00 de saldo inicial. A confirmação não concluiu o pedido nem lançou receita/movimentação.
- Causa identificada: `lib/cash-register.ts::openCashRegister` cria somente um documento em `cashRegisters`; não atualiza `cashControl/main.openRegisterId`. Já `confirmDelivery` exige esse vínculo. A interface e a Function estão lendo fontes de verdade incompatíveis. **Não contornar manualmente nem declarar o fluxo financeiro aprovado.**
- Também foi corrigido o cadastro de entregador: depois de a Function criar a conta, `event.currentTarget` era acessado após um `await`, quando já era `null`. A tela mostrava erro apesar do cadastro ter sido efetuado. O teste de componente reproduziu o erro (RED) e passou com a correção (GREEN).
- O teste usou somente Firebase Emulator/projeto `demo-acai-mais-sabor` e dados sintéticos. O link do Google Maps foi inspecionado, mas não aberto. Nenhuma operação ocorreu em Firebase de produção.

### Como retomar

1. Confira a branch e o estado do repositório; continue do commit publicado mais recente, sem reconstruir as jornadas já implementadas.
2. Para validação manual, instale dependências (`npm ci`), inicie `npm run emulators` e, em outro terminal, `npm run dev -- --port 3000`. A loja fica em `http://localhost:3000`; painel, em `/admin`. Use somente contas de teste no emulador. Se precisar recriar dados, pare os emuladores persistentes e use `npm run seed:emulator`; configure `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` apenas no ambiente local para criar um admin de teste. O script exige hosts dos emuladores e nunca deve ser executado contra produção.
3. Corrija a abertura do Caixa para usar a callable `operateCashRegister` (`operation: OPEN`) — e alinhe também venda local, suprimento, sangria e fechamento às operações server-side disponíveis. Garanta criação atômica de `cashRegisters`, `cashMovements` e `cashControl/main`, com idempotência e um único caixa aberto.
4. Adicione/execute regressões para: caixa aberto pelo fluxo da interface ser aceito por `confirmDelivery`; venda em dinheiro aumentar o esperado exatamente uma vez; PIX/cartão não alterarem dinheiro físico; caixa fechado bloquear a conclusão sem escrita parcial; repetição/concorrência não duplicarem movimento nem receita. Verifique `orders`, `financeEntries/order-{orderId}`, `cashMovements/order-{orderId}`, `cashRegisters` e `cashControl/main` no emulador.
5. Repita a jornada completa cliente → preparo → atribuição → aceite → retirada → rota → chegada → código → conclusão, e confirme simultaneamente a tela do cliente, a central de entregas, Financeiro e Caixa. Inclua falha, devolução à fila, reassociação, recusa, cancelamento e tentativa de código inválido.
6. Faça QA visual com viewport 360, 390 e 430 px em cliente, admin e entregador; registre evidência. Não abrir links externos de mapa durante teste com endereços reais.
7. Rode `npm run ci`, `npm run test:functions`, `npm run test:rules` e `npm run test:functions:integration`. `test:rules` usa o emulador Firestore em 8180 quando já está ativo; a integração inicia seus próprios emuladores, então evite conflito de portas. Atualize esta matriz com evidências e só marque homologado quando nenhum gate crítico estiver pendente.

As credenciais e configurações locais devem permanecer fora do Git. Não copie senhas, códigos de recebimento, `.env.local`, dados do emulador ou tokens privados para este documento.

## Próximos gates para homologação de mercado

1. Executar a limpeza de tokens legados em cópia de dados e depois no projeto real, após backup.
2. Adicionar E2E (Playwright ou equivalente) para login, aceite/recusa, retirada, rota, chegada, código errado/correto, falha, reassociação e cancelamento.
3. Validar visualmente os 11 estados de referência nos três tamanhos móveis; fornecer as imagens ausentes.
4. Decidir e configurar PWA/FCM (incluindo consentimento de notificações), chaves e regras de produção.
5. Homologar Firebase/App Check e dinheiro/PIX/cartão com a operação real e conferir devolução/estorno.

## Checkpoint de continuidade — 24/09/2026

**Estado geral: NÃO HOMOLOGADO PARA PRODUÇÃO.** O código passou nos gates automatizados locais abaixo, mas ainda falta QA visual da interface móvel e configuração/validação do Firebase de produção. Nenhuma implantação foi feita.

### Repositório e base

- Repositório: `CristianoRFB/Acaiteria`, branch `main`.
- HEAD local antes da retomada: `2ec1efa`; sincronizado por fast-forward com o GitHub até `f2a253d` antes das alterações desta sessão.
- Esta retomada parte do commit publicado `f2a253d`; o histórico da branch registra o commit que acompanha este checkpoint.
- Arquivos temporários preexistentes (`.tmp-*` e `site-version-*.tar.gz`) foram preservados e não fazem parte das mudanças desta sessão.

### Correções e evidência desta sessão

- Caixa e Financeiro agora usam a callable autenticada `operateCashRegister` para abertura, sangria/suprimento, venda local e fechamento. Isso mantém `cashRegisters`, `cashMovements` e `cashControl/main.openRegisterId` sincronizados; estorno também usa a callable `refundCompletedOrder`.
- A página Caixa mantém o identificador idempotente da mesma tentativa enquanto o formulário permanece aberto; o backend confirma/fecha transacionalmente e rejeita movimento em caixa que não é o atual.
- Corrigida a autorização residual de entregadores antigos: presença em `driverIds` legado não concede leitura da entrega/endereço nem de eventos após reassociação. O histórico privado do entregador permanece acessível ao próprio titular.
- A devolução de falha à fila remove vínculo, nome público e timestamps da tentativa anterior, preservando eventos e histórico. A central administrativa permite cancelar explicitamente um pedido com falha e registrar o motivo.
- O portal do entregador tem telas funcionais por abas para Início, Pedidos (atual/pendentes/concluídos), Histórico e Perfil; o link de rota inclui complemento e referência do endereço.
- O modelo compartilhado `DeliveryEvent` agora inclui `CODE_REJECTED`, que é emitido pelo backend ao rejeitar uma tentativa de código.
- Um teste de cancelamento inicialmente falhou porque seu fixture usava um ID de entrega não canônico. O fixture passou a usar `delivery-${orderId}`, como o sistema real; a suíte de integração repetida passou.

### Gates automatizados executados

- `npm run ci`: **passou** — lint, typecheck, build e 38 testes da aplicação.
- `npm run test:functions`: **passou** — 14 testes.
- `npm run test:rules`: **passou** — 6 testes no emulador Firestore.
- `npm run test:functions:integration`: **passou** — 21 testes nos emuladores Auth, Firestore e Functions, incluindo atribuição concorrente, dois aceites simultâneos, tela antiga após reassociação, código incorreto/rate limit, confirmação concorrente, requeue e nova atribuição, cancelamento após falha, caixa fechado, vendas locais idempotentes e impactos CASH/PIX/CARD.
- `git diff --check`: **passou**.
- `npm audit --omit=dev --audit-level=moderate`: **0 vulnerabilidades de produção**.
- O build emitiu dois avisos ambientais/não bloqueantes: Functions declara Node 22, mas a máquina executa Node 24; e há chunks client acima de 500 kB.
- `npm run check:production`: **bloqueado corretamente** — faltam as sete variáveis de configuração Firebase/App Check exigidas; não foram exibidos valores secretos nem feita implantação.

### Limitações que continuam abertas

- QA visual nos viewports de 360, 390 e 430 px não foi executado: o conector do navegador embutido não conseguiu conectar e o repositório não tem Playwright instalado. Não declarar que o layout foi homologado visualmente.
- Não há script `test:e2e` no `package.json`; os testes de integração cobrem callables/banco, não a jornada completa pelas interfaces de cliente, admin e entregador.
- Não há manifest/service worker de PWA nem FCM/Web Push em `public`/app; atualizações em tempo real exigem o painel conectado. APK/Capacitor permanece fora do escopo atual.
- Firebase real, App Check, Maps com endereço real e envio de notificações não foram testados. Não usar dados de cliente real nos próximos testes.

### Próxima retomada

1. Repetir a inspeção de `git status` e preservar os arquivos temporários locais; considerar somente os arquivos rastreados da sessão.
2. Disponibilizar um backend de navegador/E2E e validar as telas nos tamanhos 360/390/430 px, sem abrir Maps com endereço real.
3. Provisionar configuração Firebase/App Check de produção por meio seguro e executar `npm run check:production`; continuar sem deploy até homologar operação real e Rules.
4. Decidir se PWA/push faz parte do próximo escopo. Hoje não está implementado e não deve ser descrito como push.
5. Registrar novas evidências e revisar este checkpoint; não implantar em produção enquanto os gates acima estiverem abertos. Nunca incluir `.env`, tokens, logs ou os arquivos temporários preexistentes.

## Checkpoint adicional — 24/09/2026

**Estado: NÃO HOMOLOGADO.** Esta rodada encontrou e corrigiu uma falha na sincronização de acesso do entregador. A verificação cobre regras, callables e persistência em emuladores; não substitui a homologação visual, de produção ou em aparelho físico.

### Correção e regressões acrescentadas

- `setDeliveryDriverEnabled` atualiza Firestore e reconcilia `Firebase Auth` com o estado mais recente, verificando novamente o estado persistido para evitar deixar as contas divergentes após alterações administrativas concorrentes. Uma falha de Auth é reportada explicitamente; as autorizações de backend e Firestore continuam bloqueadas pelo estado de usuário/entregador.
- Antes da correção, desativar um cadastro mudava `users.active` e `deliveryDrivers.enabled`, mas não desativava a conta no Firebase Auth. A nova integração comprova desativar/reativar, bloquear disponibilidade/atribuição após desativação e impedir desativação durante uma corrida.
- Cobertura ampliada para tentativa do código correto por outro entregador, replay após entrega concluída, código após cancelamento, criação/login de novo entregador sem gravar senha no Firestore, link público incorreto, isolamento de dados administrativos/financeiros do entregador, toggles concorrentes por dois admins e falha sem conta Auth correspondente.

### Validações executadas nesta rodada

- `npm run ci`: **passou** — lint, typecheck, build e 38 testes da aplicação.
- `npm run test:functions`: **passou** — 14 testes.
- `npm run test:rules`: **passou** — 6 testes no Firestore Emulator.
- `npm run test:functions:integration`: **passou** — 25 testes nos emuladores Auth, Firestore e Functions.
- `git diff --check`: **passou**.
- O build continua avisando sobre chunks client acima de 500 kB; o emulador continua avisando que a máquina está em Node 24 enquanto Functions declara Node 22.

### Gates ainda abertos

- Sem QA visual/E2E nas interfaces nos viewports de 360/390/430 px; sem teste em aparelho físico. Nesta rodada, `npm run dev -- --port 3000` iniciou corretamente, mas o navegador embutido não encontrou um backend de conexão; nenhum layout foi marcado como aprovado visualmente.
- Firebase de produção e App Check não foram configurados/verificados; nenhuma implantação foi feita.
- PWA/FCM/Web Push continuam inexistentes; a tela aberta recebe atualizações em tempo real, mas não há comprovação de notificação com o app fechado.
- Não foi feita homologação operacional de dinheiro, estorno, PIX/cartão ou mapas com endereço real.

Próximo passo: retomar a validação de navegador/aparelho e os gates de produção descritos acima; preservar os arquivos não rastreados existentes e nunca registrar credenciais, códigos de recebimento ou dados pessoais reais.

## Checkpoint adicional — 24/09/2026 — integridade de corrida e consultas móveis

**Estado: NÃO HOMOLOGADO PARA PRODUÇÃO.** Esta rodada encontrou uma brecha reproduzível de concorrência e inconsistências nas listas do entregador/admin. Corrigido e testado em emuladores; QA visual, aparelhos e ambiente real continuam pendentes.

### Achados e correções

- `setDriverAvailability` aceitava `AVAILABLE` enquanto o perfil ainda estava `BUSY`. Como `assignDelivery` confiava apenas no status, uma chamada direta podia sobrescrever `currentDeliveryId` e atribuir duas corridas ao mesmo entregador. A disponibilidade agora não pode ser alterada enquanto o perfil estiver ocupado **ou** mantiver um vínculo de corrida.
- `assignDelivery` e `reassignDelivery` agora recusam perfis com status/vínculo incompatíveis ou uma entrega já vinculada. A desativação administrativa também não altera perfis que ainda tenham corrida vinculada.
- Aceite/recusa, avanço de etapa, registro de falha e confirmação do código agora exigem, dentro da mesma transação, que o entregador ativo esteja `BUSY` e que `currentDeliveryId` corresponda exatamente à entrega solicitada.
- As regressões de concorrência usam duas sessões Firebase Auth independentes do mesmo entregador. Novos testes cobrem disponibilidade adulterada, vínculo inconsistente, mutação de outra corrida e bloqueio de efeitos financeiros/código nesses casos.
- Na aba Pedidos do entregador, “Atual” deixou de repetir itens “Pendentes”; a corrida em andamento é resolvida pelo identificador vinculado no perfil. Listeners agora pedem apenas entregas ativas e histórico ordenado por atualização.
- A central admin passou a consultar entregas ativas, falhas e concluídas hoje separadamente, com ordenação temporal e sem truncar a fila operacional. “Entregues hoje” usa `deliveredAt` desde a meia-noite de `America/Sao_Paulo`, em vez de contar entregas de uma amostra arbitrária. A lista de atribuição retorna apenas entregadores ativos/disponíveis e sem corrida vinculada.
- Foram adicionados índices compostos de Firestore para essas consultas. Antes de publicar código que use as novas consultas, publicar também `firestore.indexes.json`.

### Validações desta rodada

- `npm run ci`: **passou** — lint, typecheck, build e 38 testes da aplicação.
- `npm run test:functions`: **passou** — 14 testes.
- `npm run test:rules`: **passou** — 6 testes no Firestore Emulator.
- `npm run test:functions:integration`: **passou** — 28 testes nos emuladores Auth, Firestore e Functions, cobrindo as novas regressões e os fluxos existentes de pedido/caixa/entrega.
- `npm run build:firebase`: **passou** após os ajustes finais de UI, consulta diária e índices; preparação Firebase compilou o frontend e as Functions.
- `git diff --check`: **passou** antes da última atualização deste documento; repetido ao fechar o checkpoint.
- Na primeira tentativa de integração, a porta 8180 estava ocupada por um processo órfão do Firestore Emulator após `test:rules`. O processo Java foi confirmado pelo caminho/linha de comando do emulador local e pelo processo pai já encerrado; somente esse processo foi finalizado. A nova execução de integração terminou com sucesso.
- Permanecem os avisos não bloqueantes já registrados: runtime local Node 24 versus Functions Node 22 e chunk cliente acima de 500 kB.

### Limitações e próximos gates

- Não houve QA visual nos tamanhos 360/390/430 px nesta rodada. O conector do navegador embutido não encontrou backend, e não há Playwright/E2E configurado; telas e responsividade permanecem sem homologação visual.
- Firebase real, índices implantados, App Check, Maps com endereço real, notificações e aparelhos físicos não foram testados. Nenhuma implantação foi feita.
- Não há PWA/FCM/Web Push; atividade em tempo real depende da tela conectada. APK/Capacitor permanece fora do escopo atual.
- O relatório global continua aberto até executar a validação visual/E2E e as etapas restantes para produção sem falhas reproduzíveis. Nunca incluir `.env`, tokens, códigos de recebimento ou os arquivos temporários locais preexistentes.

## Checkpoint adicional — 24/09/2026 — privacidade do rastreio e concorrência admin

**Estado: NÃO HOMOLOGADO PARA PRODUÇÃO.** A revisão de segurança encontrou uma leitura autenticada indevida no espelho público de rastreio; a correção e os testes de regressão passaram. Isso não conclui a auditoria integral descrita no goal.

### Achados e correções

- O `get` público de `/publicOrders/{id}` agora exige uma sessão anônima e o identificador `publicCode` correspondente, salvo para staff. Antes, qualquer usuário autenticado que obtivesse o link podia consultar diretamente o documento inteiro, incluindo código de recebimento e dica, embora a interface de entregador não os exibisse.
- As regras de Firestore agora comprovam os dois lados: o link de cliente anônimo continua lendo seu próprio rastreio; entregador autenticado não lê nem lista documentos públicos. A integração também confirma que a callable de consulta para entregadores não retorna código nem dica.
- Corrigida a atribuição de auditoria em `requeueDelivery`: eventos agora registram o papel real do ator (incluindo admin) em vez de registrar sempre `staff`.
- Acrescentado teste de duas atribuições concorrentes do mesmo pedido para o mesmo entregador: apenas uma operação vence e é criado um único evento de atribuição.
- Atribuição e reatribuição agora conferem na mesma transação se a conta de usuário do destino existe, mantém o papel `driver` e não está desativada; antes, um perfil operacional inconsistente poderia receber uma corrida sem conseguir entrar no app. Duas regressões verificam que pedido e vínculo atual ficam intactos quando essa conta está inativa.

### Validações desta rodada

- `npm run ci`: **passou** — lint, typecheck, build e 38 testes da aplicação.
- `npm run test:functions`: **passou** — 14 testes.
- `npm run test:rules`: **passou** — 7 testes no Firestore Emulator.
- `npm run test:functions:integration`: **passou** — 31 testes nos emuladores Auth, Firestore e Functions.
- `npm run build:firebase`: **passou** — frontend, Functions e preparação do servidor Firebase.
- `git diff --check`: **passou**.
- Permanecem os avisos de ambiente já documentados: runtime local Node 24 versus Node 22 declarado para Functions e chunk cliente acima de 500 kB.

### Gates ainda abertos

- QA visual/E2E nas interfaces em 360/390/430 px e aparelho físico continua sem execução; os testes acima cobrem app unitário, Rules e integração de backend, não comprovam a jornada integral pelo navegador.
- Firebase de produção/App Check, implantação dos índices, Maps real e notificações não foram homologados. Nenhum deploy foi feito.
- PWA/FCM/Web Push continuam inexistentes; não descrever atualizações enquanto a tela está fechada como notificações entregues.
- O estado permanece **NÃO HOMOLOGADO** até fechar os gates visuais/E2E e externos sem falhas reproduzíveis. Preservar arquivos temporários locais e nunca registrar credenciais, códigos ou dados pessoais reais.

## Checkpoint adicional — 24/09/2026 — responsividade local e hidratação do checkout

**Estado: NÃO HOMOLOGADO PARA PRODUÇÃO.** Uma rodada de QA manual no navegador local cobriu os fluxos públicos principais em telas estreitas e encontrou uma condição transitória no checkout. A correção foi isolada, ganhou teste de regressão e passou pela CI; não houve login, pedido enviado, acesso a dados reais nem implantação.

### Verificações e correção

- Conferidos visualmente início/cardápio, configuração do açaí, carrinho e checkout em viewports de 360, 390 e 430 px. Configurador e checkout mantiveram `scrollWidth` igual à largura do cliente em cada tamanho; a navegação horizontal das categorias permanece contida na própria faixa. Carrinho e controles de quantidade foram exercitados apenas com estado local de teste, e a quantidade/preço total atualizaram corretamente.
- As rotas protegidas de entregas/admin e do entregador redirecionaram para login sem sessão. Não foram usadas credenciais nem tentada autenticação; portanto, os fluxos visuais autenticados de administração e entrega seguem sem homologação E2E.
- Durante a restauração de um carrinho persistido, o checkout podia mostrar por um instante “Carrinho vazio” antes de o `CartProvider` hidratar o estado salvo. A tela agora mostra um estado acessível “Restaurando seu carrinho…” enquanto `cart.hydrated` for falso e só avalia o estado vazio depois disso. Um teste JSDOM reproduz a ordem de renderização e protege contra regressão.
- Nenhum pedido foi submetido e nenhum endereço real foi aberto em Maps. Dados de clientes, códigos e segredos não foram usados ou copiados.

### Validações desta rodada

- `npm run ci`: **passou** — lint, typecheck, 39 testes da aplicação em 10 arquivos e build do frontend.
- `npm run build:firebase`: **passou** após a correção — frontend, Functions e preparação do servidor Firebase.
- `npm run test:functions`: **14 testes passaram** no checkpoint `98f3538`; nenhum arquivo de backend/Functions foi alterado depois desse checkpoint.
- `npm run test:rules`: **7 testes passaram** no checkpoint `98f3538`; as regras Firebase não foram alteradas depois desse checkpoint.
- `npm run test:functions:integration`: **31 testes passaram** nesta revisão; a primeira tentativa precisou liberar um emulador Firestore local órfão na porta 8180, depois confirmado como processo do mesmo projeto demo.
- `git diff --check`: **passou**. Permanecem os avisos não bloqueantes de chunks do cliente maiores que 500 kB e de classificação dinâmica de rotas pelo vinext.

### Gates ainda abertos

- Não há suíte de navegador E2E automatizada instalada/configurada; a QA de viewport foi manual. Admin e entregador autenticados não percorreram um fluxo completo no navegador, e nenhum aparelho físico foi homologado.
- Firebase de produção, App Check, índices efetivamente implantados, Maps com endereço de teste autorizado e notificações não foram verificados. Nenhum deploy foi feito.
- PWA/FCM/Web Push continuam fora da implementação atual. Atualização em tempo real com a tela conectada não significa notificação entregue com o app fechado.
- A auditoria ampla do goal continua aberta até fechar os gates operacionais e externos sem falhas reproduzíveis. Preservar arquivos temporários locais não rastreados; não os adicionar ao commit.

## Checkpoint adicional — 02/10/2026 — PWA local e viewport móvel real

**Estado: NÃO HOMOLOGADO PARA PRODUÇÃO.** Esta rodada abriu a aplicação local no painel do Codex, concluiu a correção responsiva dos logins e conferiu o viewport móvel em navegador Chromium com emulação de dispositivo. A auditoria operacional de entregas e os gates externos continuam abertos.

### Implementação e QA desta rodada

- Base PWA local: manifestos separados para cliente, administração e entregador; ícones próprios; página offline genérica; registro do service worker apenas em produção/contexto seguro. O worker só armazena assets estáticos versionados e não armazena páginas privadas, pedidos ou dados de clientes.
- O primeiro teste por redução da janela desktop não representava um viewport móvel real e produziu capturas enganosas. Repeti com `Emulation.setDeviceMetricsOverride` nos tamanhos 360, 390 e 430 px. Nas rotas `/`, `/admin/login` e `/entregador/login`, `innerWidth`, `documentElement.clientWidth`, `documentElement.scrollWidth` e `body.scrollWidth` coincidiram; as capturas de 360 px mostraram títulos, formulários e botões dentro da tela. Faixas horizontais intencionais do cardápio continuam roláveis dentro do próprio componente.
- Ajustes responsivos: largura mínima zero no grid e nos campos dos logins; quebra e tipografia do título do destaque na landing page para caber em telas estreitas.
- Servidor Wrangler local em `127.0.0.1:8788`, modo `--local`, aberto no painel. Rotas públicas, três manifestos, service worker, página offline e três PNGs de ícone responderam HTTP 200.

### Validações

- `npm run ci`: **passou** — lint, typecheck, build e 44 testes da aplicação (11 arquivos). Permanecem avisos não bloqueantes sobre chunks cliente acima de 500 kB e classificação dinâmica de rotas pelo vinext.
- `npm run test:functions`: **14 passaram**; `npm run test:rules`: **6 passaram**; `npm run test:functions:integration`: **49 passaram** em emuladores locais no ciclo de QA desta retomada. Esses testes usam Firebase demo/emulado, não dados de produção.
- `git diff --check`: passou antes deste registro; repetir depois da edição.

### Gates externos ainda abertos

- `npm run check:production` segue bloqueado porque a chave/configuração de App Check ainda está como placeholder `COLE_AQUI`. A inspeção somente de leitura do backend de produção (`food-5fb44`) não encontrou as 28 Functions esperadas como implantadas. Nenhum deploy foi feito.
- Não foram testados conta real de entregador, aparelho físico, mapas com endereço real nem entrega de notificações com o app fechado. A QA móvel desta rodada cobriu landing/login, não todo o painel autenticado do entregador.
- PWA é base instalável/offline de assets; não é implementação de push. Não afirmar prontidão empresarial ou produção até resolver App Check, backend, Rules/índices e homologar jornada operacional real.

## Checkpoint adicional — 02/10/2026 — jornada completa de entrega em emuladores

**Estado: NÃO HOMOLOGADO PARA PRODUÇÃO.** A jornada passou por navegador móvel e pelos emuladores isolados de Firebase. O pedido e as contas usados foram fictícios, limitados ao projeto `demo-acai-mais-sabor`.

### Jornada percorrida e correções

- Cliente montou um pedido de R$ 3,50, escolheu entrega, preencheu endereço de QA e recebeu o total de R$ 7,50 com taxa de R$ 4,00. O checkout impediu seguir sem os dados obrigatórios e apresentou o endereço no resumo antes do envio.
- Admin confirmou o pedido, abriu a ficha de cozinha, escolheu “Mandar sem imprimir” e marcou como pronto. A opção “Mandar e imprimir” estava disponível; o teste evitou abrir diálogo de impressão no ambiente automatizado.
- Admin atribuiu o pedido a um entregador ativo. O entregador entrou, aceitou a corrida, confirmou retirada, iniciou rota e registrou chegada. Código incorreto foi recusado. Código correto foi recusado enquanto o Caixa estava fechado, conforme a regra de negócio; após abrir o Caixa, a confirmação concluiu a entrega.
- O rastreio público atualizou para “Pedido concluído”. A UI autenticada do entregador não permitiu ler o documento público que contém o código; a leitura do rastreio funcionou em contexto anônimo de cliente.
- Caixa e Finanças registraram exatamente R$ 7,50 em Pix, R$ 0,00 em dinheiro e uma movimentação vinculada ao pedido. O fluxo não registrou receita antes da conclusão.
- A inspeção encontrou endereço repetindo a referência, título “Entrega em andamento” depois da conclusão e códigos técnicos `[400]`/`[403]` nas mensagens de erro. O app agora mantém complemento e referência em linhas próprias, exibe “Entrega concluída” e remove esses sufixos das mensagens. A home do entregador distingue corrida atribuída aguardando aceite de entrega em andamento.

### Validações

- `npm run ci`: **passou** — lint, typecheck, 46 testes da aplicação e build completo.
- `npm run test:functions`: **14 passaram**; `npm run test:rules`: **6 passaram**; `npm run test:functions:integration`: **49 passaram** nos emuladores locais.
- Jornada web real em ambiente de QA: pedido, fila do admin, impressão opcional da ficha, atribuição, aceite, retirada, rota, chegada, bloqueio por código inválido, bloqueio por caixa fechado, conclusão e confirmação no cliente/Financeiro.
- Viewport móvel do entregador em 360, 390 e 430 px: largura do documento e do corpo coincidiu com a largura disponível, sem overflow horizontal. Admin Caixa/Finanças e checkout também foram verificados em 390 px.
- Os testes de regras e integração apontam para projeto demo e emuladores; nada foi implantado nem escrito no Firebase de produção.

### Gates ainda abertos

- Produção segue bloqueada pelo App Check placeholder `COLE_AQUI` e pela ausência das 28 Functions esperadas no projeto `food-5fb44`. Não implantar antes de configurar App Check e publicar/revalidar o backend.
- O teste não cobriu endereço real/Maps, impressora física, aparelho físico, FCM/push, pico de concorrência em produção, integração Saipos habilitada nem reconciliação de pagamentos externos.
- Permanecem avisos não bloqueantes no build: chunk cliente acima de 500 kB e classificação dinâmica de algumas rotas pelo vinext. A auditoria global continua aberta até resolver os gates externos e homologar essas integrações.

## Revalidação do código — 07/10/2026 — `f90eaf8`

- `git pull --ff-only origin main`: sem commits novos; a base já estava atualizada. O commit `f90eaf8` permanece como HEAD.
- `npm run ci`: passou nesta retomada — lint, typecheck, 46 testes do app e build.
- `npm run test:rules`: 6 testes passaram; `npm run test:functions`: 14 passaram; `npm run test:functions:integration`: 49 passaram nos emuladores locais.
- `npm run build:firebase`: passou; a compilação incluiu frontend, Functions e servidor Firebase. O aviso do chunk cliente de aproximadamente 567 kB continua não bloqueante.
- `npm audit --omit=dev --audit-level=moderate` e `npm --prefix functions audit --omit=dev --audit-level=moderate`: zero vulnerabilidades de dependências de runtime. O audit completo ainda reporta 16 vulnerabilidades altas em dependências de ferramentas de desenvolvimento; a correção automática sugerida exige downgrades incompatíveis e não foi aplicada.
- `npm run check:production`: bloqueado pela ausência de `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`.
- `npm run check:production:backend`: não conseguiu confirmar o inventário implantado do Firebase nesta sessão. O último checkpoint de produção registrado (02/10) encontrou 28 Functions críticas ausentes e plano Spark; confirmar novamente com a conta autorizada antes de qualquer publicação.
- A jornada web completa de pedido fictício → admin → entregador → caixa/financeiro está registrada no checkpoint de 02/10 e foi executada contra emuladores, não contra produção. Nenhum deploy ou dado real foi usado nesta retomada.

Estado do módulo: **NÃO HOMOLOGADO PARA PRODUÇÃO**. Evidência automatizada atual não substitui configuração de App Check, backend implantado, homologação de produção/staging e aceite operacional. O checklist comercial está em `docs/GO_LIVE_READINESS.md`.
