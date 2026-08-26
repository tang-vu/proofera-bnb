import { createHash } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFixedOfficialBscTestnetPtaWbnbLpRpcClients,
  prepareBscTestnetPtaWbnbLpExactScope
} from "../packages/integrations/src/bsc-testnet-pta-wbnb-lp-exact-scope.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXACT_FLAG = "--capture-read-only-exact-scope";
const SOURCE_COMMIT_FLAG = "--source-commit";

function parseArguments(arguments_: readonly string[]): string {
  if (
    arguments_.length !== 3 ||
    arguments_[0] !== EXACT_FLAG ||
    arguments_[1] !== SOURCE_COMMIT_FLAG ||
    !/^[0-9a-f]{40}$/u.test(arguments_[2] ?? "")
  ) {
    throw new Error(`Usage: ${EXACT_FLAG} ${SOURCE_COMMIT_FLAG} <exact-lowercase-40-hex-commit>`);
  }
  return arguments_[2] as string;
}

async function writeCreateOnly(path: string, bytes: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes, { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function main(): Promise<void> {
  const sourceCommit = parseArguments(process.argv.slice(2));
  const clients = createFixedOfficialBscTestnetPtaWbnbLpRpcClients();
  const scope = await prepareBscTestnetPtaWbnbLpExactScope({
    ...clients,
    now: () => new Date(),
    sourceCommit
  });
  const blockNumber = (scope.observation as { commonBlockNumber: string }).commonBlockNumber;
  const relativePath = `evidence/development/bsc-testnet-pta-wbnb-lp-exact-scope-${blockNumber}.json`;
  const bytes = `${JSON.stringify(scope, null, 2)}\n`;
  await writeCreateOnly(resolve(ROOT, relativePath), bytes);
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "prepared_not_authorized",
        path: relativePath,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        exactScopeSha256: scope.exactScopeSha256,
        scopeExpiresAt: scope.scopeExpiresAt,
        signingAuthorized: false,
        broadcastAuthorized: false
      },
      null,
      2
    )}\n`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown LP scope preparation failure.";
  process.stderr.write(`Pancake LP exact-scope preparation failed: ${message}\n`);
  process.exitCode = 1;
});
