"use client";

import { useState, useSyncExternalStore } from "react";
import { getAddress, isAddress, type Address } from "viem";

export const PASSKEY_WALLET_STORAGE_KEY = "proofera.altana.passkey-wallet.v1";
export const PASSKEY_WALLET_EVENT = "proofera-altana-passkey-wallet-change";

type OperationPhase = "idle" | "creating" | "recovering" | "rejected" | "failed";

export interface StoredPasskeyWallet {
  readonly schemaVersion: 1;
  readonly chainId: 97;
  readonly address: Address;
  readonly credential: {
    readonly kind: "webauthn";
    readonly id: string;
    readonly publicKey: `0x${string}`;
    readonly rpId: string;
  };
}

interface AltanaPasskeyCeremonyProps {
  readonly canonicalPath: "/operator-ceremony" | "/session-control";
  readonly canonicalOrigin: string;
  readonly rpId: string;
}

function exactStoredWallet(value: unknown, rpId: string): StoredPasskeyWallet | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    record.chainId !== 97 ||
    typeof record.address !== "string" ||
    !isAddress(record.address) ||
    typeof record.credential !== "object" ||
    record.credential === null ||
    Array.isArray(record.credential)
  ) {
    return null;
  }
  const credential = record.credential as Record<string, unknown>;
  if (
    credential.kind !== "webauthn" ||
    typeof credential.id !== "string" ||
    credential.id.length < 1 ||
    credential.id.length > 2_048 ||
    typeof credential.publicKey !== "string" ||
    !/^0x[0-9a-fA-F]{128}$/.test(credential.publicKey) ||
    credential.rpId !== rpId
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    chainId: 97,
    address: getAddress(record.address),
    credential: {
      kind: "webauthn",
      id: credential.id,
      publicKey: credential.publicKey.toLowerCase() as `0x${string}`,
      rpId
    }
  };
}

export function readStoredWallet(rpId: string): StoredPasskeyWallet | null {
  try {
    const raw = window.localStorage.getItem(PASSKEY_WALLET_STORAGE_KEY);
    if (raw === null || raw.length > 8_192) return null;
    return exactStoredWallet(JSON.parse(raw) as unknown, rpId);
  } catch {
    return null;
  }
}

function isUserRejection(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "AbortError")
  );
}

function isUnregisteredCounterfactualWallet(error: unknown): boolean {
  return error instanceof Error && error.message.includes("has no keys registered in KeyStore yet");
}

function browserSnapshot(canonicalOrigin: string, rpId: string): string {
  if (window.location.origin !== canonicalOrigin) return "origin_mismatch";
  if (
    window.isSecureContext !== true ||
    !("PublicKeyCredential" in window) ||
    navigator.credentials === undefined
  ) {
    return "unsupported";
  }
  const stored = readStoredWallet(rpId);
  return stored === null ? "idle" : `ready:${stored.address}`;
}

function defaultBoundaryMessage(
  snapshot: string,
  canonicalOrigin: string,
  canonicalPath: AltanaPasskeyCeremonyProps["canonicalPath"]
): string {
  if (snapshot === "checking") return "Checking this device's HTTPS origin and WebAuthn support.";
  if (snapshot === "origin_mismatch") {
    return "Open " + canonicalOrigin + canonicalPath + " to use this passkey.";
  }
  if (snapshot === "unsupported") {
    return "This browser or HTTPS context does not support WebAuthn passkeys.";
  }
  if (snapshot.startsWith("ready:")) {
    return "Public passkey metadata is available on this device; the private key remains inside the authenticator.";
  }
  return "No ProofEra passkey is available on this device.";
}

export function AltanaPasskeyCeremony({
  canonicalPath,
  canonicalOrigin,
  rpId
}: AltanaPasskeyCeremonyProps) {
  const snapshot = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener(PASSKEY_WALLET_EVENT, onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener(PASSKEY_WALLET_EVENT, onStoreChange);
      };
    },
    () => browserSnapshot(canonicalOrigin, rpId),
    () => "checking"
  );
  const [operationPhase, setOperationPhase] = useState<OperationPhase>("idle");
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const walletAddress = snapshot.startsWith("ready:")
    ? (snapshot.slice("ready:".length) as Address)
    : null;
  const busy = operationPhase === "creating" || operationPhase === "recovering";
  const available = snapshot === "idle" || snapshot.startsWith("ready:");
  const ready = walletAddress !== null;
  const canCreateOrRecover = snapshot === "idle" && !busy;
  const message =
    operationMessage ?? defaultBoundaryMessage(snapshot, canonicalOrigin, canonicalPath);

  async function retainWallet(result: unknown) {
    if (typeof result !== "object" || result === null) throw new Error("invalid_wallet");
    const candidate = result as {
      readonly address?: unknown;
      readonly signer?: {
        readonly type?: unknown;
        readonly credential?: unknown;
      };
    };
    if (
      typeof candidate.address !== "string" ||
      !isAddress(candidate.address) ||
      candidate.signer?.type !== "passkey"
    ) {
      throw new Error("invalid_wallet");
    }
    const credential = exactStoredWallet(
      {
        schemaVersion: 1,
        chainId: 97,
        address: candidate.address,
        credential: candidate.signer.credential
      },
      rpId
    );
    if (credential === null) throw new Error("invalid_wallet");
    window.localStorage.setItem(PASSKEY_WALLET_STORAGE_KEY, JSON.stringify(credential));
    window.dispatchEvent(new Event(PASSKEY_WALLET_EVENT));
    setOperationPhase("idle");
    setOperationMessage(
      "Altana returned a wallet and its public passkey metadata is now retained on this device. Recovery is not needed on this device. No session grant, execution authority, or transaction receipt has been created."
    );
  }

  async function createPasskeyWallet() {
    if (!canCreateOrRecover) return;
    setOperationPhase("creating");
    setOperationMessage("Waiting for WebAuthn confirmation on this device…");
    try {
      const { BNB_TESTNET, createClient } = await import("@altananetwork/sdk");
      const client = createClient({ chains: [BNB_TESTNET], defaultChainId: 97 });
      await retainWallet(await client.createPasskeyWallet({ name: "ProofEra BSC Testnet", rpId }));
    } catch (error) {
      setOperationPhase(isUserRejection(error) ? "rejected" : "failed");
      setOperationMessage(
        isUserRejection(error)
          ? "The passkey request was cancelled; no authority or transaction was recorded."
          : "Altana did not return a complete wallet. Windows Hello may have created a local credential before wallet preparation stopped; do not use recovery for a credential with no first transaction. Code: ALTANA_CREATE_INCOMPLETE. No grant or transaction was recorded."
      );
    }
  }

  async function recoverPasskeyWallet() {
    if (!canCreateOrRecover) return;
    setOperationPhase("recovering");
    setOperationMessage("Select the ProofEra passkey in this device's authenticator…");
    try {
      const { BNB_TESTNET, createClient } = await import("@altananetwork/sdk");
      const client = createClient({ chains: [BNB_TESTNET], defaultChainId: 97 });
      await retainWallet(await client.recoverFromPasskey({ chainId: 97, rpId }));
    } catch (error) {
      setOperationPhase(isUserRejection(error) ? "rejected" : "failed");
      setOperationMessage(
        isUserRejection(error)
          ? "Passkey recovery was cancelled; authority state remains unknown."
          : isUnregisteredCounterfactualWallet(error)
            ? "The authenticator returned a wallet, but the chain-97 KeyStore has no onchain admin key. This is the counterfactual state before the first Altana transaction, not evidence of a lost passkey or existing authority. Code: ALTANA_KEYSTORE_NOT_REGISTERED."
            : "The passkey could not be recovered from the BSC testnet KeyStore; authority state remains unknown."
      );
    }
  }

  async function copyWalletAddress() {
    if (walletAddress === null) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setOperationMessage("Public wallet address copied. No credential or key was copied.");
    } catch {
      setOperationMessage("Automatic copy failed; the public address remains visible below.");
    }
  }

  return (
    <section className="ceremony-passkey" aria-labelledby="altana-passkey-heading">
      <div className="ceremony-passkey-heading">
        <div>
          <span className="panel-overline">FINAL HTTPS ORIGIN / BSC TESTNET 97</span>
          <h3 id="altana-passkey-heading">Confirm an Altana passkey</h3>
        </div>
        <span className={`state-badge ${ready ? "state-positive" : "state-caution"}`}>
          {ready ? "Local passkey ready" : "User presence required"}
        </span>
      </div>
      <p aria-live="polite" role="status">
        {message}
      </p>
      <div className="ceremony-passkey-actions">
        <button
          className="button button-primary"
          disabled={!available || !canCreateOrRecover}
          onClick={createPasskeyWallet}
          type="button"
        >
          {ready
            ? "Passkey created"
            : operationPhase === "creating"
              ? "Waiting for passkey…"
              : "Create Altana passkey"}
        </button>
        <button
          className="button button-secondary"
          disabled={!available || !canCreateOrRecover}
          onClick={recoverPasskeyWallet}
          type="button"
        >
          {ready
            ? "Recovery not needed"
            : operationPhase === "recovering"
              ? "Recovering…"
              : "Recover transacted wallet"}
        </button>
      </div>
      <p className="registry-footnote">
        KeyStore recovery is only for a wallet whose admin key was registered by its first Altana
        transaction. A newly created passkey wallet may still be counterfactual; when its address is
        visible below, this device already has the required metadata and does not need recovery.
      </p>
      {walletAddress === null ? null : (
        <div className="ceremony-passkey-wallet" role="status">
          <span>Altana wallet / chain 97</span>
          <code>{walletAddress}</code>
          <button className="button button-secondary" onClick={copyWalletAddress} type="button">
            Copy address
          </button>
        </div>
      )}
      <p className="registry-footnote">
        Only the credential ID and public key are retained locally to continue on this device. The
        private passkey never leaves the authenticator. This step does not claim a grant, execution,
        or receipt.
      </p>
    </section>
  );
}
