import ts from "typescript";
import { createHash, randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** 브라우저에 직렬화해 실행하므로 외부 변수나 모듈을 참조하지 않는다. */
export function inspectAuditRouteReadiness(root = document) {
  const view = root.defaultView;
  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = view.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  };
  const stage = root.querySelector(".route-stage");
  const developmentErrorOverlay = [...root.querySelectorAll("vite-error-overlay")].some(visible);
  const state = stage?.getAttribute("data-route-state") ?? "missing";
  const readinessSource = stage?.getAttribute("data-route-readiness-source") ?? "none";
  const count = (selector) => stage
    ? [...stage.querySelectorAll(selector)].filter(visible).length
    : 0;
  const adminAccess = stage?.querySelector("[data-admin-access-state]");
  const adminAccessState = visible(adminAccess) ? adminAccess.getAttribute("data-admin-access-state") : null;
  const authGateVisible = adminAccessState === "guest" || adminAccessState === "forbidden";
  const loadingFallbacks = count("[data-route-loading-fallback]");
  const pendingMarkers = count("[data-route-pending]");
  const blockedMarkers = count("[data-route-blocked]");
  const degradedMarkers = count("[data-route-degraded]");
  const errorMarkers = count("[data-route-error]");
  const recoveryVisible = count("[data-route-recovery]") > 0;
  const skeletons = count(".skeleton, [data-skeleton], [data-testid='skeleton']");
  const ignored = "[data-route-semantic-heading], [data-route-recovery], [data-route-loading-fallback], [data-route-pending], [data-route-chrome], [aria-busy='true'], [aria-hidden='true'], .sr-only, .skeleton, [data-skeleton]";
  const contentElements = stage
    ? [...stage.querySelectorAll("h1,h2,h3,a[href],button,input,select,textarea,canvas,img,video,[role='alert'],[role='status']")]
      .filter((element) => visible(element) && !element.closest(ignored)).length
    : 0;
  let outcome = "ready";
  if (developmentErrorOverlay) outcome = "error";
  else if (!stage) outcome = "missing";
  else if (recoveryVisible || state === "stalled") outcome = "stalled";
  else if (loadingFallbacks) outcome = "fallback";
  else if (pendingMarkers || adminAccessState === "loading" || state === "pending" || stage.getAttribute("aria-busy") === "true") outcome = "pending";
  else if (errorMarkers || adminAccessState === "error" || state === "error") outcome = "error";
  else if (blockedMarkers || authGateVisible || state === "blocked") outcome = "blocked";
  else if (degradedMarkers || state === "degraded") outcome = "degraded";
  else if (skeletons && contentElements <= 1) outcome = "skeleton";
  else if (state !== "ready" || !contentElements) outcome = "empty";
  return {
    pathname: view.location.pathname,
    state,
    readinessSource,
    adminAccessState,
    authGateVisible,
    outcome,
    developmentErrorOverlay,
    loadingFallbacks,
    pendingMarkers,
    blockedMarkers,
    degradedMarkers,
    errorMarkers,
    recoveryVisible,
    skeletons,
    contentElements,
  };
}

/** 브라우저에서 독립 실행한다. sticky는 실제 내부 clip을 반영하고 fixed는 viewport 기준을 유지한다. */
export function inspectAuditPositionedOverflow(root = document) {
  const view = root.defaultView;
  const findings = [];
  for (const element of root.querySelectorAll("body *")) {
    const style = view.getComputedStyle(element);
    if (!["fixed", "sticky"].includes(style.position)) continue;
    const rect = element.getBoundingClientRect();
    if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) continue;
    let insideClosedDetails = false;
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.tagName === "DETAILS" && !ancestor.open
        && !ancestor.querySelector(":scope > summary")?.contains(element)) {
        insideClosedDetails = true;
        break;
      }
    }
    if (insideClosedDetails) continue;

    let left = rect.left;
    let right = rect.right;
    if (style.position === "sticky") {
      // 문서·viewport 자체의 clip으로 화면 잘림을 정당화하지 않는다. 내부 스크롤 영역만 교차한다.
      for (let ancestor = element.parentElement;
        ancestor && ancestor !== root.body && ancestor !== root.documentElement;
        ancestor = ancestor.parentElement) {
        const ancestorStyle = view.getComputedStyle(ancestor);
        if (/^(?:auto|scroll|hidden|clip|overlay)$/u.test(ancestorStyle.overflowX)
          && ancestorStyle.display !== "contents") {
          const clipRect = ancestor.getBoundingClientRect();
          const scaleX = ancestor.offsetWidth > 0 ? clipRect.width / ancestor.offsetWidth : 1;
          const clipLeft = clipRect.left + ancestor.clientLeft * scaleX;
          left = Math.max(left, clipLeft);
          right = Math.min(right, clipLeft + ancestor.clientWidth * scaleX);
        }
        // viewport에 고정된 컨테이너는 그 밖의 일반 overflow 조상에 의해 잘리지 않는다.
        if (ancestorStyle.position === "fixed") break;
      }
    }
    if (right <= left || (left >= -2 && right <= view.innerWidth + 2)) continue;
    findings.push({
      tag: element.tagName.toLowerCase(),
      className: String(element.className).slice(0, 100),
      position: style.position,
      left: Math.round(left),
      right: Math.round(right),
      layoutLeft: Math.round(rect.left),
      layoutRight: Math.round(rect.right),
    });
    if (findings.length === 12) break;
  }
  return findings;
}

/** 애니메이션 종료와 실제 콘텐츠 준비를 구분하고 SPA 전환이 안정된 뒤 관측한다. */
export async function waitForAuditRouteReadiness(page, {
  timeoutMs = 20_000,
  stableMs = 300,
  pollMs = 150,
} = {}) {
  const started = Date.now();
  const observedStates = new Set();
  let lastSignature = "";
  let stableSince = started;
  let snapshot;
  while (Date.now() - started < timeoutMs) {
    try {
      snapshot = await page.evaluate(inspectAuditRouteReadiness);
    } catch (error) {
      // 전체 문서 리다이렉트 중에만 관측을 다시 시작한다. 종료된 브라우저 등은 실패로 남긴다.
      if (!(error instanceof Error) || !error.message.includes("Execution context was destroyed")) throw error;
      observedStates.add("navigation");
      lastSignature = "";
      stableSince = Date.now();
      await page.waitForTimeout(Math.min(pollMs, Math.max(1, timeoutMs - (Date.now() - started))));
      continue;
    }
    observedStates.add(snapshot.outcome);
    const signature = JSON.stringify([snapshot.pathname, snapshot.outcome, snapshot.state]);
    if (signature !== lastSignature) {
      lastSignature = signature;
      stableSince = Date.now();
    }
    const terminal = ["ready", "blocked", "degraded", "error"].includes(snapshot.outcome);
    if (terminal && Date.now() - stableSince >= stableMs) {
      return { ...snapshot, timedOut: false, durationMs: Date.now() - started, observedStates: [...observedStates] };
    }
    await page.waitForTimeout(Math.min(pollMs, Math.max(1, timeoutMs - (Date.now() - started))));
  }
  snapshot = await page.evaluate(inspectAuditRouteReadiness);
  observedStates.add(snapshot.outcome);
  return { ...snapshot, timedOut: true, durationMs: Date.now() - started, observedStates: [...observedStates] };
}

export function auditReadinessFindings(readiness, requestedPath) {
  const issues = [];
  const warnings = [];
  if (readiness.timedOut) issues.push("route-readiness-timeout");
  if (["missing", "pending", "fallback", "stalled", "skeleton", "empty", "error"].includes(readiness.outcome)) {
    issues.push(`route-content-${readiness.outcome}`);
  }
  if (readiness.outcome === "blocked" || readiness.outcome === "degraded") {
    warnings.push(`route-content-${readiness.outcome}`);
  }
  if (readiness.pathname !== new URL(requestedPath, "http://audit.invalid").pathname) warnings.push(`route-redirect:${readiness.pathname}`);
  if (classifyAuditRouteCoverage(readiness, requestedPath).content === "auth-gate") warnings.push("route-auth-gate");
  return { issues, warnings };
}

/** 시각 관측의 완료와 본문 도달·기능 검증은 서로 다른 증거다. */
export function classifyAuditRouteCoverage(readiness, requestedPath) {
  const pathname = new URL(requestedPath, "http://audit.invalid").pathname;
  const authRedirect = readiness?.pathname !== pathname
    && /^\/auth(?:\/|$)/u.test(readiness?.pathname ?? "");
  let content = "unobserved";
  if (authRedirect || readiness?.authGateVisible) content = "auth-gate";
  else if (readiness?.outcome === "blocked" || readiness?.outcome === "degraded") content = readiness.outcome;
  else if (readiness) content = readiness.outcome === "ready" && !readiness.timedOut ? "rendered" : "not-ready";
  return { content, functionalVerification: "not-performed" };
}

/** 관측 직후 완전한 JSON 한 파일을 원자적으로 저장해 긴 감사 중간에도 근거를 읽을 수 있게 한다. */
export async function persistAuditObservation(directory, result) {
  const key = JSON.stringify([result.route, result.theme, result.viewport]);
  const filename = `${createHash("sha256").update(key).digest("hex").slice(0, 24)}.json`;
  const destination = path.join(directory, filename);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(result, null, 2));
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return filename;
}

/** Studio manifest의 선택 그룹과 선택 surface를 실제 감사 URL로 펼친다. */
export function expandAuditRoutePattern(pattern) {
  if (!pattern.startsWith("/") || pattern.includes("*")) return [];
  const normalized = pattern.replace(/:[A-Za-z0-9_]+\(([^()]*)\)/gu, "($1)");
  const group = /\(([^()]*)\)(\?)?/u.exec(normalized);
  if (group) {
    const alternatives = group[1].split("|");
    if (group[2]) alternatives.unshift("");
    return [...new Set(alternatives.flatMap((value) => expandAuditRoutePattern(
      normalized.slice(0, group.index) + value + normalized.slice(group.index + group[0].length),
    )))];
  }
  const optionalParameter = /\/:[A-Za-z0-9_]+\?(?=\/|$)/u.exec(normalized);
  if (optionalParameter) {
    const before = normalized.slice(0, optionalParameter.index);
    const after = normalized.slice(optionalParameter.index + optionalParameter[0].length);
    return [...new Set([
      ...expandAuditRoutePattern(`${before}${after}` || "/"),
      ...expandAuditRoutePattern(`${before}${optionalParameter[0].slice(0, -1)}${after}`),
    ])];
  }
  return [normalized.replace(/:[A-Za-z0-9_]+\??/gu, "visual-audit").replace(/\/{2,}/gu, "/").replace(/\/$/u, "") || "/"];
}

function declaredArrayElements(sourceText, name) {
  const source = ts.createSourceFile("content.ts", sourceText, ts.ScriptTarget.Latest, true);
  let entries;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) {
      let initializer = node.initializer;
      while (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer)) initializer = initializer.expression;
      if (ts.isArrayLiteralExpression(initializer)) entries = initializer.elements;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!entries) throw new Error(`${name} 정적 목록을 찾지 못했습니다. 경로 권위와 감사 수집기를 확인하세요.`);
  return { entries, source };
}

/** 중첩 lesson/path 예제를 가짜 ID 대신 기존 정적 콘텐츠 권위에서 읽는다. */
export function declaredArrayIds(sourceText, name) {
  const { entries, source } = declaredArrayElements(sourceText, name);
  return entries.flatMap((entry) => {
    if (!ts.isObjectLiteralExpression(entry)) return [];
    const id = entry.properties.find((property) => ts.isPropertyAssignment(property)
      && property.name.getText(source) === "id");
    return id && ts.isStringLiteral(id.initializer) ? [id.initializer.text] : [];
  });
}

/** companion처럼 유효한 이름만 허용하는 surface를 기존 권위에서 읽는다. */
export function declaredStringArrayValues(sourceText, name) {
  return declaredArrayElements(sourceText, name).entries.flatMap((entry) => ts.isStringLiteral(entry) ? [entry.text] : []);
}
