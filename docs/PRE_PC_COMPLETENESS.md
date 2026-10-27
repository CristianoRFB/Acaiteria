# Pre-PC implementation checkpoint — Açaí SaaS

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
