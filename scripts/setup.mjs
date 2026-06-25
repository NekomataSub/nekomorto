import crypto from "crypto";
import fs from "fs";
import readline from "readline";

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const prod = args.has("--prod");

const envPath = ".env";
if (fs.existsSync(envPath) && !force) {
  console.error(".env already exists. Use --force to overwrite.");
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (question, fallback = "") =>
  new Promise((resolve) => {
    rl.question(`${question}${fallback ? ` (${fallback})` : ""}: `, (answer) => {
      resolve(answer.trim() || fallback);
    });
  });

const randomSecret = () => crypto.randomBytes(32).toString("hex");

const main = async () => {
  const nodeEnv = prod ? "production" : await ask("NODE_ENV", "development");
  const port = await ask("PORT", "8080");
  const databaseUrl = await ask("DATABASE_URL");
  const sessionTable = await ask("SESSION_TABLE", "user_sessions");
  const maintenanceMode = await ask("MAINTENANCE_MODE", "false");
  const appOrigin = await ask("APP_ORIGIN", "http://127.0.0.1:5173");
  const discordClientId = await ask("DISCORD_CLIENT_ID");
  const discordClientSecret = await ask("DISCORD_CLIENT_SECRET");
  const sessionSecret = (await ask("SESSION_SECRET (leave blank to generate)")) || randomSecret();
  const betterAuthSecret =
    (await ask("BETTER_AUTH_SECRET (leave blank to generate)")) || randomSecret();
  const ownerIds = await ask("OWNER_IDS (comma-separated, optional)");

  let bootstrapToken = "";
  if (!ownerIds) {
    bootstrapToken =
      (await ask("BOOTSTRAP_TOKEN (leave blank to generate one-time token)")) || randomSecret();
  }

  const lines = [
    `NODE_ENV=${nodeEnv}`,
    `PORT=${port}`,
    `DATABASE_URL=${databaseUrl}`,
    `SESSION_TABLE=${sessionTable}`,
    `MAINTENANCE_MODE=${maintenanceMode}`,
    `APP_ORIGIN=${appOrigin}`,
    `DISCORD_CLIENT_ID=${discordClientId}`,
    `DISCORD_CLIENT_SECRET=${discordClientSecret}`,
    `SESSION_SECRET=${sessionSecret}`,
    `BETTER_AUTH_SECRET=${betterAuthSecret}`,
    `OWNER_IDS=${ownerIds}`,
    `BOOTSTRAP_TOKEN=${bootstrapToken}`,
    "",
  ];

  fs.writeFileSync(envPath, lines.join("\n"), "utf-8");
  console.log(".env written. Keep BOOTSTRAP_TOKEN private.");
  if (bootstrapToken) {
    console.log("Use /api/bootstrap-owner after logging in to promote the first owner.");
  }
  rl.close();
};

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
