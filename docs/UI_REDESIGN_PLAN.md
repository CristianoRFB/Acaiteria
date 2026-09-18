# Plano de redesign — Açaí + Sabor

Este documento registra a auditoria e as decisões da evolução visual do produto. O escopo é melhorar percepção, hierarquia, responsividade e velocidade de operação sem alterar o domínio, os cálculos de preço ou o formato dos documentos do Firestore.

## Auditoria inicial

- A home já carregava catálogo e promoções reais, mas o hero ainda destacava uma imagem de desenvolvimento e os produtos tinham pouco protagonismo visual.
- O painel administrativo tinha navegação funcional, porém o dashboard era uma grade de atalhos; faltava uma leitura operacional do dia.
- A fila de pedidos funcionava como lista única. No desktop, o operador precisava filtrar mentalmente os estágios; no celular, os filtros existiam, mas a prioridade do próximo passo não ficava evidente.
- O catálogo já tinha `imageUrl` e edição de tamanhos, mas os cards administrativos não exibiam a foto do produto.
- As cores da marca estavam repetidas como valores arbitrários nas páginas. Foram adicionados tokens semânticos para os novos componentes; telas legadas serão migradas sem uma reescrita arriscada.

## Decisões de design

- Marca gastronômica: vinho profundo, rosa quente, fundo creme, amarelo de destaque e lima para ação positiva.
- Cliente: comida e preço são o primeiro nível; descrição, horário e acompanhamento são apoio.
- Admin: informação acionável (novos, em preparo, prontos, vendas) vem antes de atalhos.
- Desktop usa agrupamento por estágio; mobile usa uma navegação horizontal com rótulos e filtros confortáveis.
- Imagens do catálogo são reaproveitadas localmente e servidas em WebP quando disponíveis; nenhum serviço externo é necessário para a operação.
- Estados de vazio, erro, loading e indisponibilidade permanecem explícitos e não usam números inventados.

## Fases e status

| Fase | Entrega | Status |
| --- | --- | --- |
| 1 | Tokens semânticos, superfícies, estados e base responsiva | Concluída |
| 2 | Home gastronômica, hero real, promoções e cardápio visual | Concluída |
| 3 | Configurador, carrinho e checkout responsivos | Concluída |
| 4 | Shell do admin e dashboard operacional com dados reais | Concluída |
| 5 | Fila de pedidos por estágio, busca e leitura mobile | Concluída |
| 6 | Catálogo visual com fotos e edição amigável | Concluída |
| 7 | Finanças, caixa, configurações, integração e estados de suporte | Concluída |

## Checklist de validação

- [x] Home sem placeholder de desenvolvimento como protagonista.
- [x] Produto, categoria, preço e CTA legíveis no mobile.
- [x] Dashboard usa somente dados reais disponíveis.
- [x] Fila separa operação ativa e histórico.
- [x] Catálogo exibe imagem, categoria, status e tamanhos.
- [x] Navegação administrativa comunica a seção ativa.
- [x] Sem alteração intencional em regras de preço, status, carrinho, caixa ou Firestore.
- [x] Revisão manual final das rotas de finanças e caixa em 360px (estrutura responsiva existente revisada; sem overflow horizontal global).
- [x] `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` após a última alteração.

## Riscos de regressão

- Consultas do Firestore dependem de índices existentes; qualquer mudança deve preservar as consultas atuais.
- A fila em tempo real deve continuar aceitando pedidos sem status de histórico.
- O catálogo pode conter registros antigos sem imagem; nesse caso o resolver local fornece uma imagem de fallback sem impedir a edição.
- O hero não pode depender de URL externa ou de upload para funcionar.
