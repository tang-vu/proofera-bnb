import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const temporaryPrefix = "proofera-license-evidence-test-";
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function removeTemporaryDirectory(directory) {
  const absolute = resolve(directory);
  if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith(temporaryPrefix)) {
    throw new Error("Refusing to remove a directory outside the license test boundary");
  }
  await rm(absolute, { force: true, recursive: true });
}

test("writes checksum- and commit-bound license provenance outside the repository", async () => {
  const directory = await mkdtemp(join(tmpdir(), temporaryPrefix));
  try {
    const inventoryPath = join(directory, "production-licenses.json");
    const provenancePath = join(directory, "production-license-provenance.json");
    const inventory = `${JSON.stringify({ MIT: [] }, null, 2)}\n`;
    await writeFile(inventoryPath, inventory);

    const sourceCommit = "a".repeat(40);
    await execFile(
      process.execPath,
      ["scripts/create-license-provenance.mjs", inventoryPath, provenancePath],
      {
        cwd: workspace,
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "synthetic/proofera",
          GITHUB_RUN_ID: "1",
          GITHUB_SHA: sourceCommit,
          PROOFERA_PNPM_VERSION: "11.20.0"
        },
        windowsHide: true
      }
    );

    const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
    assert.equal(provenance.schemaVersion, "1");
    assert.equal(provenance.sourceCommit, sourceCommit);
    assert.equal(
      provenance.sha256,
      createHash("sha256").update(Buffer.from(inventory)).digest("hex")
    );
    assert.equal(provenance.artifact, "production-licenses.json");
  } finally {
    await removeTemporaryDirectory(directory);
  }
});
