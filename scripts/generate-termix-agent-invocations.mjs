import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const HIRE_PATH = "evidence/termix/hire-receipts/125715654-7fa5ad3e.json";
const REGISTRY_SOURCE_URL =
  "https://testnet.bscscan.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e";
const PROTOCOL_VERSION = "proofera-termix-timed-runner-v1.0.0";

const lanes = [
  {
    laneId: "pancake-lp-v1",
    taskId: "pancake-lp-range-decision",
    declarationPath: "evidence/termix/declarations/pancake-lp/2137d7a962db-125555414.json",
    runOrderPath: "evidence/termix/declarations/pancake-lp/2137d7a962db-125555414.run-order.json",
    runId: "pancake-lp-agent-20260818-v1",
    runnerId: "pancake-lp-agent-v1",
    label: "Registered ProofEra LP Range agent",
    componentName: "proofera-lp-range-agent-lane",
    digestKey: "inputBundleSha256",
    outputPath: "evidence/termix/invocations/pancake-lp-agent-20260818-v1.canonical-json"
  },
  {
    laneId: "pancake-lp-v2",
    taskId: "pancake-lp-range-decision",
    declarationPath: "evidence/termix/declarations/pancake-lp/6e657638c684-125722978.json",
    runOrderPath: "evidence/termix/declarations/pancake-lp/6e657638c684-125722978.run-order.json",
    runId: "pancake-lp-agent-20260818-v2",
    runnerId: "pancake-lp-agent-v1",
    label: "Registered ProofEra LP Range agent",
    componentName: "proofera-lp-range-agent-lane",
    digestKey: "inputBundleSha256",
    outputPath: "evidence/termix/invocations/pancake-lp-agent-20260818-v2.canonical-json"
  },
  {
    laneId: "pancake-lp-v3",
    taskId: "pancake-lp-range-decision",
    declarationPath: "evidence/termix/declarations/pancake-lp/fd5d0e54eb0f-125727528.json",
    runOrderPath: "evidence/termix/declarations/pancake-lp/fd5d0e54eb0f-125727528.run-order.json",
    runId: "pancake-lp-agent-20260818-v3",
    runnerId: "pancake-lp-agent-v1",
    label: "Registered ProofEra LP Range agent",
    componentName: "proofera-lp-range-agent-lane",
    digestKey: "inputBundleSha256",
    outputPath: "evidence/termix/invocations/pancake-lp-agent-20260818-v3.canonical-json"
  },
  {
    laneId: "venus-health-v1",
    taskId: "venus-health-factor-decision",
    declarationPath: "evidence/termix/declarations/venus-health/3ba85859ced3-125568071.json",
    runOrderPath: "evidence/termix/declarations/venus-health/3ba85859ced3-125568071.run-order.json",
    runId: "venus-health-agent-20260818-v1",
    runnerId: "venus-health-agent-v1",
    label: "Registered ProofEra Health-Factor Guardian",
    componentName: "proofera-health-factor-guardian",
    digestKey: "requestInputSha256",
    outputPath: "evidence/termix/invocations/venus-health-agent-20260818-v1.canonical-json"
  }
];

function selectedLane(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (
    normalized.length !== 2 ||
    normalized[0] !== "--lane" ||
    !/^[a-z0-9-]+$/u.test(normalized[1])
  ) {
    throw new Error("TERMIX_AGENT_INVOCATION_ARGUMENTS_INVALID");
  }
  const lane = lanes.find((candidate) => candidate.laneId === normalized[1]);
  if (lane === undefined) throw new Error("TERMIX_AGENT_INVOCATION_LANE_INVALID");
  return lane;
}

async function json(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function writeExclusive(path, body) {
  const absolute = resolve(ROOT, path);
  await mkdir(dirname(absolute), { recursive: true });
  const handle = await open(absolute, "wx", 0o600);
  try {
    await handle.writeFile(`${body}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

const hireEvidence = await json(HIRE_PATH);
const lane = selectedLane(process.argv.slice(2));

{
  const frozen = await json(lane.declarationPath);
  const order = await json(lane.runOrderPath);
  if (order.randomness.runOrder.join(",") !== "agent,manual") {
    throw new Error("TERMIX_AGENT_INVOCATION_ORDER_INVALID");
  }
  const hire = hireEvidence.hires.find((candidate) => candidate.slug === lane.taskId);
  if (hire === undefined || hire.agentId !== frozen.registeredAgent.agentId) {
    throw new Error("TERMIX_AGENT_INVOCATION_HIRE_INVALID");
  }
  const component = frozen.declaration.environment.components.find(
    (candidate) => candidate.name === lane.componentName
  );
  if (component?.configurationSha256 === null || component?.configurationSha256 === undefined) {
    throw new Error("TERMIX_AGENT_INVOCATION_CONFIGURATION_INVALID");
  }
  const timedRunRequest = {
    protocolVersion: PROTOCOL_VERSION,
    runId: lane.runId,
    runnerId: lane.runnerId,
    declaration: frozen.declaration,
    declarationSha256: frozen.declarationSha256,
    method: {
      kind: "agent",
      label: lane.label,
      marketplace: "ProofEra",
      runtime: "self-hosted TypeScript A2A analyzer",
      configurationSha256: component.configurationSha256,
      agentReference: {
        state: "registered",
        standard: "ERC-8004",
        chainId: frozen.registeredAgent.chainId,
        registryAddress: frozen.registeredAgent.registryAddress,
        agentId: frozen.registeredAgent.agentId,
        registrySourceUrl: REGISTRY_SOURCE_URL
      }
    },
    sourceCommitSha: frozen.sourceCommitSha,
    repositoryClean: true,
    hireReceipt: hire.termixHireReceipt
  };
  await writeExclusive(
    lane.outputPath,
    canonicalJson({ [lane.digestKey]: frozen.input.sha256, timedRunRequest })
  );
  process.stdout.write(`${lane.outputPath}\n`);
}
