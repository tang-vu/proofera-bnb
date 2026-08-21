import { expect, test } from "@playwright/test";

test("health endpoint identifies the ProofEra marketplace", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.ok()).toBe(true);
  expect(response.headers()["x-proofera-service"]).toBe("proofera-marketplace");
  const body = await response.json();
  expect(body).toMatchObject({
    schemaVersion: "1",
    service: "proofera-marketplace",
    status: "ok"
  });
  expect(body.build).toMatch(/^[A-Za-z0-9._-]+$/);
});

test("serves the finance UI with clickjacking and content-type defenses", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();

  expect(response.ok()).toBe(true);
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("payment=()");
});

test("readiness does not claim the unimplemented activation handoff", async ({ request }) => {
  const response = await request.get("/api/readiness");

  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toBe("no-store");
  await expect(response.json()).resolves.toMatchObject({
    capabilities: { activation: "unavailable" },
    readyForActivation: false,
    readyForJudging: false,
    status: "not_ready"
  });
});

test("rejects unsupported Agent Passport routes without fabricating an identity", async ({
  page
}) => {
  const response = await page.goto("/agents/1/7");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Identity not found." })).toBeVisible();
  await expect(page.getByText(/does not replace missing identities with fixtures/i)).toBeVisible();
});

test("keeps a valid registry Passport non-hireable without independent evidence", async ({
  page
}) => {
  await page.goto("/agents/56/1");

  await expect(page.getByText("Capability unverified", { exact: true })).toBeVisible();
  await expect(page.getByText("Activation locked", { exact: true })).toBeVisible();
  await expect(page.getByText(/activation enabled/i)).toHaveCount(0);
});

test("requires two to four identities before comparison", async ({ page }) => {
  await page.goto("/compare?agent=56%3A1");

  await expect(page.getByRole("heading", { name: "Choose two to four agents." })).toBeVisible();
  await expect(page.getByText(/fewer than two unique identities/i)).toBeVisible();
});

test("accepts the repeated legacy comparison deep link", async ({ page }) => {
  await page.goto("/compare?agents=56%3A1&agents=97%3A2");

  await expect(
    page.getByRole("region", { name: "Identity and evidence comparison" })
  ).toBeVisible();
  await expect(
    page.getByText(/scroll horizontally to inspect every selected agent/i)
  ).toBeVisible();
});

test("rejects mixed canonical and legacy comparison parameters", async ({ page }) => {
  await page.goto("/compare?agent=56%3A1&agents=97%3A2");

  await expect(page.getByRole("heading", { name: "Choose two to four agents." })).toBeVisible();
  await expect(page.getByText(/use either repeated agent parameters/i)).toBeVisible();
});

test("explains the evidence-first marketplace and exposes all four categories", async ({
  page
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /hire agents by proof/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Find an agent" })).toBeVisible();

  for (const [label, category] of [
    ["LP rebalancing", "lp-rebalancing"],
    ["Grid trading", "grid-trading"],
    ["Yield optimisation", "yield-optimisation"],
    ["Health monitoring", "health-factor-monitoring"]
  ] as const) {
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
    await expect(page.getByRole("link", { name: `Explore ${label} agents` })).toHaveAttribute(
      "href",
      `/marketplace?category=${category}`
    );
  }
});

test("category entry preserves the selected financial job without instructions", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Explore Grid trading agents" }).click();

  await expect(page).toHaveURL(/\/marketplace\?category=grid-trading$/);
  await expect(page.getByLabel("Financial job")).toHaveValue("grid-trading");
  await expect(page.getByLabel("Current mandate").getByRole("heading")).toHaveText("Grid trading");
});

test("primary call to action reaches a non-dead marketplace route", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Find an agent" }).click();

  await expect(page).toHaveURL(/\/marketplace$/);
  await expect(page.getByRole("heading", { name: "Start with the job." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Define the mandate" })).toBeVisible();
  await expect(page.getByText("Recommendation withheld")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Four registered analyzers. Zero invented performance."
    })
  ).toBeVisible();
  await expect(page.getByText("BSC testnet registered", { exact: true })).toHaveCount(4);
  await expect(page.getByText("Execution disabled", { exact: true })).toHaveCount(4);
});

test("opens the Pancake position reader in an honest no-read state", async ({ page }) => {
  await page.goto("/pancake-position");

  await expect(page).toHaveURL(/\/pancake-position$/);
  await expect(
    page.getByRole("heading", { name: "Inspect a position without inventing performance." })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enter a position to begin." })).toBeVisible();
  await expect(page.getByText("No RPC request has been made.")).toBeVisible();
  await expect(page.getByLabel("BSC network")).toHaveValue("56");
  await expect(page.getByLabel("Pancake V3 pool address")).toHaveValue("");
  await expect(page.getByLabel("Position NFT ID")).toHaveValue("");
});

test("opens LP configuration without implying a wallet connection", async ({ page }) => {
  await page.goto("/lp-activate");

  await expect(page).toHaveURL(/\/lp-activate$/);
  await expect(
    page.getByRole("heading", { name: "Set boundaries before authority." })
  ).toBeVisible();
  await expect(page.getByText("Readiness remains blocked", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Intended execution wallet (not connected)")).toHaveValue("");
});

test("rejects invalid Pancake position input without an RPC read", async ({ page }) => {
  await page.goto(
    "/pancake-position?chainId=1&poolAddress=not-an-address&positionId=007&rpcUrl=https%3A%2F%2Fexample.test"
  );

  await expect(page.getByRole("heading", { name: "Correct the read boundary." })).toBeVisible();
  await expect(page.getByText("No RPC request was made.")).toBeVisible();
  await expect(page.getByText(/only chainId, poolAddress, and positionId/i)).toBeVisible();
  await expect(page.getByText("Read available", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(/RPC URL/i)).toHaveCount(0);
});

test("announces comparison selection and emits the canonical query name", async ({ page }) => {
  await page.goto("/marketplace");

  const choices = page.getByRole("checkbox", { name: "Add to comparison" });
  const choiceCount = await choices.count();
  if (choiceCount < 2) {
    const registryResults = page.locator("#registry-results");
    await expect(registryResults).toBeVisible();
    await expect(registryResults.locator(".unavailable-panel, .source-status")).toBeVisible();
    return;
  }

  const submit = page.getByRole("button", { name: "Compare selected" });
  await expect(submit).toBeDisabled();
  await expect(page.getByText("0 selected. Choose two to four agents.")).toBeVisible();

  await choices.nth(0).check();
  await expect(page.getByText("1 selected. Choose at least one more agent.")).toBeVisible();
  await expect(submit).toBeDisabled();

  await choices.nth(1).check();
  await expect(page.getByText("2 selected. Ready to compare.")).toBeVisible();
  await expect(submit).toBeEnabled();

  if (choiceCount >= 5) {
    await choices.nth(2).check();
    await choices.nth(3).check();
    await choices.nth(4).check();
    await expect(page.getByText("5 selected. Remove 1 agent to continue.")).toBeVisible();
    await expect(submit).toBeDisabled();

    await choices.nth(4).uncheck();
    await expect(page.getByText("4 selected. Ready to compare.")).toBeVisible();
    await expect(submit).toBeEnabled();
  }

  const selectedNames = await choices.evaluateAll((inputs) =>
    inputs
      .filter((input) => (input as HTMLInputElement).checked)
      .map((input) => (input as HTMLInputElement).name)
  );
  expect(selectedNames.length).toBeGreaterThanOrEqual(2);
  expect(selectedNames.every((name) => name === "agent")).toBe(true);
});

test("provides a working skip link and keeps Marketplace navigation visible", async ({ page }) => {
  await page.goto("/agents/56/1");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", {
      name: "Marketplace"
    })
  ).toBeVisible();
});

test("opens the judge proof room without promoting incomplete gates", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Proof room" })
    .click();

  await expect(page).toHaveURL(/\/proof$/u);
  await expect(
    page.getByRole("heading", { name: "Proof, including what is missing." })
  ).toBeVisible();
  await expect(page.getByText("No — gates remain open")).toBeVisible();
  await expect(page.locator("[data-gate-id]")).toHaveCount(7);
  await expect(page.locator('[data-gate-state="verified"]')).toHaveCount(1);
  await expect(page.getByText(/BSC testnet ERC-8004 Agent ID/u)).toHaveCount(4);
  await expect(page.getByText(/Execution disabled/u)).toHaveCount(4);
});
