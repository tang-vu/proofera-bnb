import { describe, expect, it } from "vitest";

import { runPinnedPowerShellForInternalUse } from "./bsc-testnet-deployer-custody-windows.server";

const describeWindows = process.platform === "win32" ? describe : describe.skip;

describeWindows("pinned Windows PowerShell subprocess boundary", () => {
  it("accepts bounded stdout from the pinned executable", async () => {
    const controller = new AbortController();
    const result = await runPinnedPowerShellForInternalUse(
      '[Console]::Out.Write("ok")',
      Buffer.alloc(0),
      2,
      controller.signal,
      2_000
    );
    expect(result.output.toString("utf8")).toBe("ok");
    result.output.fill(0);
  });

  it("fails safely on excess output, stderr, and a nonzero exit", async () => {
    const cases = [
      { maximum: 2, script: '[Console]::Out.Write("too-long")' },
      { maximum: 16, script: '[Console]::Error.Write("bounded"); exit 0' },
      { maximum: 16, script: "exit 17" }
    ] as const;
    for (const testCase of cases) {
      await expect(
        runPinnedPowerShellForInternalUse(
          testCase.script,
          Buffer.alloc(0),
          testCase.maximum,
          new AbortController().signal,
          2_000
        )
      ).rejects.toMatchObject({ reason: "operation_failed" });
    }
  }, 30_000);

  it("kills and observes child close after timeout", async () => {
    const startedAt = performance.now();
    await expect(
      runPinnedPowerShellForInternalUse(
        "Start-Sleep -Seconds 5",
        Buffer.alloc(0),
        16,
        new AbortController().signal,
        50
      )
    ).rejects.toMatchObject({ reason: "operation_failed" });
    expect(performance.now() - startedAt).toBeLessThan(6_000);
  }, 15_000);

  it("kills and observes child close after abort", async () => {
    const controller = new AbortController();
    const pending = runPinnedPowerShellForInternalUse(
      "Start-Sleep -Seconds 5",
      Buffer.alloc(0),
      16,
      controller.signal,
      5_000
    );
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toMatchObject({ reason: "operation_failed" });
  }, 15_000);
});
