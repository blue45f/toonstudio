import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const PORT = 4285;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.resolve("docs/help-market-preview-a11y-round5-20261107");

const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 568, zoom: 1 },
  { name: "mobile-390", width: 390, height: 844, zoom: 1 },
  { name: "tablet-768", width: 768, height: 1024, zoom: 1 },
  { name: "desktop-1440", width: 1440, height: 900, zoom: 1 },
  { name: "desktop-1440-zoom200", width: 1440, height: 900, zoom: 2 },
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

    const helpResults = [];
    const marketResults = [];

    // 1. Verify /help across all 5 viewports
    await page.goto(`${BASE_URL}/help`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector('input[type="search"]', { timeout: 30000 });

    // Load valid starter marketplace records directly from Vite module server to fulfill /creator/marketplace/resources
    const starterRecords = await page.evaluate(async () => {
      const mod = await import("/src/shared/lib/creator-marketplace-starter-catalog.ts");
      return mod.CREATOR_MARKETPLACE_STARTER_RECORDS.slice(0, 6);
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

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.evaluate((zoom) => {
        document.documentElement.style.zoom = zoom === 1 ? "" : String(zoom);
      }, vp.zoom);
      await page.waitForTimeout(200);

      // Expand first FAQ item in #main-content to measure its internal link target
      await page.evaluate(() => {
        const firstDetails = document.querySelector("#main-content details.group");
        if (firstDetails && !firstDetails.open) {
          firstDetails.open = true;
        }
      });
      await page.waitForTimeout(100);

      const helpMetrics = await page.evaluate((zoom) => {
        const docOverflowX = Math.max(
          0,
          Math.round(document.documentElement.scrollWidth - window.innerWidth),
        );

        const filterButtons = Array.from(
          document.querySelectorAll('#main-content [role="group"] button[aria-pressed]'),
        ).map((btn) => {
          const rect = btn.getBoundingClientRect();
          return {
            label: (btn.textContent || "").trim(),
            width: Math.round(rect.width / zoom),
            height: Math.round(rect.height / zoom),
            hasReducedMotionClass: btn.className.includes("motion-reduce:transition-none"),
          };
        });

        const topicSection = Array.from(
          document.querySelectorAll("#main-content section"),
        ).find((s) => s.textContent?.includes("도움말 주제"));
        const topicCards = topicSection
          ? Array.from(topicSection.querySelectorAll("a")).map((a) => {
              const rect = a.getBoundingClientRect();
              return {
                width: Math.round(rect.width / zoom),
                height: Math.round(rect.height / zoom),
              };
            })
          : [];

        const firstFaqLink = document.querySelector("#main-content details.group[open] a");
        const faqLinkRect = firstFaqLink ? firstFaqLink.getBoundingClientRect() : null;
        const faqChevron = document.querySelector(
          "#main-content details.group summary span[aria-hidden='true']",
        );

        return {
          docOverflowX,
          filterButtonCount: filterButtons.length,
          minFilterButtonHeight: Math.min(...filterButtons.map((b) => b.height)),
          minFilterButtonWidth: Math.min(...filterButtons.map((b) => b.width)),
          allFilterButtonsMeet44px: filterButtons.every((b) => b.height >= 44 && b.width >= 44),
          allFilterButtonsHaveReducedMotion: filterButtons.every((b) => b.hasReducedMotionClass),
          topicCardCount: topicCards.length,
          firstTopicCardWidth: topicCards[0]?.width ?? 0,
          firstTopicCardHeight: topicCards[0]?.height ?? 0,
          faqLinkHeight: faqLinkRect ? Math.round(faqLinkRect.height / zoom) : 0,
          faqLinkWidth: faqLinkRect ? Math.round(faqLinkRect.width / zoom) : 0,
          faqChevronHasReducedMotion: Boolean(
            faqChevron && faqChevron.className.includes("motion-reduce:transition-none"),
          ),
        };
      }, vp.zoom);

      // Also verify empty search clear button >= 44px on mobile-320
      let emptyClearButtonHeight = null;
      let emptyClearButtonWidth = null;
      if (vp.name === "mobile-320") {
        const searchInput = page.locator('input[type="search"]');
        await searchInput.fill("__nonexistent_query_gap_r4_05__");
        await page.waitForTimeout(100);
        const clearBtn = page.getByRole("button", { name: "검색어 지우기" });
        const box = await clearBtn.boundingBox();
        emptyClearButtonHeight = box ? Math.round(box.height) : 0;
        emptyClearButtonWidth = box ? Math.round(box.width) : 0;
        await clearBtn.click();
        await page.waitForTimeout(100);
      }

      helpResults.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        zoom: vp.zoom,
        ...helpMetrics,
        ...(emptyClearButtonHeight !== null
          ? { emptyClearButtonHeight, emptyClearButtonWidth }
          : {}),
      });
    }

    // Reset zoom before navigating to /market
    await page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });

    // 2. Verify /market MarketQuickPreviewDialog across all 5 viewports
    await page.goto(`${BASE_URL}/market`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector('button[aria-label$="빠른 미리보기"]', { timeout: 30000 });

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.evaluate((zoom) => {
        document.documentElement.style.zoom = zoom === 1 ? "" : String(zoom);
      }, vp.zoom);
      await page.waitForTimeout(200);

      // Find first visible quick preview trigger button, focus it, and click it
      const triggerLocator = page.locator('button[aria-label$="빠른 미리보기"]').first();
      await triggerLocator.scrollIntoViewIfNeeded();
      await triggerLocator.focus();
      const triggerAriaLabel = await triggerLocator.getAttribute("aria-label");
      await triggerLocator.click();

      await page.waitForSelector('dialog[data-testid="market-quick-preview-dialog"][open]', { timeout: 10000 });
      await page.waitForTimeout(150);

      const initialFocusInfo = await page.evaluate((zoom) => {
        const dialog = document.querySelector('dialog[data-testid="market-quick-preview-dialog"][open]');
        const active = document.activeElement;
        const closeBtn = dialog?.querySelector('button[aria-label="빠른 미리보기 닫기"]');
        const closeRect = closeBtn?.getBoundingClientRect();

        // Check top-left badge container vs close button horizontal separation
        const badgeContainer = dialog?.querySelector("div.absolute.left-3.right-16.top-3");
        const badgeRect = badgeContainer?.getBoundingClientRect();

        // Measure all interactive buttons and links inside the dialog
        const controls = dialog
          ? Array.from(dialog.querySelectorAll("button, a[href]")).map((el) => {
              const r = el.getBoundingClientRect();
              return {
                tag: el.tagName.toLowerCase(),
                label: (el.getAttribute("aria-label") || el.textContent || "").trim(),
                width: Math.round(r.width / zoom),
                height: Math.round(r.height / zoom),
              };
            })
          : [];

        const docOverflowX = Math.max(
          0,
          Math.round(document.documentElement.scrollWidth - window.innerWidth),
        );

        return {
          docOverflowX,
          initialFocusIsCloseButton: active === closeBtn,
          initialFocusAriaLabel: active?.getAttribute("aria-label") || null,
          closeButtonWidth: closeRect ? Math.round(closeRect.width / zoom) : 0,
          closeButtonHeight: closeRect ? Math.round(closeRect.height / zoom) : 0,
          badgeStripDoesNotOverlapCloseButton:
            badgeRect && closeRect ? badgeRect.right <= closeRect.left + 1 : true,
          controlCount: controls.length,
          minControlHeight: Math.min(...controls.map((c) => c.height)),
          minControlWidth: Math.min(...controls.map((c) => c.width)),
          allControlsMeet44px: controls.every((c) => c.height >= 44 && c.width >= 44),
          controls,
        };
      }, vp.zoom);

      // Test Shift+Tab from first element (Close button) -> wraps to last element inside dialog
      await page.keyboard.press("Shift+Tab");
      const afterShiftTab = await page.evaluate(() => {
        const dialog = document.querySelector('dialog[data-testid="market-quick-preview-dialog"][open]');
        const active = document.activeElement;
        return {
          insideDialog: Boolean(dialog && active && dialog.contains(active)),
          text: (active?.textContent || active?.getAttribute("aria-label") || "").trim(),
        };
      });

      // Test Tab from last element -> wraps back to first element (Close button)
      await page.keyboard.press("Tab");
      const afterForwardTab = await page.evaluate(() => {
        const dialog = document.querySelector('dialog[data-testid="market-quick-preview-dialog"][open]');
        const closeBtn = dialog?.querySelector('button[aria-label="빠른 미리보기 닫기"]');
        const active = document.activeElement;
        return {
          insideDialog: Boolean(dialog && active && dialog.contains(active)),
          wrappedToCloseButton: active === closeBtn,
        };
      });

      // Test Escape closes dialog and restores focus to trigger button
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);

      const afterEscape = await page.evaluate((expectedLabel) => {
        const dialog = document.querySelector('dialog[data-testid="market-quick-preview-dialog"][open]');
        const active = document.activeElement;
        const activeLabel = active?.getAttribute("aria-label") || "";
        return {
          dialogClosed: dialog === null,
          focusRestoredToTrigger: activeLabel === expectedLabel,
          restoredAriaLabel: activeLabel,
        };
      }, triggerAriaLabel);

      marketResults.push({
        viewport: vp.name,
        width: vp.width,
        height: vp.height,
        zoom: vp.zoom,
        ...initialFocusInfo,
        focusTrapShiftTab: afterShiftTab,
        focusTrapForwardTab: afterForwardTab,
        escapeDismissAndRestore: afterEscape,
      });
    }

    const report = {
      verifiedAt: new Date().toISOString(),
      issueId: "GAP-R4-05",
      targets: [
        "apps/web/src/domains/legal/HelpCenterPage.tsx",
        "apps/web/src/domains/market/components/MarketQuickPreviewDialog.tsx",
      ],
      summary: {
        allViewportsZeroOverflow:
          helpResults.every((r) => r.docOverflowX === 0) &&
          marketResults.every((r) => r.docOverflowX === 0),
        allHelpFilterButtonsMeet44px: helpResults.every((r) => r.allFilterButtonsMeet44px),
        help320SingleColumnTopicWidth:
          helpResults.find((r) => r.viewport === "mobile-320")?.firstTopicCardWidth ?? 0,
        allMarketDialogControlsMeet44px: marketResults.every((r) => r.allControlsMeet44px),
        allMarketDialogsAutoFocusCloseButton: marketResults.every(
          (r) => r.initialFocusIsCloseButton,
        ),
        allMarketDialogsTrapFocus: marketResults.every(
          (r) =>
            r.focusTrapShiftTab.insideDialog &&
            r.focusTrapForwardTab.insideDialog &&
            r.focusTrapForwardTab.wrappedToCloseButton,
        ),
        allMarketDialogsRestoreFocusOnEscape: marketResults.every(
          (r) =>
            r.escapeDismissAndRestore.dialogClosed &&
            r.escapeDismissAndRestore.focusRestoredToTrigger,
        ),
      },
      helpCenterResults: helpResults,
      marketQuickPreviewResults: marketResults,
    };

    const reportPath = path.join(OUT_DIR, "verification-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log("Verification report written to:", reportPath);
    console.log("Summary:", JSON.stringify(report.summary, null, 2));

    const allPassed = Object.values(report.summary).every((v) =>
      typeof v === "boolean" ? v : v >= 260,
    );
    if (!allPassed) {
      throw new Error("One or more browser verification checks failed!");
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
