# Modelo de dados

```text
users/{uid}                         identidade global, active, platformRole opcional
tenantSlugs/{slug}                 índice slug → tenantId
tenants/{tenantId}                 perfil público, estado, branding, locale, timezone, currency
tenants/{tenantId}/members/{uid}    role/status/userId/tenantId
tenants/{tenantId}/settings/public  configuração operacional pública da loja
tenants/{tenantId}/private/...      configurações privadas e ownerUserId de plataforma
tenants/{tenantId}/products|...     catálogo e domínio operacional
tenants/{tenantId}/orders|...       pedidos, tracking e solicitações
tenants/{tenantId}/deliveries|...   motoboys, entregas, eventos e secrets
tenants/{tenantId}/cash...|financeEntries
tenants/{tenantId}/auditLogs        auditoria operacional do tenant
platformAuditLogs/{id}              auditoria de ações globais
```

`platformAuditLogs` é distinto de `deliveryEvents`, histórico de status e movimentações de caixa. `deliverySecrets` não pode ser lido pelo cliente, inclusive pelo entregador.

Tenant document público não armazena `ownerUserId`; esse vínculo fica em `tenants/{tenantId}/private/platform` e o acesso operacional é representado pelo membership. O schema de tenant reserva metadados comerciais opcionais, mas nenhum deles é aplicado como regra de acesso.

Os índices compostos estão em `firestore.indexes.json`, usando collection groups para consultas realizadas sobre caminhos tenant-scoped.
