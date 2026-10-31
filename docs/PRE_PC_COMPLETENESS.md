# Pre-PC implementation checkpoint — Açaí SaaS

## Incremento — Trial Pro self-service para tenant_owner (31/10/2026)

- `functions/src/tenant-trial.ts`: callable protegida `tenantStartProTrial` permite ao proprietário iniciar seu trial Pro de 14 dias sem cartão ou cobrança, apenas quando o tenant ainda não tiver qualquer documento de assinatura. Firestore Transaction garante unicidade, mesmo sob chamadas simultâneas.
- `components/admin-shell.tsx`: mostra ativação do trial somente ao `tenant_owner` sem plano atribuído; confirma antes da ação, mantém mensagens de erro e recarrega o snapshot comercial após sucesso.
- `functions/src/platform.integration.test.ts`: teste de permissão de usuário comum/anônimo, corrida de ativações, replay bloqueado, trial persistido e audit log global único.
- `app/saas/page.tsx`: apresentação do trial diferencia autoativação por owner de cadastro inicial assistido. Não promete gateway, checkout automático ou renovação automática.

**Status:** implementado na branch, sujeito à confirmação do CI do HEAD e à homologação funcional em ambiente real. **DemoMode Premium isolado permanece pendente.**


## Incremento — Relatórios comerciais e landing SaaS (31/10/2026)

- `shared/report-window.ts`: calcula a janela comercial real de 30 dias (Essencial), 365 dias (Pro) e histórico completo (Premium), respeitando a data civil do fuso horário de cada tenant e os limites já aprovados.
- `functions/src/monthly-report.ts`: relatório comercial autenticado e tenant-scoped, consultado pelo backend, retorna somente campos essenciais para os gráficos sem nome/telefone/endereço do cliente. Aplica a janela de tempo, o estado da assinatura e o entitlement financeiro; recusa truncamento silencioso de resultados.
- `app/admin/financas/page.tsx`: a inteligência comercial usa agora a callable em vez de ler pedidos diretamente para gerar relatórios; lançamentos históricos continuam presentes no livro-caixa para consulta e reconciliação.
- `tests/report-window.test.ts` e `functions/src/platform.integration.test.ts`: cenários de fuso, virada de mês, planos, acesso indevido, isolamento, payload sanitizado e downgrade sem exclusão.
- `app/saas/page.tsx`: landing de vendas separada do storefront, com preços/limites reais do catálogo aprovado, Pro recomendado, trial Pro e implantação assistida; não promete gateway, assinatura automatizada nem recursos futuros como existentes.
- `shared/tenancy.ts` e `functions/src/platform/admin.ts`: `/saas` é rota reservada; onboarding recusa slugs de rotas operacionais e de sistema.
- **Ainda pendente:** DemoMode Premium isolado (sem inventar tenant real), cobertura residual de gating, validação visual e operacional dos módulos, migração dos dados verdadeiros, configuração final e deploy autorizado. Nenhum screenshot foi tratado como prova de implementação sem captura do sistema executado.



## Implementação incremental — SubscriptionStatus e trial Pro (30/10/2026)

- `shared/subscription-status.ts`: avaliação determinística e independente de UI do estado comercial: tenant legado `UNASSIGNED`, manual `ACTIVE`, `TRIALING` Pro antes de `trialUntil`, e `BLOCKED` em expiração ou status inativo/inválido.
- `functions/src/platform/plans.ts`: trial Pro de **14 dias**, iniciado uma única vez pelo Platform Owner, sem cartão nem billing; timestamps privados e audit log; conversão explícita de trial em atribuição manual ativa; suspensão/reativação manual auditada.
- `functions/src/commercial.ts`, `order-usage.ts`, `platform/members.ts`: o estado é verificado no backend antes de novas operações e reservas de cotas. Uma assinatura expirada/inativa não recebe novos direitos; legado sem documento continua compatível até atribuição explícita.
- `functions/src/commercial-access.ts`, `components/tenant-commercial-capabilities.ts`, `admin-shell.tsx`: leitura autorizada das capacidades e estados, alerta de teste expirado, painel mostra prazo do trial sem expor `private/subscription` a clientes comuns.
- `app/platform/page.tsx`: operações explícitas de iniciar trial único, converter em plano manual, suspender/reativar acesso comercial, com justificativa.
- `tests/subscription-status.test.ts` e `functions/src/platform.integration.test.ts`: limites temporais de trial, expiração, contas legadas, conversão, auditoria, permissão global e preservação de documentos históricos.
- Segurança: dependências transitivas vulneráveis `glob` e `minimatch` das Functions atualizadas para versões corrigidas; confirmar no CI de cada HEAD.

**Observações:** não há assinatura recorrente, gateway, confirmação automática de pagamento ou trial self-service universal. A loja não perde registros quando a assinatura vence. A migração e a publicação em produção continuam dependentes de autorização e validação operacional. A execução em CI não substitui deploy real.



## Incremento validado — equipe e delivery (29/10/2026)

Código na branch de desenvolvimento (não deployado em produção):

- `functions/src/platform/members.ts`: callable `setTenantInternalMember`, exclusiva de `tenant_owner`, vincula contas Firebase Auth já existentes com roles `admin`/`staff`; valida identidade e ownership, rejeita mudanças de entregador, nunca cria ou transmite senha, audita concessões/desativações e reserva vagas com bloqueio transacional entre operações concorrentes.
- `app/admin/equipe/page.tsx` e `components/admin-shell.tsx`: painel de equipe para o tenant owner, indicação de usuários internos ativos e limite resolvido do plano, ações de vincular, desativar e reativar com justificativa.
- `functions/src/platform/admin.ts`: troca de proprietário respeita limite do plano porque o proprietário antigo passa a contar como admin; considera a vaga liberada quando o novo proprietário era staff/admin.
- `functions/src/index.ts`: novas atribuições e reatribuições de delivery exigem `DRIVER_DISPATCH` ou `DELIVERY_REASSIGNMENT` (Pro/Premium). Operações de conclusão/segurança de entregas já em andamento permanecem executáveis após downgrade.
- Testes adicionados em `functions/src/platform.integration.test.ts`: reserva concorrente da última vaga, conta ausente, usuário não autorizado, repetição idempotente, auditoria, troca segura do owner e gates de entrega por plano.

O `Platform Owner` continua global, autorizado exclusivamente por identidade segura; tenants nunca ganham role global por e-mail conhecido.
**Ainda não concluído:** política de `SubscriptionStatus`/trial e DemoMode, janelas comerciais de relatórios, gates de todas as interfaces, landing/pricing e validação operacional da migração/deploy em produção. Nenhum dado de cliente foi apagado.



## Checkpoint 29/10/2026 — módulos de quotas e informação comercial

**Fonte verificada:** commit `39e5abe893ab7a71c86dbde9276c24b0f235ee7b` (branch de desenvolvimento), CI [40956494470](https://github.com/CristianoRFB/Acaiteria/actions/runs/40956494470) com jobs de qualidade e segurança **PASS**. Não ocorreu merge em `main` nem migração/deploy de produção.

- `functions/src/order-usage.ts`: cotas mensais transacionais por tenant e mês local, com contagem inicial dos pedidos anteriores ao plano e concorrência serializada. Repetição idempotente não é debitada novamente.
- `functions/src/index.ts`: valida a cota na mesma transação que cria pedido, antes de gerar documentos de pedido/publicOrder/idempotência.
- `functions/src/create-order.integration.test.ts` + `functions/src/order-usage.test.ts`: cobrem concorrência de pedidos, contagem de legado, isolamento, downgrade, replay e virada de mês/ano.
- `functions/src/commercial-access.ts`: expõe somente um snapshot de entitlements ao próprio admin do tenant, sem dar leitura cliente ao documento privado de assinatura; autorização real continua no backend.
- `components/tenant-commercial-capabilities.ts` + `components/admin-shell.tsx`: consulta segura e aviso de plano nas áreas de Caixa e Finanças; histórico permanece visível.
- Dependências: `re2js@2.8.7`, `@hono/node-server@2.1.3`, `qs>=6.16.1` e `systeminformation@5.33.16` corrigem advisories que afetavam CI; continuam possíveis advisories **low** sem patch em ferramentas de desenvolvimento, que não devem ser ocultados.

**Ainda não completo:** gates comerciais de operações de entrega secundárias/legadas; políticas de status/trial; DemoMode Premium; janela de relatório por plano; downgrade integral; UX comercial/landing; deploy e migração reais autorizados. Dados existentes não devem ser apagados para aplicar planos.


> **Checkpoint adicional — 27/10/2026, commit `cc91609d86e49c1309a537b9f303acf6056a3a94`.**
> CI remoto **PASS** no [workflow 40553552880](https://github.com/CristianoRFB/Acaiteria/actions/runs/40553552880):
> lint, typecheck, unit tests, Functions, Rules, integração Functions, migração,
> docs:check, docs:leads, build:firebase e Wrangler dry-run; job security PASS.
> Este resultado substitui as notas de CI vermelho abaixo **apenas para este SHA**.

## Incremento de código verificado neste ciclo

- `shared/plan-catalog.ts`: matriz local dos planos aprovados (Essencial, Pro, Premium);
  preços em centavos, features, quotas e teste de não assumir plano de tenants legados.
- `shared/entitlements.ts`: resolução tipada de features/limits e overrides válidos por
  tenant; ainda não é enforcement de operações nem cobrança.
- `functions/src/platform/plans.ts`: callable `platformAssignTenantPlan`,
  exclusiva de `platform_owner`, com precondição contra alterações concorrentes,
  repetição idempotente, justificativa obrigatória e audit log transacional.
- `app/platform/page.tsx`: interface de atribuição manual de plano com leitura privada
  e justificativa; não afirma pagamento nem habilita cobrança.
- `firestore.rules`: acesso público/privado protegido, `private/platform` e
  `private/subscription` inacessíveis a tenant admins; mutações de registry
  exclusivas de Functions auditadas.
- `tests/entitlements.test.ts`, `tests/firestore.rules.test.ts` e
  `functions/src/platform.integration.test.ts`: cobertura de status sem plano,
  limites, overrides, isolamento, bloqueio de escrita e assignment idempotente.
- A classificação de entitlements permanece **PARTIAL**: catálogo, resolver e
  atribuição manual existem; backend feature/limit enforcement, usage counters,
  downgrade, trial/DemoMode e landing SaaS ainda **não estão concluídos**.
- A migração real do Tenant A, provisionamento real de Platform Owner, App Check
  e deploy de produção continuam **EXTERNAL_GATE**, não foram executados.


> Data: 2026-10-27. Este documento é rastreio do trabalho na branch isolada, não prova de homologação em produção.

## Fonte e continuidade

- Repo: `CristianoRFB/Acaiteria`
- Branch: `chat/pre-pc-acai-20261027`
- Base da branch: `886d54f6d6177256b8f11d183c75f147e288b2da`
- Último SHA observado antes deste documento: `ee24b779842b117dd7d828f46e04dffc7c0094d8`
- Nenhuma alteração foi feita na `main`.
- Continuar do **HEAD atual da branch**, não retornar à base nem reconstruir o core já implementado.

## Lotes efetivamente modificados neste ciclo

| Área | Arquivos | Evidência | Estado |
|---|---|---|---|
| Lockfile raiz | `package-lock.json` | Workflow de atualização 40541356996 confirmou `npm ci` | LOCK_SYNC_VERIFIED |
| Segurança de dependências frontend | `package.json`, `package-lock.json` | Zod >=4.6.6 e fast-uri 3.1.9; workflow 40542712194 confirmou instalação limpa e auditoria de produção | PROD_AUDIT_VERIFIED |
| Onboarding seguro | `functions/src/platform/admin.ts` | Novos tenants nascem com `orderingEnabled=false`, `whatsappEnabled=false`, somente retirada e sem delivery configurado | CODE_CHANGED / INTEGRATION_TEST_PENDING_CI |
| Regressão onboarding | `functions/src/platform.integration.test.ts` | Assertivas para estado seguro inicial | TEST_ADDED / PENDING_CI |
| Segurança de dependências Functions | `functions/package.json`, `functions/package-lock.json` | Zod >=4.6.6, body-parser 2.4.0; workflow 40543283864 confirmou `npm ci --prefix functions` e `npm audit --prefix functions --omit=dev` | BACKEND_PROD_AUDIT_VERIFIED |

Workflows temporários usados exclusivamente para gerar lockfiles foram removidos da branch após sucesso, evitando deixar automações de escrita permanentes.

## CI remoto desta branch

- Baseline main 886d54f: CI vermelho (lockfile raiz divergente; `npm ci` não iniciava).
- Após sincronização, o pipeline avançou para auditorias de segurança.
- Workflow 40543396400: chegou a `npm audit --audit-level=high` e falhou por vulnerabilidades em dependências de desenvolvimento/transitivas (24 reportadas na execução analisada; incluindo `dompurify`, `undici`, `vite`, `body-parser`, `katex` e dependências de ferramentas). Não pular ou silenciar essa verificação.
- A CI **não está verde** neste checkpoint. Os passos posteriores são SKIPPED, não PASS.
- URL: https://github.com/CristianoRFB/Acaiteria/actions?query=branch%3Achat%2Fpre-pc-acai-20261027

## Core previamente implementado (evidência documental da versão 0.1.0)

A documentação `docs/versions/0.1.0/STATUS.md` reporta core local multi-tenant, Tenant A/B fictícios, Rules/Functions, Platform Owner, carrinho tenant-aware, white-label e testes locais. Estes resultados **não substituem CI verde deste branch** nem provam implantação de dados reais.

## Código ainda executável por GitHub + CI (PRIORIDADE)

1. Remediar avisos de segurança de dependências dev sem esconder `npm audit`, sem `--force` indiscriminado ou versões incompatíveis.
2. Conseguir CI verde com o lockfile e pacotes corrigidos; registrar SHA exato dos passos.
3. Rodar suite de Rules/Functions/integração e migração no workflow de CI, adicionando `test:migration:integration` e docs checks se ainda não forem executados pelo pipeline.
4. Completar os módulos NEXT aprovados (PlanCatalog/EntitlementService/FeatureGating/Limits/SubscriptionStatus/Overrides/manual plan assignment e DemoMode), somente após CI de core estabilizada, com enforcement em backend e testes Tenant A/B.
5. Registrar cobertura de código com denominador estável somente quando existirem evidências por módulo; **nenhum percentual 95% foi atribuído**.

## Gates externos não autorizados neste escopo

- NÃO migrar dados reais do Tenant A nem mutar produção;
- NÃO criar Platform Owner real;
- NÃO ativar Firebase Blaze, faturamento, App Check nem gateways;
- NÃO publicar Cloudflare/Firebase de produção;
- Usar somente emuladores e dados sintéticos para testes.

## Estados

- `CODE_CHANGED`: arquivo modificado no GitHub;
- `TEST_ADDED`: existe teste, mas depende de execução CI apropriada;
- `LOCAL_PREVIOUSLY_VERIFIED`: evidência antiga de emulador, não resultado deste SHA;
- `EXTERNAL_GATE`: exige credenciais/consentimento/ambiente do proprietário;
- `DEFERRED`: permanece fora de escopo por decisão anterior.

Não reclassificar itens para aumentar artificialmente percentual de conclusão.
