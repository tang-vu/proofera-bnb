import { expect, test } from "@playwright/test";

test("exposes health-category and raw Venus evidence entry links", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Explore Health monitoring agents" })
  ).toHaveAttribute("href", "/marketplace?category=health-factor-monitoring");

  await page.goto("/marketplace");
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", {
      name: "Venus liquidity"
    })
  ).toBeVisible();
});

test("opens the Venus reader in a no-read state", async ({ page }) => {
  await page.goto("/venus-health");

  await expect(page).toHaveURL(/\/venus-health$/);
  await expect(
    page.getByRole("heading", { name: "Inspect liquidity without inventing a health factor." })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enter an account to begin." })).toBeVisible();
  await expect(page.getByText("No RPC request has been made.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Health factor: UNKNOWN" })).toBeVisible();
  await expect(page.getByLabel("BSC network")).toHaveValue("56");
  await expect(page.getByLabel("Venus account address")).toHaveValue("");
  await expect(page.getByLabel(/RPC URL/i)).toHaveCount(0);

  const overflowsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflowsViewport).toBe(false);
});

test("rejects invalid Venus input without an RPC read", async ({ page }) => {
  await page.goto(
    "/venus-health?chainId=1&account=not-an-address&rpcUrl=https%3A%2F%2Fsecret-provider.test%2Fkey"
  );

  await expect(page.getByRole("heading", { name: "Correct the read boundary." })).toBeVisible();
  await expect(page.getByText("No RPC request was made.")).toBeVisible();
  await expect(page.getByText(/only chainId and account query parameters/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Health factor: UNKNOWN" })).toBeVisible();
  await expect(page.getByText("Read available", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(/RPC URL/i)).toHaveCount(0);

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toContain("secret-provider.test");
});
