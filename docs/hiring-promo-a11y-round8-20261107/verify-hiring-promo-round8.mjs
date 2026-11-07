import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = __dirname;
const SCREENSHOT_DIR = path.join(OUT_DIR, "screenshots");
const PORT = Number(process.env.ROUND8_A11Y_PORT || 4194);
const DEFAULT_BASE_URL = process.env.ROUND8_A11Y_BASE_URL || `http://127.0.0.1:${PORT}`;

const VIEWPORTS = [
  { id: "mobile-320", width: 320, height: 844, isMobile: true, hasTouch: true, zoom: 1 },
  { id: "mobile-390", width: 390, height: 844, isMobile: true, hasTouch: true, zoom: 1 },
  { id: "tablet-768", width: 768, height: 1024, isMobile: false, hasTouch: true, zoom: 1 },
  { id: "pc-1440", width: 1440, height: 900, isMobile: false, hasTouch: false, zoom: 1 },
  { id: "pc-1440-zoom-200", width: 1440, height: 900, isMobile: false, hasTouch: false, zoom: 2 },
];

const VISUAL_MODES = [
  { id: "light", theme: "light", colorScheme: "light", reducedMotion: "no-preference" },
  { id: "dark", theme: "dark", colorScheme: "dark", reducedMotion: "no-preference" },
  { id: "contrast", theme: "contrast", colorScheme: "dark", reducedMotion: "no-preference" },
  { id: "reduced-motion", theme: "light", colorScheme: "light", reducedMotion: "reduce" },
];

const LONG_HIRING_TITLE =
  "장편 판타지 액션 웹툰 [심연의 궤적: CHRONICLES OF THE ABYSSAL HORIZON — EPISODE 01–120 GLOBAL SERIALIZATION] 메인 선화·펜터치 및 3D 배경 6-Pass LT 어시스턴트 집중 채용";

const LONG_PROMO_TITLE =
  "장편 판타지 웹툰 예고편 프로젝트 — THE CHRONICLES OF ETERNAL STARLIGHT & SHADOWS (시즌 1 공식 모션 트레일러)";

const SYNTHETIC_POSITIONS_PAGE = {
  items: [
    {
      id: "pos-synth-round8-01",
      postId: "post-synth-round8-01",
      postTitle: LONG_HIRING_TITLE,
      revision: 2,
      terms: {
        model: "freelance-task",
        role: "lineart",
        publicScope: "회차당 70컷 메인 캐릭터 및 이펙트 선화·펜터치 마감",
        quantity: 70,
        quantityUnit: "cut",
        startsAt: "2026-11-10T09:00:00.000Z",
        dueAt: "2026-12-31T18:00:00.000Z",
        timeZone: "Asia/Seoul",
        compensation: "paid",
        currency: "KRW",
        minRate: 11000,
        maxRate: 14000,
        rateUnit: "cut",
        tools: ["CLIP STUDIO PAINT", "Blender"],
        formats: ["CLIP", "PSD"],
        revisionRounds: 2,
        acceptanceCriteria: "러프 콘티 기준 펜선 밀도 및 레이어 분리 규격 준수",
        ndaRequired: true,
        creditPolicy: "회차 하단 선화 어시스턴트 실명 또는 필명 표기",
        portfolioPolicy: "approval-required",
        aiPolicy: "prohibited",
      },
    },
    {
      id: "pos-synth-round8-02",
      postId: "post-synth-round8-02",
      postTitle:
        "글로벌 로맨스 판타지 [STARLIGHT COURT: 황궁의 밤과 새벽] 한·일·영 다국어 식자 및 효과음 리드로잉 파트너 모집",
      revision: 1,
      terms: {
        model: "freelance-task",
        role: "lettering",
        publicScope: "한국어 원고 기반 일본어·영어 식자 배치 및 말풍선 여백 검수",
        quantity: 60,
        quantityUnit: "cut",
        startsAt: "2026-11-15T09:00:00.000Z",
        dueAt: "2026-12-20T18:00:00.000Z",
        timeZone: "Asia/Seoul",
        compensation: "paid",
        currency: "KRW",
        minRate: 6500,
        maxRate: 8500,
        rateUnit: "cut",
        tools: ["Adobe Photoshop", "CLIP STUDIO PAINT"],
        formats: ["PSD", "TIFF"],
        revisionRounds: 1,
        acceptanceCriteria: "글로벌 식자 안전 여백 및 대사 줄바꿈 가이드 통과",
        ndaRequired: false,
        creditPolicy: "현지화 식자 크레딧 기재",
        portfolioPolicy: "allowed",
        aiPolicy: "prohibited",
      },
    },
  ],
  next: null,
};

function parseArgs(argv) {
  let mode = "after";
  let baseUrl = DEFAULT_BASE_URL;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--mode=")) {
      mode = arg.slice("--mode=".length).trim();
    } else if (arg.startsWith("--base-url=")) {
      baseUrl = arg.slice("--base-url=".length).trim();
    }
  }
  return { mode, baseUrl };
}

function resolveChromiumExecutable() {
  for (const c of [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].filter(Boolean)) {
    if (fsSync.existsSync(c)) return c;
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
  const vitePkg = require.resolve("vite/package.json", {
    paths: [path.join(REPO_ROOT, "apps/web")],
  });
  const viteBin = path.join(path.dirname(vitePkg), "bin/vite.js");
  const child = spawn(
    process.execPath,
    [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: path.join(REPO_ROOT, "apps/web"),
      env: {
        ...process.env,
        CI: "1",
        NO_PROXY: "127.0.0.1,localhost",
        no_proxy: "127.0.0.1,localhost",
      },
      stdio: "ignore",
    },
  );
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await isServerReady(baseUrl)) {
      return { reused: false, stop: async () => child.kill("SIGTERM") };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  child.kill("SIGKILL");
  throw new Error(`Vite server did not start at ${baseUrl}`);
}

async function attachSyntheticFixtures(context) {
  await context.addInitScript(() => {
    try {
      window.sessionStorage.setItem("toonstudio-intro-shown", "true");
      window.sessionStorage.setItem("toonstudio-splash-seen", "1");
      window.localStorage.setItem("toonstudio-splash-seen", "1");
    } catch {
      // ignore
    }
  });
  await context.route("**/collaborations/hiring/positions*", async (route) => {
    const reqUrl = new URL(route.request().url());
    const roleFilter = reqUrl.searchParams.get("role");
    const items = roleFilter
      ? SYNTHETIC_POSITIONS_PAGE.items.filter((item) => item.terms.role === roleFilter)
      : SYNTHETIC_POSITIONS_PAGE.items;
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ items, next: null }),
    });
  });
}

async function inspectHiringPositions(page, zoom = 1) {
  await page.waitForSelector("[data-testid='hiring-rea-rate-escrow-bar']", { timeout: 30_000 });
  await page.waitForSelector("article h2", { timeout: 15_000 });
  await page.evaluate(() => {
    document.getElementById("splash-screen")?.remove();
    for (const el of document.querySelectorAll("[id*='splash'], [class*='splash']")) {
      el.remove();
    }
  });

  if (zoom !== 1) {
    await page.evaluate((z) => {
      document.documentElement.style.zoom = String(z);
    }, zoom);
    await page.waitForTimeout(150);
  }

  return page.evaluate(() => {
    const minPx = 44 - 0.5;
    const isVisible = (el) => {
      if (!(el instanceof HTMLElement)) return false;
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const measure = (el) => {
      const r = el.getBoundingClientRect();
      const width = Math.round(r.width * 10) / 10;
      const height = Math.round(r.height * 10) / 10;
      const cls = String(el.className || "");
      el.focus();
      const cs = window.getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        testId: el.getAttribute("data-testid") || null,
        text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
        ariaPressed: el.getAttribute("aria-pressed"),
        ariaExpanded: el.getAttribute("aria-expanded"),
        width,
        height,
        meets44x44: width >= minPx && height >= minPx,
        hasFocusVisibleClass:
          cls.includes("focus-visible:outline") ||
          cls.includes("focus-visible:ring") ||
          (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth || "0") > 0),
      };
    };

    const roleButtons = Array.from(document.querySelectorAll("button[data-testid^='hiring-rea-role-']"))
      .filter(isVisible)
      .map(measure);
    const cutButtons = Array.from(document.querySelectorAll("button[data-testid^='hiring-rea-cuts-']"))
      .filter(isVisible)
      .map(measure);

    const openPositionsSection = document.querySelector("section[aria-label*='공개 모집 조건'], section[aria-label*='Open positions']");
    const filterButtons = openPositionsSection
      ? Array.from(openPositionsSection.querySelectorAll("button"))
          .filter(isVisible)
          .map(measure)
      : [];
    const filterSelects = openPositionsSection
      ? Array.from(openPositionsSection.querySelectorAll("select"))
          .filter(isVisible)
          .map((el) => {
            const m = measure(el);
            return { ...m, meetsHeight44: m.height >= minPx };
          })
      : [];
    const cardApplyLinks = openPositionsSection
      ? Array.from(openPositionsSection.querySelectorAll("article a"))
          .filter(isVisible)
          .map(measure)
      : [];

    const roleGroup = document.querySelector("button[data-testid^='hiring-rea-role-']")?.closest("[role='group']");
    const cutsGroup = document.querySelector("button[data-testid^='hiring-rea-cuts-']")?.closest("[role='group']");
    const filterActionBtn = openPositionsSection?.querySelector("button[aria-expanded]");
    const filterActionGroup = filterActionBtn?.closest("[role='group']");

    const cardHeadings = Array.from(document.querySelectorAll("article h2")).filter(isVisible);
    const longHeading = cardHeadings[0] || null;
    const longHeadingRect = longHeading ? longHeading.getBoundingClientRect() : null;
    const longHeadingClipped = longHeading
      ? longHeading.scrollWidth > longHeading.clientWidth + 2
      : false;

    const rootContainer = document.querySelector("[data-testid='hiring-rea-rate-escrow-bar']")?.parentElement;
    const hasOwnControlSize = Boolean(
      rootContainer?.hasAttribute("data-own-control-size") ||
      document.querySelector("[data-testid='hiring-rea-rate-escrow-bar'][data-own-control-size]")
    );

    const docEl = document.documentElement;
    const horizontalOverflowPx = Math.max(0, Math.round(docEl.scrollWidth - docEl.clientWidth));

    const allPrimaryTargets = [...roleButtons, ...cutButtons, ...filterButtons, ...cardApplyLinks];
    const undersizedTargets = allPrimaryTargets.filter((t) => !t.meets44x44);

    const primaryPresetBtn = document.querySelector("button[data-testid='hiring-rea-role-lineart-assist']");
    if (primaryPresetBtn instanceof HTMLElement) {
      primaryPresetBtn.focus();
    }
    window.scrollTo(0, 0);

    return {
      route: "/collaborate/positions",
      theme: docEl.dataset.theme || "light",
      horizontalOverflowPx,
      hasOwnControlSize,
      groups: {
        rolePresetGroupLabel: roleGroup?.getAttribute("aria-label") || null,
        cutCountGroupLabel: cutsGroup?.getAttribute("aria-label") || null,
        filterActionsGroupLabel: filterActionGroup?.getAttribute("aria-label") || null,
      },
      roleButtonsCount: roleButtons.length,
      cutButtonsCount: cutButtons.length,
      filterButtonsCount: filterButtons.length,
      filterSelectsCount: filterSelects.length,
      cardApplyLinksCount: cardApplyLinks.length,
      undersizedTargetCount: undersizedTargets.length,
      undersizedTargets,
      allRoleButtonsMeet44: roleButtons.length === 4 && roleButtons.every((b) => b.meets44x44),
      allCutButtonsMeet44: cutButtons.length === 3 && cutButtons.every((b) => b.meets44x44),
      allFilterButtonsMeet44: filterButtons.length > 0 && filterButtons.every((b) => b.meets44x44),
      allFilterSelectsMeet44: filterSelects.length > 0 && filterSelects.every((s) => s.meetsHeight44),
      allFocusVisibleReady: allPrimaryTargets.every((t) => t.hasFocusVisibleClass),
      longTitle: {
        text: longHeading ? (longHeading.textContent || "").trim().slice(0, 80) : null,
        width: longHeadingRect ? Math.round(longHeadingRect.width) : 0,
        height: longHeadingRect ? Math.round(longHeadingRect.height) : 0,
        clippedHorizontally: longHeadingClipped,
      },
      sampleTargets: {
        roleButtons,
        cutButtons,
        filterButtons,
      },
    };
  });
}

async function inspectStudioPromo(page, zoom = 1) {
  await page.waitForSelector("[data-testid='studio-promo-rea-hook-director-bar']", { timeout: 30_000 });
  await page.waitForSelector("#promo-work-title", { timeout: 15_000 });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[class*='splash'], [data-testid*='splash']")) {
      if (el instanceof HTMLElement) el.style.display = "none";
    }
  });

  await page.fill("#promo-work-title", LONG_PROMO_TITLE);

  if (zoom !== 1) {
    await page.evaluate((z) => {
      document.documentElement.style.zoom = String(z);
    }, zoom);
    await page.waitForTimeout(150);
  }

  return page.evaluate(() => {
    const minPx = 44 - 0.5;
    const isVisible = (el) => {
      if (!(el instanceof HTMLElement)) return false;
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    const measure = (el) => {
      const r = el.getBoundingClientRect();
      const width = Math.round(r.width * 10) / 10;
      const height = Math.round(r.height * 10) / 10;
      const cls = String(el.className || "");
      el.focus();
      const cs = window.getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        testId: el.getAttribute("data-testid") || null,
        text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
        ariaPressed: el.getAttribute("aria-pressed"),
        width,
        height,
        meets44x44: width >= minPx && height >= minPx,
        hasFocusVisible:
          cls.includes("focus-visible:outline") ||
          cls.includes("focus-visible:ring") ||
          Boolean(el.closest("[class*='[&_button]:focus-visible:outline']")) ||
          (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth || "0") > 0),
      };
    };

    const promoRoot = document.querySelector(".promo-studio");
    const hasOwnControlSize = Boolean(promoRoot?.hasAttribute("data-own-control-size"));

    const hookButtons = Array.from(document.querySelectorAll("button[data-testid^='studio-promo-rea-hook-']"))
      .filter(isVisible)
      .map(measure);

    const buttonRowElements = Array.from(document.querySelectorAll(".promo-studio .promo-button-row"));
    const prohibitedAriaDivs = buttonRowElements
      .filter((el) => el.tagName.toLowerCase() === "div" && el.hasAttribute("aria-label") && !el.hasAttribute("role"))
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        ariaLabel: el.getAttribute("aria-label"),
        role: el.getAttribute("role"),
      }));

    const namedGroups = Array.from(
      document.querySelectorAll(".promo-studio [role='group'][aria-label], .promo-studio nav[aria-label]")
    ).map((el) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || null,
      ariaLabel: el.getAttribute("aria-label"),
    }));

    const buttonRowControls = Array.from(
      document.querySelectorAll(".promo-studio .promo-button-row button, .promo-studio .promo-button-row a")
    )
      .filter(isVisible)
      .map(measure);

    const titleInput = document.querySelector("#promo-work-title");
    const titleHeading = document.querySelector("#promo-title");
    const titleHeadingClipped =
      titleHeading instanceof HTMLElement
        ? titleHeading.scrollWidth > titleHeading.clientWidth + 2
        : false;

    const docEl = document.documentElement;
    const horizontalOverflowPx = Math.max(0, Math.round(docEl.scrollWidth - docEl.clientWidth));

    const allCheckedControls = [...hookButtons, ...buttonRowControls];
    const undersizedTargets = allCheckedControls.filter((c) => !c.meets44x44);

    const primaryHookBtn = document.querySelector("button[data-testid='studio-promo-rea-hook-cliffhanger-0to3s']");
    if (primaryHookBtn instanceof HTMLElement) {
      primaryHookBtn.focus();
    }
    window.scrollTo(0, 0);

    return {
      route: "/showcase/promo",
      theme: docEl.dataset.theme || "light",
      horizontalOverflowPx,
      hasOwnControlSize,
      prohibitedAriaDivCount: prohibitedAriaDivs.length,
      prohibitedAriaDivs,
      namedGroupsCount: namedGroups.length,
      namedGroups,
      hookButtonsCount: hookButtons.length,
      buttonRowControlsCount: buttonRowControls.length,
      undersizedTargetCount: undersizedTargets.length,
      undersizedTargets,
      allHookButtonsMeet44: hookButtons.length === 4 && hookButtons.every((b) => b.meets44x44),
      allButtonRowControlsMeet44:
        buttonRowControls.length > 0 && buttonRowControls.every((c) => c.meets44x44),
      allFocusVisibleReady: allCheckedControls.every((c) => c.hasFocusVisible),
      longTitle: {
        inputValueLength: titleInput instanceof HTMLInputElement ? titleInput.value.length : 0,
        headingClippedHorizontally: titleHeadingClipped,
      },
      sampleTargets: {
        hookButtons,
        buttonRowControls,
      },
    };
  });
}

async function main() {
  const { mode, baseUrl } = parseArgs(process.argv);
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  const server = await ensureViteServer(baseUrl, PORT);
  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumExecutable(),
  });
  const viewportResults = [];
  const visualModeResults = [];

  try {
    // 1. Viewport matrix (320, 390, 768, 1440, 1440@200%)
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.hasTouch,
        locale: "ko-KR",
      });
      await attachSyntheticFixtures(context);
      const page = await context.newPage();

      // HiringPositionsPage
      await page.goto(`${baseUrl}/collaborate/positions`, { waitUntil: "domcontentloaded" });
      const hiringResult = await inspectHiringPositions(page, vp.zoom);
      const hiringShotRel = `screenshots/${mode}-hiring-${vp.id}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, hiringShotRel), fullPage: false });

      // Test aria-pressed toggle on role & cuts presets
      await page.click("button[data-testid='hiring-rea-role-bg3d-lt-artist']");
      await page.click("button[data-testid='hiring-rea-cuts-85']");
      const hiringToggleState = await page.evaluate(() => ({
        activeRolePressed: document
          .querySelector("button[data-testid='hiring-rea-role-bg3d-lt-artist']")
          ?.getAttribute("aria-pressed"),
        prevRolePressed: document
          .querySelector("button[data-testid='hiring-rea-role-lineart-assist']")
          ?.getAttribute("aria-pressed"),
        activeCutsPressed: document
          .querySelector("button[data-testid='hiring-rea-cuts-85']")
          ?.getAttribute("aria-pressed"),
        escrowStatusText:
          document.querySelector("[data-testid='hiring-rea-rate-escrow-status']")?.textContent?.trim() || "",
      }));

      // StudioPromoPage
      await page.goto(`${baseUrl}/showcase/promo`, { waitUntil: "domcontentloaded" });
      const promoResult = await inspectStudioPromo(page, vp.zoom);
      const promoShotRel = `screenshots/${mode}-promo-${vp.id}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, promoShotRel), fullPage: false });

      // Test aria-pressed toggle on hook archetype preset
      await page.click("button[data-testid='studio-promo-rea-hook-action-beat-drop']");
      const promoToggleState = await page.evaluate(() => ({
        activeHookPressed: document
          .querySelector("button[data-testid='studio-promo-rea-hook-action-beat-drop']")
          ?.getAttribute("aria-pressed"),
        prevHookPressed: document
          .querySelector("button[data-testid='studio-promo-rea-hook-cliffhanger-0to3s']")
          ?.getAttribute("aria-pressed"),
        retentionBadgeText:
          document.querySelector("[data-testid='studio-promo-rea-retention-badge']")?.textContent?.trim() || "",
      }));

      viewportResults.push({
        viewportId: vp.id,
        width: vp.width,
        height: vp.height,
        zoom: vp.zoom,
        hiring: {
          ...hiringResult,
          toggleState: hiringToggleState,
          screenshot: hiringShotRel,
        },
        promo: {
          ...promoResult,
          toggleState: promoToggleState,
          screenshot: promoShotRel,
        },
      });

      await context.close();
    }

    // 2. Visual & Motion Mode matrix (light, dark, contrast, reduced-motion) on pc-1440
    for (const vm of VISUAL_MODES) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: vm.colorScheme,
        reducedMotion: vm.reducedMotion,
        locale: "ko-KR",
      });
      await attachSyntheticFixtures(context);
      const page = await context.newPage();
      await page.addInitScript((theme) => {
        try {
          window.localStorage.setItem("toonstudio-theme", theme);
        } catch {
          // ignore
        }
        document.documentElement.dataset.theme = theme;
      }, vm.theme);

      await page.goto(`${baseUrl}/collaborate/positions`, { waitUntil: "domcontentloaded" });
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, vm.theme);
      const hiringVm = await inspectHiringPositions(page, 1);
      const hiringVmShot = `screenshots/${mode}-hiring-mode-${vm.id}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, hiringVmShot), fullPage: false });

      await page.goto(`${baseUrl}/showcase/promo`, { waitUntil: "domcontentloaded" });
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, vm.theme);
      const promoVm = await inspectStudioPromo(page, 1);
      const promoVmShot = `screenshots/${mode}-promo-mode-${vm.id}.png`;
      await page.screenshot({ path: path.join(OUT_DIR, promoVmShot), fullPage: false });

      visualModeResults.push({
        modeId: vm.id,
        theme: vm.theme,
        reducedMotion: vm.reducedMotion,
        hiring: {
          undersizedTargetCount: hiringVm.undersizedTargetCount,
          horizontalOverflowPx: hiringVm.horizontalOverflowPx,
          allRoleButtonsMeet44: hiringVm.allRoleButtonsMeet44,
          allCutButtonsMeet44: hiringVm.allCutButtonsMeet44,
          screenshot: hiringVmShot,
        },
        promo: {
          undersizedTargetCount: promoVm.undersizedTargetCount,
          prohibitedAriaDivCount: promoVm.prohibitedAriaDivCount,
          horizontalOverflowPx: promoVm.horizontalOverflowPx,
          allHookButtonsMeet44: promoVm.allHookButtonsMeet44,
          allButtonRowControlsMeet44: promoVm.allButtonRowControlsMeet44,
          screenshot: promoVmShot,
        },
      });

      await context.close();
    }
  } finally {
    await browser.close();
    await server.stop();
  }

  const totalHiringUndersized = viewportResults.reduce(
    (sum, item) => sum + item.hiring.undersizedTargetCount,
    0,
  );
  const totalPromoUndersized = viewportResults.reduce(
    (sum, item) => sum + item.promo.undersizedTargetCount,
    0,
  );
  const totalPromoProhibitedAria = viewportResults.reduce(
    (sum, item) => sum + item.promo.prohibitedAriaDivCount,
    0,
  );
  const maxOverflowPx = Math.max(
    ...viewportResults.flatMap((item) => [
      item.hiring.horizontalOverflowPx,
      item.promo.horizontalOverflowPx,
    ]),
  );

  const report = {
    round: "Round 8 (GAP-R6-04)",
    mode,
    generatedAt: "2026-11-07",
    ownedRoutes: ["/collaborate/positions", "/showcase/promo"],
    summary: {
      totalHiringUndersizedTargetsAcrossViewports: totalHiringUndersized,
      totalPromoUndersizedTargetsAcrossViewports: totalPromoUndersized,
      totalPromoProhibitedAriaAcrossViewports: totalPromoProhibitedAria,
      maxHorizontalOverflowPx: maxOverflowPx,
      allViewportsPass44x44: totalHiringUndersized === 0 && totalPromoUndersized === 0,
      allProhibitedAriaResolved: totalPromoProhibitedAria === 0,
      allGroupsNamed: viewportResults.every(
        (v) =>
          Boolean(v.hiring.groups.rolePresetGroupLabel) &&
          Boolean(v.hiring.groups.cutCountGroupLabel) &&
          Boolean(v.hiring.groups.filterActionsGroupLabel) &&
          v.promo.namedGroupsCount >= 6,
      ),
    },
    viewportResults,
    visualModeResults,
  };

  const outFile = path.join(OUT_DIR, mode === "before" ? "before-report.json" : "verification-report.json");
  await fs.writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
