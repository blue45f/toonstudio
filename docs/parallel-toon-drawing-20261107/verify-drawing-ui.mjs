import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const OUT_DIR = resolve(process.cwd(), "docs/parallel-toon-drawing-20261107");
mkdirSync(OUT_DIR, { recursive: true });

const PORT = 4179;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 568, isHandheld: true, zoom: 1 },
  { name: "mobile-390", width: 390, height: 844, isHandheld: true, zoom: 1 },
  { name: "tablet-768", width: 768, height: 1024, isHandheld: true, zoom: 1 },
  { name: "pc-1440", width: 1440, height: 900, isHandheld: false, zoom: 1 },
  { name: "pc-1440-zoom-200", width: 1440, height: 900, isHandheld: false, zoom: 2 },
];

async function waitReady(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms: ${url}`);
}

async function dismissOverlays(page) {
  const quickStartDismiss = page.locator('[data-studio-quickstart-dismiss="true"]');
  if (await quickStartDismiss.isVisible({ timeout: 800 }).catch(() => false)) {
    await quickStartDismiss.click().catch(() => {});
  }
}

async function main() {
  const server = spawn(
    "npx",
    ["vite", "--config", "apps/web/vite.config.ts", "--port", String(PORT), "--host", "127.0.0.1"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_OPTIONS: "--max-old-space-size=2048",
        TOONSPECTRUM_VITE_DISABLE_OPTIMIZE_DEPS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let browser = null;
  try {
    await waitReady(`${ORIGIN}/studio/canvas`);
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "ko-KR",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ authenticated: false, user: null }),
      });
    });
    await page.addInitScript(() => {
      try {
        localStorage.setItem("toonstudio-studio-quick-start-dismissed", "1");
        localStorage.setItem("toonstudio-studio-mobile-hint-dismissed", "1");
        localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
        localStorage.setItem("toonstudio-studio-ui-density:v1", JSON.stringify({ mode: "full" }));
      } catch {}
    });

    await page.goto(`${ORIGIN}/studio/canvas?drawingShell=app&startTool=draw`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.locator("[data-studio-canvas-viewport]").waitFor({ state: "visible", timeout: 60000 });
    await dismissOverlays(page);

    const viewportReports = [];

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.evaluate((z) => {
        document.documentElement.style.zoom = z === 1 ? "" : String(z);
      }, vp.zoom);
      await page.waitForTimeout(500);

      if (vp.isHandheld) {
        await page.locator('[data-studio-mobile-editing-dock="true"]').waitFor({ state: "visible", timeout: 20000 });
        await page.waitForTimeout(300);

        const mobileDockCheck = await page.evaluate(async () => {
          const docOverflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
          const canvasEl = document.querySelector("[data-studio-canvas-viewport]");
          const canvasRect = canvasEl?.getBoundingClientRect();
          const dock = document.querySelector('[data-studio-mobile-editing-dock="true"]');
          const dockRect = dock?.getBoundingClientRect();
          const primaryRow = dock?.querySelector('[data-studio-mobile-primary-actions="true"]');
          const primaryButtons = primaryRow ? Array.from(primaryRow.querySelectorAll("button")).length : 0;

          const probeX = (canvasRect?.left ?? 0) + (canvasRect?.width ?? 0) * 0.5;
          const probeY = (canvasRect?.top ?? 0) + (canvasRect?.height ?? 0) * 0.35;
          const hitEl = document.elementFromPoint(probeX, probeY);
          const canvasWorkspaceUnoccluded = Boolean(
            canvasEl && hitEl && (!dock || !dock.contains(hitEl)),
          );

          const penBtn = dock?.querySelector('[data-studio-primary-action="draw"]');
          if (penBtn?.getAttribute("aria-pressed") !== "true") {
            penBtn?.click();
            await new Promise((r) => setTimeout(r, 100));
          }
          penBtn?.click();
          await new Promise((r) => setTimeout(r, 100));
          const drawSheet = document.querySelector("#studio-mobile-draw-settings");
          const sheetOpened = drawSheet?.getAttribute("aria-hidden") !== "true";
          drawSheet?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          await new Promise((r) => setTimeout(r, 100));
          const sheetEscapeClosedAndFocused = drawSheet?.getAttribute("aria-hidden") === "true"
            && document.activeElement === penBtn;

          const colorBtn = dock?.querySelector('button[aria-label="브러시 색상"]');
          colorBtn?.click();
          await new Promise((r) => setTimeout(r, 100));
          const colorPanel = dock?.querySelector('[data-studio-mobile-color-controls="true"]');
          const colorOpened = Boolean(colorPanel && !colorPanel.hidden);
          const colorClose = colorPanel?.querySelector("[data-studio-mobile-sheet-close]");
          colorClose?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          await new Promise((r) => setTimeout(r, 100));
          const colorEscapeClosedAndFocused = Boolean(colorPanel?.hidden) && document.activeElement === colorBtn;

          const workToggle = dock?.querySelector('[data-studio-mobile-workspace-toggle="true"]');
          workToggle?.click();
          await new Promise((r) => setTimeout(r, 100));
          const workOpened = workToggle?.getAttribute("aria-expanded") === "true";
          document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 100));
          const workOutsidePointerClosed = workToggle?.getAttribute("aria-expanded") === "false";

          return {
            docOverflowX,
            canvasWidth: Math.round(canvasRect?.width ?? 0),
            canvasHeight: Math.round(canvasRect?.height ?? 0),
            dockHeight: Math.round(dockRect?.height ?? 0),
            primarySlotCount: primaryButtons,
            canvasWorkspaceUnoccluded,
            sheetOpened,
            sheetEscapeClosedAndFocused,
            colorOpened,
            colorEscapeClosedAndFocused,
            workOpened,
            workOutsidePointerClosed,
          };
        });

        viewportReports.push({
          viewport: vp.name,
          dimensions: `${vp.width}x${vp.height}`,
          zoomPercent: vp.zoom * 100,
          mode: "handheld-dock",
          passed:
            mobileDockCheck.docOverflowX === 0
            && mobileDockCheck.canvasWidth > 0
            && mobileDockCheck.canvasHeight > 0
            && mobileDockCheck.primarySlotCount === 6
            && mobileDockCheck.canvasWorkspaceUnoccluded
            && mobileDockCheck.sheetOpened
            && mobileDockCheck.sheetEscapeClosedAndFocused
            && mobileDockCheck.colorOpened
            && mobileDockCheck.colorEscapeClosedAndFocused
            && mobileDockCheck.workOpened
            && mobileDockCheck.workOutsidePointerClosed,
          metrics: mobileDockCheck,
        });
      } else {
        await page.locator('[data-testid="drawing-appbar-advanced-toggle"]').waitFor({ state: "visible", timeout: 20000 });
        await page.waitForTimeout(300);

        const appShellCheck = await page.evaluate(async () => {
          const docOverflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
          const canvasEl = document.querySelector("[data-studio-canvas-viewport]");
          const canvasRectBefore = canvasEl?.getBoundingClientRect();
          const cx = Math.min(window.innerWidth * 0.5, (canvasRectBefore?.left ?? 0) + (canvasRectBefore?.width ?? 0) / 2);
          const cy = Math.min(window.innerHeight * 0.5, (canvasRectBefore?.top ?? 0) + (canvasRectBefore?.height ?? 0) / 2);
          const hitEl = document.elementFromPoint(cx, cy);
          const headerEl = document.querySelector("header");
          const canvasCenterUnoccluded = Boolean(canvasEl && hitEl && (!headerEl || !headerEl.contains(hitEl)));

          const advToggle = document.querySelector('[data-testid="drawing-appbar-advanced-toggle"]');
          const defaultCollapsed = advToggle?.getAttribute("aria-expanded") === "false"
            && document.querySelector("#studio-drawing-appbar-advanced-panel") === null;

          advToggle?.click();
          await new Promise((r) => setTimeout(r, 80));
          const panelOpen = document.querySelector("#studio-drawing-appbar-advanced-panel") !== null;
          const canvasRectDuring = canvasEl?.getBoundingClientRect();
          const zeroLayoutShiftOnOpen = Math.round(canvasRectBefore?.top ?? 0) === Math.round(canvasRectDuring?.top ?? 0)
            && Math.round(canvasRectBefore?.height ?? 0) === Math.round(canvasRectDuring?.height ?? 0);

          const closeBtn = document.querySelector('[data-testid="drawing-appbar-advanced-close"]');
          closeBtn?.focus();
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          await new Promise((r) => setTimeout(r, 80));
          const escapeClosedAndFocused = document.querySelector("#studio-drawing-appbar-advanced-panel") === null
            && document.activeElement === advToggle;

          advToggle?.click();
          await new Promise((r) => setTimeout(r, 80));
          canvasEl?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 80));
          const outsidePointerClosed = document.querySelector("#studio-drawing-appbar-advanced-panel") === null;

          return {
            docOverflowX,
            canvasWidth: Math.round(canvasRectBefore?.width ?? 0),
            canvasHeight: Math.round(canvasRectBefore?.height ?? 0),
            canvasCenterUnoccluded,
            defaultCollapsed,
            panelOpen,
            zeroLayoutShiftOnOpen,
            escapeClosedAndFocused,
            outsidePointerClosed,
          };
        });

        viewportReports.push({
          viewport: vp.name,
          dimensions: `${vp.width}x${vp.height}`,
          zoomPercent: vp.zoom * 100,
          mode: "desktop-appbar",
          passed:
            appShellCheck.docOverflowX === 0
            && appShellCheck.canvasWidth > 0
            && appShellCheck.canvasHeight > 0
            && appShellCheck.canvasCenterUnoccluded
            && appShellCheck.defaultCollapsed
            && appShellCheck.panelOpen
            && appShellCheck.zeroLayoutShiftOnOpen
            && appShellCheck.escapeClosedAndFocused
            && appShellCheck.outsidePointerClosed,
          metrics: appShellCheck,
        });
      }
    }

    const summary = {
      verifiedAt: new Date().toISOString(),
      allPassed: viewportReports.every((r) => r.passed),
      viewports: viewportReports,
    };

    writeFileSync(resolve(OUT_DIR, "browser-verification.json"), JSON.stringify(summary, null, 2) + "\n");
    console.log(JSON.stringify(summary, null, 2));
    await context.close();
    if (!summary.allPassed) process.exit(1);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGKILL");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
