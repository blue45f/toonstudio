#!/usr/bin/env node
/**
 * UI/UX 자동 측정 CLI.
 *
 * 라우트 × 뷰포트(모바일 390×844 · 태블릿 768×1024 · 데스크톱 1440×900)를 실제 Chromium 으로 열어
 * 접근성·반응형·시각 일관성·성능 체감·카피를 재고, 핵심 여정 6개를 실행해 100점 만점 점수를 계산한다.
 * 점수는 rubric.mjs 의 계산 결과이며 이 파일은 점수를 바꾸지 않는다.
 *
 * 산출물(artifacts/ux-audit/<UTC시각>/): report.json, screens/*.jpg, journeys/*.jpg, summary.md — 커밋하지 않는다(/artifacts/ 는 git 무시).
 * 로컬 풀스택이 필요하다: node scripts/local-fullstack/cli.mjs up  (끝나면 down)
 */
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { compareReports, scoreCells, summarize } from "./aggregate.mjs";
import { canSendCredentials, captureAuthState, isSessionAuthenticated, loadAuditCredentials } from "./auth.mjs";
import { UsageError, USAGE, buildPlan, formatPlan, parseArguments } from "./cli-args.mjs";
import { parseCustomClassNames, parseDeclaredColorTokens } from "./design-tokens.mjs";
import { runJourneys } from "./journeys.mjs";
import { measureCell } from "./measure.mjs";
import { renderRubricMarkdown, renderSummaryMarkdown } from "./render-report.mjs";
import { requiresLogin, annotateWithAuthority, loadSiteRouteAuthority, VIEWPORTS } from "./routes.mjs";
import { RUBRIC_VERSION, UNMEASURED_HUMAN_ITEMS } from "./rubric.mjs";
import { runSelfCheck } from "./self-check.mjs";
import { createSparseMissingChecker, firstLine, utcStamp, waitForMemory } from "./util.mjs";
import { redactSecrets } from "../local-fullstack/lib/guard.mjs";
import { scanForSecrets } from "../local-fullstack/lib/secret-scan.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_WEB_ORIGIN = "http://127.0.0.1:5273";
const GLOBALS_CSS = "apps/web/src/app/styles/globals.css";
const EXIT = Object.freeze({ ok: 0, failure: 1, usage: 2 });

const log = (line = "") => process.stdout.write(`${line}\n`);

function safeFileName(text) {
  return text.replace(/[^A-Za-z0-9가-힣._-]+/gu, "_");
}

function readPackageVersion(name) {
  try {
    return JSON.parse(readFileSync(join(REPOSITORY_ROOT, "node_modules", name, "package.json"), "utf8")).version ?? "";
  } catch {
    return "";
  }
}

function readGit(args) {
  const result = spawnSync("git", ["-C", REPOSITORY_ROOT, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

/** 선언된 테마 색과 직접 정의한 CSS 클래스를 저장소의 CSS 에서 읽는다(린트 규칙과 같은 정본: globals.css 의 @theme). */
function loadDesignContext() {
  const declaredColors = parseDeclaredColorTokens(readFileSync(join(REPOSITORY_ROOT, GLOBALS_CSS), "utf8"));
  const customClasses = new Set();
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".css")) for (const name of parseCustomClassNames(readFileSync(path, "utf8"))) customClasses.add(name);
    }
  };
  visit(join(REPOSITORY_ROOT, "apps/web/src"));
  return { declaredColors, customClasses };
}

async function detectServerKind(baseUrl, requested) {
  if (requested !== "auto") return requested;
  try {
    const response = await fetch(new URL("/@vite/client", baseUrl), { signal: AbortSignal.timeout(8_000) });
    const type = response.headers.get("content-type") ?? "";
    return response.ok && /javascript/u.test(type) ? "dev" : "production";
  } catch {
    return "production";
  }
}

async function checkServer(baseUrl, { expectLocalApi }) {
  const web = await fetch(new URL("/", baseUrl), { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!web?.ok) {
    throw new UsageError(`웹(${baseUrl})이 응답하지 않습니다. 먼저 'node scripts/local-fullstack/cli.mjs up' 으로 로컬 풀스택을 띄우세요.`);
  }
  if (expectLocalApi) {
    const ready = await fetch(new URL("/api/health/ready", baseUrl), { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!ready?.ok) throw new UsageError("API 준비 상태(/api/health/ready)가 정상이 아닙니다. 'node scripts/local-fullstack/cli.mjs status' 로 확인하세요.");
  }
}

async function launchBrowser() {
  const { chromium } = await import("playwright");
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH?.trim();
  const channel = process.env.PLAYWRIGHT_CHANNEL?.trim();
  try {
    return await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : channel ? { channel } : {}) });
  } catch (error) {
    throw new UsageError(`Chromium 을 실행하지 못했습니다(${firstLine(error)}). 'pnpm exec playwright install chromium' 을 실행하거나 PLAYWRIGHT_EXECUTABLE_PATH 로 설치된 실행 파일을 지정하세요.`);
  }
}

async function warmUp({ browser, baseUrl, cells, authState, viewport }) {
  const seen = new Set();
  for (const { route } of cells) {
    if (seen.has(route.id)) continue;
    seen.add(route.id);
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, ...(requiresLogin(route) && authState ? { storageState: authState } : {}) });
    try {
      const page = await context.newPage();
      await page.goto(new URL(route.path, baseUrl).href, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    } catch (error) {
      log(`  예열 실패(측정에는 영향 없음): ${route.id} — ${firstLine(error)}`);
    } finally {
      await context.close().catch(() => undefined);
    }
  }
}

function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.help) {
    log(USAGE);
    return EXIT.ok;
  }
  if (options.printRubric) {
    log(renderRubricMarkdown());
    return EXIT.ok;
  }
  if (options.compare) {
    const [first, second] = options.compare.map((path) => JSON.parse(readFileSync(resolve(path), "utf8")));
    log(JSON.stringify(compareReports(first, second), null, 2));
    return EXIT.ok;
  }
  if (options.selfCheck) {
    const { browser, executableNote } = { browser: await launchBrowser(), executableNote: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "번들" };
    try {
      log(`측정 도구 자체 점검(Chromium: ${executableNote})`);
      return (await runSelfCheck(browser, log)) ? EXIT.ok : EXIT.failure;
    } finally {
      await browser.close();
    }
  }

  const plan = buildPlan(options);
  const stamp = utcStamp();
  const outDir = resolve(options.out ?? join(REPOSITORY_ROOT, "artifacts", "ux-audit", stamp));
  if (options.dry) {
    log(formatPlan(plan, { outDir }));
    return EXIT.ok;
  }

  const credentialInfo = loadAuditCredentials();
  const baseUrl = options.baseUrl ?? credentialInfo.defaults?.webOrigin ?? DEFAULT_WEB_ORIGIN;
  const secrets = credentialInfo.secrets ?? [];
  const redact = (text) => redactSecrets(text, secrets);
  const loginAllowed = credentialInfo.ok && canSendCredentials(baseUrl);
  const localOrigin = canSendCredentials(baseUrl);
  await checkServer(baseUrl, { expectLocalApi: localOrigin });
  const serverKind = await detectServerKind(baseUrl, options.server);
  const devServer = serverKind === "dev";
  const timingTrusted = !devServer;

  const skippedRoutes = [];
  const runnableCells = plan.cells.filter((cell) => {
    if (!requiresLogin(cell.route) || loginAllowed) return true;
    skippedRoutes.push({ routeId: cell.route.id, viewportId: cell.viewport.id, reason: credentialInfo.ok ? "대상 origin 이 loopback 이 아니라 자격증명을 보내지 않음" : credentialInfo.reason });
    return false;
  });
  const needsAuthState = runnableCells.some((cell) => requiresLogin(cell.route)) || plan.journeyIds.some((id) => id !== "error-recovery" && id !== "login-logout");

  mkdirSync(outDir, { recursive: true });
  log(`측정 시작 — ${baseUrl} (${serverKind === "dev" ? "Vite 개발 서버: 시간 지표는 점수에서 제외" : "운영형 서버"})`);
  log(`결과 폴더: ${outDir}`);
  const browser = await launchBrowser();
  const designContext = loadDesignContext();
  const isSparseMissing = createSparseMissingChecker(REPOSITORY_ROOT);
  const startedAt = new Date();
  const notes = [];
  let authState = null;
  let authRefreshes = 0;
  try {
    const desktop = VIEWPORTS.find((viewport) => viewport.id === "desktop");
    if (needsAuthState && loginAllowed) {
      log("시드 테스트 계정으로 로그인(자격증명은 출력하지 않음)…");
      authState = await captureAuthState(browser, baseUrl, credentialInfo.credentials, desktop);
    }
    if (options.warmup && devServer && runnableCells.length > 0) {
      log("개발 서버 예열(첫 컴파일 비용 제거, 측정에 포함하지 않음)…");
      await warmUp({ browser, baseUrl, cells: runnableCells, authState, viewport: desktop });
    }

    const cells = [];
    const partialPath = join(outDir, "cells.partial.jsonl");
    for (const [index, planned] of runnableCells.entries()) {
      if (requiresLogin(planned.route) && authState && !(await isSessionAuthenticated(browser, baseUrl, authState))) {
        log("  로그인 상태가 풀려 다시 로그인합니다.");
        authState = await captureAuthState(browser, baseUrl, credentialInfo.credentials, desktop);
        authRefreshes += 1;
      }
      const waited = await waitForMemory({ onWait: (mb) => log(`  가용 메모리 ${mb}MB 로 부족해 다른 작업이 끝나기를 기다립니다…`) });
      if (waited > 0) notes.push(`${planned.route.id}@${planned.viewport.id} 전에 메모리 확보를 ${Math.round(waited / 1000)}초 기다림`);
      const screenshotPath = options.screenshots ? join(outDir, "screens", `${safeFileName(planned.route.id)}-${planned.viewport.id}.jpg`) : null;
      const cell = await measureCell({
        browser,
        baseUrl,
        route: planned.route,
        viewport: planned.viewport,
        storageState: requiresLogin(planned.route) ? authState : null,
        designContext,
        isSparseMissing,
        devServer,
        screenshotPath,
      });
      cells.push(cell);
      appendFileSync(partialPath, `${redact(JSON.stringify({ key: cell.key, status: cell.status, elapsedMs: cell.elapsedMs }))}\n`);
      log(`[${String(index + 1).padStart(3)}/${runnableCells.length}] ${cell.key.padEnd(30)} ${cell.status === "ok" ? "측정 완료" : `실패 — ${cell.error}`} (${Math.round(cell.elapsedMs / 100) / 10}s)`);
    }

    let journeyResults = [];
    if (plan.journeyIds.length > 0) {
      log("핵심 여정 실행…");
      journeyResults = await runJourneys(plan.journeyIds, {
        browser,
        baseUrl,
        credentials: loginAllowed ? credentialInfo.credentials : null,
        storageState: authState,
        viewport: VIEWPORTS.find((viewport) => viewport.id === "desktop"),
        outDir: join(outDir, "journeys"),
        redact,
      }, log);
    }

    const scoredCells = scoreCells(cells, { timingTrusted });
    const routesInPlan = plan.routes.filter((route) => scoredCells.some((cell) => cell.routeId === route.id));
    const summary = summarize({ scoredCells, routes: routesInPlan, viewports: plan.viewports, journeyResults, timingTrusted });
    const resolveAuthority = await loadSiteRouteAuthority(REPOSITORY_ROOT);
    const browserVersion = browser.version();
    const report = {
      schema: "toonstudio.ux-audit-report/1",
      rubricVersion: RUBRIC_VERSION,
      generatedAt: startedAt.toISOString(),
      durationSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
      git: { commit: readGit(["rev-parse", "HEAD"]), branch: readGit(["rev-parse", "--abbrev-ref", "HEAD"]) },
      environment: {
        baseUrlKind: localOrigin ? "loopback" : "remote",
        server: serverKind,
        timingTrusted,
        browser: `Chromium ${browserVersion}`,
        playwright: readPackageVersion("playwright"),
        node: process.version,
        axe: scoredCells.find((cell) => cell.a11y?.axe?.version)?.a11y.axe.version ?? "",
        authRefreshes,
        notes,
      },
      plan: {
        routes: resolveAuthority ? annotateWithAuthority(plan.routes, resolveAuthority) : plan.routes.map(({ id, path, auth }) => ({ id, path, auth })),
        viewports: plan.viewports.map(({ id, width, height }) => ({ id, width, height })),
        journeys: plan.journeyIds,
        skippedRoutes,
      },
      summary,
      cells: scoredCells,
      journeys: journeyResults,
      unmeasured: UNMEASURED_HUMAN_ITEMS,
    };
    const reportPath = join(outDir, "report.json");
    writeText(reportPath, redact(JSON.stringify(report, null, 2)));
    writeText(join(outDir, "summary.md"), redact(renderSummaryMarkdown(report)));

    const leaks = secrets.length > 0
      ? scanForSecrets({ secrets: secrets.map((value) => ({ key: "자격증명", value })), targets: [outDir] })
      : [];
    log("");
    log(`완료 — 화면 평균 ${summary.screenAverage75}/75 · 여정 ${summary.journeyScore25 ?? "미측정"}/25 · 합계 ${summary.total}/${summary.measuredMax}`);
    log(`보고서: ${reportPath}`);
    if (skippedRoutes.length > 0) log(`건너뛴 칸 ${skippedRoutes.length}개(로그인 필요): ${skippedRoutes[0].reason}`);
    if (leaks.length > 0) {
      log(`경고: 산출물에 비밀값 일치가 ${leaks.length}건 있습니다. 결과 폴더를 삭제하고 원인을 확인하세요.`);
      return EXIT.failure;
    }
    if (options.json) log(JSON.stringify(summary, null, 2));
    return EXIT.ok;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      if (error instanceof UsageError) {
        process.stderr.write(`${error.message}\n\n${USAGE}\n`);
        process.exitCode = EXIT.usage;
      } else {
        process.stderr.write(`예기치 못한 오류: ${firstLine(error, 400)}\n`);
        process.exitCode = EXIT.failure;
      }
    },
  );
}

