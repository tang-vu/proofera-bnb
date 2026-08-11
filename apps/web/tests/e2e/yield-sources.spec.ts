import { expect, test } from "@playwright/test";

test("renders an honest, read-only Lista yield-source terminal state", async ({ page }) => {
  await page.goto("/yield-sources", { timeout: 45_000, waitUntil: "domcontentloaded" });

  const terminalHeading = page.getByRole("heading", {
    name: /^(?:Raw Lista vault-list records|No vault records on the bounded page|No Lista source snapshot was established)$/
  });
  await expect(terminalHeading).toBeVisible({ timeout: 30_000 });
  await expect(terminalHeading).toHaveCount(1);

  await expect(page.getByRole("heading", { name: "APY scale: UNKNOWN" })).toBeVisible();
  await expect(page.getByText("BSC mainnet / chain 56", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Disabled — this route reads evidence and cannot activate or transact.", {
      exact: true
    })
  ).toBeVisible();

  const productSurface = page.getByRole("main");
  await expect(productSurface.locator("form, button, input, select, textarea")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /activate|deposit|withdraw|transact|transaction/i })
  ).toHaveCount(0);

  const sourceLink = page.getByRole("link", { name: "Official API request" });
  await expect(sourceLink).toBeVisible();
  await expect(sourceLink).toHaveAttribute(
    "href",
    "https://api.lista.org/api/moolah/vault/list?page=1&pageSize=12&chain=bsc&sort=apy&order=desc"
  );
  await expect(sourceLink).toHaveAttribute("target", "_blank");
  await expect(sourceLink).toHaveAttribute("rel", /noopener/);

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await expect(page.locator("main#main-content")).toHaveCount(1);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "ProofEra home" })).toBeFocused();

  await page.keyboard.press("Tab");
  const marketplaceLink = page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Marketplace" });
  await expect(marketplaceLink).toBeFocused();
  await expect(marketplaceLink).toBeVisible();
  const outlineStyle = await marketplaceLink.evaluate(
    (element) => getComputedStyle(element).outlineStyle
  );
  expect(outlineStyle).not.toBe("none");
});
