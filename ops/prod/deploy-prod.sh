#!/usr/bin/env bash
set -euo pipefail

COMMAND="deploy"
DEPLOY_PATH="${DEPLOY_PATH:-/srv/nekomorto}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
ENV_FILE="${ENV_FILE:-.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
HEALTHCHECK_BASE_URL="${HEALTHCHECK_BASE_URL:-}"
EXPECTED_MAINTENANCE="${EXPECTED_MAINTENANCE:-false}"
APP_IMAGE_REPO="${APP_IMAGE_REPO:-}"
APP_IMAGE_TAG="${APP_IMAGE_TAG:-}"
RUN_CATEGORY6_SMOKE="${RUN_CATEGORY6_SMOKE:-true}"
PWA_SMOKE_EXPECT_PROD_HTML="${PWA_SMOKE_EXPECT_PROD_HTML:-true}"
PUBLIC_MEDIA_SMOKE_ENABLED="${PUBLIC_MEDIA_SMOKE_ENABLED:-true}"
SKIP_GIT_SYNC="${SKIP_GIT_SYNC:-false}"
DEPLOY_CHECKS="${DEPLOY_CHECKS:-safe}"
YES="${YES:-false}"

usage() {
  cat <<'EOF'
Usage:
  bash ops/prod/deploy-prod.sh [setup|deploy|status|logs|rollback] [flags]

Commands:
  setup      Validate host prerequisites, env, proxy/domain config and compose.
  deploy     Sync repo when enabled, pull image, migrate, start services and check health.
  status     Show configured image, compose services and health.
  logs       Follow app/edge logs.
  rollback   Redeploy a published image tag. Requires --tag or --image-tag.

Flags:
  --deploy-path <path>      Deployment directory. Default: /srv/nekomorto
  --env-file <file>         Env file relative to deploy path. Default: .env.prod
  --compose-file <file>     Compose file relative to deploy path. Default: docker-compose.prod.yml
  --branch <branch>         Git branch to sync. Default: main
  --image-repo <repo>       App image repository.
  --image-tag <tag>         App image tag. Use sha-<40hex> for rollbacks.
  --tag <tag>               Alias for --image-tag.
  --checks <safe|full|minimal>
  --checks=<safe|full|minimal>
  --skip-git-sync           Do not fetch/reset repository before deploy.
  --yes                     Reserved for non-interactive confirmations.
  -h, --help                Show this help.

Existing environment variables remain supported.
EOF
}

fail() {
  local problem="$1"
  local fix="${2:-}"
  local command="${3:-}"

  {
    echo "[deploy] Problema: ${problem}"
    if [[ -n "${fix}" ]]; then
      echo "[deploy] Como corrigir: ${fix}"
    fi
    if [[ -n "${command}" ]]; then
      echo "[deploy] Comando sugerido: ${command}"
    fi
  } >&2
  exit 1
}

log() {
  echo "[deploy] $*"
}

parse_args() {
  if [[ $# -gt 0 ]]; then
    case "$1" in
      setup|deploy|status|logs|rollback)
        COMMAND="$1"
        shift
        ;;
    esac
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --deploy-path)
        DEPLOY_PATH="${2:-}"
        shift 2
        ;;
      --deploy-path=*)
        DEPLOY_PATH="${1#*=}"
        shift
        ;;
      --env-file)
        ENV_FILE="${2:-}"
        shift 2
        ;;
      --env-file=*)
        ENV_FILE="${1#*=}"
        shift
        ;;
      --compose-file)
        COMPOSE_FILE="${2:-}"
        shift 2
        ;;
      --compose-file=*)
        COMPOSE_FILE="${1#*=}"
        shift
        ;;
      --branch)
        DEPLOY_BRANCH="${2:-}"
        shift 2
        ;;
      --branch=*)
        DEPLOY_BRANCH="${1#*=}"
        shift
        ;;
      --image-repo)
        APP_IMAGE_REPO="${2:-}"
        shift 2
        ;;
      --image-repo=*)
        APP_IMAGE_REPO="${1#*=}"
        shift
        ;;
      --image-tag|--tag)
        APP_IMAGE_TAG="${2:-}"
        shift 2
        ;;
      --image-tag=*|--tag=*)
        APP_IMAGE_TAG="${1#*=}"
        shift
        ;;
      --checks)
        DEPLOY_CHECKS="${2:-}"
        shift 2
        ;;
      --checks=*)
        DEPLOY_CHECKS="${1#*=}"
        shift
        ;;
      --skip-git-sync)
        SKIP_GIT_SYNC="true"
        shift
        ;;
      --yes)
        YES="true"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "Argumento desconhecido: $1" "Use --help para ver os comandos aceitos."
        ;;
    esac
  done
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

strip_wrapping_quotes() {
  local value="$1"
  if [[ "${value}" =~ ^\".*\"$ || "${value}" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "${value}"
}

read_env_value() {
  local key="$1"
  local file_path="$2"
  local line
  local value=""

  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line%$'\r'}"
    line="$(trim "${line}")"
    if [[ -z "${line}" || "${line}" == \#* ]]; then
      continue
    fi
    if [[ "${line}" != "${key}"=* ]]; then
      continue
    fi
    value="${line#*=}"
  done < "${file_path}"

  strip_wrapping_quotes "$(trim "${value}")"
}

normalize_domain_candidate() {
  local value
  value="$(strip_wrapping_quotes "$(trim "$1")")"
  if [[ -z "${value}" ]]; then
    return 0
  fi
  value="${value#http://}"
  value="${value#https://}"
  value="${value%%/*}"
  value="${value%%\?*}"
  value="${value%%#*}"
  value="${value%%:*}"
  value="${value#.}"
  value="${value%.}"
  printf '%s' "${value,,}"
}

origin_host_by_index() {
  local index="$1"
  local raw_origins="$2"
  local -a origins=()
  IFS=',' read -r -a origins <<< "${raw_origins}"
  normalize_domain_candidate "${origins[${index}]:-}"
}

is_placeholder_value() {
  local value
  value="$(strip_wrapping_quotes "$(trim "${1:-}")")"
  local lowered="${value,,}"

  [[ -z "${value}" ]] && return 0
  [[ "${lowered}" == change_me* ]] && return 0
  [[ "${lowered}" == *"change_me"* ]] && return 0
  [[ "${lowered}" == *"replace_with"* ]] && return 0
  [[ "${lowered}" == *"<"*">"* ]] && return 0
  [[ "${lowered}" == "example.com" || "${lowered}" == "www.example.com" ]] && return 0
  [[ "${lowered}" == *"example.com"* ]] && return 0

  return 1
}

require_command() {
  local name="$1"
  local fix="$2"
  command -v "${name}" >/dev/null 2>&1 || fail "${name} não está instalado ou não está no PATH." "${fix}"
}

require_non_empty() {
  local name="$1"
  local value="$2"
  local message="$3"
  if [[ -n "${value}" ]]; then
    return 0
  fi
  fail "${name} ${message}" "Preencha ${name} em ${ENV_FILE} ou passe a flag correspondente."
}

require_file() {
  local path="$1"
  local description="$2"
  if [[ -f "${path}" ]]; then
    return 0
  fi
  fail "Arquivo ausente para ${description}: ${path}" "Confirme o caminho no host e atualize ${ENV_FILE}."
}

validate_image_tag_for_rollback() {
  if [[ "${APP_IMAGE_TAG}" =~ ^sha-[0-9a-f]{40}$ ]]; then
    return 0
  fi
  fail "Rollback exige uma tag imutável sha-<40hex>; recebido: ${APP_IMAGE_TAG}" \
    "Informe uma imagem já publicada no GHCR." \
    "bash ops/deploy.sh prod rollback --tag sha-0000000000000000000000000000000000000000"
}

check_gitignore_env_rules() {
  if [[ ! -f ".gitignore" ]]; then
    fail ".gitignore não encontrado no deploy path." "Mantenha .env e .env.* fora do Git antes de criar secrets."
  fi

  git check-ignore -q .env || fail ".env não está ignorado pelo Git." \
    "Adicione .env ao .gitignore antes de criar arquivos com secrets."

  git check-ignore -q .env.prod || fail ".env.prod não está ignorado pelo Git." \
    "A regra .env.* deve ignorar .env.prod. Preserve apenas exemplos versionados."
}

validate_env_placeholders() {
  local -a required=(
    NODE_ENV
    DATABASE_URL
    POSTGRES_PASSWORD
    SESSION_SECRET
    BETTER_AUTH_SECRET
    APP_ORIGIN
    DISCORD_CLIENT_ID
    DISCORD_CLIENT_SECRET
    GOOGLE_CLIENT_ID
    GOOGLE_CLIENT_SECRET
  )

  local missing_owner
  missing_owner="false"
  local owner_ids bootstrap_token
  owner_ids="$(read_env_value OWNER_IDS "${ENV_FILE}")"
  bootstrap_token="$(read_env_value BOOTSTRAP_TOKEN "${ENV_FILE}")"

  for key in "${required[@]}"; do
    local value
    value="$(read_env_value "${key}" "${ENV_FILE}")"
    if is_placeholder_value "${value}"; then
      fail "${ENV_FILE} contem valor ausente ou placeholder em ${key}." \
        "Troque os placeholders por valores reais no servidor. Nao versione esse arquivo."
    fi
  done

  if is_placeholder_value "${owner_ids}" && is_placeholder_value "${bootstrap_token}"; then
    missing_owner="true"
  fi

  if [[ "${missing_owner}" == "true" ]]; then
    fail "${ENV_FILE} precisa de OWNER_IDS ou BOOTSTRAP_TOKEN real." \
      "Defina owners iniciais por Discord ID ou um token one-shot de bootstrap."
  fi

  local postgres_user postgres_db database_url
  postgres_user="$(read_env_value POSTGRES_USER "${ENV_FILE}")"
  postgres_db="$(read_env_value POSTGRES_DB "${ENV_FILE}")"
  database_url="$(read_env_value DATABASE_URL "${ENV_FILE}")"
  postgres_user="${postgres_user:-nekomorto_app}"
  postgres_db="${postgres_db:-nekomorto}"

  if [[ "${database_url}" != *"@postgres:"* && "${database_url}" != *"@postgres/"* ]]; then
    fail "DATABASE_URL não aponta para o servico interno postgres." \
      "Use o hostname postgres dentro do Docker Compose." \
      "DATABASE_URL=postgresql://${postgres_user}:<senha>@postgres:5432/${postgres_db}"
  fi

  if [[ "${database_url}" != *"${postgres_user}"* || "${database_url}" != *"/${postgres_db}"* ]]; then
    fail "DATABASE_URL parece inconsistente com POSTGRES_USER/POSTGRES_DB." \
      "Mantenha usuario e banco iguais aos valores usados pelo container Postgres."
  fi
}

resolve_config() {
  APP_ORIGIN_ENV="$(read_env_value APP_ORIGIN "${ENV_FILE}")"
  PRIMARY_ORIGIN_HOST="$(origin_host_by_index 0 "${APP_ORIGIN_ENV}")"
  SECONDARY_ORIGIN_HOST="$(origin_host_by_index 1 "${APP_ORIGIN_ENV}")"

  PROXY_PROVIDER_RAW="${PROXY_PROVIDER:-$(read_env_value PROXY_PROVIDER "${ENV_FILE}")}"
  PROXY_PROVIDER="$(trim "${PROXY_PROVIDER_RAW,,}")"
  if [[ -z "${PROXY_PROVIDER}" ]]; then
    PROXY_PROVIDER="caddy"
  fi

  APP_DOMAIN_RAW="${APP_DOMAIN:-$(read_env_value APP_DOMAIN "${ENV_FILE}")}"
  APP_DOMAIN="$(normalize_domain_candidate "${APP_DOMAIN_RAW}")"
  if [[ -z "${APP_DOMAIN}" ]]; then
    if [[ -n "${PRIMARY_ORIGIN_HOST}" && "${PRIMARY_ORIGIN_HOST}" == www.* && -n "${SECONDARY_ORIGIN_HOST}" ]]; then
      APP_DOMAIN="${SECONDARY_ORIGIN_HOST}"
    elif [[ -n "${PRIMARY_ORIGIN_HOST}" ]]; then
      APP_DOMAIN="${PRIMARY_ORIGIN_HOST}"
    else
      APP_DOMAIN="$(normalize_domain_candidate "${HEALTHCHECK_BASE_URL}")"
    fi
  fi

  APP_WWW_DOMAIN_RAW="${APP_WWW_DOMAIN:-$(read_env_value APP_WWW_DOMAIN "${ENV_FILE}")}"
  APP_WWW_DOMAIN="$(normalize_domain_candidate "${APP_WWW_DOMAIN_RAW}")"
  if [[ -z "${APP_WWW_DOMAIN}" && "${APP_DOMAIN}" == www.* ]]; then
    APP_WWW_DOMAIN="${APP_DOMAIN}"
    APP_DOMAIN="${APP_DOMAIN#www.}"
  fi
  if [[ -z "${APP_WWW_DOMAIN}" ]]; then
    if [[ -n "${SECONDARY_ORIGIN_HOST}" && "${SECONDARY_ORIGIN_HOST}" != "${APP_DOMAIN}" ]]; then
      APP_WWW_DOMAIN="${SECONDARY_ORIGIN_HOST}"
    elif [[ -n "${PRIMARY_ORIGIN_HOST}" && "${PRIMARY_ORIGIN_HOST}" == www.* && "${PRIMARY_ORIGIN_HOST#www.}" == "${APP_DOMAIN}" ]]; then
      APP_WWW_DOMAIN="${PRIMARY_ORIGIN_HOST}"
    elif [[ -n "${APP_DOMAIN}" && "${APP_DOMAIN}" != www.* ]]; then
      APP_WWW_DOMAIN="www.${APP_DOMAIN}"
    fi
  fi

  TRAEFIK_ACME_EMAIL="${TRAEFIK_ACME_EMAIL:-$(read_env_value TRAEFIK_ACME_EMAIL "${ENV_FILE}")}"
  TRAEFIK_ACME_EMAIL="$(trim "${TRAEFIK_ACME_EMAIL}")"
  NGINX_TLS_CERT_PATH="${NGINX_TLS_CERT_PATH:-$(read_env_value NGINX_TLS_CERT_PATH "${ENV_FILE}")}"
  NGINX_TLS_CERT_PATH="$(trim "${NGINX_TLS_CERT_PATH}")"
  NGINX_TLS_KEY_PATH="${NGINX_TLS_KEY_PATH:-$(read_env_value NGINX_TLS_KEY_PATH "${ENV_FILE}")}"
  NGINX_TLS_KEY_PATH="$(trim "${NGINX_TLS_KEY_PATH}")"
  HEALTHCHECK_BASE_URL="$(strip_wrapping_quotes "$(trim "${HEALTHCHECK_BASE_URL}")")"

  APP_LISTEN_PORT="${APP_LISTEN_PORT:-$(read_env_value APP_LISTEN_PORT "${ENV_FILE}")}"
  APP_LISTEN_PORT="$(trim "${APP_LISTEN_PORT}")"
  if [[ -z "${APP_LISTEN_PORT}" ]]; then
    APP_LISTEN_PORT="80"
  fi

  if [[ -z "${HEALTHCHECK_BASE_URL}" && -n "${APP_DOMAIN}" ]]; then
    if [[ "${PROXY_PROVIDER}" == "standalone" ]]; then
      HEALTHCHECK_BASE_URL="http://${APP_DOMAIN}"
    else
      HEALTHCHECK_BASE_URL="https://${APP_DOMAIN}"
    fi
  fi
  HEALTHCHECK_BASE_URL="${HEALTHCHECK_BASE_URL%/}"
}

validate_provider() {
  COMPOSE_PROFILE=""
  case "${PROXY_PROVIDER}" in
    caddy)
      require_non_empty "APP_DOMAIN" "${APP_DOMAIN}" "e obrigatorio para PROXY_PROVIDER=caddy."
      require_non_empty "APP_WWW_DOMAIN" "${APP_WWW_DOMAIN}" "e obrigatorio para PROXY_PROVIDER=caddy."
      COMPOSE_PROFILE="caddy"
      ;;
    nginx)
      require_non_empty "APP_DOMAIN" "${APP_DOMAIN}" "e obrigatorio para PROXY_PROVIDER=nginx."
      require_non_empty "APP_WWW_DOMAIN" "${APP_WWW_DOMAIN}" "e obrigatorio para PROXY_PROVIDER=nginx."
      require_non_empty "NGINX_TLS_CERT_PATH" "${NGINX_TLS_CERT_PATH}" "e obrigatorio para PROXY_PROVIDER=nginx."
      require_non_empty "NGINX_TLS_KEY_PATH" "${NGINX_TLS_KEY_PATH}" "e obrigatorio para PROXY_PROVIDER=nginx."
      require_file "${NGINX_TLS_CERT_PATH}" "certificado nginx"
      require_file "${NGINX_TLS_KEY_PATH}" "chave privada nginx"
      COMPOSE_PROFILE="nginx"
      ;;
    traefik)
      require_non_empty "APP_DOMAIN" "${APP_DOMAIN}" "e obrigatorio para PROXY_PROVIDER=traefik."
      require_non_empty "APP_WWW_DOMAIN" "${APP_WWW_DOMAIN}" "e obrigatorio para PROXY_PROVIDER=traefik."
      require_non_empty "TRAEFIK_ACME_EMAIL" "${TRAEFIK_ACME_EMAIL}" "e obrigatorio para PROXY_PROVIDER=traefik."
      COMPOSE_PROFILE="traefik"
      ;;
    standalone)
      log "Standalone mode: no reverse proxy. TLS must be handled externally."
      COMPOSE_PROFILE=""
      ;;
    *)
      fail "PROXY_PROVIDER invalido: ${PROXY_PROVIDER}" \
        "Use caddy, nginx, traefik ou standalone."
      ;;
  esac

  if [[ -n "${COMPOSE_PROFILE}" && "${APP_DOMAIN}" == "${APP_WWW_DOMAIN}" ]]; then
    fail "APP_DOMAIN e APP_WWW_DOMAIN precisam ser diferentes." \
      "Use o dominio canonico em APP_DOMAIN e o dominio www em APP_WWW_DOMAIN."
  fi

  require_non_empty "HEALTHCHECK_BASE_URL" "${HEALTHCHECK_BASE_URL}" \
    "nao pode ser derivado. Configure APP_DOMAIN, APP_ORIGIN ou HEALTHCHECK_BASE_URL."
}

validate_check_mode() {
  case "${DEPLOY_CHECKS}" in
    safe|full|minimal)
      ;;
    *)
      fail "Valor invalido para --checks: ${DEPLOY_CHECKS}" "Use safe, full ou minimal."
      ;;
  esac
}

STANDALONE_OVERRIDE=""
cleanup() {
  if [[ -n "${STANDALONE_OVERRIDE}" && -f "${STANDALONE_OVERRIDE}" ]]; then
    rm -f "${STANDALONE_OVERRIDE}"
  fi
}
trap cleanup EXIT

prepare_standalone_override() {
  if [[ "${PROXY_PROVIDER}" != "standalone" ]]; then
    return 0
  fi

  STANDALONE_OVERRIDE="$(mktemp "${DEPLOY_PATH}/.compose-standalone-XXXXXX.yml")"
  cat > "${STANDALONE_OVERRIDE}" <<EOF
services:
  app:
    ports:
      - "${APP_LISTEN_PORT}:8080"
EOF
}

compose_cmd() {
  local -a extra_args=()

  if [[ -n "${COMPOSE_PROFILE}" ]]; then
    extra_args+=(--profile "${COMPOSE_PROFILE}")
  fi
  if [[ -n "${STANDALONE_OVERRIDE}" && -f "${STANDALONE_OVERRIDE}" ]]; then
    extra_args+=(-f "${STANDALONE_OVERRIDE}")
  fi

  ENV_FILE="${ENV_FILE}" \
    APP_IMAGE_REPO="${APP_IMAGE_REPO}" \
    APP_IMAGE_TAG="${APP_IMAGE_TAG}" \
    APP_DOMAIN="${APP_DOMAIN}" \
    APP_WWW_DOMAIN="${APP_WWW_DOMAIN}" \
    TRAEFIK_ACME_EMAIL="${TRAEFIK_ACME_EMAIL}" \
    NGINX_TLS_CERT_PATH="${NGINX_TLS_CERT_PATH}" \
    NGINX_TLS_KEY_PATH="${NGINX_TLS_KEY_PATH}" \
    docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "${extra_args[@]}" "$@"
}

bootstrap_context() {
  [[ -n "${DEPLOY_PATH}" ]] || fail "DEPLOY_PATH vazio." "Informe --deploy-path ou exporte DEPLOY_PATH."
  [[ -d "${DEPLOY_PATH}" ]] || fail "Deploy path nao encontrado: ${DEPLOY_PATH}" \
    "Clone o repositorio no servidor ou ajuste --deploy-path."

  cd "${DEPLOY_PATH}"

  [[ -f "${ENV_FILE}" ]] || fail "Env file ausente: ${DEPLOY_PATH}/${ENV_FILE}" \
    "Copie ops/prod/.env.prod.example para ${ENV_FILE} e preencha valores reais." \
    "cp ops/prod/.env.prod.example ${ENV_FILE}"

  [[ -f "${COMPOSE_FILE}" ]] || fail "Compose file ausente: ${DEPLOY_PATH}/${COMPOSE_FILE}" \
    "Confirme que o deploy path aponta para o repositorio correto."

  require_command docker "Instale Docker Engine e Docker Compose plugin no host."
  require_command git "Instale git no host de deploy."
  require_command curl "Instale curl para healthchecks externos."
  docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin nao respondeu." \
    "Instale/ative o plugin docker compose v2."

  check_gitignore_env_rules
  validate_env_placeholders
  resolve_config
  validate_provider
  if [[ "${PROXY_PROVIDER}" != "nginx" ]]; then
    NGINX_TLS_CERT_PATH="${NGINX_TLS_CERT_PATH:-/dev/null}"
    NGINX_TLS_KEY_PATH="${NGINX_TLS_KEY_PATH:-/dev/null}"
  fi
  validate_check_mode
  APP_IMAGE_REPO="${APP_IMAGE_REPO:-$(read_env_value APP_IMAGE_REPO "${ENV_FILE}")}"
  APP_IMAGE_TAG="${APP_IMAGE_TAG:-$(read_env_value APP_IMAGE_TAG "${ENV_FILE}")}"
  APP_IMAGE_REPO="${APP_IMAGE_REPO:-ghcr.io/nekomatasub/nekomorto}"
  APP_IMAGE_TAG="${APP_IMAGE_TAG:-latest}"
  prepare_standalone_override
}

sync_repository() {
  if [[ "${SKIP_GIT_SYNC}" == "true" ]]; then
    log "Repository sync skipped (SKIP_GIT_SYNC=true)."
    return 0
  fi

  log "Syncing repository..."
  git fetch --prune origin
  git checkout "${DEPLOY_BRANCH}"
  git reset --hard "origin/${DEPLOY_BRANCH}"
}

run_setup() {
  log "Using app image: ${APP_IMAGE_REPO}:${APP_IMAGE_TAG}"
  log "Using proxy provider: ${PROXY_PROVIDER}"
  log "Domains: ${APP_DOMAIN} -> ${APP_WWW_DOMAIN}"
  log "Healthcheck base URL: ${HEALTHCHECK_BASE_URL}"
  log "Validating compose configuration..."
  compose_cmd config >/dev/null
  log "Setup validation completed successfully."
}

run_deploy() {
  sync_repository

  log "Using app image: ${APP_IMAGE_REPO}:${APP_IMAGE_TAG}"
  log "Using proxy provider: ${PROXY_PROVIDER}"
  log "Domains: ${APP_DOMAIN} -> ${APP_WWW_DOMAIN}"
  log "Checks mode: ${DEPLOY_CHECKS}"
  log "Validating compose configuration..."
  compose_cmd config >/dev/null

  log "Ensuring postgres is running..."
  compose_cmd up -d postgres

  log "Pulling app image..."
  compose_cmd pull app

  log "Applying Prisma migrations..."
  compose_cmd run --rm app npm run prisma:migrate:deploy

  log "Checking uploads integrity..."
  compose_cmd run --rm app npm run uploads:check-integrity -- --mode=fast

  if [[ "${PROXY_PROVIDER}" == "standalone" ]]; then
    log "Starting app (standalone, port ${APP_LISTEN_PORT})..."
    compose_cmd up -d app
  else
    log "Starting app + edge-${PROXY_PROVIDER}..."
    compose_cmd up -d
  fi

  log "Running internal health checks..."
  compose_cmd run --rm app \
    node scripts/check-health.mjs \
    --base=http://app:8080 \
    --expect-source=db \
    --expect-maintenance="${EXPECTED_MAINTENANCE}"

  if [[ "${DEPLOY_CHECKS}" != "minimal" ]]; then
    log "Running internal PWA/public smoke checks..."
    compose_cmd run --rm app \
      node scripts/smoke-api.mjs \
      --base=http://app:8080 \
      --expect-prod-html="${PWA_SMOKE_EXPECT_PROD_HTML}" \
      --check-public-media="${PUBLIC_MEDIA_SMOKE_ENABLED}"
  fi

  if should_run_category6_smoke; then
    log "Running category6 internal smoke checks..."
    compose_cmd run --rm app \
      node scripts/check-category6-smoke.mjs \
      --base=http://app:8080
  fi

  log "Running external health check..."
  curl -fsS "${HEALTHCHECK_BASE_URL}/api/health" >/dev/null

  if [[ "${DEPLOY_CHECKS}" != "minimal" ]]; then
    log "Running external PWA/public smoke checks..."
    compose_cmd run --rm app \
      node scripts/smoke-api.mjs \
      --base="${HEALTHCHECK_BASE_URL}" \
      --expect-prod-html="${PWA_SMOKE_EXPECT_PROD_HTML}" \
      --check-public-media="${PUBLIC_MEDIA_SMOKE_ENABLED}"
  fi

  if should_run_category6_smoke; then
    log "Running category6 external smoke checks..."
    compose_cmd run --rm app \
      node scripts/check-category6-smoke.mjs \
      --base="${HEALTHCHECK_BASE_URL}"
  fi

  log "Current services:"
  compose_cmd ps

  log "Completed successfully."
}

should_run_category6_smoke() {
  [[ "${DEPLOY_CHECKS}" == "full" || ("${DEPLOY_CHECKS}" == "safe" && "${RUN_CATEGORY6_SMOKE}" == "true") ]]
}

run_status() {
  log "Configured app image: ${APP_IMAGE_REPO}:${APP_IMAGE_TAG}"
  log "Proxy provider: ${PROXY_PROVIDER}"
  log "Healthcheck base URL: ${HEALTHCHECK_BASE_URL}"
  compose_cmd ps

  log "External health:"
  curl -fsS "${HEALTHCHECK_BASE_URL}/api/health" || true
  echo
}

run_logs() {
  if [[ "${PROXY_PROVIDER}" == "standalone" ]]; then
    compose_cmd logs -f app
  else
    compose_cmd logs -f app "edge-${PROXY_PROVIDER}"
  fi
}

main() {
  parse_args "$@"

  if [[ "${COMMAND}" == "rollback" ]]; then
    validate_image_tag_for_rollback
    SKIP_GIT_SYNC="true"
    COMMAND="deploy"
  fi

  bootstrap_context

  case "${COMMAND}" in
    setup)
      run_setup
      ;;
    deploy)
      run_deploy
      ;;
    status)
      run_status
      ;;
    logs)
      run_logs
      ;;
    *)
      fail "Comando desconhecido: ${COMMAND}" "Use setup, deploy, status, logs ou rollback."
      ;;
  esac
}

main "$@"
