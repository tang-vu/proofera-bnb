import { expect, test } from "@playwright/test";

const analyzers = [
  {
    category: "lp-rebalancing",
    name: "LP Range Analyzer",
    configureHref: "/lp-activate",
    requiredMetrics: ["In-range time", "Fee APR", "Estimated impermanent loss", "Gas drag"],
    implementedMetrics: ["Current range state"]
  },
  {
    category: "grid-trading",
    name: "Grid Trading Analyzer",
    configureHref: "/configure/grid-trading",
    requiredMetrics: ["Realized PnL", "Confirmed fills", "Maximum drawdown", "All-in costs"],
    implementedMetrics: ["Grid range"]
  },
  {
    category: "yield-optimisation",
    name: "Yield Optimisation Analyzer",
    configureHref: "/configure/yield-optimisation",
    requiredMetrics: ["Base APY", "Net APY", "TVL and withdrawable liquidity", "Route history"],
    implementedMetrics: ["Net APY", "Gas impact"]
  },
  {
    category: "health-factor-monitoring",
    name: "Health-Factor Guardian Analyzer",
    configureHref: "/configure/health-factor-monitoring",
    requiredMetrics: [
      "Current health factor",
      "Minimum observed health factor",
      "Alert latency",
      "Liquidation-risk thresholds"
    ],
    implementedMetrics: ["Current health factor", "Minimum observed health factor", "Alert latency"]
  }
] as const;

for (const analyzer of analyzers) {
  test(`${analyzer.category} dossier is truthful, complete, and execution-disabled`, async ({
    page
  }) => {
    const offOriginRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== "http://127.0.0.1:3217") offOriginRequests.push(url.origin);
    });

    const response = await page.goto(`/reference-analyzers/${analyzer.category}`);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: analyzer.name })).toBeVisible();
    await expect(page.getByText("NOT AN AGENT PASSPORT", { exact: false })).toBeVisible();
    await expect(page.getByText("Do not hire or activate", { exact: true })).toBeVisible();
    await expect(page.getByText("False", { exact: true })).toHaveCount(6);
    await expect(page.getByText("Unknown · no observation", { exact: true })).toHaveCount(8);
    await expect(page.getByText("No receipt", { exact: true })).toHaveCount(8);
    await expect(page.getByText("Implemented; not run", { exact: true })).toHaveCount(
      analyzer.implementedMetrics.length
    );
    await expect(
      page.getByText("Definition documented; calculator absent", { exact: true })
    ).toHaveCount(8 - analyzer.implementedMetrics.length);
    await expect(page.getByRole("button", { name: "Execution unavailable" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Configure mandate" })).toHaveAttribute(
      "href",
      analyzer.configureHref
    );

    for (const metric of analyzer.requiredMetrics) {
      await expect(page.getByRole("heading", { level: 3, name: metric })).toBeVisible();
    }

    for (const metric of analyzer.implementedMetrics) {
      await expect(
        page.getByRole("article", { name: metric }).getByText("Implemented; not run", {
          exact: true
        })
      ).toBeVisible();
    }

    await expect(
      page.getByText(/no connected wallet, scoped authority, BSC deployment/i)
    ).toBeVisible();
    await expect(page.getByText(/activation enabled/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Hire/i })).toHaveCount(0);
    expect(offOriginRequests).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });
}

test("category navigation stays inside the four allowlisted dossiers", async ({ page }) => {
  await page.goto("/reference-analyzers/lp-rebalancing");

  const categoryNavigation = page.getByRole("navigation", {
    name: "Reference analyzer categories"
  });
  await expect(categoryNavigation.getByText("LP rebalancing", { exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  const categoryNavigationComplete = page.waitForURL(/\/reference-analyzers\/grid-trading$/, {
    timeout: 15_000
  });
  await categoryNavigation.getByRole("link", { name: "Grid trading" }).click();
  await categoryNavigationComplete;
  await expect(
    page.getByRole("heading", { level: 1, name: "Grid Trading Analyzer" })
  ).toBeVisible();
});

test("a keyboard user can focus and open a marketplace reference dossier", async ({ page }) => {
  await page.goto("/marketplace");

  const dossierLink = page.getByRole("link", { name: "Open LP Range Analyzer dossier" });
  await expect(dossierLink).toBeVisible();

  let reachedDossierLink = false;
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press("Tab");
    if (await dossierLink.evaluate((element) => document.activeElement === element)) {
      reachedDossierLink = true;
      break;
    }
  }

  expect(reachedDossierLink).toBe(true);
  await expect(dossierLink).toBeFocused();
  const dossierNavigationComplete = page.waitForURL(/\/reference-analyzers\/lp-rebalancing$/, {
    timeout: 15_000
  });
  await page.keyboard.press("Enter");

  await dossierNavigationComplete;
  await expect(page.getByRole("heading", { level: 1, name: "LP Range Analyzer" })).toBeVisible();
});

test("unknown reference categories return a truthful 404", async ({ page }) => {
  const response = await page.goto("/reference-analyzers/not-a-category");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "404" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await expect(page.getByText("Local analyzer", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Configure mandate" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Execution unavailable" })).toHaveCount(0);
});
