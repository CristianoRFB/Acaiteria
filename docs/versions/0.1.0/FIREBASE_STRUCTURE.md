# Estrutura Firebase

## Auth e identidade

Firebase Authentication autentica pessoas. `users/{uid}` guarda somente identidade/perfil global e `platformRole` opcional. Memberships ficam em `tenants/{tenantId}/members/{uid}` e permitem associação futura da mesma identidade a mais de uma loja.

## Firestore

- Registry público: `tenantSlugs/{slug}` e campos públicos do documento `tenants/{tenantId}`.
- Membership e dados internos: subcoleções abaixo de `tenants/{tenantId}`.
- Config pública: `settings/public`; dados privados migrados ficam em `private/storePrivateConfig/documents/{id}`; integração e chaves não são expostas no catálogo.
- Pedidos públicos são consultáveis pelo código, não enumeráveis.
- Caixa/financeiro e entregas pertencem à subcoleção do tenant.
- `deliverySecrets` é fechado para clientes.
- Logs globais: `platformAuditLogs`; auditoria operacional permanece em `auditLogs` de tenant.

## Rules, Functions e gatilhos

`firestore.rules` aplica estado ativo, identidade e membership/role. Writes financeiros, status de pedido e delivery privilegiados passam por callable Functions. Triggers/schedulers recebem o tenant a partir do caminho do evento ou resolvem o slug/contexto; não devem consultar coleções globais de operação.

## Índices e App Check

`firestore.indexes.json` declara índices compostos por collection group. Verifique queries novas no Emulator e publique os índices antes de release. App Check client-side e enforcement nas Functions são configurados por ambiente; Rules e autenticação continuam sendo controles independentes.

## Emuladores

`npm run test:rules` sobe Firestore isolado. `npm run test:functions:integration` sobe Auth, Firestore e Functions com projeto `demo-`, dados temporários e endpoints locais. `npm run seed:emulator` provisiona Tenant A/B demo; nunca representa dados reais.

## Migração single-tenant

`functions/scripts/migrate-single-tenant-to-tenant-a.mjs` lista coleções legadas, cópia planejada, referências quebradas e conflitos. Dry-run não escreve. Apply é copy-only, mantém origem e requer confirmação fora de emulador. Consulte [MIGRATION.md](MIGRATION.md); não execute em produção sem autorização e backup aprovados.
