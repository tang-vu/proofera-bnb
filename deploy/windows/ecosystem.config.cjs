// eslint-disable-next-line @typescript-eslint/no-require-imports -- PM2 loads ecosystem files as CommonJS.
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function agent(name, relativeRoot, port, publicUrl) {
  return {
    name,
    cwd: path.join(repositoryRoot, relativeRoot, "app", "agent"),
    script: "dist/src/dualMain.js",
    interpreter: process.execPath,
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    restart_delay: 2_000,
    exp_backoff_restart_delay: 100,
    max_memory_restart: "512M",
    kill_timeout: 10_000,
    listen_timeout: 10_000,
    time: true,
    env: {
      NODE_ENV: "production",
      AGENT_PORT: String(port),
      AGENT_BIND_HOST: "127.0.0.1",
      AGENTCORE_RUNTIME_URL: publicUrl
    }
  };
}

module.exports = {
  apps: [
    {
      name: "proofera-web",
      cwd: path.join(repositoryRoot, "apps", "web"),
      script: "node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 3030",
      interpreter: process.execPath,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 2_000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: "1G",
      kill_timeout: 15_000,
      listen_timeout: 15_000,
      time: true,
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_ORIGIN: "https://proofera.tangvu.dev",
        NEXT_PUBLIC_ALTANA_RP_ID: "proofera.tangvu.dev"
      }
    },
    agent("proofera-agent-lp", "agents/lpRangeAgent", 9_101, "https://proofera-lp.tangvu.dev/"),
    agent(
      "proofera-agent-grid",
      "agents/gridTradingAgent",
      9_102,
      "https://proofera-grid.tangvu.dev/"
    ),
    agent(
      "proofera-agent-yield",
      "agents/yieldOptimisationAgent",
      9_103,
      "https://proofera-yield.tangvu.dev/"
    ),
    agent(
      "proofera-agent-health",
      "agents/healthFactorGuardianAgent",
      9_104,
      "https://proofera-health.tangvu.dev/"
    )
  ]
};
