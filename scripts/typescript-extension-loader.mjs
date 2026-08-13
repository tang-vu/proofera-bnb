import { access, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve as resolvePath, sep } from "node:path";
import { fileURLToPath } from "node:url";

import typescript from "typescript";

const RELATIVE_WITHOUT_EXTENSION = /^(?:\.\.?\/).+[^./]$/u;
const LOADER_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolvePath(dirname(LOADER_PATH), "..");
const EXACT_POOL_CLI_PATH = resolvePath(
  REPOSITORY_ROOT,
  "scripts/run-bsc-testnet-pta-wbnb-pool-initialization.ts"
);
let exactPoolAdmissionActivated = false;

const ALLOWED_PRODUCTION_SOURCE_PATHS = new Set(
  [
    "packages/integrations/src/bsc-testnet-deployer-custody-core.ts",
    "packages/integrations/src/bsc-testnet-deployer-custody-windows.server.ts",
    "packages/integrations/src/bsc-testnet-pta-deployment-envelope.ts",
    "packages/integrations/src/bsc-testnet-pta-one-shot-worker-protocol.ts",
    "packages/integrations/src/bsc-testnet-pta-signing-worker.ts",
    "packages/integrations/src/bsc-testnet-pta-unsigned-transaction.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-authorization.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-coordinator.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-initialization.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-local-journal.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-boundary.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-protocol.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-one-shot-signer-core.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-post-claim-recheck.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-private-broadcaster.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-production-authority.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-production-composition.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-production-rpc.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-production-runner.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-release-review-policy.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-signing-worker.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-submission-journal.server.ts",
    "packages/integrations/src/bsc-testnet-pta-wbnb-pool-submission-reconciler.server.ts",
    "scripts/run-bsc-testnet-pta-wbnb-pool-initialization.ts"
  ].map((path) => resolvePath(REPOSITORY_ROOT, ...path.split("/")))
);

const ALLOWED_RUNTIME_DIRECTORIES = Object.freeze(
  [
    "node_modules/.pnpm/viem@2.55.13_typescript@6.0.3_zod@4.4.3/node_modules/viem/_esm",
    "node_modules/.pnpm/ox@0.14.33_typescript@6.0.3_zod@4.4.3/node_modules/ox/_esm",
    "node_modules/.pnpm/abitype@1.2.3_typescript@6.0.3_zod@4.4.3/node_modules/abitype/dist/esm",
    "node_modules/.pnpm/abitype@1.2.4_typescript@6.0.3_zod@4.4.3/node_modules/abitype/dist/esm",
    "node_modules/.pnpm/@noble+curves@1.9.1/node_modules/@noble/curves/esm",
    "node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm",
    "node_modules/.pnpm/isows@1.0.7_ws@8.21.0/node_modules/isows/_esm",
    "node_modules/.pnpm/ws@8.21.0/node_modules/ws"
  ].map((path) => resolvePath(REPOSITORY_ROOT, ...path.split("/")))
);

const ALLOWED_RUNTIME_FILES = new Set(
  [
    "node_modules/.pnpm/server-only@0.0.1/node_modules/server-only/empty.js",
    "node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/typescript.js"
  ].map((path) => resolvePath(REPOSITORY_ROOT, ...path.split("/")))
);

function samePath(left, right) {
  return resolvePath(left).toLowerCase() === resolvePath(right).toLowerCase();
}

function isWithin(parent, candidate) {
  const local = relative(parent, candidate);
  return local === "" || (!local.startsWith(`..${sep}`) && local !== ".." && !isAbsolute(local));
}

async function assertAdmittedResolution(resolution) {
  if (resolution.url.startsWith("node:")) return resolution;
  if (!resolution.url.startsWith("file:")) throw new Error("Untrusted production module URL.");
  const path = fileURLToPath(resolution.url);
  let canonicalPath;
  try {
    canonicalPath = await realpath(path);
  } catch {
    throw new Error("Untrusted production module resolution.");
  }
  if (
    !samePath(path, canonicalPath) ||
    (!ALLOWED_PRODUCTION_SOURCE_PATHS.has(canonicalPath) &&
      !ALLOWED_RUNTIME_FILES.has(canonicalPath) &&
      !ALLOWED_RUNTIME_DIRECTORIES.some((directory) => isWithin(directory, canonicalPath)))
  ) {
    throw new Error("Untrusted production module resolution.");
  }
  return resolution;
}

async function applyExactPoolAdmission(resolution, context) {
  if (
    !exactPoolAdmissionActivated &&
    context.parentURL === undefined &&
    resolution.url.startsWith("file:") &&
    samePath(fileURLToPath(resolution.url), EXACT_POOL_CLI_PATH)
  ) {
    exactPoolAdmissionActivated = true;
  }
  return exactPoolAdmissionActivated ? assertAdmittedResolution(resolution) : resolution;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "viem" && context.parentURL?.includes("/scripts/")) {
    return applyExactPoolAdmission(
      await nextResolve(
        new URL("../packages/integrations/node_modules/viem/_esm/index.js", import.meta.url).href,
        context
      ),
      context
    );
  }
  if (context.parentURL?.startsWith("file:") && RELATIVE_WITHOUT_EXTENSION.test(specifier)) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    let candidateExists = false;
    try {
      await access(fileURLToPath(candidate));
      candidateExists = true;
    } catch {
      // Defer non-TypeScript and missing paths to Node's standard resolver.
    }
    if (candidateExists) {
      return applyExactPoolAdmission(await nextResolve(candidate.href, context), context);
    }
  }
  return applyExactPoolAdmission(await nextResolve(specifier, context), context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(".ts")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    const transformed = typescript.transpileModule(source, {
      compilerOptions: {
        module: typescript.ModuleKind.ESNext,
        target: typescript.ScriptTarget.ES2023,
        verbatimModuleSyntax: true
      },
      fileName: fileURLToPath(url),
      reportDiagnostics: false
    });
    return { format: "module", shortCircuit: true, source: transformed.outputText };
  }
  return nextLoad(url, context);
}
