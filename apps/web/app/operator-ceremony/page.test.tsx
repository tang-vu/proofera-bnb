import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import OperatorCeremonyPage from "./page";

describe("operator ceremony page", () => {
  it("offers one honest entry point without claiming evidence or authority", () => {
    const html = renderToStaticMarkup(<OperatorCeremonyPage />);

    expect(html).toContain("Begin operator ceremony");
    expect(html).toContain("does not manufacture a manual result");
    expect(html).toContain("does not");
    expect(html).toContain("submit a transaction");
    expect(html).not.toContain("Ceremony complete");
    expect(html).not.toContain("Authority granted");
  });
});
