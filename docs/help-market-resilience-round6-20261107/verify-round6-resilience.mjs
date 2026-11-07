import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const PORT = 4286;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.resolve("docs/help-market-resilience-round6-20261107");
const modeArg = process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1] ?? "after";

const VIEWPORTS = [
  { name: "mobile-320x568-portrait", width: 320, height: 568, zoom: 1 },
  { name: "mobile-568x320-landscape", width: 568, height: 320, zoom: 1 },
  { name: "mobile-390x844-portrait", width: 390, height: 844, zoom: 1 },
  { name: "mobile-844x390-landscape", width: 844, height: 390, zoom: 1 },
  { name: "tablet-768x1024", width: 768, height: 1024, zoom: 1 },
  { name: "desktop-1440x900", width: 1440, height: 900, zoom: 1 },
  { name: "desktop-1440x900-zoom200", width: 1440, height: 900, zoom: 2 },
];

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const server = spawn(
    "npx",
    [
      "vite",
      "--config",
      "apps/web/vite.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      String(PORT),
      "--strictPort",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TOONSPECTRUM_VITE_DISABLE_OPTIMIZE_DEPS: "1",
        NODE_OPTIONS: "--max-old-space-size=2048",
        NO_PROXY: "127.0.0.1,localhost",
        no_proxy: "127.0.0.1,localhost",
      },
    },
  );

  let browser;
  try {
    await waitForServer(`${BASE_URL}/help`);

    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      locale: "ko-KR",
    });

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

    const page = await context.newPage();

    // 1. Load starter catalog from Vite module server and build stress-test record
    await page.goto(`${BASE_URL}/help`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector('input[type="search"]', { timeout: 30000 });

    const starterRecords = await page.evaluate(async () => {
      const mod = await import("/src/shared/lib/creator-marketplace-starter-catalog.ts");
      const base = mod.CREATOR_MARKETPLACE_STARTER_RECORDS.slice(0, 6);
      const first = structuredClone(base[0]);
      first.name =
        "초장문한영복합리소스이름_SuperLongWebtoon3DBackgroundAssetPackage_20261107_Resilience_v99";
      first.description =
        "줄바꿈없는긴설명문장테스트_UnbrokenLongDescriptionTokenForMobile320ViewportResilienceVerification_웹툰배경과소품을빠르게배치하고카메라앵글을조절할수있는고해상도패키지입니다. " +
        "모바일 320x568 세로 및 568x320 가로모드, 200% 확대 환경에서도 모달 내부 스크롤과 닫기 버튼 접근성이 항상 유지되어야 합니다. " +
        "긴 한영 복합 문장과 다수의 태그, 구성 항목이 함께 표시될 때에도 가로 넘침 없이 읽히고 어느 스크롤 위치에서든 즉시 닫기가 가능해야 합니다.";
      first.publisher = {
        ...first.publisher,
        name: "ToonStudio_Official_Creator_Storefront_LongName_배급자스튜디오",
      };
      first.attributionText =
        "CC0_LongAttributionString_WithoutSpaces_PolyHaven_ToonStudio_Verified_Asset_Collection";
      first.tags = [
        "초장문태그_LongTag24CharsMax",
        "CC0_PublicDomain_Asset",
        "PolyHaven_3D_Background",
        "Webtoon_Studio_Ready_v2",
        "고해상도_배경소품_패키지",
        "실내외_연출_라이팅프리셋",
        "카메라앵글_원고합성시험",
        "모바일320_접근성검증완료",
      ];
      return [first, ...base.slice(1)];
    });

    await context.route("**/creator/marketplace/resources*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: starterRecords,
          limit: 12,
          hasMore: false,
          nextCursor: null,
        }),
      });
    });

    // Force cover preview image URLs to return 404 to test broken thumbnail resilience
    await context.route("**/assets/studio/marketplace/cc0/**", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: "Simulated broken thumbnail",
      });
    });

    const helpResilienceResults = [];
    const LONG_ZERO_QUERY =
      "초장문검색어결과없음테스트_UnbrokenZeroResultSearchQueryForMobileResilience_20261107";

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.evaluate((zoom) => {
        document.documentElement.style.zoom = zoom === 1 ? "" : String(zoom);
      }, vp.zoom);
      await page.waitForTimeout(150);

      const searchInput = page.locator('input[type="search"]');
      await searchInput.fill(LONG_ZERO_QUERY);
      await page.waitForTimeout(120);

      const stateDuringZeroResults = await page.evaluate((zoom) => {
        const docOverflowX = Math.max(
          0,
          Math.round(document.documentElement.scrollWidth - window.innerWidth),
        );
        const inlineClearBtn = document.querySelector(
          'button[aria-label="검색어 초기화"], button[aria-label="Clear search query"]',
        );
        const inlineRect = inlineClearBtn?.getBoundingClientRect();
        const emptyClearBtn = Array.from(document.querySelectorAll("#main-content button")).find(
          (b) => (b.textContent || "").trim() === "검색어 지우기",
        );
        const emptyRect = emptyClearBtn?.getBoundingClientRect();

        return {
          docOverflowX,
          hasInlineSearchClearButton: Boolean(inlineClearBtn),
          inlineClearButtonWidth: inlineRect ? Math.round(inlineRect.width / zoom) : 0,
          inlineClearButtonHeight: inlineRect ? Math.round(inlineRect.height / zoom) : 0,
          hasEmptyStateClearButton: Boolean(emptyClearBtn),
          emptyClearButtonWidth: emptyRect ? Math.round(emptyRect.width / zoom) : 0,
          emptyClearButtonHeight: emptyRect ? Math.round(emptyRect.height / zoom) : 0,
        };
      }, vp.zoom);

      // Click empty state "검색어 지우기" and check whether focus returns to search input instead of dropping to body
      const emptyClearLocator = page.getByRole("button", { name: "검색어 지우기" });
      await emptyClearLocator.click();
      await page.waitForTimeout(100);

      const afterEmptyClear = await page.evaluate(() => {
        const active = document.activeElement;
        const input = document.querySelector('input[type="search"]');
        return {
          queryCleared: (input?.value ?? "") === "",
          focusRestoredToSearchInput: active === input,
          activeTagName: active?.tagName.toLowerCase() ?? "body",
        };
      });

      // Test popular chip toggle on and off
      const firstChip = page.locator('#main-content [role="group"] button[aria-pressed]').first();
      await firstChip.click();
      await page.waitForTimeout(80);
      const chipPressedAfterFirstClick = (await firstChip.getAttribute("aria-pressed")) === "true";
      await firstChip.click();
      await page.waitForTimeout(80);
      const chipUnpressedAfterSecondClick =
        (await firstChip.getAttribute("aria-pressed")) === "false";

      // Ensure query is reset for next viewport
      await searchInput.fill("");
      await page.waitForTimeout(80);

      helpResilienceResults.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        zoom: vp.zoom,
        ...stateDuringZeroResults,
        ...afterEmptyClear,
        chipPressedAfterFirstClick,
        chipUnpressedAfterSecondClick,
      });
    }

    await page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });

    // 2. Verify /market MarketQuickPreviewDialog resilience across all 7 viewports
    await page.goto(`${BASE_URL}/market`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector('button[aria-label$="빠른 미리보기"]', { timeout: 30000 });

    const marketResilienceResults = [];

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.evaluate((zoom) => {
        document.documentElement.style.zoom = zoom === 1 ? "" : String(zoom);
      }, vp.zoom);
      await page.waitForTimeout(200);

      const triggerLocator = page.locator('button[aria-label$="빠른 미리보기"]').first();
      await triggerLocator.scrollIntoViewIfNeeded();
      await page.waitForTimeout(80);
      const scrollYBeforeOpen = await page.evaluate(() => {
        const btn = document.querySelector('button[aria-label$="빠른 미리보기"]');
        if (btn instanceof HTMLElement) {
          btn.focus({ preventScroll: true });
          const y = Math.round(window.scrollY);
          btn.click();
          return y;
        }
        return Math.round(window.scrollY);
      });

      await page.waitForSelector('dialog[data-testid="market-quick-preview-dialog"][open]', {
        timeout: 10000,
      });
      await page.waitForTimeout(200);

      const modalState = await page.evaluate((zoom) => {
        const dialog = document.querySelector(
          'dialog[data-testid="market-quick-preview-dialog"][open]',
        );
        const scrollBox = dialog?.querySelector('[data-testid="market-quick-preview-scroll"]') ??
          dialog?.firstElementChild;
        const coverBox = dialog?.querySelector('[data-testid="market-quick-preview-cover"]') ??
          scrollBox?.firstElementChild;
        const titleEl = dialog?.querySelector("#market-quick-preview-title");
        const closeBtn = dialog?.querySelector('button[aria-label="빠른 미리보기 닫기"]');

        const dialogRect = dialog?.getBoundingClientRect();
        const coverRect = coverBox?.getBoundingClientRect();
        const titleRect = titleEl?.getBoundingClientRect();

        const docOverflowX = Math.max(
          0,
          Math.round(document.documentElement.scrollWidth - window.innerWidth),
        );
        const dialogOverflowX = scrollBox
          ? Math.max(0, Math.round(scrollBox.scrollWidth - scrollBox.clientWidth))
          : 0;

        // Check broken images inside cover
        const imgs = coverBox ? Array.from(coverBox.querySelectorAll("img")) : [];
        const visibleBrokenImgCount = imgs.filter((img) => {
          const style = window.getComputedStyle(img);
          const visible = style.display !== "none" && style.visibility !== "hidden";
          return visible && img.complete && img.naturalWidth === 0;
        }).length;
        const hasFallbackIndicator = Boolean(
          dialog?.querySelector('[data-testid="market-cover-fallback"]'),
        );

        const bodyOverflowLocked = document.body.style.overflow === "hidden";

        // Scroll internal container to the bottom and check if close button remains accessible in viewport
        let scrolledTop = 0;
        if (scrollBox) {
          scrollBox.scrollTop = scrollBox.scrollHeight;
          scrolledTop = Math.round(scrollBox.scrollTop);
        }
        const closeRectAfterScroll = closeBtn?.getBoundingClientRect();
        const closeButtonVisibleAfterScroll = Boolean(
          closeRectAfterScroll &&
            closeRectAfterScroll.top >= 0 &&
            closeRectAfterScroll.bottom <= window.innerHeight &&
            Math.round(closeRectAfterScroll.width / zoom) >= 44 &&
            Math.round(closeRectAfterScroll.height / zoom) >= 44,
        );

        const footerCloseBtn = dialog?.querySelector('[data-testid="market-quick-preview-footer-close"]');
        const footerCloseRect = footerCloseBtn?.getBoundingClientRect();

        return {
          docOverflowX,
          dialogOverflowX,
          bodyOverflowLocked,
          dialogHeight: dialogRect ? Math.round(dialogRect.height / zoom) : 0,
          coverHeight: coverRect ? Math.round(coverRect.height / zoom) : 0,
          titleVisibleOnInitialOpen: Boolean(
            titleRect && dialogRect && titleRect.top < dialogRect.bottom,
          ),
          visibleBrokenImgCount,
          hasFallbackIndicator,
          scrolledTop,
          closeButtonVisibleAfterScroll,
          hasFooterCloseButton: Boolean(footerCloseBtn),
          footerCloseButtonHeight: footerCloseRect ? Math.round(footerCloseRect.height / zoom) : 0,
        };
      }, vp.zoom);

      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);

      const afterClose = await page.evaluate((expectedScrollY) => {
        const bodyOverflowRestored = document.body.style.overflow === "";
        const scrollYAfterClose = Math.round(window.scrollY);
        return {
          bodyOverflowRestored,
          scrollYBeforeOpen: expectedScrollY,
          scrollYAfterClose,
          scrollYPreserved: Math.abs(scrollYAfterClose - expectedScrollY) <= 2,
        };
      }, scrollYBeforeOpen);

      marketResilienceResults.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        zoom: vp.zoom,
        ...modalState,
        ...afterClose,
      });
    }

    // 3. Test detached/removed trigger safe focus restoration
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });
    await page.waitForTimeout(150);

    const firstTrigger = page.locator('button[aria-label$="빠른 미리보기"]').first();
    await firstTrigger.focus();
    await firstTrigger.click();
    await page.waitForSelector('dialog[data-testid="market-quick-preview-dialog"][open]', {
      timeout: 10000,
    });
    await page.waitForTimeout(100);

    // Detach the trigger button from the DOM while the modal is open
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label$="빠른 미리보기"]');
      btn?.remove();
    });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);

    const detachedTriggerFocusResult = await page.evaluate(() => {
      const active = document.activeElement;
      const main = document.querySelector("#main-content, main");
      return {
        dialogClosed:
          document.querySelector('dialog[data-testid="market-quick-preview-dialog"][open]') ===
          null,
        activeIsNotBody: active !== null && active !== document.body,
        activeInsideMain: Boolean(main && active && (main === active || main.contains(active))),
        activeTag: active?.tagName.toLowerCase() ?? "body",
        activeLabel: (
          active?.getAttribute("aria-label") ||
          active?.textContent ||
          active?.id ||
          ""
        )
          .trim()
          .slice(0, 60),
      };
    });

    const summary = {
      mode: modeArg,
      allHelpZeroOverflow: helpResilienceResults.every((r) => r.docOverflowX === 0),
      allHelpHaveInlineClear44px: helpResilienceResults.every(
        (r) =>
          r.hasInlineSearchClearButton &&
          r.inlineClearButtonWidth >= 44 &&
          r.inlineClearButtonHeight >= 44,
      ),
      allHelpEmptyClearRestoresFocusToInput: helpResilienceResults.every(
        (r) => r.queryCleared && r.focusRestoredToSearchInput,
      ),
      allHelpChipToggleOffWorks: helpResilienceResults.every(
        (r) => r.chipPressedAfterFirstClick && r.chipUnpressedAfterSecondClick,
      ),
      allMarketZeroOverflow: marketResilienceResults.every(
        (r) => r.docOverflowX === 0 && r.dialogOverflowX === 0,
      ),
      allMarketCloseButtonAccessibleAfterScroll: marketResilienceResults.every(
        (r) => r.closeButtonVisibleAfterScroll && r.hasFooterCloseButton && r.footerCloseButtonHeight >= 44,
      ),
      allMarketBrokenThumbnailsHandledCleanly: marketResilienceResults.every(
        (r) => r.visibleBrokenImgCount === 0 && r.hasFallbackIndicator,
      ),
      allMarketBackgroundScrollLockedAndRestored: marketResilienceResults.every(
        (r) => r.bodyOverflowLocked && r.bodyOverflowRestored && r.scrollYPreserved,
      ),
      detachedTriggerSafeFocusRestored:
        detachedTriggerFocusResult.dialogClosed &&
        detachedTriggerFocusResult.activeIsNotBody &&
        detachedTriggerFocusResult.activeInsideMain,
    };

    const report = {
      verifiedAt: new Date().toISOString(),
      round: "Round 6 Resilience (HelpCenterPage & MarketQuickPreviewDialog)",
      mode: modeArg,
      summary,
      detachedTriggerFocusResult,
      helpResilienceResults,
      marketResilienceResults,
    };

    const fileName = modeArg === "before" ? "before-report.json" : "verification-report.json";
    const reportPath = path.join(OUT_DIR, fileName);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(`Report (${modeArg}) written to:`, reportPath);
    console.log("Summary:", JSON.stringify(summary, null, 2));

    if (modeArg === "after") {
      const allPassed = Object.entries(summary)
        .filter(([k]) => k !== "mode")
        .every(([, v]) => v === true);
      if (!allPassed) {
        throw new Error("One or more Round 6 resilience assertions failed in after mode!");
      }
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    server.kill("SIGKILL");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
