# Nekomorto

Guia completo (PT-BR) para entender o produto, rodar, desenvolver, operar e manter o projeto em ambiente local e em producao com Docker.

## 1. Titulo e Visao Geral do Projeto

O Nekomorto e uma plataforma editorial e de leitura da Nekomata, com area publica para conteudo e catalogo de projetos e um dashboard autenticado para operacao interna.

### 1.1 O que o produto cobre

- Area publica com home, posts, paginas institucionais, equipe, FAQ, doacoes, recrutamento, catalogo de projetos e leitura de capitulos/episodios.
- Dashboard autenticado para usuarios, posts, paginas, projetos, capitulos, episodios, comentarios, uploads, analytics, redirects, webhooks, seguranca e audit log.
- Login via Discord, Google e senha interna, bootstrap inicial de owner e trilhas operacionais para manutencao, backup, restore e deploy.

As principais superficies do produto aparecem diretamente nas rotas do frontend:

- publico: `src/routes/PublicRoutes.tsx`
- dashboard: `src/routes/DashboardRoutes.tsx`

No estado atual da migracao, as rotas ja atendidas por Astro ficam em `src-astro/pages/**` e incluem:

- publicas institucionais: `/sobre`, `/faq`, `/equipe`, `/doacoes`, `/recrutamento`, `/politica-de-privacidade` e `/termos-de-uso`
- superficie publica principal: `/`, `/projetos`, `/projeto/[slug]`, `/postagem/[slug]`
- leitura publica: `/projeto/[slug]/leitura/[chapter]`
- shells Astro autenticados: `/login` e `/dashboard/**`

### 1.2 Visao tecnica

O Nekomorto e uma aplicacao web **DB-only**:

- O PostgreSQL e a fonte unica de verdade dos dados.
- O backend roda em Node.js/Express (`server/index.js`).
- A superficie publica e parte da superficie autenticada rodam em um runtime hibrido: o legado React/Vite continua ativo, enquanto o Astro ja atende as rotas publicas principais, as paginas institucionais, o leitor publico e os hosts de `/login` e `/dashboard/**`.
- As sessoes autenticadas sao gerenciadas pelo Better Auth no PostgreSQL (`auth_sessions`).
- Uploads podem ser servidos localmente ou via object storage, preservando o contrato publico em `/uploads/...`.

### 1.3 Mapa rapido do repositorio

- `src/`: app React, paginas, componentes, hooks, rotas, estilos e testes de frontend.
- `src-astro/`: paginas, layouts e helpers Astro da superficie publica em migracao incremental.
- `server/`: servidor Express, rotas de API, auth, uploads, analytics, OG images e integracoes operacionais.
- `shared/`: utilitarios compartilhados entre runtime do servidor e app cliente.
- `prisma/`: schema, migrations e configuracao do banco.
- `ops/`: compose, env examples, scripts de deploy, restore, backup e runbooks operacionais.
- `docs/`: documentacao complementar de schema, migracoes, auditorias e remediacoes.

## 2. Arquitetura de Runtime

### Desenvolvimento (`npm run dev`)

- Sobe o servidor Node com watch.
- Porta padrao: `8080`.
- O servidor injeta middleware do Vite em desenvolvimento, entao frontend e API ficam no mesmo host (`http://localhost:8080`).

### Producao (`npm run build` + `npm run start`)

- `npm run build` gera o slice Astro em `dist-astro/` e o frontend legado em `dist/`.
- `npm run start` sobe o servidor em modo `production`.
- Em producao, o servidor exige os artefatos de build do runtime hibrido; sem build, a inicializacao falha.

### Health check

Endpoint:

- `GET /api/health`

Resposta esperada (exemplo):

```json
{
  "ok": true,
  "dataSource": "db",
  "maintenanceMode": false,
  "ts": "2026-02-21T12:34:56.000Z"
}
```

## 3. Pre-requisitos

- Node.js `24.14.x` (pino oficial; ver `.nvmrc` e `.node-version`)
- npm `11.x`
- PostgreSQL acessivel pela `DATABASE_URL`
- Git
- Docker + Docker Compose plugin (opcional para rodar DB local e obrigatorio para stack de producao em container)

Validacao rapida:

```bash
node -v
npm -v
docker -v
docker compose version
```

Portas comuns:

- `8080`: app integrada (backend + frontend)
- `5173`: frontend Vite quando usar `npm run dev:client`
- `5432`: PostgreSQL

## 4. Inicio Rapido (recomendado: 1 comando)

Fluxo oficial para desenvolvimento local com PostgreSQL em Docker:

### Linux/macOS

```bash
git clone https://github.com/NekomataSub/nekomorto.git
cd nekomorto
npm install
npm run setup:dev
```

### Windows (PowerShell)

```powershell
git clone https://github.com/NekomataSub/nekomorto.git
Set-Location nekomorto
npm install
npm run setup:dev
```

No primeiro run, `npm run setup:dev`:

- valida `docker`, `docker compose`, `node` e `npm`
- garante `ops/postgres/.env.staging` (pedindo `POSTGRES_PASSWORD` quando necessario)
- sobe PostgreSQL local e aguarda readiness
- cria `.env` de forma interativa quando ausente (com `DATABASE_URL` local automatica)
- preserva `.env` existente e valida `DATABASE_URL`
- executa `npm run prisma:generate` e `npm run prisma:migrate:deploy`
- inicia `npm run dev` automaticamente

Observacoes:

- Se `.env` nao existir, o primeiro setup exige terminal interativo (TTY).
- Para encerrar a app, use `Ctrl+C`.
- Para reexecutar setup, rode `npm run setup:dev` novamente (idempotente).

URL local padrao:

- `http://localhost:8080`

Validacao padrao:

```bash
npm run api:health:check -- --base=http://localhost:8080 --expect-source=db --expect-maintenance=false
```

Checks de qualidade:

```bash
npm run lint
npm run typecheck
npm run typecheck:ts7-preview
npm run test
npm run test:a11y
```

## 5. Configurar Banco Local com Docker (fluxo manual alternativo)

Se preferir controlar os passos manualmente, use o fluxo abaixo.

Stack de banco local em `ops/postgres/docker-compose.staging.yml`.

### 5.1 Criar arquivo de ambiente do Postgres

Linux/macOS:

```bash
cp ops/postgres/env.staging.example ops/postgres/.env.staging
```

PowerShell:

```powershell
Copy-Item ops/postgres/env.staging.example ops/postgres/.env.staging
```

Edite `ops/postgres/.env.staging` e defina uma senha forte em `POSTGRES_PASSWORD`.

### 5.2 Subir o Postgres local

```bash
docker compose --env-file ops/postgres/.env.staging -f ops/postgres/docker-compose.staging.yml up -d
docker compose --env-file ops/postgres/.env.staging -f ops/postgres/docker-compose.staging.yml ps
```

### 5.3 Ajustar `DATABASE_URL` no `.env` da aplicacao

Exemplo:

```dotenv
DATABASE_URL=postgresql://nekomorto_app:<POSTGRES_PASSWORD>@127.0.0.1:5432/nekomorto
```

### 5.4 Aplicar migracoes e iniciar app

```bash
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
```

Para derrubar o banco local:

```bash
docker compose --env-file ops/postgres/.env.staging -f ops/postgres/docker-compose.staging.yml down
```

## 6. Rodar em Modos Diferentes

### 6.1 Modo integrado (recomendado)

```bash
npm run dev
```

- API + frontend em `http://localhost:8080`.
- Para acesso por tunel/dominio publico, mantenha `VITE_API_BASE` vazio para usar same-origin.
- O HMR do modo integrado usa a mesma origem da pagina. Nao publique nem encaminhe a porta `24678`.
- Para cloudflared, aponte o tunel inteiro para `http://127.0.0.1:8080`.
- O OAuth do Discord e do Google retorna para a mesma origem que iniciou o login nesse modo.
- Os callbacks esperados são `/api/auth/callback/discord` e `/api/auth/callback/google`.
- O login com Google exige uma identity previamente vinculada/autorizada no backend; nao existe cadastro publico nem auto-signup.

### 6.2 Modo separado (backend e frontend em portas diferentes)

Terminal 1:

```bash
npm run dev:server
```

Terminal 2:

```bash
npm run dev:client:local-api
```

Esse comando ja injeta `VITE_API_BASE=http://127.0.0.1:8080` so nesta sessao.
Se preferir manter `npm run dev:client`, exporte a variavel apenas no terminal (sem editar `.env`):

```bash
VITE_API_BASE=http://127.0.0.1:8080 npm run dev:client
```

Frontend:

- `http://localhost:5173`
- O callback do Discord continua sendo processado pelo backend, mas o redirect final volta para a origem que iniciou o login.

### 6.3 Simular producao local

```bash
npm run build
npm run start
```

O `build` de producao agora faz quatro etapas para a superficie publica:

- gera o bundle Astro em `dist-astro/`
- gera o bundle cliente em `dist/`
- roda `node scripts/check-build-chunks.mjs` para validar limites e regressao de chunks
- roda `npm run build:home:guard` para proteger o build da home publica

O pipeline oficial nao usa mais `build:public:ssr` nem `prerender:public`. O `npm run start` sobe `server/index.js` em `NODE_ENV=production` e serve os artefatos gerados por `vite build` e `astro build`.

Depois valide:

```bash
npm run api:smoke -- --base=http://localhost:8080
```

Observacoes importantes para `NODE_ENV=production`:

- `APP_ORIGIN` precisa estar preenchida com origem valida.
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` e `SESSION_SECRET` precisam existir.
- Voce precisa configurar `OWNER_IDS` **ou** `BOOTSTRAP_TOKEN`.

### 6.4 Fluxo diario de desenvolvimento

Fluxo recomendado para quem esta trabalhando no produto no dia a dia:

1. No primeiro clone, rode `npm install` e `npm run setup:dev`.
2. Para o fluxo padrao, trabalhe em `npm run dev` e acesse `http://localhost:8080`.
3. Use `npm run dev:client:local-api` apenas quando precisar isolar o frontend em `5173` consumindo a API local.
4. Antes de abrir PR, rode pelo menos `npm run lint`, `npm run typecheck`, `npm run test` e `npm run test:a11y`.
5. Antes de validar publicacao local em modo producao, rode `npm run build` e `npm run api:smoke -- --base=http://localhost:8080`.

Se estiver trabalhando especificamente na migracao da superficie Astro:

- `npm run astro:check`: valida `src-astro/**`
- `npm run build:astro`: gera apenas o slice Astro

### 6.5 Qualidade, acessibilidade e auditoria

Checks base:

- `npm run lint`: validacao estaticas com Biome.
- `npm run typecheck`: validacao de tipos com TypeScript 6 (`tsc -b`).
- `npm run typecheck:ts7-preview`: smoke check nao bloqueante contra o preview nativo do TypeScript 7.
- `npm run test`: suite principal de testes com Vitest.
- `npm run test:a11y`: gate de acessibilidade usado tambem no deploy de producao.

Quando a mudanca afetar bundle, carregamento inicial ou paginas criticas, use os checks adicionais:

- `npm run build:audit`: build com sourcemaps para analise de bundle e auditoria.
- `npm run lighthouse:home:mobile`: regressao na home publica mobile.
- `npm run lighthouse:projects:mobile` e `npm run lighthouse:projects:desktop`: regressao na listagem de projetos.
- `npm run lighthouse:reader-pages:mobile`: regressao nas paginas de leitura.
- `npm run lighthouse:dashboard:desktop`: regressao no dashboard autenticado.

Use esses comandos quando a alteracao mexer em performance, PWA, carregamento inicial, layout critico ou experiencia de leitura/dashboard.

## 7. Variaveis de Ambiente (guia completo)

Arquivos oficiais desta secao:

- `dev base`: `.env.example`
- `prod compose`: `ops/prod/.env.prod.example`
- `dev deploy`: `ops/dev/.env.dev.example`

Convencoes usadas nas tabelas:

- `bool backend`: aceita `true/false/1/0/yes/no/on/off`
- `bool frontend flexivel`: aceita `true/false/1/0/yes/no/on/off`
- `bool frontend estrito`: somente `true` habilita; qualquer outro valor cai no default
- `CSV`: lista separada por virgula; espacos sao ignorados quando aplicavel
- `URL http(s)` / `origem http(s)`: URL absoluta com schema; `APP_ORIGIN` e `ADMIN_ORIGINS` usam apenas a origem

### 7.1 Runtime e rede

| Variavel | Onde aparece | Obrigatoria quando | Default | Valores/Formato | Descricao |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | `dev base`, `prod compose`, `dev deploy` | sempre | sem fallback seguro; os exemplos definem `development` ou `production` | `development` ou `production` | Controla as regras de runtime. Em `production`, a app exige `APP_ORIGIN`, credenciais Discord e configuracao inicial de owner. |
| `PORT` | `dev base`, `prod compose`, `dev deploy` | nunca | `8080` | inteiro de porta TCP | Porta HTTP da app. |
| `DATABASE_URL` | `dev base`, `prod compose`, `dev deploy` | sempre | nenhum | string de conexao PostgreSQL | Sem ela o servidor nao sobe. |
| `PRISMA_TX_TIMEOUT_MS` | `dev base` | nunca | `30000` | inteiro em ms, clamp `1-600000` | Timeout padrao das transacoes Prisma. |
| `PRISMA_TX_MAX_WAIT_MS` | `dev base` | nunca | `5000` | inteiro em ms, clamp `1-600000` | Espera maxima na fila de transacoes Prisma. |
| `MAINTENANCE_MODE` | `dev base`, `prod compose`, `dev deploy` | nunca | `false` | `bool backend` | Quando ligado, bloqueia mutacoes `POST/PUT/PATCH/DELETE` em `/api`. |
| `STAGING_API_BASE` | `dev base` | nunca | vazio | `URL http(s)` | Base opcional para smoke/health checks durante cutover ou paridade com staging. |
| `APP_ORIGIN` | `dev base`, `prod compose`, `dev deploy` | `production` | em dev, se vazio, o backend usa `http://127.0.0.1:5173` como origem primaria local | `CSV` de origens `http(s)` absolutas | Lista de origens publicas permitidas. A primeira origem valida vira host canonico para links, OG e auth fallback. |
| `ADMIN_ORIGINS` | `prod compose`, `dev deploy` | nunca | vazio | `CSV` de origens `http(s)` absolutas | Origens extras autorizadas para painel/admin. Sao somadas a `APP_ORIGIN`. |
| `VITE_API_BASE` | `dev base` | nunca | vazio | `URL http(s)` | Override opcional da base da API no frontend. Em same-origin, producao e tunel, deixe vazio. |

### 7.2 Auth, sessao e bootstrap

| Variavel | Onde aparece | Obrigatoria quando | Default | Valores/Formato | Descricao |
| --- | --- | --- | --- | --- | --- |
| `DISCORD_CLIENT_ID` | `dev base`, `prod compose`, `dev deploy` | `production` | vazio | string | Client ID do OAuth do Discord. |
| `DISCORD_CLIENT_SECRET` | `dev base`, `prod compose`, `dev deploy` | `production` | vazio | string secreta | Client secret do OAuth do Discord. |
| `SESSION_SECRET` | `dev base`, `prod compose`, `dev deploy` | `production`, exceto quando `SESSION_SECRETS` estiver preenchido | vazio; em dev, se `SESSION_SECRETS` tambem estiver vazio, cai no fallback inseguro `dev-session-secret` | string secreta longa | Segredo principal de sessao HTTP. |
| `BETTER_AUTH_SECRET` | `dev base`, `prod compose`, `dev deploy` | `production` | vazio | string secreta longa e independente | Assina cookies e material criptográfico do Better Auth. Rotacionar invalida estados OAuth/2FA pendentes; preserve o valor anterior durante rollback. |
| `SESSION_SECRETS` | `dev base`, `prod compose`, `dev deploy` | nunca | vazio | `CSV` de secrets, mais novo primeiro | Lista de rotacao de secrets de sessao. Quando preenchida, substitui `SESSION_SECRET` como lista aceita e o primeiro valor vira o ativo. |
| `OWNER_IDS` | `dev base`, `prod compose`, `dev deploy` | `production` quando `BOOTSTRAP_TOKEN` estiver vazio | vazio; em dev existe fallback interno para um owner local do projeto | `CSV` de IDs de usuario do Discord | Owners iniciais carregados no boot. |
| `BOOTSTRAP_TOKEN` | `dev base`, `prod compose`, `dev deploy` | `production` quando `OWNER_IDS` estiver vazio | vazio | string secreta | Token one-shot para `POST /api/bootstrap-owner` criar o primeiro owner. |

Regra de producao:

- Configure `OWNER_IDS` ou `BOOTSTRAP_TOKEN`; pelo menos um dos dois precisa existir.

### 7.3 Frontend e feature flags

| Variavel | Onde aparece | Obrigatoria quando | Default | Valores/Formato | Descricao |
| --- | --- | --- | --- | --- | --- |
| `VITE_PWA_DEV_ENABLED` | `dev base` | nunca | `false` | `bool frontend estrito` | Liga manifest, swap e workbox no dev do Vite. |
| `VITE_DASHBOARD_AUTOSAVE_ENABLED` | `dev base` | nunca | `true` | `bool frontend flexivel` | Habilita autosave do dashboard por padrao. |
| `VITE_DASHBOARD_AUTOSAVE_DEBOUNCE_MS` | `dev base` | nunca | `1200` | inteiro em ms, clamp `300-10000` | Debounce entre edicoes e envio do autosave. |
| `VITE_DASHBOARD_AUTOSAVE_RETRY_MAX` | `dev base` | nunca | `2` | inteiro, clamp `0-5` | Quantidade maxima de retries do autosave. |
| `VITE_DASHBOARD_AUTOSAVE_RETRY_BASE_MS` | `dev base` | nunca | `1500` | inteiro em ms, clamp `300-10000` | Base do backoff entre retries do autosave. |
| `RBAC_V2_ENABLED` | `dev base`, `prod compose`, `dev deploy` | nunca | `false` | `bool backend` | Ativa o fluxo backend do RBAC v2. |
| `RBAC_V2_ACCEPT_LEGACY_STAR` | `dev base`, `prod compose`, `dev deploy` | nunca | `true` | `bool backend` | Mantem compatibilidade com o atalho legado `*` ao migrar para RBAC v2. |
| `VITE_RBAC_V2_ENABLED` | `dev base` | nunca | `false` | `bool frontend flexivel` | Liga o frontend para ler grants do RBAC v2. |

### 7.4 Analytics e comportamento operacional

| Variavel | Onde aparece | Obrigatoria quando | Default | Valores/Formato | Descricao |
| --- | --- | --- | --- | --- | --- |
| `ANALYTICS_IP_SALT` | `dev base`, `prod compose`, `dev deploy` | nunca | vazio; se ficar vazio, o backend cai para `SESSION_SECRET` e depois `dev-analytics-salt` | string | Salt usado para hash de IP nos eventos de analytics. |
| `ANALYTICS_RETENTION_DAYS` | `dev base`, `prod compose`, `dev deploy` | nunca | `90` | inteiro em dias, clamp `7-3650` | Retencao dos eventos brutos de analytics. |
| `ANALYTICS_AGG_RETENTION_DAYS` | `dev base`, `prod compose`, `dev deploy` | nunca | `365` | inteiro em dias, clamp `30-3650` | Retencao dos agregados de analytics. |
| `AUTO_UPLOAD_REORGANIZE_ON_STARTUP` | `dev base`, `prod compose`, `dev deploy` | nunca | `false` | `bool backend` | Executa a reorganizacao automatica de pastas de upload no startup. |
| `PUBLIC_PRERENDER_ENABLED` | `dev base`, `prod compose`, `dev deploy` | nunca | `true` em `production`, `false` fora de `production` | `bool backend` | Liga o middleware de prerender incremental da superficie publica. Quando desligado, todo o trafego publico cai no fluxo dinamico atual do Express. |
| `PUBLIC_PRERENDER_DIR` | `dev base`, `prod compose`, `dev deploy` | nunca | `backups/public-prerender` | path relativo ao repo ou absoluto | Diretório usado para armazenar artefatos HTML prerenderizados e o manifesto publico. |
| `OG_PUBLIC_TARGET_KB` | `dev base` | nunca | `350` | inteiro em KB, faixa valida `150-1024` | Tamanho alvo do primeiro JPEG publico aceitavel para cards OG. Valores fora da faixa voltam ao default. |
| `OG_PUBLIC_JPEG_QUALITIES` | `dev base` | nunca | `84,80,76,72` | `CSV` de inteiros `60-100` | Escada de qualidades JPEG para OG publico. Entradas invalidas sao ignoradas; a lista final fica unica e em ordem decrescente. |

### 7.5 Uploads/storage

O contrato publico de uploads continua sendo `/uploads/...` em todos os modos.
Mesmo com storage externo, a app continua entregando assets via proxy (`UPLOAD_STORAGE_DELIVERY=proxy`), entao frontend, payloads publicos e referencias salvas no banco nao mudam.

Defaults e comportamento base:

- `UPLOAD_VARIANT_AVIF_QUALITY=90` continua sendo o padrao.
- `UPLOAD_STORAGE_DRIVER=local` continua sendo o padrao.
- `UPLOAD_STORAGE_DELIVERY=proxy` continua sendo o padrao desta fase.
- Ao ativar `UPLOAD_STORAGE_DRIVER=s3`, apenas uploads novos passam a usar o provider ativo.
- Uploads antigos continuam em `local` ate sync ou restore explicito.
- `storageProvider` continua sendo detalhe interno; o frontend segue consumindo `/uploads/...`.
- Mudar `UPLOAD_VARIANT_AVIF_QUALITY` so afeta variantes novas ou regeneradas.

| Variavel | Onde aparece | Obrigatoria quando | Default | Valores/Formato | Descricao |
| --- | --- | --- | --- | --- | --- |
| `UPLOAD_VARIANT_AVIF_QUALITY` | `dev base`, `prod compose`, `dev deploy` | nunca | `90` | inteiro `1-100`; entradas invalidas voltam para `90` | Qualidade AVIF global das variantes geradas para uploads. Valores maiores aumentam fidelidade, trafego e armazenamento. So afeta uploads novos ou regenerados/backfill. |
| `UPLOAD_STORAGE_DRIVER` | `dev base` | nunca | `local` | `local` ou `s3` | Provider ativo. Valores desconhecidos caem para `local`. |
| `UPLOAD_STORAGE_DELIVERY` | `dev base` | nunca | `proxy` | `proxy` | Modo de entrega desta fase. Mantenha `proxy` para preservar `/uploads/...`. |
| `UPLOAD_STORAGE_BUCKET` | `dev base` | quando `UPLOAD_STORAGE_DRIVER=s3` | vazio | nome de bucket | Bucket do provider S3-compatible. |
| `UPLOAD_STORAGE_REGION` | `dev base` | quando `UPLOAD_STORAGE_DRIVER=s3` | vazio | string | Regiao do bucket. Em Cloudflare R2, use `auto`. |
| `UPLOAD_STORAGE_ENDPOINT` | `dev base` | depende do provider; normalmente necessario em R2 | vazio | `URL http(s)` | Endpoint customizado do provider S3-compatible. |
| `UPLOAD_STORAGE_ACCESS_KEY_ID` | `dev base` | quando `UPLOAD_STORAGE_DRIVER=s3` | vazio | string | Credencial de acesso do provider. |
| `UPLOAD_STORAGE_SECRET_ACCESS_KEY` | `dev base` | quando `UPLOAD_STORAGE_DRIVER=s3` | vazio | string secreta | Segredo de acesso do provider. |
| `UPLOAD_STORAGE_PREFIX` | `dev base` | nunca | vazio | fragmento de path sem `/` inicial/final | Prefixo interno das object keys no bucket. |
| `UPLOAD_STORAGE_S3_FORCE_PATH_STYLE` | `dev base` | nunca | `false` | `bool backend` | Use `true` somente se o provider exigir path-style. |
| `UPLOAD_STORAGE_PUBLIC_BASE_URL` | `dev base` | nunca | vazio | `URL http(s)` | Reservado para futuros fluxos de entrega publica direta; nao participa do fluxo padrao atual. |

Exemplo com Cloudflare R2:

```dotenv
UPLOAD_STORAGE_DRIVER=s3
UPLOAD_STORAGE_DELIVERY=proxy
UPLOAD_STORAGE_BUCKET=nekomorto-media
UPLOAD_STORAGE_REGION=auto
UPLOAD_STORAGE_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
UPLOAD_STORAGE_ACCESS_KEY_ID=<r2_access_key_id>
UPLOAD_STORAGE_SECRET_ACCESS_KEY=<r2_secret_access_key>
UPLOAD_STORAGE_PREFIX=prod
UPLOAD_STORAGE_S3_FORCE_PATH_STYLE=false
UPLOAD_STORAGE_PUBLIC_BASE_URL=
```

Exemplo com AWS S3:

```dotenv
UPLOAD_STORAGE_DRIVER=s3
UPLOAD_STORAGE_DELIVERY=proxy
UPLOAD_STORAGE_BUCKET=nekomorto-media
UPLOAD_STORAGE_REGION=us-east-1
UPLOAD_STORAGE_ACCESS_KEY_ID=<aws_access_key_id>
UPLOAD_STORAGE_SECRET_ACCESS_KEY=<aws_secret_access_key>
UPLOAD_STORAGE_PREFIX=prod
UPLOAD_STORAGE_S3_FORCE_PATH_STYLE=false
UPLOAD_STORAGE_PUBLIC_BASE_URL=
```

Fora do escopo desta fase:

- signed URLs
- upload direto do browser para bucket
- entrega publica direta por CDN/bucket

### 7.6 Seguranca, MFA, exports, metrics e alerts

| Variavel | Onde aparece | Obrigatoria quando | Default | Valores/Formato | Descricao |
| --- | --- | --- | --- | --- | --- |
| `DATA_ENCRYPTION_KEYS_JSON` | `dev base`, `prod compose`, `dev deploy` | nunca | vazio | JSON no formato `{"activeKeyId":"key-2026-01","keys":{"key-2026-01":"<base64>"}}` | Keyring para criptografia em repouso. Prefira JSON; o parser ainda aceita secret legacy simples como fallback. |
| `SECURITY_RECOVERY_CODE_PEPPER` | `dev base`, `prod compose`, `dev deploy` | recomendado quando MFA estiver em uso | vazio | string secreta | Pepper adicional para proteger recovery codes de MFA. |
| `MFA_ISSUER` | `dev base`, `prod compose` | nunca | `Nekomata` | string | Nome exibido pelos apps autenticadores nos TOTP da plataforma. |
| `TOTP_ICON_URL` | `dev base`, `prod compose` | nunca | vazio | `URL http(s)` | Icone publico opcional para o cadastro TOTP. |
| `MFA_ENROLLMENT_TTL_MS` | `dev base`, `prod compose` | nunca | `600000` | inteiro em ms, clamp `60000-86400000` | TTL da tentativa de enrollment MFA. |
| `ADMIN_EXPORTS_DIR` | `dev base`, `prod compose` | nunca | `backups/admin-exports` | caminho relativo ao repo ou absoluto | Diretorio usado para armazenar exports administrativos temporarios. |
| `ADMIN_EXPORT_TTL_HOURS` | `dev base`, `prod compose` | nunca | `24` | inteiro em horas, clamp `1-168` | Tempo de vida dos arquivos em `ADMIN_EXPORTS_DIR`. |
| `METRICS_ENABLED` | `dev base`, `prod compose`, `dev deploy` | nunca | `false` | `bool backend` | Habilita a exposicao de metrics operacionais. |
| `METRICS_TOKEN` | `dev base`, `prod compose`, `dev deploy` | quando `METRICS_ENABLED=true` | vazio | string secreta | Token exigido para acessar metrics quando elas estiverem habilitadas. |
| `SERVER_LOG_LEVEL` | `dev base`, `prod compose`, `dev deploy` | nunca | `info` | `debug`, `info`, `warn`, `error`, `silent` | Controla a verbosidade dos logs de console do servidor, independentemente de `METRICS_ENABLED`. |
| `SERVER_LOG_REQUEST_SCOPE` | `dev base`, `prod compose`, `dev deploy` | nunca | `api` | `api`, `public`, `all` | Define quais requests saudaveis aparecem no console. `api` registra `/api` e `/auth`; erros `4xx/5xx` sempre entram. |
| `SERVER_LOG_PRETTY` | `dev base`, `prod compose`, `dev deploy` | nunca | `true` em dev, `false` em production | `bool backend` | Usa formato legivel no console quando `true`; quando `false`, emite JSON estruturado. |
| `OPERATIONAL_HEALTH_TOKEN` | `dev base`, `prod compose`, `dev deploy` | quando diagnóstico remoto detalhado for necessário | vazio | string secreta | Token opcional para payload detalhado de `/api/health` e `/api/health/ready` fora de loopback. Sem token, esses endpoints públicos retornam payload sanitizado. |
| `OPS_ALERTS_WEBHOOK_ENABLED` | `dev base`, `prod compose` | nunca | `false` | `bool backend` | Liga os alertas operacionais/webhooks da categoria 6. |
| `OPS_ALERTS_WEBHOOK_PROVIDER` | `dev base`, `prod compose` | quando `OPS_ALERTS_WEBHOOK_ENABLED=true` | `discord` | `discord` | Provider do webhook. Hoje somente `discord` e suportado; valores diferentes fazem o envio ser ignorado. |
| `OPS_ALERTS_WEBHOOK_URL` | `dev base`, `prod compose` | quando `OPS_ALERTS_WEBHOOK_ENABLED=true` | vazio | `URL http(s)` | URL do webhook operacional. |
| `OPS_ALERTS_WEBHOOK_TIMEOUT_MS` | `dev base`, `prod compose` | nunca | `5000` | inteiro em ms, clamp `1000-30000` | Timeout do envio do webhook. |
| `OPS_ALERTS_WEBHOOK_INTERVAL_MS` | `dev base`, `prod compose` | nunca | `60000` | inteiro em ms, clamp `10000-3600000` | Intervalo minimo entre envios recorrentes do webhook. |
| `OPS_ALERTS_DB_LATENCY_WARNING_MS` | `dev base`, `prod compose` | nunca | `1000` | inteiro em ms, clamp `50-60000` | Latencia do banco que passa a gerar warning operacional. |

### 7.7 Deploy/container vars dos exemplos oficiais

| Variavel | Onde aparece | Obrigatoria quando | Default | Valores/Formato | Descricao |
| --- | --- | --- | --- | --- | --- |
| `APP_IMAGE_REPO` | `prod compose`, `dev deploy` | nunca | `ghcr.io/nekomatasub/nekomorto` no compose e no script de deploy | repositorio Docker | Repositorio da imagem da app usada no deploy. |
| `APP_IMAGE_TAG` | `prod compose`, `dev deploy` | nunca | `latest` no compose e no script de deploy | tag Docker | Tag da imagem da app. O padrao de CI costuma usar `sha-<commit>`. |
| `PROXY_PROVIDER` | `prod compose`, `dev deploy` | nunca | `caddy` | `caddy`, `nginx`, `traefik`, `standalone` | Provider do proxy reverso publicado como servico `edge`. Use `standalone` para expor a app diretamente sem proxy reverso. |
| `APP_LISTEN_PORT` | `prod compose` | nunca | `80` | inteiro de porta TCP | Porta publicada no host quando `PROXY_PROVIDER=standalone`. Ignorado nos demais providers. |
| `APP_DOMAIN` | `prod compose`, `dev deploy` | recomendado; o deploy tenta derivar de `APP_ORIGIN` | vazio no env; sem derivacao o deploy falha | dominio sem schema | Dominio canonico publicado pela app e usado no healthcheck externo. |
| `APP_WWW_DOMAIN` | `prod compose`, `dev deploy` | recomendado; o deploy tenta derivar de `APP_ORIGIN` ou prefixar `www.` | vazio no env | dominio sem schema | Dominio `www` redirecionado para `APP_DOMAIN`. |
| `TRAEFIK_ACME_EMAIL` | `prod compose`, `dev deploy` | quando `PROXY_PROVIDER=traefik` | vazio | email valido | Email usado pelo ACME/Let's Encrypt do Traefik. |
| `NGINX_TLS_CERT_PATH` | `prod compose`, `dev deploy` | quando `PROXY_PROVIDER=nginx` | vazio | caminho absoluto no host | Certificado TLS montado no container Nginx. Deve cobrir `APP_DOMAIN` e `APP_WWW_DOMAIN`. |
| `NGINX_TLS_KEY_PATH` | `prod compose`, `dev deploy` | quando `PROXY_PROVIDER=nginx` | vazio | caminho absoluto no host | Chave privada TLS montada no container Nginx. |
| `APP_COMMIT_SHA` | `dev deploy` | nunca | vazio; se `APP_IMAGE_TAG` seguir `sha-<commit>`, o backend tenta inferir o SHA | hash de commit | Metadata opcional de build exposta pela app. |
| `APP_BUILD_TIME` | `dev deploy` | nunca | vazio | timestamp; prefira ISO 8601 UTC | Metadata opcional com o horario do build. |
| `POSTGRES_DB` | `prod compose`, `dev deploy` | quando usar o `docker-compose.prod.yml` oficial | `nekomorto` no compose; o exemplo de dev deploy usa `nekomorto_dev` | nome de banco PostgreSQL | Nome do banco inicial do container Postgres e do healthcheck. |
| `POSTGRES_USER` | `prod compose`, `dev deploy` | quando usar o `docker-compose.prod.yml` oficial | `nekomorto_app` no compose; o exemplo de dev deploy usa `nekomorto_dev` | nome de usuario PostgreSQL | Usuario do container Postgres. |
| `POSTGRES_PASSWORD` | `prod compose`, `dev deploy` | quando usar o `docker-compose.prod.yml` oficial | nenhum | string secreta forte | Senha do container Postgres. O compose falha sem ela. |

### 7.8 Bootstrap de owner (`/api/bootstrap-owner`)

Use apenas quando `OWNER_IDS` estiver vazio e voce tiver definido `BOOTSTRAP_TOKEN`.

Regras:

- Endpoint: `POST /api/bootstrap-owner`
- Exige usuario autenticado.
- Token pode ir no body (`token`) ou no header `x-bootstrap-token`.
- Depois do primeiro owner ser criado, bootstrap deixa de ser necessario.

## 8. Docker em Producao (detalhado)

### 8.1 Arquivos oficiais de producao

- `Dockerfile`
- `docker-compose.prod.yml` (profiles: `caddy`, `nginx`, `traefik`; sem profile = standalone)
- `ops/prod/docker-compose.quickstart.yml`
- `ops/caddy/Caddyfile`
- `ops/nginx/default.conf.template`
- `ops/prod/.env.prod.example`
- `ops/deploy.sh`
- `ops/prod/deploy-prod.sh`
- `ops/prod/quickstart-deploy.sh`
- `.github/workflows/deploy-prod.yml`

### 8.2 Provisionamento inicial do host Ubuntu

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git ufw

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Reinicie a sessao SSH apos adicionar usuario ao grupo `docker`.

### 8.3 Preparar diretorio de deploy

```bash
sudo mkdir -p /srv/nekomorto
sudo chown -R $USER:$USER /srv/nekomorto
git clone <REPO_URL> /srv/nekomorto
cd /srv/nekomorto
cp ops/prod/.env.prod.example .env.prod
```

Edite `.env.prod` com valores reais, incluindo:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `SESSION_SECRET`
- `PROXY_PROVIDER`
- `APP_DOMAIN`
- `APP_WWW_DOMAIN`
- `APP_ORIGIN`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `OWNER_IDS` ou `BOOTSTRAP_TOKEN`
- `APP_IMAGE_REPO` e `APP_IMAGE_TAG` (opcionais; defaults para GHCR + `latest`)
- `TRAEFIK_ACME_EMAIL` quando `PROXY_PROVIDER=traefik`
- `NGINX_TLS_CERT_PATH` e `NGINX_TLS_KEY_PATH` quando `PROXY_PROVIDER=nginx`

Para producao same-origin (recomendado), nao configure `VITE_API_BASE`.
Em ambiente realmente `production`, origens locais so serao aceitas se estiverem permitidas por `APP_ORIGIN`.
No Discord Developer Portal, confirme as redirect URIs:

- `https://<APP_DOMAIN>/api/auth/callback/discord` (obrigatoria)
- `https://<APP_WWW_DOMAIN>/api/auth/callback/discord` (recomendada)

No Google Cloud Console, confirme as redirect URIs autorizadas:

- `https://<APP_DOMAIN>/api/auth/callback/google` (obrigatoria)
- `https://<APP_WWW_DOMAIN>/api/auth/callback/google` (recomendada, se esse host for usado)

Para desenvolvimento local, o valor esperado e:

- `http://127.0.0.1:8080/api/auth/callback/discord`
- `http://127.0.0.1:8080/api/auth/callback/google`

Esses valores precisam bater exatamente com o que estiver cadastrado nos provedores; qualquer diferenca de host, schema ou path causa `redirect_uri_mismatch`.

### 8.4 DNS, dominio e escolha do proxy

Antes do primeiro `up`:

- Garanta que `A/AAAA` do dominio apontam para o IP do host.
- Configure `APP_DOMAIN` e `APP_WWW_DOMAIN` no `.env.prod`.
- Escolha um provider oficial em `PROXY_PROVIDER`:
  - `caddy`: HTTPS automatico com ACME, opcao padrao.
  - `traefik`: HTTPS automatico com ACME; exige `TRAEFIK_ACME_EMAIL`.
  - `nginx`: HTTPS oficial com certificado ja provisionado no host; exige `NGINX_TLS_CERT_PATH` e `NGINX_TLS_KEY_PATH`.
  - `standalone`: sem proxy reverso. A app e exposta diretamente na porta `APP_LISTEN_PORT` (default `80`). TLS deve ser tratado externamente (ex.: Cloudflare Proxy). Nao cria servico `edge`.
- Os arquivos de proxy ja sao parametrizados por env; nao e mais necessario editar o `Caddyfile` para trocar dominio.

### 8.5 Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 8.6 Deploy recomendado

Depois de preencher `.env.prod`, use o script unico. Ele valida secrets/placeholder, `.gitignore`, Docker, Compose, proxy, dominio e compose antes de subir a aplicacao.

```bash
cd /srv/nekomorto
bash ops/deploy.sh prod setup
bash ops/deploy.sh prod deploy
```

Comandos do dia a dia:

| Acao | Comando |
| --- | --- |
| Primeiro deploy | `bash ops/deploy.sh prod setup && bash ops/deploy.sh prod deploy` |
| Redeploy seguro | `bash ops/deploy.sh prod deploy` |
| Status | `bash ops/deploy.sh prod status` |
| Logs | `bash ops/deploy.sh prod logs` |
| Rollback | `bash ops/deploy.sh prod rollback --tag sha-<40hex>` |
| Troubleshooting inicial | `bash ops/prod/deploy-prod.sh --help` |

O modo seguro (`--checks safe`) e o padrao: aplica migrations, valida uploads em modo `fast`, roda healthcheck interno/externo e smoke PWA/publico. Para janelas em que voce precisa reduzir tempo de validacao, use `--checks minimal`; para forcar a validacao mais completa disponivel, use `--checks full`.

Esse fluxo pressupoe que a imagem ja foi publicada no GHCR pelo pipeline de `push` em `main`. Para usar uma imagem especifica:

```bash
bash ops/deploy.sh prod deploy --image-tag sha-<40hex>
```

#### Standalone

Use `PROXY_PROVIDER=standalone` quando o TLS e tratado externamente (ex.: Cloudflare Proxy) ou em rede local/intranet. O script gera um override temporario para publicar `APP_LISTEN_PORT` e remove esse arquivo ao terminar.

```dotenv
PROXY_PROVIDER=standalone
APP_LISTEN_PORT=8080
```

No modo standalone nenhum servico `edge-*` e iniciado. Para producao com Cloudflare, aponte `A/AAAA` para o host, mantenha o proxy ativado e use SSL/TLS `Full`.

Notas operacionais para uploads:

- `fast` e o modo recomendado no deploy por custo e latencia.
- Use `deep` apenas para validacoes manuais mais fortes, especialmente apos sync/restore.
- Se `UPLOAD_STORAGE_DRIVER=s3`, bucket e credenciais precisam existir antes do rollout.
- Durante a fase mista (`local + s3`), preserve `public/uploads` no host ate concluir validacao e decidir pelo rollback ou consolidacao.

### 8.7 Deploy rapido sem clonar o repositorio (quickstart)

Para ambientes onde voce nao precisa clonar o repo inteiro, use o compose auto-contido e o script de quickstart. Esse modo combina postgres + app standalone em um unico diretorio.

```bash
mkdir -p /srv/nekomorto && cd /srv/nekomorto

curl -fsSLO https://raw.githubusercontent.com/NekomataSub/nekomorto/main/ops/prod/docker-compose.quickstart.yml
curl -fsSLO https://raw.githubusercontent.com/NekomataSub/nekomorto/main/ops/prod/quickstart-deploy.sh
curl -fsSL https://raw.githubusercontent.com/NekomataSub/nekomorto/main/ops/prod/.env.prod.example -o .env.prod

# Edite .env.prod com valores reais.
bash quickstart-deploy.sh deploy
```

Comandos quickstart:

| Acao | Comando |
| --- | --- |
| Deploy/redeploy | `bash quickstart-deploy.sh deploy` |
| Status | `bash quickstart-deploy.sh status` |
| Logs | `bash quickstart-deploy.sh logs` |
| Rollback | `bash quickstart-deploy.sh rollback --tag sha-<40hex>` |

Esse modo nao inclui proxy reverso. Para HTTPS em producao, use Cloudflare Proxy ou outro terminador TLS externo.

### 8.8 Fallback manual

O script recomendado chama estes passos por baixo. Use manualmente apenas para diagnostico:

```bash
cd /srv/nekomorto
export PROXY_PROVIDER="${PROXY_PROVIDER:-caddy}"
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER}" up -d postgres
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER}" pull app
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER}" run --rm app npm run prisma:migrate:deploy
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER}" run --rm app npm run uploads:check-integrity -- --mode=fast
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER}" up -d
```

Validacao manual:

```bash
curl -fsS "https://<APP_DOMAIN>/api/health"
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER:-caddy}" ps
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER:-caddy}" logs -f app
```

## 9. Build e Publicacao de Imagem com GitHub Actions

Pacote oficial no GHCR:

- `https://github.com/NekomataSub/nekomorto/pkgs/container/nekomorto`

### 9.1 Producao

Workflow:

- `.github/workflows/deploy-prod.yml`

Triggers:

- `push` para `main`

Permissoes usadas no workflow:

- `contents: read`
- `packages: write`

Fluxo CI:

1. O job `quality` roda `npm run typecheck` e `npm run test:a11y`.
2. Em paralelo, o job `ts7_preview` roda `npm run typecheck:ts7-preview` com `continue-on-error` para observabilidade do preview nativo.
3. O job `build_and_push` publica `ghcr.io/nekomatasub/nekomorto` com tags `latest` e `sha-<commit>`.

Deploy:

- O GitHub Actions nao executa mais deploy remoto por SSH.
- Depois da imagem ser publicada, o deploy continua local/manual via `ops/deploy.sh` ou `ops/prod/deploy-prod.sh`.

Comportamento do deploy local/manual (`ops/prod/deploy-prod.sh`):

1. Quando executado sem `SKIP_GIT_SYNC=true`, sincroniza a branch de deploy no host.
2. Resolve `PROXY_PROVIDER`, dominios e ativa o profile correspondente (`--profile caddy/nginx/traefik`). Para standalone, gera um override temporario com a porta.
3. Sobe `postgres`.
4. Faz `pull` da imagem `app` definida por `APP_IMAGE_REPO:APP_IMAGE_TAG`.
5. Aplica migracoes Prisma.
6. Executa check de integridade de uploads em modo rapido (`npm run uploads:check-integrity -- --mode=fast`).
7. Sobe `app` + `edge-<provider>` via profile (ou apenas `app` em standalone).
8. Valida artefatos criticos de PWA, executa healthcheck interno/externo e smoke de fluxos criticos.

### 9.2 Desenvolvimento / staging publicado

- Nao ha mais workflow de GitHub Actions para dev/staging.
- O deploy de dev continua local/manual via `ops/dev/deploy-dev.sh` ou `ops/deploy.sh dev ...`.
- Se quiser validar uma imagem especifica no ambiente, publique-a primeiro no GHCR a partir de `main` e depois informe a tag `sha-<commit>` ao comando local de deploy.

Importante:

- Rollback/redeploy manual continua disponivel via scripts locais apontando para uma tag `sha-<commit>` ja publicada no GHCR.

## 10. Backup e Restore

Scripts:

- `ops/postgres/backup.sh`
- `ops/postgres/restore.sh`

Documentacao complementar:

- `ops/postgres/README.md`

### 10.1 Backup (producao com override de compose/env)

```bash
cd /srv/nekomorto
COMPOSE_FILE=/srv/nekomorto/docker-compose.prod.yml \
ENV_FILE=/srv/nekomorto/.env.prod \
./ops/postgres/backup.sh
```

### 10.2 Restore (producao com override de compose/env)

```bash
cd /srv/nekomorto
COMPOSE_FILE=/srv/nekomorto/docker-compose.prod.yml \
ENV_FILE=/srv/nekomorto/.env.prod \
./ops/postgres/restore.sh /path/to/backup.sql.gz
```

### 10.3 Snapshot da aplicacao (DB datasets + uploads)

Script adicional:

```bash
npm run db:backup
```

Esse comando gera snapshot em `backups/` usando a `DATABASE_URL` atual.

### 10.4 Restore de uploads para ambiente local

Use quando `public/uploads` estiver vazio ou faltando arquivos.

Export no host de producao (exemplo com volume Docker):

```bash
docker run --rm \
  -v nekomorto-uploads-prod-data:/from \
  -v "$(pwd)":/to \
  alpine sh -c "cd /from && tar -czf /to/uploads-prod-snapshot.tgz ."
```

Copie o arquivo para sua maquina local:

```bash
scp <user>@<host>:/srv/nekomorto/uploads-prod-snapshot.tgz .
```

Restaure em `public/uploads`:

```bash
mkdir -p public/uploads
tar -xzf uploads-prod-snapshot.tgz -C public/uploads
```

Valide com o check de integridade:

```bash
node --env-file=.env scripts/check-upload-integrity.mjs
```

### 10.5 Migracao e rollback entre local e object storage

Fluxo recomendado para adotar storage externo sem mudar URLs publicas:

1. Habilite `UPLOAD_STORAGE_DRIVER=s3` apenas para uploads novos.
2. Opcionalmente sincronize uploads legados para o bucket.
3. Valide com check de integridade.
4. Se precisar voltar, restaure os arquivos para `public/uploads`.
5. So depois volte `UPLOAD_STORAGE_DRIVER=local`.

Sync para object storage:

```bash
npm run uploads:sync-to-object-storage -- --dry-run
npm run uploads:sync-to-object-storage -- --apply
```

Restore do object storage para `public/uploads`:

```bash
npm run uploads:restore-from-object-storage -- --dry-run
npm run uploads:restore-from-object-storage -- --apply
```

Filtros suportados:

- `--folder <pasta>`
- `--upload-id <id>`

Exemplos:

```bash
npm run uploads:sync-to-object-storage -- --apply --folder=posts
npm run uploads:restore-from-object-storage -- --apply --upload-id=<upload-id>
```

Validacao recomendada:

- Deploy e rotina normal: `npm run uploads:check-integrity -- --mode=fast`
- Verificacao manual mais forte apos sync/restore: `npm run uploads:check-integrity -- --mode=deep`

## 11. Operacao de Manutencao

### 11.1 Entrar em manutencao

1. Edite `.env.prod` e defina:

```dotenv
MAINTENANCE_MODE=true
```

2. Reinicie somente a app:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml -f "docker-compose.prod.${PROXY_PROVIDER:-caddy}.yml" up -d app
```

3. Valide:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml -f "docker-compose.prod.${PROXY_PROVIDER:-caddy}.yml" run --rm app node scripts/check-health.mjs --base=http://app:8080 --expect-source=db --expect-maintenance=true
```

### 11.2 Sair de manutencao

1. Volte para:

```dotenv
MAINTENANCE_MODE=false
```

2. Reinicie app:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml -f "docker-compose.prod.${PROXY_PROVIDER:-caddy}.yml" up -d app
```

3. Valide:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml -f "docker-compose.prod.${PROXY_PROVIDER:-caddy}.yml" run --rm app node scripts/check-health.mjs --base=http://app:8080 --expect-source=db --expect-maintenance=false
```

## 12. Troubleshooting

### Erro: `EADDRINUSE: address already in use :::8080`

Causa: porta `8080` ocupada.

Correcao:

- Pare o processo que esta usando a porta, ou
- Altere `PORT` no `.env`.

Linux/macOS:

```bash
lsof -i :8080
kill -9 <PID>
```

PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 8080 | Select-Object LocalAddress,LocalPort,OwningProcess,State
Stop-Process -Id <PID> -Force
```

### Erro: `The requested module '@prisma/client' does not provide an export named 'PrismaClient'`

Causa: client do Prisma nao gerado (ausencia de `node_modules/.prisma/client`).

Correcao:

```bash
npm run prisma:generate
```

### Erro: `DATABASE_URL is required`

Causa: variavel obrigatoria nao configurada.

Correcao:

1. Defina `DATABASE_URL` no `.env` (ou `.env.prod`).
2. Aponte para Postgres acessivel.
3. Rode migracoes:

```bash
npm run prisma:migrate:deploy
```

### Erro: `APP_ORIGIN is required in production and must contain at least one valid origin.`

Causa: app em modo producao sem `APP_ORIGIN`.

Correcao:

```dotenv
APP_ORIGIN=https://seu-dominio.com,https://www.seu-dominio.com
```

### Erro: `Missing production build at .../dist/index.html. Run "npm run build" before "npm run start".`

Causa: `npm run start` executado sem build de frontend.

Correcao:

```bash
npm run build
npm run start
```

### Erros de tabela/migracao Prisma (ex.: tabela `posts` nao existe)

Causa: banco sem schema atualizado.

Correcao:

```bash
npm run prisma:migrate:deploy
npx prisma migrate status
```

### Erro: `Missing OWNER_IDS or BOOTSTRAP_TOKEN in env.`

Causa: producao sem owner inicial configurado.

Correcao:

- Defina `OWNER_IDS` com IDs Discord existentes, ou
- Defina `BOOTSTRAP_TOKEN` e use `POST /api/bootstrap-owner` apos login.

### Erro: `Missing DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, or SESSION_SECRET in env.`

Causa: variaveis obrigatorias de producao ausentes.

Correcao:

Preencha no `.env.prod`:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `SESSION_SECRET`

### Erro: login volta para `/login` e `GET /api/me` retorna `401`

Causa comum:

- `VITE_API_BASE` aponta para `http://localhost:8080` enquanto o acesso ocorre por dominio publico (`https://...`).
- Cookie de sessao antigo/invalido no navegador.

Correcao:

1. Em modo integrado/tunel, deixe no `.env`:

```dotenv
VITE_API_BASE=
```

2. Reinicie app e tunel.
3. Limpe cookies do dominio publico e de `localhost`.
4. Inicie o login pela URL publica (ex.: `https://dev.nekomata.moe/login`).
5. Verifique no DevTools que as chamadas usam `https://<mesmo-dominio>/api/...` (nao `http://localhost:8080/api/...`).
6. Verifique no DevTools que o websocket do Vite usa o mesmo host da pagina e nao `:24678`.

### Fluxo com cloudflared no modo integrado

Checklist:

1. Rode `npm run dev`.
2. Mantenha `VITE_API_BASE=` vazio.
3. Configure o cloudflared para encaminhar `https://dev.nekomata.moe` para `http://127.0.0.1:8080`.
4. Abra a app em `https://dev.nekomata.moe`.
5. Confirme no DevTools:
   - `window.location.origin` e a origem publica esperada
   - `/api/contracts/v1.json` responde na mesma origem
   - o websocket HMR usa o mesmo host da pagina

Troubleshooting:

- Se `localhost` ainda mostrar um host publico no HMR, confirme que a aba realmente esta carregando `http://localhost:8080` e que o request de `@vite/client` veio da instancia local.
- Se o contrato da API responder com suporte EPUB mas `POST /api/projects/epub/import` der `404`, o tunel/proxy esta apontando para outra instancia.

Diagnostico em producao:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml -f "docker-compose.prod.${PROXY_PROVIDER:-caddy}.yml" logs -f app edge
```

Procure eventos `auth.login.failed` com codigos `state_mismatch`, `token_exchange_failed` ou `unauthorized`.

Para verificar se sessoes Better Auth estao sendo persistidas:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml -f "docker-compose.prod.${PROXY_PROVIDER:-caddy}.yml" exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select count(*) as total_sessions from auth_sessions;"
```

### Erro: imagens quebradas em `/uploads` (home, projetos, posts, footer)

Causa comum:

- `public/uploads` ausente/incompleto no ambiente atual.

Correcao:

1. Restaure os arquivos de uploads a partir de backup/snapshot valido.
2. Execute o check:

```bash
npm run uploads:check-integrity
```

3. Se o comando falhar, repita a restauracao ate eliminar `missing_source_file` e `missing_upload_file_for_inventory`.

### Erro: `storage_provider_not_configured` ou falha ao iniciar com `UPLOAD_STORAGE_DRIVER=s3`

Causa comum:

- bucket, regiao ou credenciais nao configurados
- `UPLOAD_STORAGE_ENDPOINT` ausente em providers que exigem endpoint customizado (ex.: R2)

Correcao:

1. Confirme no `.env` ou `.env.prod`:
   - `UPLOAD_STORAGE_BUCKET`
   - `UPLOAD_STORAGE_REGION`
   - `UPLOAD_STORAGE_ACCESS_KEY_ID`
   - `UPLOAD_STORAGE_SECRET_ACCESS_KEY`
2. Se estiver usando R2, defina `UPLOAD_STORAGE_ENDPOINT`.
3. Se nao quiser usar bucket agora, volte para:

```dotenv
UPLOAD_STORAGE_DRIVER=local
UPLOAD_STORAGE_DELIVERY=proxy
```

### Erro: check em modo `deep` acusa assets remotos ausentes

Causa comum:

- o upload foi marcado como remoto, mas original ou variantes nao existem mais no bucket
- sync parcial ou rollback incompleto

Correcao:

1. Rode novamente o sync ou restore apropriado.
2. Revalide com:

```bash
npm run uploads:check-integrity -- --mode=deep
```

3. Nao volte `UPLOAD_STORAGE_DRIVER=local` enquanto os arquivos ainda nao tiverem sido restaurados para `public/uploads`.

### Erro: rollback para `local` concluido no `.env`, mas arquivos continuam faltando

Causa comum:

- `UPLOAD_STORAGE_DRIVER=local` foi reativado antes do restore do object storage para `public/uploads`

Correcao:

1. Restaure primeiro os arquivos:

```bash
npm run uploads:restore-from-object-storage -- --apply
```

2. Valide em modo forte:

```bash
npm run uploads:check-integrity -- --mode=deep
```

3. So depois mantenha `UPLOAD_STORAGE_DRIVER=local`.

### Diferenca pratica entre `fast` e `deep` no check de integridade

- `fast`: recomendado para deploy e rotina. Valida referencias, metadata e arquivos locais sem fazer verificacao remota em massa.
- `deep`: recomendado para auditoria manual, pos-sync e pos-restore. Tambem faz verificacao remota dos assets em storage externo.

## 13. Referencia Rapida de Comandos

Setup local rapido:

```bash
npm install
npm run setup:dev
```

Setup local manual (alternativa):

```bash
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
```

Health e smoke:

```bash
npm run api:health:check -- --base=http://localhost:8080 --expect-source=db --expect-maintenance=false
npm run api:smoke -- --base=http://localhost:8080
```

Qualidade:

```bash
npm run lint
npm run typecheck
npm run typecheck:ts7-preview
npm run test
npm run test:a11y
npm run build:audit
npm run lighthouse:home:mobile
npm run lighthouse:dashboard:desktop
npm run uploads:check-integrity
npm run uploads:check-integrity -- --mode=fast
npm run uploads:check-integrity -- --mode=deep
npm run uploads:sync-to-object-storage -- --dry-run
npm run uploads:sync-to-object-storage -- --apply
npm run uploads:restore-from-object-storage -- --dry-run
npm run uploads:restore-from-object-storage -- --apply
```

Producao com proxy (ordem):

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER:-caddy}" up -d postgres
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER:-caddy}" pull app
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER:-caddy}" run --rm app npm run prisma:migrate:deploy
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER:-caddy}" run --rm app npm run uploads:check-integrity -- --mode=fast
docker compose --env-file .env.prod -f docker-compose.prod.yml --profile "${PROXY_PROVIDER:-caddy}" up -d
```

Producao standalone (sem proxy):

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d postgres
docker compose --env-file .env.prod -f docker-compose.prod.yml pull app
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm app npm run prisma:migrate:deploy
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm app npm run uploads:check-integrity -- --mode=fast
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d app
```

Backup e restore (producao):

```bash
COMPOSE_FILE=/srv/nekomorto/docker-compose.prod.yml ENV_FILE=/srv/nekomorto/.env.prod ./ops/postgres/backup.sh
COMPOSE_FILE=/srv/nekomorto/docker-compose.prod.yml ENV_FILE=/srv/nekomorto/.env.prod ./ops/postgres/restore.sh /path/backup.sql.gz
```

## 14. Documentacao Complementar

Orientacao para contribuidores e agentes:

- `AGENTS.md`
- `CODE_STYLE.md`
- `CONTRIBUTING.md`
- `SECURITY.md`

Arquitetura e dados:

- `docs/SCHEMA.md`
- `docs/DB_MIGRATION_RUNBOOK.md`
- `docs/BETTER_AUTH_CUTOVER.md`
- `docs/astro-migration-architecture.md`
- `docs/astro-migration-roadmap.md`
- `ops/postgres/README.md`

Qualidade, acessibilidade e auditoria:

- `docs/wcag-2.2-aa-audit-matrix.md`
- `docs/lighthouse-home-mobile.md`
- `docs/lighthouse-dashboard-desktop.md`

Operacao, staging e restore:

- `ops/dev/restore-dev-runbook.md`
- `ops/staging/parity-checklist.md`
- `docs/uploads-integrity-remediation-2026-03-05.md`

Incidentes e resposta operacional:

- `ops/runbooks/incidente-geral.md`
- `ops/runbooks/comprometimento-conta-admin.md`
- `ops/runbooks/post-mortem-template.md`
