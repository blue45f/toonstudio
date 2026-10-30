import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

import {
  auditReadinessFindings,
  classifyAuditRouteCoverage,
  declaredArrayIds,
  declaredStringArrayValues,
  expandAuditRoutePattern,
  inspectAuditPositionedOverflow,
  inspectAuditRouteReadiness,
  persistAuditObservation,
  waitForAuditRouteReadiness,
} from "./sitewide-visual-ux-audit.mjs";

function documentFor(html) {
  const dom = new JSDOM(html, { url: "http://localhost/learn" });
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 320, height: 40 });
  return dom.window.document;
}

function rectAt(left, width) {
  return { left, right: left + width, top: 100, bottom: 140, width, height: 40 };
}

function positionedOverflowDocument(position = "sticky", overflowX = "auto") {
  const root = documentFor(`<section id="scroll-region" role="region" aria-label="비교 표" tabindex="0" style="overflow-x:${overflowX};overflow-y:${overflowX}"><table><thead id="subject" style="position:${position}"><tr><th>분류</th><th>내용</th></tr></thead></table></section>`);
  Object.defineProperty(root.defaultView, "innerWidth", { value: 390, configurable: true });
  Object.defineProperty(root.documentElement, "scrollWidth", { value: 390, configurable: true });
  const region = root.getElementById("scroll-region");
  region.getBoundingClientRect = () => rectAt(37, 316);
  Object.defineProperties(region, {
    clientLeft: { value: 1, configurable: true },
    clientWidth: { value: 314, configurable: true },
    offsetWidth: { value: 316, configurable: true },
    scrollWidth: { value: 483, configurable: true },
  });
  const subject = root.getElementById("subject");
  subject.getBoundingClientRect = () => rectAt(38, 482.53);
  return { root, region, subject };
}

test("390px 화면의 내부 가로 스크롤 표는 sticky 원본 폭이 넓어도 실제 clip 범위로 판정한다", () => {
  const { root, region, subject } = positionedOverflowDocument();
  assert.equal(root.documentElement.scrollWidth, 390);
  assert.equal(region.scrollWidth, 483);
  assert.deepEqual(inspectAuditPositionedOverflow(root), []);
  region.scrollLeft = 164;
  subject.getBoundingClientRect = () => rectAt(38 - region.scrollLeft, 482.53);
  assert.deepEqual(inspectAuditPositionedOverflow(root), []);
});

test("clip되지 않은 sticky 넘침은 문서 루트가 overflow를 숨겨도 계속 실패한다", () => {
  const { root } = positionedOverflowDocument("sticky", "visible");
  root.body.style.overflowX = "hidden";
  const findings = inspectAuditPositionedOverflow(root);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].position, "sticky");
  assert.equal(findings[0].right, 521);
  assert.equal(findings[0].layoutRight, 521);
});

test("viewport-fixed 요소는 일반 overflow 조상 안에 있어도 원본 viewport 넘침을 보고한다", () => {
  const { root } = positionedOverflowDocument("fixed");
  const findings = inspectAuditPositionedOverflow(root);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].position, "fixed");
  assert.equal(findings[0].right, 521);
});

test("clip 조상 자체가 viewport 밖으로 나가면 sticky도 통과시키지 않는다", () => {
  const { root, region } = positionedOverflowDocument();
  region.getBoundingClientRect = () => rectAt(37, 410);
  Object.defineProperties(region, {
    clientWidth: { value: 408 },
    offsetWidth: { value: 410 },
  });
  const findings = inspectAuditPositionedOverflow(root);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].right, 446);
  assert.equal(findings[0].layoutRight, 521);
});

test("viewport에 고정된 중간 컨테이너 밖의 overflow 조상은 sticky를 숨기는 근거로 쓰지 않는다", () => {
  const { root, subject } = positionedOverflowDocument();
  const fixedContainer = root.createElement("div");
  fixedContainer.style.position = "fixed";
  fixedContainer.getBoundingClientRect = () => rectAt(100, 100);
  subject.parentElement.before(fixedContainer);
  fixedContainer.append(subject.parentElement);
  const findings = inspectAuditPositionedOverflow(root);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].tag, "thead");
  assert.equal(findings[0].right, 521);
});

test("애니메이션이 끝나고 ready가 남아 있어도 visible 로딩 fallback은 통과하지 않는다", () => {
  const root = documentFor('<div class="route-stage route-stage--settled" data-route-state="ready"><h1>학습</h1><div data-route-loading-fallback><div class="skeleton">준비 중</div></div></div>');
  const result = inspectAuditRouteReadiness(root);
  assert.equal(result.outcome, "fallback");
  assert.equal(result.loadingFallbacks, 1);
  assert.deepEqual(auditReadinessFindings(result, "/learn").issues, ["route-content-fallback"]);
});

test("pending marker·stalled recovery·skeleton만 있는 화면을 구분한다", () => {
  const cases = [
    ['data-route-state="ready"', '<section data-route-pending><h1>준비 중</h1></section>', "pending"],
    ['data-route-state="stalled"', '<section data-route-recovery><h1>다시 시도</h1></section>', "stalled"],
    ['data-route-state="ready"', '<h1 data-route-semantic-heading>학습</h1><div class="skeleton"></div>', "skeleton"],
    ['data-route-state="ready"', '', "empty"],
  ];
  for (const [attributes, content, expected] of cases) {
    const root = documentFor(`<div class="route-stage" ${attributes}>${content}</div>`);
    assert.equal(inspectAuditRouteReadiness(root).outcome, expected);
  }
});

test("정상 콘텐츠 안의 작은 skeleton과 숨겨진 fallback은 전체 로딩으로 오인하지 않는다", () => {
  const root = documentFor('<div class="route-stage" data-route-state="ready"><h1>학습</h1><a href="/learn/trace">시작</a><div class="skeleton"></div><div hidden><div data-route-loading-fallback></div></div></div>');
  assert.equal(inspectAuditRouteReadiness(root).outcome, "ready");
});

test("권한 거절·부분 장애는 오류·로딩 실패와 별도 상태로 보고한다", () => {
  for (const state of ["blocked", "degraded", "error"]) {
    const root = documentFor(`<div class="route-stage" data-route-state="${state}"><h1>안내</h1></div>`);
    const result = inspectAuditRouteReadiness(root);
    assert.equal(result.outcome, state);
    const findings = auditReadinessFindings(result, "/learn");
    assert.equal(findings.issues.length, state === "error" ? 1 : 0);
    assert.equal(findings.warnings.length, state === "error" ? 0 : 1);
  }
});

test("기존 콘텐츠가 ready여도 개발 서버 오류 overlay가 가리면 실패로 보고한다", () => {
  const root = documentFor('<div class="route-stage" data-route-state="ready"><h1>마켓</h1></div><vite-error-overlay></vite-error-overlay>');
  const result = inspectAuditRouteReadiness(root);
  assert.equal(result.outcome, "error");
  assert.equal(result.developmentErrorOverlay, true);
  assert.deepEqual(auditReadinessFindings(result, "/learn").issues, ["route-content-error"]);
});

test("SPA 리다이렉트와 준비 시간 초과를 결과에 남긴다", () => {
  const findings = auditReadinessFindings({ outcome: "pending", timedOut: true, pathname: "/auth/login" }, "/learn");
  assert.deepEqual(findings.issues, ["route-readiness-timeout", "route-content-pending"]);
  assert.deepEqual(findings.warnings, ["route-redirect:/auth/login", "route-auth-gate"]);
});

test("stage 상태 갱신 전에도 본문의 명시적인 권한·장애 marker를 ready로 세지 않는다", () => {
  for (const state of ["blocked", "degraded", "error"]) {
    const root = documentFor(`<div class="route-stage" data-route-state="ready"><section data-route-${state}><h1>안내</h1></section></div>`);
    assert.equal(inspectAuditRouteReadiness(root).outcome, state);
  }
  const root = documentFor('<div class="route-stage" data-route-state="ready"><h1>콘텐츠</h1><section data-route-blocked hidden>숨긴 권한 안내</section></div>');
  assert.equal(inspectAuditRouteReadiness(root).outcome, "ready");
});

test("진입 장식만 있는 화면은 실제 본문이 준비된 것으로 세지 않는다", () => {
  const root = documentFor('<div class="route-stage" data-route-state="ready"><div data-route-chrome><h1>소개</h1><button>시작</button></div></div>');
  assert.equal(inspectAuditRouteReadiness(root).outcome, "empty");
});

test("로그인 리다이렉트는 요청한 화면의 본문 도달이나 기능 성공이 아니다", () => {
  const readiness = { pathname: "/auth/login", outcome: "ready", timedOut: false };
  assert.deepEqual(classifyAuditRouteCoverage(readiness, "/admin/users/members"), {
    content: "auth-gate", functionalVerification: "not-performed",
  });
  assert.equal(classifyAuditRouteCoverage(readiness, "/auth/login?next=/admin").content, "rendered");
  assert.deepEqual(auditReadinessFindings(readiness, "/auth/login?next=/admin"), { issues: [], warnings: [] });
  assert.equal(classifyAuditRouteCoverage({ ...readiness, pathname: "/admin", outcome: "blocked" }, "/admin").content, "blocked");
  assert.equal(classifyAuditRouteCoverage({ ...readiness, pathname: "/market", outcome: "degraded" }, "/market").content, "degraded");
  assert.equal(classifyAuditRouteCoverage({ pathname: "/studio", outcome: "ready", timedOut: true }, "/studio").content, "not-ready");
  assert.equal(classifyAuditRouteCoverage(undefined, "/studio").content, "unobserved");
});

test("실제 fallback 제거와 콘텐츠 상태 전환을 기다린다", async () => {
  const root = documentFor('<div class="route-stage route-stage--settled" data-route-state="pending"><div data-route-loading-fallback></div></div>');
  const page = {
    evaluate: async (fn) => fn(root),
    waitForTimeout: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
  const timer = setTimeout(() => {
    const stage = root.querySelector(".route-stage");
    stage.setAttribute("data-route-state", "ready");
    stage.innerHTML = '<h1>학습</h1><a href="/learn/trace">시작</a>';
  }, 20);
  try {
    const result = await waitForAuditRouteReadiness(page, { timeoutMs: 300, stableMs: 10, pollMs: 5 });
    assert.equal(result.outcome, "ready");
    assert.equal(result.timedOut, false);
    assert.deepEqual(result.observedStates, ["fallback", "ready"]);
  } finally {
    clearTimeout(timer);
  }
});

test("실제 timeout 후에도 skeleton 상태를 성공으로 바꾸지 않는다", async () => {
  const root = documentFor('<div class="route-stage" data-route-state="ready"><div class="skeleton"></div></div>');
  const page = {
    evaluate: async (fn) => fn(root),
    waitForTimeout: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
  const result = await waitForAuditRouteReadiness(page, { timeoutMs: 15, stableMs: 1, pollMs: 5 });
  assert.equal(result.outcome, "skeleton");
  assert.equal(result.timedOut, true);
});

test("문서 리다이렉트의 context 전환은 다시 관측하되 브라우저 종료는 숨기지 않는다", async () => {
  const root = documentFor('<div class="route-stage" data-route-state="ready"><h1>AI 설정</h1></div>');
  let calls = 0;
  const page = {
    evaluate: async (fn) => {
      if (calls++ === 0) throw new Error("Execution context was destroyed, most likely because of a navigation");
      return fn(root);
    },
    waitForTimeout: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
  const result = await waitForAuditRouteReadiness(page, { timeoutMs: 300, stableMs: 5, pollMs: 5 });
  assert.equal(result.timedOut, false);
  assert.deepEqual(result.observedStates, ["navigation", "ready"]);
  await assert.rejects(() => waitForAuditRouteReadiness({
    ...page,
    evaluate: async () => { throw new Error("Target page, context or browser has been closed"); },
  }), /has been closed/u);
});

test("Studio 권위 패턴의 선택 문서와 surface를 펼치고 wildcard는 제외한다", () => {
  const paths = expandAuditRoutePattern("/studio/(work/:workId|remix/:sourceWorkId)?/:surface(canvas|comic)?");
  assert.equal(paths.length, 9);
  assert.ok(paths.includes("/studio/canvas"));
  assert.ok(paths.includes("/studio/work/visual-audit/comic"));
  assert.ok(paths.includes("/studio/remix/visual-audit"));
  assert.deepEqual(expandAuditRoutePattern("/studio/(work/:workId/)?publish"), ["/studio/publish", "/studio/work/visual-audit/publish"]);
  assert.deepEqual(expandAuditRoutePattern("/studio/*"), []);
});

test("선택 매개변수는 생략한 경로와 제공한 경로를 모두 관측한다", () => {
  assert.deepEqual(expandAuditRoutePattern("/items/:id?"), ["/items", "/items/visual-audit"]);
  assert.deepEqual(expandAuditRoutePattern("/:locale?/items/:id?"), ["/items", "/items/visual-audit", "/visual-audit/items", "/visual-audit/items/visual-audit"]);
});

test("감사 종료 전에도 각 관측의 전체 JSON을 읽고 최종 판정으로 원자적으로 갱신한다", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "toonstudio-audit-observations-"));
  const desktop = { route: "/studio/work/visual-audit", theme: "light", viewport: "desktop", issues: [], readiness: { outcome: "blocked" } };
  const mobile = { ...desktop, viewport: "mobile", issues: ["horizontal-overflow"] };
  try {
    const [desktopFile, mobileFile] = await Promise.all([
      persistAuditObservation(directory, desktop),
      persistAuditObservation(directory, mobile),
    ]);
    assert.notEqual(desktopFile, mobileFile);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, desktopFile), "utf8")), desktop);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, mobileFile), "utf8")), mobile);
    const final = { ...desktop, issues: ["visual-regression:changed"] };
    assert.equal(await persistAuditObservation(directory, final), desktopFile);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, desktopFile), "utf8")), final);
    assert.equal((await readdir(directory)).length, 2);
    await assert.rejects(() => persistAuditObservation(path.join(directory, "missing"), desktop), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("학습 콘텐츠 ID는 지정한 권위 배열에서만 읽는다", () => {
  const source = 'const OTHER = [{ id: "wrong" }]; export const LESSONS: readonly Lesson[] = [{ id: "story", sections: [{ id: "nested" }] }, { id: "color" }];';
  assert.deepEqual(declaredArrayIds(source, "LESSONS"), ["story", "color"]);
  assert.throws(() => declaredArrayIds(source, "MISSING"), /정적 목록/);
});

test("companion surface는 as const 권위 배열의 실제 이름만 사용한다", () => {
  const source = 'const OTHER = ["wrong"]; export const STUDIO_COMPANION_SURFACES = ["workspace", "review"] as const;';
  assert.deepEqual(declaredStringArrayValues(source, "STUDIO_COMPANION_SURFACES"), ["workspace", "review"]);
});


test("주소가 유지된 관리자 로그인·권한 안내도 실제 관리 화면으로 집계하지 않는다", () => {
  for (const state of ["guest", "forbidden"]) {
    const root = documentFor(`<div class="route-stage" data-route-state="ready"><section data-admin-access-state="${state}"><h2>접근 안내</h2><button>로그인</button></section></div>`);
    const result = inspectAuditRouteReadiness(root);
    assert.equal(result.outcome, "blocked");
    assert.equal(result.authGateVisible, true);
    assert.equal(classifyAuditRouteCoverage(result, "/learn").content, "auth-gate");
    assert.ok(auditReadinessFindings(result, "/learn").warnings.includes("route-auth-gate"));
  }
});

test("관리자 인증 조회의 로딩·오류와 숨겨진 안내를 구분한다", () => {
  for (const [state, expected] of [["loading", "pending"], ["error", "error"]]) {
    const root = documentFor(`<div class="route-stage" data-route-state="ready"><div data-admin-access-state="${state}"><h2>확인 중</h2></div></div>`);
    const result = inspectAuditRouteReadiness(root);
    assert.equal(result.outcome, expected);
    assert.equal(result.authGateVisible, false);
  }
  const root = documentFor('<div class="route-stage" data-route-state="ready"><h1>관리 현황</h1><div data-admin-access-state="guest" hidden>이전 안내</div></div>');
  assert.equal(inspectAuditRouteReadiness(root).outcome, "ready");
});
