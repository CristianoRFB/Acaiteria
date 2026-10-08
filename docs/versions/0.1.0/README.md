# Açaí SaaS — Multi-Tenant Core

Documentação da implementação tenant-aware da vertical Açaí. A versão do pacote é `0.1.0`; a versão documental não constitui uma release publicada.

- Situação: implementação e homologação local em andamento.
- Etapa: `CORE_FIRST`.
- `GLOBAL_STANDARD_TARGET = v01`; entitlements e Global Standard comercial = `NEXT`, não implementados.
- Tenant A: Açaí + Sabor (dados reais preservados; migração de produção ainda não executada).
- Tenant B: Amora Açaí — demonstração isolada, sem PII real.
- Cobrança e entitlements: fora desta etapa.

## Documentos

- [Status](STATUS.md)
- [Arquitetura](ARCHITECTURE.md)
- [Modelo de dados](DATA_MODEL.md)
- [Segurança](SECURITY.md)
- [Estrutura Firebase](FIREBASE_STRUCTURE.md)
- [Estrutura do projeto](PROJECT_STRUCTURE.md)
- [Telas e capturas](SCREENS.md)
- [Visuais conceituais](GENERATED_VISUALS.md)
- [Leads](LEADS_OVERVIEW.md)
- [Deploy](DEPLOYMENT.md)
- [Migração](MIGRATION.md)
- [Roadmap](ROADMAP.md)
- [Fontes Mermaid](diagrams/source/)

O estado publicado deve ser verificado em [`docs/CURRENT.md`](../../CURRENT.md). Nenhuma migração de produção, deploy ou alteração destrutiva é declarada como executada por estes documentos.
