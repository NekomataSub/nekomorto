import { spawn, spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { resolveNpmInvocation } from "./lib/npm-invocation.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const APP_ENV_PATH = path.join(REPO_ROOT, ".env");
const POSTGRES_ENV_PATH = path.join(REPO_ROOT, "ops", "postgres", ".env.staging");
const POSTGRES_COMPOSE_PATH = path.join(REPO_ROOT, "ops", "postgres", "docker-compose.staging.yml");
const POSTGRES_SERVICE_NAME = "postgres";
const DEFAULT_POSTGRES_BIND_IP = "127.0.0.1";
const DEFAULT_POSTGRES_PORT = "5432";
const POSTGRES_USER = "nekomorto_app";
const POSTGRES_DB = "nekomorto";
const DB_READY_TIMEOUT_MS = 90_000;
const DB_READY_POLL_INTERVAL_MS = 2_000;
const PLACEHOLDER_PASSWORDS = new Set([
  "change_me_now",
  "changeme",
  "replace_me",
  "your_password",
  "<postgres_password>",
  "<password>",
]);

const args = new Set(process.argv.slice(2));
const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
let promptInterface = null;

const composeBaseArgs = ["compose", "--env-file", POSTGRES_ENV_PATH, "-f", POSTGRES_COMPOSE_PATH];

const usage = () => {
  console.log(`Usage: npm run setup:dev

Runs full local development setup:
1. validates prerequisites (docker, docker compose, node, npm)
2. ensures ops/postgres/.env.staging
3. starts PostgreSQL in Docker and waits for readiness
4. ensures and validates .env
5. installs dependencies when node_modules is missing
6. runs Prisma generate + migrate deploy
7. starts npm run dev`);
};

const resolveInvocation = (command, commandArgs) =>
  command === "npm"
    ? resolveNpmInvocation(commandArgs)
    : {
        command,
        args: commandArgs,
      };

const formatCommand = (command, commandArgs) =>
  [command, ...commandArgs.map((value) => (/\s/.test(value) ? `"${value}"` : value))].join(" ");

const readEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const entries = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
};

const writeEnvFile = (filePath, entries) => {
  const lines = Object.entries(entries).map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
};

const runCheck = (command, commandArgs, { label, tip }) => {
  const invocation = resolveInvocation(command, commandArgs);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
  });
  const failed = Boolean(result.error) || result.status !== 0;
  if (!failed) {
    return;
  }
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  const details =
    result.error?.message || output || `exit code ${String(result.status ?? "unknown")}`;
  throw new Error(
    `${label} is not available.\n${tip}\nCommand: ${formatCommand(invocation.command, invocation.args)}\nDetails: ${details}`,
  );
};

const runCommand = (command, commandArgs, options = {}) =>
  new Promise((resolve, reject) => {
    const invocation = resolveInvocation(command, commandArgs);
    const child = spawn(invocation.command, invocation.args, {
      cwd: REPO_ROOT,
      stdio: options.stdio || "inherit",
    });
    child.on("error", (error) => {
      reject(
        new Error(
          `Failed to execute command: ${formatCommand(
            invocation.command,
            invocation.args,
          )}\nDetails: ${error.message}`,
        ),
      );
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(
          new Error(
            `Command interrupted by signal ${signal}: ${formatCommand(
              invocation.command,
              invocation.args,
            )}`,
          ),
        );
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `Command failed (exit ${code}): ${formatCommand(invocation.command, invocation.args)}`,
          ),
        );
        return;
      }
      resolve();
    });
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ensurePromptInterface = () => {
  if (!promptInterface) {
    promptInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return promptInterface;
};

const closePromptInterface = () => {
  if (promptInterface) {
    promptInterface.close();
    promptInterface = null;
  }
};

const ask = (question, fallback = "") =>
  new Promise((resolve) => {
    const rl = ensurePromptInterface();
    rl.question(`${question}${fallback ? ` (${fallback})` : ""}: `, (answer) => {
      const normalized = answer.trim();
      resolve(normalized || fallback);
    });
  });

const randomSecret = () => crypto.randomBytes(32).toString("hex");

const isPlaceholderPassword = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return true;
  }
  return PLACEHOLDER_PASSWORDS.has(normalized);
};

const ensureInteractive = (reason) => {
  if (!isInteractive) {
    throw new Error(`${reason}\nRun this command in an interactive terminal session.`);
  }
};

const parsePositivePort = (value) => {
  const normalized = String(value || "").trim();
  if (!/^\d+$/.test(normalized)) {
    return DEFAULT_POSTGRES_PORT;
  }
  return normalized;
};

const buildLocalDatabaseUrl = ({ password, port }) =>
  `postgresql://${POSTGRES_USER}:${encodeURIComponent(password)}@127.0.0.1:${port}/${POSTGRES_DB}`;

const checkPrerequisites = () => {
  console.log("[setup:dev] Checking prerequisites...");
  runCheck("docker", ["--version"], {
    label: "Docker CLI",
    tip: "Install Docker Desktop and make sure Docker Engine is running.",
  });
  runCheck("docker", ["compose", "version"], {
    label: "Docker Compose",
    tip: "Enable Docker Compose v2 (included in Docker Desktop).",
  });
  runCheck("node", ["-v"], {
    label: "Node.js",
    tip: "Install Node.js 24.14.x before running setup:dev.",
  });
  runCheck("npm", ["-v"], {
    label: "npm",
    tip: "Install npm 11.x (bundled with Node.js 24.14.x).",
  });
};

const askForPostgresPassword = async () => {
  while (true) {
    const value = await ask("POSTGRES_PASSWORD for local Docker PostgreSQL");
    if (!value) {
      console.log("[setup:dev] POSTGRES_PASSWORD cannot be empty.");
      continue;
    }
    if (isPlaceholderPassword(value)) {
      console.log("[setup:dev] Please provide a real password (not a placeholder).");
      continue;
    }
    return value;
  }
};

const ensurePostgresEnv = async () => {
  const existing = readEnvFile(POSTGRES_ENV_PATH);
  const hasFile = fs.existsSync(POSTGRES_ENV_PATH);
  const currentPassword = String(existing.POSTGRES_PASSWORD || "").trim();
  const bindIp =
    String(existing.POSTGRES_BIND_IP || DEFAULT_POSTGRES_BIND_IP).trim() ||
    DEFAULT_POSTGRES_BIND_IP;
  const port = parsePositivePort(existing.POSTGRES_PORT || DEFAULT_POSTGRES_PORT);
  if (hasFile && !isPlaceholderPassword(currentPassword)) {
    console.log("[setup:dev] Using existing ops/postgres/.env.staging.");
    return { password: currentPassword, bindIp, port };
  }

  ensureInteractive("ops/postgres/.env.staging is missing or has placeholder POSTGRES_PASSWORD.");
  const password = await askForPostgresPassword();
  writeEnvFile(POSTGRES_ENV_PATH, {
    POSTGRES_PASSWORD: password,
    POSTGRES_BIND_IP: bindIp,
    POSTGRES_PORT: port,
  });
  console.log("[setup:dev] Wrote ops/postgres/.env.staging.");
  return { password, bindIp, port };
};

const waitForPostgresReady = async () => {
  const startedAt = Date.now();
  const readinessArgs = [
    ...composeBaseArgs,
    "exec",
    "-T",
    POSTGRES_SERVICE_NAME,
    "pg_isready",
    "-U",
    POSTGRES_USER,
    "-d",
    POSTGRES_DB,
  ];

  while (Date.now() - startedAt < DB_READY_TIMEOUT_MS) {
    const result = spawnSync("docker", readinessArgs, {
      cwd: REPO_ROOT,
      stdio: "ignore",
    });
    if (result.status === 0) {
      return;
    }
    await sleep(DB_READY_POLL_INTERVAL_MS);
  }

  throw new Error(
    `PostgreSQL did not become ready within ${Math.floor(DB_READY_TIMEOUT_MS / 1000)}s.\n` +
      "Inspect with:\n" +
      "docker compose --env-file ops/postgres/.env.staging -f ops/postgres/docker-compose.staging.yml ps\n" +
      "docker compose --env-file ops/postgres/.env.staging -f ops/postgres/docker-compose.staging.yml logs postgres",
  );
};

const validateExistingAppEnv = () => {
  const existing = readEnvFile(APP_ENV_PATH);
  const missing = [];
  if (!String(existing.DATABASE_URL || "").trim()) {
    missing.push("DATABASE_URL");
  }
  if (missing.length > 0) {
    throw new Error(
      `.env exists but is missing required variable(s): ${missing.join(", ")}.\n` +
        "Example:\n" +
        "DATABASE_URL=postgresql://nekomorto_app:<POSTGRES_PASSWORD>@127.0.0.1:5432/nekomorto",
    );
  }
};

const createAppEnvInteractive = async (databaseUrl) => {
  ensureInteractive("First setup requires creating .env interactively.");
  console.log("[setup:dev] .env not found. Starting interactive app configuration.");
  console.log(`[setup:dev] DATABASE_URL will be set automatically to: ${databaseUrl}`);

  const nodeEnv = await ask("NODE_ENV", "development");
  const port = await ask("PORT", "8080");
  const sessionTable = await ask("SESSION_TABLE", "user_sessions");
  const maintenanceMode = await ask("MAINTENANCE_MODE", "false");
  const appOrigin = await ask("APP_ORIGIN", "http://127.0.0.1:5173");
  const discordClientId = await ask("DISCORD_CLIENT_ID");
  const discordClientSecret = await ask("DISCORD_CLIENT_SECRET");
  const googleClientId = await ask("GOOGLE_CLIENT_ID");
  const googleClientSecret = await ask("GOOGLE_CLIENT_SECRET");
  const sessionSecret =
    (await ask("SESSION_SECRET (leave blank to generate)", "")) || randomSecret();
  const betterAuthSecret =
    (await ask("BETTER_AUTH_SECRET (leave blank to generate)", "")) || randomSecret();
  const ownerIds = await ask("OWNER_IDS (comma-separated, optional)");

  let bootstrapToken = "";
  if (!ownerIds) {
    bootstrapToken =
      (await ask("BOOTSTRAP_TOKEN (leave blank to generate one-time token)", "")) || randomSecret();
  }

  writeEnvFile(APP_ENV_PATH, {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
    SESSION_TABLE: sessionTable,
    MAINTENANCE_MODE: maintenanceMode,
    APP_ORIGIN: appOrigin,
    DISCORD_CLIENT_ID: discordClientId,
    DISCORD_CLIENT_SECRET: discordClientSecret,
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
    SESSION_SECRET: sessionSecret,
    BETTER_AUTH_SECRET: betterAuthSecret,
    OWNER_IDS: ownerIds,
    BOOTSTRAP_TOKEN: bootstrapToken,
  });
  console.log("[setup:dev] Wrote .env.");
  if (bootstrapToken) {
    console.log("[setup:dev] BOOTSTRAP_TOKEN generated for first owner bootstrap.");
  }
};

const ensureAppEnv = async (databaseUrl) => {
  if (fs.existsSync(APP_ENV_PATH)) {
    validateExistingAppEnv();
    console.log("[setup:dev] Keeping existing .env (DATABASE_URL validated).");
    return;
  }
  await createAppEnvInteractive(databaseUrl);
};

const ensureDependencies = async () => {
  const nodeModulesPath = path.join(REPO_ROOT, "node_modules");
  if (fs.existsSync(nodeModulesPath)) {
    console.log("[setup:dev] node_modules already present. Skipping npm ci.");
    return;
  }
  console.log("[setup:dev] node_modules not found. Running npm ci...");
  await runCommand("npm", ["ci"]);
};

const runPrismaSetup = async () => {
  console.log("[setup:dev] Running Prisma generate...");
  await runCommand("npm", ["run", "prisma:generate"]);
  console.log("[setup:dev] Applying Prisma migrations...");
  await runCommand("npm", ["run", "prisma:migrate:deploy"]);
};

const startDevServer = async () => {
  console.log("[setup:dev] Setup complete. Starting development server (npm run dev)...");
  await runCommand("npm", ["run", "dev"]);
};

const main = async () => {
  if (args.has("--help") || args.has("-h")) {
    usage();
    return;
  }

  checkPrerequisites();
  const postgresConfig = await ensurePostgresEnv();

  console.log("[setup:dev] Starting local PostgreSQL container...");
  await runCommand("docker", [...composeBaseArgs, "up", "-d", POSTGRES_SERVICE_NAME]);

  console.log("[setup:dev] Waiting for PostgreSQL to become ready...");
  await waitForPostgresReady();

  const databaseUrl = buildLocalDatabaseUrl(postgresConfig);
  await ensureAppEnv(databaseUrl);
  await ensureDependencies();
  await runPrismaSetup();
  await startDevServer();
};

main()
  .catch((error) => {
    const details = error?.message || error?.stack || String(error);
    console.error(`[setup:dev] ${details}`);
    process.exitCode = 1;
  })
  .finally(() => {
    closePromptInterface();
  });
