# Staging Parity Checklist (Categoria 2)

## Objetivo
Garantir que staging represente producao nos fluxos de seguranca e operacao.

## Pre-deploy
1. Validar env obrigatorio:
   - `npm run staging:parity:check -- --env-file=ops/prod/.env.prod.example`
2. Confirmar mesmas versoes de runtime (Node/NPM) e mesma topologia de servicos.
3. Confirmar variaveis de seguranca configuradas:
   - `SESSION_SECRETS`
   - `BETTER_AUTH_SECRET`
   - `DATA_ENCRYPTION_KEYS_JSON`
   - `SECURITY_RECOVERY_CODE_PEPPER`
   - `METRICS_TOKEN`

## Pipeline staging recomendado
1. `npm run prisma:migrate:deploy`
2. `npm run api:health:check`
3. `npm run api:smoke`
4. Validar contrato/capabilities do backend:
   - `GET /api/contracts/v1.json`
   - conferir `capabilities.project_epub_import`
   - conferir `capabilities.project_epub_export`
   - conferir `build.commitSha` e `build.builtAt`
5. Rodar smoke categoria 6 contra o ambiente alvo:
   - `node scripts/check-category6-smoke.mjs --base=https://seu-ambiente`
6. Validacao manual de seguranca:
   - login com/sem 2FA
   - listagem/revogacao de sessoes
   - criacao e download de export admin
   - recebimento de alerta critico no webhook operacional

## Dados
1. Usar somente dados mascarados.
2. Nao replicar segredos nem PII em texto puro.
