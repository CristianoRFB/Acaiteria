# Deploy e operação

O Worker Cloudflare atual continua podendo usar a identidade histórica; esta mudança prepara um único aplicativo servido por paths tenant-scoped e não requer rename destrutivo.

## Pré-requisitos antes de publicar

1. Confirmar projeto Firebase, backups, região e responsáveis.
2. Configurar variáveis públicas/privadas, App Check, Auth domains, CORS e secrets no ambiente real.
3. Provisionar o primeiro `platform_owner` por processo administrativo controlado; não colocar credencial em código ou seed. O script `npm run bootstrap:platform-owner -- --project=<id> --email=<email>` exige o sinalizador de confirmação específico do ambiente, usa credenciais administrativas já configuradas, exige conta Auth ativa e e-mail verificado, recusa se já houver owner e grava audit log. No emulador, Auth e Firestore devem estar ativos e o project ID deve começar com `demo-`; fora dele, o comando requer `--confirm-production-platform-owner-bootstrap`. Revise o script e o projeto antes de usar.
4. Revisar Rules, índices, Functions, alertas, limites, domínios e headers do Worker.
5. Executar a migração Tenant A conforme [MIGRATION.md](MIGRATION.md), primeiro em projeto de staging restaurado.
6. Deploy de Functions, Rules e índices; validar smoke tests A/B; depois publicar Worker.

Não houve deploy nesta execução. `npm run check:production`, `npm run build` e dry-run de deploy são gates separados e dependem de configuração local. App Check ausente em produção deve bloquear a publicação.

O bootstrap não foi executado contra produção nesta implementação. Ação operacional pendente: confirmar o projeto Firebase, a conta owner verificada, as credenciais/ADC e autorização do responsável antes de provisionar a primeira identidade global.
