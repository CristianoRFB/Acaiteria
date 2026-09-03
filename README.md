# Açaí + Sabor — sistema de pedidos

Sistema real de pedidos personalizáveis para a operação da Açaí + Sabor em Santa Fé do Sul. O cliente monta o produto, vê uma prévia do preço, finaliza sem conta e recebe um código. A Cloud Function valida novamente o cardápio e calcula o valor canônico antes de persistir o pedido. A equipe acompanha e atualiza a fila no painel autenticado.

O WhatsApp é opcional e só aparece depois que o pedido já foi salvo. Ele nunca é a fonte de verdade.

## Arquitetura

- Frontend React 19, TypeScript, Vinext/Vite e Tailwind, mobile-first.
- Firebase Authentication para `admin` e `staff`.
- Cloud Firestore para configuração, catálogo, usuários e pedidos.
- Cloud Functions v2 em `southamerica-east1` para `createOrder`, `getPublicOrder`, `updateOrderStatus` e renderização do frontend.
- Firebase Hosting serve os assets e encaminha rotas para a Function `web`.
- Rules deny-by-default; pedidos não aceitam leitura/escrita pública direta.
- Emuladores de Auth, Firestore, Functions e Hosting para desenvolvimento.

Coleções: `storePublicConfig`, `storePrivateConfig`, `categories`, `products`, `modifierGroups`, `modifiers`, `orders`, `orderRequests` (idempotência) e `users` (roles).

## Fluxo

Cliente → catálogo Firestore → configurador dinâmico → carrinho local (somente draft) → `createOrder` → validação/preço server-side → snapshot em `orders` → fila do admin → status rastreável → WhatsApp opcional.

## Rodar localmente

Requisitos: Node 22, Java 21+ e npm.

```powershell
npm ci
npm ci --prefix functions
Copy-Item .env.example .env.local
```

Preencha `.env.local`. Para emuladores, pode usar os identificadores `demo-*` existentes no arquivo local de desenvolvimento e mantenha:

```text
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
NEXT_PUBLIC_USE_DEVELOPMENT_SEED=false
```

Crie o seed exclusivamente no emulador. As credenciais abaixo são fornecidas por variável e não ficam no repositório:

```powershell
$env:SEED_ADMIN_EMAIL="admin-local@exemplo.test"
$env:SEED_ADMIN_PASSWORD="uma-senha-local-forte"
npm run seed:emulator
npm run emulators
```

Em outro terminal:

```powershell
npm run dev
```

- Aplicativo: `http://localhost:3000`
- Painel: `http://localhost:3000/admin/login`
- Emulator UI: `http://localhost:4000`
- Hosting emulator: `http://localhost:5000`

`NEXT_PUBLIC_USE_DEVELOPMENT_SEED=true` mostra o catálogo ilustrativo sem ler o Firestore. Nesse modo o checkout não finge sucesso: para persistir pedidos, use os emuladores.

## Testes e qualidade

```powershell
npm run lint
npm run typecheck
npm test
npm run test:functions
npm run test:rules
npm run test:functions:integration
npm run build:firebase
```

Os testes cobrem centavos, cota global e por grupo, premium, extras, repetição, limites, indisponibilidade, horário/timezone, quatro modos de delivery, carrinho, payloads de Function, idempotência, snapshot, preço adulterado e Rules para público/staff/admin.

## Configurar produção

1. Crie projetos Firebase separados para desenvolvimento e produção.
2. Habilite Authentication por e-mail/senha, Firestore, Functions e Hosting.
3. Registre um Web App e preencha as variáveis `NEXT_PUBLIC_FIREBASE_*` no ambiente de build.
4. Copie `.firebaserc.example` para `.firebaserc` e use os IDs reais somente nesse arquivo local/seguro.
5. Crie o primeiro usuário no Firebase Auth e, via Console/Admin SDK, crie `users/{uid}` com `{ "role": "admin" }`. Nenhuma senha é hardcoded.
6. Cadastre/importe o cardápio real pelo painel. Não execute o seed contra produção; o script bloqueia sem hosts de emulador.
7. Configure App Check/reCAPTCHA. Adicione a site key no frontend e defina `ENFORCE_APP_CHECK=true` no ambiente das Functions somente depois de validar clientes e debug tokens.
8. Execute todos os testes, faça um pedido ponta a ponta e implante:

```powershell
npm run build:firebase
npx firebase deploy --only firestore:rules,firestore:indexes,functions,hosting --project SEU_PROJETO_PROD
```

O build copia o servidor Vinext para o pacote das Functions. Não edite `functions/lib/site-server` manualmente.

## Segurança

- O navegador envia IDs e quantidades; `clientTotal` nunca é aceito como preço.
- `createOrder` busca o catálogo atual, valida limites/disponibilidade, recalcula em centavos e só então persiste.
- `clientRequestId` UUID evita duplicidade em retry/double tap.
- `publicCode` possui 128 bits aleatórios; a consulta retorna apenas DTO seguro.
- Cliente não escreve em `orders`; nem admin altera status diretamente. Transições passam pela Function autenticada.
- Roles ficam em documentos protegidos. Somente admin altera catálogo/configuração; staff opera pedidos.
- Payloads têm limites de itens, quantidades e tamanho de strings. Logs evitam nome, telefone e endereço.
- App Check está preparado, mas fica desligado localmente e deve ser ativado no projeto real.

Para maior volume, adicionar rate limit por IP/device em infraestrutura gerenciada é um hardening recomendado. App Check, idempotência e limites de payload já reduzem abuso, mas não substituem rate limiting.

## Dados obrigatórios antes do lançamento

- WhatsApp, endereço, telefone e horário oficiais.
- Catálogo, categorias, tamanhos, preços, grupos, cotas, premium, repetição e disponibilidade.
- Retirada/delivery, taxa ou zonas e formas de pagamento aceitas.
- Fotos e assets autorizados. `public/development-acai-placeholder.png` é apenas desenvolvimento.
- Política de privacidade/retenção revisada pelo responsável.
- Usuário admin real, Firebase prod, Rules e App Check implantados.
- Pedido real de teste e treinamento da equipe no fluxo de status.

O endereço, telefone, horário, taxas e cardápio do seed não são declarações oficiais.

## Limitações atuais

Sem pagamento online, iFood, PDV, KDS completo, NF-e, API oficial do WhatsApp, geocodificação ou upload pelo Firebase Storage. Imagens são configuradas por URL. Pagamento é apenas informativo e nenhum dado de cartão é coletado.
