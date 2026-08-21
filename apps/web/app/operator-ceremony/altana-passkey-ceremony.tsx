"use client";

import { useState, useSyncExternalStore } from "react";
import { getAddress, isAddress, type Address } from "viem";

const PASSKEY_WALLET_STORAGE_KEY = "proofera.altana.passkey-wallet.v1";
const PASSKEY_WALLET_EVENT = "proofera-altana-passkey-wallet-change";

type OperationPhase = "idle" | "creating" | "recovering" | "rejected" | "failed";

interface StoredPasskeyWallet {
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

function readStoredWallet(rpId: string): StoredPasskeyWallet | null {
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

function defaultBoundaryMessage(snapshot: string, canonicalOrigin: string): string {
  if (snapshot === "checking") return "Đang kiểm tra HTTPS origin và WebAuthn trên thiết bị này.";
  if (snapshot === "origin_mismatch") {
    return `Mở đúng ${canonicalOrigin}/operator-ceremony để dùng passkey.`;
  }
  if (snapshot === "unsupported") {
    return "Trình duyệt hoặc HTTPS context này không hỗ trợ WebAuthn passkey.";
  }
  if (snapshot.startsWith("ready:")) {
    return "Đã tìm thấy metadata công khai của passkey trên thiết bị này; private key vẫn nằm trong authenticator.";
  }
  return "Chưa có passkey ProofEra trên thiết bị này.";
}

export function AltanaPasskeyCeremony({ canonicalOrigin, rpId }: AltanaPasskeyCeremonyProps) {
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
  const message = operationMessage ?? defaultBoundaryMessage(snapshot, canonicalOrigin);

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
      "Passkey đã sẵn sàng trên final origin. Chưa có session grant, quyền thực thi hay transaction receipt."
    );
  }

  async function createPasskeyWallet() {
    if (!available || busy) return;
    setOperationPhase("creating");
    setOperationMessage("Đang chờ xác nhận WebAuthn trên thiết bị…");
    try {
      const { BNB_TESTNET, createClient } = await import("@altananetwork/sdk");
      const client = createClient({ chains: [BNB_TESTNET], defaultChainId: 97 });
      await retainWallet(await client.createPasskeyWallet({ name: "ProofEra BSC Testnet", rpId }));
    } catch (error) {
      setOperationPhase(isUserRejection(error) ? "rejected" : "failed");
      setOperationMessage(
        isUserRejection(error)
          ? "Yêu cầu passkey đã bị hủy; chưa có quyền hay transaction nào được ghi nhận."
          : "Không thể tạo passkey an toàn. Không có grant hay transaction nào được ghi nhận."
      );
    }
  }

  async function recoverPasskeyWallet() {
    if (!available || busy) return;
    setOperationPhase("recovering");
    setOperationMessage("Chọn passkey ProofEra trong trình xác thực của thiết bị…");
    try {
      const { BNB_TESTNET, createClient } = await import("@altananetwork/sdk");
      const client = createClient({ chains: [BNB_TESTNET], defaultChainId: 97 });
      await retainWallet(await client.recoverFromPasskey({ chainId: 97, rpId }));
    } catch (error) {
      setOperationPhase(isUserRejection(error) ? "rejected" : "failed");
      setOperationMessage(
        isUserRejection(error)
          ? "Khôi phục passkey đã bị hủy; trạng thái authority không được suy diễn."
          : "Không khôi phục được passkey từ KeyStore BSC testnet; trạng thái authority vẫn chưa biết."
      );
    }
  }

  async function copyWalletAddress() {
    if (walletAddress === null) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setOperationMessage("Đã sao chép địa chỉ ví công khai. Không sao chép credential hoặc khóa.");
    } catch {
      setOperationMessage("Không thể sao chép tự động; địa chỉ công khai vẫn hiển thị bên dưới.");
    }
  }

  return (
    <section className="ceremony-passkey" aria-labelledby="altana-passkey-heading">
      <div className="ceremony-passkey-heading">
        <div>
          <span className="panel-overline">FINAL HTTPS ORIGIN / BSC TESTNET 97</span>
          <h3 id="altana-passkey-heading">Xác nhận Altana passkey</h3>
        </div>
        <span className={`state-badge ${ready ? "state-positive" : "state-caution"}`}>
          {ready ? "Passkey ready" : "User presence required"}
        </span>
      </div>
      <p>{message}</p>
      <div className="ceremony-passkey-actions">
        <button
          className="button button-primary"
          disabled={!available || busy}
          onClick={createPasskeyWallet}
          type="button"
        >
          {operationPhase === "creating" ? "Đang chờ passkey…" : "Tạo Altana passkey"}
        </button>
        <button
          className="button button-secondary"
          disabled={!available || busy}
          onClick={recoverPasskeyWallet}
          type="button"
        >
          {operationPhase === "recovering" ? "Đang khôi phục…" : "Khôi phục passkey có sẵn"}
        </button>
      </div>
      {walletAddress === null ? null : (
        <div className="ceremony-passkey-wallet" role="status">
          <span>Altana wallet / chain 97</span>
          <code>{walletAddress}</code>
          <button className="button button-secondary" onClick={copyWalletAddress} type="button">
            Sao chép địa chỉ
          </button>
        </div>
      )}
      <p className="registry-footnote">
        Chỉ credential ID và public key được giữ cục bộ để tiếp tục trên thiết bị này. Private
        passkey không rời authenticator. Bước này không tự nhận đã grant, execute hoặc tạo receipt.
      </p>
    </section>
  );
}
