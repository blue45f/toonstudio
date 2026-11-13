/** Production UI recovery fixtures. No live account or manuscript is read or mutated. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium, type Browser } from "playwright";

import { DIST_DIR } from "./lib/repo-paths.mjs";
import { findFreePort, spawnVitePreview, stopChildProcess, waitForServer } from "./lib/studio-verify-preview-harness.mjs";

const OUTPUT = process.env.TOONSPECTRUM_VERIFY_DIR ?? join(tmpdir(), "studio-source-hydration");
const WORK_ID = "83000000-0000-4000-8000-000000000001";
const TITLE = "Manuscript recovery fixture";
const CASES = ["auth-pending", "transient-503", "manual-retry", "forbidden", "malformed", "optional-chunk", "guest-public"] as const;
const AUTH_PENDING_HOLD_MS = Number(process.env.TOONSPECTRUM_AUTH_PENDING_HOLD_MS ?? "400");
assert.ok(Number.isSafeInteger(AUTH_PENDING_HOLD_MS) && AUTH_PENDING_HOLD_MS >= 400 && AUTH_PENDING_HOLD_MS <= 4_000,
  "합성 인증 대기는 400~4000ms여야 합니다. 세션 요청의 5초 상한은 늘리지 않습니다.");
type RecoveryCase = typeof CASES[number];
interface RequestStack {
  readonly callFrames: readonly { readonly functionName: string; readonly url: string; readonly lineNumber: number; readonly columnNumber: number }[];
  readonly parent?: RequestStack;
}
function safeRequestStack(stack: RequestStack | undefined, depth = 0): unknown {
  if (!stack || depth > 3) return null;
  return {
    frames: stack.callFrames.slice(0, 16).map((frame) => ({
      functionName: frame.functionName, path: URL.canParse(frame.url) ? new URL(frame.url).pathname : "",
      line: frame.lineNumber + 1, column: frame.columnNumber + 1,
    })),
    parent: safeRequestStack(stack.parent, depth + 1),
  };
}
const delay = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

function sourceFixture() {
  return {
    workId: WORK_ID, role: "owner", status: "active", capabilities: { view: true, edit: true },
    revision: 1, crdtServerSequence: "0", updatedAt: "2026-09-12T00:00:00.000Z",
    document: {
      titleId: null, title: TITLE, description: "", cover: "", tags: [],
      format: "cuttoon", pages: [], status: "draft", seriesId: null,
      episodeNo: null, challengeId: null, remixFromId: null,
      doc: { width: 720, pagesList: [{
        id: "source-page", elements: [], bg: "#ffffff", bgGrad: null, canvasH: 1080,
      }], currentPageId: "source-page" },
    },
  };
}

async function verifyCase(browser: Browser, origin: string, scenario: RecoveryCase) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  let sourceRequests = 0;
  let publicRequests = 0;
  let plannerRequests = 0;
  let navigations = 0;
  let mutations = 0;
  let recover = false;
  let authRouteStartedAt: number | null = null;
  let releaseAuth!: () => void;
  const authGate = new Promise<void>((resolve) => { releaseAuth = resolve; });
  const pageErrors: string[] = [];
  const startedAt = Date.now();
  const requestTrace: Record<string, unknown>[] = [];
  const trace = (event: string, detail: Record<string, unknown> = {}) => requestTrace.push({ event, elapsedMs: Date.now() - startedAt, ...detail });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations += 1;
    if (request.url().includes(`/api/creator/works/${WORK_ID}`)
      && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) mutations += 1;
  });
  try {
    // 합성 fixture의 허용 경로만 기록한다. 쿠키·헤더·본문과 사용자 데이터는 수집하지 않는다.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Debugger.enable");
    await cdp.send("Debugger.setAsyncCallStackDepth", { maxDepth: 16 });
    cdp.on("Network.requestWillBeSent", ({ request, initiator }: {
      request: { url: string; method: string }; initiator: { type: string; stack?: RequestStack };
    }) => {
      const path = new URL(request.url).pathname;
      if (path !== "/api/auth/session" && !path.startsWith(`/api/creator/works/${WORK_ID}`)) return;
      trace("browser-request", { path, method: request.method, initiatorType: initiator.type, stack: safeRequestStack(initiator.stack) });
    });
    await page.route("**/api/auth/session", async (route) => {
      authRouteStartedAt ??= Date.now();
      trace("auth-route-start");
      if (scenario === "auth-pending") await authGate;
      trace("auth-route-released");
      await route.fulfill({ json: scenario === "guest-public" ? { authenticated: false, user: null } : {
        authenticated: true,
        user: { id: "source-owner", name: "Source owner", email: "source@example.test", image: null, role: "creator" },
      } });
    });
    await page.route(`**/api/creator/works/${WORK_ID}`, async (route) => {
      trace("public-route");
      publicRequests += 1;
      if (scenario === "guest-public") {
        await route.fulfill({ json: {
          ...sourceFixture().document, id: WORK_ID, status: "published", revision: 1, isOwner: false,
          author: { id: "public-author", name: "Public author", avatar: "" },
          likes: 0, comments: 0, views: 0, liked: false, createdAt: "2026-09-12T00:00:00.000Z",
        } });
        return;
      }
      await route.fulfill({ status: 404, json: { message: "Private draft is not public" } });
    });
    await page.route(`**/api/creator/works/${WORK_ID}/team/document`, async (route) => {
      trace("private-source-route");
      sourceRequests += 1;
      if ((scenario === "transient-503" && sourceRequests === 1)
        || (scenario === "manual-retry" && !recover)) {
        await route.fulfill({ status: 503, json: { message: "Temporary manuscript read failure" } });
      } else if (scenario === "forbidden") {
        await route.fulfill({ status: 403, json: { message: "This draft is not accessible" } });
      } else if (scenario === "malformed") {
        await route.fulfill({ json: { ...sourceFixture(), document: {} } });
      } else {
        await route.fulfill({ json: sourceFixture() });
      }
    });
    if (scenario === "optional-chunk") {
      await page.route(/\/assets\/studio-release-schedule-[A-Za-z0-9_-]+\.js(?:\?.*)?$/u, async (route) => {
        plannerRequests += 1;
        await route.abort("failed");
      });
    }
    await page.goto(`${origin}studio?id=${WORK_ID}`, { waitUntil: "commit", timeout: 60_000 });
    if (scenario === "auth-pending") {
      await page.getByText("원고를 안전하게 불러오는 중", { exact: true }).waitFor({ timeout: 60_000 });
      await delay(400);
      assert.equal(publicRequests, 0, "unresolved authentication was treated as anonymous");
      assert.equal(sourceRequests, 0, "private source fetched before authentication settled");
      trace("auth-pending-assertions-passed");
      if (AUTH_PENDING_HOLD_MS > 400) {
        assert.ok(authRouteStartedAt !== null);
        await delay(Math.max(0, AUTH_PENDING_HOLD_MS - (Date.now() - authRouteStartedAt)));
        trace("slow-auth-boundary", { minimumPendingMs: AUTH_PENDING_HOLD_MS });
        assert.equal(publicRequests, 0, "unresolved authentication crossed the public UI deadline and probed a private draft");
        assert.equal(sourceRequests, 0, "private source fetched before slow authentication settled");
      }
      releaseAuth();
    }
    if (["manual-retry", "forbidden", "malformed"].includes(scenario)) {
      await page.getByText("원고를 열지 못했어요", { exact: true }).waitFor({ timeout: 60_000 });
      assert.equal(await page.getByText(/빈 캔버스로 덮어쓰지 않도록/u).isVisible(), true);
      assert.equal(await page.getByRole("heading", { name: TITLE, exact: true }).count(), 0);
      assert.equal(sourceRequests, scenario === "manual-retry" ? 3 : 1);
      assert.equal(mutations, 0, "failed source hydration tried to save a blank manuscript");
      await page.screenshot({ path: join(OUTPUT, `${scenario}-locked.png`) });
      if (scenario === "manual-retry") {
        await page.evaluate(() => { (window as unknown as Record<string, unknown>).__sourceRetrySentinel = "same-document"; });
        recover = true;
        await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
      } else {
        await delay(1_700);
        assert.equal(sourceRequests, 1, "permanent or schema failure was automatically retried");
        assert.equal(await page.getByText("원고를 열지 못했어요", { exact: true }).isVisible(), true);
      }
    }
    if (scenario !== "forbidden" && scenario !== "malformed") {
      await page.getByRole("heading", { name: TITLE, exact: true }).waitFor({ timeout: 60_000 });
      assert.equal(await page.getByText("원고를 열지 못했어요", { exact: true }).count(), 0);
      await page.keyboard.press("b");
      await page.keyboard.press("v");
      trace("tool-shortcuts-complete");
      await delay(500);
      if (scenario === "guest-public") assert.equal(sourceRequests, 0, "confirmed guest requested the private manuscript source");
      else assert.equal(sourceRequests, scenario === "manual-retry" ? 4 : scenario === "transient-503" ? 2 : 1);
      assert.equal(await page.getByRole("heading", { name: TITLE, exact: true }).isVisible(), true);
    }
    if (scenario === "manual-retry") {
      assert.equal(await page.evaluate(() => (window as unknown as Record<string, unknown>).__sourceRetrySentinel), "same-document");
    }
    assert.equal(navigations, 1, "retry navigated or reloaded the document");
    if (scenario === "guest-public") assert.equal(publicRequests, 1, "confirmed guest did not open the published manuscript");
    else assert.equal(publicRequests, 0, "authenticated private draft probed the public API");
    assert.equal(plannerRequests, 0, "an empty optional schedule requested its unavailable chunk");
    assert.equal(mutations, 0, "source-only fixture mutated a manuscript");
    assert.deepEqual(pageErrors, [], "uncaught browser errors");
    await page.screenshot({ path: join(OUTPUT, `${scenario}-result.png`) });
    return { scenario, sourceRequests, publicRequests, plannerRequests, navigations, mutations, requestTrace, passed: true };
  } catch (error) {
    await page.screenshot({ path: join(OUTPUT, `${scenario}-failed.png`) }).catch(() => undefined);
    writeFileSync(join(OUTPUT, `${scenario}-failed.json`), JSON.stringify({
      scenario, sourceRequests, publicRequests, plannerRequests, navigations, mutations, pageErrors, requestTrace,
      error: error instanceof Error ? error.stack : String(error),
    }, null, 2));
    throw error;
  } finally {
    releaseAuth();
    await context.close();
  }
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT, { recursive: true });
  const externalOrigin = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim();
  if (!externalOrigin) assert.ok(existsSync(join(DIST_DIR, "index.html")), "Build production assets first");
  const port = externalOrigin ? null : await findFreePort();
  const origin = externalOrigin ? `${externalOrigin.replace(/\/+$/u, "")}/` : `http://127.0.0.1:${port}/`;
  const server = port === null ? null : spawnVitePreview({ port, runner: "node-vite-bin", logPath: join(OUTPUT, "preview.log") });
  let browser: Browser | null = null;
  const results = [];
  try {
    await waitForServer(origin);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    for (const scenario of CASES) {
      results.push(await verifyCase(browser, origin, scenario));
      console.log(`SOURCE RECOVERY PASS: ${scenario}`);
    }
  } finally {
    writeFileSync(join(OUTPUT, "source-hydration-report.json"), JSON.stringify({
      results, passed: results.length === CASES.length, authPendingHoldMs: AUTH_PENDING_HOLD_MS,
      scope: "Production Chromium UI with synthetic network fixtures; not live account/database validation.",
    }, null, 2));
    if (browser) await browser.close();
    if (server) await stopChildProcess(server);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
