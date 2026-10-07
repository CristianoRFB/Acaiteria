# Prontidão antes de vender ou operar — 07/10/2026

## Decisão atual

**NO-GO para abrir a operação em produção com a configuração verificada nesta máquina.** O código e os testes locais estão em bom estado, mas os gates de produção não passaram. A QA de entrega usa dados fictícios e Firebase Emulator; isso não comprova o Firebase publicado nem a captura de pagamentos reais.

Há também uma decisão de produto: não encontrei isolamento por tenant, loja ou organização no app, nas Functions ou nas regras Firestore. O sistema aparenta ser de uma única loja. Uma instalação isolada por cliente é um modelo possível, mas precisa de um processo de implantação e suporte validado. Para vender como SaaS hospedado para várias lojas, isolamento multi-tenant, onboarding e testes contra acesso cruzado são bloqueadores antes de cadastrar qualquer cliente.

## Evidência verificada nesta retomada

- A main foi atualizada por pull e já estava no commit `f90eaf8`; as mudanças locais foram preservadas.
- CI: lint, TypeScript, 46 testes do app e build passaram.
- Rules: 6 testes passaram; Functions unitárias: 14 passaram; Functions em emuladores: 49 passaram.
- Build para Firebase: passou.
- Auditoria de runtime: `npm audit --omit=dev` no app e em Functions encontrou zero vulnerabilidades.
- Auditoria completa das ferramentas de desenvolvimento: 16 alertas de severidade alta, em dependências transitivas do toolchain. A sugestão automática exige downgrades incompatíveis; não foi usada. Reavaliar e documentar a exceção ou substituir os pacotes afetados antes de estabilizar a esteira de release.
- Gate de produção do app: falha porque falta `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`.
- Gate do backend: a consulta atual não conseguiu confirmar o inventário publicado. O último checkpoint documentado (02/10/2026) indicou 28 Functions críticas ausentes e plano Firebase Spark; validar novamente com a conta autorizada.
- A jornada completa de pedido, admin, motoboy e caixa foi percorrida em navegador/emuladores com pedido fictício. Não foi uma transação real.
- Viewports móveis 360, 390 e 430 px foram exercitados em QA; aparelho físico, instalação real e notificações com app fechado não foram homologados.

## Bloqueadores antes do primeiro cliente pagante

1. **Escolher o modelo de venda.** Para uma loja por instalação, documentar provisionamento, projeto Firebase separado, domínio, atualização e suporte. Para SaaS multi-loja, implementar tenant isolation em todos os documentos, consultas, Rules, Functions, Storage e relatórios; adicionar testes que tentem ler e alterar dados de outra loja.
2. **Fechar a configuração de produção.** Registrar o domínio no App Check e fornecer a site key real. Confirmar que o projeto padrão e os IDs públicos correspondem. Não colocar `.env`, chaves privadas ou credenciais no GitHub.
3. **Autorizar e preparar o backend.** O responsável pelo Firebase deve confirmar o plano de faturamento compatível com Functions, login de deploy e orçamento/alertas. Configurar secrets pelo mecanismo aprovado para produção; não versionar arquivos de ambiente.
4. **Implantar como uma release coordenada.** Publicar e confirmar as 28 Functions requeridas, Rules, índices e frontend compatíveis. Executar o gate de backend e conferir logs/erros após a publicação. Ter plano de rollback; Rules novas não devem ser combinadas com frontend antigo incompatível.
5. **Homologar numa cópia de produção.** Com contas e dados sintéticos, repetir login por papel, catálogo, pedido, edição/cancelamento, atribuição e falha de entrega, conclusão, dinheiro/Pix/cartão, caixa fechado, estorno idempotente, fechamento e reconciliação. Confirmar que nenhuma receita ou movimento duplica em retry.
6. **Definir como o dinheiro será cobrado.** Hoje o checkout registra a forma informada (Pix, cartão na entrega ou dinheiro); a auditoria não encontrou captura/liquidação de gateway online. Se a oferta prometer pagamento online, escolher provedor, homologar sandbox, webhooks, idempotência, reembolso e conciliação antes de habilitar. Se a cobrança for manual, deixar isso explícito para a loja e o cliente.
7. **Aceitar ou remover integrações anunciadas.** Saipos permanece desativado até obter contrato, credenciais e ambiente oficial. Push com app fechado/FCM não está implementado. Maps com endereço autorizado, impressora física e operação em aparelho real ainda precisam de homologação se fizerem parte da oferta.
8. **Preparar a operação e o atendimento.** Conferir nome, logo, catálogo, fotos, preços, disponibilidade, taxa/área/horário de entrega, contatos, mensagens de erro e treinamento do admin/motoboy. Definir suporte, backups/restauração, monitoração, retenção e resposta a incidentes. Revisar termos, privacidade, cancelamento e reembolso com o responsável da operação.
9. **Dar aceite final.** Fazer smoke test no domínio de produção, verificar um pedido controlado sem cobrança indevida, caixa/Financeiro e logs, confirmar restauração de backup e registrar quem autorizou o go-live.

## O que está em aberto, mas não bloqueia sozinho

- O chunk cliente de cerca de 567 kB (aproximadamente 167 kB gzip no relatório de build) e o aviso de classificação dinâmica do vinext merecem otimização e monitoramento de carregamento; o build passa.
- FCM, Saipos, mapas reais e impressão física só são necessários para o lançamento se forem anunciados como funcionalidades incluídas.
- A auditoria de desenvolvimento mostra alertas de toolchain; as dependências de runtime auditadas estão limpas, mas o risco de supply chain deve continuar rastreado.

## Próxima execução no GitHub

1. Resolver a escolha mono-loja versus SaaS multi-loja e atribuir um responsável pelos itens externos de Firebase/App Check/faturamento.
2. Criar ambiente de staging e guardar credenciais apenas nos secrets do provedor/CI, nunca em commits.
3. Rodar CI e os testes de Rules/Functions; fazer deploy de staging e executar a matriz de homologação acima.
4. Atualizar este arquivo e `docs/MOTOBOY_AUDIT.md` com evidências e data; não transformar item em OK sem resultado observável.
5. Somente após gates verdes e aceite do responsável, agendar a publicação coordenada. Os scripts de deploy existentes não foram executados nesta auditoria.
