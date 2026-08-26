import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SessionControlPage from "./page";

describe("session control page", () => {
  it("makes one-grant autonomy primary while bounding the zero-value fixture", () => {
    const html = renderToStaticMarkup(<SessionControlPage />);

    expect(html).toContain("Grant once. Stay inside limits.");
    expect(html).toContain("No new signature");
    expect(html).toContain("Block automatically");
    expect(html).toContain("Owner returns");
    expect(html).toContain("Grant quyền testnet");
    expect(html).toContain("Revoke session");
    expect(html).toContain("does not add liquidity");
    expect(html).not.toContain("LP profit verified");
  });
});
