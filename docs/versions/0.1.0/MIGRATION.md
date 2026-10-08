# Migração para Tenant A

O tooling é `functions/scripts/migrate-single-tenant-to-tenant-a.mjs`.

`npm run test:migration:integration` usa um Firestore Emulator temporário e dados artificiais para validar dry-run sem gravação, primeira cópia, contagens, memberships/subdocumentos privados, origem preservada, retry após cópia parcial, idempotência, referência quebrada e conflito sem sobrescrita. O teste nunca acessa um projeto Firebase real.

## Safe workflow

1. Use uma cópia/restauração de staging com credencial de mínimo privilégio.
2. Execute `npm run migrate:tenant-a:dry-run` e guarde o relatório: contagem antes/depois, conflitos, referências e coleções.
3. Corrija referências quebradas/conflitos antes de aplicar.
4. Confirme backup restaurável, janela, responsáveis, projeto ID e volume.
5. Em staging, execute `npm run migrate:tenant-a:apply`; o tooling copia e mantém as fontes, sem deletes.
6. Verifique catálogo, pedidos públicos/privados, financeiro, caixa, deliveries, histórico e memberships.
7. Só depois de autorização expressa e aprovação do owner execute o fluxo aprovado no projeto de produção.

O marcador torna reexecuções verificáveis, mas destino conflitante não deve ser sobrescrito automaticamente. Não há rollback destrutivo: rollback operacional é retornar aplicação ao release anterior e manter o destino copiado isolado até investigação. Não executar migração de produção automaticamente como parte de deploy.

O seed de Tenant B é fictício e só deve ser usado em emulador/teste. Nenhum dado pessoal ou financeiro do Tenant A pode ser copiado para B.
