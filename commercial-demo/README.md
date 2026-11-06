# Demonstração comercial da Açaiteria · Polpa Studio

Ambiente público isolado: https://77-acaiteria-comercial-demo.on7.workers.dev/

## Escopo
- Cliente: vitrine/categorias, montagem de açaí (tamanhos e adicionais com cálculo), carrinho, checkout sem pagamento real, acompanhamento.
- Loja: fila de pedidos, progressão de status, disponibilidade de produtos e adicionais, indicadores demonstrativos derivados dos pedidos locais.
- Entregadores: fila de entregas prontas, atribuição a motoboys fictícios, início de rota e conclusão; status refletido no acompanhamento.
- Prospecção: notas comerciais por contexto, controle “Benefícios”, tour “Conheça o sistema”, comparação ❌/✅ e personalização de módulos/identidade.

## Limites e segurança
- Marca e valores fictícios. Não reutiliza fotos, logomarca nem credenciais de estabelecimento.
- Pedidos e estados ficam exclusivamente no localStorage do navegador (sem API, Firestore ou vínculo ao produto em produção).
- O painel está aberto apenas porque esta é uma sandbox sem informações reais; não equivale à autenticação do produto contratado.
- Sem pagamento, entrega, GPS, WhatsApp automático, comissão ou integração operacional.
- O Worker é independente do deploy de produção da aplicação original.

## Código e publicação
- Arquivo de distribuição: `commercial-demo/worker.js`. Worker: `77-acaiteria-comercial-demo`.
- Branch: `demo/77-comercial-acaiteria-20261106`.
- Publicação via Cloudflare Worker com entrada ES module e subdomínio workers.dev próprio.
- Para integrar futuramente ao sistema principal React/Firebase, reaproveitar os fluxos, conteúdo e regras de UX e implementar backend, autorização e tenancy apropriados; não apontar esta demo ao Firebase real.

## Verificações de novembro/2026
Um navegador remoto abriu a URL pública e testou: seleção de tamanho e adicional com soma de valor; criação e acompanhamento de pedido fictício; mudança de status pela gestão; atribuição a motoboy; rota e conclusão; tabela comercial; tour e controle de notas. Em viewport de 390 px, o documento não apresentou rolagem horizontal e o filtro de categoria “Açaí” exibiu o produto correspondente.