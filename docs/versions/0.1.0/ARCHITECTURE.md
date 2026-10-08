# Arquitetura

## Request e dados

O caminho público é `/{tenantSlug}/...`. O middleware reescreve o prefixo para as páginas existentes do App Router sem removê-lo da URL do navegador. Rotas operacionais antigas sem slug redirecionam para Tenant A de forma explícita. `/platform` fica fora do contexto de loja. Slug desconhecido, loja suspensa e estado indisponível têm telas próprias; não há escolha silenciosa de tenant.

O cliente resolve `tenantSlugs/{slug}` e o documento público `tenants/{tenantId}`. Operações usam subcoleções em `tenants/{tenantId}/...`. Callable Functions recebem `tenantSlug`, resolvem a identidade no servidor e executam dentro de um escopo assíncrono tenant-scoped. O slug enviado identifica a solicitação, mas não concede acesso.

## Papéis

- `platform_owner`: identidade global e área `/platform`.
- `tenant_owner`: owner com administração do próprio tenant.
- `admin`: administrador local legado/operacional.
- `staff`: operações permitidas no tenant.
- `driver`: somente sua operação de entregas.

## Platform

O onboarding é feito por callable Admin SDK: valida `platformRole`, slug e conta Authentication existente; cria tenant, slug index, settings operacionais, membership owner e audit log em transação. A interface não cria usuários Authentication. Ações críticas usam `platformAuditLogs`. Suporte abre contexto somente leitura, sem impersonação ou elevação de membership.

## Fluxos preservados

Cardápio, pedido, catálogo, entrega, caixa, financeiro e integração continuam nos módulos existentes; o ajuste é direcionar paths e autorização ao tenant. Não há billing, trial funcional, plano ou entitlement nesta etapa.

Ver também [diagrama de tenancy](diagrams/source/multitenant-architecture.mmd), [Firebase](FIREBASE_STRUCTURE.md) e [modelo de dados](DATA_MODEL.md).
