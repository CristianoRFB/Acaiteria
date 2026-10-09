# Telas e capturas

Esta versão não registra screenshots como prova até que cada imagem seja realmente capturada do sistema em execução. Não usar mockups ou imagens conceituais como screenshot.

| Tela | Rota | Tenant/contexto | Viewport | Arquivo | Prova real? | Estado/observação |
|---|---|---|---|---|---|---|
| Platform Owner | `/platform` | conta platform_owner | desktop/mobile | — | Não | captura real pendente; requer conta autorizada |
| Cardápio Tenant A | `/acai-mais-sabor` | seed local de desenvolvimento | 1440×1000 | `screenshots/storefront-tenant-a-desktop-viewport.png` | Sim | captura real do app local; sem Firebase de produção |
| Cardápio Tenant A | `/acai-mais-sabor` | seed local de desenvolvimento | 390×844 (DPR 2) | `screenshots/storefront-tenant-a-mobile-viewport.png` | Sim | captura real do app local responsivo |
| Cardápio Tenant B | `/amora-acai-demo` | seed local fictício | 1440×1000 | `screenshots/storefront-tenant-b-desktop-viewport.png` | Sim | demonstração independente; não contém PII real |
| Montar produto | `/acai-mais-sabor/montar/acai-monte-seu` | Tenant A seed local | 1440×1100 | `screenshots/product-builder-tenant-a-desktop-viewport.png` | Sim | opções em estado inicial; nenhum item foi adicionado |
| Carrinho vazio | `/acai-mais-sabor/carrinho` | Tenant A seed local | 390×844 (DPR 2) | `screenshots/cart-empty-tenant-a-mobile-viewport.png` | Sim | estado vazio real; nenhum dado gravado |
| Checkout vazio | `/acai-mais-sabor/checkout` | Tenant A seed local | 390×844 (DPR 2) | `screenshots/checkout-empty-tenant-a-mobile-viewport.png` | Sim | guarda real impede avançar sem produto; nenhum pedido criado |
| Acompanhamento de pedido | `/{slug}` (consulta) / `/{slug}/pedido/{publicCode}` | Tenant A; requer código válido para tracking | mobile | — | Não | não foi criado pedido de teste; formulário de consulta existe no storefront |
| Admin e pedidos | `/{slug}/admin`, `/{slug}/admin/pedidos` | admin tenant | desktop | — | Não | captura real pendente; requer credencial de tenant |
| Catálogo/configurações | `/{slug}/admin/catalogo`, `/{slug}/admin/configuracoes` | owner tenant | desktop/mobile | — | Não | captura real pendente; requer credencial de owner |
| Entregas, caixa, finanças | `/{slug}/admin/entregas`, `/{slug}/admin/caixa`, `/{slug}/admin/financas` | staff/owner tenant | desktop/mobile | — | Não | captura real pendente; requer emulador e dados de teste |
| Portal do entregador | `/{slug}/entregador` | driver tenant | mobile | — | Não | captura real pendente; requer identidade de entregador no demo |

As telas administrativas, de entregador e Platform Owner continuam pendentes porque exigem identidade demo autorizada. O acompanhamento com código válido não foi capturado porque isso exigiria criar um pedido de teste. A imagem em `generated/` é conceitual e não substitui capturas. O checklist está em [STATUS.md](STATUS.md).

As seis capturas públicas foram feitas em 2026-10-09 a partir de uma cópia temporária isolada do repositório, em `localhost:3002`, sem `.env.local`, com seed de desenvolvimento. O script `npm run docs:screenshots -- --base-url=http://localhost:3002 --replace-existing` confirmou HTTP 200, marca/cores de A/B, o estado esperado das rotas públicas e nenhuma exceção `pageerror`. Carrinho e checkout mostram intencionalmente o estado vazio; nenhum item foi adicionado, formulário enviado, pedido criado ou migração executada. O servidor de desenvolvimento exibiu o aviso React sobre `eval()` não suportado nesse ambiente; isso é específico ao modo dev e não equivale a validação do build. A porta 3001, ocupada por outro aplicativo, não foi usada. Nenhuma tela protegida foi recapturada nem representada como concluída.
