import fs from "fs";
import path from "path";

const args = process.argv.slice(2);

const getArgValue = (name) => {
  const item = args.find((entry) => entry.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : "";
};

const baseRequiredKeys = [
  "NODE_ENV",
  "PORT",
  "DATABASE_URL",
  "APP_ORIGIN",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_REDIRECT_URI",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "SESSION_SECRET",
  "BETTER_AUTH_SECRET",
  "SESSION_TABLE",
  "DATA_ENCRYPTION_KEYS_JSON",
  "SECURITY_RECOVERY_CODE_PEPPER",
  "MFA_ISSUER",
  "MFA_ENROLLMENT_TTL_MS",
  "ADMIN_EXPORTS_DIR",
  "ADMIN_EXPORT_TTL_HOURS",
  "METRICS_ENABLED",
  "OPS_ALERTS_WEBHOOK_ENABLED",
  "OPS_ALERTS_WEBHOOK_PROVIDER",
];

const truthy = (value) =>
  ["1", "true", "yes", "on"].includes(
    String(value || "")
      .trim()
      .toLowerCase(),
  );

const parseEnvLikeFile = (raw) => {
  const result = {};
  String(raw || "")
    .split(/\r?\n/g)
    .forEach((line) => {
      const trimmed = String(line || "").trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex < 1) {
        return;
      }
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (key) {
        result[key] = value;
      }
    });
  return result;
};

const loadEnvSource = () => {
  const envFile = String(getArgValue("--env-file") || "").trim();
  if (!envFile) {
    return process.env;
  }
  const resolved = path.resolve(envFile);
  if (!fs.existsSync(resolved)) {
    throw new Error(`env file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, "utf8");
  return parseEnvLikeFile(raw);
};

const main = () => {
  const envSource = loadEnvSource();
  const missing = baseRequiredKeys.filter((key) => {
    const value = envSource[key];
    return String(value ?? "").trim().length === 0;
  });
  const warnings = [];

  const hasOwnerIds = String(envSource.OWNER_IDS ?? "").trim().length > 0;
  const hasBootstrapToken = String(envSource.BOOTSTRAP_TOKEN ?? "").trim().length > 0;
  if (!hasOwnerIds && !hasBootstrapToken) {
    missing.push("OWNER_IDS or BOOTSTRAP_TOKEN");
  }

  if (
    truthy(envSource.METRICS_ENABLED) &&
    String(envSource.METRICS_TOKEN ?? "").trim().length === 0
  ) {
    missing.push("METRICS_TOKEN");
  }

  if (
    truthy(envSource.OPS_ALERTS_WEBHOOK_ENABLED) &&
    String(envSource.OPS_ALERTS_WEBHOOK_URL ?? "").trim().length === 0
  ) {
    missing.push("OPS_ALERTS_WEBHOOK_URL");
  }

  if (String(envSource.SESSION_SECRETS ?? "").trim().length === 0) {
    warnings.push("SESSION_SECRETS is empty; rotation window will not be validated");
  }

  if (missing.length > 0) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          missing: Array.from(new Set(missing)),
          warnings,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        checked: baseRequiredKeys.length,
        warnings,
        source: String(getArgValue("--env-file") || "process.env"),
      },
      null,
      2,
    ),
  );
};

main();
