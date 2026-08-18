import { spawn, execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_ROOT = resolve(ROOT, "scripts", "operator-ceremony");
const LP_INPUT_PATH = "evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json";
const LP_DECLARATION_PATH = "evidence/termix/declarations/pancake-lp/f8b57f2b1842-125735511.json";
const VENUS_INPUT_PATH =
  "evidence/termix/frozen/venus-health/3ba85859ced3-125563831-125564152.canonical-json";
const VENUS_DECLARATION_PATH =
  "evidence/termix/declarations/venus-health/3ba85859ced3-125568071.json";
const LP_RUN_ID = "pancake-lp-manual-20260818-v1";
const VENUS_RUN_ID = "venus-health-manual-20260818-v1";
const LP_OUTPUT_PATH = `evidence/termix/runs/pancake-lp/manual/${LP_RUN_ID}.json`;
const VENUS_OUTPUT_PATH = `evidence/termix/runs/venus-health/manual/${VENUS_RUN_ID}.json`;
const LP_RPC_ENDPOINT = "https://bnb.api.onfinality.io/public";
const VENUS_RPC_ENDPOINT = "https://bsc-testnet-rpc.publicnode.com";
const MAXIMUM_REQUEST_BYTES = 64_000;

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function readJson(repositoryPath) {
  return JSON.parse(await readFile(resolve(ROOT, repositoryPath), "utf8"));
}

export function buildManualInvocation({ declaration, lane }) {
  const isLp = lane === "lp";
  return {
    [isLp ? "inputBundleSha256" : "requestInputSha256"]: declaration.input.sha256,
    timedRunRequest: {
      protocolVersion: "proofera-termix-timed-runner-v1.0.0",
      runId: isLp ? LP_RUN_ID : VENUS_RUN_ID,
      runnerId: isLp ? "pancake-lp-manual-v1" : "venus-health-manual-v1",
      declaration: declaration.declaration,
      declarationSha256: declaration.declarationSha256,
      method: isLp
        ? {
            kind: "manual",
            label: "Operator-confirmed LP worksheet without agent",
            operatorRole: "Repository owner using the bounded non-agent worksheet",
            procedureVersion: "proofera-termix-pancake-lp-manual-v1.1.0",
            tools: [
              { name: "human-reviewed-canonical-json-worksheet", version: "1.0.0" },
              {
                name: "onfinality-bsc-mainnet-archive-json-rpc",
                version: "eth-json-rpc"
              }
            ]
          }
        : {
            kind: "manual",
            label: "Operator-confirmed Venus health worksheet without agent",
            operatorRole: "Repository owner using the bounded non-agent worksheet",
            procedureVersion: "proofera-venus-health-manual-worksheet-v1.0.0",
            tools: [
              { name: "human-reviewed-canonical-json-worksheet", version: "1.0.0" },
              { name: "official-bsc-testnet-json-rpc", version: "eth-json-rpc" }
            ]
          },
      sourceCommitSha: declaration.sourceCommitSha,
      repositoryClean: true,
      hireReceipt: null
    }
  };
}

export function buildLpWorksheet(input, rpcCurrentTick) {
  const request = input.agentRequest;
  const lowerTick = request.lowerTick;
  const upperTick = request.upperTick;
  const fromLowerTick = rpcCurrentTick - lowerTick;
  const toUpperExclusiveTick = upperTick - rpcCurrentTick;
  const inRange = rpcCurrentTick >= lowerTick && rpcCurrentTick < upperTick;
  return {
    source: {
      chainId: input.sourceEvidence.chainId,
      blockNumber: input.sourceEvidence.blockNumber,
      blockHash: input.sourceEvidence.blockHash,
      poolAddress: input.sourceEvidence.poolAddress,
      rpcEndpoint: LP_RPC_ENDPOINT
    },
    position: {
      positionId: request.positionId,
      lowerTick,
      currentTick: rpcCurrentTick,
      upperTick,
      tickSpacing: request.tickSpacing,
      rangeWidthTicks: upperTick - lowerTick,
      fromLowerTick,
      toUpperExclusiveTick,
      inRange
    },
    policy: request.riskConstraints,
    economicsComplete: false,
    supportedDecisions: ["hold", "review_rebalance", "insufficient_evidence"]
  };
}

function healthFactor(adjustedCollateralValueRaw, debtValueRaw) {
  const numerator = BigInt(adjustedCollateralValueRaw);
  const denominator = BigInt(debtValueRaw);
  if (denominator === 0n) return null;
  const scaledValueFloor = (numerator * 10n ** 18n) / denominator;
  const digits = scaledValueFloor.toString().padStart(19, "0");
  return {
    numerator: numerator.toString(),
    denominator: denominator.toString(),
    scaledValueFloor: scaledValueFloor.toString(),
    decimalValueFloor: `${digits.slice(0, -18)}.${digits.slice(-18)}`
  };
}

export function buildVenusWorksheet(input) {
  const observations = input.observationSeries.observations.map((observation) => ({
    blockNumber: observation.blockNumber,
    blockHash: observation.blockHash,
    observedAtUtc: observation.observedAtUtc,
    adjustedCollateralValueRaw: observation.adjustedCollateralValueRaw,
    debtValueRaw: observation.debtValueRaw,
    healthFactor: healthFactor(observation.adjustedCollateralValueRaw, observation.debtValueRaw)
  }));
  const finite = observations
    .map((observation) => observation.healthFactor)
    .filter((value) => value !== null);
  const minimumHealthFactorRaw = finite.reduce(
    (minimum, value) =>
      minimum === null || BigInt(value.scaledValueFloor) < BigInt(minimum.scaledValueFloor)
        ? value
        : minimum,
    null
  );
  return {
    account: input.account,
    chainId: input.chainId,
    formula: "floor(adjustedCollateralValueRaw * 10^18 / debtValueRaw)",
    observations,
    minimumHealthFactor: minimumHealthFactorRaw,
    thresholds: {
      alertHealthFactorRaw: input.policy.alertHealthFactorRaw,
      interventionHealthFactorRaw: input.policy.interventionHealthFactorRaw
    },
    windowSeconds:
      (Date.parse(observations.at(-1).observedAtUtc) - Date.parse(observations[0].observedAtUtc)) /
      1_000,
    supportedDecisions: ["hold", "monitor", "review_intervention", "insufficient_evidence"]
  };
}

function validateOperatorConfirmation(body) {
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).join(",") !== "worksheetReviewed" ||
    body.worksheetReviewed !== true
  ) {
    throw new Error("CEREMONY_OPERATOR_CONFIRMATION_INVALID");
  }
}

export function recommendedLpConclusion(worksheet) {
  if (worksheet.economicsComplete !== false) {
    throw new Error("CEREMONY_LP_ECONOMICS_STATE_INVALID");
  }
  return {
    decision: "insufficient_evidence",
    rationale:
      `The exact-hash tick ${worksheet.position.currentTick} is inside ` +
      `[${worksheet.position.lowerTick}, ${worksheet.position.upperTick}) with buffers ` +
      `${worksheet.position.fromLowerTick}/${worksheet.position.toUpperExclusiveTick}, but ` +
      "projected fees, gas and slippage are missing, so rebalance benefit cannot be established."
  };
}

export function recommendedVenusConclusion(worksheet) {
  const minimum = worksheet.minimumHealthFactor;
  if (
    minimum === null ||
    BigInt(minimum.scaledValueFloor) <= BigInt(worksheet.thresholds.alertHealthFactorRaw)
  ) {
    throw new Error("CEREMONY_VENUS_RECOMMENDATION_UNSUPPORTED");
  }
  return {
    decision: "hold",
    rationale:
      `All ${worksheet.observations.length} frozen observations recompute to a minimum health ` +
      `factor of ${minimum.decimalValueFloor}, above the alert threshold, across the ` +
      `${worksheet.windowSeconds}-second window; no write is authorized or performed.`
  };
}

function fixedCommand(lane) {
  if (lane === "lp") {
    return `pnpm.cmd run:termix:pancake-lp-manual -- --execute-exact-pancake-lp-manual-run --input-bundle ${LP_INPUT_PATH}`;
  }
  return `pnpm.cmd run:termix:venus-manual -- --execute-exact-venus-health-manual-run --request-input ${VENUS_INPUT_PATH}`;
}

function spawnManualRunner(lane) {
  const child = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", fixedCommand(lane)], {
    cwd: ROOT,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (stdout.length > 64_000) child.kill();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (stderr.length > 64_000) child.kill();
  });
  const completed = new Promise((resolvePromise) => {
    child.once("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
  return { child, completed };
}

function writeEvent(runner, value) {
  if (runner.child.stdin.destroyed) throw new Error("CEREMONY_RUNNER_INPUT_CLOSED");
  runner.child.stdin.write(`${canonicalJson(value)}\n`);
}

async function rpc(endpointUrl, request) {
  const requestBody = canonicalJson(request);
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: requestBody,
    signal: AbortSignal.timeout(20_000)
  });
  const responseBody = await response.text();
  if (!response.ok || responseBody.length > 2_000_000) {
    throw new Error("CEREMONY_RPC_UNAVAILABLE");
  }
  const parsed = JSON.parse(responseBody);
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    parsed.id !== request.id ||
    !("result" in parsed) ||
    "error" in parsed
  ) {
    throw new Error("CEREMONY_RPC_RESPONSE_INVALID");
  }
  return { requestBody, responseBody, parsed };
}

function decodeSignedWord(hex, wordIndex) {
  const body = hex.slice(2);
  const word = BigInt(`0x${body.slice(wordIndex * 64, (wordIndex + 1) * 64)}`);
  const signBoundary = 1n << 255n;
  return Number(word >= signBoundary ? word - (1n << 256n) : word);
}

async function git(args) {
  const result = await execFileAsync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 2_000_000
  });
  return result.stdout.trim();
}

async function assertCleanPublished() {
  const [head, origin, status] = await Promise.all([
    git(["rev-parse", "HEAD"]),
    git(["rev-parse", "origin/main"]),
    git(["status", "--porcelain", "--untracked-files=all"])
  ]);
  if (head !== origin) throw new Error("CEREMONY_RELEASE_NOT_PUBLISHED");
  if (status !== "") throw new Error("CEREMONY_WORKTREE_NOT_CLEAN");
}

async function trackedCapture(outputPath) {
  try {
    await git(["ls-files", "--error-unmatch", "--", outputPath]);
    const commitSha = await git(["log", "-1", "--format=%H", "--", outputPath]);
    return commitSha === "" ? null : { path: outputPath, commitSha };
  } catch {
    return null;
  }
}

async function commitCapture(outputPath, message) {
  const status = await git(["status", "--porcelain", "--untracked-files=all"]);
  const entries = status.split("\n").filter(Boolean);
  if (entries.length !== 1 || !entries[0].endsWith(outputPath)) {
    throw new Error("CEREMONY_CAPTURE_NOT_ISOLATED");
  }
  await git(["add", "--", outputPath]);
  await git(["commit", "-m", message, "--", outputPath]);
  await git(["push", "origin", "HEAD"]);
  return git(["rev-parse", "HEAD"]);
}

function publicError(error) {
  return error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : "CEREMONY_INTERNAL_ERROR";
}

export function runnerFailureCode(completed, fallback) {
  const match = completed.stderr.match(/failed: ([A-Z0-9_]+)(?:\r?\n|$)/u);
  return match?.[1] ?? fallback;
}

function responseJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(`${JSON.stringify(value)}\n`);
}

async function requestJson(request) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAXIMUM_REQUEST_BYTES) throw new Error("CEREMONY_REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function hasSessionCookie(request, sessionToken) {
  return (request.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .includes(`proofera_ceremony=${sessionToken}`);
}

function securityHeaders() {
  return {
    "cache-control": "no-store",
    "content-security-policy":
      "default-src 'self'; base-uri 'none'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'none'; object-src 'none'; script-src 'self'; style-src 'self'",
    "cross-origin-opener-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  };
}

export async function createCeremonyServer({ port = 0, openBrowser = true } = {}) {
  const sessionToken = randomBytes(24).toString("hex");
  const bootstrapToken = randomBytes(24).toString("hex");
  const csrfToken = randomBytes(24).toString("hex");
  const [retainedLpCapture, retainedVenusCapture] = await Promise.all([
    trackedCapture(LP_OUTPUT_PATH),
    trackedCapture(VENUS_OUTPUT_PATH)
  ]);
  if (retainedVenusCapture !== null && retainedLpCapture === null) {
    throw new Error("CEREMONY_CAPTURE_ORDER_INVALID");
  }
  const state = {
    phase:
      retainedVenusCapture !== null
        ? "manual_complete"
        : retainedLpCapture !== null
          ? "lp_done"
          : "idle",
    lpRunner: null,
    venusRunner: null,
    lpWorksheet: null,
    venusWorksheet: null,
    lpCapture: retainedLpCapture,
    venusCapture: retainedVenusCapture,
    error: null
  };

  const [htmlTemplate, clientJs, styles] = await Promise.all([
    readFile(resolve(ASSET_ROOT, "index.html"), "utf8"),
    readFile(resolve(ASSET_ROOT, "client.js"), "utf8"),
    readFile(resolve(ASSET_ROOT, "styles.css"), "utf8")
  ]);

  const server = createServer(async (request, response) => {
    try {
      const host = request.headers.host;
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (host !== `127.0.0.1:${server.address().port}`) {
        response.writeHead(421, securityHeaders());
        response.end("Misdirected request\n");
        return;
      }
      const url = new URL(request.url, origin);
      if (request.method === "GET" && url.pathname === "/" && url.searchParams.has("bootstrap")) {
        if (url.searchParams.get("bootstrap") !== bootstrapToken) {
          response.writeHead(403, securityHeaders());
          response.end("Forbidden\n");
          return;
        }
        response.writeHead(303, {
          ...securityHeaders(),
          location: "/",
          "set-cookie": `proofera_ceremony=${sessionToken}; HttpOnly; SameSite=Strict; Path=/`
        });
        response.end();
        return;
      }
      if (
        request.method === "GET" &&
        url.pathname === "/" &&
        !hasSessionCookie(request, sessionToken)
      ) {
        response.writeHead(303, {
          ...securityHeaders(),
          location: "/",
          "set-cookie": `proofera_ceremony=${sessionToken}; HttpOnly; SameSite=Strict; Path=/`
        });
        response.end();
        return;
      }
      if (!hasSessionCookie(request, sessionToken)) {
        response.writeHead(403, securityHeaders());
        response.end("Forbidden\n");
        return;
      }
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, {
          ...securityHeaders(),
          "content-type": "text/html; charset=utf-8"
        });
        response.end(htmlTemplate.replaceAll("__CSRF_TOKEN__", csrfToken));
        return;
      }
      if (request.method === "GET" && url.pathname === "/client.js") {
        response.writeHead(200, {
          ...securityHeaders(),
          "content-type": "text/javascript; charset=utf-8"
        });
        response.end(clientJs);
        return;
      }
      if (request.method === "GET" && url.pathname === "/styles.css") {
        response.writeHead(200, {
          ...securityHeaders(),
          "content-type": "text/css; charset=utf-8"
        });
        response.end(styles);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        responseJson(response, 200, {
          phase: state.phase,
          lpWorksheet: state.lpWorksheet,
          venusWorksheet: state.venusWorksheet,
          lpCapture: state.lpCapture,
          venusCapture: state.venusCapture,
          error: state.error
        });
        return;
      }
      if (request.method !== "POST" || !url.pathname.startsWith("/api/")) {
        response.writeHead(404, securityHeaders());
        response.end("Not found\n");
        return;
      }
      if (request.headers.origin !== origin || request.headers["x-csrf-token"] !== csrfToken) {
        responseJson(response, 403, { error: "CEREMONY_REQUEST_AUTH_INVALID" });
        return;
      }

      if (url.pathname === "/api/lp/start") {
        if (state.phase !== "idle") throw new Error("CEREMONY_PHASE_INVALID");
        await assertCleanPublished();
        const [declaration, input] = await Promise.all([
          readJson(LP_DECLARATION_PATH),
          readJson(LP_INPUT_PATH)
        ]);
        const runner = spawnManualRunner("lp");
        state.lpRunner = runner;
        try {
          writeEvent(runner, buildManualInvocation({ declaration, lane: "lp" }));
          writeEvent(runner, {
            event: "active_start",
            segmentId: "independent-lp-review",
            description: "Repository owner reviewed the bounded non-agent LP worksheet"
          });
          const exchangeId = `${LP_RUN_ID}-lp-slot0`;
          const exchange = await rpc(LP_RPC_ENDPOINT, {
            id: exchangeId,
            jsonrpc: "2.0",
            method: "eth_call",
            params: [
              { data: "0x3850c7bd", to: input.sourceEvidence.poolAddress },
              { blockHash: input.sourceEvidence.blockHash, requireCanonical: true }
            ]
          });
          if (typeof exchange.parsed.result !== "string") {
            throw new Error("CEREMONY_RPC_RESPONSE_INVALID");
          }
          const rpcCurrentTick = decodeSignedWord(exchange.parsed.result, 1);
          writeEvent(runner, {
            event: "api_exchange",
            exchangeId,
            endpointUrl: LP_RPC_ENDPOINT,
            requestBody: exchange.requestBody,
            responseBody: exchange.responseBody
          });
          state.lpWorksheet = buildLpWorksheet(input, rpcCurrentTick);
        } catch (error) {
          runner.child.stdin.destroy();
          runner.child.kill();
          state.lpRunner = null;
          throw error;
        }
        state.phase = "lp_active";
        responseJson(response, 200, { phase: state.phase, worksheet: state.lpWorksheet });
        return;
      }

      if (url.pathname === "/api/lp/finish") {
        if (state.phase !== "lp_active" || state.lpRunner === null) {
          throw new Error("CEREMONY_PHASE_INVALID");
        }
        validateOperatorConfirmation(await requestJson(request));
        const submission = recommendedLpConclusion(state.lpWorksheet);
        const outputBody = canonicalJson({
          schemaVersion: "proofera-termix-pancake-lp-manual-output-v1.0.0",
          manualProcedureVersion: "proofera-termix-pancake-lp-manual-v1.1.0",
          operatorRole: "Repository owner using the bounded non-agent worksheet",
          inputBundleSha256: sha256(canonicalJson(await readJson(LP_INPUT_PATH))),
          agentInvoked: false,
          result: {
            ...state.lpWorksheet.position,
            decision: submission.decision,
            economicsComplete: false,
            rationale: submission.rationale,
            sourceBlockHash: state.lpWorksheet.source.blockHash,
            sourceBlockNumber: state.lpWorksheet.source.blockNumber,
            signedOrBroadcast: false
          },
          limitations: [
            "The bounded conclusion was prepared from displayed deterministic facts and accepted by the repository owner; this does not prove operator identity or independent authorship.",
            "Rebalance economics are unavailable, and this public position grants no ownership or execution authority.",
            "No agent, wallet, signature, approval, or transaction was used in this manual lane."
          ]
        });
        writeEvent(state.lpRunner, { event: "active_end", segmentId: "independent-lp-review" });
        writeEvent(state.lpRunner, { event: "output", outputBody });
        state.lpRunner.child.stdin.end();
        const completed = await state.lpRunner.completed;
        state.lpRunner = null;
        if (completed.code !== 0 || !completed.stdout.trim().endsWith(LP_OUTPUT_PATH)) {
          state.phase = "error";
          throw new Error(runnerFailureCode(completed, "CEREMONY_LP_RUNNER_FAILED"));
        }
        let commitSha;
        try {
          commitSha = await commitCapture(
            LP_OUTPUT_PATH,
            "evidence(termix): add independent LP manual half-run"
          );
        } catch (error) {
          state.phase = "capture_unpublished";
          throw error;
        }
        state.lpCapture = { path: LP_OUTPUT_PATH, commitSha };
        state.phase = "lp_done";
        responseJson(response, 200, { phase: state.phase, capture: state.lpCapture });
        return;
      }

      if (url.pathname === "/api/venus/start") {
        if (state.phase !== "lp_done") throw new Error("CEREMONY_PHASE_INVALID");
        await assertCleanPublished();
        const [declaration, input] = await Promise.all([
          readJson(VENUS_DECLARATION_PATH),
          readJson(VENUS_INPUT_PATH)
        ]);
        const runner = spawnManualRunner("venus");
        state.venusRunner = runner;
        try {
          writeEvent(runner, buildManualInvocation({ declaration, lane: "venus" }));
          writeEvent(runner, {
            event: "active_start",
            segmentId: "independent-venus-review",
            description: "Repository owner reviewed the bounded non-agent Venus integer worksheet"
          });
          const requests = [
            {
              id: `${VENUS_RUN_ID}-chain-id`,
              jsonrpc: "2.0",
              method: "eth_chainId",
              params: []
            },
            ...input.observationSeries.observations.map((observation, index) => ({
              id: `${VENUS_RUN_ID}-block-${index + 1}`,
              jsonrpc: "2.0",
              method: "eth_getBlockByNumber",
              params: [`0x${BigInt(observation.blockNumber).toString(16)}`, false]
            }))
          ];
          for (const rpcRequest of requests) {
            const exchange = await rpc(VENUS_RPC_ENDPOINT, rpcRequest);
            writeEvent(runner, {
              event: "api_exchange",
              exchangeId: rpcRequest.id,
              endpointUrl: VENUS_RPC_ENDPOINT,
              requestBody: exchange.requestBody,
              responseBody: exchange.responseBody
            });
          }
          state.venusWorksheet = buildVenusWorksheet(input);
        } catch (error) {
          runner.child.stdin.destroy();
          runner.child.kill();
          state.venusRunner = null;
          throw error;
        }
        state.phase = "venus_active";
        responseJson(response, 200, { phase: state.phase, worksheet: state.venusWorksheet });
        return;
      }

      if (url.pathname === "/api/venus/finish") {
        if (state.phase !== "venus_active" || state.venusRunner === null) {
          throw new Error("CEREMONY_PHASE_INVALID");
        }
        validateOperatorConfirmation(await requestJson(request));
        const submission = recommendedVenusConclusion(state.venusWorksheet);
        const outputBody = canonicalJson({
          schemaVersion: "proofera-termix-venus-health-manual-output-v1.0.0",
          manualProcedureVersion: "proofera-venus-health-manual-worksheet-v1.0.0",
          operatorRole: "Repository owner using the bounded non-agent worksheet",
          requestInputSha256: sha256(canonicalJson(await readJson(VENUS_INPUT_PATH))),
          agentInvoked: false,
          result: {
            account: state.venusWorksheet.account,
            chainId: state.venusWorksheet.chainId,
            decision: submission.decision,
            formula: state.venusWorksheet.formula,
            observations: state.venusWorksheet.observations,
            minimumHealthFactor: state.venusWorksheet.minimumHealthFactor,
            thresholds: state.venusWorksheet.thresholds,
            windowSeconds: state.venusWorksheet.windowSeconds,
            rationale: submission.rationale,
            signedOrBroadcast: false
          },
          limitations: [
            "The bounded conclusion was prepared from displayed deterministic facts and accepted by the repository owner; this does not prove operator identity or independent authorship.",
            "The public replay account grants no ownership or execution authority.",
            "No agent, wallet, signature, approval, or transaction was used in this manual lane."
          ]
        });
        writeEvent(state.venusRunner, {
          event: "active_end",
          segmentId: "independent-venus-review"
        });
        writeEvent(state.venusRunner, { event: "output", outputBody });
        state.venusRunner.child.stdin.end();
        const completed = await state.venusRunner.completed;
        state.venusRunner = null;
        if (completed.code !== 0 || !completed.stdout.trim().endsWith(VENUS_OUTPUT_PATH)) {
          state.phase = "error";
          throw new Error(runnerFailureCode(completed, "CEREMONY_VENUS_RUNNER_FAILED"));
        }
        let commitSha;
        try {
          commitSha = await commitCapture(
            VENUS_OUTPUT_PATH,
            "evidence(termix): add independent Venus manual half-run"
          );
        } catch (error) {
          state.phase = "capture_unpublished";
          throw error;
        }
        state.venusCapture = { path: VENUS_OUTPUT_PATH, commitSha };
        state.phase = "manual_complete";
        responseJson(response, 200, { phase: state.phase, capture: state.venusCapture });
        return;
      }

      responseJson(response, 404, { error: "CEREMONY_ROUTE_NOT_FOUND" });
    } catch (error) {
      state.error = publicError(error);
      responseJson(response, 400, { error: state.error });
    }
  });

  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolvePromise);
  });
  const actualPort = server.address().port;
  const bootstrapUrl = `http://127.0.0.1:${actualPort}/`;
  if (openBrowser) {
    const opener = spawn("explorer.exe", [bootstrapUrl], {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    opener.unref();
  }
  return { server, bootstrapUrl, port: actualPort };
}

function parseCli(args) {
  let port = 0;
  let openBrowser = true;
  for (const argument of args) {
    if (argument === "--no-open") openBrowser = false;
    else if (/^--port=[1-9][0-9]{0,4}$/.test(argument)) port = Number(argument.slice(7));
    else throw new Error("CEREMONY_ARGUMENTS_INVALID");
  }
  if (port > 65_535) throw new Error("CEREMONY_ARGUMENTS_INVALID");
  return { port, openBrowser };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  createCeremonyServer(parseCli(process.argv.slice(2)))
    .then(({ port }) => {
      process.stdout.write(`ProofEra operator ceremony is running locally on port ${port}.\n`);
      process.stdout.write("Keep this window open until both manual captures are complete.\n");
    })
    .catch((error) => {
      process.stderr.write(`${publicError(error)}\n`);
      process.exitCode = 1;
    });
}
