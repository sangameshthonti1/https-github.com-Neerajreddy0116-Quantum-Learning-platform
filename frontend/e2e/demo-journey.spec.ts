import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

let backend: ChildProcess | undefined;

test.beforeAll(async () => {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(8001, "127.0.0.1", () => probe.close(() => resolve()));
  });
  backend = spawn(
    fileURLToPath(new URL("../../backend/.venv/bin/python", import.meta.url)),
    [
      "-m",
      "uvicorn",
      "app.main:create_app",
      "--factory",
      "--host",
      "127.0.0.1",
      "--port",
      "8001",
    ],
    {
      cwd: fileURLToPath(new URL("../../backend/", import.meta.url)),
      env: {
        ...process.env,
        QLP_AI_ENABLED: "false",
        QLP_CORS_ORIGINS: "[]",
        PYTHONDONTWRITEBYTECODE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  backend.stderr?.on("data", (chunk: Buffer) => {
    log += chunk.toString();
  });
  await once(backend, "spawn");
  await expect
    .poll(
      async () => {
        if (backend?.exitCode !== null) throw new Error(log);
        try {
          return (
            await fetch("http://127.0.0.1:8001/api/health", {
              signal: AbortSignal.timeout(1000),
            })
          ).status;
        } catch {
          return 0;
        }
      },
      { timeout: 15000 },
    )
    .toBe(200);
});

test.afterAll(async () => {
  const child = backend;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const deadline = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(deadline);
  }
});

const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

async function runAlgorithm(page: Page, prediction: string) {
  await expect(
    page.getByRole("heading", { name: "Generated circuit", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: prediction, exact: true }).check();
  await button(page, "Submit prediction").click();
  const pending = page.waitForResponse((response) =>
    response.url().endsWith("/api/algorithms/run"),
  );
  await button(page, "Run algorithm").click();
  const response = await pending;
  expect(response.status()).toBe(200);
  await expect(
    page.getByRole("region", { name: "Algorithm results", exact: true }),
  ).toBeVisible();
}

for (const width of [1440, 390])
  test(`SIH demo at ${width}px: phase lesson to Deutsch–Jozsa to verified challenge and progress`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    if (width === 390) await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/learn/phase");
    await page
      .getByRole("navigation", { name: "Lesson sections" })
      .getByRole("button")
      .last()
      .click();
    const handoff = page.getByRole("region", {
      name: "Continue to Deutsch–Jozsa",
      exact: true,
    });
    await expect(handoff).toContainText(
      "Use interference to reveal a hidden rule",
    );
    await handoff
      .getByRole("link", { name: "Continue to Deutsch–Jozsa →", exact: true })
      .click();
    await expect(page).toHaveURL("/algorithms/deutsch-jozsa");

    await runAlgorithm(page, "All input bits will be 0");
    await expect(page.getByTestId("algorithm-conclusion")).toHaveText(
      "Constant function",
    );
    await expect(
      page
        .locator(".algorithm-result-summary")
        .getByText("all zeros with ideal probability 100%", { exact: false }),
    ).toBeVisible();

    await button(page, "Balanced · return q0").click();
    await runAlgorithm(page, "At least one input bit will be 1");
    await expect(page.getByTestId("algorithm-conclusion")).toHaveText(
      "Balanced function",
    );
    await expect(
      page
        .locator(".algorithm-result-summary")
        .getByText("Measuring the input gives at least one 1", {
          exact: false,
        }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Circuit playback", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Now measure the input register.", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("Playback speed", { exact: true }).selectOption("2");
    await button(page, "Replay circuit playback").click();
    await expect(button(page, "Pause circuit playback")).toBeVisible();
    await expect
      .poll(async () =>
        Number(
          await page.getByLabel("Trace step", { exact: true }).inputValue(),
        ),
      )
      .toBeGreaterThan(0);
    await button(page, "Pause circuit playback").click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/sih-demo-algorithm-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });

    await page
      .getByRole("region", {
        name: "Continue to a verified challenge",
        exact: true,
      })
      .getByRole("link", {
        name: "Continue to verified challenge",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL("/challenges/interference");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Bring it back",
        exact: true,
      }),
    ).toBeVisible();
    if (!(await button(page, "Choose H gate").isVisible()))
      await button(page, "Gates & settings").click();
    await button(page, "Choose H gate").click();
    if (await button(page, "Circuit").isVisible())
      await button(page, "Circuit").click();
    await button(page, "Place gate on q0 at step 2").click();

    const simulation = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/simulate") &&
        response.request().method() === "POST",
    );
    await button(page, "Run Simulation").click();
    expect((await simulation).status()).toBe(200);
    if (await button(page, "Results").isVisible())
      await button(page, "Results").click();
    await expect(page.getByTestId("lab-probability-0")).toContainText(
      "100.0000%",
    );
    if (await button(page, "Circuit").isVisible())
      await button(page, "Circuit").click();

    const grading = page.waitForResponse((response) =>
      response.url().endsWith("/api/challenges/grade"),
    );
    await button(page, "Submit for grading").click();
    expect((await grading).status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Target achieved", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "View progress update →", exact: true })
      .click();

    await expect(page).toHaveURL("/progress");
    const progress = page.getByRole("region", {
      name: "Challenge progress",
      exact: true,
    });
    await expect(progress).toContainText("1 / 8 completed");
    const record = progress.getByRole("listitem").filter({
      has: page.getByRole("link", { name: "Bring it back", exact: true }),
    });
    await expect(record).toContainText("1 submissions · Best 100/100");
    await expect(record).toContainText("Completed");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/sih-demo-progress-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  });
