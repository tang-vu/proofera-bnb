import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bytes = await readFile(
  new URL("../evidence/termix/declarations/pancake-lp/68dc21421c60-125719944.json", import.meta.url)
);
const prettierIgnore = await readFile(new URL("../.prettierignore", import.meta.url), "utf8");
const frozen = JSON.parse(bytes.toString("utf8"));

test("LP re-freeze preserves input and commits future randomness without result claims", () => {
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "d0b3159e35c01e8e1c2a50f6d6898aa37cec38bae60cf9cfb06e139e545bb1aa"
  );
  assert.equal(frozen.sourceCommitSha, "68dc21421c60f5e9ec06e51948c1d7c7901c3191");
  assert.equal(
    frozen.input.sha256,
    "3459eb2566621c4d74acef68c84849e59b74214c7a21d7d20b8bbc6352dda945"
  );
  assert.equal(frozen.randomnessCommitment.blockNumber, "125719944");
  assert.equal(
    frozen.declarationSha256,
    "ecbf0b89674f9d5070ec23675fc3bbe3be91c8c4c559eb2a5e737bd35f39712b"
  );
  assert.equal(frozen.claims.runOrderResolved, false);
  assert.equal(frozen.claims.agentRun, false);
  assert.equal(frozen.claims.manualRun, false);
  assert.equal(frozen.claims.result, false);
  assert.match(
    prettierIgnore,
    /^evidence\/termix\/declarations\/pancake-lp\/68dc21421c60-125719944\.json$/mu
  );
});
