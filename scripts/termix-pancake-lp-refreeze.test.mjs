import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bytes = await readFile(
  new URL("../evidence/termix/declarations/pancake-lp/68dc21421c60-125719944.json", import.meta.url)
);
const prettierIgnore = await readFile(new URL("../.prettierignore", import.meta.url), "utf8");
const frozen = JSON.parse(bytes.toString("utf8"));

test("retained late LP re-freeze remains non-result preparation", () => {
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

const replacementBytes = await readFile(
  new URL("../evidence/termix/declarations/pancake-lp/6e657638c684-125722978.json", import.meta.url)
);
const replacement = JSON.parse(replacementBytes.toString("utf8"));

test("replacement LP re-freeze preserves input with a larger future-block margin", () => {
  assert.equal(
    createHash("sha256").update(replacementBytes).digest("hex"),
    "58a5fa936ef6598efc4919e73a5fd7576f1ba7fbc4a6be387c221129cd7a5086"
  );
  assert.equal(replacement.sourceCommitSha, "6e657638c6846e909171b3abd365c396da5f4d53");
  assert.equal(replacement.input.sha256, frozen.input.sha256);
  assert.equal(replacement.randomnessCommitment.blockNumber, "125722978");
  assert.equal(
    replacement.declarationSha256,
    "811f485549e1894ed237d167d85cd17f33610fac951c13862e07f09daa815df9"
  );
  assert.equal(replacement.claims.runOrderResolved, false);
  assert.equal(replacement.claims.result, false);
  assert.match(
    prettierIgnore,
    /^evidence\/termix\/declarations\/pancake-lp\/6e657638c684-125722978\.json$/mu
  );
});

const archiveReplacementBytes = await readFile(
  new URL("../evidence/termix/declarations/pancake-lp/fd5d0e54eb0f-125727528.json", import.meta.url)
);
const archiveReplacement = JSON.parse(archiveReplacementBytes.toString("utf8"));

test("archive LP re-freeze preserves input and binds the reviewed replay endpoint", () => {
  assert.equal(
    createHash("sha256").update(archiveReplacementBytes).digest("hex"),
    "542acfce857ce4036f97db9693f128ba26e9f41d803189618a56acaa4f9a6049"
  );
  assert.equal(archiveReplacement.sourceCommitSha, "fd5d0e54eb0f61ce2aa411cf695fffbf17586798");
  assert.equal(archiveReplacement.input.sha256, frozen.input.sha256);
  assert.equal(archiveReplacement.randomnessCommitment.blockNumber, "125727528");
  assert.equal(
    archiveReplacement.declarationSha256,
    "8ceacb8b116af3e97873185888835bd48ed0862771db66aad0f93e3275769a4f"
  );
  const replayEndpoint = archiveReplacement.declaration.environment.parameters.find(
    ({ key }) => key === "lp-source-rpc-endpoint"
  );
  assert.equal(replayEndpoint?.value.value, "https://bnb.api.onfinality.io/public");
  assert.equal(archiveReplacement.claims.runOrderResolved, false);
  assert.equal(archiveReplacement.claims.result, false);
  assert.match(
    prettierIgnore,
    /^evidence\/termix\/declarations\/pancake-lp\/fd5d0e54eb0f-125727528\.json$/mu
  );
});
