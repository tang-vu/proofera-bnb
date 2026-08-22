import { describe, expect, it } from "vitest";

import {
  isPublicRelayEvidenceMethod,
  publicRelayResult,
  sessionExpiredAtObservation,
  type RelayCapture
} from "./altana-session-ceremony";

const EMPTY_CAPTURE: RelayCapture = { callsId: null, transactionHash: null };

describe("Altana relay public evidence capture", () => {
  it("recognizes the prepared-call method used by Porto 0.2.37", () => {
    expect(isPublicRelayEvidenceMethod("wallet_sendPreparedCalls")).toBe(true);
    expect(isPublicRelayEvidenceMethod("wallet_sendCalls")).toBe(true);
    expect(isPublicRelayEvidenceMethod("wallet_getCallsStatus")).toBe(true);
    expect(isPublicRelayEvidenceMethod("eth_sendRawTransaction")).toBe(false);
  });

  it("retains only a valid calls id from a prepared-call response", () => {
    expect(
      publicRelayResult(
        "wallet_sendPreparedCalls",
        { id: "0x1234", privatePayload: "must-not-be-retained" },
        EMPTY_CAPTURE
      )
    ).toEqual({ callsId: "0x1234", transactionHash: null });
  });

  it("retains only a valid receipt transaction hash", () => {
    const transactionHash = `0x${"ab".repeat(32)}`;
    expect(
      publicRelayResult(
        "wallet_getCallsStatus",
        { receipts: [{ transactionHash, unrelated: "ignored" }] },
        { callsId: "0x1234", transactionHash: null }
      )
    ).toEqual({ callsId: "0x1234", transactionHash });
  });

  it("derives expiry only from the worker observation timestamp", () => {
    expect(
      sessionExpiredAtObservation({
        sessionExpiry: 1_787_330_074,
        observedAt: "2026-08-21T16:34:34.000Z"
      })
    ).toBe(true);
    expect(
      sessionExpiredAtObservation({
        sessionExpiry: 1_787_330_074,
        observedAt: "2026-08-21T16:34:33.999Z"
      })
    ).toBe(false);
    expect(
      sessionExpiredAtObservation({
        sessionExpiry: null,
        observedAt: "2026-08-22T00:00:00.000Z"
      })
    ).toBe(false);
  });
});
