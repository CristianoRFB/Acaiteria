# Sessão final de testes no PC — Açaí SaaS

> Guia de homologação, **não autorização de deploy**, migração ou alterações em dados reais.
> Branch de desenvolvimento: `chat/pre-pc-acai-20261027`.
> Exige projeto Firebase **demo-** para testes locais. Não usar credenciais reais.

## Pré-requisitos

- Node.js 22 e npm 11 (mesma combinação do CI corrigido).
- Java 21 para Firestore Emulator.
- Conta/autenticação Firebase CLI **somente quando for homologar um ambiente externo autorizado**; testes locais usam `demo-acai-mais-sabor`.
- Criar `.env.local` baseado em `.env.example`, com `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`, `NEXT_PUBLIC_USE_DEVELOPMENT_SEED=false` e configuração do projeto **demo**. Não versionar.
- Provisionar `SEED_ADMIN_EMAIL/PASSWORD`, `SEED_PLATFORM_OWNER_EMAIL/PASSWORD` e `SEED_DEMO_DRIVER_PASSWORD` **somente** para contas sintéticas do emulador; não registrar valores em arquivos versionados ou screenshots.

## 1. Checkout seguro e suite automatizada

Na raiz do repositório:

```bash
npm ci
npm ci --prefix functions
npm run lint
npm run typecheck
npm test
npm run test:functions
npm run test:rules
npm run test:functions:integration
npm run test:migration:integration
npm run docs:check
npm run docs:leads
npm run build:firebase
npm exec wrangler -- deploy --dry-run --config dist/server/wrangler.json
```

Esperado: todos os checks passam. Um resultado local não substitui o CI do SHA correspondente no GitHub.

## 2. Seed + emuladores isolados

1. Em terminal de testes, fornecer as variáveis `SEED_ADMIN_*`, `SEED_PLATFORM_OWNER_*` e `SEED_DEMO_DRIVER_PASSWORD` por mecanismo local seguro.
2. Rodar `npm run seed:emulator` para preparar e exportar a fixture em `.firebase-data` no projeto `demo-acai-mais-sabor`.
3. Rodar `npm run emulators` (Auth, Firestore, Functions; importa a fixture).
4. Em outro terminal, rodar `npm run dev` com `.env.local` apontando **somente** aos emuladores.
5. Se a seed/importação falhar, parar, verificar logs e corrigir antes de continuar. Não apontar o seed para `food-5fb44`.

Rotas de prova:
- `/acai-mais-sabor` (Tenant A)
- `/amora-acai-demo` (Tenant B)
- `/acai-mais-sabor/admin/login`
- `/amora-acai-demo/entregador/login`
- `/platform`

## 3. Matriz de contas fictícias

| Perfil | Escopo | Procedimento de criação |
|---|---|---|
| Cliente sem login | Pedido de teste | Checkout com informações totalmente inventadas |
| Tenant A owner | Somente A | `SEED_ADMIN_*` + `npm run seed:emulator` |
| Tenant B owner | Somente B | Seed cria identidade sintética; definir credencial de acesso de forma autorizada no Auth Emulator se necessário |
| Tenant B driver | Somente B | `SEED_DEMO_DRIVER_PASSWORD` + seed |
| Platform Owner | Global auditável | `SEED_PLATFORM_OWNER_*` + seed |

Nunca criar conta real de Platform Owner para este teste.

## 4. Testes de navegador e UI

Viewports: 320, 360, 375, 390, 430, 768 e 1440 px.

- A: cardápio → montar copo com extras → carrinho → checkout → pedido → tracking.
- A: admin prepara → atribui entrega → entregador aceita → inicia → chega → testa código inválido → conclui com código válido.
- Verificar Caixa fechado bloqueando conclusão quando regra exigir; abrir Caixa; concluir uma única vez; checar receita Pix consistente em Caixa e Finanças.
- B: comparar identidade, catálogo, promoções, checkout, pedidos e entregador; nenhuma informação A pode aparecer.
- Alternar A → rota sem tenant → B; checar carrinho/histórico/cache sem vazamento.
- Confrontar acesso de owner A a pedidos/finanças/entregas B, no frontend, Callable e acesso Firestore direto.
- Suspender Tenant B via Platform Owner e confirmar bloqueio de checkout/operação, sem excluir dados.
- Validar teclado, foco, avisos de erro, modal, loading, empty, retry, mobile sem overflow horizontal.
- Repetir requisição de conclusão e conferir que Caixa/Finanças não duplicam lançamento.

**STOP:** vazamento A×B, autorização indevida, código de entrega exposto, dupla cobrança/lançamento, perda de dados, escrita fora do projeto demo, qualquer configuração de produção ativa.

## 5. Evidências

- Capturar screenshots reais só do sistema em execução e com dados sintéticos; nunca mockups como prova.
- Registrar estado de auth, versão/SHA, viewport, rota e resultado.
- Atualizar `docs/versions/0.1.0/SCREENS.md` (ou versão documental vigente), `STATUS.md` e manifestos.
- Gerar material conceitual apenas em `generated/`, nunca em `screenshots/`.

## 6. Ambientes externos e produção — exige novo aceite

Antes de tocar staging/produção, obter autorização específica para:
- projeto correto, permissões e política de custos;
- backup restaurável e teste de restore;
- App Check real, domínio, Auth allowed domains, CORS e secrets;
- bootstrap seguro de Platform Owner verificado;
- migração Tenant A em staging validada por dry-run, contagem, referência e rollback;
- deploy coordenado Rules/índices/Functions e somente depois Cloudflare;
- smoke test hospedado de Tenant A/B e rollback.

Sem esse aceite, **não rodar** `migrate:tenant-a:apply`, `bootstrap:platform-owner`, `deploy:firebase:backend` nem `deploy:cloudflare` contra ambiente real.

## Resultado final

Registrar no relatório: SHA verificado, jobs CI, cenários aprovados/reprovados, URLs do ambiente, capturas reais, bloqueios EXTERNAL e decisão explícita de prosseguir ou parar. Não declarar produção pronta apenas com emuladores.
