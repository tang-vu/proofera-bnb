import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

async function source(name: string): Promise<string> {
  return readFile(new URL(name, import.meta.url), "utf8");
}

describe("Altana LP activation import boundary", () => {
  it("keeps the activation path free of the PostgreSQL driver and keeps capability minting private", async () => {
    const [activation, capability, packageManifest] = await Promise.all([
      source("./altana-lp-activation-composition.server.ts"),
      source("./altana-lp-reservation-capability.server.ts"),
      source("../package.json")
    ]);
    const manifest = JSON.parse(packageManifest) as { readonly exports?: Record<string, string> };

    expect(activation).toContain('from "./altana-lp-reservation-capability.server"');
    expect(activation).not.toMatch(/from\s+["']pg["']/);
    expect(activation).not.toContain("altana-lp-postgres-pool.server");
    expect(capability).not.toMatch(/from\s+["']pg["']/);
    expect(capability).not.toContain("process.env");
    expect(Object.values(manifest.exports ?? {})).not.toContain(
      "./src/altana-lp-reservation-capability.server.ts"
    );
    expect(manifest.exports).not.toHaveProperty("./server/altana-lp-reservation-capability");
  });
});
