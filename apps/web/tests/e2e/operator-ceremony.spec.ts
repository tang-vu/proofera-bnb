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
  await expect(page.getByText("One review click")).toHaveCount(2);
  await expect(page.getByText("Ready after faucet funding")).toBeVisible();
  await expect(page.getByText("Waits for a real grant")).toBeVisible();
  await expect(page.getByText("Start ProofEra Ceremony.cmd")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo Altana passkey" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Khôi phục ví đã có giao dịch" })).toBeVisible();
  await expect(page.getByText(/passkey vừa tạo có thể vẫn là ví counterfactual/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Grant quyền testnet" })).toBeDisabled();
  await expect(
    page
      .getByLabel("Exact Altana test action policy")
      .getByText(/chain 97 · PTA approve\(address,uint256\)/)
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.reload();
  await expect(page.getByRole("heading", { name: /keep this page open/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show local runner" })).toHaveCount(0);
});

test("enables the bounded grant only for the pinned funded passkey wallet", async ({ page }) => {
  await page.route("**/api/operator-ceremony/altana-state", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        availability: "available",
        state: {
          schemaVersion: 1,
          chainId: 97,
          configHash: `0x${"11".repeat(32)}`,
          walletAddress: "0x91Aa0E6627bFF6C911B38CEd5F7885E063b7C27a",
          sessionKeyAddress: "0xb5F0658E3bc0c3495729b87DE32f568Bdc995a11",
          status: "waiting_authority",
          authorityPresent: false,
          balanceWei: "5000000000000000",
          sessionExpiry: null,
          execute: null,
          observedAt: "2026-08-21T00:00:00.000Z"
        }
      })
    });
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "proofera.altana.passkey-wallet.v1",
      JSON.stringify({
        schemaVersion: 1,
        chainId: 97,
        address: "0x91Aa0E6627bFF6C911B38CEd5F7885E063b7C27a",
        credential: {
          kind: "webauthn",
          id: "test-credential",
          publicKey: `0x${"11".repeat(64)}`,
          rpId: "localhost"
        }
      })
    );
  });

  await page.goto("/operator-ceremony");

  await expect(page.getByRole("button", { name: "Grant quyền testnet" })).toBeEnabled();
  await expect(page.getByText(/worker và funding đã sẵn sàng/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoke session" })).toBeDisabled();
});

test("offers immediate revoke while an authorized execute is still pending", async ({ page }) => {
  await page.route("**/api/operator-ceremony/altana-state", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        availability: "available",
        state: {
          schemaVersion: 1,
          chainId: 97,
          configHash: `0x${"11".repeat(32)}`,
          walletAddress: "0x91Aa0E6627bFF6C911B38CEd5F7885E063b7C27a",
          sessionKeyAddress: "0xb5F0658E3bc0c3495729b87DE32f568Bdc995a11",
          status: "execute_pending",
          authorityPresent: true,
          balanceWei: "98390568466905952",
          sessionExpiry: 1_787_330_074,
          execute: { callsId: `0x${"22".repeat(32)}`, transactionHash: null },
          observedAt: "2026-08-21T00:00:00.000Z"
        }
      })
    });
  });
  await page.addInitScript(() => {
    const walletAddress = "0x91Aa0E6627bFF6C911B38CEd5F7885E063b7C27a";
    const sessionPublicKey =
      "0x0481b28f8d35bf3c63575e01886128f5d7f6c0ef323af114d3d759ccdafd88e18527cffed5aa7d44edd7580d71f0ae1b0681e5469522fdc1ce9191b5e94a8fd67d";
    window.localStorage.setItem(
      "proofera.altana.passkey-wallet.v1",
      JSON.stringify({
        schemaVersion: 1,
        chainId: 97,
        address: walletAddress,
        credential: {
          kind: "webauthn",
          id: "test-credential",
          publicKey: `0x${"11".repeat(64)}`,
          rpId: "localhost"
        }
      })
    );
    window.localStorage.setItem(
      "proofera.altana.test-action.v1",
      JSON.stringify({
        schemaVersion: 1,
        walletAddress,
        sessionPublicKey,
        status: "grant_confirmed_probe_required",
        intent: { walletAddress, sessionKey: { publicKey: sessionPublicKey } },
        grant: { callsId: `0x${"33".repeat(32)}`, transactionHash: null },
        revoke: null,
        updatedAt: "2026-08-21T00:00:00.000Z"
      })
    );
  });

  await page.goto("/operator-ceremony");

  await expect(page.getByRole("button", { name: "Revoke session" })).toBeEnabled();
  await expect(page.getByText(/execute chưa có receipt; bạn có thể revoke ngay/i)).toBeVisible();
});

test("shows terminal relay failure and never offers a consumed signer grant again", async ({
  page
}) => {
  await page.route("**/api/operator-ceremony/altana-state", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        availability: "available",
        state: {
          schemaVersion: 1,
          chainId: 97,
          configHash: `0x${"11".repeat(32)}`,
          walletAddress: "0x91Aa0E6627bFF6C911B38CEd5F7885E063b7C27a",
          sessionKeyAddress: "0xb5F0658E3bc0c3495729b87DE32f568Bdc995a11",
          status: "execute_failed",
          authorityPresent: false,
          balanceWei: "98390568466905952",
          sessionExpiry: 1_787_330_074,
          execute: {
            callsId: `0x${"22".repeat(32)}`,
            relayStatusCode: 300,
            transactionHash: null
          },
          observedAt: "2026-08-22T00:00:00.000Z"
        }
      })
    });
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "proofera.altana.passkey-wallet.v1",
      JSON.stringify({
        schemaVersion: 1,
        chainId: 97,
        address: "0x91Aa0E6627bFF6C911B38CEd5F7885E063b7C27a",
        credential: {
          kind: "webauthn",
          id: "test-credential",
          publicKey: `0x${"11".repeat(64)}`,
          rpId: "localhost"
        }
      })
    );
  });

  await page.goto("/operator-ceremony");

  await expect(page.getByText(/trạng thái failure 300/i)).toBeVisible();
  await expect(page.getByText("300", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Grant quyền testnet" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Authority đã hết hạn" })).toBeDisabled();
});
