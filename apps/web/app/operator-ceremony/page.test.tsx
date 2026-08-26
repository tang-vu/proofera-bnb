import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import OperatorCeremonyPage from "./page";

describe("operator ceremony page", () => {
  it("offers one honest entry point without claiming evidence or authority", () => {
    const html = renderToStaticMarkup(<OperatorCeremonyPage />);

    expect(html).toContain("Show local runner");
    expect(html).toContain("cannot accept the displayed facts");
    expect(html).toContain("INTERNAL EVIDENCE TOOL");
    expect(html).toContain("Open Session Control");
    expect(html).toContain("submit a transaction");
    expect(html).toContain("Tạo Altana passkey");
    expect(html).toContain("Khôi phục ví đã có giao dịch");
    expect(html).toContain("ví counterfactual");
    expect(html).toContain("Grant quyền testnet");
    expect(html).toContain("PTA approve(address,uint256)");
    expect(html).toContain("amount 0 · value 0");
    expect(html).not.toContain("Ceremony complete");
    expect(html).not.toContain("Authority granted");
  });
});
