# Segurança e autorização

- Rules começam em deny-by-default; collections legadas na raiz não são acessíveis por clientes.
- Loja ativa e membership ativa são exigidos para dados operacionais. Status suspenso bloqueia o uso e preserva os dados.
- Documento de membership, não `users/{uid}.role`, é a autoridade do papel tenant.
- `platform_owner` é verificado no servidor por `users/{uid}.platformRole`; não ganha membership de loja implicitamente.
- Callables tenant-aware resolvem slug e status em Firestore Admin antes de entrar no escopo tenant; handlers validam identidade/membership/role.
- `platformAuditLogs` só é legível por platform owner e nunca é gravável por clientes.
- `deliverySecrets` nega leitura e escrita cliente. Preços e estados de pedido continuam validados no servidor.
- App Check é exigido no ambiente de Functions não-emulador; App Check não substitui Auth, Rules ou RBAC.
- A criação de owner exige conta Firebase Authentication preexistente e ativa. O sistema não exibe nem envia senha inicial.

Testes locais de Rules e Functions validam positive/negative paths e tentativas A→B. O uso do Admin SDK em migration/backend não está sujeito a Rules; controles do código, revisão e credenciais continuam obrigatórios.

Riscos/gates restantes: provisionamento inicial de platform owner, segredo/credenciais, configuração App Check em produção, validação de backup/migração e revisão independente do Firebase alvo.
