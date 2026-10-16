/**
 * 화면 한 장(라우트×뷰포트)을 실제 Chromium 으로 열어 사실을 모으고, rubric.scoreCell 이 읽는 형식으로 정리한다.
 *
 * 흐름: 새 컨텍스트(저장소·캐시 격리) → 문서 시작 시 관찰자 설치 → 이동 → 앱의 route-stage 가 준비될 때까지 대기 →
 *       안정화 → 사실 수집 → 성능 값 읽기 → 스크린샷 1장 → axe → Tab 20회 순회.
 * 콘솔·네트워크 이벤트는 성능 값을 읽는 시점까지만 센다(이후의 axe·키보드 조작이 만드는 이벤트는 화면 결함이 아니다).
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { runAxe } from "./axe-audit.mjs";
import { analyzeCopy } from "./copy-heuristics.mjs";
import { summarizeClassUsage } from "./design-tokens.mjs";
import { auditFocus } from "./focus-audit.mjs";
import { buildPerformanceFacts } from "./measure-filters.mjs";
import { collectPageFacts } from "./page-facts.mjs";
import { installPageProbes, readPageProbes, setMeasurementPreferences, settlePage } from "./page-probes.mjs";
import { NAME_RULE_FAMILIES } from "./rubric.mjs";
import { analyzeHeadings, analyzeLandmarks, summarizeUnnamedControls } from "./structure-analysis.mjs";
import { firstLine, withTimeout } from "./util.mjs";

export const DEFAULT_MEASURE_OPTIONS = Object.freeze({
  navigationTimeoutMs: 90_000,
  readyTimeoutMs: 45_000,
  settleMs: 1_200,
  networkIdleMs: 8_000,
  factsTimeoutMs: 60_000,
  axeTimeoutMs: 90_000,
  focusPresses: 20,
});

/** 브라우저 컨텍스트 옵션. 뷰포트 외에는 모든 칸이 같아야 비교할 수 있다. */
export function contextOptions(viewport, storageState) {
  return {
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    ...(storageState ? { storageState } : {}),
  };
}

/** 이벤트 수집기를 페이지에 붙인다. 반환 객체의 배열은 이후 계속 늘어나므로 읽는 시점에 복사해 쓴다. */
export function attachEventCollectors(page) {
  const events = { console: [], responses: [], failures: [] };
  page.on("console", (message) => {
    const type = message.type();
    if (type === "error" || type === "warning") events.console.push({ type, text: message.text() });
  });
  page.on("pageerror", (error) => events.console.push({ type: "pageerror", text: firstLine(error, 300) }));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      events.responses.push({ status: response.status(), url: response.url(), method: response.request().method() });
    }
  });
  page.on("requestfailed", (request) => {
    events.failures.push({ url: request.url(), errorText: request.failure()?.errorText ?? "", method: request.method() });
  });
  return events;
}

async function waitForRouteState(page, timeoutMs) {
  try {
    await page.waitForFunction(() => Boolean(window.__uxa && window.__uxa.routeState), null, { timeout: timeoutMs, polling: 100 });
    return true;
  } catch {
    return false;
  }
}

async function runPrepare(page, baseUrl, prepare, options) {
  await page.goto(new URL(prepare.path, baseUrl).href, { waitUntil: "domcontentloaded", timeout: options.navigationTimeoutMs });
  if (prepare.waitForLinkName) {
    await page.getByRole("link", { name: prepare.waitForLinkName }).first().waitFor({ timeout: options.readyTimeoutMs });
  }
  await page.waitForTimeout(prepare.settleMs ?? 1_000);
}

function sectionOrError(facts, name, build) {
  const section = facts[name];
  if (!section || section.error) return { measured: false, error: section?.error ?? "수집 실패" };
  return { measured: true, ...build(section) };
}

/** 수집한 사실을 rubric.scoreCell 입력 형식으로 정리한다(순수 변환이라 브라우저 없이도 시험할 수 있다). */
export function buildCellFacts({ facts, axe, focus, performance, designContext }) {
  const headings = Array.isArray(facts.headings) ? analyzeHeadings(facts.headings) : { measured: false };
  const landmarks = Array.isArray(facts.landmarks) ? analyzeLandmarks(facts.landmarks) : { measured: false };
  const unnamed = axe?.measured ? summarizeUnnamedControls(axe.violations, NAME_RULE_FAMILIES) : null;

  const classUsage = facts.classes && !facts.classes.error
    ? summarizeClassUsage(facts.classes.usage, designContext)
    : null;
  const copyAnalysis = facts.copy && !facts.copy.error
    ? analyzeCopy({ texts: facts.copy.texts, attributes: facts.copy.attributes })
    : null;

  return {
    a11y: {
      axe: axe ?? { measured: false },
      unnamed,
      headings,
      landmarks,
      focus: focus?.focus ?? { measured: false },
      trap: focus?.trap ?? { measured: false },
    },
    responsive: {
      scroll: sectionOrError(facts, "layout", (layout) => ({
        overflowPx: layout.overflowPx,
        scrollWidth: layout.scrollWidth,
        clientWidth: layout.clientWidth,
        offenders: layout.offenders,
      })),
      clipped: sectionOrError(facts, "clipped", (clipped) => ({ count: clipped.count, samples: clipped.samples })),
      obscured: sectionOrError(facts, "obscured", (obscured) => ({
        count: obscured.count,
        inspected: obscured.inspected,
        samples: obscured.samples,
        temporaryCount: obscured.temporaryCount,
        temporarySamples: obscured.temporarySamples,
      })),
      tapTargets: sectionOrError(facts, "tapTargets", (tap) => ({
        total: tap.total,
        small44: tap.small44,
        small40: tap.small40,
        small24: tap.small24,
        inlineExempt: tap.inlineExempt,
        samples: tap.samples,
      })),
    },
    visual: {
      rawColorClasses: classUsage
        ? {
          measured: true,
          distinct: classUsage.raw.distinct,
          elements: classUsage.raw.elements,
          samples: classUsage.raw.samples,
          // 점수에는 넣지 않는 참고 값: 토큰 대신 OKLCH 리터럴을 클래스에 직접 쓴 경우
          oklchLiteralClasses: { distinct: classUsage.oklch.distinct, elements: classUsage.oklch.elements, samples: classUsage.oklch.samples.slice(0, 5) },
        }
        : { measured: false },
      undeclaredTokens: classUsage
        ? { measured: true, distinct: classUsage.undeclared.distinct, elements: classUsage.undeclared.elements, samples: classUsage.undeclared.samples }
        : { measured: false },
      inlineColors: sectionOrError(facts, "inlineColors", (inline) => ({ elements: inline.elements, samples: inline.samples })),
    },
    performance,
    copy: copyAnalysis && !facts.copy.error
      ? {
        measured: true,
        rawKeys: copyAnalysis.rawKeys.distinct,
        placeholderLeaks: copyAnalysis.placeholderLeaks.distinct,
        emptyButtons: facts.copy.emptyButtons,
        englishSentences: copyAnalysis.englishSentences.distinct,
        samples: {
          rawKeys: copyAnalysis.rawKeys.samples,
          placeholderLeaks: copyAnalysis.placeholderLeaks.samples,
          englishSentences: copyAnalysis.englishSentences.samples,
          emptyButtons: facts.copy.emptyButtonSamples,
        },
      }
      : { measured: false },
  };
}

/**
 * @param {object} input
 * @param {import("playwright").Browser} input.browser
 * @param {string} input.baseUrl
 * @param {{ id: string, path: string, auth: string, prepare?: object }} input.route
 * @param {{ id: string, width: number, height: number, isMobile: boolean, hasTouch: boolean }} input.viewport
 * @param {object | null} input.storageState 로그인 상태(메모리에만 있다)
 * @param {{ declaredColors: ReadonlySet<string>, customClasses: ReadonlySet<string> }} input.designContext
 * @param {(pathname: string) => boolean} input.isSparseMissing
 * @param {boolean} input.devServer
 * @param {string | null} input.screenshotPath
 * @param {Partial<typeof DEFAULT_MEASURE_OPTIONS>} [input.options]
 */
export async function measureCell(input) {
  const { browser, baseUrl, route, viewport, storageState, designContext, isSparseMissing, devServer, screenshotPath } = input;
  const options = { ...DEFAULT_MEASURE_OPTIONS, ...input.options };
  const startedAt = Date.now();
  const context = await browser.newContext(contextOptions(viewport, storageState));
  const cell = {
    key: `${route.id}@${viewport.id}`,
    routeId: route.id,
    viewportId: viewport.id,
    path: route.path,
    auth: route.auth,
    status: "ok",
    notes: [],
  };
  try {
    await context.addInitScript(setMeasurementPreferences);
    await context.addInitScript(installPageProbes);
    const page = await context.newPage();
    const events = attachEventCollectors(page);

    if (route.prepare) await runPrepare(page, baseUrl, route.prepare, options);
    events.console.length = 0;
    events.responses.length = 0;
    events.failures.length = 0;

    await page.goto(new URL(route.path, baseUrl).href, { waitUntil: "domcontentloaded", timeout: options.navigationTimeoutMs });
    const reached = await waitForRouteState(page, options.readyTimeoutMs);
    if (!reached) cell.notes.push(`route-stage 가 ${options.readyTimeoutMs}ms 안에 pending 을 벗어나지 않음`);
    await page.waitForLoadState("networkidle", { timeout: options.networkIdleMs }).catch(() => cell.notes.push("networkidle 대기 시간 초과(계속 측정)"));
    await page.waitForTimeout(options.settleMs);
    await withTimeout(page.evaluate(settlePage), 20_000, "화면 안정화").catch((error) => cell.notes.push(firstLine(error)));

    const size = { width: viewport.width, height: viewport.height };
    const facts = await withTimeout(page.evaluate(collectPageFacts, size), options.factsTimeoutMs, "사실 수집");
    const probes = await page.evaluate(readPageProbes);
    const snapshot = {
      console: [...events.console],
      responses: [...events.responses],
      failures: [...events.failures],
    };
    cell.finalUrl = facts.meta?.url ?? route.path;
    cell.title = facts.meta?.title ?? "";
    cell.domNodes = facts.meta?.domNodes ?? null;

    const performance = buildPerformanceFacts(
      {
        ...snapshot,
        metrics: probes
          ? { cls: probes.cls, lcpMs: probes.lcpMs, interactiveMs: probes.routeReadyMs, longTaskMs: probes.longTaskMs }
          : null,
        routeState: probes?.routeState ?? probes?.routeStateLatest ?? "pending",
      },
      { origin: new URL(baseUrl).origin, devServer, isSparseMissing },
    );

    if (screenshotPath) {
      mkdirSync(dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, type: "jpeg", quality: 60 }).catch((error) => cell.notes.push(`스크린샷 실패: ${firstLine(error)}`));
      cell.screenshot = screenshotPath;
    }

    let axe = null;
    try {
      axe = await runAxe(page, { timeoutMs: options.axeTimeoutMs });
    } catch (error) {
      axe = { measured: false, error: firstLine(error), violations: [] };
      cell.notes.push(`axe 실패: ${firstLine(error)}`);
    }

    let focus = null;
    try {
      focus = await auditFocus(page, { presses: options.focusPresses, viewport: size });
    } catch (error) {
      cell.notes.push(`포커스 순회 실패: ${firstLine(error)}`);
    }

    Object.assign(cell, buildCellFacts({ facts, axe, focus, performance, designContext }));
  } catch (error) {
    cell.status = "failed";
    cell.error = firstLine(error);
  } finally {
    await context.close().catch(() => undefined);
  }
  cell.elapsedMs = Date.now() - startedAt;
  return cell;
}
