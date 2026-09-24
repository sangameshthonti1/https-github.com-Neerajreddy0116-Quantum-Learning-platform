import { expect, test, type Page } from "@playwright/test";

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function unlockTopic(page: Page, slug: string) {
  await page.goto(`/library/unlock?topic=${slug}`);
  await expect(
    page.getByRole("heading", { name: "Unlock the complete Quantum Library." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Buy & unlock — demo" }).click();
  await expect(page).toHaveURL(`/library/${slug}`);
}

test.describe("Quantum Library", () => {
  test("catalog presents reviewed topics and supports search and category filters", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/library");

    await expect(
      page.getByRole("heading", { level: 1, name: /reference you can read/i }),
    ).toBeVisible();
    await expect(page.getByText(/3 free · 10 demo-locked/)).toBeVisible();
    await expect(page.locator(".library-topic-card")).toHaveCount(13);
    await expect(
      page.locator('.library-topic-card[data-locked="true"]'),
    ).toHaveCount(10);
    await expect(
      page.locator(".library-topic-card:not([data-locked])"),
    ).toHaveCount(3);
    await expect(
      page.getByRole("link", { name: "Write a local topic" }),
    ).toBeVisible();

    for (const slug of [
      "classical-information-and-bits",
      "qubits-and-superposition",
      "amplitudes-and-the-born-rule",
    ]) {
      await page.goto(`/library/${slug}`);
      await expect(
        page.getByRole("navigation", { name: "On this page" }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Locked library topic" }),
      ).toHaveCount(0);
    }
    await page.goto("/library");

    await page
      .getByRole("searchbox", { name: "Search the library" })
      .fill("multi-qubit state spaces");
    await expect(page.locator(".library-topic-card")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Multi-qubit state spaces" }),
    ).toBeVisible();

    await page.getByRole("searchbox", { name: "Search the library" }).fill("");
    await page.getByLabel("Topic area").selectOption("Phase & interference");
    await expect(page.locator(".library-topic-card")).toHaveCount(3);
    await expect(
      page.getByRole("heading", {
        name: "Global phase, relative phase, and the Z gate",
      }),
    ).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("library-catalog-desktop.png"),
      fullPage: true,
    });
  });

  test("locked direct route uses an honest free demo checkout and persists access", async ({
    page,
  }, testInfo) => {
    const paymentRequests: string[] = [];
    page.on("request", (request) => {
      if (/razorpay|\/api\/pay/i.test(request.url()))
        paymentRequests.push(request.url());
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/library/phase-in-quantum-states");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Global phase, relative phase, and the Z gate",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Locked library topic" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "On this page" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Download original source notes" }),
    ).toHaveCount(0);

    await page.getByRole("link", { name: "Continue to demo checkout" }).click();
    await expect(page).toHaveURL(
      "/library/unlock?topic=phase-in-quantum-states",
    );
    await expect(
      page.getByRole("heading", {
        name: "Unlock the complete Quantum Library.",
      }),
    ).toBeVisible();
    const checkout = page.getByRole("region", { name: "Demo checkout" });
    await expect(checkout.getByText("NO REAL PAYMENT")).toBeVisible();
    await expect(checkout.getByText("₹0", { exact: true })).toBeVisible();
    await expect(checkout.locator("input")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("library-demo-checkout-desktop.png"),
      fullPage: true,
    });

    await checkout.getByRole("button", { name: "Buy & unlock — demo" }).click();
    await expect(page).toHaveURL("/library/phase-in-quantum-states");
    await expect(
      page.getByRole("navigation", { name: "On this page" }),
    ).toBeVisible();
    await expect(
      page.getByText(/global phase is physically irrelevant/i).first(),
    ).toBeVisible();
    await expect(page.locator("iframe, embed, object")).toHaveCount(0);

    const downloads = page
      .getByRole("group", { name: "Download original source notes" })
      .getByRole("link");
    await expect(downloads).toHaveCount(2);
    const source = downloads.first();
    await expect(source).toHaveAttribute("download", "");
    await expect(source).toHaveAttribute(
      "href",
      /\/library\/sources\/.+\.pdf$/,
    );
    const href = await source.getAttribute("href");
    expect(href).not.toBeNull();
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect((await response.body()).subarray(0, 4).toString()).toBe("%PDF");

    await page.reload();
    await expect(
      page.getByRole("navigation", { name: "On this page" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to all topics" }).click();
    await expect(
      page.locator('.library-topic-card[data-locked="true"]'),
    ).toHaveCount(0);
    await expect(
      page.getByText(/13 reviewed topics unlocked in this browser/),
    ).toBeVisible();
    expect(paymentRequests).toEqual([]);
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("library-article-desktop.png"),
      fullPage: true,
    });
  });

  test("knowledge-check answers use progressive disclosure", async ({
    page,
  }, testInfo) => {
    await unlockTopic(page, "knowledge-checks");
    const firstCheck = page.locator(".library-checks article").first();
    await expect(firstCheck.getByRole("heading")).toBeVisible();
    await expect(firstCheck.locator("details")).not.toHaveAttribute("open", "");
    await firstCheck.getByText("Check answer", { exact: true }).click();
    await expect(firstCheck.locator("details")).toHaveAttribute("open", "");
    await expect(firstCheck.locator("details p")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("library-checks-open.png"),
      fullPage: true,
    });
  });

  test("local research topic validates, persists, and can be deleted", async ({
    page,
  }, testInfo) => {
    await page.goto("/library/new");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Write a new library topic.",
      }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("library-editor-desktop.png"),
      fullPage: true,
    });

    await page
      .getByLabel("Article title")
      .fill("Interference research notebook");
    await page.getByLabel("Author or byline").fill("Student researcher");
    await page
      .getByLabel("Abstract or summary")
      .fill(
        "A local research note comparing constructive and destructive quantum interference.",
      );
    await page
      .getByLabel("Article manuscript")
      .fill(
        "## Research question\n\nHow do phase relationships change a measurable outcome in a simple circuit?\n\n## Method\n\nPrepare a qubit, apply controlled phase changes, and compare repeated measurements with the predicted amplitudes.\n\n- Record the circuit\n- Compare ideal probabilities",
      );
    await page
      .getByLabel("Key terms")
      .fill("Interference: Combination of quantum amplitudes.");
    await page
      .getByLabel("Sources")
      .fill("Unsafe source | javascript:alert(1)");
    await page
      .getByRole("button", { name: "Save topic in this browser" })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Source URL must start with http:// or https://",
    );

    await page
      .getByLabel("Sources")
      .fill(
        "Qiskit learning resources | https://quantum.cloud.ibm.com/learning",
      );
    await page
      .getByRole("button", { name: "Save topic in this browser" })
      .click();
    await expect(page).toHaveURL(/\/library\/interference-research-notebook-/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Interference research notebook",
      }),
    ).toBeVisible();
    await expect(page.getByText("LOCAL BROWSER TOPIC")).toBeVisible();
    await expect(
      page.getByText(/not been reviewed or uploaded/i),
    ).toBeVisible();
    await expect(page.getByText("By Student researcher")).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Interference research notebook",
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to all topics" }).click();
    await expect(page).toHaveURL("/library");
    await expect(page.locator(".library-hero-actions > span")).toContainText(
      "10 demo-locked · 1 local",
    );
    await page
      .getByRole("link", {
        name: "Interference research notebook",
        exact: true,
      })
      .click();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete local topic" }).click();
    await expect(page).toHaveURL("/library");
    await expect(page.locator(".library-hero-actions > span")).toContainText(
      "10 demo-locked · 0 local",
    );
    await expect(
      page.getByRole("link", {
        name: "Interference research notebook",
        exact: true,
      }),
    ).toHaveCount(0);

    await page.screenshot({
      path: testInfo.outputPath("library-after-local-delete.png"),
      fullPage: true,
    });
  });

  test("catalog, article, editor, and AI Tutor remain accessible on mobile", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/library");
    await expect(
      page.getByRole("heading", { level: 1, name: /reference you can read/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "AI Tutor", exact: true }),
    ).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("library-catalog-mobile.png"),
      fullPage: true,
    });

    await page.goto("/library/hzh-phase-to-bit-flip");
    await expect(
      page.getByRole("region", { name: "Locked library topic" }),
    ).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("library-locked-mobile.png"),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Continue to demo checkout" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Unlock the complete Quantum Library.",
      }),
    ).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("library-demo-checkout-mobile.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Buy & unlock — demo" }).click();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Turning phase into a bit flip/,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "On this page" }),
    ).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("library-article-mobile.png"),
      fullPage: true,
    });

    await page.goto("/library/new");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Write a new library topic.",
      }),
    ).toBeVisible();
    await expectNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("library-editor-mobile.png"),
      fullPage: true,
    });
  });

  test("unknown article route is honest and keeps a working recovery link", async ({
    page,
  }) => {
    await page.goto("/library/not-published");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "This topic has not been published.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/No substitute or generated content has been inserted/),
    ).toBeVisible();
    await page.getByRole("link", { name: "Browse the library" }).click();
    await expect(page).toHaveURL("/library");
  });
});
