# Auditoria de segurança e prontidão comercial

Data: 25/09/2026
Escopo: painel administrativo, pedidos, Financeiro, Caixa, regras do Firestore e visão comercial.

## Retomada de QA — 25/09/2026

Na revisão dos fluxos de pedido foi encontrado um bypass: o cliente Firebase ainda podia gravar pedidos/status e alguns documentos financeiros diretamente, evitando validações que já existiam nas Cloud Functions. A escrita direta foi bloqueada nas Rules e as telas de checkout, pedidos, notificações e Financeiro foram direcionadas às funções autenticadas do backend. A resposta do cliente a uma proposta de edição continua limitada à decisão pendente.

Pedidos legados sem comprovante de preço do servidor agora precisam ser conferidos contra catálogo, tamanho, adicionais, disponibilidade, modalidade e taxa atuais. Se os valores coincidirem, a conferência é registrada; se divergirem, o avanço fica bloqueado até a loja corrigir o pedido e o cliente aceitar a nova proposta. Conclusão/estorno e confirmação de entrega também recusam pedidos sem preço validado pelo servidor.

No Financeiro, uma chave de repetição agora também fica vinculada ao conteúdo do lançamento. Reenviar os mesmos dados é idempotente; reutilizar a chave com valor ou descrição diferentes é recusado, evitando que a tela informe sucesso enquanto deixa de gravar a alteração. A mesma proteção foi aplicada às operações do Caixa (abertura, movimentação, venda local e fechamento): reenvio idêntico é seguro, mas uma tentativa alterada com a mesma chave é recusada sem sobrescrever o primeiro registro.

Conclusão de pedidos, confirmação de delivery e estorno também validam o saldo esperado do Caixa antes de gravar. Se um saldo antigo/inconsistente for negativo ou inválido, a transação inteira é recusada sem concluir pedido nem gravar venda, estorno ou lançamento parcial.

Verificações executadas nesta retomada, em Firebase Emulator com projeto demo e sem importar os dados locais:

- `npm run ci` — passou: lint, typecheck, 39 testes do app e build.
- `npm run test:functions` — passou: 14 testes unitários.
- `npm run test:rules` — passou: 6 testes das Rules.
- `npm run test:functions:integration` — passou: 42 testes de pedidos, entregas, Financeiro e Caixa.
- Os runners de Rules e Functions agora escolhem portas locais livres e usam configuração temporária, sem reutilizar emuladores que já estejam rodando.
- O build emitiu apenas avisos de bundle cliente acima de 500 kB; não impediu a compilação.

## Retomada de publicação — 25/09/2026

- `npm run ci` passou novamente: lint, typecheck, 39 testes do app e build.
- `npm run test:functions:integration` passou: 42 testes; `npm run test:rules` passou: 6 testes.
- `npm run build:firebase` e `wrangler deploy --dry-run --config dist/server/wrangler.json` passaram. O pacote do Worker contém 145 módulos e 438 assets; o dry-run não publicou versão.
- O Worker ativo é `acai-mais-sabor`, com implantação mais recente observada em 22/09/2026. Nenhuma versão Cloudflare foi alterada nesta retomada.
- O smoke HTTP local do pacote gerado retornou 200 em 10 rotas de cliente, checkout, admin e entregador. O navegador integrado não conectou; a inspeção visual real em viewport mobile permanece pendente.
- `npm audit --omit=dev` e `npm --prefix functions audit` encontraram zero vulnerabilidades. O audit completo do CLI de desenvolvimento aponta cinco moderadas transitivas em `firebase-tools`; a resolução sugerida é um downgrade de versão principal e não foi aplicada.
- `.env.production.local` foi criado da amostra local, é ignorado pelo Git e contém a configuração pública do projeto padrão correto. A chave App Check continua como `COLE_AQUI`; `npm run check:production` bloqueia somente esse placeholder.
- `npm run check:production:backend` continua bloqueando publicação: as 26 Cloud Functions críticas não estão implantadas em `food-5fb44`. O projeto Firebase está no plano Spark; habilitar faturamento/Blaze exige autorização do responsável.
- A primeira execução antiga de Rules reutilizou o emulador Firestore já aberto em 8180 e escreveu documentos de teste, incluindo `products/active`. O documento permaneceu intacto por não ser possível distinguir com segurança fixture de dado do responsável. Os runners atuais usam portas isoladas; não remover o documento sem confirmação.

Isso valida código e fluxos automatizados no emulador, não substitui um pedido real de homologação nem comprova o projeto Firebase publicado.

## Revalidação após o pull — 25/09/2026

- O checkout foi atualizado até `bc7e5a2` (`main` alinhada com `origin/main`).
- `npm run check:production` foi executado nesta máquina e continua bloqueando a publicação: falta somente `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`. O arquivo `.env.production.local` existe localmente; seus valores não devem ser enviados ao GitHub.
- `functions/.env` não existe localmente. Criá-lo a partir de `functions/.env.example`, configurar `ENFORCE_APP_CHECK=true` somente depois de registrar o domínio no App Check e preencher a chave pública do frontend.
- Nenhum deploy de Hosting, Functions, Rules ou índices foi feito nesta revalidação.
- A inspeção visual confirmou o cardápio público e que `/entregador` exige login. Não foi feito login nem executada uma jornada autenticada completa de pedido → atribuição → entrega → caixa/financeiro; não declarar essa jornada homologada.
- O processo local não criou pedido nem fez cobrança. O ambiente local/emulador não comprova que o Firebase de produção esteja pronto.

## Continuação da prontidão empresarial — 25/09/2026

- O portal do entregador agora mantém navegação inferior no detalhe da corrida, permite voltar diretamente a cada aba e agrupa o histórico por Hoje/Ontem/Mais antigas no fuso `America/Sao_Paulo`. O total diário usa o mesmo fuso comercial.
- O próprio entregador pode atualizar nome e telefone no perfil. A callable `updateDriverContact` deriva a identidade da sessão, exige papel ativo de entregador, valida telefone brasileiro e só grava nome/telefone; não aceita alterações de e-mail, papel, ativação ou cadastro de terceiros. O formulário administrativo de edição também foi reorganizado para não quebrar em larguras intermediárias.
- Novos testes de integração cobrem atualização permitida, tentativa de adulterar campos protegidos, edição de outro cadastro, telefone inválido, acesso desativado e chamadas por admin/cliente.
- Nesta rodada: `npm run lint`, `npm run typecheck`, `npm test` (40), `npm run test:functions` (14), `npm run test:functions:integration` (44) e `npm run test:rules` (6) passaram.
- `npm run build` e `npm run build:firebase` passaram. `npx wrangler deploy --dry-run --config dist/server/wrangler.json` passou usando Wrangler 4.134.0 e o Worker `acai-mais-sabor`; pacote de 147 módulos e 440 assets, cerca de 2,25 MiB sem gzip. Foi uma simulação local, sem publicar.
- O build continua avisando sobre bundles cliente acima de 500 kB. É uma oportunidade de otimização de carregamento, não falha de compilação. A integração executou no Node 24 do host embora o projeto peça Node 22; a suíte passou, mas o runtime deve ser padronizado no CI/produção.
- Medição dos artefatos locais: maior chunk compartilhado do cliente = 559 KiB sem compressão / 164 KiB gzip; gráficos Financeiros = 356 KiB e já são carregados por importação dinâmica somente ao abrir Inteligência de vendas. Não há trace real de navegador nem métricas LCP/INP/CLS nesta sessão, então não atribuí nota Core Web Vitals a partir do tamanho dos arquivos.
- A conferência final continua bloqueando produção por dois itens externos/configuração: `.env.production.local` ainda contém placeholder para a chave App Check, e a consulta ao Firebase confirmou que as 27 Functions necessárias ainda faltam no projeto `food-5fb44`. O plano Spark não permite a implantação delas; o responsável precisa autorizar faturamento/Blaze e fornecer/configurar a chave App Check real.
- Não foi feito deploy em Firebase ou Cloudflare. A inspeção visual em viewport mobile permanece pendente porque o navegador integrado não ficou disponível nesta sessão. O emulador que já estava ativo em `127.0.0.1:8180` continua preservado.

## Correções aplicadas

- O checkout usa a callable `createOrder`, que recalcula catálogo, preços, taxa e disponibilidade no servidor. Escrita direta de pedidos e do espelho público foi removida das Rules.
- Quando a gravação do checkout perde a conexão depois do envio, o mesmo `clientRequestId` é reutilizado para evitar duplicação; se o envio não for confirmado, o formulário permanece preservado e o cliente recebe a alternativa de contato pelo WhatsApp.
- Edição e mudança de situação do Financeiro passaram para funções autenticadas. Lançamentos automáticos vinculados a pedido ou venda local não podem ser editados nem apagados pelo painel.
- O registro de venda local continua transacional: Caixa e Financeiro são gravados juntos, com idempotência e efeito correto por forma de pagamento.
- A consulta de pedidos concluídos usada pela visão comercial ganhou índice por `status` e `updatedAt`.
- O catálogo passou a normalizar documentos antigos sem `sizes`, sinalizar esses produtos no painel e ocultá-los do cardápio público até revisão.
- As Rules agora exigem os campos mínimos de produto, incluindo `sizes` e `modifierGroupIds`, para impedir novos registros incompletos.

## Auditoria por área

| Área | Resultado | Observação |
|---|---|---|
| Autenticação e papéis | Passou | Funções administrativas exigem `admin` ou `staff`; Financeiro exige `admin`. |
| Pedidos e preços | Corrigido nesta retomada | O checkout passa pelo backend; pedidos legados exigem validação canônica antes de avançar, concluir ou gerar financeiro. |
| Caixa | Passou | Operações autenticadas validam reenvios e recusam saldos inconsistentes sem gravações parciais. |
| Financeiro | Passou | Manual e automático passam pelo backend; exclusão direta bloqueada. |
| Cliente e acompanhamento | Passou | Leitura pública fica limitada ao espelho/código; resposta de edição aceita somente decisão pendente. |
| Banco e consultas | Passou | Consultas críticas têm limite/filtros; a visão comercial usa consulta mensal indexada. |
| Interface comercial | Passou | Visão comercial separada dentro do Financeiro, com estados vazios e dados reais do mês. |
| Catálogo | Passou | Produto legado sem tamanhos não derruba o painel nem fica disponível para compra. |

## Verificações executadas

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:functions`
- `npm run test:rules` com Java 21
- `npm run build`
- `npm run check:production` — bloqueado corretamente pela ausência da chave real do App Check.
- Operação real no localhost: Financeiro → Inteligência de vendas, gráficos, mix de pagamentos, ranking e canais.

## Risco residual antes de produção

- Publicar Rules, índices, Functions e frontend como uma versão coordenada. A proteção nova nega gravações diretas de pedidos, finanças, caixa, perfis e entregadores; um frontend antigo não terá compatibilidade operacional com essas Rules.
- Confirmar App Check no ambiente de produção e habilitar faturamento/Cloud Functions no plano Firebase apropriado (o uso pode exigir Blaze); nenhum deploy foi feito nesta retomada.
- O projeto Firebase de produção `food-5fb44` e o alvo `.firebaserc` estão configurados.
- Nesta máquina, `npm run check:production` aponta a ausência de `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`; `functions/.env` também precisa ser criado/configurado localmente. Não versionar esses arquivos nem seus segredos. Rules, índices, Functions e Hosting ainda precisam ser publicados em uma implantação coordenada, após homologação.
- A revisão estática encontrou um caso financeiro ainda não coberto: a tela escolhe o registro `OPEN` mais recente, sem conferir se ele corresponde a `cashControl/main.openRegisterId`. As movimentações recusam um vínculo diferente, mas a abertura não procura outros registros `OPEN` quando o vínculo está ausente/inválido; isso pode deixar o operador confuso ou permitir dois caixas abertos. Antes da operação real, detectar e bloquear caixas órfãos e criar um procedimento de reconciliação auditável.
- A callable de estorno retorna sucesso quando já existe um estorno para o pedido, sem comparar o motivo enviado com o estorno original. Uma repetição com motivo diferente pode ser apresentada como aceita embora não altere o registro. Vincular o retry ao conteúdo original e cobrir esse conflito com teste antes da venda.
- Neste ambiente, `.env.production.local` existe, mas ainda usa a chave-placeholder do App Check; `functions/.env` não está presente. Rules, índices, Functions e Hosting não foram publicados nesta retomada.
- A integração Saipos permanece desativada até existir contrato oficial de pedidos, credencial de homologação, mapeamentos reais e adapter homologado.
- O checkout registra a forma de pagamento escolhida, mas esta auditoria não homologou captura/liquidação por um gateway online. Até escolher e homologar um provedor em sandbox, vender apenas com o fluxo de cobrança manual confirmado pela loja.
- O código está configurado para a operação da Açaí + Sabor e não evidencia isolamento multiempresa (`tenantId`). Uma oferta SaaS hospedada para várias lojas exige isolamento de dados e autorização por empresa; uma implantação separada por cliente precisa de configuração e validação próprias.
- A marcação de produção depende ainda de uma jornada autenticada completa com contas de teste, cenário de falha/estorno e reconciliação do caixa, além da confirmação operacional de endereço, contato, horário, cardápio, preços, taxas, área de entrega e políticas da loja.
- O ranking de produtos considera itens detalhados dos pedidos online; vendas locais entram no faturamento, ticket e canais, mas precisam de itemização própria para aparecerem como produto.
- Antes de cobrar clientes reais, executar um pedido sandbox ponta a ponta com o provedor escolhido e confirmar os índices no projeto Firebase de produção.

## Reauditoria do Caixa e dos estornos — 28/09/2026

Esta seção substitui, para a versão atual do código, os dois riscos de Caixa/estorno listados acima como pendentes. Ela não significa que o backend de produção já tenha sido publicado.

- A abertura agora consulta os registros `OPEN` dentro da transação. Se encontrar um caixa aberto sem vínculo em `cashControl/main`, mais de um caixa aberto, ou o caixa já vinculado, a operação é bloqueada sem criar registro/movimento. Duas aberturas simultâneas com chaves diferentes são serializadas pelo controle transacional.
- O painel do Caixa só opera sobre um único registro aberto cujo ID coincide com `cashControl/main.openRegisterId`. Falha de leitura impede abertura. Caixa órfão recebe aviso; ambiguidade com múltiplos caixas não escolhe o mais recente nem tenta consertar automaticamente.
- A recuperação de um único vínculo órfão exige papel `admin`, motivo explícito, confirmação de conferência física e autorização da gerência. A função verifica que existe exatamente um caixa aberto e altera somente o ponteiro de controle — não toca no saldo esperado, movimento ou lançamento financeiro. Uma chave de requisição torna o retry idempotente; o histórico `cashControlEvents` guarda ator, motivo, caixa anterior e confirmações. As Rules permitem leitura da equipe, mas nenhuma escrita pelo cliente.
- Um retry de estorno só retorna sucesso se o pedido cancelado, o motivo, o valor e a forma da venda, o movimento de estorno e a despesa financeira coincidirem. Mesmo motivo com lançamento incompleto/adulterado e motivo diferente são recusados. A primeira tentativa cria pedido, espelho público, caixa e Financeiro na mesma transação; caixa inválido/insuficiente ou lançamento órfão interrompe tudo sem escrita parcial.
- Cobertura adicionada para caixa órfão, reconciliação autorizada/idempotente, acesso negado a entregador, múltiplos caixas sem resolução automática, duas aberturas concorrentes, estornos concorrentes com o mesmo motivo, conflito de motivo e inconsistência Financeiro/caixa.

Procedimento operacional para um caixa órfão: parar movimentações; conferir fisicamente o dinheiro e os documentos do turno; gerente escolhe o único registro comprovadamente correto; administrador descreve a conferência e confirma autorização na tela Caixa; após a restauração, revisar o evento imutável no histórico. Se houver mais de um registro `OPEN`, não usar reconciliação automática: a gerência deve apurar cada turno e escalar a correção manual antes de retomar vendas.

O deploy das Rules e da nova callable `reconcileCashRegisterControl` é obrigatório em conjunto com o frontend antes de usar o procedimento em produção. A chave real do App Check, o plano Firebase compatível com Functions e a homologação operacional continuam sendo pré-requisitos externos; nenhuma alteração de produção é feita pela auditoria local.

Verificação executada nesta rodada:

- `npm run ci` passou: lint, TypeScript, 40 testes da aplicação e build.
- `npm run test:functions` passou: 14 testes unitários; `npm run test:rules` passou: 6 testes; `npm run test:functions:integration` passou: 49 testes nos emuladores isolados.
- `npm audit --omit=dev` e `npm --prefix functions audit --omit=dev` retornaram zero vulnerabilidades.
- `npm run build:firebase` passou. O Wrangler 4.134.0 concluiu `deploy --dry-run` com 147 módulos e 440 assets (2.257,42 KiB total; 620,70 KiB gzip); nenhuma versão foi publicada.
- O Worker gerado foi iniciado localmente e respondeu HTTP 200 em `/`, `/admin/login`, `/admin/caixa`, `/entregador/login`, `/entregador?tab=history`, `/checkout` e `/pedido/QA-SMOKE`. Isso verifica resposta SSR das rotas, não autenticação nem interação visual autenticada.
- Os gates de produção foram consultados e bloqueiam corretamente: falta a chave real do App Check e faltam as 28 Functions críticas no Firebase `food-5fb44`, incluindo a callable nova. O plano de faturamento e a credencial são ações externas, não foram alterados.
- CI/Functions exigem Node 22; este host usa Node 24 e o emulador avisou sobre a diferença. A validação passou localmente, mas padronizar o runtime em Node 22 continua recomendado antes de release.
- Não houve inspeção autenticada em navegador nem deploy. O bundle cliente ainda gera o aviso conhecido de chunk acima de 500 kB; a build terminou sem erro.

## Continuação da prontidão empresarial — 28/09/2026

- Resolvidas as vulnerabilidades transitivas do ambiente de desenvolvimento Firebase CLI por overrides explícitos no `package.json` raiz, alinhados às versões compatíveis atuais. `npm audit` e `npm --prefix functions audit --omit=dev` retornaram zero vulnerabilidades; o runtime de produção do app também já havia sido auditado sem vulnerabilidades.
- `npm run ci` passou: lint, typecheck, 40 testes do app e build.
- `npm run test:functions` passou: 14 testes unitários; `npm run test:rules` passou: 6 testes; `npm run test:functions:integration` passou: 44 testes em emuladores isolados.
- `npm run build:firebase` passou. `npm exec wrangler -- deploy --dry-run --config dist/server/wrangler.json` passou sem publicar: Worker com 147 módulos e 440 arquivos de assets, total de 2.250,93 KiB (619,50 KiB gzip).
- O Worker compilado foi iniciado localmente pelo Wrangler e retornou HTTP 200 para `/`, `/admin/login`, `/admin/entregadores`, `/entregador/login`, `/entregador?tab=history`, `/checkout` e `/pedido/QA-SMOKE`; o processo foi encerrado após o smoke test. Isso confirma resposta/renderização SSR das rotas, não autenticação real nem funcionamento visual/interativo.
- `git diff --check` passou; o Git emitiu apenas avisos de conversão LF/CRLF do host Windows.
- Não foi possível fazer inspeção visual no navegador integrado porque nenhum backend IAB estava disponível. O host está em Node 24, enquanto o CI usa Node 22; integração local passou, mas convém padronizar a validação local e produtiva no Node 22.
- Os gates de produção foram reexecutados e continuam falhando de forma segura: `.env.production.local` ainda usa `COLE_AQUI` para App Check, e o projeto `food-5fb44` não tem 26 Cloud Functions requeridas. O plano Spark não permite implantar o backend esperado sem mudança de faturamento.
- Nenhum deploy foi feito em Cloudflare ou Firebase. A publicação continua condicionada à chave App Check válida, backend Firebase completo, autorização de faturamento, homologação real e inspeção visual responsiva.
