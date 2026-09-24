import { expect, test, type Page } from "@playwright/test";

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function openSidebarPage(page: Page, name: string) {
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible()) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("dialog", { name: "Application navigation" })
      .getByRole("link", { name, exact: true })
      .click();
    return;
  }
  await page
    .getByRole("complementary", { name: "Application sidebar" })
    .getByRole("link", { name, exact: true })
    .click();
}

test.describe("Payments and billing demo", () => {
  test("shows an honest free state with a separate active navigation item", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/payments");

    await expect(
      page.getByRole("heading", { level: 1, name: "Payments & billing." }),
    ).toBeVisible();
    const current = page
      .getByRole("navigation", { name: "Main navigation" })
      .locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText("Payments");

    const access = page.getByRole("region", {
      name: "Library access summary",
    });
    await expect(
      access.getByRole("heading", { name: "Free Library access" }),
    ).toBeVisible();
    await expect(access.getByText("₹9", { exact: true })).toBeVisible();
    await expect(access.getByText("₹0", { exact: true })).toBeVisible();
    await expect(
      access.getByText("Not connected", { exact: true }),
    ).toBeVisible();
    await expect(
      access.getByRole("link", { name: "Open demo checkout" }),
    ).toHaveAttribute("href", "/library/unlock");
    await expect(access.locator("input")).toHaveCount(0);

    await expect(page.getByText("No demo unlock recorded.")).toBeVisible();
    await expect(page.getByText("NOT AN INVOICE")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "AI Tutor", exact: true }),
    ).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("payments-locked-desktop.png"),
      fullPage: true,
    });
  });

  test("records the free demo unlock, persists it, and can reset it", async ({
    page,
  }, testInfo) => {
    const paymentRequests: string[] = [];
    page.on("request", (request) => {
      if (/razorpay|\/api\/pay|checkout\.razorpay/i.test(request.url()))
        paymentRequests.push(request.url());
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/payments");
    await page.getByRole("link", { name: "Open demo checkout" }).click();
    await expect(page).toHaveURL("/library/unlock");

    const checkout = page.getByRole("region", { name: "Demo checkout" });
    await expect(checkout.getByText("NO REAL PAYMENT")).toBeVisible();
    await expect(checkout.getByText("₹0", { exact: true })).toBeVisible();
    await expect(checkout.locator("input")).toHaveCount(0);
    await checkout.getByRole("button", { name: "Buy & unlock — demo" }).click();
    await expect(page).toHaveURL("/library");

    await openSidebarPage(page, "Payments");
    await expect(page).toHaveURL("/payments");
    await expect(page.getByText("DEMO ACCESS ACTIVE")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Complete Library demo access" }),
    ).toBeVisible();
    const receipt = page.getByRole("article", { name: "Demo receipt" });
    await expect(receipt).toBeVisible();
    await expect(receipt.locator("time")).toBeVisible();
    await expect(receipt.getByText("₹9", { exact: true })).toBeVisible();
    await expect(receipt.getByText("₹0", { exact: true })).toBeVisible();
    await expect(receipt).toContainText("not a legal invoice");
    await page.screenshot({
      path: testInfo.outputPath("payments-unlocked-desktop.png"),
      fullPage: true,
    });

    await page.reload();
    await expect(page.getByText("DEMO ACCESS ACTIVE")).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Demo receipt" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Reset demo access" }).click();
    await expect(
      page.getByRole("heading", { name: "Free Library access" }),
    ).toBeVisible();
    await expect(page.getByText("No demo unlock recorded.")).toBeVisible();
    expect(
      await page.evaluate(() => ({
        access: localStorage.getItem("qlp-library-demo-unlock-v1"),
        receipt: localStorage.getItem("qlp-library-demo-receipt-v1"),
      })),
    ).toEqual({ access: null, receipt: null });

    await openSidebarPage(page, "Library");
    await expect(page).toHaveURL("/library");
    await expect(
      page.locator('.library-topic-card[data-locked="true"]'),
    ).toHaveCount(10);
    expect(paymentRequests).toEqual([]);
  });

  test("locked and unlocked billing views remain usable on mobile", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/payments");

    await expect(
      page.getByRole("heading", { level: 1, name: "Payments & billing." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "AI Tutor", exact: true }),
    ).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("payments-locked-mobile.png"),
      fullPage: true,
    });

    await page.getByRole("link", { name: "Open demo checkout" }).click();
    await page.getByRole("button", { name: "Buy & unlock — demo" }).click();
    await openSidebarPage(page, "Payments");
    await expect(page.getByText("DEMO ACCESS ACTIVE")).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Demo receipt" }),
    ).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("payments-unlocked-mobile.png"),
      fullPage: true,
    });
  });
});
