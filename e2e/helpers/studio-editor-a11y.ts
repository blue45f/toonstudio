import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type CDPSession, type Locator, type Page } from "@playwright/test";

import {
  STUDIO_BETA_NOTICE_REVISION,
  STUDIO_BETA_NOTICE_STORAGE_KEY,
} from "../../apps/web/src/domains/creator/studio-beta-notice-storage";
import {
  analyzeTabTraversal,
  auditAccessibilityTree,
  axeExemptionKey,
  axeTargetKey,
  classifyFocusIndicator,
  compareTraversalDirections,
  describeAccessibilityFinding,
  describeAxeViolation,
  NAME_ROLE_AXE_RULES,
  STUDIO_EDITOR_AXE_EXEMPTIONS,
  summarizeAxeViolations,
  type AccessibilityFinding,
  type AxeViolationLike,
  type AxeViolationSummary,
  type TabStopRecord,
  type TabTraversalExpectation,
  type TabTraversalReport,
  type TraversalDirectionComparison,
} from "../../scripts/lib/studio-editor-a11y-audit";

/**
 * 열린 편집기(게스트·오프라인) 접근성 점검의 브라우저 쪽 도우미.
 * 판정 규칙은 `scripts/lib/studio-editor-a11y-audit.ts`(단위 시험이 고정)에 있고, 여기는 브라우저에서 입력을
 * 모아 규칙에 넘기고 결과를 읽기 쉬운 메시지로 돌려주는 일만 한다.
 */

/** 로그인 없이 새 문서가 열리는 편집기 경로. `/studio` 의 "새 문서"는 이 임시 작업(room)으로 이어진다. */
export const STUDIO_EDITOR_ROUTE = "/studio/canvas";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] as const;

export interface GuestEditorOptions {
  /** 빈 캔버스 시작 도크를 미리 접어 둔다. 첫 실행 화면을 시험할 때는 켜지 않는다. */
  readonly dismissStartDock?: boolean;
}

/**
 * 로그인 없는 오프라인 환경을 만든다: 한국어, 호환성·베타 안내 확인 완료, 인증 안 됨, 나머지 API 는 503.
 * a11y-smoke 와 같은 가짜 응답이라 서버가 없어도 같은 상태로 수렴한다.
 */
export async function installGuestOfflineEnvironment(page: Page, options: GuestEditorOptions = {}): Promise<void> {
  await page.addInitScript(
    (seed) => {
      try {
        localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
        sessionStorage.setItem("toonstudio-compat-dismissed", "true");
        localStorage.setItem(seed.betaKey, seed.betaRevision);
        if (seed.dismissStartDock) localStorage.setItem("toonstudio.canvas-start-dock.v1", "collapsed");
      } catch {
        // 저장소를 못 쓰는 환경에서도 시험은 안내가 보이는 상태로 계속된다.
      }
    },
    {
      betaKey: STUDIO_BETA_NOTICE_STORAGE_KEY,
      betaRevision: STUDIO_BETA_NOTICE_REVISION,
      dismissStartDock: options.dismissStartDock === true,
    },
  );

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
      return;
    }
    await route.fulfill({
      status: 503,
      json: { message: "Editor accessibility: service temporarily unavailable", error: "Service Unavailable" },
    });
  });
}

/**
 * 편집기가 자리를 잡을 때까지 기다린다.
 * 1) 앱 셸과 메뉴바 항목이 그려졌고, 2) 지연 로딩 조각(aria-busy)이 모두 끝났고,
 * 3) 오프라인 상태 안내가 떠서 상단 영역의 높이가 더 바뀌지 않는다.
 * 3번이 없으면 안내가 늦게 나타나 메뉴바가 커지는 순간의 겹침 때문에 결과가 시간에 따라 달라진다.
 */
export async function waitForEditorSettled(page: Page): Promise<void> {
  await page.locator("#studio-app-shell").waitFor({ state: "visible", timeout: 120_000 });
  // 데스크톱 메뉴바는 menubar 항목(menuitem)이 지연 로딩으로 채워진다. 모바일 알약에는 menuitem 이 없고 단추만 있다.
  const menubar = page.locator("#studio-menubar");
  const compact = (page.viewportSize()?.width ?? 1440) < 1024;
  await expect((compact ? menubar.getByRole("button") : menubar.getByRole("menuitem")).first()).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(() => page.locator('[aria-busy="true"], [data-studio-lazy-surface]').count(), {
      timeout: 60_000,
      message: "지연 로딩 중인 조각(aria-busy)이 끝나지 않았어요",
    })
    .toBe(0);
  await expect(page.getByRole("button", { name: "연결 다시 확인" }).first()).toBeVisible({ timeout: 45_000 });
  await settleLayout(page);
}

/**
 * 두 프레임을 기다려 레이아웃·포커스 이동이 반영된 뒤에 읽는다.
 * 소프트웨어 GPU(SwiftShader)에서 부하가 큰 편집기 프레임은 수백 ms 걸릴 수 있어서 대기에 300ms 상한을 둔다.
 * 상한에 걸려도 스타일 계산은 읽는 시점에 강제되므로 판정은 같다.
 */
export async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 300);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            clearTimeout(timer);
            resolve();
          }),
        );
      }),
  );
}

/**
 * 포인터를 화면 가운데로 치우고 말풍선(툴팁)이 사라지길 기다린다.
 * 마지막 클릭 자리에 포인터가 남아 있으면 호버 툴팁이 점검 도중에 떠서 결과가 시간에 따라 달라진다.
 */
export async function parkPointer(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (viewport) await page.mouse.move(Math.floor(viewport.width / 2), Math.floor(viewport.height / 2));
  await page.locator('[role="tooltip"]').waitFor({ state: "detached", timeout: 4_000 }).catch(() => undefined);
  await settleLayout(page);
}

/**
 * 개발 서버가 편집기 모듈을 처음 변환하는 비용(콜드 스타트, 1~3분)을 첫 시험의 제한 시간 밖에서 치른다.
 * 시험마다 새 브라우저 문맥을 쓰므로 서버 쪽 변환 결과만 데워지고, 시험 상태는 서로 섞이지 않는다.
 */
export async function warmUpEditor(browser: Browser, baseURL: string | undefined): Promise<void> {
  const context = await browser.newContext({
    ...(baseURL === undefined ? {} : { baseURL }),
    locale: "ko-KR",
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 900 },
  });
  try {
    const page = await context.newPage();
    await installGuestOfflineEnvironment(page, { dismissStartDock: true });
    await page.goto(STUDIO_EDITOR_ROUTE, { waitUntil: "domcontentloaded", timeout: 300_000 });
    await page.locator("#studio-app-shell").waitFor({ state: "visible", timeout: 300_000 });
    await waitForEditorSettled(page);
  } finally {
    await context.close();
  }
}

export async function openGuestEditor(page: Page, options: GuestEditorOptions = {}): Promise<void> {
  await installGuestOfflineEnvironment(page, options);
  await page.goto(STUDIO_EDITOR_ROUTE, { waitUntil: "domcontentloaded" });
  await waitForEditorSettled(page);
}

// ─── axe ────────────────────────────────────────────────────────────────────────────────

/** 선택자가 문서화된 예외 요소를 가리키는 위반 노드를 찾아 예외 키 집합으로 돌려준다. */
async function collectExemptKeys(page: Page, violations: readonly AxeViolationLike[]): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const exemption of STUDIO_EDITOR_AXE_EXEMPTIONS) {
    const targets = violations
      .filter((violation) => violation.id === exemption.ruleId)
      .flatMap((violation) => violation.nodes.map((node) => node.target));
    if (targets.length === 0) continue;
    const selectors = targets.map((target) => axeTargetKey(target));
    const exempt = await page.evaluate(
      ({ candidates, exemptSelector }) =>
        candidates.filter((candidate) => {
          try {
            return document.querySelector(candidate)?.matches(exemptSelector) === true;
          } catch {
            return false;
          }
        }),
      { candidates: selectors, exemptSelector: exemption.selector },
    );
    const exemptSet = new Set(exempt);
    targets.forEach((target, index) => {
      if (exemptSet.has(selectors[index] ?? "")) keys.add(axeExemptionKey(exemption.ruleId, target));
    });
  }
  return keys;
}

/** serious·critical 위반(문서화된 예외 제외). a11y-smoke 와 같은 WCAG 2.2 AA 태그를 쓴다. */
export async function scanBlockingAxe(page: Page): Promise<AxeViolationSummary[]> {
  const result = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  const exemptKeys = await collectExemptKeys(page, result.violations);
  return summarizeAxeViolations(result.violations, { exemptKeys });
}

/** 이름·역할·값 규칙의 위반을 영향도와 상관없이 모두 돌려준다(minor 의 `aria-allowed-role` 포함). */
export async function scanNameRoleAxe(page: Page): Promise<AxeViolationSummary[]> {
  const result = await new AxeBuilder({ page }).withRules([...NAME_ROLE_AXE_RULES]).analyze();
  return summarizeAxeViolations(result.violations, {
    impacts: new Set(["minor", "moderate", "serious", "critical"]),
  });
}

/** 위반 요약을 한 줄씩의 문장 목록으로 바꾼다. 단언이 실패하면 이 목록이 그대로 비교 결과에 보인다. */
export function describeAxeSummary(summary: readonly AxeViolationSummary[]): string[] {
  return summary.map((violation) => describeAxeViolation(violation));
}

// ─── 접근성 트리(이름·역할) ───────────────────────────────────────────────────────────────

async function describeDomNode(cdp: CDPSession, backendNodeId: number | null): Promise<string> {
  if (backendNodeId === null) return "";
  try {
    const { object } = await cdp.send("DOM.resolveNode", { backendNodeId });
    if (!object.objectId) return "";
    const result = await cdp.send("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function () {
        const html = this instanceof Element ? this.outerHTML : String(this);
        return html.replace(/\\s+/g, " ").slice(0, 200);
      }`,
      returnByValue: true,
    });
    return typeof result.result.value === "string" ? result.result.value : "";
  } catch {
    return "";
  }
}

/** 접근성 트리를 읽어 이름 없는 상호작용 요소와 틀린 역할 구조를 설명 문장으로 돌려준다. */
export async function auditAccessibleNames(page: Page): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Accessibility.enable");
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const findings: AccessibilityFinding[] = auditAccessibilityTree(nodes);
    const lines: string[] = [];
    for (const finding of findings.slice(0, 40)) {
      lines.push(describeAccessibilityFinding(finding, await describeDomNode(cdp, finding.backendDOMNodeId)));
    }
    if (findings.length > 40) lines.push(`… 외 ${findings.length - 40}건`);
    return lines;
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

// ─── 키보드 순회 ─────────────────────────────────────────────────────────────────────────

/** 포커스를 가진 요소의 영역 판정 선택자. 앞에 있을수록 먼저 맞는다. */
const REGION_SELECTORS: ReadonlyArray<readonly [string, string]> = [
  ["dialog", '[role="dialog"][aria-modal="true"], [role="alertdialog"]'],
  ["skip-links", 'nav[aria-label="작업 영역 바로가기"]'],
  ["work-modes", '[role="tablist"][aria-label="작업 모드"]'],
  ["menubar", "#studio-menubar"],
  ["tool-rail", '[data-studio-workspace-region="tool-rail"]'],
  ["brush-panel", "#studio-brush-workbench, [data-studio-brush-workbench]"],
  ["canvas", "#studio-canvas-workspace"],
  ["inspector", "#studio-inspector"],
  ["floating", '[data-studio-floating-surface="true"]'],
  ["status", '[role="status"], [data-service-degraded-banner]'],
];

interface FocusSnapshot {
  readonly isDocumentBody: boolean;
  readonly key: string;
  readonly region: string;
  readonly tag: string;
  readonly role: string;
  readonly name: string;
  readonly inViewport: boolean;
  readonly rect: { x: number; y: number; width: number; height: number };
  readonly outlineStyle: string;
  readonly outlineWidth: string;
  readonly outlineColor: string;
  readonly boxShadow: string;
}

async function readFocusSnapshot(page: Page): Promise<FocusSnapshot> {
  return page.evaluate((regions) => {
    interface FocusIdHost {
      __studioA11yFocusIds?: WeakMap<Element, number>;
      __studioA11yFocusSeq?: number;
    }
    const host = window as unknown as FocusIdHost;
    host.__studioA11yFocusIds ??= new WeakMap<Element, number>();
    const ids = host.__studioA11yFocusIds;
    const element = document.activeElement;
    const empty = { x: 0, y: 0, width: 0, height: 0 };
    if (!element || element === document.body || element === document.documentElement) {
      return {
        isDocumentBody: true, key: "body", region: "other", tag: "body", role: "", name: "", inViewport: true,
        rect: empty, outlineStyle: "none", outlineWidth: "0px", outlineColor: "", boxShadow: "none",
      };
    }
    let id = ids.get(element);
    if (id === undefined) {
      host.__studioA11yFocusSeq = (host.__studioA11yFocusSeq ?? 0) + 1;
      id = host.__studioA11yFocusSeq;
      ids.set(element, id);
    }
    let region = "other";
    for (const [name, selector] of regions) {
      if (element.closest(selector)) {
        region = name;
        break;
      }
    }
    const textOfIds = (value: string | null): string =>
      (value ?? "")
        .split(/\s+/u)
        .map((part) => (part ? document.getElementById(part)?.textContent?.trim() ?? "" : ""))
        .join(" ")
        .trim();
    const labelText = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
      ? Array.from(element.labels ?? []).map((label) => label.textContent?.trim() ?? "").join(" ")
      : "";
    const name = (
      element.getAttribute("aria-label")
      || textOfIds(element.getAttribute("aria-labelledby"))
      || labelText
      || element.getAttribute("title")
      || element.textContent
      || element.getAttribute("placeholder")
      || ""
    ).replace(/\s+/gu, " ").trim().slice(0, 48);
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      isDocumentBody: false,
      key: `#${id}`,
      region,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role") ?? "",
      name,
      inViewport: box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.left < window.innerWidth && box.top < window.innerHeight,
      rect: { x: box.x, y: box.y, width: box.width, height: box.height },
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
    };
  }, REGION_SELECTORS);
}

/**
 * 컴퓨터 스타일로 포커스 표시를 못 찾은 요소(슬라이더 손잡이 같은 의사 요소)를 화면 비교로 한 번 더 본다.
 * 포커스를 준 채로 찍은 그림과 포커스를 뺀 채로 찍은 그림이 같으면 사용자는 아무 변화도 보지 못한다.
 */
async function pixelsChangeWithFocus(page: Page, rect: FocusSnapshot["rect"]): Promise<boolean> {
  const viewport = page.viewportSize();
  if (!viewport || rect.width <= 0 || rect.height <= 0) return false;
  const margin = 8;
  const x = Math.max(0, Math.floor(rect.x - margin));
  const y = Math.max(0, Math.floor(rect.y - margin));
  const width = Math.min(viewport.width - x, Math.ceil(rect.width + margin * 2));
  const height = Math.min(viewport.height - y, Math.ceil(rect.height + margin * 2));
  if (width <= 0 || height <= 0) return false;
  const clip = { x, y, width, height };
  const focused = await page.evaluateHandle(() => document.activeElement);
  try {
    const withFocus = await page.screenshot({ clip, animations: "disabled" });
    await focused.evaluate((element) => {
      if (element instanceof HTMLElement) element.blur();
    });
    const withoutFocus = await page.screenshot({ clip, animations: "disabled" });
    return !withFocus.equals(withoutFocus);
  } finally {
    await focused.evaluate((element) => {
      if (element instanceof HTMLElement) element.focus({ preventScroll: true });
    }).catch(() => undefined);
    await focused.dispose().catch(() => undefined);
  }
}

/** 지금 포커스된 요소를 탭 정지 기록으로 만든다. */
export async function recordTabStop(page: Page, index: number): Promise<TabStopRecord> {
  const snapshot = await readFocusSnapshot(page);
  const indicator = snapshot.isDocumentBody
    ? "outline"
    : classifyFocusIndicator({
        outlineStyle: snapshot.outlineStyle,
        outlineWidth: snapshot.outlineWidth,
        outlineColor: snapshot.outlineColor,
        boxShadow: snapshot.boxShadow,
      });
  const pixelVerified = indicator === "none" && !snapshot.isDocumentBody
    ? await pixelsChangeWithFocus(page, snapshot.rect)
    : false;
  return {
    index,
    key: snapshot.key,
    region: snapshot.region,
    tag: snapshot.tag,
    role: snapshot.role,
    name: snapshot.name,
    isDocumentBody: snapshot.isDocumentBody,
    inViewport: snapshot.inViewport,
    indicator,
    pixelVerified,
  };
}

export interface TabWalkOptions {
  /** 이 요소에서 시작한다(포커스를 준 뒤 첫 정지로 기록한다). */
  readonly start: Locator;
  readonly direction?: "forward" | "backward";
  readonly maxStops: number;
  /** true 를 돌려주면 그 정지까지 기록하고 멈춘다. */
  readonly until?: (stops: readonly TabStopRecord[]) => boolean;
}

/** Tab(또는 Shift+Tab)을 누르며 포커스가 지나는 정지를 모두 기록한다. */
export async function walkTabOrder(page: Page, options: TabWalkOptions): Promise<TabStopRecord[]> {
  const key = options.direction === "backward" ? "Shift+Tab" : "Tab";
  await options.start.focus();
  await settleLayout(page);
  const stops: TabStopRecord[] = [await recordTabStop(page, 1)];
  while (stops.length < options.maxStops && !(options.until?.(stops) ?? false)) {
    await page.keyboard.press(key);
    await settleLayout(page);
    stops.push(await recordTabStop(page, stops.length + 1));
  }
  return stops;
}

/** Tab 으로 지난 순서와 Shift+Tab 으로 지난 순서를 견준다(방향에 따라 포커스를 옮기는 코드가 있는지). */
export function compareTabDirections(
  forward: readonly TabStopRecord[],
  backward: readonly TabStopRecord[],
): TraversalDirectionComparison {
  return compareTraversalDirections(forward, backward);
}

export function reportTabTraversal(
  stops: readonly TabStopRecord[],
  expectation: TabTraversalExpectation,
): TabTraversalReport {
  return analyzeTabTraversal(stops, expectation);
}

/** 단언 메시지용: 정지 목록을 영역별로 접어 한눈에 보게 한다. */
export function summarizeStops(stops: readonly TabStopRecord[]): string {
  const runs: string[] = [];
  let current: { region: string; count: number; first: string } | null = null;
  for (const stop of stops) {
    const region = stop.isDocumentBody ? "(문서 본문)" : stop.region;
    if (current && current.region === region) {
      current.count += 1;
      continue;
    }
    if (current) runs.push(`${current.region} ×${current.count} (첫 정지 ${current.first})`);
    current = { region, count: 1, first: `#${stop.index} "${stop.name}"` };
  }
  if (current) runs.push(`${current.region} ×${current.count} (첫 정지 ${current.first})`);
  return runs.join("\n");
}

// ─── 대화상자·팝오버 포커스 ─────────────────────────────────────────────────────────────

/** 지금 포커스가 container 안에 있는가. */
export async function isFocusInside(container: Locator): Promise<boolean> {
  return container.evaluate((element) => element.contains(document.activeElement));
}

/** 포커스가 어디에 있는지 사람이 읽을 문장으로. 단언 실패 메시지용이다. */
export async function describeActiveElement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return "문서 본문(포커스 없음)";
    const name = (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/gu, " ").trim().slice(0, 40);
    return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""} "${name}"`;
  });
}

/**
 * 열기 → 포커스 이동 → Esc 로 닫기 → 포커스가 여는 단추로 돌아온다. 모달이 아닌 창·팝오버·메뉴 모두에 쓴다.
 * `surface` 는 열린 동안 보이는 컨테이너, `opener` 는 여는 단추다.
 */
export async function expectOpenCloseRestoresFocus(
  page: Page,
  options: {
    readonly label: string;
    readonly opener: Locator;
    readonly surface: Locator;
    readonly open: () => Promise<void>;
    /** 열린 직후 포커스가 컨테이너 안에 있어야 하는가(모달·메뉴·창은 true, 인라인 패널은 false 도 허용). */
    readonly focusMovesInside?: boolean;
  },
): Promise<void> {
  const { label, opener, surface } = options;
  await opener.focus();
  await options.open();
  await expect(surface, `${label}: 열리지 않았어요`).toBeVisible();
  if (options.focusMovesInside !== false) {
    await expect
      .poll(() => isFocusInside(surface), { message: `${label}: 열린 뒤 포커스가 안으로 들어오지 않았어요` })
      .toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(surface, `${label}: Esc 로 닫히지 않았어요`).toBeHidden();
  await expect
    .poll(async () => opener.evaluate((element) => element === document.activeElement), {
      message: `${label}: 닫은 뒤 포커스가 여는 단추로 돌아오지 않았어요`,
    })
    .toBe(true);
}

/** 모달 안에서 Tab·Shift+Tab 을 여러 번 눌러도 포커스가 밖으로 새지 않는지 본다. */
export async function expectFocusContained(page: Page, container: Locator, presses: number, label: string): Promise<void> {
  for (const key of ["Tab", "Shift+Tab"] as const) {
    for (let press = 1; press <= presses; press += 1) {
      await page.keyboard.press(key);
      const inside = await isFocusInside(container);
      expect(inside, `${label}: ${key} ${press}번째에 포커스가 모달 밖(${await describeActiveElement(page)})으로 나갔어요`).toBe(true);
    }
  }
}
