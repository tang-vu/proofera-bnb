import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { stdin, stdout } from "node:process";
import { isProxy } from "node:util/types";

import { keccak256, type Hex } from "viem";

import {
  authenticateBscTestnetPtaWbnbPoolGeneration10InstantiationForInternalUse,
  consumeBscTestnetPtaWbnbPoolGeneration10InstantiationForInternalUse,
  type BscTestnetPtaWbnbPoolGeneration10RuntimeReviewInstantiation
} from "./bsc-testnet-pta-wbnb-pool-generation-10-policy.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_LIMIT,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_PRICE_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_MAXIMUM_COST_WEI,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256,
  BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
  type BscTestnetPtaWbnbPoolGeneration10PredecessorBinding
} from "./bsc-testnet-pta-wbnb-pool-generation-10-recovery";
import {
  BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER,
  BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256,
  BSC_TESTNET_PTA_WBNB_POOL_SENDER
} from "./bsc-testnet-pta-wbnb-pool-initialization";
import type { BscTestnetPtaWbnbPoolExactReleaseIdentity } from "./bsc-testnet-pta-wbnb-pool-release-review-policy.server";
import {
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
  BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
  type BscTestnetPtaWbnbPoolSubmissionCapability
} from "./bsc-testnet-pta-wbnb-pool-submission-reconciler.server";

export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_OWNER_CONFIRMATION_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-existing-signature-owner-exact-byte-confirmation:v13" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_EXECUTION_FLAG =
  "I_EXPLICITLY_AUTHORIZE_ONE_EXACT_EXISTING_GEN9_SIGNATURE_BROADCAST_ON_BSC_TESTNET_CHAIN_97" as const;
export const BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_OWNER_TEXT_DOMAIN =
  "ProofEra:bsc-testnet-pta-wbnb-pool-existing-signature-owner-authorization:v13" as const;

const DECISION =
  "CONFIRM_GENERATION_10_EXISTING_SIGNATURE_ONE_SEND_NO_NEW_SIGNATURE_NO_RETRY_NO_REPLACEMENT" as const;
const MAXIMUM_CONFIRMATION_BYTES = 1_536;
const MAXIMUM_CHALLENGE_BYTES = 8_192;
const CONFIRMATION_WINDOW_MILLISECONDS = 4 * 60 * 1_000;
const EXECUTION_LIFETIME_MILLISECONDS = 2 * 60 * 1_000;
const BYTES32 = /^0x[0-9a-f]{64}$/u;
const GIT_OBJECT = /^[0-9a-f]{40}$/u;

type CommandState = Readonly<{
  authenticatedAt: string;
  expiresAt: string;
  ownerAuthorizationDigest: Hex;
  instantiation: BscTestnetPtaWbnbPoolGeneration10RuntimeReviewInstantiation;
  predecessor: BscTestnetPtaWbnbPoolGeneration10PredecessorBinding;
  release: BscTestnetPtaWbnbPoolExactReleaseIdentity;
}>;

type CapabilityState = { readonly binding: string; consumed: boolean };

const commands = new WeakMap<object, CommandState>();
const capabilities = new WeakMap<object, CapabilityState>();
let ceremonyAttempted = false;

export interface BscTestnetPtaWbnbPoolGeneration10OwnerCommand {
  readonly schemaVersion: 13;
  readonly kind: "authorize_existing_generation_9_signature_broadcast_v13";
  readonly executionFlag: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_EXECUTION_FLAG;
  readonly transactionHash: typeof BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH;
  readonly runtimeReviewInstantiationDigest: Hex;
  readonly predecessorBundleDigest: Hex;
  readonly ownerAuthorizationTextSha256: Hex;
  readonly ceremonyNonce: Hex;
  readonly newSignatureAuthorized: false;
  readonly maximumAdditionalSignatures: "0";
  readonly maximumSends: "1";
}

export type BscTestnetPtaWbnbPoolGeneration10OwnerCeremonyResult =
  | Readonly<{
      status: "confirmed";
      command: BscTestnetPtaWbnbPoolGeneration10OwnerCommand;
      issue: null;
    }>
  | Readonly<{
      status: "blocked";
      command: null;
      issue: Readonly<{ code: string; message: string }>;
    }>;

function blocked(
  code: string,
  message: string
): BscTestnetPtaWbnbPoolGeneration10OwnerCeremonyResult {
  return Object.freeze({
    status: "blocked" as const,
    command: null,
    issue: Object.freeze({ code, message })
  });
}

function sha256(value: string): Hex {
  return `0x${createHash("sha256").update(value, "utf8").digest("hex")}` as Hex;
}

function exactDate(value: Date): number | null {
  try {
    if (isProxy(value) || Object.getPrototypeOf(value) !== Date.prototype) return null;
    const milliseconds = value.getTime();
    return Number.isSafeInteger(milliseconds) ? milliseconds : null;
  } catch {
    return null;
  }
}

function exactRelease(value: BscTestnetPtaWbnbPoolExactReleaseIdentity): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !isProxy(value) &&
    GIT_OBJECT.test(value.releaseCommit) &&
    GIT_OBJECT.test(value.releaseTree) &&
    BYTES32.test(value.runtimeManifest.runtimeManifestSha256)
  );
}

export function buildBscTestnetPtaWbnbPoolGeneration10OwnerChallengeForInternalUse(input: {
  readonly instantiation: BscTestnetPtaWbnbPoolGeneration10RuntimeReviewInstantiation;
  readonly predecessor: BscTestnetPtaWbnbPoolGeneration10PredecessorBinding;
  readonly release: BscTestnetPtaWbnbPoolExactReleaseIdentity;
  readonly ceremonyNonce: Hex;
  readonly challengeIssuedAt: string;
  readonly confirmationNotAfter: string;
}): Readonly<{
  ownerAuthorizationText: string;
  ownerAuthorizationTextSha256: Hex;
  ownerConfirmationText: string;
}> | null {
  const issued = Date.parse(input.challengeIssuedAt);
  const notAfter = Date.parse(input.confirmationNotAfter);
  if (
    !authenticateBscTestnetPtaWbnbPoolGeneration10InstantiationForInternalUse(
      input.instantiation
    ) ||
    !exactRelease(input.release) ||
    input.predecessor.transactionHash !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH ||
    input.instantiation.predecessorBundleDigest !== input.predecessor.predecessorBundleDigest ||
    input.instantiation.releaseCommit !== input.release.releaseCommit ||
    input.instantiation.releaseTree !== input.release.releaseTree ||
    input.instantiation.runtimeManifestSha256 !==
      input.release.runtimeManifest.runtimeManifestSha256 ||
    !BYTES32.test(input.ceremonyNonce) ||
    !Number.isSafeInteger(issued) ||
    !Number.isSafeInteger(notAfter) ||
    notAfter <= issued ||
    notAfter - issued > CONFIRMATION_WINDOW_MILLISECONDS
  ) {
    return null;
  }
  const ownerAuthorizationText = [
    BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_OWNER_TEXT_DOMAIN,
    `decision=${DECISION}`,
    `executionFlag=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_EXECUTION_FLAG}`,
    "environment=bsc-testnet",
    "chainId=97",
    `from=${BSC_TESTNET_PTA_WBNB_POOL_SENDER}`,
    "nonce=9",
    `to=${BSC_TESTNET_PANCAKE_V3_POSITION_MANAGER}`,
    `dataKeccak256=${BSC_TESTNET_PTA_WBNB_POOL_INITIALIZER_DATA_KECCAK256}`,
    "valueWei=0",
    `gasLimit=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_LIMIT}`,
    `gasPriceWei=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_GAS_PRICE_WEI}`,
    `maximumCostWei=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_MAXIMUM_COST_WEI}`,
    `transactionHash=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH}`,
    `predecessorSignedCommitSha256=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256}`,
    `predecessorBundleDigest=${input.predecessor.predecessorBundleDigest}`,
    `releaseCommit=${input.release.releaseCommit}`,
    `releaseTree=${input.release.releaseTree}`,
    `runtimeManifestSha256=${input.release.runtimeManifest.runtimeManifestSha256}`,
    `releaseReviewPolicyDigest=${input.instantiation.policyDigest}`,
    `runtimeReviewInstantiationDigest=${input.instantiation.instantiationDigest}`,
    `reviewedSubjectSha256=${input.instantiation.reviewedSubjectSha256}`,
    `ceremonyNonce=${input.ceremonyNonce}`,
    `challengeIssuedAt=${input.challengeIssuedAt}`,
    `confirmationNotAfter=${input.confirmationNotAfter}`,
    "existingSignatureOnly=true",
    "newSignatureAuthorized=false",
    "maximumAdditionalSignatures=0",
    "maximumSends=1",
    "durableSubmissionStartedBeforeSendRequired=true",
    "freshOfficialDualRpcBeforeStartRequired=true",
    "freshOfficialDualRpcAfterStartRequired=true",
    "restartAfterStartIsReconciliationOnly=true",
    "risk.initializerHasNoDeadline=true",
    "risk.publicMempoolCanRace=true",
    "risk.noRetryNoReplacementAfterSubmissionStarted=true",
    "liquidityActionAuthorized=false",
    "lpPositionMintAuthorized=false",
    "tokenApprovalAuthorized=false",
    "tokenTransferAuthorized=false",
    "mainnetWriteAuthorized=false",
    "ack.reviewIdentityIsNotCryptographicallyAuthenticated=true",
    "ack.reviewersDidNotInspectExactRuntimeEnvelope=true",
    "ack.reviewIsNotOwnerBroadcastAuthorization=true"
  ].join("\n");
  const ownerAuthorizationTextSha256 = sha256(ownerAuthorizationText);
  const ownerConfirmationText = [
    BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_OWNER_CONFIRMATION_DOMAIN,
    `executionFlag=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_EXECUTION_FLAG}`,
    `ownerAuthorizationTextSha256=${ownerAuthorizationTextSha256}`,
    `policyDigest=${input.instantiation.policyDigest}`,
    `runtimeReviewInstantiationDigest=${input.instantiation.instantiationDigest}`,
    `predecessorBundleDigest=${input.predecessor.predecessorBundleDigest}`,
    `transactionHash=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH}`,
    `predecessorSignedCommitSha256=${BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_PREDECESSOR_SIGNED_COMMIT_SHA256}`,
    `releaseCommit=${input.release.releaseCommit}`,
    `ceremonyNonce=${input.ceremonyNonce}`,
    `decision=${DECISION}`
  ].join("|");
  return Buffer.byteLength(ownerAuthorizationText, "utf8") <= MAXIMUM_CHALLENGE_BYTES &&
    Buffer.byteLength(ownerConfirmationText, "utf8") <= MAXIMUM_CONFIRMATION_BYTES
    ? Object.freeze({
        ownerAuthorizationText,
        ownerAuthorizationTextSha256,
        ownerConfirmationText
      })
    : null;
}

async function writeChallenge(value: Buffer): Promise<void> {
  if (
    stdin.isTTY !== true ||
    stdout.isTTY !== true ||
    stdin.readableEncoding !== null ||
    stdin.listenerCount("data") !== 0 ||
    stdin.listenerCount("readable") !== 0 ||
    stdin.readableLength !== 0 ||
    stdin.readableFlowing === true ||
    value.byteLength > MAXIMUM_CHALLENGE_BYTES
  ) {
    throw new Error("TTY_UNAVAILABLE");
  }
  await new Promise<void>((resolvePromise, rejectPromise) => {
    stdout.write(value, (error) => (error ? rejectPromise(error) : resolvePromise()));
  });
}

async function readExactLine(notAfter: number): Promise<Buffer> {
  const remaining = notAfter - Date.now();
  if (remaining <= 0 || stdin.readableLength !== 0 || stdin.listenerCount("data") !== 0) {
    throw new Error("TTY_UNAVAILABLE");
  }
  return new Promise<Buffer>((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    let length = 0;
    let settled = false;
    const wipe = (): void => chunks.forEach((chunk) => chunk.fill(0));
    const cleanup = (): void => {
      clearTimeout(timer);
      stdin.off("data", onData);
      stdin.off("error", fail);
      stdin.pause();
    };
    const fail = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      wipe();
      rejectPromise(new Error("TTY_INPUT_INVALID"));
    };
    const finish = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      const result = Buffer.concat(chunks, length);
      wipe();
      resolvePromise(result);
    };
    const onData = (untrusted: unknown): void => {
      if (settled || !Buffer.isBuffer(untrusted)) return fail();
      const newline = untrusted.indexOf(0x0a);
      let contentLength = newline < 0 ? untrusted.byteLength : newline;
      if (newline >= 0 && contentLength > 0 && untrusted[contentLength - 1] === 0x0d) {
        contentLength -= 1;
      }
      const content = untrusted.subarray(0, contentLength);
      if (
        length + content.byteLength > MAXIMUM_CONFIRMATION_BYTES ||
        [...content].some((byte) => byte < 0x20 || byte > 0x7e) ||
        (newline >= 0 && newline + 1 !== untrusted.byteLength)
      ) {
        return fail();
      }
      chunks.push(Buffer.from(content));
      length += content.byteLength;
      if (newline >= 0) finish();
    };
    const timer = setTimeout(fail, remaining);
    stdin.once("error", fail);
    stdin.on("data", onData);
    stdin.resume();
  });
}

export async function conductBscTestnetPtaWbnbPoolGeneration10OwnerCeremonyForInternalUse(input: {
  readonly instantiation: BscTestnetPtaWbnbPoolGeneration10RuntimeReviewInstantiation;
  readonly predecessor: BscTestnetPtaWbnbPoolGeneration10PredecessorBinding;
  readonly release: BscTestnetPtaWbnbPoolExactReleaseIdentity;
}): Promise<BscTestnetPtaWbnbPoolGeneration10OwnerCeremonyResult> {
  if (ceremonyAttempted)
    return blocked("CEREMONY_ALREADY_ATTEMPTED", "Owner ceremony is one-shot.");
  ceremonyAttempted = true;
  const issued = exactDate(new Date());
  if (issued === null) return blocked("CLOCK_INVALID", "Owner ceremony clock is invalid.");
  const notAfter = issued + CONFIRMATION_WINDOW_MILLISECONDS;
  const nonceBytes = randomBytes(32);
  const ceremonyNonce = `0x${nonceBytes.toString("hex")}` as Hex;
  nonceBytes.fill(0);
  const challenge = buildBscTestnetPtaWbnbPoolGeneration10OwnerChallengeForInternalUse({
    ...input,
    ceremonyNonce,
    challengeIssuedAt: new Date(issued).toISOString(),
    confirmationNotAfter: new Date(notAfter).toISOString()
  });
  if (challenge === null)
    return blocked("OWNER_CHALLENGE_INVALID", "Owner challenge is not exact.");
  const display = Buffer.from(
    [
      "----- BEGIN PROOFERA EXISTING-SIGNATURE OWNER AUTHORIZATION -----",
      challenge.ownerAuthorizationText,
      "----- END PROOFERA EXISTING-SIGNATURE OWNER AUTHORIZATION -----",
      "Paste exactly the following single UTF-8 confirmation line, then press Enter:",
      challenge.ownerConfirmationText,
      ""
    ].join("\n"),
    "utf8"
  );
  const expected = Buffer.from(challenge.ownerConfirmationText, "utf8");
  let received: Buffer | null = null;
  try {
    await writeChallenge(display);
    received = await readExactLine(notAfter);
    if (received.byteLength !== expected.byteLength || !timingSafeEqual(received, expected)) {
      return blocked(
        "OWNER_CONFIRMATION_INVALID",
        "Exact owner confirmation bytes were not received."
      );
    }
    const confirmed = exactDate(new Date());
    if (confirmed === null || confirmed < issued || confirmed >= notAfter) {
      return blocked(
        "OWNER_CONFIRMATION_EXPIRED",
        "Owner confirmation arrived outside its bounded window."
      );
    }
    if (!consumeBscTestnetPtaWbnbPoolGeneration10InstantiationForInternalUse(input.instantiation)) {
      return blocked(
        "RUNTIME_REVIEW_INSTANTIATION_INVALID",
        "Runtime review instantiation was not consumable."
      );
    }
    const authenticatedAt = new Date(confirmed).toISOString();
    const expiresAt = new Date(confirmed + EXECUTION_LIFETIME_MILLISECONDS).toISOString();
    const command = Object.freeze({
      schemaVersion: 13 as const,
      kind: "authorize_existing_generation_9_signature_broadcast_v13" as const,
      executionFlag: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_EXECUTION_FLAG,
      transactionHash: BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH,
      runtimeReviewInstantiationDigest: input.instantiation.instantiationDigest,
      predecessorBundleDigest: input.predecessor.predecessorBundleDigest,
      ownerAuthorizationTextSha256: challenge.ownerAuthorizationTextSha256,
      ceremonyNonce,
      newSignatureAuthorized: false as const,
      maximumAdditionalSignatures: "0" as const,
      maximumSends: "1" as const
    });
    commands.set(
      command,
      Object.freeze({
        authenticatedAt,
        expiresAt,
        ownerAuthorizationDigest: challenge.ownerAuthorizationTextSha256,
        instantiation: input.instantiation,
        predecessor: input.predecessor,
        release: input.release
      })
    );
    return Object.freeze({ status: "confirmed" as const, command, issue: null });
  } catch {
    return blocked(
      "OWNER_CEREMONY_FAILED",
      "The bounded controlling-TTY owner ceremony failed closed."
    );
  } finally {
    display.fill(0);
    expected.fill(0);
    received?.fill(0);
  }
}

export function issueBscTestnetPtaWbnbPoolGeneration10SubmissionCapabilityForInternalUse(input: {
  readonly command: BscTestnetPtaWbnbPoolGeneration10OwnerCommand;
  readonly predecessorCapability: BscTestnetPtaWbnbPoolSubmissionCapability;
  readonly preSubmission: BscTestnetPtaWbnbPoolSubmissionCapability["preSubmission"];
}): BscTestnetPtaWbnbPoolSubmissionCapability | null {
  const state = commands.get(input.command);
  commands.delete(input.command);
  const now = Date.now();
  if (
    state === undefined ||
    input.command.transactionHash !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH ||
    input.command.newSignatureAuthorized !== false ||
    input.command.maximumAdditionalSignatures !== "0" ||
    input.command.maximumSends !== "1" ||
    input.command.runtimeReviewInstantiationDigest !== state.instantiation.instantiationDigest ||
    input.command.predecessorBundleDigest !== state.predecessor.predecessorBundleDigest ||
    now < Date.parse(state.authenticatedAt) ||
    now >= Date.parse(state.expiresAt) ||
    input.predecessorCapability.transaction.transactionHash !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH ||
    keccak256(input.predecessorCapability.transaction.signedTransaction) !==
      BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH
  ) {
    return null;
  }
  const capability = Object.freeze({
    schemaVersion: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCHEMA_VERSION,
    scope: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_SCOPE,
    operation: BSC_TESTNET_PTA_WBNB_POOL_SUBMISSION_OPERATION,
    oneShotIntentId: input.predecessorCapability.oneShotIntentId,
    operationKey: input.predecessorCapability.operationKey,
    claimId: input.predecessorCapability.claimId,
    envelopeHash: state.instantiation.envelopeHash,
    reviewerApprovalDigest: state.instantiation.instantiationDigest,
    ownerAuthorizationDigest: state.ownerAuthorizationDigest,
    releaseCommit: state.release.releaseCommit,
    runtimeManifestSha256: state.release.runtimeManifest.runtimeManifestSha256,
    recovery: input.predecessorCapability.recovery,
    authenticatedAt: state.authenticatedAt,
    expiresAt: state.expiresAt,
    signedCommitDurablyVerified: true as const,
    freshPreSubmissionDualRpcRecheckPerformed: true as const,
    preSubmission: input.preSubmission,
    transaction: input.predecessorCapability.transaction
  }) satisfies BscTestnetPtaWbnbPoolSubmissionCapability;
  capabilities.set(capability, { binding: JSON.stringify(capability), consumed: false });
  return capability;
}

export function authenticateBscTestnetPtaWbnbPoolGeneration10SubmissionCapabilityForInternalUse(
  value: unknown
): value is BscTestnetPtaWbnbPoolSubmissionCapability {
  try {
    if (value === null || typeof value !== "object" || isProxy(value)) return false;
    const state = capabilities.get(value);
    return state !== undefined && !state.consumed && state.binding === JSON.stringify(value);
  } catch {
    return false;
  }
}

export function consumeBscTestnetPtaWbnbPoolGeneration10SendAuthorityForInternalUse(
  capability: unknown,
  signedTransaction: Hex
): boolean {
  if (
    !authenticateBscTestnetPtaWbnbPoolGeneration10SubmissionCapabilityForInternalUse(capability)
  ) {
    return false;
  }
  const typed = capability as BscTestnetPtaWbnbPoolSubmissionCapability;
  const state = capabilities.get(typed);
  if (
    state === undefined ||
    state.consumed ||
    Date.now() >= Date.parse(typed.expiresAt) ||
    typed.transaction.signedTransaction !== signedTransaction ||
    keccak256(signedTransaction) !== BSC_TESTNET_PTA_WBNB_POOL_GENERATION_10_TRANSACTION_HASH
  ) {
    return false;
  }
  state.consumed = true;
  return true;
}
