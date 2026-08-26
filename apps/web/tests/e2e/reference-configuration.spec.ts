import { expect, test, type Page } from "@playwright/test";

const hugeCapital =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

const journeys = [
  {
    category: "grid-trading",
    dossierName: "Grid Trading Analyzer",
    heading: "Bound the grid before price access.",
    fields: {
      "Maximum strategy capital / raw base-unit uint256 bound": hugeCapital,
      "Lower grid price / user threshold": "500.000000000000000001",
      "Upper grid price / user threshold": "700.000000000000000002",
      "Grid levels / integer": "24",
      "Maximum drawdown / bps": "1250",
      "Maximum slippage / bps": "35"
    },
    selects: {
      "Risk tolerance": "balanced",
      "BSC network": "bsc-testnet",
      "Time horizon": "days",
      "Preferred asset or pair": "bnb-usdt",
      "Permitted protocol": "pancakeswap-v3"
    },
    expectedFacts: ["500.000000000000000001", "700.000000000000000002", "24", "1250 bps", "35 bps"],
    expectedNetwork: "BSC testnet / 97",
    expectedSelections: ["balanced", "days", "bnb-usdt", "pancakeswap-v3"]
  },
  {
    category: "yield-optimisation",
    dossierName: "Yield Optimisation Analyzer",
    heading: "Set the yield mandate before rates.",
    fields: {
      "Maximum allocation / raw base-unit uint256 bound": hugeCapital,
      "Minimum acceptable net APY / bps (user threshold)": "450",
      "Minimum immediately withdrawable share / bps": "9000",
      "Maximum gas cost / raw base-unit uint256 bound": "4500000000000001"
    },
    selects: {
      "Risk tolerance": "conservative",
      "BSC network": "bsc-mainnet",
      "Time horizon": "months",
      "Preferred asset or pair": "stablecoins",
      "Permitted protocol": "lista"
    },
    expectedFacts: ["450 bps", "9000 bps", "4500000000000001"],
    expectedNetwork: "BSC mainnet / 56",
    expectedSelections: ["conservative", "months", "stablecoins", "lista"]
  },
  {
    category: "health-factor-monitoring",
    dossierName: "Health-Factor Guardian Analyzer",
    heading: "Set protection thresholds before account access.",
    fields: {
      "Maximum intervention capital / raw base-unit uint256 bound": hugeCapital,
      "Warning health factor / user threshold": "1.300000000000000001",
      "Critical health factor / user threshold": "1.150000000000000001",
      "Target health factor after review / user threshold": "1.500000000000000001",
      "Maximum repay amount / raw base-unit uint256 bound": "250000000000000001"
    },
    selects: {
      "Risk tolerance": "conservative",
      "BSC network": "bsc-testnet",
      "Time horizon": "continuous",
      "Preferred asset or pair": "mixed",
      "Permitted protocol": "venus"
    },
    expectedFacts: [
      "1.300000000000000001",
      "1.150000000000000001",
      "1.500000000000000001",
      "250000000000000001"
    ],
    expectedNetwork: "BSC testnet / 97",
    expectedSelections: ["conservative", "continuous", "mixed", "venus"]
  }
] as const;

async function hasNoHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  );
}

for (const journey of journeys) {
  test(`${journey.category} configures a mandate without evidence or authority side effects`, async ({
    page
  }) => {
    const offOriginRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== "http://127.0.0.1:3217") offOriginRequests.push(url.origin);
    });

    await page.goto(`/reference-analyzers/${journey.category}`);
    await expect(page.getByRole("heading", { level: 1, name: journey.dossierName })).toBeVisible();
    const configureLink = page.getByRole("link", { name: "Configure mandate" });
    await expect(configureLink).toHaveAttribute("href", `/configure/${journey.category}`);
    await configureLink.click();

    await expect(page).toHaveURL(new RegExp(`/configure/${journey.category}$`));
    await expect(page.getByRole("heading", { level: 1, name: journey.heading })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Set constraints before evidence." })
    ).toBeVisible();

    for (const [label, value] of Object.entries(journey.fields)) {
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    for (const [label, value] of Object.entries(journey.selects)) {
      await page.getByRole("combobox", { name: label, exact: true }).selectOption(value);
    }
    await page.getByRole("button", { name: "Review mandate" }).click();

    await expect(
      page.getByRole("heading", {
        name: "Mandate captured. Identity verified; trust incomplete."
      })
    ).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Normalized user-controlled mandate" })
    ).toBeVisible();
    await expect(page.getByText(hugeCapital, { exact: true }).last()).toBeVisible();
    for (const fact of journey.expectedFacts) {
      await expect(page.getByText(fact, { exact: true }).last()).toBeVisible();
    }
    await expect(page.getByText(journey.expectedNetwork, { exact: true }).last()).toBeVisible();
    for (const selection of journey.expectedSelections) {
      await expect(page.getByText(selection, { exact: true }).last()).toBeVisible();
    }
    await expect(page.getByText("True", { exact: true })).toHaveCount(1);
    await expect(page.getByText("False", { exact: true })).toHaveCount(8);
    await expect(page.getByText("1 verified · 8 blocked", { exact: true })).toBeVisible();
    await expect(page.getByText("trusted evidence absent", { exact: true })).toBeVisible();
    await expect(page.getByText("scoped authority absent", { exact: true })).toBeVisible();
    await expect(page.getByText("transaction receipt absent", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/This configuration handler performed no RPC read, HTTP fetch, wallet access/i)
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Inspect the bounded session-key model" })
    ).toHaveAttribute("href", "/session-control");
    await expect(page.getByText(/does not activate this configured strategy/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /activate|hire|execute/i })).toHaveCount(0);
    await expect(page.getByText(/transaction hash/i)).toHaveCount(1);
    expect(offOriginRequests).toEqual([]);
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
  });
}

test("unknown, repeated, and cross-category GET fields fail closed", async ({ page }) => {
  const response = await page.goto(
    "/configure/grid-trading?capitalRaw=1&capitalRaw=2&minimumNetApyBps=500&rpcUrl=https%3A%2F%2Fexample.test"
  );

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Correct the user boundary." })).toBeVisible();
  await expect(page.locator("#mandate-capitalRaw-errors")).toHaveText(
    "Each mandate field must appear exactly once."
  );
  await expect(page.locator('form [role="alert"]')).toContainText(
    "Only the allowlisted mandate fields for this category are accepted."
  );
  await expect(page.getByRole("heading", { name: /Mandate captured/i })).toHaveCount(0);
  await expect(page.getByText("False", { exact: true })).toHaveCount(0);
  expect(await hasNoHorizontalOverflow(page)).toBe(true);
});

test("a malformed decimal query is rejected without a server error", async ({ page }) => {
  const query = new URLSearchParams({
    capitalRaw: "1",
    network: "bsc-testnet",
    risk: "balanced",
    horizon: "days",
    asset: "bnb-usdt",
    protocol: "pancakeswap-v3",
    lowerPriceRaw: "abc",
    upperPriceRaw: "2",
    gridLevels: "10",
    maxDrawdownBps: "100",
    maxSlippageBps: "25"
  });
  const response = await page.goto(`/configure/grid-trading?${query.toString()}`);

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Correct the user boundary." })).toBeVisible();
  await expect(page.locator("#mandate-lowerPriceRaw-errors")).toContainText(
    "canonical decimal string"
  );
  await expect(page.getByRole("heading", { name: /Mandate captured/i })).toHaveCount(0);
});

test("field errors describe only the invalid grid control", async ({ page }) => {
  const query = new URLSearchParams({
    capitalRaw: "1",
    network: "bsc-testnet",
    risk: "balanced",
    horizon: "days",
    asset: "bnb-usdt",
    protocol: "pancakeswap-v3",
    lowerPriceRaw: "700",
    upperPriceRaw: "600",
    gridLevels: "10",
    maxDrawdownBps: "100",
    maxSlippageBps: "25"
  });
  await page.goto(`/configure/grid-trading?${query.toString()}`);

  const lower = page.getByRole("textbox", { name: "Lower grid price / user threshold" });
  const upper = page.getByRole("textbox", { name: "Upper grid price / user threshold" });
  await expect(lower).not.toHaveAttribute("aria-invalid");
  await expect(upper).toHaveAttribute("aria-invalid", "true");
  await expect(upper).toHaveAttribute("aria-describedby", "mandate-upperPriceRaw-errors");
  await expect(page.locator("#mandate-upperPriceRaw-errors")).toHaveText(
    "Upper grid price must be greater than lower grid price."
  );
});

test("Lista testnet mismatch is associated only with the network control", async ({ page }) => {
  const query = new URLSearchParams({
    capitalRaw: "1",
    network: "bsc-testnet",
    risk: "conservative",
    horizon: "months",
    asset: "stablecoins",
    protocol: "lista",
    minimumNetApyBps: "450",
    minimumWithdrawableBps: "9000",
    maxGasCostRaw: "1"
  });
  await page.goto(`/configure/yield-optimisation?${query.toString()}`);

  const network = page.getByRole("combobox", { name: "BSC network" });
  const protocol = page.getByRole("combobox", { name: "Permitted protocol" });
  await expect(network).toHaveAttribute("aria-invalid", "true");
  await expect(network).toHaveAttribute("aria-describedby", "mandate-network-errors");
  await expect(page.locator("#mandate-network-errors")).toHaveText(
    "Lista source mandates require BSC mainnet; no official Lista testnet source is configured."
  );
  await expect(protocol).not.toHaveAttribute("aria-invalid");
});

test("unknown keys stay at form level without invalidating valid controls", async ({ page }) => {
  const query = new URLSearchParams({
    capitalRaw: "1",
    network: "bsc-testnet",
    risk: "balanced",
    horizon: "days",
    asset: "bnb-usdt",
    protocol: "pancakeswap-v3",
    lowerPriceRaw: "1",
    upperPriceRaw: "2",
    gridLevels: "10",
    maxDrawdownBps: "100",
    maxSlippageBps: "25",
    rpcUrl: "https://example.test"
  });
  await page.goto(`/configure/grid-trading?${query.toString()}`);

  const requestError = page.getByRole("alert", { name: "" }).filter({
    hasText: "Request-level error"
  });
  await expect(requestError).toContainText(
    "Only the allowlisted mandate fields for this category are accepted."
  );
  await expect(page.locator('form [aria-invalid="true"]')).toHaveCount(0);
});

test("a keyboard user can reach the configuration link and mandate form", async ({ page }) => {
  await page.goto("/reference-analyzers/grid-trading");
  const configureLink = page.getByRole("link", { name: "Configure mandate" });

  let reachedLink = false;
  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press("Tab");
    if (await configureLink.evaluate((element) => document.activeElement === element)) {
      reachedLink = true;
      break;
    }
  }
  expect(reachedLink).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/configure\/grid-trading$/);

  const capitalInput = page.getByRole("textbox", {
    name: "Maximum strategy capital / raw base-unit uint256 bound"
  });
  let reachedInput = false;
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press("Tab");
    if (await capitalInput.evaluate((element) => document.activeElement === element)) {
      reachedInput = true;
      break;
    }
  }
  expect(reachedInput).toBe(true);
  await expect(capitalInput).toBeFocused();
});

test("unknown configuration categories return 404 without a form", async ({ page }) => {
  const response = await page.goto("/configure/lp-rebalancing");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review mandate" })).toHaveCount(0);
});
