import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  })
}));

vi.mock("next/navigation", () => navigation);

import OperatorCeremonyPage from "./page";

describe("operator ceremony page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    navigation.redirect.mockClear();
  });

  it("offers one honest entry point without claiming evidence or authority", () => {
    vi.stubEnv("NODE_ENV", "test");
    const html = renderToStaticMarkup(<OperatorCeremonyPage />);

    expect(html).toContain("Show local runner");
    expect(html).toContain("cannot accept the displayed facts");
    expect(html).toContain("INTERNAL EVIDENCE TOOL");
    expect(html).toContain("Open Session Control");
    expect(html).toContain("submit a transaction");
    expect(html).toContain("Create Altana passkey");
    expect(html).toContain("Recover transacted wallet");
    expect(html).toContain("counterfactual");
    expect(html).toContain("Grant testnet authority");
    expect(html).toContain("PTA approve(address,uint256)");
    expect(html).toContain("amount 0 · value 0");
    expect(html).not.toContain("Ceremony complete");
    expect(html).not.toContain("Authority granted");
  });

  it("redirects the internal tool away from the public production surface", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => OperatorCeremonyPage()).toThrow("NEXT_REDIRECT");
    expect(navigation.redirect).toHaveBeenCalledOnce();
    expect(navigation.redirect).toHaveBeenCalledWith("/session-control");
  });
});
