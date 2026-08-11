import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

async function main() {
  const inventoryPath = process.argv[2];
  const outputPath = process.argv[3];
  if (inventoryPath === undefined || outputPath === undefined) {
    throw new Error("Expected inventory and provenance output paths");
  }

  const inventory = await readFile(resolve(inventoryPath));
  JSON.parse(inventory.toString("utf8"));
  const pnpmVersion = process.env.PROOFERA_PNPM_VERSION;
  if (pnpmVersion === undefined || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pnpmVersion)) {
    throw new Error("PROOFERA_PNPM_VERSION must record the executing pnpm version");
  }
  const commit = process.env.GITHUB_SHA;
  if (commit === undefined || !/^[a-f0-9]{40}$/i.test(commit)) {
    throw new Error("GITHUB_SHA must identify the exact evidence commit");
  }

  const provenance = {
    artifact: basename(inventoryPath),
    command: "pnpm licenses list --prod --json",
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    pnpmVersion,
    repository: process.env.GITHUB_REPOSITORY ?? null,
    schemaVersion: "1",
    sha256: createHash("sha256").update(inventory).digest("hex"),
    sourceCommit: commit,
    workflowRunId: process.env.GITHUB_RUN_ID ?? null
  };
  await writeFile(resolve(outputPath), `${JSON.stringify(provenance, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx"
  });
}

try {
  await main();
} catch {
  process.stderr.write("License provenance generation failed.\n");
  process.exitCode = 1;
}
