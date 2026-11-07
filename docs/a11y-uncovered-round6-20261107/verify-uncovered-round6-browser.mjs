import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const REPO_ROOT = process.cwd();
const OUT_DIR = path.join(REPO_ROOT, "docs/a11y-uncovered-round6-20261107");
const SCREENSHOT_DIR = path.join(OUT_DIR, "screenshots");
const REPORT_PATH = path.join(OUT_DIR, "browser-round6-report.json");
const PORT = Number(process.env.ROUND6_A11Y_PORT || 4182);
const BASE_URL = process.env.ROUND6_A11Y_BASE_URL || `http://127.0.0.1:${PORT}`;

const SELECTED_SURFACES = [
  { id: "SURF-R6-01-CUTS-STUDIO", route: "/cuts/studio", domainGroup: "cuts", componentName: "CutsStudioPage", sourceFile: "apps/web/src/domains/cuts/CutsStudioPage.tsx", waitSelector: "[data-testid='cuts-studio-rea-keyframe-ducking-bar']" },
  { id: "SURF-R6-02-LEARN-TRACE", route: "/learn/trace", domainGroup: "learn", componentName: "TracePracticePage", sourceFile: "apps/web/src/domains/learn/TracePracticePage.tsx", waitSelector: "[data-testid='trace-practice-rea-drill-status']" },
  { id: "SURF-R6-03-PDF-WORKBENCH", route: "/studio/pdf-workbench", domainGroup: "creator-pdf-workbench", componentName: "PdfWorkbenchPage", sourceFile: "apps/web/src/domains/creator/pdf-workbench/PdfWorkbenchPage.tsx", waitSelector: "[data-testid='pdf-workbench-rea-status']" },
  { id: "SURF-R6-04-TASTE-ONBOARDING", route: "/onboarding/taste", domainGroup: "engagement", componentName: "TasteOnboardingPage", sourceFile: "apps/web/src/domains/engagement/TasteOnboardingPage.tsx", waitSelector: "img[src='/images/onboarding-taste-spectrum.webp']" },
  { id: "SURF-R6-05-STUDIO-TEMPLATES", route: "/studio/templates", domainGroup: "creator-templates", componentName: "StudioTemplatesPage", sourceFile: "apps/web/src/domains/creator/studio-shell/StudioTemplatesPage.tsx", waitSelector: "[data-template-spec-preset]" },
  { id: "SURF-R6-06-CREATE-START", route: "/create", domainGroup: "creator-start", componentName: "CreateStartPage", sourceFile: "apps/web/src/domains/creator/CreateStartPage.tsx", waitSelector: "[data-testid='create-start-persona-guide']" },
  { id: "SURF-R6-07-STUDIO-TOOLCHAIN", route: "/studio/toolchain", domainGroup: "creator-toolchain", componentName: "StudioProductionToolchainPage", sourceFile: "apps/web/src/domains/creator/toolchain/StudioProductionToolchainPage.tsx", waitSelector: "[data-testid='toolchain-rea-pipeline-receipt-bar']" },
  { id: "SURF-R6-08-HIRING-POSITIONS", route: "/collaborate/positions", domainGroup: "collaboration-hiring", componentName: "HiringPositionsPage", sourceFile: "apps/web/src/domains/collaboration/hiring/HiringPositionsPage.tsx", waitSelector: "[data-testid='hiring-rea-rate-escrow-bar']" },
  { id: "SURF-R6-09-SHOWCASE-PROMO", route: "/showcase/promo", domainGroup: "creator-promo", componentName: "StudioPromoPage", sourceFile: "apps/web/src/domains/creator/promo/StudioPromoPage.tsx", waitSelector: "[data-testid='studio-promo-rea-hook-director-bar']" },
  { id: "SURF-R6-10-SITEMAP", route: "/sitemap", domainGroup: "legal-navigation", componentName: "SitemapPage", sourceFile: "apps/web/src/domains/legal/SitemapPage.tsx", waitSelector: "[data-testid='sitemap-rea-hub-architecture']" },
  { id: "SURF-R6-11-DESIGN-SYSTEM", route: "/design", domainGroup: "legal-design-system", componentName: "DesignSystemPage", sourceFile: "apps/web/src/domains/legal/DesignSystemPage.tsx", waitSelector: "#components" },
  { id: "SURF-R6-12-CREATOR-RESEARCH", route: "/research", domainGroup: "creator-resources", componentName: "CreatorHubPage", sourceFile: "apps/web/src/domains/creator-resources/CreatorHubPage.tsx", waitSelector: "#research-workspace" },
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
  for (const c of [process.env.PLAYWRIGHT_EXECUTABLE_PATH, "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean)) {
    if (fs.existsSync(c)) return c;
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
  if (await isServerReady(baseUrl)) return { reused: true, stop: async () => {} };
  const vitePkg = require.resolve("vite/package.json", { paths: [path.join(REPO_ROOT, "apps/web")] });
  const viteBin = path.join(path.dirname(vitePkg), "bin/vite.js");
  const child = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: path.join(REPO_ROOT, "apps/web"),
    env: { ...process.env, CI: "1", NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost" },
    stdio: "ignore",
  });
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await isServerReady(baseUrl)) return { reused: false, stop: async () => child.kill("SIGTERM") };
    await new Promise((r) => setTimeout(r, 400));
  }
  child.kill("SIGKILL");
  throw new Error(`Vite server did not start at ${baseUrl}`);
}

async function prepareSyntheticGuestContext(context) {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("webtoon.onboarding.seen", "1");
      window.localStorage.setItem("toonstudio-locale", "ko");
    } catch {
      // ignore storage errors
    }
  });
  await context.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "synthetic_offline_audit_mode" }),
    });
  });
}

async function createSyntheticTwoPagePdfBuffer() {
  const pdfLibPath = require.resolve("pdf-lib", { paths: [path.join(REPO_ROOT, "apps/web")] });
  const { PDFDocument } = require(pdfLibPath);
  const doc = await PDFDocument.create();
  doc.addPage([420, 595]).drawText("ToonStudio A11y Synthetic Fixture Page 1", { x: 36, y: 520, size: 14 });
  doc.addPage([420, 595]).drawText("ToonStudio A11y Synthetic Fixture Page 2", { x: 36, y: 520, size: 14 });
  return Buffer.from(await doc.save());
}

async function inspectSingleViewport(browser, vp) {
  const rows = [];
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
    for (const target of SELECTED_SURFACES) {
      await page.goto(`${BASE_URL}${target.route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForSelector(target.waitSelector, { timeout: 30_000 });
      await page.waitForTimeout(60);
      if (vp.zoom !== 1) {
        await page.evaluate((z) => {
          document.documentElement.style.zoom = String(z);
        }, vp.zoom);
        await page.waitForTimeout(40);
      }
      await page.keyboard.press("Tab");

      const metrics = await page.evaluate(() => {
        const docEl = document.documentElement;
        const horizontalOverflowPx = Math.max(0, docEl.scrollWidth - window.innerWidth);
        const active = document.activeElement;
        const firstTabTag = active ? active.tagName.toLowerCase() : null;
        const firstTabText = active ? (active.getAttribute("aria-label") || active.textContent || "").trim().slice(0, 60) : "";
        const mainRoot = document.querySelector("main, #main-content, #learn-main") || document.body;
        const controls = Array.from(
          mainRoot.querySelectorAll("button:not([disabled]), a[href], input:not([type='hidden']):not([disabled]), select:not([disabled]), [role='button'], [role='tab']"),
        ).filter((el) => {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });

        const undersized44 = [];
        let allUnder44Count = 0;
        for (const el of controls) {
          if (el.tagName.toLowerCase() === "a" && window.getComputedStyle(el).display === "inline") continue;
          const rect = el.getBoundingClientRect();
          if (Math.round(rect.height) < 44 || Math.round(rect.width) < 44) {
            allUnder44Count += 1;
            if (undersized44.length < 3) {
              undersized44.push({
                tag: el.tagName.toLowerCase(),
                label: (el.getAttribute("data-testid") || el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/gu, " ").slice(0, 36),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              });
            }
          }
        }

        const koreanNodes = Array.from(mainRoot.querySelectorAll("p, span, dt, dd, strong, h2, h3, li")).filter((el) => {
          const txt = (el.textContent || "").trim();
          return /[가-힣]{6,}/u.test(txt) && el.children.length === 0;
        });
        let crampedKoreanCount = 0;
        for (const node of koreanNodes) {
          const rect = node.getBoundingClientRect();
          const lh = parseFloat(window.getComputedStyle(node).lineHeight) || 18;
          if (rect.width > 0 && rect.width < 92 && rect.height >= lh * 2.7) crampedKoreanCount += 1;
        }

        return {
          horizontalOverflowPx,
          firstTabTag,
          firstTabText,
          mainInteractiveCount: controls.length,
          undersizedTargetCount44: allUnder44Count,
          undersizedTargetSample: undersized44,
          crampedKoreanCount,
        };
      });

      let axeViolationCount = null;
      let axeViolationIds = [];
      if (vp.id === "pc-1440" || vp.id === "mobile-320") {
        const axe = await new AxeBuilder({ page })
          .include("main")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        axeViolationCount = axe.violations.length;
        axeViolationIds = axe.violations.map((v) => v.id);
      }

      rows.push({
        surfaceId: target.id,
        route: target.route,
        viewportId: vp.id,
        ...metrics,
        axeViolationCount,
        axeViolationIds,
      });
    }
    return rows;
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function inspectViewportMatrix(browser) {
  const batch1 = await Promise.all(VIEWPORTS.slice(0, 3).map((vp) => inspectSingleViewport(browser, vp)));
  const batch2 = await Promise.all(VIEWPORTS.slice(3, 6).map((vp) => inspectSingleViewport(browser, vp)));
  return [...batch1.flat(), ...batch2.flat()];
}

async function probeGapR601ContrastAndChips(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
  await prepareSyntheticGuestContext(ctx);
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE_URL}/cuts/studio`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-testid='cuts-studio-rea-keyframe-ducking-bar']", { timeout: 30_000 });

    const cutsAxe = await new AxeBuilder({ page })
      .include("[data-testid='cuts-studio-rea-engine-gsap-parallax-25d']")
      .include("[data-testid='cuts-studio-rea-fps-60fps-webgpu']")
      .withRules(["color-contrast"])
      .analyze();

    const cutsMetrics = await page.evaluate(() => {
      const engineBtn = document.querySelector("[data-testid='cuts-studio-rea-engine-gsap-parallax-25d']");
      const fpsBtn = document.querySelector("[data-testid='cuts-studio-rea-fps-60fps-webgpu']");
      const duckBtn = document.querySelector("[data-testid='cuts-studio-rea-duck-dialogue-minus12db']");
      const s = engineBtn ? window.getComputedStyle(engineBtn) : null;
      const r1 = engineBtn?.getBoundingClientRect();
      const r2 = fpsBtn?.getBoundingClientRect();
      const r3 = duckBtn?.getBoundingClientRect();
      return {
        engineClassName: engineBtn?.className || "",
        usesHardcodedTextWhiteOnAccent: Boolean(
          engineBtn?.className.includes("bg-accent") && engineBtn?.className.includes("text-white"),
        ),
        engineColor: s?.color || "",
        engineBackgroundColor: s?.backgroundColor || "",
        engineSize: r1 ? { width: Math.round(r1.width), height: Math.round(r1.height) } : null,
        fpsSize: r2 ? { width: Math.round(r2.width), height: Math.round(r2.height) } : null,
        duckSize: r3 ? { width: Math.round(r3.width), height: Math.round(r3.height) } : null,
      };
    });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "gap-r6-01-cuts-trace-contrast-and-chips.png") });

    await page.goto(`${BASE_URL}/learn/trace`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-testid='trace-practice-rea-drill-status']", { timeout: 30_000 });

    const traceAxe = await new AxeBuilder({ page })
      .include("[data-testid='trace-practice-rea-drill-posemaniacs-30s-gesture']")
      .include("[data-testid='trace-practice-rea-opacity-50pct-onion']")
      .withRules(["color-contrast"])
      .analyze();

    const traceMetrics = await page.evaluate(() => {
      const drillBtn = document.querySelector("[data-testid='trace-practice-rea-drill-posemaniacs-30s-gesture']");
      const opacityBtn = document.querySelector("[data-testid='trace-practice-rea-opacity-50pct-onion']");
      const s = drillBtn ? window.getComputedStyle(drillBtn) : null;
      const r1 = drillBtn?.getBoundingClientRect();
      const r2 = opacityBtn?.getBoundingClientRect();
      return {
        drillClassName: drillBtn?.className || "",
        usesHardcodedTextWhiteOnAccent: Boolean(
          drillBtn?.className.includes("bg-accent") && drillBtn?.className.includes("text-white"),
        ),
        drillColor: s?.color || "",
        drillBackgroundColor: s?.backgroundColor || "",
        drillSize: r1 ? { width: Math.round(r1.width), height: Math.round(r1.height) } : null,
        opacitySize: r2 ? { width: Math.round(r2.width), height: Math.round(r2.height) } : null,
      };
    });

    return {
      id: "GAP-R6-01",
      severity: "high",
      routes: ["/cuts/studio", "/learn/trace"],
      sourceFiles: [
        "apps/web/src/domains/cuts/CutsStudioPage.tsx:469-505",
        "apps/web/src/domains/learn/TracePracticePage.tsx:109-145",
      ],
      cutsColorContrastViolationCount: cutsAxe.violations.length,
      traceColorContrastViolationCount: traceAxe.violations.length,
      cutsMetrics,
      traceMetrics,
      reproduced:
        cutsMetrics.usesHardcodedTextWhiteOnAccent &&
        traceMetrics.usesHardcodedTextWhiteOnAccent &&
        (cutsAxe.violations.length > 0 || traceAxe.violations.length > 0) &&
        (cutsMetrics.engineSize?.height ?? 99) < 44 &&
        (traceMetrics.drillSize?.height ?? 99) < 44,
    };
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function probeGapR602PdfWorkbench(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", locale: "ko-KR" });
  await prepareSyntheticGuestContext(ctx);
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE_URL}/studio/pdf-workbench`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-testid='pdf-workbench-rea-status']", { timeout: 30_000 });

    const pdfBuffer = await createSyntheticTwoPagePdfBuffer();
    await page.locator("input[type='file']").setInputFiles({
      name: "synthetic-a11y-sample.pdf",
      mimeType: "application/pdf",
      buffer: pdfBuffer,
    });
    await page.waitForSelector("ul[aria-label='추가된 파일'] button", { timeout: 15_000 });

    const metrics = await page.evaluate(() => {
      const trimBtn = document.querySelector("[data-testid='pdf-rea-trim-b5-manga-bleed3mm']");
      const inkBtn = document.querySelector("[data-testid='pdf-rea-ink-cmyk-japan-color-300pct']");
      const trimRect = trimBtn?.getBoundingClientRect();
      const removeSourceBtn = document.querySelector("ul[aria-label='추가된 파일'] button[aria-label*='빼기']");
      const removeSourceRect = removeSourceBtn?.getBoundingClientRect();
      const pageActionBtns = Array.from(document.querySelectorAll("section[aria-label='페이지 목록'] li button"));
      const pageActionSizes = pageActionBtns.slice(0, 4).map((btn) => {
        const r = btn.getBoundingClientRect();
        return { ariaLabel: btn.getAttribute("aria-label") || "", width: Math.round(r.width), height: Math.round(r.height) };
      });
      return {
        trimGroupRole: trimBtn?.parentElement?.getAttribute("role") ?? null,
        trimGroupAriaLabel: trimBtn?.parentElement?.getAttribute("aria-label") ?? null,
        inkGroupRole: inkBtn?.parentElement?.getAttribute("role") ?? null,
        inkGroupAriaLabel: inkBtn?.parentElement?.getAttribute("aria-label") ?? null,
        trimButtonHeight: trimRect ? Math.round(trimRect.height) : null,
        removeSourceButtonSize: removeSourceRect ? { width: Math.round(removeSourceRect.width), height: Math.round(removeSourceRect.height) } : null,
        pageActionSizes,
      };
    });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "gap-r6-02-pdf-workbench-targets-and-groups.png") });

    return {
      id: "GAP-R6-02",
      severity: "medium",
      routes: ["/studio/pdf-workbench"],
      sourceFiles: ["apps/web/src/domains/creator/pdf-workbench/PdfWorkbenchPage.tsx:324-553"],
      ...metrics,
      reproduced:
        metrics.trimGroupRole === null &&
        metrics.inkGroupRole === null &&
        (metrics.trimButtonHeight ?? 99) < 44 &&
        (metrics.removeSourceButtonSize?.height ?? 99) < 44 &&
        metrics.pageActionSizes.some((s) => s.height < 44 || s.width < 44),
    };
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function probeGapR603TasteAndTemplates(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
  await prepareSyntheticGuestContext(ctx);
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE_URL}/onboarding/taste`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("main button[aria-pressed]", { timeout: 30_000 });

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("main button[aria-pressed]"));
      btns.slice(0, 3).forEach((b) => (b instanceof HTMLElement ? b.click() : null));
    });
    await page.waitForTimeout(80);
    await page.evaluate(() => {
      const footerBtns = Array.from(document.querySelectorAll("main div.mt-7 button"));
      const nextBtn = footerBtns[footerBtns.length - 1];
      if (nextBtn instanceof HTMLElement) nextBtn.click();
    });
    await page.waitForTimeout(80);

    const step2Metrics = await page.evaluate(() => {
      const btn = document.querySelector("main button[aria-pressed]");
      return {
        step2GroupRole: btn?.parentElement?.getAttribute("role") ?? null,
        step2GroupAriaLabel: btn?.parentElement?.getAttribute("aria-label") ?? null,
      };
    });

    await page.evaluate(() => {
      const footerBtns = Array.from(document.querySelectorAll("main div.mt-7 button"));
      const nextBtn = footerBtns[footerBtns.length - 1];
      if (nextBtn instanceof HTMLElement) nextBtn.click();
    });
    await page.waitForTimeout(80);

    const step3Metrics = await page.evaluate(() => {
      const btn = document.querySelector("main button[aria-pressed]");
      const rect = btn?.getBoundingClientRect();
      return {
        step3GroupRole: btn?.parentElement?.getAttribute("role") ?? null,
        step3GroupAriaLabel: btn?.parentElement?.getAttribute("aria-label") ?? null,
        avoidTagButtonHeight: rect ? Math.round(rect.height) : null,
      };
    });

    await page.goto(`${BASE_URL}/studio/templates`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-template-spec-preset]", { timeout: 30_000 });

    const templateMetrics = await page.evaluate(() => {
      const categoryBtn = document.querySelector("section[aria-label*='템플릿'] button[aria-pressed]");
      const specBtn = document.querySelector("[data-template-spec-preset]");
      const catRect = categoryBtn?.getBoundingClientRect();
      const specRect = specBtn?.getBoundingClientRect();
      return {
        categoryContainerRole: categoryBtn?.parentElement?.getAttribute("role") ?? null,
        categoryButtonHeight: catRect ? Math.round(catRect.height) : null,
        specPresetButtonHeight: specRect ? Math.round(specRect.height) : null,
      };
    });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "gap-r6-03-taste-and-templates-filters.png") });

    return {
      id: "GAP-R6-03",
      severity: "medium",
      routes: ["/onboarding/taste", "/studio/templates"],
      sourceFiles: [
        "apps/web/src/domains/engagement/TasteOnboardingPage.tsx:305-363",
        "apps/web/src/domains/creator/studio-shell/StudioTemplatesPage.tsx:380-441",
      ],
      ...step2Metrics,
      ...step3Metrics,
      ...templateMetrics,
      reproduced:
        step2Metrics.step2GroupRole === null &&
        step3Metrics.step3GroupRole === null &&
        (step3Metrics.avoidTagButtonHeight ?? 99) < 44 &&
        templateMetrics.categoryContainerRole === null &&
        (templateMetrics.specPresetButtonHeight ?? 99) < 44,
    };
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function probeGapR604CreatorAndHiringControls(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
  await prepareSyntheticGuestContext(ctx);
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE_URL}/create`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-testid='create-start-persona-guide']", { timeout: 30_000 });
    const createMetrics = await page.evaluate(() => {
      const btn = document.querySelector("[role='group'][aria-label*='시작 화면'] button");
      const r = btn?.getBoundingClientRect();
      return {
        sectionSwitchHeight: r ? Math.round(r.height) : null,
        hasExplicitFocusVisibleClass: Boolean(btn?.className.includes("focus-visible:")),
      };
    });

    await page.goto(`${BASE_URL}/studio/toolchain`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-testid='toolchain-rea-pipeline-receipt-bar']", { timeout: 30_000 });
    const toolchainMetrics = await page.evaluate(() => {
      const btn = document.querySelector("button[data-testid^='toolchain-rea-track-']");
      const r = btn?.getBoundingClientRect();
      return {
        trackButtonHeight: r ? Math.round(r.height) : null,
        hasExplicitFocusVisibleClass: Boolean(btn?.className.includes("focus-visible:")),
      };
    });

    await page.goto(`${BASE_URL}/collaborate/positions`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-testid='hiring-rea-rate-escrow-bar']", { timeout: 30_000 });
    const hiringMetrics = await page.evaluate(() => {
      const roleBtn = document.querySelector("button[data-testid^='hiring-rea-role-']");
      const cutsBtn = document.querySelector("button[data-testid^='hiring-rea-cuts-']");
      const r1 = roleBtn?.getBoundingClientRect();
      const r2 = cutsBtn?.getBoundingClientRect();
      return {
        roleButtonHeight: r1 ? Math.round(r1.height) : null,
        cutsButtonHeight: r2 ? Math.round(r2.height) : null,
      };
    });

    await page.goto(`${BASE_URL}/showcase/promo`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-testid='studio-promo-rea-hook-director-bar']", { timeout: 30_000 });
    const promoMetrics = await page.evaluate(() => {
      const hookBtn = document.querySelector("button[data-testid^='studio-promo-rea-hook-']");
      const r = hookBtn?.getBoundingClientRect();
      return { hookButtonHeight: r ? Math.round(r.height) : null };
    });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "gap-r6-04-toolchain-hiring-promo-controls.png") });

    return {
      id: "GAP-R6-04",
      severity: "medium",
      routes: ["/create", "/studio/toolchain", "/collaborate/positions", "/showcase/promo"],
      sourceFiles: [
        "apps/web/src/domains/creator/CreateStartPage.tsx:174-188",
        "apps/web/src/domains/creator/toolchain/StudioProductionToolchainPage.tsx:205-218",
        "apps/web/src/domains/collaboration/hiring/HiringPositionsPage.tsx:203-227",
        "apps/web/src/domains/creator/promo/StudioPromoPage.tsx:349-358",
      ],
      createMetrics,
      toolchainMetrics,
      hiringMetrics,
      promoMetrics,
      reproduced:
        (createMetrics.sectionSwitchHeight ?? 99) < 44 &&
        (toolchainMetrics.trackButtonHeight ?? 99) < 44 &&
        (hiringMetrics.roleButtonHeight ?? 99) < 44 &&
        (promoMetrics.hookButtonHeight ?? 99) < 44,
    };
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function probeGapR605SitemapDesignResearch(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 320, height: 844 },
    isMobile: false,
    hasTouch: false,
    reducedMotion: "reduce",
    locale: "ko-KR",
  });
  await prepareSyntheticGuestContext(ctx);
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE_URL}/sitemap`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-testid='sitemap-rea-hub-architecture']", { timeout: 30_000 });
    const sitemapMetrics = await page.evaluate(() => {
      const chipLink = document.querySelector("[data-testid='sitemap-rea-hub-architecture'] a.min-h-7");
      const promoLink = document.querySelector("[data-testid='sitemap-rea-hub-architecture'] a.min-h-9");
      const r1 = chipLink?.getBoundingClientRect();
      const r2 = promoLink?.getBoundingClientRect();
      return {
        hubChipLinkHeight: r1 ? Math.round(r1.height) : null,
        promoHubCtaHeight: r2 ? Math.round(r2.height) : null,
      };
    });

    await page.goto(`${BASE_URL}/design`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("#components", { timeout: 30_000 });
    const designMetrics = await page.evaluate(() => {
      const pulseDot = document.querySelector(".animate-pulse-soft");
      const selectBtn = document.querySelector("button[aria-label='플랫폼']");
      const r = selectBtn?.getBoundingClientRect();
      return {
        pulseHasMotionReduceClass: Boolean(pulseDot?.className.includes("motion-reduce:animate-none")),
        selectTriggerHeight: r ? Math.round(r.height) : null,
      };
    });

    await page.goto(`${BASE_URL}/research`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("#research-workspace", { timeout: 30_000 });
    await page.evaluate(() => {
      document.querySelectorAll("#research-workspace details").forEach((d) => d.setAttribute("open", ""));
    });
    await page.waitForTimeout(80);
    const researchMetrics = await page.evaluate(() => {
      const rightsDl = document.querySelector("section[aria-labelledby='research-rights-title'] dl");
      const firstCard = rightsDl?.firstElementChild;
      const dt = firstCard?.querySelector("dt");
      const cardRect = firstCard?.getBoundingClientRect();
      const dtRect = dt?.getBoundingClientRect();
      const chevron = document.querySelector("#research-workspace summary svg.transition-transform");
      const chevronClass = chevron?.getAttribute("class") || "";
      return {
        rightsCardWidthAt320: cardRect ? Math.round(cardRect.width) : null,
        rightsLabelHeightAt320: dtRect ? Math.round(dtRect.height) : null,
        chevronHasMotionReduceClass: chevronClass.includes("motion-reduce:transition-none"),
      };
    });

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "gap-r6-05-sitemap-design-research-320.png") });

    return {
      id: "GAP-R6-05",
      severity: "low",
      routes: ["/sitemap", "/design", "/research"],
      sourceFiles: [
        "apps/web/src/domains/legal/SitemapPage.tsx:188-215",
        "apps/web/src/domains/legal/DesignSystemPage.tsx:344-425",
        "apps/web/src/domains/creator-resources/CreatorHubPage.tsx:304-373",
      ],
      sitemapMetrics,
      designMetrics,
      researchMetrics,
      reproduced:
        (sitemapMetrics.hubChipLinkHeight ?? 99) < 44 &&
        (sitemapMetrics.promoHubCtaHeight ?? 99) < 44 &&
        designMetrics.pulseHasMotionReduceClass === false &&
        (researchMetrics.rightsCardWidthAt320 ?? 999) < 95 &&
        researchMetrics.chevronHasMotionReduceClass === false,
    };
  } finally {
    await page.close();
    await ctx.close();
  }
}

async function probeNonVerifiedAuthAndEmptyBoundaries(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
  await prepareSyntheticGuestContext(ctx);
  const page = await ctx.newPage();

  const boundaryRoutes = [
    { route: "/newsletter", expectedBoundary: "AUTH_GATED_WALL", sourceFile: "apps/web/src/domains/newsletter/MyNewslettersPage.tsx:79-95" },
    { route: "/team/organization", expectedBoundary: "AUTH_GATED_WALL", sourceFile: "apps/web/src/domains/creator/production-hub/OrganizationHomePage.tsx:331-340" },
    { route: "/collaborate/visual-audit", expectedBoundary: "EMPTY_OR_API_ERROR_WALL", sourceFile: "apps/web/src/domains/collaboration/CollaborationPostPage.tsx:70-85" },
    { route: "/publish", expectedBoundary: "PARTIAL_API_ERROR_WALL", sourceFile: "apps/web/src/domains/integrations/PublishCenterPage.tsx:349-351" },
  ];

  const results = [];
  try {
    for (const item of boundaryRoutes) {
      await page.goto(`${BASE_URL}${item.route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(450);
      const summary = await page.evaluate(() => {
        const mainText = (document.querySelector("main")?.textContent || "").replace(/\s+/gu, " ").trim().slice(0, 180);
        const hasLoginLink = Boolean(document.querySelector("main a[href*='/login'], main a[href*='/signup']"));
        const hasAlertOrError = Boolean(document.querySelector("main [role='alert'], main button"));
        return { mainText, hasLoginLink, hasAlertOrError };
      });
      results.push({
        ...item,
        verifiedComplete: false,
        disposition: "NOT_VERIFIED_AUTH_OR_EMPTY_BOUNDARY",
        observedSummary: summary,
      });
    }
    return results;
  } finally {
    await page.close();
    await ctx.close();
  }
}

function serializeCompactReport(report) {
  const header = {
    executedAt: report.executedAt,
    baseUrl: report.baseUrl,
    selectedSurfaceCount: report.selectedSurfaceCount,
    viewportCount: report.viewportCount,
    totalViewportChecks: report.totalViewportChecks,
    selectedSurfaces: report.selectedSurfaces,
    reproducedDefects: report.reproducedDefects,
    authAndEmptyBoundaryProbes: report.authAndEmptyBoundaryProbes,
  };
  const baseJson = JSON.stringify(header, null, 2);
  const matrixLines = report.viewportMatrix.map((row) => `    ${JSON.stringify(row)}`).join(",\n");
  return `${baseJson.slice(0, -2)},\n  "viewportMatrix": [\n${matrixLines}\n  ]\n}\n`;
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const server = await ensureViteServer(BASE_URL, PORT);
  const browser = await chromium.launch({ headless: true, executablePath: resolveChromiumExecutable() });

  try {
    const viewportMatrix = await inspectViewportMatrix(browser);
    const gapR601 = await probeGapR601ContrastAndChips(browser);
    const gapR602 = await probeGapR602PdfWorkbench(browser);
    const gapR603 = await probeGapR603TasteAndTemplates(browser);
    const gapR604 = await probeGapR604CreatorAndHiringControls(browser);
    const gapR605 = await probeGapR605SitemapDesignResearch(browser);
    const authAndEmptyBoundaryProbes = await probeNonVerifiedAuthAndEmptyBoundaries(browser);

    const defects = [gapR601, gapR602, gapR603, gapR604, gapR605];
    const report = {
      executedAt: "2026-11-07",
      baseUrl: BASE_URL,
      selectedSurfaceCount: SELECTED_SURFACES.length,
      viewportCount: VIEWPORTS.length,
      totalViewportChecks: viewportMatrix.length,
      selectedSurfaces: SELECTED_SURFACES,
      reproducedDefects: defects,
      authAndEmptyBoundaryProbes,
      viewportMatrix,
    };

    fs.writeFileSync(REPORT_PATH, serializeCompactReport(report), "utf8");
    console.log(
      JSON.stringify(
        {
          selectedSurfaceCount: report.selectedSurfaceCount,
          totalViewportChecks: report.totalViewportChecks,
          reproducedDefects: defects.map((d) => ({ id: d.id, severity: d.severity, reproduced: d.reproduced })),
          boundaryProbesCount: authAndEmptyBoundaryProbes.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    await server.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
