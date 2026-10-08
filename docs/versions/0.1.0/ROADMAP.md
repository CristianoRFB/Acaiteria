# Próximas etapas

## NEXT — antes de declarar o Core concluído

- Rodar testes integrados completos com os testes do Platform Owner, Rules, typecheck, lint e build final.
- Fazer QA funcional e visual com emulador/demo para Tenant A e B, incluindo URLs, branding, carrinho, pedido, entrega, caixa e financeiro.
- Validar migração dry-run contra cópia real restaurada; registrar contagens e recovery.
- Finalizar renders SVG dos diagramas, screenshots reais e manifests; `npm run docs:check` precisa passar.
- Revisão de segurança independente de escopos Admin SDK, memberships e provisionamento de platform owner.

## DEFERRED — fora deste goal

- Global Standard v01: billing, plans, trial, entitlements, gating, enforcement de limits e downgrade.
- Multi-unidade, subdomínios, custom domains, marketplace e biblioteca compartilhada.
- Integração Saipos real, fiscal, PDV/KDS, estoque e novos módulos comerciais.
