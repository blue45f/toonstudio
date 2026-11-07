import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const REPO_ROOT = process.cwd();
const OUT_DIR = path.join(REPO_ROOT, "docs/a11y-ir-learn-fixes-round5-20261107");
const SCREENSHOT_DIR = path.join(OUT_DIR, "screenshots");
const REPORT_PATH = path.join(OUT_DIR, "browser-round5-report.json");
const PORT = Number(process.env.ROUND5_A11Y_PORT || 4181);
const BASE_URL = process.env.ROUND5_A11Y_BASE_URL || `http://127.0.0.1:${PORT}`;

const TARGET_ROUTES = [
  { id: "GAP-R4-01-IR", route: "/ir", waitSelector: "main h1, #main-content h1" },
  {
    id: "GAP-R4-04-LEARN",
    route: "/learn/lessons/studio-first-page",
    waitSelector: "#learn-main h1",
  },
];

const VIEWPORTS = [
  { id: "mobile-320", width: 320, height: 844, isMobile: true, zoom: 1, reducedMotion: "no-preference" },
  { id: "mobile-390", width: 390, height: 844, isMobile: true, zoom: 1, reducedMotion: "no-preference" },
  { id: "tablet-768", width: 768, height: 1024, isMobile: false, zoom: 1, reducedMotion: "no-preference" },
  { id: "pc-1440", width: 1440, height: 900, isMobile: false, zoom: 1, reducedMotion: "no-preference" },
  { id: "pc-1440-zoom-200", width: 1440, height: 900, isMobile: false, zoom: 2, reducedMotion: "no-preference" },
  { id: "pc-1440-reduced-motion", width: 1440, height: 900, isMobile: false, zoom: 1, reducedMotion: "reduce" },
];

function resolveChromiumExecutable() {
  for (const candidate of [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].filter(Boolean)) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function isServerReady(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function ensureViteServer(baseUrl, port) {
  if (await isServerReady(baseUrl)) {
    return { reused: true, stop: async () => {} };
  }
  const vitePkg = require.resolve("vite/package.json", {
    paths: [REPO_ROOT, path.join(REPO_ROOT, "apps/web")],
  });
  const viteBin = path.join(path.dirname(vitePkg), "bin/vite.js");
  const child = spawn(
    process.execPath,
    [
      "--max-old-space-size=2048",
      viteBin,
      "--config",
      "apps/web/vite.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        VITE_CATALOG_SOURCE: "static",
        NO_PROXY: "127.0.0.1,localhost",
        no_proxy: "127.0.0.1,localhost",
      },
      stdio: "ignore",
    },
  );
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    if (await isServerReady(baseUrl)) {
      await fetch(`${baseUrl}/src/app/main.tsx`, { signal: AbortSignal.timeout(45_000) }).catch(() => {});
      await fetch(`${baseUrl}/src/app/styles/globals.css`, { signal: AbortSignal.timeout(45_000) }).catch(() => {});
      return {
        reused: false,
        stop: async () => {
          child.kill("SIGTERM");
          await new Promise((r) => setTimeout(r, 400));
        },
      };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  child.kill("SIGTERM");
  throw new Error(`Vite server on ${baseUrl} did not start within 60s`);
}

async function prepareSyntheticGuestContext(context) {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("toonstudio-locale", "ko");
      window.localStorage.setItem("toonstudio:onboarding-completed", "true");
      window.localStorage.setItem("toonstudio:cookie-consent", "accepted");
      window.localStorage.setItem("toonstudio:studio-beta-notice-ack", "1");
      window.sessionStorage.setItem("toonstudio-intro-shown", "true");
      window.sessionStorage.setItem("toonstudio:beta-open-dismissed", "1");
      window.sessionStorage.setItem("toonstudio-compat-dismissed", "true");
    } catch {
      // ignore storage errors
    }
  });
  await context.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
      return;
    }
    await route.fulfill({
      status: 503,
      json: { error: "offline_synthetic_audit", message: "Round 5 synthetic guest verification" },
    });
  });
}

async function inspectViewportMatrix(browser) {
  const matrix = [];
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
      reducedMotion: vp.reducedMotion,
      locale: "ko-KR",
    });
    await prepareSyntheticGuestContext(ctx);
    const page = await ctx.newPage();
    try {
      for (const target of TARGET_ROUTES) {
        await page.goto(`${BASE_URL}${target.route}`, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await page.waitForSelector(target.waitSelector, { timeout: 30_000 });
        await page.waitForTimeout(80);

        if (vp.zoom !== 1) {
          await page.evaluate((z) => {
            document.documentElement.style.zoom = String(z);
          }, vp.zoom);
          await page.waitForTimeout(60);
        }

        await page.keyboard.press("Tab");
        const metrics = await page.evaluate(() => {
          const doc = document.documentElement;
          const horizontalOverflowPx = Math.max(0, Math.round(doc.scrollWidth - doc.clientWidth));
          const active = document.activeElement;
          const firstTabTag = active ? active.tagName.toLowerCase() : "body";
          const firstTabText = (
            active?.getAttribute("aria-label") ||
            active?.textContent ||
            ""
          )
            .trim()
            .slice(0, 40);

          const probe = document.createElement("div");
          probe.style.transition = "opacity 250ms ease";
          document.body.appendChild(probe);
          const td = window.getComputedStyle(probe).transitionDuration;
          probe.remove();
          const transitionDurationMs = td.endsWith("ms")
            ? parseFloat(td)
            : td.endsWith("s")
              ? parseFloat(td) * 1000
              : 0;

          return {
            horizontalOverflowPx,
            firstTabTag,
            firstTabText,
            transitionDurationMs: Number(transitionDurationMs.toFixed(2)),
          };
        });

        const shouldRunAxe = vp.id === "mobile-320" || vp.id === "pc-1440";
        const axe = shouldRunAxe
          ? await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
              .analyze()
          : { violations: [] };

        matrix.push({
          targetId: target.id,
          route: target.route,
          viewportId: vp.id,
          ...metrics,
          axeViolationCount: axe.violations.length,
          axeViolationIds: axe.violations.map((v) => v.id),
        });
      }
    } finally {
      await page.close();
      await ctx.close();
    }
  }
  return matrix;
}

async function verifyGapR401IrDialog(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    locale: "ko-KR",
  });
  await prepareSyntheticGuestContext(ctx);
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE_URL}/ir`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("main h1, #main-content h1", { timeout: 30_000 });

    const triggerBtn = page
      .getByRole("button", { name: /발표 모드로 열기|Present full-screen/u })
      .first();
    await triggerBtn.focus();
    const triggerLabelBefore = await page.evaluate(() =>
      (document.activeElement?.textContent || "").trim(),
    );

    // Enter 키로 발표 모드 대화상자 오픈
    await page.keyboard.press("Enter");
    await page.waitForSelector("[role='dialog'][aria-modal='true']", { timeout: 10_000 });

    const onOpenMetrics = await page.evaluate(() => {
      const dialog = document.querySelector("[role='dialog'][aria-modal='true']");
      const active = document.activeElement;
      const activeInsideDialogOnOpen = Boolean(dialog && active && dialog.contains(active));
      const activeAriaLabelOnOpen = active?.getAttribute("aria-label") || "";
      const fullscreenBtn = dialog?.querySelector("button[aria-label*='전체화면']");
      const closeBtn = dialog?.querySelector("button[aria-label*='종료']");
      const fsRect = fullscreenBtn?.getBoundingClientRect();
      const closeRect = closeBtn?.getBoundingClientRect();
      const progressBar = dialog?.querySelector(".bg-accent");
      const progressHasMotionReduceClass = Boolean(
        progressBar?.className.includes("motion-reduce:transition-none"),
      );
      const progressTransitionDuration = progressBar
        ? window.getComputedStyle(progressBar).transitionDuration
        : null;

      return {
        activeInsideDialogOnOpen,
        activeAriaLabelOnOpen,
        fullscreenButtonSize: fsRect
          ? { width: Math.round(fsRect.width), height: Math.round(fsRect.height) }
          : null,
        closeButtonSize: closeRect
          ? { width: Math.round(closeRect.width), height: Math.round(closeRect.height) }
          : null,
        progressHasMotionReduceClass,
        progressTransitionDuration,
      };
    });

    // 정방향 Tab 5회 및 역방향 Shift+Tab 2회 순환 시 대화상자 외부 이탈 0건 확인
    const tabCycleHistory = [];
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Tab");
      const step = await page.evaluate(() => {
        const dialog = document.querySelector("[role='dialog'][aria-modal='true']");
        const active = document.activeElement;
        return {
          key: "Tab",
          insideDialog: Boolean(dialog && active && dialog.contains(active)),
          label: active?.getAttribute("aria-label") || active?.tagName.toLowerCase() || "",
        };
      });
      tabCycleHistory.push(step);
    }
    for (let i = 0; i < 2; i += 1) {
      await page.keyboard.press("Shift+Tab");
      const step = await page.evaluate(() => {
        const dialog = document.querySelector("[role='dialog'][aria-modal='true']");
        const active = document.activeElement;
        return {
          key: "Shift+Tab",
          insideDialog: Boolean(dialog && active && dialog.contains(active)),
          label: active?.getAttribute("aria-label") || active?.tagName.toLowerCase() || "",
        };
      });
      tabCycleHistory.push(step);
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "fix-gap-r4-01-ir-dialog-focus-trap.png"),
    });

    // Escape로 닫은 뒤 원래 트리거 버튼으로 포커스 복귀 확인
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
    const afterEscape = await page.evaluate((expectedText) => {
      const dialogStillOpen = Boolean(document.querySelector("[role='dialog'][aria-modal='true']"));
      const activeText = (document.activeElement?.textContent || "").trim();
      return {
        dialogClosedAfterEscape: !dialogStillOpen,
        restoredToTriggerAfterEscape: activeText === expectedText && activeText.length > 0,
        activeTextAfterEscape: activeText,
      };
    }, triggerLabelBefore);

    // 다시 열고 닫기 버튼 클릭 시에도 원래 트리거 버튼으로 포커스 복귀 확인
    await triggerBtn.click();
    await page.waitForSelector("[role='dialog'][aria-modal='true']", { timeout: 10_000 });
    await page.getByRole("button", { name: /발표 모드 종료|Exit presentation mode/u }).click();
    await page.waitForTimeout(80);
    const afterCloseButtonClick = await page.evaluate((expectedText) => {
      const activeText = (document.activeElement?.textContent || "").trim();
      return {
        restoredToTriggerAfterCloseButton: activeText === expectedText && activeText.length > 0,
      };
    }, triggerLabelBefore);

    const allTabStepsInsideDialog = tabCycleHistory.every((s) => s.insideDialog === true);
    const verifiedFixed =
      onOpenMetrics.activeInsideDialogOnOpen === true &&
      (onOpenMetrics.fullscreenButtonSize?.width ?? 0) >= 44 &&
      (onOpenMetrics.fullscreenButtonSize?.height ?? 0) >= 44 &&
      (onOpenMetrics.closeButtonSize?.width ?? 0) >= 44 &&
      (onOpenMetrics.closeButtonSize?.height ?? 0) >= 44 &&
      onOpenMetrics.progressHasMotionReduceClass === true &&
      allTabStepsInsideDialog === true &&
      afterEscape.dialogClosedAfterEscape === true &&
      afterEscape.restoredToTriggerAfterEscape === true &&
      afterCloseButtonClick.restoredToTriggerAfterCloseButton === true;

    return {
      route: "/ir",
      ...onOpenMetrics,
      allTabStepsInsideDialog,
      tabCycleHistory,
      ...afterEscape,
      ...afterCloseButtonClick,
      verifiedFixed,
    };
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function verifyGapR404LearnSkipAndShortcuts(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "ko-KR",
  });
  await prepareSyntheticGuestContext(ctx);
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE_URL}/learn/lessons/studio-first-page?step=verify`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForSelector("#learn-main h1", { timeout: 30_000 });

    // 1. .learn-skip-link 포커스 후 Enter 입력 시 #learn-main으로 실제 초점 이동 검증
    const skipLink = page.locator("a.learn-skip-link[href='#learn-main']");
    await skipLink.focus();
    await page.keyboard.press("Enter");
    const skipFocusResult = await page.evaluate(() => {
      const learnMain = document.getElementById("learn-main");
      return {
        learnMainTabIndexAttr: learnMain?.getAttribute("tabindex") ?? null,
        activeElementIdAfterSkipEnter: document.activeElement?.id ?? null,
      };
    });

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "fix-gap-r4-04-learn-skip-and-shortcut-guard.png"),
    });

    // 2. 모달 대화상자(role='dialog')가 열려 있는 동안 단일 키 단축키(1, c, [, ]) 차단 검증
    const beforeShortcutState = await page.evaluate(() => {
      const checkboxes = Array.from(
        document.querySelectorAll(".learn-check input[type='checkbox']"),
      );
      return {
        pathname: window.location.pathname,
        checkedCount: checkboxes.filter((cb) => cb instanceof HTMLInputElement && cb.checked).length,
      };
    });

    await page.evaluate(() => {
      const modal = document.createElement("div");
      modal.id = "round5-test-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-label", "단축키 가드 검증 모달");
      const btn = document.createElement("button");
      btn.id = "round5-test-modal-btn";
      btn.type = "button";
      btn.textContent = "모달 내부 버튼";
      modal.appendChild(btn);
      document.body.appendChild(modal);
      btn.focus();
    });

    await page.keyboard.press("1");
    await page.keyboard.press("c");
    await page.keyboard.press("]");
    await page.waitForTimeout(80);

    const duringDialogState = await page.evaluate(() => {
      const checkboxes = Array.from(
        document.querySelectorAll(".learn-check input[type='checkbox']"),
      );
      return {
        pathnameWhileDialogOpen: window.location.pathname,
        checkedCountWhileDialogOpen: checkboxes.filter(
          (cb) => cb instanceof HTMLInputElement && cb.checked,
        ).length,
      };
    });

    // 3. 모달 제거 후에는 단일 키 단축키('1')가 정상 동작해 체크리스트 1번을 토글하는지 회귀 검증
    await page.evaluate(() => {
      document.getElementById("round5-test-modal")?.remove();
      document.getElementById("learn-main")?.focus();
    });
    await page.keyboard.press("1");
    await page.waitForTimeout(80);

    const afterDialogClosedState = await page.evaluate(() => {
      const checkboxes = Array.from(
        document.querySelectorAll(".learn-check input[type='checkbox']"),
      );
      return {
        checkedCountAfterDialogClosedAndKey1: checkboxes.filter(
          (cb) => cb instanceof HTMLInputElement && cb.checked,
        ).length,
      };
    });

    const shortcutsBlockedWhileDialogOpen =
      duringDialogState.pathnameWhileDialogOpen === beforeShortcutState.pathname &&
      duringDialogState.checkedCountWhileDialogOpen === beforeShortcutState.checkedCount;
    const shortcutWorksWhenNoDialogOpen =
      afterDialogClosedState.checkedCountAfterDialogClosedAndKey1 ===
      beforeShortcutState.checkedCount + 1;

    const verifiedFixed =
      skipFocusResult.learnMainTabIndexAttr === "-1" &&
      skipFocusResult.activeElementIdAfterSkipEnter === "learn-main" &&
      shortcutsBlockedWhileDialogOpen === true &&
      shortcutWorksWhenNoDialogOpen === true;

    return {
      route: "/learn/lessons/studio-first-page",
      ...skipFocusResult,
      beforeShortcutState,
      duringDialogState,
      afterDialogClosedState,
      shortcutsBlockedWhileDialogOpen,
      shortcutWorksWhenNoDialogOpen,
      verifiedFixed,
    };
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function capture320And200Screenshots(browser) {
  const ctx320 = await browser.newContext({
    viewport: { width: 320, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "ko-KR",
  });
  await prepareSyntheticGuestContext(ctx320);
  const page320 = await ctx320.newPage();
  try {
    await page320.goto(`${BASE_URL}/ir`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page320.waitForSelector("main h1, #main-content h1", { timeout: 30_000 });
    await page320
      .getByRole("button", { name: /발표 모드로 열기|Present full-screen/u })
      .first()
      .click();
    await page320.waitForSelector("[role='dialog'][aria-modal='true']", { timeout: 10_000 });
    await page320.screenshot({
      path: path.join(SCREENSHOT_DIR, "fix-gap-r4-01-ir-mobile-320.png"),
    });
  } finally {
    await page320.close();
    await ctx320.close();
  }

  const ctx200 = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "ko-KR",
  });
  await prepareSyntheticGuestContext(ctx200);
  const page200 = await ctx200.newPage();
  try {
    await page200.goto(`${BASE_URL}/learn/lessons/studio-first-page`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page200.waitForSelector("#learn-main h1", { timeout: 30_000 });
    await page200.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    await page200.waitForTimeout(80);
    await page200.screenshot({
      path: path.join(SCREENSHOT_DIR, "fix-gap-r4-04-learn-zoom-200.png"),
    });
  } finally {
    await page200.close();
    await ctx200.close();
  }
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const server = await ensureViteServer(BASE_URL, PORT);
  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumExecutable(),
  });

  try {
    const gapR401 = await verifyGapR401IrDialog(browser);
    const gapR404 = await verifyGapR404LearnSkipAndShortcuts(browser);
    await capture320And200Screenshots(browser);
    const viewportMatrix = await inspectViewportMatrix(browser);

    const report = {
      executedAt: "2026-11-07",
      baseUrl: BASE_URL,
      verifiedDefects: {
        "GAP-R4-01": gapR401,
        "GAP-R4-04": gapR404,
      },
      viewportMatrixCount: viewportMatrix.length,
      viewportMatrix,
    };

    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(
      JSON.stringify(
        {
          executedAt: report.executedAt,
          viewportMatrixCount: report.viewportMatrixCount,
          gapR401VerifiedFixed: gapR401.verifiedFixed,
          gapR404VerifiedFixed: gapR404.verifiedFixed,
        },
        null,
        2,
      ),
    );

    if (!gapR401.verifiedFixed || !gapR404.verifiedFixed) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await server.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
