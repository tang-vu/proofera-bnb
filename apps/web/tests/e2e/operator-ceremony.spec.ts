import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  ).toBe(false);
}

test("starts one honest operator session and keeps it through a reload", async ({ page }) => {
  await page.goto("/operator-ceremony");

  await expect(
    page.getByRole("heading", { name: "Start once. Stay inside one ceremony." })
  ).toBeVisible();
  await expect(page.getByText(/starting the session creates no evidence by itself/i)).toBeVisible();

  await page.getByRole("button", { name: "Show local runner" }).click();

  await expect(page.getByRole("heading", { name: /keep this page open/i })).toBeVisible();
  await expect(page.getByText("Nothing completed by this page")).toBeVisible();
  await expect(page.getByText("Human result required")).toHaveCount(2);
  await expect(page.getByText("Authority prerequisites absent")).toBeVisible();
  await expect(page.getByText("Waits for a real grant")).toBeVisible();
  await expect(page.getByText("Start ProofEra Ceremony.cmd")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.reload();
  await expect(page.getByRole("heading", { name: /keep this page open/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show local runner" })).toHaveCount(0);
});
