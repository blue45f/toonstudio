import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

import {
  buildRound4InventoryReport,
  ROUND4_DEFECT_FINDINGS,
  ROUND4_UNCOVERED_SURFACES,
} from "./uncovered-surface-catalog.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const SCREENSHOT_DIR = path.join(__dirname, "screenshots");
const REPORT_PATH = path.join(__dirname, "browser-round4-report.json");
const CLASSIFICATION_PATH = path.join(__dirname, "route-classification-report.json");
const PORT = Number(process.env.A11Y_ROUND4_PORT || 4179);
const BASE_URL = `http://127.0.0.1:${PORT}`;

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

async function isReachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function ensureViteServer(baseUrl, port) {
  if (await isReachable(baseUrl)) {
    return { close: async () => {} };
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

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isReachable(baseUrl)) {
      await fetch(`${baseUrl}/src/app/main.tsx`, { signal: AbortSignal.timeout(45_000) }).catch(() => {});
      await fetch(`${baseUrl}/src/app/styles/globals.css`, { signal: AbortSignal.timeout(45_000) }).catch(() => {});
      return {
        close: async () => {
          child.kill("SIGTERM");
          await new Promise((r) => setTimeout(r, 400));
        },
      };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  child.kill("SIGTERM");
  throw new Error(`Vite 서버 시작 시간 초과: ${baseUrl}`);
}

async function prepareSyntheticGuestContext(context) {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("toonstudio:onboarding-completed", "1");
      window.localStorage.setItem("toonstudio:beta-open-dismissed", "1");
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
      json: { error: "offline_synthetic_audit", message: "Round 4 synthetic guest audit" },
    });
  });
}

async function inspectSurfaceOnViewport(page, surface, vp) {
  await page.goto(`${BASE_URL}${surface.route}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForSelector("main h1, #main-content h1, #learn-main h1", { timeout: 30_000 });
  await page.waitForTimeout(80);

  if (vp.zoom !== 1) {
    await page.evaluate((z) => {
      document.documentElement.style.zoom = String(z);
    }, vp.zoom);
    await page.waitForTimeout(60);
  }

  // 키보드 첫 Tab 이동 가능 여부 측정
  await page.keyboard.press("Tab");
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const horizontalOverflowPx = Math.max(0, Math.round(doc.scrollWidth - doc.clientWidth));
    const hasMainLandmark = Boolean(
      document.querySelector("main, [role='main'], #main-content, #learn-main"),
    );
    const h1Count = document.querySelectorAll("h1").length;
    const active = document.activeElement;
    const firstTabTag = active ? active.tagName.toLowerCase() : "body";
    const firstTabText = (
      active?.getAttribute("aria-label") ||
      active?.textContent ||
      ""
    )
      .trim()
      .slice(0, 50);

    // 페이지 본문 내 44px 미만 인터랙티브 버튼/칩 집계
    const mainScope = document.querySelector("main, #main-content, #learn-main") ?? document.body;
    const controls = Array.from(
      mainScope.querySelectorAll("button:not([disabled]), [role='tab'], summary"),
    );
    let sub44pxControlCount = 0;
    const sub44Samples = [];
    for (const el of controls) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (Math.round(rect.height) < 44) {
        sub44pxControlCount += 1;
        if (sub44Samples.length < 3) {
          sub44Samples.push({
            text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 32),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
    }

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
      hasMainLandmark,
      h1Count,
      firstTabTag,
      firstTabText,
      sub44pxControlCount,
      sub44Samples,
      transitionDurationMs: Number(transitionDurationMs.toFixed(2)),
    };
  });

  const shouldRunAxe = vp.id === "mobile-320" || vp.id === "pc-1440";
  const axe = shouldRunAxe
    ? await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    : { violations: [] };

  return {
    surfaceId: surface.id,
    functionalGroup: surface.functionalGroup,
    route: surface.route,
    viewportId: vp.id,
    ...metrics,
    axeViolationCount: axe.violations.length,
    axeViolationIds: axe.violations.map((v) => v.id),
  };
}

async function reproduceDefectsInBrowser(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "ko-KR",
  });
  await prepareSyntheticGuestContext(ctx);
  const page = await ctx.newPage();
  const reproductions = {};

  try {
    // 1. GAP-R4-01: /ir 발표 모드 모달 초기 포커스·Tab 트랩·Escape 복귀 재현
    await page.goto(`${BASE_URL}/ir`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("main h1, #main-content h1", { timeout: 30_000 });
    const presentBtn = page.getByRole("button", { name: /발표 모드로 열기|Present full-screen/u }).first();
    await presentBtn.focus();
    await presentBtn.click();
    await page.waitForSelector("[role='dialog']", { timeout: 10_000 });
    const irDialogCheck = await page.evaluate(() => {
      const dialog = document.querySelector("[role='dialog']");
      const activeOnOpenInsideDialog = Boolean(dialog && dialog.contains(document.activeElement));
      const closeBtn = dialog?.querySelector("button[aria-label*='종료']");
      const closeBtnHeight = closeBtn ? Math.round(closeBtn.getBoundingClientRect().height) : null;
      return { activeOnOpenInsideDialog, closeBtnHeight };
    });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "gap-r4-01-ir-presentation-dialog.png"),
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    const irFocusAfterEscape = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        dialogClosed: !document.querySelector("[role='dialog']"),
        activeTagAfterEscape: active?.tagName.toLowerCase() ?? "body",
        activeLabelAfterEscape: (active?.getAttribute("aria-label") || active?.textContent || "")
          .trim()
          .slice(0, 40),
      };
    });
    reproductions["GAP-R4-01"] = {
      route: "/ir",
      ...irDialogCheck,
      ...irFocusAfterEscape,
      reproduced:
        irDialogCheck.activeOnOpenInsideDialog === false ||
        (irDialogCheck.closeBtnHeight !== null && irDialogCheck.closeBtnHeight < 44),
    };

    // 2. GAP-R4-02: /fortune (/fortune/saju) 캐릭터 선택 후 탭 목록·성별 토글 재현
    await page.goto(`${BASE_URL}/fortune/saju`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("#fortune-character-picker", { timeout: 30_000 });
    await page.getByRole("button", { name: /선택하기/u }).first().click();
    await page.waitForSelector("[role='tablist']", { timeout: 15_000 });
    const fortuneCheck = await page.evaluate(() => {
      const tablist = document.querySelector("[role='tablist']");
      const tabpanelCount = document.querySelectorAll("[role='tabpanel']").length;
      const genderBtns = Array.from(document.querySelectorAll("button")).filter((b) =>
        ["선택 안 함", "남성", "여성"].includes((b.textContent || "").trim()),
      );
      const genderHasAriaPressed = genderBtns.some((b) => b.hasAttribute("aria-pressed"));
      return {
        hasTablist: Boolean(tablist),
        tabpanelCount,
        genderButtonCount: genderBtns.length,
        genderHasAriaPressed,
      };
    });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "gap-r4-02-fortune-tablist-and-controls.png"),
    });
    reproductions["GAP-R4-02"] = {
      route: "/fortune",
      ...fortuneCheck,
      reproduced: fortuneCheck.tabpanelCount === 0 && fortuneCheck.genderHasAriaPressed === false,
    };

    // 3. GAP-R4-03: /pricing 고대비 테마 추천 배지 명도 대비 및 FAQ <summary> 포커스 링/마커 재현
    await page.goto(`${BASE_URL}/pricing`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("#plans", { timeout: 30_000 });
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "contrast");
    });
    await page.waitForTimeout(100);
    const pricingCheck = await page.evaluate(() => {
      const badge = Array.from(document.querySelectorAll("#plans span")).find(
        (el) => el.className.includes("bg-accent") && el.className.includes("text-white"),
      );
      const badgeClass = badge?.className || "";
      const summary = document.querySelector("details summary");
      const summaryClass = summary?.className || "";
      return {
        usesHardcodedTextWhiteOnAccent:
          badgeClass.includes("bg-accent") && badgeClass.includes("text-white"),
        summaryHidesMarkerWithoutIcon:
          summaryClass.includes("list-none") &&
          summaryClass.includes("[&::-webkit-details-marker]:hidden") &&
          (summary?.querySelectorAll("svg").length ?? 0) === 0,
      };
    });
    const pricingContrastAxe = await new AxeBuilder({ page })
      .withRules(["color-contrast"])
      .analyze();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "gap-r4-03-pricing-contrast-and-faq.png"),
    });
    reproductions["GAP-R4-03"] = {
      route: "/pricing",
      ...pricingCheck,
      contrastViolationCountInHighContrastTheme: pricingContrastAxe.violations.length,
      reproduced:
        pricingCheck.usesHardcodedTextWhiteOnAccent &&
        pricingCheck.summaryHidesMarkerWithoutIcon,
    };

    // 4. GAP-R4-04: /learn/lessons/studio-first-page 스킵 링크 타깃(#learn-main) tabIndex 누락 재현
    await page.goto(`${BASE_URL}/learn/lessons/studio-first-page`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForSelector("#learn-main", { timeout: 30_000 });
    const learnCheck = await page.evaluate(() => {
      const skipLink = document.querySelector("a.learn-skip-link[href='#learn-main']");
      const learnMain = document.getElementById("learn-main");
      return {
        hasLearnSkipLink: Boolean(skipLink),
        learnMainTabIndexAttr: learnMain?.getAttribute("tabindex") ?? null,
      };
    });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "gap-r4-04-learn-lesson-skip-target.png"),
    });
    reproductions["GAP-R4-04"] = {
      route: "/learn/lessons/studio-first-page",
      ...learnCheck,
      reproduced: learnCheck.hasLearnSkipLink && learnCheck.learnMainTabIndexAttr === null,
    };

    // 5. GAP-R4-05: 320px 뷰포트에서 /my, /read/spatial, /play 필터 칩 44px 미달 및 role='group' 누락 재현
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`${BASE_URL}/my`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("#my-space-destinations", { timeout: 30_000 });
    const myFilterHeights = await page.evaluate(() => {
      const section = document.querySelector("[aria-labelledby='my-space-destinations']");
      return Array.from(section?.querySelectorAll("div[role='group'] button") ?? []).map((b) =>
        Math.round(b.getBoundingClientRect().height),
      );
    });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "gap-r4-05-mobile-320-market-chips.png"),
    });

    await page.goto(`${BASE_URL}/read/spatial`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-testid='spatial-reader-rea-webxr-fov-bar']", {
      timeout: 30_000,
    });
    const spatialChipHeights = await page.evaluate(() => {
      const bar = document.querySelector("[data-testid='spatial-reader-rea-webxr-fov-bar']");
      return Array.from(bar?.querySelectorAll("button[aria-pressed]") ?? []).map((b) =>
        Math.round(b.getBoundingClientRect().height),
      );
    });

    await page.goto(`${BASE_URL}/play`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(".play-filter-tabs", { timeout: 30_000 });
    const playGroupRole = await page.evaluate(() => {
      const bar = document.querySelector(".play-filter-tabs");
      return {
        ariaLabel: bar?.getAttribute("aria-label") ?? null,
        role: bar?.getAttribute("role") ?? null,
      };
    });

    reproductions["GAP-R4-05"] = {
      routes: ["/my", "/read/spatial", "/play"],
      myRoleFilterChipHeightsPx: myFilterHeights,
      spatialReaderChipHeightsPx: spatialChipHeights,
      playFilterTabsAriaLabel: playGroupRole.ariaLabel,
      playFilterTabsRole: playGroupRole.role,
      reproduced:
        myFilterHeights.some((h) => h < 44) &&
        spatialChipHeights.some((h) => h < 44) &&
        playGroupRole.ariaLabel === "콘텐츠 분류" &&
        playGroupRole.role === null,
    };
  } finally {
    await page.close();
    await ctx.close();
  }

  return reproductions;
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const inventoryReport = await buildRound4InventoryReport(REPO_ROOT);
  fs.writeFileSync(CLASSIFICATION_PATH, `${JSON.stringify(inventoryReport, null, 2)}\n`, "utf8");

  const server = await ensureViteServer(BASE_URL, PORT);
  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumExecutable(),
  });

  try {
    // 1. 결함별(GAP-R4-01 ~ GAP-R4-05) 정밀 재현 및 스크린샷 캡처 먼저 수행
    const defectReproductions = await reproduceDefectsInBrowser(browser);

    // 2. 12개 대표 미검증 표면 × 320px/200% 핵심 리플로우 및 대표 뷰포트(320/390/768/1440/200%/reduced-motion) 실측
    const viewportMatrix = [];

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

      // 320px 및 pc-1440-zoom-200에서는 12개 표면 전체를 전수 검사하고,
      // 390/768/1440/reduced-motion에서는 대표 표면을 순회하여 6개 뷰포트 축 모두 실증한다.
      const surfacesForVp =
        vp.id === "mobile-320" || vp.id === "pc-1440-zoom-200"
          ? ROUND4_UNCOVERED_SURFACES
          : ROUND4_UNCOVERED_SURFACES.slice(0, 4);

      try {
        for (const surface of surfacesForVp) {
          const entry = await inspectSurfaceOnViewport(page, surface, vp);
          viewportMatrix.push(entry);
        }
      } finally {
        await page.close();
        await ctx.close();
      }
    }

    const finalReport = {
      executedAt: "2026-11-07",
      baseUrl: BASE_URL,
      inventorySummary: {
        totalConcreteRoutes: inventoryReport.totalConcreteRoutes,
        existingBrowserMatrixCheckCount: inventoryReport.existingBrowserMatrixCheckCount,
        countsByDisposition: inventoryReport.countsByDisposition,
      },
      selectedUncoveredSurfaceCount: ROUND4_UNCOVERED_SURFACES.length,
      viewportMatrixCheckCount: viewportMatrix.length,
      defectReproductions,
      defectFindings: ROUND4_DEFECT_FINDINGS,
      viewportMatrix,
    };

    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
    console.log(
      JSON.stringify(
        {
          executedAt: finalReport.executedAt,
          inventorySummary: finalReport.inventorySummary,
          selectedUncoveredSurfaceCount: finalReport.selectedUncoveredSurfaceCount,
          viewportMatrixCheckCount: finalReport.viewportMatrixCheckCount,
          defectReproductions: finalReport.defectReproductions,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
