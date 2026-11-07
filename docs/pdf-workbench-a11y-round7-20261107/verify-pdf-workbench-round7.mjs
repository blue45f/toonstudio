import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const REPO_ROOT = process.cwd();
const OUT_DIR = path.join(REPO_ROOT, "docs/pdf-workbench-a11y-round7-20261107");
const PORT = Number(process.env.ROUND7_PDF_A11Y_PORT || 4193);
const BASE_URL = process.env.ROUND7_PDF_A11Y_BASE_URL || `http://127.0.0.1:${PORT}`;

const modeArg = process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1] || "after";

const VIEWPORTS = [
  { id: "mobile-320", width: 320, height: 844, isMobile: true, zoom: 1 },
  { id: "mobile-390", width: 390, height: 844, isMobile: true, zoom: 1 },
  { id: "tablet-768", width: 768, height: 1024, isMobile: false, zoom: 1 },
  { id: "pc-1440", width: 1440, height: 900, isMobile: false, zoom: 1 },
  { id: "pc-1440-zoom-200", width: 1440, height: 900, isMobile: false, zoom: 2 },
];

function resolveChromiumExecutable() {
  for (const c of [
    process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].filter(Boolean)) {
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

async function createSyntheticTwoPagePdfBuffer() {
  const pdfLibPath = require.resolve("pdf-lib", { paths: [path.join(REPO_ROOT, "apps/web")] });
  const { PDFDocument } = require(pdfLibPath);
  const doc = await PDFDocument.create();
  doc
    .addPage([420, 595])
    .drawText("ToonStudio Round 7 PDF Workbench Page 1", { x: 36, y: 520, size: 14 });
  doc
    .addPage([420, 595])
    .drawText("ToonStudio Round 7 PDF Workbench Page 2", { x: 36, y: 520, size: 14 });
  return Buffer.from(await doc.save());
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const server = await ensureViteServer(BASE_URL, PORT);
  const pdfBuffer = await createSyntheticTwoPagePdfBuffer();
  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumExecutable(),
  });

  try {
    const viewportResults = [];

    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        reducedMotion: "reduce",
        locale: "ko-KR",
      });
      await ctx.addInitScript(() => {
        try {
          window.localStorage.setItem("webtoon.onboarding.seen", "1");
          window.localStorage.setItem("toonstudio-locale", "ko");
        } catch {
          // ignore
        }
      });

      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE_URL}/studio/pdf-workbench`, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await page.waitForSelector("[data-testid='pdf-workbench-rea-status']", {
          timeout: 30_000,
        });

        if (vp.zoom !== 1) {
          await page.evaluate((z) => {
            document.documentElement.style.zoom = String(z);
          }, vp.zoom);
          await page.waitForTimeout(80);
        }

        // Upload synthetic 2-page PDF so source chips & page cards are rendered
        await page.locator("input[type='file']").setInputFiles({
          name: "synthetic-a11y-sample.pdf",
          mimeType: "application/pdf",
          buffer: pdfBuffer,
        });
        await page.waitForSelector("ul[aria-label='추가된 파일'] button", { timeout: 15_000 });
        await page.waitForSelector("section[aria-label='페이지 목록'] li button", {
          timeout: 15_000,
        });
        await page.waitForTimeout(100);

        const metrics = await page.evaluate((zoom) => {
          const measureRect = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
              width: Math.round(r.width / zoom),
              height: Math.round(r.height / zoom),
              hasFocusVisibleClass:
                typeof el.className === "string" && el.className.includes("focus-visible:"),
            };
          };

          const docEl = document.documentElement;
          const horizontalOverflowPx = Math.max(
            0,
            Math.round(docEl.scrollWidth - window.innerWidth),
          );

          const trimBtns = Array.from(document.querySelectorAll("[data-testid^='pdf-rea-trim-']"));
          const inkBtns = Array.from(document.querySelectorAll("[data-testid^='pdf-rea-ink-']"));
          const firstTrimBtn = trimBtns[0];
          const firstInkBtn = inkBtns[0];

          const trimGroupRole = firstTrimBtn?.parentElement?.getAttribute("role") ?? null;
          const trimGroupAriaLabel =
            firstTrimBtn?.parentElement?.getAttribute("aria-label") ?? null;
          const inkGroupRole = firstInkBtn?.parentElement?.getAttribute("role") ?? null;
          const inkGroupAriaLabel = firstInkBtn?.parentElement?.getAttribute("aria-label") ?? null;

          const trimButtonMetrics = trimBtns.map((btn) => ({
            testId: btn.getAttribute("data-testid"),
            ...measureRect(btn),
          }));
          const inkButtonMetrics = inkBtns.map((btn) => ({
            testId: btn.getAttribute("data-testid"),
            ...measureRect(btn),
          }));

          const removeSourceBtn = document.querySelector(
            "ul[aria-label='추가된 파일'] button[aria-label*='빼기']",
          );
          const clearAllBtn = Array.from(
            document.querySelectorAll("ul[aria-label='추가된 파일'] button"),
          ).find((b) => !b.getAttribute("aria-label")?.includes("빼기"));

          const pageActionBtns = Array.from(
            document.querySelectorAll("section[aria-label='페이지 목록'] li button"),
          );
          const pageActionMetrics = pageActionBtns.map((btn) => ({
            ariaLabel: btn.getAttribute("aria-label") || "",
            ...measureRect(btn),
          }));

          const allPresetsMeet44 = [...trimButtonMetrics, ...inkButtonMetrics].every(
            (m) => m.width >= 44 && m.height >= 44 && m.hasFocusVisibleClass,
          );
          const removeSourceRect = measureRect(removeSourceBtn);
          const clearAllRect = measureRect(clearAllBtn);
          const removeSourceMeets44 = Boolean(
            removeSourceRect &&
              removeSourceRect.width >= 44 &&
              removeSourceRect.height >= 44 &&
              removeSourceRect.hasFocusVisibleClass,
          );
          const allPageActionsMeet44 =
            pageActionMetrics.length === 8 &&
            pageActionMetrics.every(
              (m) => m.width >= 44 && m.height >= 44 && m.hasFocusVisibleClass,
            );

          return {
            horizontalOverflowPx,
            trimGroupRole,
            trimGroupAriaLabel,
            inkGroupRole,
            inkGroupAriaLabel,
            allPresetsMeet44,
            trimButtonMetrics,
            inkButtonMetrics,
            removeSourceButtonSize: removeSourceRect,
            clearAllButtonSize: clearAllRect,
            removeSourceMeets44,
            allPageActionsMeet44,
            pageActionMetrics,
          };
        }, vp.zoom);

        const axe = await new AxeBuilder({ page })
          .include("[data-testid='pdf-workbench-rea-cmyk-bleed-bar']")
          .include("section[aria-label='PDF 추가']")
          .include("section[aria-label='페이지 목록']")
          .include("section[aria-label='문서 속성']")
          .include("section[aria-label='내려받기']")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();

        viewportResults.push({
          viewportId: vp.id,
          width: vp.width,
          height: vp.height,
          zoom: vp.zoom,
          ...metrics,
          axeViolationCount: axe.violations.length,
          axeViolationIds: axe.violations.map((v) => v.id),
        });
      } finally {
        await page.close();
        await ctx.close();
      }
    }

    // Keyboard & PDF action semantics verification at 1440x900
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
      locale: "ko-KR",
    });
    await ctx.addInitScript(() => {
      try {
        window.localStorage.setItem("webtoon.onboarding.seen", "1");
        window.localStorage.setItem("toonstudio-locale", "ko");
      } catch {
        // ignore
      }
    });
    const page = await ctx.newPage();
    let keyboardAndWorkflowResult;
    try {
      await page.goto(`${BASE_URL}/studio/pdf-workbench`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForSelector("[data-testid='pdf-workbench-rea-status']", { timeout: 30_000 });

      await page.locator("input[type='file']").setInputFiles({
        name: "synthetic-a11y-sample.pdf",
        mimeType: "application/pdf",
        buffer: pdfBuffer,
      });
      await page.waitForSelector("section[aria-label='페이지 목록'] li button", {
        timeout: 15_000,
      });

      // Focus A5 preset button and activate with Space/Enter via keyboard
      const a5Btn = page.locator("[data-testid='pdf-rea-trim-a5-tankobon-spread']");
      await a5Btn.focus();
      await page.keyboard.press("Enter");
      const a5Pressed = await a5Btn.getAttribute("aria-pressed");

      // Rotate page 1 via keyboard
      const rotatePage1Btn = page
        .locator("section[aria-label='페이지 목록'] button[aria-label*='시계 방향으로 회전']")
        .first();
      await rotatePage1Btn.focus();
      await page.keyboard.press("Enter");
      const firstCardTextAfterRotate = await page
        .locator("section[aria-label='페이지 목록'] li")
        .first()
        .textContent();

      // Move page 2 earlier via keyboard
      const movePage2EarlierBtn = page.locator(
        "section[aria-label='페이지 목록'] button[aria-label='2번째 페이지를 앞으로']",
      );
      await movePage2EarlierBtn.focus();
      await page.keyboard.press("Enter");
      const firstCardTextAfterMove = await page
        .locator("section[aria-label='페이지 목록'] li")
        .first()
        .textContent();

      // Remove page 1 from list via keyboard
      const removePage1Btn = page
        .locator("section[aria-label='페이지 목록'] button[aria-label*='목록에서 제거']")
        .first();
      await removePage1Btn.focus();
      await page.keyboard.press("Enter");
      const remainingPageCount = await page
        .locator("section[aria-label='페이지 목록'] li")
        .count();

      // Remove source file via keyboard
      const removeSourceBtn = page.locator("ul[aria-label='추가된 파일'] button[aria-label*='빼기']");
      await removeSourceBtn.focus();
      await page.keyboard.press("Enter");
      const statusTextAfterRemoveSource = await page
        .locator("p[role='status']")
        .filter({ hasText: "워크벤치에서 뺐어요" })
        .textContent();

      keyboardAndWorkflowResult = {
        a5PressedAfterKeyboardEnter: a5Pressed === "true",
        pageRotated90Deg: Boolean(firstCardTextAfterRotate?.includes("90°")),
        pageReorderedToOriginalPage2First: Boolean(
          firstCardTextAfterMove?.includes("원본 2페이지"),
        ),
        remainingPageCountAfterRemovePage: remainingPageCount,
        sourceRemovedCleanly: Boolean(statusTextAfterRemoveSource?.includes("워크벤치에서 뺐어요")),
      };
    } finally {
      await page.close();
      await ctx.close();
    }

    const summary = {
      mode: modeArg,
      allZeroHorizontalOverflow: viewportResults.every((r) => r.horizontalOverflowPx === 0),
      allHavePresetGroupRolesAndLabels: viewportResults.every(
        (r) =>
          r.trimGroupRole === "group" &&
          Boolean(r.trimGroupAriaLabel) &&
          r.inkGroupRole === "group" &&
          Boolean(r.inkGroupAriaLabel),
      ),
      allPresetsMeet44pxAndFocusVisible: viewportResults.every((r) => r.allPresetsMeet44),
      allRemoveSourceButtonsMeet44pxAndFocusVisible: viewportResults.every(
        (r) => r.removeSourceMeets44,
      ),
      allPageActionButtonsMeet44pxAndFocusVisible: viewportResults.every(
        (r) => r.allPageActionsMeet44,
      ),
      allZeroAxeViolations: viewportResults.every((r) => r.axeViolationCount === 0),
      keyboardAndPdfSemanticsPreserved:
        keyboardAndWorkflowResult.a5PressedAfterKeyboardEnter &&
        keyboardAndWorkflowResult.pageRotated90Deg &&
        keyboardAndWorkflowResult.pageReorderedToOriginalPage2First &&
        keyboardAndWorkflowResult.remainingPageCountAfterRemovePage === 1 &&
        keyboardAndWorkflowResult.sourceRemovedCleanly,
    };

    const report = {
      verifiedAt: new Date().toISOString(),
      gapId: "GAP-R6-02",
      route: "/studio/pdf-workbench",
      component: "apps/web/src/domains/creator/pdf-workbench/PdfWorkbenchPage.tsx",
      mode: modeArg,
      summary,
      keyboardAndWorkflowResult,
      viewportResults,
    };

    const outFileName = modeArg === "before" ? "before-report.json" : "verification-report.json";
    const outPath = path.join(OUT_DIR, outFileName);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log(`Report (${modeArg}) written to:`, outPath);
    console.log("Summary:", JSON.stringify(summary, null, 2));

    if (modeArg === "after") {
      const allPassed = Object.entries(summary)
        .filter(([k]) => k !== "mode")
        .every(([, v]) => v === true);
      if (!allPassed) {
        throw new Error("One or more GAP-R6-02 assertions failed in after mode!");
      }
    }
  } finally {
    await browser.close().catch(() => {});
    await server.stop();
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
