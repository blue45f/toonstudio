#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

import { REPRESENTATIVE_ROUTES, SWEEP_VIEWPORTS } from "./browser-sweep-targets.mjs";

export { REPRESENTATIVE_ROUTES, SWEEP_VIEWPORTS };

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCREENSHOT_DIR = path.join(
  REPO_ROOT,
  "docs/accessibility-sweep-20261107/screenshots",
);
const REPORT_PATH = path.join(
  REPO_ROOT,
  "docs/accessibility-sweep-20261107/browser-sweep-report.json",
);

const DEFAULT_PORT = Number(process.env.A11Y_SWEEP_PORT || 5288);
const BASE_URL =
  process.env.A11Y_SWEEP_BASE_URL || `http://127.0.0.1:${DEFAULT_PORT}`;

function resolveChromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function isServerReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function ensureViteServer(baseUrl, port) {
  if (await isServerReachable(baseUrl)) {
    return { reused: true, close: async () => {} };
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
    if (await isServerReachable(baseUrl)) {
      await fetch(`${baseUrl}/src/app/main.tsx`, {
        signal: AbortSignal.timeout(45_000),
      }).catch(() => {});
      await fetch(`${baseUrl}/src/app/styles/globals.css`, {
        signal: AbortSignal.timeout(45_000),
      }).catch(() => {});
      return {
        reused: false,
        close: async () => {
          child.kill("SIGTERM");
          await new Promise((resolve) => setTimeout(resolve, 400));
        },
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  child.kill("SIGTERM");
  throw new Error(`Vite 서버가 60초 내에 시작되지 않았습니다: ${baseUrl}`);
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
      // storage 차단 환경 무시
    }
  });
  await context.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({
        status: 200,
        json: { authenticated: false, user: null },
      });
      return;
    }
    await route.fulfill({
      status: 503,
      json: {
        message: "Accessibility audit synthetic offline fixture",
        error: "Service Unavailable",
      },
    });
  });
}

async function measurePageSurface(page, zoom = 1) {
  if (zoom !== 1) {
    await page.evaluate((z) => {
      document.documentElement.style.zoom = String(z);
    }, zoom);
    await page.waitForTimeout(150);
  }

  return page.evaluate(() => {
    const docEl = document.documentElement;
    const body = document.body;
    const horizontalOverflowPx = Math.max(
      0,
      docEl.scrollWidth - docEl.clientWidth,
    );
    const hasMainLandmark = Boolean(
      document.querySelector("main, [role='main'], #main-content"),
    );
    const h1Elements = [...document.querySelectorAll("h1")];
    const visibleH1Count = h1Elements.filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    }).length;

    const interactiveCandidates = [
      ...document.querySelectorAll(
        'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="switch"], [role="tab"]',
      ),
    ].filter((el) => {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    const unlabeledControls = [];
    for (const el of interactiveCandidates) {
      const ariaLabel = el.getAttribute("aria-label")?.trim() || "";
      const ariaLabelledBy = el.getAttribute("aria-labelledby")?.trim() || "";
      const title = el.getAttribute("title")?.trim() || "";
      const text = (el.textContent || "").trim();
      const placeholder = el.getAttribute("placeholder")?.trim() || "";
      const id = el.getAttribute("id") || "";
      const hasForLabel =
        id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
      const hasWrappingLabel = Boolean(el.closest("label"));

      if (
        !ariaLabel &&
        !ariaLabelledBy &&
        !title &&
        !text &&
        !placeholder &&
        !hasForLabel &&
        !hasWrappingLabel
      ) {
        unlabeledControls.push({
          tag: el.tagName.toLowerCase(),
          className: (el.className || "").toString().slice(0, 80),
        });
      }
    }

    const probe = document.createElement("div");
    probe.style.transitionDuration = "0.25s";
    probe.style.animationDuration = "0.5s";
    body.appendChild(probe);
    const probeStyle = window.getComputedStyle(probe);
    const transitionDurationSec =
      Number.parseFloat(probeStyle.transitionDuration || "0") || 0;
    const animationDurationSec =
      Number.parseFloat(probeStyle.animationDuration || "0") || 0;
    probe.remove();

    return {
      title: document.title,
      clientWidth: docEl.clientWidth,
      scrollWidth: docEl.scrollWidth,
      horizontalOverflowPx,
      hasMainLandmark,
      h1Count: h1Elements.length,
      visibleH1Count,
      interactiveCount: interactiveCandidates.length,
      unlabeledControlCount: unlabeledControls.length,
      unlabeledSamples: unlabeledControls.slice(0, 5),
      transitionDurationMs:
        Math.round(transitionDurationSec * 1000 * 100) / 100,
      animationDurationMs: Math.round(animationDurationSec * 1000 * 100) / 100,
    };
  });
}

async function launchAuditBrowser(executablePath) {
  return chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-proxy-server",
      "--mute-audio",
    ],
    ...(executablePath ? { executablePath } : {}),
  });
}

async function captureIfMissing(page, filename) {
  const target = path.join(SCREENSHOT_DIR, filename);
  if (!fs.existsSync(target)) {
    await page.screenshot({ path: target });
  }
}

async function runKeyboardAndFocusReturnChecks(executablePath, baseUrl) {
  const results = {};
  const browser = await launchAuditBrowser(executablePath);

  try {
    // 1. 데스크톱(1440×900) 키보드 Tab / Escape / 포커스 복귀 검증
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: "ko-KR",
        serviceWorkers: "block",
      });
      await prepareSyntheticGuestContext(context);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/accessibility`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector("#accessibility-text-scale", {
        timeout: 30_000,
      });
      await page.waitForSelector("[data-floating-controls]", {
        timeout: 15_000,
      });
      await page.waitForTimeout(200);

      // 1-A. 첫 Tab 스킵 링크 및 포커스 링 가시성 검증
      await page.keyboard.press("Tab");
      const firstTabStop = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          href: el.getAttribute("href"),
          text: (el.textContent || "").trim(),
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
          boxShadow: cs.boxShadow,
        };
      });

      // 1-B. 헤더 드롭다운(제작) 초점 진입으로 열기 → Escape 닫기 → 트리거 포커스 유지 검증
      const navTrigger = page
        .locator("header nav [data-navigation-entry][aria-expanded]")
        .first();
      let headerDropdownFocusReturn = false;
      if ((await navTrigger.count()) > 0) {
        await navTrigger.focus();
        await page.waitForTimeout(120);
        const expandedBeforeEscape =
          await navTrigger.getAttribute("aria-expanded");
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(100);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(120);
        const expandedAfterEscape =
          await navTrigger.getAttribute("aria-expanded");
        const returnedToTrigger = await navTrigger.evaluate(
          (el) => document.activeElement === el,
        );
        headerDropdownFocusReturn =
          expandedBeforeEscape === "true" &&
          expandedAfterEscape === "false" &&
          returnedToTrigger;
      }

      // 1-C. 커맨드 팔레트(검색 열기) 열기 → Escape 닫기 → 트리거 포커스 복귀 검증
      const cmdTrigger = page.locator("header button.site-header__search").first();
      let commandPaletteFocusReturn = false;
      if ((await cmdTrigger.count()) > 0) {
        await cmdTrigger.focus();
        await page.keyboard.press("Enter");
        await page.waitForSelector('[data-dialog-layout="command"]', {
          timeout: 10_000,
        });
        await page.waitForTimeout(150);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(180);
        const dialogCount = await page
          .locator('[data-dialog-layout="command"]')
          .count();
        const returnedToTrigger = await cmdTrigger.evaluate(
          (el) => document.activeElement === el,
        );
        commandPaletteFocusReturn = dialogCount === 0 && returnedToTrigger;
      }

      // 1-D. 디자인 테마(AppearanceDialog) 열기 → 다중 트리거 aria-expanded 확인(GAP-A11Y-04) → Escape 포커스 복귀
      await page.evaluate(() => {
        window.dispatchEvent(new Event("scroll"));
        for (const el of document.querySelectorAll("[data-floating-controls] [inert]")) {
          el.removeAttribute("inert");
          el.removeAttribute("aria-hidden");
        }
      });
      await page.waitForTimeout(100);
      const appearanceTrigger = page
        .locator("[data-floating-controls] .appearance-trigger")
        .first();
      let appearanceDialogFocusReturn = false;
      let appearanceExpandedTriggerCount = 0;
      let appearanceTriggerHasAriaControls = false;
      if ((await appearanceTrigger.count()) > 0) {
        await appearanceTrigger.evaluate((el) => {
          el.focus();
          el.click();
        });
        await page.waitForSelector(".appearance-dialog", { timeout: 15_000 });
        appearanceExpandedTriggerCount = await page
          .locator('.appearance-trigger[aria-expanded="true"]')
          .count();
        appearanceTriggerHasAriaControls = await appearanceTrigger.evaluate(
          (el) => el.hasAttribute("aria-controls"),
        );
        await captureIfMissing(page, "pc-1440-appearance-dialog.png");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(180);
        await page.evaluate(() => {
          window.dispatchEvent(new Event("scroll"));
        });
        const dialogGone =
          (await page.locator(".appearance-dialog").count()) === 0;
        const returned = await appearanceTrigger.evaluate(
          (el) => document.activeElement === el,
        );
        appearanceDialogFocusReturn = dialogGone && returned;
      }

      // 1-E. LanguagePicker 대화상자 Escape 검증 (검색창 vs 닫기 버튼 — GAP-A11Y-01 재현)
      await page.evaluate(() => {
        window.dispatchEvent(new Event("scroll"));
        for (const el of document.querySelectorAll("[data-floating-controls] [inert]")) {
          el.removeAttribute("inert");
          el.removeAttribute("aria-hidden");
        }
      });
      await page.waitForTimeout(100);
      const langTrigger = page
        .locator('[data-language-picker] > button[aria-haspopup="dialog"]')
        .first();
      let langEscapeFromInputCloses = false;
      let langEscapeFromInputRestoresFocus = false;
      let langEscapeFromCloseButtonCloses = true;
      if ((await langTrigger.count()) > 0) {
        await langTrigger.evaluate((el) => {
          el.focus();
          el.click();
        });
        const langDialog = page.locator(
          '[data-language-picker] [role="dialog"]',
        );
        await langDialog.waitFor({ state: "visible", timeout: 8_000 });
        await page.waitForTimeout(120);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(150);
        langEscapeFromInputCloses = (await langDialog.count()) === 0;
        langEscapeFromInputRestoresFocus = await langTrigger.evaluate(
          (el) => document.activeElement === el,
        );

        // 다시 열고 닫기 버튼(언어 선택 닫기)으로 포커스 이동 후 Escape 입력 (GAP-A11Y-01 재현)
        await page.evaluate(() => {
          window.dispatchEvent(new Event("scroll"));
        });
        await page.waitForTimeout(100);
        await langTrigger.evaluate((el) => {
          el.focus();
          el.click();
        });
        await langDialog.waitFor({ state: "visible", timeout: 8_000 });
        const closeBtn = langDialog.locator(
          'button[aria-label="언어 선택 닫기"]',
        );
        await closeBtn.focus();
        await captureIfMissing(
          page,
          "defect-gap-a11y-01-language-picker-escape.png",
        );
        await page.keyboard.press("Escape");
        await page.waitForTimeout(120);
        langEscapeFromCloseButtonCloses = (await langDialog.count()) === 0;
        if (!langEscapeFromCloseButtonCloses) {
          await closeBtn.click();
        }
      }

      // 1-F. /accessibility 접근성 조율실(AccessibilityLab) 200% 상한·스위치 역할(GAP-A11Y-03) 재현
      const labAudit = await page.evaluate(() => {
        const slider = document.querySelector("#accessibility-text-scale");
        const maxAttr = slider?.getAttribute("max") || null;
        const minAttr = slider?.getAttribute("min") || null;
        const toggleButtons = [
          ...document.querySelectorAll(
            '[aria-labelledby="accessibility-lab-title"] button[aria-pressed]',
          ),
        ];
        return {
          sliderMin: minAttr,
          sliderMax: maxAttr,
          supports200PercentInSlider: Number(maxAttr) >= 200,
          toggleButtonCountUsingAriaPressed: toggleButtons.length,
          switchRoleCountInLab: document.querySelectorAll(
            '[aria-labelledby="accessibility-lab-title"] [role="switch"]',
          ).length,
        };
      });

      await captureIfMissing(
        page,
        "defect-gap-a11y-03-accessibility-lab.png",
      );

      results.desktop = {
        firstTabStop,
        headerDropdownFocusReturn,
        commandPaletteFocusReturn,
        appearanceDialogFocusReturn,
        appearanceExpandedTriggerCount,
        appearanceTriggerHasAriaControls,
        langEscapeFromInputCloses,
        langEscapeFromInputRestoresFocus,
        langEscapeFromCloseButtonCloses,
      };
      results.accessibilityLab = labAudit;

      await page.close();
      await context.close();
    }

    // 2. 모바일(390×844) 전체 메뉴 모달 포커스 복귀 & FloatingControls 역순 Tab 이탈(GAP-A11Y-02) 재현
    {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        locale: "ko-KR",
        serviceWorkers: "block",
      });
      await prepareSyntheticGuestContext(context);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/accessibility`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector("#accessibility-text-scale", {
        timeout: 25_000,
      });
      await page.waitForSelector("[data-floating-controls-toggle]", {
        timeout: 15_000,
      });
      await page.waitForTimeout(200);

      // 2-A. 모바일 전체 메뉴 대화상자 열기 → Escape 닫기 → 포커스 복귀
      const mobileMenuBtn = page
        .locator('header .site-header__utilities button[aria-haspopup="dialog"]')
        .first();
      let mobileMenuFocusReturn = false;
      if ((await mobileMenuBtn.count()) > 0) {
        const menuId = await mobileMenuBtn.getAttribute("aria-controls");
        await mobileMenuBtn.focus();
        await page.keyboard.press("Enter");
        if (menuId) {
          await page.waitForSelector(`[id="${menuId}"]`, {
            timeout: 8_000,
          });
        } else {
          await page.waitForTimeout(300);
        }
        await captureIfMissing(page, "mobile-390-all-menu-dialog.png");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
        const expandedAfter =
          await mobileMenuBtn.getAttribute("aria-expanded");
        const returned = await mobileMenuBtn.evaluate(
          (el) => document.activeElement === el,
        );
        mobileMenuFocusReturn = expandedAfter === "false" && returned;
      }

      // 2-B. 모바일 FloatingControls 토글 열기 후 정방향 Tab 초점 흐름 검증 (GAP-A11Y-02 재현)
      const floatingToggle = page
        .locator("[data-floating-controls-toggle]")
        .first();
      let floatingForwardTabStayedInside = true;
      let floatingActiveElementAfterForwardTab = null;
      if ((await floatingToggle.count()) > 0) {
        await floatingToggle.focus();
        await page.keyboard.press("Enter");
        await page.waitForTimeout(180);
        await captureIfMissing(
          page,
          "defect-gap-a11y-02-mobile-floating-controls.png",
        );
        await page.keyboard.press("Tab");
        await page.waitForTimeout(100);
        const tabTarget = await page.evaluate(() => {
          const active = document.activeElement;
          return {
            insideFloatingControls: Boolean(
              active?.closest("[data-floating-controls]"),
            ),
            tag: active?.tagName.toLowerCase() || null,
            ariaLabel: active?.getAttribute("aria-label") || null,
            text: (active?.textContent || "").trim().slice(0, 40),
          };
        });
        floatingForwardTabStayedInside = tabTarget.insideFloatingControls;
        floatingActiveElementAfterForwardTab = tabTarget;
      }

      results.mobile = {
        mobileMenuFocusReturn,
        floatingForwardTabStayedInside,
        floatingActiveElementAfterForwardTab,
      };

      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
  }

  return results;
}

export async function runBrowserAccessibilitySweep() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const force = process.argv.includes("--force");
  const onlyInteractions = process.argv.includes("--only-interactions");

  let existingMatrixResults = [];
  let existingInteractionResults = null;
  if (!force && fs.existsSync(REPORT_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
      if (Array.isArray(cached?.viewportMatrixResults)) {
        existingMatrixResults = cached.viewportMatrixResults;
      }
      if (
        cached?.interactionResults?.desktop?.headerDropdownFocusReturn ===
          true &&
        cached?.interactionResults?.mobile?.mobileMenuFocusReturn === true &&
        cached?.interactionResults?.accessibilityLab
      ) {
        existingInteractionResults = cached.interactionResults;
        if (existingMatrixResults.length >= 28) {
          return cached;
        }
      }
    } catch {
      existingMatrixResults = [];
    }
  }

  const server = await ensureViteServer(BASE_URL, DEFAULT_PORT);
  const executablePath = resolveChromiumExecutable();

  try {
    const interactionResults =
      existingInteractionResults ||
      (await runKeyboardAndFocusReturnChecks(executablePath, BASE_URL));

    const viewportMatrixResults = [...existingMatrixResults];
    const completedKeys = new Set(
      viewportMatrixResults.map((r) => `${r.viewportId}::${r.route}`),
    );

    const writeCheckpoint = () => {
      const partial = {
        executedAt: "2026-11-07",
        baseUrl: BASE_URL,
        chromiumExecutable: executablePath || "playwright-default",
        viewportMatrixCount: viewportMatrixResults.length,
        viewportMatrixResults,
        interactionResults,
      };
      fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
      fs.writeFileSync(REPORT_PATH, `${JSON.stringify(partial, null, 2)}\n`);
      return partial;
    };
    const saved = writeCheckpoint();
    if (onlyInteractions) {
      return saved;
    }

    for (const vp of SWEEP_VIEWPORTS) {
      const routesToCheck =
        vp.id === "pc-1440"
          ? REPRESENTATIVE_ROUTES
          : vp.id === "pc-1440-zoom-200" || vp.id === "pc-1440-reduced-motion"
            ? REPRESENTATIVE_ROUTES.filter((r) =>
                ["/", "/discover", "/accessibility", "/settings"].includes(
                  r.path,
                ),
              )
            : REPRESENTATIVE_ROUTES.filter((r) =>
                [
                  "/",
                  "/discover",
                  "/accessibility",
                  "/settings",
                  "/studio",
                ].includes(r.path),
              );

      const pendingRoutes = routesToCheck.filter(
        (r) => !completedKeys.has(`${vp.id}::${r.path}`),
      );
      if (pendingRoutes.length === 0) {
        continue;
      }

      const browser = await launchAuditBrowser(executablePath);
      try {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: vp.isMobile,
          hasTouch: vp.isMobile,
          reducedMotion: vp.reducedMotion,
          locale: "ko-KR",
          serviceWorkers: "block",
        });
        await prepareSyntheticGuestContext(context);

        for (const route of pendingRoutes) {
          const page = await context.newPage();
          try {
            await page.goto(`${BASE_URL}${route.path}`, {
              waitUntil: "domcontentloaded",
              timeout: 30_000,
            });
            await page.waitForSelector("#main-content", { timeout: 20_000 });
            await page.waitForTimeout(200);

            const surface = await measurePageSurface(page, vp.zoom);
            const axe = await new AxeBuilder({ page })
              .withRules([
                "button-name",
                "link-name",
                "label",
                "aria-allowed-attr",
                "aria-required-attr",
                "aria-valid-attr",
                "aria-valid-attr-value",
                "aria-roles",
                "document-title",
                "html-has-lang",
              ])
              .analyze();

            const routeSlug =
              route.path === "/"
                ? "home"
                : route.path.replace(/^\//u, "").replace(/\//gu, "-");

            if (
              route.path === "/" ||
              (route.path === "/accessibility" &&
                (vp.id === "pc-1440-zoom-200" || vp.id === "mobile-320")) ||
              (route.path === "/studio" &&
                (vp.id === "pc-1440" || vp.id === "mobile-390"))
            ) {
              await captureIfMissing(page, `${vp.id}-${routeSlug}.png`);
            }

            viewportMatrixResults.push({
              viewportId: vp.id,
              viewportLabel: vp.label,
              route: route.path,
              domain: route.domain,
              horizontalOverflowPx: surface.horizontalOverflowPx,
              hasMainLandmark: surface.hasMainLandmark,
              h1Count: surface.h1Count,
              visibleH1Count: surface.visibleH1Count,
              interactiveCount: surface.interactiveCount,
              unlabeledControlCount: surface.unlabeledControlCount,
              axeViolationCount: axe.violations.length,
              axeViolationIds: axe.violations.map((v) => v.id),
              transitionDurationMs: surface.transitionDurationMs,
              animationDurationMs: surface.animationDurationMs,
            });
            completedKeys.add(`${vp.id}::${route.path}`);
            writeCheckpoint();
          } finally {
            await page.close();
          }
        }

        await context.close();
      } finally {
        await browser.close();
      }
    }

    return writeCheckpoint();
  } finally {
    await server.close();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const summary = await runBrowserAccessibilitySweep();
  console.log(
    JSON.stringify(
      {
        executedAt: summary.executedAt,
        viewportMatrixCount: summary.viewportMatrixCount,
        interactionResults: summary.interactionResults,
      },
      null,
      2,
    ),
  );
}
