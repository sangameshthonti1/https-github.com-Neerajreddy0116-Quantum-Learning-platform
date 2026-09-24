import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import type { TutorRequest } from "../src/tutor/types";

let backend: ChildProcess | undefined;

async function startBackend() {
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
      "tests.tutor_browser_app:create_test_app",
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
        OPENAI_API_KEY: "",
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
    .poll(async () => {
      if (backend?.exitCode !== null) throw new Error(log);
      try {
        return (await fetch("http://127.0.0.1:8001/api/health")).status;
      } catch {
        return 0;
      }
    })
    .toBe(200);
}

async function stopBackend() {
  const child = backend;
  backend = undefined;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const deadline = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(deadline);
  }
}

const panel = (page: Page) =>
  page.getByRole("dialog", { name: "AI Tutor", exact: true });
const launcher = (page: Page) =>
  page.getByRole("button", { name: "AI Tutor", exact: true });

async function openTutor(page: Page) {
  await expect(launcher(page)).toBeVisible();
  await expect(launcher(page)).toBeEnabled();
  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(page.getByLabel("Your question", { exact: true })).toBeFocused();
}

async function closeTutor(page: Page) {
  await page.getByRole("button", { name: "Close AI Tutor" }).click();
  await expect(panel(page)).not.toBeVisible();
}

test.describe("Global AI Tutor access", () => {
  test.beforeAll(startBackend);
  test.afterAll(stopBackend);

  test("launcher opens with relevant context on every primary route", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const routes = [
      ["/", "Dashboard"],
      ["/learn", "Curriculum"],
      ["/learn/phase", "Phase and interference"],
      ["/library", "Knowledge Library"],
      ["/library/unlock", "Knowledge Library"],
      ["/payments", "Payments & billing"],
      ["/lab?workspace=free", "Circuit Lab"],
      ["/lab/states?workspace=free", "State Explorer"],
      ["/algorithms", "Algorithms"],
      ["/algorithms/deutsch-jozsa", "Deutsch–Jozsa algorithm"],
      ["/challenges", "Challenges"],
      ["/challenges/flip", "Challenge workspace"],
      ["/progress", "Progress"],
    ] as const;

    for (const [path, context] of routes) {
      await page.goto(path);
      if (path === "/")
        await expect(
          page.getByRole("heading", { level: 1, name: /Quantum makes sense/ }),
        ).toBeVisible();
      await openTutor(page);
      await expect(page.getByTestId("tutor-context")).toContainText(context);
      if (path === "/") {
        await page.screenshot({
          path: testInfo.outputPath("tutor-global-desktop.png"),
          fullPage: true,
        });
      }
      await closeTutor(page);
    }
  });

  test("generic page sends a real request and navigation closes stale context", async ({
    page,
  }) => {
    await page.goto("/");
    await openTutor(page);
    await expect(page.getByTestId("tutor-context")).toHaveText("Dashboard");

    await page.evaluate(() => {
      window.history.pushState(null, "", "/learn");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(panel(page)).not.toBeVisible();

    await openTutor(page);
    await expect(page.getByTestId("tutor-context")).toHaveText("Curriculum");
    await page
      .getByLabel("Your question", { exact: true })
      .fill("What should I learn or try next?");
    const pending = page.waitForResponse("**/api/ai/tutor");
    await panel(page)
      .getByRole("button", { name: "Send", exact: true })
      .click();
    const response = await pending;
    expect(response.status()).toBe(200);
    const request = response.request().postDataJSON() as TutorRequest;
    expect(request).toMatchObject({
      question: "What should I learn or try next?",
      mode: "learn",
      lessonId: null,
      circuit: null,
      selectedStep: null,
    });
    await expect(panel(page).getByText("✦ AI explanation")).toBeVisible();
  });

  test("mobile launcher and full-width panel do not overflow", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: /Quantum makes sense/ }),
    ).toBeVisible();
    await openTutor(page);
    const bounds = await panel(page).boundingBox();
    expect(bounds?.width).toBe(390);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("tutor-global-mobile.png"),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(launcher(page)).toBeFocused();

    await page.goto("/challenges/flip");
    await openTutor(page);
    await expect(page.getByTestId("tutor-context")).toContainText(
      "Challenge workspace",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});
