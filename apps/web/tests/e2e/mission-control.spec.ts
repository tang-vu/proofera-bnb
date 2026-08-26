import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  ).toBe(false);
}

test("shows revoked historical evidence without claiming active authority", async ({ page }) => {
  await page.goto("/mission-control");

  await expect(
    page.getByRole("heading", { name: "Control the mandate, not every action." })
  ).toBeVisible();
  const emptyState = page.getByRole("status");
  await expect(
    emptyState.getByRole("heading", { name: "No active agent session exists." })
  ).toBeVisible();
  await expect(
    emptyState.getByText(
      /No current allocation, transaction, Proof Stream receipt, or active permission is inferred/
    )
  ).toBeVisible();
  // Next's development overlay adds its own floating button on some mobile
  // runs. Scope the safety assertion to the product surface.
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  await expect(page.locator(".state-live")).toHaveCount(0);
  await expect(
    page.getByText(/both fixed providers observed authority absent after the receipt/i)
  ).toBeVisible();
  await expect(page.getByText(/BSC testnet · chain 97/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Grant receipt/ })).toHaveAttribute(
    "href",
    /testnet\.bscscan\.com\/tx\/0x/
  );
  await expect(page.getByText(/does not prove nonzero token movement/i)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("keeps Mission Control keyboard navigation useful", async ({ page }) => {
  await page.goto("/mission-control");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.getByRole("link", { name: "Skip to main content" }).press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const configurationLink = page.getByRole("link", { name: "Configure LP mandate" });
  await expect(configurationLink).toBeVisible();
  await configurationLink.focus();
  await expect(configurationLink).toBeFocused();
  await expect(configurationLink).toHaveCSS("outline-style", "solid");
});
