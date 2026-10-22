/**
 * 열린 편집기 접근성 점검의 순수 판정 규칙.
 *
 * 브라우저를 부르는 코드(Playwright·CDP)는 `e2e/helpers/studio-editor-a11y.ts` 에 있고, 여기에는
 * 입력(접근성 트리 노드·계산된 스타일·탭 정지 기록·axe 결과)을 받아 판정을 돌려주는 순수 함수만 둔다.
 * 그래서 규칙이 브라우저 없이 `studio-editor-a11y-audit.test.ts` 로 고정되고, e2e 는 규칙을 호출만 한다.
 *
 * 범위: 이름 없는 상호작용 요소, 틀린 역할 구조, 값·상태가 없는 위젯, 보이지 않는 포커스 표시,
 * 탭 순회의 포커스 유실·순환·순서, axe 위반의 문서화된 예외.
 * 범위 밖: 실제 스크린리더 낭독(NVDA·VoiceOver·TalkBack)과 색 대비 계산(axe 가 맡는다).
 */

// ─── 접근성 트리(CDP `Accessibility.getFullAXTree`) ────────────────────────────────────────────

export interface AxValueLike {
  readonly type?: string;
  readonly value?: unknown;
}

export interface AxPropertyLike {
  readonly name: string;
  readonly value: AxValueLike;
}

/** CDP AXNode 중 판정에 쓰는 부분만 뽑은 구조. 실제 노드는 이 구조에 그대로 대입된다. */
export interface AxNodeLike {
  readonly nodeId: string;
  readonly ignored?: boolean;
  readonly role?: AxValueLike;
  readonly name?: AxValueLike;
  readonly value?: AxValueLike;
  readonly properties?: readonly AxPropertyLike[];
  readonly parentId?: string;
  readonly backendDOMNodeId?: number;
}

export type AccessibilityFindingKind =
  | "name-missing"
  | "name-meaningless"
  | "tab-outside-tablist"
  | "tab-selected-state-missing"
  | "menuitem-outside-menu"
  | "option-outside-listbox"
  | "value-missing"
  | "checked-state-missing";

export interface AccessibilityFinding {
  readonly kind: AccessibilityFindingKind;
  readonly role: string;
  readonly name: string;
  readonly nodeId: string;
  readonly backendDOMNodeId: number | null;
  readonly detail: string;
}

/** 접근성 이름이 반드시 있어야 하는 상호작용 역할. 이름은 화면 낭독기가 가장 먼저 읽는 정보다. */
export const NAMED_INTERACTIVE_ROLES: ReadonlySet<string> = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "combobox",
  "listbox",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "slider",
  "spinbutton",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "treeitem",
]);

const CHECKABLE_ROLES: ReadonlySet<string> = new Set([
  "checkbox",
  "radio",
  "switch",
  "menuitemcheckbox",
  "menuitemradio",
]);

const VALUE_ROLES: ReadonlySet<string> = new Set(["slider", "spinbutton", "scrollbar"]);

const MENUITEM_ROLES: ReadonlySet<string> = new Set(["menuitem", "menuitemcheckbox", "menuitemradio"]);

/** 구조 판정에서 건너뛰는 중립 역할(div·span 같은 래퍼). */
const NEUTRAL_ROLES: ReadonlySet<string> = new Set([
  "generic",
  "none",
  "presentation",
  "GenericContainer",
  "StaticText",
  "InlineTextBox",
]);

const LISTBOX_PARENT_ROLES: ReadonlySet<string> = new Set(["listbox", "MenuListPopup", "combobox"]);

function textOf(value: AxValueLike | undefined): string {
  const raw = value?.value;
  return typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "";
}

/** 공백·제로폭 문자를 정리한 접근성 이름. */
export function normalizeAccessibleName(name: string): string {
  return name.replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "").replace(/\s+/gu, " ").trim();
}

const MEANINGLESS_NAME_WORDS: ReadonlySet<string> = new Set([
  "button",
  "버튼",
  "icon",
  "아이콘",
  "img",
  "svg",
  "link",
  "링크",
  "click",
  "클릭",
  "untitled",
  "undefined",
  "null",
  "nan",
]);

/**
 * 이름은 있지만 목적을 알려 주지 못하는 경우. "이미지"처럼 편집기에서 실제 분류 이름으로 쓰이는 낱말(레이어 필터의
 * "이미지" 칩)은 여기에 넣지 않는다 — 기계적으로 만든 자리표시(button·icon·img·undefined)만 잡는다.
 * - 글자·숫자가 하나도 없는 이름("×", "…")은 낭독기가 기호 이름을 읽을 뿐이다.
 * - 번역 키가 그대로 노출된 이름("studio.assetMenu.upload")은 번역 누락이다.
 * - 파일 이름·주소를 그대로 쓴 이름은 이미지 대체 텍스트를 빠뜨린 흔적이다.
 */
export function isMeaninglessAccessibleName(rawName: string): boolean {
  const name = normalizeAccessibleName(rawName);
  if (name === "") return true;
  if (MEANINGLESS_NAME_WORDS.has(name.toLowerCase())) return true;
  if (!/[\p{L}\p{N}]/u.test(name)) return true;
  if (/^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_-]+){2,}$/u.test(name)) return true;
  if (/\.(?:png|jpe?g|gif|webp|avif|svg)$/iu.test(name) || /^https?:\/\//iu.test(name)) return true;
  return false;
}

function propertyOf(node: AxNodeLike, name: string): AxValueLike | undefined {
  return node.properties?.find((property) => property.name === name)?.value;
}

function roleOf(node: AxNodeLike): string {
  return textOf(node.role);
}

function nearestStructuralAncestor(
  node: AxNodeLike,
  byId: ReadonlyMap<string, AxNodeLike>,
  passThrough: ReadonlySet<string>,
): AxNodeLike | null {
  let parentId = node.parentId;
  const seen = new Set<string>();
  while (parentId !== undefined && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return null;
    const role = roleOf(parent);
    if (!parent.ignored && !NEUTRAL_ROLES.has(role) && !passThrough.has(role)) return parent;
    parentId = parent.parentId;
  }
  return null;
}

/**
 * 접근성 트리에서 이름·역할 위반을 찾는다. 무시된(ignored) 노드는 화면 낭독기가 보지 못하므로 판정하지 않는다.
 * 같은 노드가 여러 규칙에 걸리면 모두 돌려준다.
 */
export function auditAccessibilityTree(nodes: readonly AxNodeLike[]): AccessibilityFinding[] {
  const byId = new Map<string, AxNodeLike>();
  for (const node of nodes) byId.set(node.nodeId, node);

  const findings: AccessibilityFinding[] = [];
  const add = (node: AxNodeLike, kind: AccessibilityFindingKind, detail: string): void => {
    findings.push({
      kind,
      role: roleOf(node),
      name: normalizeAccessibleName(textOf(node.name)),
      nodeId: node.nodeId,
      backendDOMNodeId: typeof node.backendDOMNodeId === "number" ? node.backendDOMNodeId : null,
      detail,
    });
  };

  for (const node of nodes) {
    if (node.ignored) continue;
    const role = roleOf(node);
    if (role === "") continue;
    const name = normalizeAccessibleName(textOf(node.name));

    if (NAMED_INTERACTIVE_ROLES.has(role)) {
      if (name === "") add(node, "name-missing", "접근성 이름이 비어 있어요.");
      else if (isMeaninglessAccessibleName(name)) {
        add(node, "name-meaningless", "이름이 목적을 알려 주지 못해요(기호·번역 키·파일 이름 등).");
      }
    }

    if (role === "tab") {
      const owner = nearestStructuralAncestor(node, byId, new Set());
      if (!owner || roleOf(owner) !== "tablist") {
        add(node, "tab-outside-tablist", "tab 은 tablist 안에 있어야 해요.");
      }
      if (propertyOf(node, "selected") === undefined) {
        add(node, "tab-selected-state-missing", "tab 에 aria-selected 상태가 없어요.");
      }
    }

    if (MENUITEM_ROLES.has(role)) {
      // menu 는 group 으로 항목을 묶을 수 있어서 group 은 건너뛴다.
      const owner = nearestStructuralAncestor(node, byId, new Set(["group", "separator"]));
      const ownerRole = owner ? roleOf(owner) : "";
      if (ownerRole !== "menu" && ownerRole !== "menubar") {
        add(node, "menuitem-outside-menu", "menuitem 은 menu 또는 menubar 안에 있어야 해요.");
      }
    }

    if (role === "option") {
      const owner = nearestStructuralAncestor(node, byId, new Set(["group"]));
      if (!owner || !LISTBOX_PARENT_ROLES.has(roleOf(owner))) {
        add(node, "option-outside-listbox", "option 은 listbox 안에 있어야 해요.");
      }
    }

    if (VALUE_ROLES.has(role)) {
      const hasValue = textOf(node.value) !== "" || propertyOf(node, "valuetext") !== undefined;
      if (!hasValue) add(node, "value-missing", "값(aria-valuenow·valuetext)이 없어요.");
    }

    if (CHECKABLE_ROLES.has(role) && propertyOf(node, "checked") === undefined) {
      add(node, "checked-state-missing", "선택 상태(aria-checked)가 없어요.");
    }
  }

  return findings;
}

/** 단언 실패 메시지용 한 줄 요약. */
export function describeAccessibilityFinding(finding: AccessibilityFinding, domHint: string = ""): string {
  const name = finding.name === "" ? "(이름 없음)" : `"${finding.name}"`;
  const hint = domHint === "" ? "" : ` — ${domHint}`;
  return `[${finding.kind}] ${finding.role} ${name}: ${finding.detail}${hint}`;
}

// ─── axe 결과 ─────────────────────────────────────────────────────────────────────────────

export const BLOCKING_AXE_IMPACTS: ReadonlySet<string> = new Set(["serious", "critical"]);

/**
 * 이름·역할·값(ARIA) 규칙. 영향도와 상관없이 모두 본다 — `aria-allowed-role` 같은 minor 규칙이
 * "역할이 틀린 요소"를 가장 먼저 알려 주기 때문이다. 차단 기준(serious/critical)은 따로 둔다.
 */
export const NAME_ROLE_AXE_RULES: readonly string[] = [
  "aria-allowed-attr",
  "aria-allowed-role",
  "aria-braille-equivalent",
  "aria-command-name",
  "aria-conditional-attr",
  "aria-deprecated-role",
  "aria-dialog-name",
  "aria-hidden-body",
  "aria-hidden-focus",
  "aria-input-field-name",
  "aria-meter-name",
  "aria-progressbar-name",
  "aria-prohibited-attr",
  "aria-required-attr",
  "aria-required-children",
  "aria-required-parent",
  "aria-roles",
  "aria-text",
  "aria-toggle-field-name",
  "aria-tooltip-name",
  "aria-treeitem-name",
  "aria-valid-attr",
  "aria-valid-attr-value",
  "button-name",
  "duplicate-id-aria",
  "input-button-name",
  "label",
  "link-name",
  "nested-interactive",
  "select-name",
];

export interface AxeNodeLike {
  readonly target: readonly unknown[];
  readonly html: string;
}

export interface AxeViolationLike {
  readonly id: string;
  readonly impact?: string | null;
  readonly help: string;
  readonly helpUrl: string;
  readonly nodes: readonly AxeNodeLike[];
}

export interface AxeViolationSummary {
  readonly id: string;
  readonly impact: string;
  readonly help: string;
  readonly helpUrl: string;
  readonly targets: string[];
  readonly html: string[];
}

/** axe 의 중첩 target(그림자 DOM·프레임)을 한 줄 선택자로 편다. */
export function axeTargetKey(target: readonly unknown[]): string {
  return target
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

/** 예외 판정 표의 키. 같은 규칙·같은 대상이면 같은 키다. */
export function axeExemptionKey(ruleId: string, target: readonly unknown[]): string {
  return `${ruleId}\u0000${axeTargetKey(target)}`;
}

export interface SummarizeAxeOptions {
  /** 이 영향도의 위반만 남긴다. 기본은 serious·critical. */
  readonly impacts?: ReadonlySet<string>;
  /** `axeExemptionKey` 로 만든 예외 키. 문서화된 예외 노드는 빠진다. */
  readonly exemptKeys?: ReadonlySet<string>;
}

/** 차단 영향도의 위반만, 예외 노드를 뺀 채로 요약한다. 노드가 남지 않은 위반은 사라진다. */
export function summarizeAxeViolations(
  violations: readonly AxeViolationLike[],
  options: SummarizeAxeOptions = {},
): AxeViolationSummary[] {
  const impacts = options.impacts ?? BLOCKING_AXE_IMPACTS;
  const exempt = options.exemptKeys ?? new Set<string>();
  const summaries: AxeViolationSummary[] = [];
  for (const violation of violations) {
    const impact = violation.impact ?? "unknown";
    if (!impacts.has(impact)) continue;
    const kept = violation.nodes.filter((node) => !exempt.has(axeExemptionKey(violation.id, node.target)));
    if (kept.length === 0) continue;
    summaries.push({
      id: violation.id,
      impact,
      help: violation.help,
      helpUrl: violation.helpUrl,
      targets: kept.slice(0, 6).map((node) => axeTargetKey(node.target)),
      html: kept.slice(0, 6).map((node) => node.html.slice(0, 240)),
    });
  }
  return summaries;
}

/** 단언 실패 메시지용 한 줄 요약: `critical aria-required-parent: 대상1 | 대상2 — 도움말`. */
export function describeAxeViolation(summary: AxeViolationSummary): string {
  return `${summary.impact} ${summary.id}: ${summary.targets.join(" | ")} — ${summary.help}`;
}

export interface AxeExemption {
  readonly id: string;
  readonly ruleId: string;
  /** 위반 노드가 이 선택자와 일치하면 예외다(`Element.matches`). */
  readonly selector: string;
  readonly reason: string;
}

/**
 * 문서화된 예외. 여기에 항목을 더하려면 같은 기능을 하는 다른 조작이 있다는 근거를 `reason` 에 적어야 하고,
 * 문서(docs/features/accessibility-stage1.md)의 "예외" 표와 함께 바꾼다.
 */
export const STUDIO_EDITOR_AXE_EXEMPTIONS: readonly AxeExemption[] = [
  {
    id: "floating-resize-handles",
    ruleId: "target-size",
    selector: "[data-studio-floating-surface-resize-handle]",
    reason:
      "떠 있는 창의 크기 조절 손잡이 8개는 테두리 6px·모서리 16px 의 포인터 전용 영역이다. WCAG 2.5.8 의 " +
      "'동등한 조작' 예외로 본다 — 같은 창의 '최대 크기' 단추와 '창 배치 메뉴'의 최소·권장·최대 크기 항목, " +
      "그리고 Alt+방향키 크기 조절이 같은 기능을 24px 이상 목표로 제공한다.",
  },
];

// ─── 포커스 표시 ──────────────────────────────────────────────────────────────────────────

export interface FocusStyleSnapshot {
  readonly outlineStyle: string;
  readonly outlineWidth: string;
  readonly outlineColor: string;
  readonly boxShadow: string;
}

export type FocusIndicatorKind = "outline" | "ring" | "none";

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** CSS 색 문자열의 알파값. 해석하지 못하면 불투명(1)으로 본다. */
export function colorAlpha(color: string): number {
  const text = color.trim().toLowerCase();
  if (text === "" || text === "transparent") return 0;
  const slash = /\/\s*([\d.]+)(%?)\s*\)/u.exec(text);
  if (slash) {
    const amount = Number.parseFloat(slash[1] ?? "1");
    return slash[2] === "%" ? amount / 100 : amount;
  }
  const legacy = /^(?:rgba|hsla)\(([^)]*)\)$/u.exec(text);
  if (legacy) {
    const parts = (legacy[1] ?? "").split(",");
    if (parts.length >= 4) {
      const amount = Number.parseFloat(parts[3] ?? "1");
      return Number.isFinite(amount) ? amount : 1;
    }
  }
  return 1;
}

function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

const RING_MIN_SPREAD_PX = 1.5;
const FOCUS_MIN_ALPHA = 0.35;

/**
 * 포커스된 요소의 계산된 스타일에서 포커스 표시를 분류한다.
 * - outline: 실선·점선 윤곽선이 1px 이상이고 투명하지 않다.
 * - ring: 번지지 않는 두꺼운 box-shadow(퍼짐 1.5px 이상, 어느 방향으로도 치우치지 않음)가 투명하지 않다.
 *   떠 있는 카드의 그림자(퍼짐 0, 한쪽으로 치우침)는 표시로 세지 않는다.
 * - none: 둘 다 아니다. 의사 요소(슬라이더 손잡이 등)로 그리는 표시는 여기서 못 보므로 호출 쪽이 화면 비교로 다시 본다.
 */
export function classifyFocusIndicator(style: FocusStyleSnapshot): FocusIndicatorKind {
  const outlineVisible =
    style.outlineStyle !== "none" &&
    style.outlineStyle !== "hidden" &&
    pixels(style.outlineWidth) >= 1 &&
    colorAlpha(style.outlineColor) >= FOCUS_MIN_ALPHA;
  if (outlineVisible) return "outline";

  if (style.boxShadow.trim() !== "" && style.boxShadow.trim() !== "none") {
    for (const layer of splitTopLevelCommas(style.boxShadow)) {
      const lengths = [...layer.matchAll(/(-?\d*\.?\d+)px/gu)].map((match) => Number.parseFloat(match[1] ?? "0"));
      const [offsetX = 0, offsetY = 0, , spread = 0] = lengths;
      const color = layer.replace(/(-?\d*\.?\d+)px/gu, "").replace(/\binset\b/gu, "").trim();
      const concentric = Math.abs(offsetX) <= spread && Math.abs(offsetY) <= spread;
      if (spread >= RING_MIN_SPREAD_PX && concentric && colorAlpha(color) >= FOCUS_MIN_ALPHA) return "ring";
    }
  }
  return "none";
}

// ─── 탭 순회 ──────────────────────────────────────────────────────────────────────────────

export interface TabStopRecord {
  /** 1부터 세는 Tab 누름 횟수. */
  readonly index: number;
  /** 요소를 구분하는 키(같은 요소를 두 번 만났는지 가리는 데 쓴다). */
  readonly key: string;
  readonly region: string;
  readonly tag: string;
  readonly role: string;
  readonly name: string;
  /** 문서 본문 자체가 포커스를 가졌다(= 포커스가 문서 밖으로 나갔거나 사라졌다). */
  readonly isDocumentBody: boolean;
  readonly inViewport: boolean;
  /** 컴퓨터 스타일로 본 분류. "none" 이면 화면 비교로 한 번 더 본 결과를 `pixelVerified` 에 적는다. */
  readonly indicator: FocusIndicatorKind;
  readonly pixelVerified: boolean;
}

export interface TabTraversalExpectation {
  /** 처음 방문하는 순서가 이 순서와 같아야 하는 영역들. */
  readonly regionOrder: readonly string[];
}

export interface TabTraversalReport {
  readonly problems: string[];
  readonly firstIndexByRegion: Readonly<Record<string, number>>;
  readonly stops: number;
}

function stopLabel(stop: TabStopRecord): string {
  return `#${stop.index} ${stop.region}/${stop.tag}${stop.role === "" ? "" : `[${stop.role}]`} "${stop.name}"`;
}

/**
 * 탭 정지 기록을 분석한다.
 * - 포커스 유실: 순회가 끝나기 전에 문서 본문이 포커스를 가졌다. 마지막 정지에서만 허용한다.
 * - 순환 함정: 같은 요소를 두 번 만났는데 아직 모든 영역을 지나지 못했다.
 * - 영역 누락·순서: 기대 영역을 지나지 못했거나, 처음 방문한 순서가 기대와 다르다.
 * - 포커스 표시 없음, 화면 밖 포커스, 이름 없는 정지.
 */
export function analyzeTabTraversal(
  stops: readonly TabStopRecord[],
  expectation: TabTraversalExpectation,
): TabTraversalReport {
  const problems: string[] = [];
  const firstIndexByRegion: Record<string, number> = {};
  const seenKeys = new Map<string, TabStopRecord>();

  const lastIndex = stops.length - 1;
  stops.forEach((stop, position) => {
    if (stop.isDocumentBody) {
      if (position !== lastIndex) {
        const previous = stops[position - 1];
        problems.push(
          `포커스 유실: ${stopLabel(stop)} — 순회 도중 포커스가 문서 본문으로 떨어졌어요(직전 ${previous ? stopLabel(previous) : "시작"}).`,
        );
      }
      return;
    }

    if (firstIndexByRegion[stop.region] === undefined) firstIndexByRegion[stop.region] = stop.index;

    const earlier = seenKeys.get(stop.key);
    if (earlier) {
      const missing = expectation.regionOrder.filter((region) => firstIndexByRegion[region] === undefined);
      if (missing.length > 0) {
        problems.push(
          `순환 함정: ${stopLabel(stop)} 를 ${stopLabel(earlier)} 에 이어 다시 만났는데 아직 ${missing.join(", ")} 영역을 지나지 못했어요.`,
        );
      }
    } else {
      seenKeys.set(stop.key, stop);
    }

    if (stop.indicator === "none" && !stop.pixelVerified) {
      problems.push(`포커스 표시 없음: ${stopLabel(stop)} — 윤곽선·링도 없고 화면 비교에서도 변화가 없어요.`);
    }
    if (!stop.inViewport) {
      problems.push(`화면 밖 포커스: ${stopLabel(stop)} — 포커스된 요소가 보이는 영역 밖에 있어요.`);
    }
    if (stop.name === "") {
      problems.push(`이름 없는 정지: ${stopLabel(stop)}.`);
    }
  });

  let previousIndex = 0;
  for (const region of expectation.regionOrder) {
    const index = firstIndexByRegion[region];
    if (index === undefined) {
      problems.push(`영역 누락: ${region} 영역을 Tab 으로 지나지 못했어요.`);
      continue;
    }
    if (index < previousIndex) {
      problems.push(`영역 순서: ${region} 영역이 기대 순서(${expectation.regionOrder.join(" → ")})보다 앞서 나왔어요.`);
    }
    previousIndex = Math.max(previousIndex, index);
  }

  return { problems, firstIndexByRegion, stops: stops.length };
}

export interface TraversalDirectionComparison {
  /** 앞으로·거꾸로 순서가 서로 거울이 아니다 — 키 처리 코드가 방향에 따라 포커스를 옮기는 신호다. */
  readonly problems: string[];
  /** 앞으로만 닿은 요소. 상태에 따라 나타났다 사라지는 요소(연결 상태 단추 등)도 여기 든다. */
  readonly onlyForward: string[];
  /** 거꾸로만 닿은 요소. */
  readonly onlyBackward: string[];
}

function firstOccurrences(stops: readonly TabStopRecord[]): TabStopRecord[] {
  const seen = new Set<string>();
  const result: TabStopRecord[] = [];
  for (const stop of stops) {
    if (stop.isDocumentBody || seen.has(stop.key)) continue;
    seen.add(stop.key);
    result.push(stop);
  }
  return result;
}

/**
 * Tab 으로 지난 순서와 Shift+Tab 으로 지난 순서를 견준다.
 * 같은 요소끼리 보면 거꾸로 지난 순서는 앞으로 지난 순서를 뒤집은 것이어야 한다. 어긋나면 `problems` 다.
 * 한쪽에서만 닿은 요소는 순서 문제가 아니라 그 사이에 DOM 이 바뀐 것일 수 있어(연결 상태에 따라 켜지고 꺼지는
 * 단추 등) 문제로 세지 않고 목록으로만 돌려준다. 두 걸음 이상 어긋난 요소는 `problems` 가 잡는다.
 */
export function compareTraversalDirections(
  forward: readonly TabStopRecord[],
  backward: readonly TabStopRecord[],
): TraversalDirectionComparison {
  const forwardStops = firstOccurrences(forward);
  const backwardStops = firstOccurrences(backward);
  const forwardKeys = new Set(forwardStops.map((stop) => stop.key));
  const backwardKeys = new Set(backwardStops.map((stop) => stop.key));

  const forwardCommon = forwardStops.filter((stop) => backwardKeys.has(stop.key));
  const backwardCommon = backwardStops.filter((stop) => forwardKeys.has(stop.key)).reverse();

  const problems: string[] = [];
  const length = Math.max(forwardCommon.length, backwardCommon.length);
  for (let index = 0; index < length; index += 1) {
    const expected = forwardCommon[index];
    const actual = backwardCommon[index];
    if (expected?.key !== actual?.key) {
      problems.push(
        `순서 비대칭: 공통 요소 ${index + 1}번째가 앞으로는 ${expected ? stopLabel(expected) : "(없음)"}, ` +
          `거꾸로는 ${actual ? stopLabel(actual) : "(없음)"} 이에요.`,
      );
      break;
    }
  }

  return {
    problems,
    onlyForward: forwardStops.filter((stop) => !backwardKeys.has(stop.key)).map(stopLabel),
    onlyBackward: backwardStops.filter((stop) => !forwardKeys.has(stop.key)).map(stopLabel),
  };
}
