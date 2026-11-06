# Continuidade técnica — SaaS Açaiteria (77 — SaaS)

Atualizado em 2026-11-06. Este documento registra evidências verificadas nos repositórios e pipelines; não substitui o código e não autoriza publicações.

## Referências de desenvolvimento
- Repositório: `CristianoRFB/Acaiteria`.
- `main` verificada em `886d54f6d6177256b8f11d183c75f147e288b2da` no início da retomada.
- Core multi-tenant em `chat/pre-pc-acai-20261027`, commit `302aee421718d6658d90f6962073bd98f0d4dd72`. CI completo aprovado em 2026-10-31, execução [41223094045](https://github.com/CristianoRFB/Acaiteria/actions/runs/41223094045); `docs/versions/0.1.0/STATUS.md` detalha os testes locais e limites de homologação.
- Demonstração comercial isolada em `demo/77-comercial-acaiteria-20261106`, commit `857fce38a76fc5605827d9c8a1e68bc390b1cee6`. Código em `commercial-demo/worker.js` e limites em `commercial-demo/README.md`. O Worker `77-acaiteria-comercial-demo` consta no Cloudflare, mas a URL pública não foi revalidada por navegador nesta retomada.
- A demonstração usa `localStorage` para pedidos fictícios; não é a persistência operacional do SaaS e não deve ser promovida como tal.

## Incidente atual de CI e correção isolada
- CI da demo falhou em `npm ci` na execução [42279428679](https://github.com/CristianoRFB/Acaiteria/actions/runs/42279428679), antes de lint/testes/build. Causa observada nos logs: transitive dependencies ausentes em `package-lock.json` (incluindo `proxy-agent` e dependências Puppeteer).
- Branch `fix/acaiteria-lockfile-ci-20261106` partiu da `main` para corrigir exclusivamente a instalação reproduzível. Um job temporário executou `npm install --package-lock-only --ignore-scripts` e `npm ci --dry-run --ignore-scripts` com sucesso em [42280923417](https://github.com/CristianoRFB/Acaiteria/actions/runs/42280923417). O workflow temporário foi removido.
- PR de revisão: [#1 — corrigir lockfile](https://github.com/CristianoRFB/Acaiteria/pull/1). A revisão e a execução de CI completo deste PR são necessárias antes do merge.

## Bloqueios e ordem recomendada
1. Confirmar aprovação do CI completo da correção de lockfile; corrigir outros problemas que aparecerem.
2. Integrar as correções sem sobrescrever a branch multi-tenant ou misturar o Worker comercial com a aplicação operacional.
3. Homologar os fluxos cliente → pedido persistido → painel → entrega → acompanhamento em ambiente Firebase de testes autorizado.
4. Verificar autenticação e permissões por tenant com testes negativos A × B; revisar isolamento de pedidos e dados pessoais.
5. Apenas com backup e autorização operacional, completar o provisionamento do Platform Owner, migração de Tenant A e deploy coordenado de Rules/Functions/Worker.
6. O gate documentado continua `NOT_READY_FOR_PRODUCTION_MIGRATION_OR_DEPLOY`, até evidência de staging, App Check, backend publicado e smoke tests reais.

Não foram alterados dados do Firebase, segredos, configurações de produção ou permissões nesta retomada.
