import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildLpWorksheet,
  buildManualInvocation,
  buildVenusWorksheet,
  canonicalJson,
  createCeremonyServer,
  recommendedLpConclusion,
  recommendedVenusConclusion,
  runnerFailureCode
} from "./operator-ceremony-server.mjs";

const ROOT = resolve(import.meta.dirname, "..");

async function json(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

test("manual invocations retain the frozen declarations and no hire receipt", async () => {
  const lp = await json("evidence/termix/declarations/pancake-lp/f8b57f2b1842-125735511.json");
  const venus = await json("evidence/termix/declarations/venus-health/3ba85859ced3-125568071.json");
  const lpInvocation = buildManualInvocation({ declaration: lp, lane: "lp" });
  const venusInvocation = buildManualInvocation({ declaration: venus, lane: "venus" });

  assert.equal(lpInvocation.timedRunRequest.hireReceipt, null);
  assert.equal(lpInvocation.timedRunRequest.method.kind, "manual");
  assert.equal(lpInvocation.timedRunRequest.declarationSha256, lp.declarationSha256);
  assert.equal(venusInvocation.timedRunRequest.hireReceipt, null);
  assert.equal(venusInvocation.timedRunRequest.method.kind, "manual");
  assert.equal(venusInvocation.timedRunRequest.declarationSha256, venus.declarationSha256);
});

test("worksheets recompute source-bound LP and Venus integer values without agent output", async () => {
  const lpInput = await json("evidence/termix/frozen/pancake-lp/116342186-7152618.canonical-json");
  const venusInput = await json(
    "evidence/termix/frozen/venus-health/3ba85859ced3-125563831-125564152.canonical-json"
  );
  const lp = buildLpWorksheet(lpInput, -64059);
  const venus = buildVenusWorksheet(venusInput);

  assert.equal(
    createHash("sha256").update(canonicalJson(lpInput)).digest("hex"),
    "3459eb2566621c4d74acef68c84849e59b74214c7a21d7d20b8bbc6352dda945"
  );
  assert.equal(
    createHash("sha256").update(canonicalJson(venusInput)).digest("hex"),
    "2aae6eb07730c2dc6bd6333261e57a6d352fc7ea21572ef5f71c3652b194c7ba"
  );

  assert.deepEqual(lp.position, {
    positionId: "7152618",
    lowerTick: -64060,
    currentTick: -64059,
    upperTick: -64050,
    tickSpacing: 10,
    rangeWidthTicks: 10,
    fromLowerTick: 1,
    toUpperExclusiveTick: 9,
    inRange: true
  });
  assert.equal(venus.observations.length, 3);
  assert.equal(venus.minimumHealthFactor.scaledValueFloor, "2555658499393988648");
  assert.equal(venus.windowSeconds, 144);
  assert.equal(recommendedLpConclusion(lp).decision, "insufficient_evidence");
  assert.equal(recommendedVenusConclusion(venus).decision, "hold");
});

test("local server rejects requests without its bootstrap session", async (context) => {
  const instance = await createCeremonyServer({ openBrowser: false });
  context.after(() => new Promise((resolvePromise) => instance.server.close(resolvePromise)));

  const response = await fetch(`http://127.0.0.1:${instance.port}/api/state`);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("x-frame-options"), "DENY");

  const bootstrap = await fetch(instance.bootstrapUrl, { redirect: "manual" });
  assert.equal(bootstrap.status, 303);
  assert.match(bootstrap.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);

  const cookie = bootstrap.headers.get("set-cookie").split(";", 1)[0];
  const page = await fetch(`http://127.0.0.1:${instance.port}/`, {
    headers: { cookie }
  });
  assert.equal(page.status, 200);
  const html = await page.text();
  const csrfToken = html.match(/name="csrf-token" content="([0-9a-f]+)"/)?.[1];
  assert.equal(csrfToken?.length, 48);

  const crossOriginWrite = await fetch(`http://127.0.0.1:${instance.port}/api/lp/start`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", "x-csrf-token": csrfToken },
    body: "{}"
  });
  assert.equal(crossOriginWrite.status, 403);
  assert.deepEqual(await crossOriginWrite.json(), { error: "CEREMONY_REQUEST_AUTH_INVALID" });
});

test("loopback root recovers a browser session without a query token", async (context) => {
  const instance = await createCeremonyServer({ openBrowser: false });
  context.after(() => new Promise((resolvePromise) => instance.server.close(resolvePromise)));

  const recovery = await fetch(`http://127.0.0.1:${instance.port}/`, { redirect: "manual" });
  assert.equal(recovery.status, 303);
  assert.equal(recovery.headers.get("location"), "/");
  assert.match(recovery.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);

  const cookie = recovery.headers.get("set-cookie").split(";", 1)[0];
  const page = await fetch(`http://127.0.0.1:${instance.port}/`, { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /ProofEra operator ceremony/);
});

test("canonical serializer is deterministic for nested worksheet output", () => {
  assert.equal(canonicalJson({ z: 2, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"z":2}');
});

test("runner failures retain only the sanitized CLI code", () => {
  assert.equal(
    runnerFailureCode(
      {
        stderr:
          "TermiX Venus Health manual runner failed: TERMIX_VENUS_MANUAL_RPC_RESPONSE_INVALID\n"
      },
      "CEREMONY_VENUS_RUNNER_FAILED"
    ),
    "TERMIX_VENUS_MANUAL_RPC_RESPONSE_INVALID"
  );
  assert.equal(
    runnerFailureCode({ stderr: "untrusted detail" }, "CEREMONY_VENUS_RUNNER_FAILED"),
    "CEREMONY_VENUS_RUNNER_FAILED"
  );
});
