# Estado

## Implementação nesta árvore

- Resolver de tenant por path, redirecionamentos históricos explícitos e boundary de estado do tenant.
- Coleções de operação sob `tenants/{tenantId}`; identidade global em `users`, mapa de slug em `tenantSlugs` e memberships por tenant.
- Rules deny-by-default e Functions callable tenant-aware com checagem de tenant ativo, identidade e membership/role.
- Interface global `/platform`, onboarding por owner já existente no Firebase Authentication, gestão básica, suspensão/reativação, suporte read-only e audit log global.
- Tenant A/B em seed de emulador e prova de isolamento em testes.
- LocalStorage do carrinho, histórico de pedidos e tutoriais namespaced por tenant.
- Branding básico em nome, logo, cores, título, descrição, idioma, favicon opcional e timezone operacional.
- Migração Tenant A em modo dry-run/cópia; não apaga fontes.

## Ainda não comprovado ou não feito

- Migração de dados reais do Firebase de produção: não executada; exige credenciais, backup, validação e autorização explícita.
- Deploy Firebase/Cloudflare: não executado.
- Conta real `platform_owner`: precisa ser provisionada com segurança no ambiente alvo; não há credencial embutida no código.
- Catálogo da Amora Açaí em produção: o seed isolado é para desenvolvimento/emulador; onboarding inicia com configurações base e catálogo deve ser cadastrado pelo owner.
- Capturas visuais reais: pendentes de execução e autenticação de telas protegidas.
- Full CI/build e QA visual final: executar após fechar as mudanças desta versão.

## Gate de release

Classificação atual: `NOT_READY_FOR_PRODUCTION_MIGRATION_OR_DEPLOY`. Não marcar como `READY_FOR_GLOBAL_STANDARD_IMPLEMENTATION` antes de todos os gates do goal serem evidenciados.
