import { spawn, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const CONTAINER_NAME = "nekomorto-postgres-staging";

const commands = new Set(["up", "down", "ps", "logs"]);
const command = process.argv[2];

if (!commands.has(command)) {
  console.error("Usage: node scripts/local-postgres.mjs <up|down|ps|logs>");
  process.exit(1);
}

const canRun = (binary, args = ["--version"]) => {
  const result = spawnSync(binary, args, { stdio: "ignore" });
  return !result.error && result.status === 0;
};

const dockerInvocation = () => {
  if (canRun("docker")) {
    return { bin: "docker", prefix: [] };
  }
  if (canRun("flatpak-spawn", ["--host", "docker", "--version"])) {
    return { bin: "flatpak-spawn", prefix: ["--host", "docker"] };
  }
  console.error("Docker CLI not found. Install Docker or expose host Docker with flatpak-spawn.");
  process.exit(1);
};

const docker = dockerInvocation();

const run = (args, options = {}) => {
  const child = spawn(docker.bin, [...docker.prefix, ...args], {
    cwd: REPO_ROOT,
    stdio: options.stdio || "inherit",
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
};

if (command === "up") {
  run(["start", CONTAINER_NAME]);
} else if (command === "down") {
  run(["stop", CONTAINER_NAME]);
} else if (command === "ps") {
  run(["ps", "-a", "--filter", `name=${CONTAINER_NAME}`]);
} else if (command === "logs") {
  run(["logs", "-f", CONTAINER_NAME]);
}
