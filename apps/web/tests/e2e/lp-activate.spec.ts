import { expect, test, type Page } from "@playwright/test";

const MAX_UINT256 =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const WALLET = "0x11111111111111111111111111111111111111aa";
const POOL = "0x22222222222222222222222222222222222222bb";

function validConfiguration(): URLSearchParams {
  return new URLSearchParams({
    schemaVersion: "1",
    chainId: "97",
    wallet: WALLET.toUpperCase().replace("0X", "0x"),
    recipient: WALLET.toUpperCase().replace("0X", "0x"),
    poolAddress: POOL.toUpperCase().replace("0X", "0x"),
    positionTokenId: MAX_UINT256,
    tickLower: "-120",
    tickUpper: "120",
    capitalToken0Raw: MAX_UINT256,
    capitalToken1Raw: "1",
    maxSlippageBps: "50",
    sessionDurationSeconds: "3600",
    txDeadlineSeconds: "180",
    maxExecutionsPerDay: "4"
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflowsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflowsViewport).toBe(false);
}

test("starts with an honest, testnet-only configuration boundary", async ({ page }) => {
  await page.goto("/lp-activate");

  await expect(
    page.getByRole("heading", { name: "Grant once. Keep every action bounded." })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Set user boundaries first." })).toBeVisible();
  await expect(
    page.getByText("No wallet, network, or protocol request has been made.", { exact: false })
  ).toBeVisible();
  await expect(page.getByLabel("BSC network")).toHaveValue("97");
  await expect(page.getByLabel("Intended execution wallet (not connected)")).toHaveValue("");
  await expect(page.getByRole("heading", { name: "One grant is the boundary." })).toBeVisible();
  await expect(page.getByText("No re-sign", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /activate|confirm|connect wallet/i })).toHaveCount(
    0
  );

  await expectNoHorizontalOverflow(page);
});

test("renders exact normalized user bounds and blocks authority", async ({ page }) => {
  const query = validConfiguration();
  await page.goto(`/lp-activate?${query.toString()}`);

  await expect(
    page.getByRole("heading", { name: "Configuration captured. Authority absent." })
  ).toBeVisible();
  await expect(page.getByText("Readiness blocked", { exact: true })).toBeVisible();
  await expect(page.getByText(WALLET, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(MAX_UINT256, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Inspect the verified session-key flow/ })
  ).toHaveAttribute("href", "/session-control");

  const readiness = page
    .getByRole("region", { name: "Configuration captured. Authority absent." })
    .getByRole("status");
  for (const blocker of [
    "No wallet connection has been established.",
    "Server-owned manager, factory, pool, deployed-code identity, token metadata, tick spacing, and pinned-block evidence are absent.",
    "Position ownership and controller authorization evidence are absent.",
    "A fresh block-pinned quote and minimum-output provenance are absent.",
    "No permission policy or permission preview has been created.",
    "No Altana session authority has been requested or created.",
    "No transaction has been prepared, signed, submitted, or recorded."
  ]) {
    await expect(readiness.getByRole("listitem").filter({ hasText: blocker })).toBeVisible();
  }

  await expect(
    page.getByText("Unknown until trusted token addresses and decimals are established.", {
      exact: true
    })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /activate|confirm|connect wallet/i })).toHaveCount(
    0
  );
  await expectNoHorizontalOverflow(page);
});

test("rejects repeated and trust-owned query fields without reflecting them", async ({ page }) => {
  const query = validConfiguration();
  query.append("wallet", WALLET);
  query.set("managerAddress", "0x9999999999999999999999999999999999999999");

  await page.goto(`/lp-activate?${query.toString()}`);

  await expect(page.getByRole("heading", { name: "Correct the user boundary." })).toBeVisible();
  await expect(page.getByText("No wallet, network, or protocol request was made.")).toBeVisible();
  await expect(page.getByText(/must appear exactly once/i)).toBeVisible();
  await expect(page.getByText(/only user-controlled LP configuration fields/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Configuration captured. Authority absent." })
  ).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(
    "0x9999999999999999999999999999999999999999"
  );
});

test("provides a keyboard-reachable skip target and ordered form controls", async ({ page }) => {
  await page.goto("/lp-activate");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const wallet = page.getByLabel("Intended execution wallet (not connected)");
  const recipient = page.getByLabel("Recipient address");
  await wallet.focus();
  await expect(wallet).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(recipient).toBeFocused();
  expect(await recipient.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
    "none"
  );
});
