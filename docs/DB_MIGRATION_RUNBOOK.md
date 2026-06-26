# Runbook de Producao DB-Only (Ubuntu + Edge Proxy + Docker Compose)

Este runbook define o fluxo oficial para a stack publicada em topologia de host unico:

- `app` + `postgres` + `edge` no mesmo servidor Ubuntu
- publicacao automatica da imagem no GHCR por GitHub Actions
- runtime DB-only, sem fallback JSON

## 1. Premissas e arquivos oficiais

Arquivos usados em producao:

- `docker-compose.prod.yml` (profiles: `caddy`, `nginx`, `traefik`; sem profile = standalone)
- `ops/caddy/Caddyfile`
- `ops/nginx/default.conf.template`
- `ops/prod/.env.prod.example`
- `ops/deploy.sh`
- `ops/prod/deploy-prod.sh`
- `.github/workflows/deploy-prod.yml`

Premissas:

- `DATABASE_URL` obrigatoria
- sessoes autenticadas no PostgreSQL via Better Auth (`auth_sessions`)
- `/api/health` com `dataSource=db`
- runtime Node pinado em `24.14.0` (npm `11.x`)
- upgrades de runtime/deps apenas via PR dedicado com gate completo

## 1.1 Politica de atualizacao de runtime/deps

1. Nao usar tags flutuantes de Node em producao.
2. Atualizar pin de Node em ciclos controlados (PR dedicado).
3. Priorizar patch/minor de dependencias; majors em PRs separados.
4. Cadencia recomendada: 1 PR mensal de manutencao (runtime + deps seguras).
5. Gate obrigatorio em toda rodada:

- `npm run lint`
- `npm run test`
- `npm run api:smoke -- --base=<ambiente>`

## 2. Provisionamento inicial do host Ubuntu

1. Instalar Docker Engine + Compose plugin.
2. Criar diretorio de deploy:

```bash
sudo mkdir -p /srv/nekomorto
sudo chown -R $USER:$USER /srv/nekomorto
```

3. Clonar repositorio:

```bash
git clone <REPO_URL> /srv/nekomorto
cd /srv/nekomorto
```

4. Criar arquivo de ambiente:

```bash
cp ops/prod/.env.prod.example .env.prod
```

5. Ajustar variaveis minimas em `.env.prod`:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://nekomorto_app:<senha>@postgres:5432/nekomorto
SESSION_SECRET=<segredo_forte>
APP_ORIGIN=https://nekomata.moe,https://www.nekomata.moe
ADMIN_ORIGINS=<origens_admin>
MAINTENANCE_MODE=false
PROXY_PROVIDER=caddy
APP_DOMAIN=<dominio-canonico>
APP_WWW_DOMAIN=<dominio-www>
```

6. Configurar firewall:

- abrir `22`, `80`, `443`
- nao expor `5432`
7. Confirmar DNS antes do primeiro `up`:

- `APP_DOMAIN` e `APP_WWW_DOMAIN` apontando para o IP publico do host
- se `PROXY_PROVIDER=traefik`, preencher `TRAEFIK_ACME_EMAIL`
- se `PROXY_PROVIDER=nginx`, provisionar certificado/chave no host e apontar `NGINX_TLS_CERT_PATH`/`NGINX_TLS_KEY_PATH`

## 3. Primeiro deploy em producao

No host:

```bash
cd /srv/nekomorto
bash ops/deploy.sh prod setup
bash ops/deploy.sh prod deploy
```

Validar:

```bash
bash ops/deploy.sh prod status
```

Criterio de aceite:

- `health` retorna `ok=true`, `dataSource=db`, `maintenanceMode=false`
- smoke 100% ok

## 4. Migracao de dados (local -> producao)

1. Congelar escrita na origem (`MAINTENANCE_MODE=true`).
2. Gerar dump SQL na origem.
3. Transferir dump para o host de producao (`scp`).
4. Restaurar no destino com override de compose/env:

```bash
cd /srv/nekomorto
COMPOSE_FILE=/srv/nekomorto/docker-compose.prod.yml \
ENV_FILE=/srv/nekomorto/.env.prod \
./ops/postgres/restore.sh /path/backup.sql.gz
```

5. Reaplicar migrations e validar estado:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER:-caddy}" run --rm app npm run prisma:migrate:deploy
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER:-caddy}" run --rm app npx prisma migrate status
```

6. Reabrir escrita (`MAINTENANCE_MODE=false`) apos health/smoke ok.

## 5. Publicacao da imagem por GitHub Actions

Workflow:

- `.github/workflows/deploy-prod.yml`

Trigger:

- push em `main`

Permissoes usadas no workflow:

- `contents: read`
- `packages: write`

Fluxo do pipeline:

1. o workflow roda `npm run typecheck` e `npm run test:a11y`
2. o job de preview roda `npm run typecheck:ts7-preview` com `continue-on-error`
3. o job de build roda em matrix sobre dois runners nativos do GitHub Actions: `ubuntu-latest` (amd64) e `ubuntu-24.04-arm` (arm64). Cada leg compila nativamente e publica em `ghcr.io/nekomatasub/nekomorto` com tags `latest` e `sha-<commit>`. O GHCR consolida os dois leg em um unico multi-arch manifest list (linux/amd64 + linux/arm64); o `docker pull` resolve a camada correta para a arquitetura do host automaticamente

Deploy depois da publicacao:

- o GitHub Actions nao faz mais SSH nem deploy remoto
- apos a publicacao da imagem, execute o deploy local/manual com `bash ops/deploy.sh prod deploy`
- o deploy local continua aplicando migrations, validando uploads e executando health/smoke no host

## 6. Backup e restore continuo

Backup diario (cron) com override de compose/env:

```bash
cd /srv/nekomorto
COMPOSE_FILE=/srv/nekomorto/docker-compose.prod.yml \
ENV_FILE=/srv/nekomorto/.env.prod \
./ops/postgres/backup.sh
```

Restore sob demanda:

```bash
cd /srv/nekomorto
COMPOSE_FILE=/srv/nekomorto/docker-compose.prod.yml \
ENV_FILE=/srv/nekomorto/.env.prod \
./ops/postgres/restore.sh /path/backup.sql.gz
```

## 7. Operacao em janela de manutencao

1. Definir `MAINTENANCE_MODE=true` em `.env.prod`.
2. Reiniciar app:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER:-caddy}" up -d app
```

3. Validar:

```bash
npm run api:health:check -- --base=https://<APP_DOMAIN> --expect-source=db --expect-maintenance=true
```

4. Finalizar operacao, voltar `MAINTENANCE_MODE=false`, reiniciar app.

## 8. Rollback

Rollback suportado:

1. Codigo/imagem: `bash ops/deploy.sh prod rollback --tag sha-<40hex>`.
2. Dados: restore SQL + restore de uploads.

Rollback para JSON nao e suportado.
