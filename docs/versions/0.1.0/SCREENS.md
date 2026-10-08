# Telas e capturas

Esta versão não registra screenshots como prova até que cada imagem seja realmente capturada do sistema em execução. Não usar mockups ou imagens conceituais como screenshot.

| Tela | Rota | Tenant/contexto | Viewport | Arquivo | Prova real? | Estado/observação |
|---|---|---|---|---|---|---|
| Platform Owner | `/platform` | conta platform_owner | desktop/mobile | — | Não | captura real pendente; requer conta autorizada |
| Cardápio Tenant A | `/acai-mais-sabor` | seed local de desenvolvimento | 1440×1000 | `screenshots/storefront-tenant-a-desktop-viewport.png` | Sim | captura real do app local; sem Firebase de produção |
| Cardápio Tenant A | `/acai-mais-sabor` | seed local de desenvolvimento | 390×844 (DPR 2) | `screenshots/storefront-tenant-a-mobile-viewport.png` | Sim | captura real do app local responsivo |
| Cardápio Tenant B | `/amora-acai-demo` | seed local fictício | 1440×1000 | `screenshots/storefront-tenant-b-desktop-viewport.png` | Sim | demonstração independente; não contém PII real |
| Montar produto | `/{slug}/montar/{productId}` | A e B | mobile | — | Não | captura real pendente; requer app e catálogo de demo |
| Carrinho e checkout | `/{slug}/carrinho`, `/{slug}/checkout` | A e B | mobile | — | Não | captura real pendente; requer fluxo público executável |
| Admin e pedidos | `/{slug}/admin`, `/{slug}/admin/pedidos` | admin tenant | desktop | — | Não | captura real pendente; requer credencial de tenant |
| Catálogo/configurações | `/{slug}/admin/catalogo`, `/{slug}/admin/configuracoes` | owner tenant | desktop/mobile | — | Não | captura real pendente; requer credencial de owner |
| Entregas, caixa, finanças | `/{slug}/admin/entregas`, `/{slug}/admin/caixa`, `/{slug}/admin/financas` | staff/owner tenant | desktop/mobile | — | Não | captura real pendente; requer emulador e dados de teste |
| Portal do entregador | `/{slug}/entregador` | driver tenant | mobile | — | Não | captura real pendente; requer identidade de entregador no demo |

As três capturas registradas foram feitas da aplicação real em `localhost:3001`, com seed de desenvolvimento, sem escrever dados nem criar pedidos. As telas administrativas, de entregador e Platform Owner continuam pendentes porque exigem identidade demo autorizada. A imagem em `generated/` é conceitual e não substitui capturas. O checklist está em [STATUS.md](STATUS.md).
