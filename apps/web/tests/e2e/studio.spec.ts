import { expect, test } from "@playwright/test";

test("studio runs one bounded analyzer and retains only a local summary", async ({ page }) => {
  await page.route("**/api/analyzer-run", async (route) => {
    const body: unknown = route.request().postDataJSON();
    expect(body).toMatchObject({
      category: "grid-trading",
      input: { skill: "analyze_grid_trading", chainId: 97 }
    });
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        status: "completed",
        runId: "e2e-studio-grid-run-0001",
        category: "grid-trading",
        agent: {
          label: "Grid Trading Analyzer",
          agentId: "1826",
          endpoint: "https://proofera-grid.tangvu.dev/",
          skill: "analyze_grid_trading",
          expectedMethodologyVersion: "proofera-grid-trading-v1.0.0"
        },
        observedAtUtc: "2026-08-30T10:00:00.000Z",
        latencyMilliseconds: 42,
        trust: "caller_supplied_unverified",
        result: {
          skill: "analyze_grid_trading",
          chainId: 97,
          environment: "bsc-testnet",
          methodologyVersion: "proofera-grid-trading-v1.0.0",
          decision: "review_grid",
          executionEnabled: false,
          rationale: ["The bounded scenario passes its declared constraints."],
          limitations: ["The analyzer does not execute trades."]
        },
        boundary: {
          chainId: 97,
          environment: "bsc-testnet",
          executionEnabled: false,
          walletAccessed: false,
          transactionSubmitted: false,
          serverPersistence: false
        }
      })
    });
  });

  const response = await page.goto("/studio?agent=grid-trading");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Turn sourced DeFi inputs into decisions you can inspect."
    })
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /02 Grid #1826/u })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(page.getByLabel("Analyzer input JSON")).toContainText("analyze_grid_trading");
  await expect(page.getByText("Synthetic scenario", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Run public analyzer" }).click();
  await expect(page.getByRole("heading", { name: "review grid" })).toBeVisible();
  await expect(page.getByText("Analysis complete", { exact: true })).toBeVisible();
  await expect(page.getByText("Caller-supplied, unverified", { exact: true })).toBeVisible();
  await expect(page.getByText("No wallet", { exact: true })).toBeVisible();
  await expect(page.getByText("No transaction", { exact: true })).toBeVisible();
  await expect(
    page.getByText("The analyzer does not execute trades.", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("e2e-studio-grid-run-0001")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Your last bounded analyses" })).toBeVisible();
  await expect(page.getByText("review grid", { exact: true })).toBeVisible();
  await expect(page.getByText("42 ms", { exact: true })).toBeVisible();
  const stored = await page.evaluate(() =>
    window.localStorage.getItem("proofera.testnet-analyzer-history.v1")
  );
  expect(stored).not.toContain("currentPrice");
  expect(stored).not.toContain("rationale");
});

test("studio exposes all four agents and preserves replay provenance", async ({ page }) => {
  await page.goto("/studio?agent=health-factor-monitoring");

  await expect(page.getByRole("tab")).toHaveCount(4);
  await expect(page.getByRole("tab", { name: /04 Health #1828/u })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(page.getByText("Retained testnet replay", { exact: true })).toBeVisible();
  await expect(page.getByText("Retained Venus testnet replay", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Analyzer input JSON")).toContainText("analyze_venus_health_factor");

  const healthTab = page.getByRole("tab", { name: /04 Health #1828/u });
  await healthTab.focus();
  await page.keyboard.press("Home");
  const lpTab = page.getByRole("tab", { name: /01 LP range #1825/u });
  await expect(lpTab).toBeFocused();
  await expect(lpTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", /lp-rebalancing/u);
  await expect(page.getByText("Synthetic scenario", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Analyzer input JSON")).toContainText("analyze_lp_range");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true);
});

test("studio reports invalid input without calling the product API", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/analyzer-run", async (route) => {
    requests += 1;
    await route.abort();
  });
  await page.goto("/studio");
  await page.getByLabel("Analyzer input JSON").fill("{");
  await page.getByRole("button", { name: "Run public analyzer" }).click();

  await expect(page.getByRole("heading", { name: "The run failed closed." })).toBeVisible();
  await expect(page.getByText(/Input is not valid JSON/u)).toBeVisible();
  expect(requests).toBe(0);
});
