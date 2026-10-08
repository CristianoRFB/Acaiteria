# Estrutura real do projeto

- `app/`: rotas App Router; `/platform` é gestão global, páginas operacionais existentes recebem path de tenant via middleware.
- `components/`: providers/contextos, componentes públicos, shell admin, entregador e UI compartilhada.
- `shared/`: tipos, domínio, validação e helpers tenant/rota usados por frontend e Functions.
- `lib/firebase/`: cliente Firebase, referências tenant-scoped e callable helpers.
- `functions/src/`: callables, triggers, serviços e testes integrados; `platform/admin.ts` implementa operações globais.
- `functions/scripts/`: seed de emulador e cópia/migração single-tenant → Tenant A.
- `firestore.rules` / `firestore.indexes.json`: fronteiras de acesso e índices.
- `tests/`: testes unitários e Rules.
- `docs/versions/0.1.0/`: arquitetura, modelo de dados, segurança, roteiros, diagramas e leads.
- `public/`: PWA, logos e imagens do produto.

Os pontos de entrada tenant-aware são `shared/tenancy.ts`, `middleware.ts`, `components/tenant-provider.tsx`, `lib/firebase/tenant.ts` e `functions/src/tenant.ts`.
