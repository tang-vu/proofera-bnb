import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import OperatorCeremonyPage from "./page";

describe("operator ceremony page", () => {
  it("offers one honest entry point without claiming evidence or authority", () => {
    const html = renderToStaticMarkup(<OperatorCeremonyPage />);

    expect(html).toContain("Show local runner");
    expect(html).toContain("cannot accept the displayed facts");
    expect(html).toContain("BOUNDED NON-AGENT BASELINES");
    expect(html).toContain("submit a transaction");
    expect(html).toContain("Tạo Altana passkey");
    expect(html).toContain("Khôi phục passkey có sẵn");
    expect(html).not.toContain("Ceremony complete");
    expect(html).not.toContain("Authority granted");
  });
});
