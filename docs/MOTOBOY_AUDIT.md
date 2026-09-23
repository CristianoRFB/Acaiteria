# Auditoria total do módulo de motoboys

Data: 23/09/2026. Base inicial: `680e1a8` (`main` sincronizada com `origin/main`, árvore limpa antes do trabalho). Escopo guiado por `GOAL_Acai_Mais_Sabor_Auditoria_Total_Motoboy.txt`.

Legenda: **OK** = comprovado em teste executado; **PARCIAL** = implementação presente, mas sem prova completa ou depende de infraestrutura; **QUEBRADA** = risco/comportamento reproduzível; **AUSENTE** = não encontrado.

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
| Administração | Editar entregador, reassociar, consultar eventos | **PARCIAL** | Implementado em callable/UI; faltou cenário integrado automatizado de edição/reassociação e QA visual. |
| Cliente | Evitar enumeração e ler link individual | **OK** | Rules emulator: acesso individual permitido; listagem pública negada. |
| Cliente | Exibir nome/status do entregador | **PARCIAL** | Dados e interface implementados; sem teste visual/autenticado completo no cliente. |
| Compatibilidade financeira | Venda em dinheiro concorrente/idempotente | **OK** | Emulador comprovou `amountCents`, `cashAmountCents`, saldo esperado e ausência de duplicidade. |
| Compatibilidade financeira | Caixa fechado, outras formas de pagamento e reversões em todos os cenários | **PARCIAL** | Requer caixa aberto para concluir; cenários restantes não foram integrados nesta bateria. |
| Segurança | Código legado nos documentos antigos | **PARCIAL** | Callable de limpeza limitada a 450 por execução; não executada contra Firebase real nem contra cópia de produção. Admin deve abrir a central publicada para concluir a limpeza. |
| Mobile/PWA | Instalação e push com app fechado | **AUSENTE** | Não há manifest/service worker nem FCM/VAPID. Atualização em tempo real funciona enquanto o painel está aberto, mas não substitui push. |
| QA visual | 360/390/430 px e 11 telas de referência | **AUSENTE** | As referências não vieram no workspace e não há `test:e2e`; não declarar homologação visual. |

## Validações executadas

- `npm run ci`: lint, TypeScript, testes de domínio e build — **aprovado**.
- `npm run test:functions`: **14 testes aprovados**.
- `npm run test:rules`: **6 testes aprovados** no Firestore Emulator.
- `npm run test:functions:integration`: **14 testes aprovados** (pedido/outbox, confirmação concorrente, bloqueio de código, cancelamento, reassociação, edição de cadastro e saneamento legado) nos emuladores Auth, Firestore e Functions.
- `npm audit --omit=dev --audit-level=moderate`: **0 vulnerabilidades de produção**. Instalação completa reportou 7 moderadas em dependências de desenvolvimento; não foi aplicado upgrade automático.
- O ambiente usa Node 24 apesar do runtime Functions declarado como Node 22; o Firebase Emulator emitiu aviso. Firebase de produção, App Check, FCM e dispositivos reais não foram testados.

## Próximos gates para homologação de mercado

1. Executar a limpeza de tokens legados em cópia de dados e depois no projeto real, após backup.
2. Adicionar E2E (Playwright ou equivalente) para login, aceite/recusa, retirada, rota, chegada, código errado/correto, falha, reassociação e cancelamento.
3. Validar visualmente os 11 estados de referência nos três tamanhos móveis; fornecer as imagens ausentes.
4. Decidir e configurar PWA/FCM (incluindo consentimento de notificações), chaves e regras de produção.
5. Homologar Firebase/App Check e dinheiro/PIX/cartão com a operação real e conferir devolução/estorno.
