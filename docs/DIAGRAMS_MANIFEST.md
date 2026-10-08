# Manifesto de diagramas

Versão vigente: [`0.1.0`](versions/0.1.0/README.md).

| Diagrama | Objetivo | Estado | Source editável | Render SVG | Versão | Observação |
|---|---|---|---|---|---|---|
| system-context | Limites entre clientes, lojas, plataforma e Firebase | fonte e render versionados | [system-context.mmd](versions/0.1.0/diagrams/source/system-context.mmd) | [system-context.svg](versions/0.1.0/diagrams/rendered/system-context.svg) | 0.1.0 | Contexto externo do core |
| multitenant-architecture | Roteamento e fronteira por tenant | fonte e render versionados | [multitenant-architecture.mmd](versions/0.1.0/diagrams/source/multitenant-architecture.mmd) | [multitenant-architecture.svg](versions/0.1.0/diagrams/rendered/multitenant-architecture.svg) | 0.1.0 | Path/slug sem domínio customizado |
| firebase-data-model | Documentos globais e subcoleções | fonte e render versionados | [firebase-data-model.mmd](versions/0.1.0/diagrams/source/firebase-data-model.mmd) | [firebase-data-model.svg](versions/0.1.0/diagrams/rendered/firebase-data-model.svg) | 0.1.0 | Limites público, privado e membership |
| auth-rbac | Identidade, membership e autorização | fonte e render versionados | [auth-rbac.mmd](versions/0.1.0/diagrams/source/auth-rbac.mmd) | [auth-rbac.svg](versions/0.1.0/diagrams/rendered/auth-rbac.svg) | 0.1.0 | Platform role separado da role do tenant |
| ordering-delivery-core-flow | Pedido, status e entrega | fonte e render versionados | [ordering-delivery-core-flow.mmd](versions/0.1.0/diagrams/source/ordering-delivery-core-flow.mmd) | [ordering-delivery-core-flow.svg](versions/0.1.0/diagrams/rendered/ordering-delivery-core-flow.svg) | 0.1.0 | Functions e paths tenant-scoped |
| cash-finance-flow | Conciliação de caixa e finanças | fonte e render versionados | [cash-finance-flow.mmd](versions/0.1.0/diagrams/source/cash-finance-flow.mmd) | [cash-finance-flow.svg](versions/0.1.0/diagrams/rendered/cash-finance-flow.svg) | 0.1.0 | Fluxo operacional no boundary do tenant |
| deployment-cloudflare-firebase | Deploy compartilhado e serviços | fonte e render versionados | [deployment-cloudflare-firebase.mmd](versions/0.1.0/diagrams/source/deployment-cloudflare-firebase.mmd) | [deployment-cloudflare-firebase.svg](versions/0.1.0/diagrams/rendered/deployment-cloudflare-firebase.svg) | 0.1.0 | Sem rename destrutivo do Worker histórico |

Os SVGs são derivados das fontes Mermaid por `npm run docs:diagrams`; rode o comando após alterar qualquer `.mmd`.
