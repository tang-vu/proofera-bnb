import { expect, test } from "@playwright/test";

const expectedAnalyzers = [
  "LP Range Analyzer",
  "Grid Trading Analyzer",
  "Yield Optimisation Analyzer",
  "Health-Factor Guardian Analyzer"
] as const;

test("the primary CTA reveals the intent and all analyzers independently of registry ingress", async ({
  page
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Find an agent" }).click();

  await expect(page).toHaveURL(/\/marketplace$/);
  await expect(page.getByRole("heading", { name: "Start with the job." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Define the mandate" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Four registered analyzers. Zero invented performance."
    })
  ).toBeVisible();

  for (const analyzer of expectedAnalyzers) {
    await expect(page.getByRole("heading", { name: analyzer })).toBeVisible();
  }

  const configuredDelay = Number(process.env.PROOFERA_E2E_REGISTRY_DELAY_MS ?? "0");
  if (configuredDelay > 0) {
    await expect(page.getByRole("status", { name: "Registry evidence pending" })).toBeVisible();
  }

  const terminalState = page.locator("[data-registry-terminal-state]");
  await expect(terminalState).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByRole("status", { name: "Registry evidence pending" })).toHaveCount(0);

  const state = await terminalState.getAttribute("data-registry-terminal-state");
  expect(["available", "empty", "unavailable"]).toContain(state);

  if (state === "unavailable") {
    await expect(terminalState).toContainText("None — no fixtures substituted");
  }
  if (state === "empty") {
    await expect(terminalState).toContainText("valid empty result");
  }
  if (state === "available") {
    await expect(terminalState).toContainText("Live 8004scan response");
  }
});

test("the streamed marketplace keeps keyboard navigation and analyzer dossiers usable", async ({
  page
}) => {
  await page.goto("/marketplace");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const lpDossier = page.getByRole("link", { name: "Open LP Range Analyzer dossier" });
  await lpDossier.focus();
  await expect(lpDossier).toBeFocused();
  await expect(lpDossier).toHaveAttribute("href", "/reference-analyzers/lp-rebalancing");
});

test("the selected mandate resolves to explicit live data or an honest source failure", async ({
  page
}) => {
  await page.goto("/marketplace?category=yield-optimisation");

  await expect(
    page.getByRole("heading", { name: "Live evidence for this mandate." })
  ).toBeVisible();
  const terminal = page.locator("[data-live-evidence-terminal-state]");
  await expect(terminal).toHaveCount(1, { timeout: 30_000 });

  const state = await terminal.getAttribute("data-live-evidence-terminal-state");
  expect(["available", "empty", "unavailable"]).toContain(state);
  await expect(terminal.getByText("No fallback applied", { exact: true })).toBeVisible();
  await expect(terminal.getByText("Capital execution disabled", { exact: true })).toBeVisible();
  await expect(terminal.getByRole("link", { name: "Activate analysis service" })).toHaveAttribute(
    "href",
    "/studio?agent=yield-optimisation"
  );

  if (state === "available") {
    await expect(terminal.getByText("APY / raw decimal", { exact: true })).toBeVisible();
    await expect(terminal.getByText("Source total", { exact: true })).toBeVisible();
  } else if (state === "empty") {
    await expect(terminal).toContainText("authoritative empty");
  } else {
    await expect(terminal).toContainText("No current Lista yield-source snapshot was established");
  }
});
