import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  new URL("../app/configure/[category]/page.tsx", import.meta.url),
  "utf8"
);
const parserSource = readFileSync(
  new URL("./reference-agent-configuration.ts", import.meta.url),
  "utf8"
);

describe("reference mandate static side-effect boundary", () => {
  it("keeps the configuration route on a GET-only local parser boundary", () => {
    expect(routeSource).toContain('method="get"');
    expect(routeSource).not.toMatch(/method=["']post["']/i);
    expect(routeSource).not.toMatch(/\bfetch\s*\(/);
    expect(routeSource).not.toMatch(/process\.env/);
    expect(routeSource).not.toMatch(/window\.ethereum|useWallet|useAccount|wagmi|viem/i);
  });

  it("keeps the parser free of RPC, HTTP, wallet, environment, and write dependencies", () => {
    expect(parserSource).not.toMatch(/\bfetch\s*\(/);
    expect(parserSource).not.toMatch(/process\.env/);
    expect(parserSource).not.toMatch(/@proofera\/integrations|node:|server-only/);
    expect(parserSource).not.toMatch(/window\.ethereum|walletClient|publicClient|writeContract/i);
  });
});
