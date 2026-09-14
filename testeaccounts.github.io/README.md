# Açaí + Sabor — demonstração de operação de açaí e sorvetes

Demo comercial frontend de um sistema sob medida para ateliês, confecções e operações B2B de açaí e sorvetes. Os dados são fictícios e os fluxos mostram como pedidos, personalizações, arte, produtos, aprovação, produção e prazos podem conviver em uma única fonte de verdade.

## Demonstração e produção

Esta versão é estática, sem autenticação, backend ou banco remoto. O estado é persistido em `localStorage` com chave e schema versionados; um payload inválido volta ao seed. A ação **Restaurar demonstração** recria os dados com datas relativas ao dia atual. Em produção seriam necessários backend, permissões, armazenamento, auditoria, backup, LGPD e integrações escolhidas para cada empresa.

## Stack e execução

- React 19, TypeScript, Vinext/Vite, CSS responsivo e Lucide
- Vitest para regras de domínio e consistência do seed

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

## Conceitos do fluxo

- **Arte original:** referência recebida do cliente.
- **Prova/mockup:** representação enviada para conferência antes de bordar.
- **Digitalização:** conversão técnica da arte em pontos e comandos de máquina.
- **Produto:** arquivo digitalizado reutilizável, condicionado a tamanho, tecido e estabilizador.
- **Versão aprovada:** versão explicitamente aceita; pode ser diferente da versão atual se uma V3 for criada depois da aprovação da V2.

## Rotas e arquitetura

A navegação usa fragmentos (`#/pedidos`, `#/producao`, `#/agenda`, `#/clientes`, `#/orcamentos`, `#/produtos`, `#/estoque`) para funcionar sem rewrite no GitHub Pages. `app/seed.ts` concentra o dataset profissional, `app/domain.ts` os tipos/selectors/invariantes e `app/store.tsx` o estado central, persistência e ações. Dashboard, detalhes, Kanban e agenda são todos derivados desse estado.

O build gera a saída do Sites e também uma entrada estática (`dist/client/index.html`, `404.html` e `.nojekyll`). O workflow `.github/workflows/deploy.yml` valida lint, tipos, testes e build, então publica `dist/client` no GitHub Pages. Para este repositório de usuário (`demonstracaoonline.github.io`), o endereço esperado é `https://demonstracaoonline.github.io/`.

> Ambiente de demonstração • dados fictícios. Etapas, campos e regras podem ser adaptados ao processo da empresa.
