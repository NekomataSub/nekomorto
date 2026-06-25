# Cutover do Better Auth

## Pré-validação

1. Faça backup do PostgreSQL e registre o ponto de restauração.
2. Configure `BETTER_AUTH_SECRET` com pelo menos 32 bytes aleatórios.
3. Cadastre nos provedores os callbacks:
   - `<APP_ORIGIN>/api/auth/callback/discord`
   - `<APP_ORIGIN>/api/auth/callback/google`
4. Execute `npm run auth:cutover:audit`. Não continue se `ready` for `false`.

## Deploy

1. Pare novas mutações administrativas ou ative a janela de manutenção.
2. Execute `npm run prisma:migrate:deploy`.
3. Publique a aplicação e valide `/api/health`, `/api/auth/ok` e `/api/me`.
4. Teste login aprovado via Discord e Google, linking, logout e revogação de sessão.
5. Confirme que OAuth de usuário com V2F ativa abre `/login?mfa=required` e que passkey
   autentica sem o prompt adicional.

As sessões antigas não são importadas. TOTP, recovery codes e credenciais WebAuthn legadas
permanecem no banco apenas para rollback e precisam ser recadastradas no Better Auth.

## Rollback

1. Restaure a versão anterior da aplicação.
2. Preserve `SESSION_SECRET`, `SESSION_SECRETS` e as tabelas legadas.
3. As tabelas `auth_*` são aditivas; não as remova durante o rollback imediato.
4. Se houver restauração de backup, restaure aplicação e banco para o mesmo ponto.
