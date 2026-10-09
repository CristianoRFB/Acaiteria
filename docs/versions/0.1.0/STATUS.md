# Estado

## Implementação nesta árvore

- Resolver central de tenant por path, estados explícitos para tenant inexistente/suspenso e redirecionamentos históricos definidos.
- Dados operacionais sob `tenants/{tenantId}`; identidade global separada de memberships e autorização por tenant.
- Firestore Rules deny-by-default e Cloud Functions tenant-aware com validação de identidade, status e membership/role.
- Área global `/platform` para gestão de tenants, owner, suspensão/reativação e suporte somente leitura com audit log.
- Seed de emulador com Tenant A e Tenant B fictício, incluindo configuração, catálogo e identidades isoladas; Tenant B não reutiliza contatos/endereço do negócio real.
- Carrinho, histórico, tutoriais e caches locais namespaced por tenant; o carrinho só é exposto após hidratar a chave do tenant ativo, sem mostrar o snapshot anterior na troca A→B.
- White-label básico por tenant: nome, logo, cores, metadata, idioma, timezone e configuração operacional.
- Migração de Tenant A com dry-run e cópia sem remoção da origem; integração local cobre repetição, conflito, referência inválida e recuperação de cópia parcial.
- Documentação canônica, sete diagramas Mermaid com renders, manifesto de visuais/leads e seis screenshots reais de rotas públicas do Tenant A/B, montagem do produto e estados vazios de carrinho/checkout.

## Evidências locais

- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm test`: 15 arquivos, 59 testes passaram; inclui regressão para garantir que `.dev.vars` local não seja copiado para o pacote Firebase.
- `tests/cart-tenant-isolation.test.ts`: três casos provam que A→estado sem tenant→B não expõe itens de A, B não importa a chave global legada e a migração histórica da chave só copia para A.
- `npm run test:functions`: 2 arquivos, 14 testes passaram.
- `npm run test:rules`: 11 testes passaram no Firestore Emulator.
- `npm run test:functions:integration`: passou na execução conjunta mais recente — 4 arquivos, 54/54 testes. Os dois cenários que haviam apresentado timeout também passaram na suíte conjunta; a falha intermitente não foi reproduzida. O runner agora escolhe portas livres também para Logging, Hub, Eventarc e Tasks, reduzindo colisões com outros processos locais.
- `npm run test:migration:integration`: cinco cenários passaram em emulador temporário, sem acesso a projeto real.
- `npm run build:firebase`: passou nesta rodada; não equivale a deploy. O empacotamento remove `.dev.vars` do servidor local antes de copiar o runtime para Cloud Functions, e `firebase.json` também ignora esse arquivo. O build avisa sobre middleware legado do Vinext e um chunk cliente de aproximadamente 568 KiB.
- Wrangler `deploy --dry-run --config dist/server/wrangler.json`: passou novamente; pacote de aproximadamente 18,5 MiB (4,26 MiB gzip) foi apenas simulado, nenhum Worker foi publicado. A listagem do dry-run não incluiu `.dev.vars`.
- `npm run docs:diagrams`: sete diagramas renderizados.
- `npm run docs:check`: passou, validando 27 documentos, manifestos e referências locais.
- `npm run docs:leads`: passou; zero leads confirmados e nenhum lead inventado.
- `npm audit --omit=dev --audit-level=high`: passou sem vulnerabilidades de produção reportadas.
- As capturas reais disponíveis são os storefronts Tenant A desktop/mobile e Tenant B desktop, montagem do produto Tenant A desktop, carrinho vazio e checkout vazio Tenant A mobile. Foram recapturadas em 2026-10-09 na cópia temporária isolada do projeto, sem `.env.local`, com seed de desenvolvimento; o script validou HTTP 200, identidade/cores de cada tenant, estado esperado das rotas públicas e ausência de exceções `pageerror`. O servidor dev registrou o aviso React sobre `eval()` não suportado nesse ambiente, que não substitui nem invalida a checagem de build. Nenhum item, pedido ou dado foi gravado. Tracking com código válido e telas protegidas não foram falsificados nem capturados sem identidade demo autorizada.
- A documentação visual mantém essas seis capturas reais separadas de três imagens conceituais (uma capa e dois mockups), todas registradas em `GENERATED_VISUALS.md`; os mockups não comprovam funcionalidades.

## Não comprovado em ambiente real / ação necessária

- O Tenant A operacional está modelado e coberto localmente, mas os dados Firebase reais não foram copiados para `tenants/{tenantId}`. A migração de produção não foi executada.
- A primeira identidade `platform_owner` real não foi provisionada.
- Deploy de Firebase/Cloudflare, domínio, App Check, Auth domains, CORS, secrets, billing e smoke tests de produção não foram executados.
- `npm run check:production` permanece `NEEDS_USER_ACTION`: falta `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` na configuração de produção validada.
- A consulta read-only `firebase functions:list --project food-5fb44 --json` confirmou que o Firebase CLI não está autenticado (`Failed to authenticate, have you run firebase login?`). Por isso, o estado das Functions, o projeto e o billing ainda não foram verificados; nenhuma Function foi alterada.
- Screenshots autenticadas de admin, entregador e Platform Owner permanecem pendentes de ambiente/contas demo autorizadas.
- A criação de novos tenants e as jornadas protegidas têm cobertura de testes/emulador, mas precisam de homologação operacional no projeto de destino.

Esses passos exigem confirmar projeto e ambiente, backup restaurável, conta com e-mail verificado, credenciais e autorização explícita do responsável. Nenhum segredo foi incluído em documentação ou código.

## Próximas etapas

1. Preparar Firebase staging e validar restore de backup.
2. Provisionar `platform_owner` no ambiente escolhido por processo controlado.
3. Executar migração Tenant A em staging, comparar contagens/referências e validar rollback operacional.
4. Fazer smoke tests Tenant A × Tenant B com contas autorizadas; capturar telas protegidas reais.
5. Só então aprovar deploy de Rules, índices, Functions e Worker e repetir os gates no ambiente de destino.

## Gate de release

Classificação atual: `NOT_READY_FOR_PRODUCTION_MIGRATION_OR_DEPLOY`.

O core local e os testes de isolamento estão implementados, mas os critérios que dependem de dados/identidades reais e operação do projeto de produção continuam `NEEDS_USER_ACTION`. `GLOBAL_STANDARD_TARGET = v01`; entitlements comerciais permanecem `NEXT` e não possuem enforcement neste escopo.
