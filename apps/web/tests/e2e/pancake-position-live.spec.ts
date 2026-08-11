import { expect, test } from "@playwright/test";

const LIVE_READ_ENABLED = process.env.PROOFERA_LIVE_READ_EVIDENCE === "1";
const CHAIN_ID = process.env.PROOFERA_LIVE_CHAIN_ID === "97" ? "97" : "56";
const POSITION_ID = process.env.PROOFERA_LIVE_POSITION_ID ?? "7115046";
const POOL = process.env.PROOFERA_LIVE_POOL_ADDRESS ?? "0x27B5c411a43DEA7cA7e60632eA73fd9E74ED06A8";
const EXPLORER_ORIGIN = CHAIN_ID === "97" ? "https://testnet.bscscan.com" : "https://bscscan.com";

test.describe("opt-in live Pancake V3 position evidence", () => {
  test.skip(
    !LIVE_READ_ENABLED,
    "Set PROOFERA_LIVE_READ_EVIDENCE=1 to run a real, read-only BSC provider check."
  );

  test("validates one real position through the atomic latest adapter", async ({ page }) => {
    await page.goto(
      `/pancake-position?chainId=${CHAIN_ID}&poolAddress=${encodeURIComponent(POOL)}&positionId=${POSITION_ID}`
    );

    await expect(page.getByText("Read available", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Position evidence at one block" })
    ).toBeVisible();
    await expect(page.getByText(POSITION_ID, { exact: true })).toBeVisible();
    await expect(page.getByText("Atomic block snapshot", { exact: true })).toBeVisible();
    await expect(page.getByText(/contract and block-context reads in one unsplit/i)).toBeVisible();
    await expect(page.getByText(/deployed-code hash not established/i)).toBeVisible();
    await expect(page.getByText(/cannot expose its own current hash/i)).toBeVisible();
    await expect(
      page.getByText("Read evidence, not write-manifest identity", { exact: true })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /pool contract/i })).toHaveAttribute(
      "href",
      `${EXPLORER_ORIGIN}/address/${POOL}`
    );

    for (const unsupportedMetric of ["Fee APR", "Net performance", "Estimated impermanent loss"]) {
      await expect(page.getByText(unsupportedMetric, { exact: true })).toHaveCount(0);
    }
  });
});
