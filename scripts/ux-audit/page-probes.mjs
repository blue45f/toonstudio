/**
 * 브라우저 안에서 실행되는 보조 스크립트 모음. 각 함수는 `page.evaluate`/`addInitScript` 로 직렬화되어 실행되므로
 * 모듈 범위의 변수나 import 를 참조할 수 없다(서로 호출도 불가). 필요한 보조 함수는 각 함수 안에 둔다.
 */

/**
 * (addInitScript) 문서 시작 시점에 설치하는 성능 관찰자.
 * - CLS: web-vitals 와 같은 "최대 세션 창" 방식(1초 간격, 5초 상한), 최근 입력이 있었던 이동은 제외
 * - LCP: 마지막 largest-contentful-paint 항목 시각
 * - 긴 작업: 50ms 를 넘긴 구간의 초과분 합(TBT 와 비슷한 참고값)
 * - routeReadyMs: 앱의 route-stage(`.route-stage[data-route-state]`)가 pending 을 벗어난 첫 시각
 */
export function installPageProbes() {
  const probe = {
    cls: 0,
    lcpMs: null,
    longTaskMs: 0,
    routeReadyMs: null,
    routeState: null,
    routeStateLatest: null,
  };
  window.__uxa = probe;
  try {
    let sessionValue = 0;
    let sessionEntries = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        const first = sessionEntries[0];
        const last = sessionEntries[sessionEntries.length - 1];
        if (sessionEntries.length > 0 && entry.startTime - last.startTime < 1000 && entry.startTime - first.startTime < 5000) {
          sessionValue += entry.value;
          sessionEntries.push(entry);
        } else {
          sessionValue = entry.value;
          sessionEntries = [entry];
        }
        probe.cls = Math.max(probe.cls, sessionValue);
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {
    probe.cls = null;
  }
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) probe.lcpMs = Math.round(last.startTime);
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    probe.lcpMs = null;
  }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) probe.longTaskMs += Math.max(0, entry.duration - 50);
    }).observe({ type: "longtask", buffered: true });
  } catch {
    probe.longTaskMs = null;
  }
  const inspectStage = () => {
    const stage = document.querySelector(".route-stage");
    const state = stage ? stage.getAttribute("data-route-state") : null;
    probe.routeStateLatest = state;
    if (state && state !== "pending" && probe.routeReadyMs === null) {
      probe.routeReadyMs = Math.round(performance.now());
      probe.routeState = state;
    }
  };
  const observer = new MutationObserver(inspectStage);
  const start = () => {
    inspectStage();
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-route-state"] });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

/** (addInitScript) 안내 배너가 첫 방문 화면을 가리지 않도록 이미 확인한 상태로 둔다(저장소의 a11y 스모크와 같은 방식). */
export function setMeasurementPreferences() {
  try {
    localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    sessionStorage.setItem("toonstudio-compat-dismissed", "true");
    localStorage.setItem("toonstudio-studio-beta-notice-acknowledged", "2026-09-24-data-and-policy-v1");
  } catch {
    // 저장소 접근이 막힌 환경에서는 기본 상태로 측정한다.
  }
}

/** (evaluate) 설치된 관찰자 값을 읽는다. */
export function readPageProbes() {
  const probe = window.__uxa;
  if (!probe) return null;
  return {
    cls: probe.cls === null ? null : Math.round(probe.cls * 1000) / 1000,
    lcpMs: probe.lcpMs,
    longTaskMs: probe.longTaskMs === null ? null : Math.round(probe.longTaskMs),
    routeReadyMs: probe.routeReadyMs,
    routeState: probe.routeState,
    routeStateLatest: probe.routeStateLatest,
  };
}

/** (evaluate) 유한 애니메이션·폰트·두 프레임이 끝날 때까지 기다린다. 무한 반복 효과는 기다리지 않는다. */
export async function settlePage() {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))));
  const deadline = performance.now() + 5000;
  const pending = () => document.getAnimations().filter((animation) => {
    const timing = animation.effect && animation.effect.getTiming();
    return animation.playState === "running" && Number.isFinite(timing ? timing.iterations : 1);
  });
  while (pending().length > 0 && performance.now() < deadline) {
    await Promise.allSettled(pending().map((animation) => animation.finished));
  }
}

/** (evaluate) Tab 순회 준비: 맨 위로 스크롤, 포커스 해제, 애니메이션·전환·캐럿 고정(포커스 표시 비교가 흔들리지 않게). */
export function prepareFocusProbe() {
  window.scrollTo(0, 0);
  if (!document.getElementById("__uxa-freeze")) {
    const style = document.createElement("style");
    style.id = "__uxa-freeze";
    style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}";
    document.head.appendChild(style);
  }
  const active = document.activeElement;
  if (active && active !== document.body && typeof active.blur === "function") active.blur();
  window.__uxaFocus = { next: 1, ids: new WeakMap(), elements: new Map() };
  const focusable = document.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
  );
  let count = 0;
  for (const element of focusable) {
    if (element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden") count += 1;
  }
  const modal = document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]');
  return { focusableCount: count, modalOpen: Boolean(modal && modal.getClientRects().length > 0) };
}

/** (evaluate) 현재 포커스된 요소의 식별 정보. body 이면 id 가 null. size 는 측정 프로필의 뷰포트 크기다. */
export function describeFocused(size) {
  const element = document.activeElement;
  if (!element || element === document.body || element === document.documentElement) return { id: null };
  const registry = window.__uxaFocus;
  let id = registry.ids.get(element);
  if (!id) {
    id = registry.next;
    registry.next += 1;
    registry.ids.set(element, id);
    registry.elements.set(id, element);
  }
  const rect = element.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = size && size.height ? size.height : window.innerHeight;
  const className = (element.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((name) => `.${name}`).join("");
  const text = (element.getAttribute("aria-label") || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28);
  return {
    id,
    label: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${className}${text ? ` "${text}"` : ""}`.slice(0, 110),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    offscreen: rect.bottom <= 0 || rect.top >= viewportHeight || rect.right <= 0 || rect.left >= viewportWidth,
    isFrame: element.tagName === "IFRAME",
    viewport: { width: viewportWidth, height: viewportHeight },
  };
}

/** (evaluate) 포커스 해제. */
export function blurFocused() {
  const element = document.activeElement;
  if (element && typeof element.blur === "function") element.blur();
}

/** (evaluate) 순회를 이어 가도록 지정한 id 요소에 다시 포커스(스크롤은 유지). */
export function refocus(id) {
  const element = window.__uxaFocus && window.__uxaFocus.elements.get(id);
  if (element && typeof element.focus === "function") element.focus({ preventScroll: true });
}

/** (evaluate) 열려 있는 모달이 Escape 로 닫히는지 확인하려고 닫힘 여부를 읽는다. */
export function isModalOpen() {
  const modal = document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]');
  return Boolean(modal && modal.getClientRects().length > 0);
}
