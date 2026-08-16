import { spawn } from "node:child_process";

const buildVersion = process.env.PROOFERA_BUILD_VERSION?.trim();
if (buildVersion === undefined || !/^[A-Za-z0-9._-]{1,128}$/.test(buildVersion)) {
  throw new Error("PROOFERA_BUILD_VERSION must be an immutable release identifier");
}

const intervalCandidate = Number(process.env.PROOFERA_MONITOR_INTERVAL_MS ?? "300000");
if (
  !Number.isSafeInteger(intervalCandidate) ||
  intervalCandidate < 60_000 ||
  intervalCandidate > 900_000
) {
  throw new Error("PROOFERA_MONITOR_INTERVAL_MS must be between 60000 and 900000");
}

let previousStatus;

function runProbe() {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["scripts/check-local-production.mjs", "--public", `--expected-build=${buildVersion}`],
      {
        cwd: process.cwd(),
        env: {},
        shell: false,
        windowsHide: true
      }
    );
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", () =>
      resolve({ detail: "probe process failed to start", status: "unavailable" })
    );
    child.on("close", (code) => {
      const status = code === 0 ? "healthy" : "unavailable";
      const output = Buffer.concat(code === 0 ? stdout : stderr)
        .toString("utf8")
        .trim();
      resolve({ detail: output || "probe returned no detail", status });
    });
  });
}

async function monitor() {
  const result = await runProbe();
  if (result.status !== previousStatus || result.status !== "healthy") {
    process.stdout.write(
      `${JSON.stringify({
        build: buildVersion,
        detail: result.detail,
        event: "public_production_probe",
        observedAt: new Date().toISOString(),
        status: result.status
      })}\n`
    );
  }
  previousStatus = result.status;
}

await monitor();
setInterval(() => void monitor(), intervalCandidate);
