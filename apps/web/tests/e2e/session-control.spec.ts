import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  ).toBe(false);
}

test("presents one-grant autonomy without inflating the PTA fixture", async ({ page }) => {
  await page.goto("/session-control");

  await expect(
    page.getByRole("heading", { name: "Grant once. Stay inside limits." })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Autonomy is bounded, not repetitive." })
  ).toBeVisible();
  await expect(page.getByText("No new signature", { exact: true })).toBeVisible();
  await expect(page.getByText("Block automatically", { exact: true })).toBeVisible();
  await expect(page.getByText("Owner returns", { exact: true })).toBeVisible();
  await expect(page.getByText(/does not add liquidity, mint an LP position/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Configure LP mandate" })).toHaveAttribute(
    "href",
    "/lp-activate"
  );
  await expectNoHorizontalOverflow(page);
});

test("keeps the owner controls visible but never labels a click as evidence", async ({ page }) => {
  await page.goto("/session-control");

  await expect(
    page.getByRole("button", { name: /Grant testnet authority|Authority observed/ })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Revoke session|Revoked|Authority expired/ })
  ).toBeVisible();
  await expect(page.getByText(/without a receipt, there is no completion claim/i)).toBeVisible();
});
