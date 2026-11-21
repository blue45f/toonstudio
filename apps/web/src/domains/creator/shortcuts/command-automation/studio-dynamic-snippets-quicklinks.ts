/**
 * Raycast형 동적 플레이스홀더 스니펫 · 컨텍스트 퀵링크 · 파라미터 커맨드 매크로 엔진.
 *
 * 기능:
 * 1. 실행 시점 동적 플레이스홀더 치환(`{episode}`, `{cut}`, `{character}`, `{palette}`,
 *    `{selection}`, `{date:YYYY-MM-DD}`, `{clipboard | trim | uppercase | lowercase}`, `{cursor}`)
 * 2. 키워드 스니펫 트리거 매칭(한국어 IME 조합 중 자동 비활성 가드 포함)
 * 3. 허용 스킴 기반 컨텍스트 퀵링크(`cut://`, `bg3d-cam://`, `storybible://`, `filter-preset://`)
 * 4. 허용 목록(Allowlist) 기반 파라미터화 커맨드 매크로 체인 & 단일 원자적 Undo 묶음 계획
 * 5. `⌘K` 결과 행의 2차 액션 패널 모델 및 민감정보 차단 팀 JSON 내보내기/가져오기
 */

export const STUDIO_QUICKLINK_SCHEMES = [
  "cut",
  "bg3d-cam",
  "storybible",
  "filter-preset",
] as const;

export type StudioQuicklinkScheme = (typeof STUDIO_QUICKLINK_SCHEMES)[number];

export interface DynamicTemplateContext {
  readonly episode?: string;
  readonly cut?: string;
  readonly character?: string;
  readonly palette?: string;
  readonly selection?: string;
  readonly clipboard?: string;
  /** 결정론적 테스트·재현을 위한 기준 시각(생략 시 현재 시각). */
  readonly now?: Date;
}

export interface ExpandedTemplateResult {
  readonly text: string;
  /** `{cursor}` 플레이스홀더가 지정한 최종 캐럿 위치(없으면 null). */
  readonly cursorOffset: number | null;
  readonly resolvedTokens: readonly string[];
  readonly unresolvedTokens: readonly string[];
}

export interface StudioDynamicSnippet {
  readonly id: string;
  readonly trigger: string;
  readonly titleKo: string;
  readonly template: string;
  readonly category: "lettering" | "prompt" | "naming" | "direction";
}

export interface SnippetMatchResult {
  readonly matched: boolean;
  readonly blockedByIme: boolean;
  readonly snippet: StudioDynamicSnippet | null;
  readonly nextText: string;
  readonly nextCaretOffset: number;
}

export interface StudioContextQuicklink {
  readonly id: string;
  readonly titleKo: string;
  readonly scheme: StudioQuicklinkScheme;
  readonly targetPath: string;
  readonly params?: Readonly<Record<string, string>>;
}

export interface ParsedStudioQuicklinkUri {
  readonly valid: boolean;
  readonly scheme: StudioQuicklinkScheme | null;
  readonly targetPath: string;
  readonly params: Readonly<Record<string, string>>;
  readonly errorKo?: string;
}

export interface CommandMacroStep {
  readonly commandId: string;
  readonly args?: Readonly<Record<string, string | number | boolean>>;
}

export interface StudioCommandMacro {
  readonly id: string;
  readonly titleKo: string;
  readonly steps: readonly CommandMacroStep[];
}

export interface ResolvedMacroStep {
  readonly commandId: string;
  readonly resolvedArgs: Readonly<Record<string, string | number | boolean>>;
}

export interface CommandMacroExecutionPlan {
  readonly ok: boolean;
  readonly macroId: string;
  readonly atomicUndoLabelKo: string;
  readonly steps: readonly ResolvedMacroStep[];
  readonly rejectedCommandIds: readonly string[];
}

export type SecondaryCommandActionId =
  | "execute"
  | "pin-quick-slot"
  | "add-to-macro"
  | "copy-deeplink"
  | "bind-shortcut";

export interface SecondaryCommandAction {
  readonly id: SecondaryCommandActionId;
  readonly labelKo: string;
  readonly shortcutHint: string;
}

export interface AutomationPresetPackV1 {
  readonly version: 1;
  readonly snippets: readonly StudioDynamicSnippet[];
  readonly quicklinks: readonly StudioContextQuicklink[];
  readonly macros: readonly StudioCommandMacro[];
}

const CURSOR_SENTINEL = "\u0000__STUDIO_CURSOR__\u0000";

const SECRET_GUARD_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/u,
  /\bBearer\s+[A-Za-z0-9._-]{16,}\b/iu,
  /\b(?:api[_-]?key|secret[_-]?token|password)\s*[:=]\s*\S+/iu,
];

function formatDateByPattern(date: Date, pattern: string): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return pattern
    .replaceAll("YYYY", yyyy)
    .replaceAll("MM", mm)
    .replaceAll("DD", dd)
    .replaceAll("HH", hh)
    .replaceAll("mm", min);
}

function applyPipeTransform(value: string, pipe: string): string {
  const norm = pipe.trim().toLowerCase();
  if (norm === "trim") return value.trim();
  if (norm === "uppercase") return value.toUpperCase();
  if (norm === "lowercase") return value.toLowerCase();
  if (norm === "slug") {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/gu, "-")
      .replace(/^-+|-+$/gu, "");
  }
  return value;
}

/**
 * 동적 플레이스홀더 템플릿을 현재 문서 컨텍스트로 치환하고 `{cursor}` 최종 위치를 계산한다.
 */
export function expandDynamicTemplate(
  template: string,
  context: DynamicTemplateContext,
): ExpandedTemplateResult {
  const now = context.now ?? new Date();
  const resolvedTokens: string[] = [];
  const unresolvedTokens: string[] = [];
  let hasCursor = false;

  const replaced = template.replace(/\{([^{}]+)\}/gu, (fullMatch, rawExpr: string) => {
    const expr = rawExpr.trim();
    if (expr === "cursor") {
      if (!hasCursor) {
        hasCursor = true;
        resolvedTokens.push("cursor");
        return CURSOR_SENTINEL;
      }
      return "";
    }

    const segments = expr.split("|").map((s) => s.trim());
    const head = segments[0] ?? "";
    const pipes = segments.slice(1);

    let baseValue: string | undefined;
    if (head === "date" || head.startsWith("date:")) {
      const fmt = head.includes(":") ? head.slice(head.indexOf(":") + 1).trim() : "YYYY-MM-DD";
      baseValue = formatDateByPattern(now, fmt || "YYYY-MM-DD");
    } else if (head === "episode") {
      baseValue = context.episode;
    } else if (head === "cut") {
      baseValue = context.cut;
    } else if (head === "character") {
      baseValue = context.character;
    } else if (head === "palette") {
      baseValue = context.palette;
    } else if (head === "selection") {
      baseValue = context.selection;
    } else if (head === "clipboard") {
      baseValue = context.clipboard;
    }

    if (baseValue === undefined) {
      unresolvedTokens.push(head);
      return fullMatch;
    }

    let transformed = baseValue;
    for (const pipe of pipes) {
      transformed = applyPipeTransform(transformed, pipe);
    }
    resolvedTokens.push(head);
    return transformed;
  });

  const cursorIdx = replaced.indexOf(CURSOR_SENTINEL);
  if (cursorIdx >= 0) {
    const text = replaced.replace(CURSOR_SENTINEL, "");
    return {
      text,
      cursorOffset: cursorIdx,
      resolvedTokens: Object.freeze(resolvedTokens),
      unresolvedTokens: Object.freeze(unresolvedTokens),
    };
  }

  return {
    text: replaced,
    cursorOffset: null,
    resolvedTokens: Object.freeze(resolvedTokens),
    unresolvedTokens: Object.freeze(unresolvedTokens),
  };
}

/**
 * 입력 버퍼 끝의 스니펫 트리거(예: `!내레이션`)를 탐지해 확장한다.
 * 한국어 IME 조합 중(`isComposing: true`)에는 자모 깨짐을 막기 위해 확장을 보류한다.
 */
export function matchAndExpandSnippetTrigger(options: {
  readonly inputText: string;
  readonly caretOffset: number;
  readonly snippets: readonly StudioDynamicSnippet[];
  readonly context: DynamicTemplateContext;
  readonly isComposing?: boolean;
}): SnippetMatchResult {
  const caret = Math.max(0, Math.min(options.inputText.length, Math.trunc(options.caretOffset)));
  if (options.isComposing === true) {
    return {
      matched: false,
      blockedByIme: true,
      snippet: null,
      nextText: options.inputText,
      nextCaretOffset: caret,
    };
  }

  const beforeCaret = options.inputText.slice(0, caret);
  const afterCaret = options.inputText.slice(caret);

  // 가장 긴 트리거부터 검사해 부분 접두 충돌을 방지한다.
  const sorted = [...options.snippets]
    .filter((s) => s.trigger.trim().length > 0)
    .sort((a, b) => b.trigger.length - a.trigger.length);

  for (const snippet of sorted) {
    if (!beforeCaret.endsWith(snippet.trigger)) continue;
    const prefixEnd = beforeCaret.length - snippet.trigger.length;
    // 앞 문자가 공백·줄바꿈·문장 시작일 때만 트리거 허용
    if (prefixEnd > 0 && !/[\s([{]/u.test(beforeCaret[prefixEnd - 1]!)) continue;

    const expanded = expandDynamicTemplate(snippet.template, options.context);
    const prefix = beforeCaret.slice(0, prefixEnd);
    const nextText = `${prefix}${expanded.text}${afterCaret}`;
    const nextCaretOffset =
      expanded.cursorOffset !== null
        ? prefix.length + expanded.cursorOffset
        : prefix.length + expanded.text.length;

    return {
      matched: true,
      blockedByIme: false,
      snippet,
      nextText,
      nextCaretOffset,
    };
  }

  return {
    matched: false,
    blockedByIme: false,
    snippet: null,
    nextText: options.inputText,
    nextCaretOffset: caret,
  };
}

// ── 컨텍스트 퀵링크 (허용 스킴 검증) ────────────────────────────────

export function buildStudioQuicklinkUri(quicklink: {
  readonly scheme: StudioQuicklinkScheme;
  readonly targetPath: string;
  readonly params?: Readonly<Record<string, string>>;
}): string {
  const cleanTarget = quicklink.targetPath.trim().replace(/^\/+/u, "");
  const queryEntries = Object.entries(quicklink.params ?? {}).filter(
    ([k, v]) => k.trim().length > 0 && v.trim().length > 0,
  );
  if (queryEntries.length === 0) {
    return `${quicklink.scheme}://${cleanTarget}`;
  }
  const qs = queryEntries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${quicklink.scheme}://${cleanTarget}?${qs}`;
}

export function parseStudioQuicklinkUri(rawUri: string): ParsedStudioQuicklinkUri {
  const trimmed = rawUri.trim();
  const match = /^([a-z0-9-]+):\/\/([^?]+)(?:\?(.*))?$/iu.exec(trimmed);
  if (!match) {
    return {
      valid: false,
      scheme: null,
      targetPath: "",
      params: Object.freeze({}),
      errorKo: "유효한 스튜디오 퀵링크 형식이 아닙니다.",
    };
  }

  const schemeCandidate = match[1]!.toLowerCase();
  if (!STUDIO_QUICKLINK_SCHEMES.includes(schemeCandidate as StudioQuicklinkScheme)) {
    return {
      valid: false,
      scheme: null,
      targetPath: "",
      params: Object.freeze({}),
      errorKo: `허용되지 않은 퀵링크 스킴입니다: ${schemeCandidate}`,
    };
  }

  const targetPath = match[2]!.trim();
  if (!targetPath || targetPath.includes("..")) {
    return {
      valid: false,
      scheme: null,
      targetPath: "",
      params: Object.freeze({}),
      errorKo: "퀵링크 대상 경로가 안전하지 않습니다.",
    };
  }

  const params: Record<string, string> = {};
  const query = match[3] ?? "";
  if (query.length > 0) {
    for (const pair of query.split("&")) {
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const k = decodeURIComponent(pair.slice(0, eq));
      const v = decodeURIComponent(pair.slice(eq + 1));
      if (k !== "__proto__" && k !== "constructor" && k !== "prototype") {
        params[k] = v;
      }
    }
  }

  return {
    valid: true,
    scheme: schemeCandidate as StudioQuicklinkScheme,
    targetPath,
    params: Object.freeze(params),
  };
}

// ── 파라미터화 커맨드 매크로 체인 & 2차 액션 패널 ────────────────────

export function planCommandMacroExecution(
  macro: StudioCommandMacro,
  allowedCommandIds: ReadonlySet<string>,
  context: DynamicTemplateContext,
): CommandMacroExecutionPlan {
  const steps: ResolvedMacroStep[] = [];
  const rejectedCommandIds: string[] = [];

  for (const step of macro.steps) {
    if (!allowedCommandIds.has(step.commandId)) {
      rejectedCommandIds.push(step.commandId);
      continue;
    }
    const resolvedArgs: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(step.args ?? {})) {
      resolvedArgs[k] = typeof v === "string" ? expandDynamicTemplate(v, context).text : v;
    }
    steps.push({
      commandId: step.commandId,
      resolvedArgs: Object.freeze(resolvedArgs),
    });
  }

  return {
    ok: rejectedCommandIds.length === 0 && steps.length > 0,
    macroId: macro.id,
    atomicUndoLabelKo: `매크로 실행: ${macro.titleKo} (${steps.length}단계)`,
    steps: Object.freeze(steps),
    rejectedCommandIds: Object.freeze(rejectedCommandIds),
  };
}

/**
 * `⌘K` 명령 검색 결과 행에서 `⌘⇧K` 또는 `Tab`으로 여는 2차 액션 패널 항목을 구성한다.
 */
export function buildCommandSecondaryActions(options: {
  readonly isPinnedQuickSlot: boolean;
  readonly hasDeeplink: boolean;
}): readonly SecondaryCommandAction[] {
  const actions: SecondaryCommandAction[] = [
    { id: "execute", labelKo: "지금 실행", shortcutHint: "Enter" },
    {
      id: "pin-quick-slot",
      labelKo: options.isPinnedQuickSlot ? "퀵슬롯 고정 해제" : "퀵슬롯에 고정",
      shortcutHint: "P",
    },
    { id: "add-to-macro", labelKo: "매크로 체인에 추가", shortcutHint: "M" },
  ];
  if (options.hasDeeplink) {
    actions.push({ id: "copy-deeplink", labelKo: "컨텍스트 퀵링크 복사", shortcutHint: "C" });
  }
  actions.push({ id: "bind-shortcut", labelKo: "단축키 지정", shortcutHint: "K" });
  return Object.freeze(actions);
}

// ── 민감정보 차단 팀 프리셋 JSON 직렬화 ──────────────────────────────

export function containsSensitiveSecretPattern(value: string): boolean {
  return SECRET_GUARD_PATTERNS.some((pattern) => pattern.test(value));
}

export function exportAutomationPackJson(
  pack: Omit<AutomationPresetPackV1, "version">,
): { readonly ok: boolean; readonly json: string | null; readonly errorKo?: string } {
  const payload: AutomationPresetPackV1 = {
    version: 1,
    snippets: pack.snippets,
    quicklinks: pack.quicklinks,
    macros: pack.macros,
  };
  const serialized = JSON.stringify(payload);
  if (containsSensitiveSecretPattern(serialized)) {
    return {
      ok: false,
      json: null,
      errorKo: "API 키나 토큰으로 보이는 민감한 값이 포함되어 내보내기를 차단했습니다.",
    };
  }
  return { ok: true, json: serialized };
}

export function importAutomationPackJson(
  rawJson: string,
): { readonly ok: boolean; readonly pack: AutomationPresetPackV1 | null; readonly errorKo?: string } {
  if (containsSensitiveSecretPattern(rawJson)) {
    return {
      ok: false,
      pack: null,
      errorKo: "민감한 인증 문자열이 포함된 자동화 팩은 가져올 수 없습니다.",
    };
  }
  try {
    const parsed = JSON.parse(rawJson) as Partial<AutomationPresetPackV1>;
    if (!parsed || parsed.version !== 1) {
      return { ok: false, pack: null, errorKo: "지원하지 않는 자동화 팩 형식입니다." };
    }
    return {
      ok: true,
      pack: {
        version: 1,
        snippets: Array.isArray(parsed.snippets) ? Object.freeze([...parsed.snippets]) : [],
        quicklinks: Array.isArray(parsed.quicklinks) ? Object.freeze([...parsed.quicklinks]) : [],
        macros: Array.isArray(parsed.macros) ? Object.freeze([...parsed.macros]) : [],
      },
    };
  } catch {
    return { ok: false, pack: null, errorKo: "JSON 구문을 해석하지 못했습니다." };
  }
}
