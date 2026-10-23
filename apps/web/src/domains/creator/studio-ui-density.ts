/**
 * Studio UI density modes — one stable feature set presented at three levels of chrome.
 *
 * Storage keys stay simple | full | focus for compatibility:
 * - focus  = 집중 작업 (canvas-first, minimum chrome)
 * - simple = 표준 작업 (core tools and panels, advanced launchers folded)
 * - full   = 전체 기능 (all professional tools and panels)
 *
 * Pure prefs model; StudioPage applies the visibility matrix to toolbar clusters and panels.
 *
 * Density policy declaration (BLUEPRINT §4.1) — this module is the ONLY judgment source:
 * - `STUDIO_UI_DENSITY_POLICY` pins the focus/simple/full policy table (audience, chrome,
 *   command exposure, panel scope, persistence) as data, not prose.
 * - `STUDIO_UI_DENSITY_MATRIX` pins region visibility for every mode × region pair.
 *   `studioUiDensityAllows` is a pure lookup into that table; renderers (menubar, toolbar,
 *   panels, launchers) must consume it and must NOT carry their own per-mode conditionals.
 * - `STUDIO_UI_DENSITY_ENTRY_INITIAL_MODE` pins the initial mode per entry path.
 *   A persisted user choice always wins over the entry default (BLUEPRINT §4.1 rollback
 *   guard); the entry table only seeds users who have never saved a mode.
 * - `studioUiDensityFirstScreenExposure` layers the first-screen diet on top of the
 *   matrix: in simple mode the advanced clusters (reference·scene·style·AI) start folded
 *   behind the one "고급 도구 펼치기" expander. Expanding is a persisted user choice
 *   (`advancedExpanded`), never a mode switch; full/focus exposure matches the matrix.
 */

export const STUDIO_UI_DENSITY_MODES = ["focus", "simple", "full"] as const;
export type StudioUiDensityMode = (typeof STUDIO_UI_DENSITY_MODES)[number];

export const STUDIO_UI_DENSITY_STORAGE_KEY = "toonstudio-studio-ui-density:v1";
/** New users start with the predictable core workflow; persisted users keep their saved mode. */
export const DEFAULT_STUDIO_UI_DENSITY_MODE: StudioUiDensityMode = "simple";

/** Every chrome region the density matrix judges. Keep in sync with StudioUiChromeRegion. */
export const STUDIO_UI_CHROME_REGIONS = [
  "toolbar-assets",
  "toolbar-cut",
  "toolbar-draw",
  "toolbar-reference",
  "toolbar-scene",
  "toolbar-style",
  "toolbar-ai",
  "toolbar-insert",
  "left-panel",
  "right-panel",
  "page-strip",
  "status-rail",
  "tool-rail",
  "quick-actions",
] as const;

export type StudioUiChromeRegion = (typeof STUDIO_UI_CHROME_REGIONS)[number];

/** Toolbar clusters that are powerful but not part of the everyday first-screen workflow. */
export const STUDIO_UI_ADVANCED_REGIONS: readonly StudioUiChromeRegion[] = Object.freeze([
  "toolbar-reference",
  "toolbar-scene",
  "toolbar-style",
  "toolbar-ai",
]);

/** Every region that is not advanced is core first-screen workflow. */
export const STUDIO_UI_CORE_REGIONS: readonly StudioUiChromeRegion[] = Object.freeze(
  STUDIO_UI_CHROME_REGIONS.filter(
    (region) => !(STUDIO_UI_ADVANCED_REGIONS as readonly string[]).includes(region)
  )
);

export function isStudioUiAdvancedRegion(region: StudioUiChromeRegion): boolean {
  return (STUDIO_UI_ADVANCED_REGIONS as readonly string[]).includes(region);
}

export interface StudioUiDensityState {
  mode: StudioUiDensityMode;
  /** 고급 도구 펼침 선택. 저장된 적 없으면 접힘(false)이다. */
  advancedExpanded?: boolean;
}

export interface StudioUiDensityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isStudioUiDensityMode(value: unknown): value is StudioUiDensityMode {
  return value === "simple" || value === "full" || value === "focus";
}

export function normalizeStudioUiDensityMode(value: unknown): StudioUiDensityMode {
  return isStudioUiDensityMode(value) ? value : DEFAULT_STUDIO_UI_DENSITY_MODE;
}

export function normalizeStudioUiDensityState(value?: unknown): StudioUiDensityState {
  if (!value || typeof value !== "object") {
    return { mode: DEFAULT_STUDIO_UI_DENSITY_MODE, advancedExpanded: false };
  }
  const record = value as Record<string, unknown>;
  return {
    mode: normalizeStudioUiDensityMode(record.mode ?? record.density),
    advancedExpanded: record.advancedExpanded === true,
  };
}

/** The persisted advanced-expansion choice; absent or corrupt values mean folded. */
export function studioUiDensityAdvancedExpanded(
  state: StudioUiDensityState | null | undefined
): boolean {
  return state?.advancedExpanded === true;
}

export function loadStudioUiDensityState(
  storage: StudioUiDensityStorage | null | undefined
): StudioUiDensityState {
  if (!storage) return normalizeStudioUiDensityState();
  try {
    const raw = storage.getItem(STUDIO_UI_DENSITY_STORAGE_KEY);
    if (!raw) return normalizeStudioUiDensityState();
    return normalizeStudioUiDensityState(JSON.parse(raw));
  } catch {
    return normalizeStudioUiDensityState();
  }
}

export function saveStudioUiDensityState(
  storage: StudioUiDensityStorage | null | undefined,
  state: StudioUiDensityState
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      STUDIO_UI_DENSITY_STORAGE_KEY,
      JSON.stringify(normalizeStudioUiDensityState(state))
    );
    return true;
  } catch {
    return false;
  }
}

export type StudioUiDensityChromeLevel = "minimal" | "standard" | "full";
export type StudioUiDensityCommandExposure = "core" | "core-contextual" | "all";
export type StudioUiDensityPanelScope = "active-only" | "core" | "all";
/** "session" = applies to the current session only; returning to simple is suggested, never forced over a saved choice. */
export type StudioUiDensityPersistence = "session" | "persisted";

export interface StudioUiDensityPolicy {
  chrome: StudioUiDensityChromeLevel;
  commandExposure: StudioUiDensityCommandExposure;
  panelScope: StudioUiDensityPanelScope;
  persistence: StudioUiDensityPersistence;
}

/**
 * The BLUEPRINT §4.1 policy table, declared once.
 * - focus: 숙련자의 몰입 작업 — 최소 크롬, core 명령+검색, 활성 패널만, 세션 한정.
 * - simple: 신규·일반 기본값 — 표준 크롬, core+contextual, 핵심 패널, 설정 저장.
 * - full: 전문가·PD — 전체 크롬, 전부 노출, 전체 패널·런처, 설정 저장.
 */
export const STUDIO_UI_DENSITY_POLICY: Readonly<
  Record<StudioUiDensityMode, StudioUiDensityPolicy>
> = Object.freeze({
  focus: Object.freeze({
    chrome: "minimal",
    commandExposure: "core",
    panelScope: "active-only",
    persistence: "session",
  }),
  simple: Object.freeze({
    chrome: "standard",
    commandExposure: "core-contextual",
    panelScope: "core",
    persistence: "persisted",
  }),
  full: Object.freeze({
    chrome: "full",
    commandExposure: "all",
    panelScope: "all",
    persistence: "persisted",
  }),
});

export function studioUiDensityPolicy(
  mode: StudioUiDensityMode
): StudioUiDensityPolicy {
  return STUDIO_UI_DENSITY_POLICY[normalizeStudioUiDensityMode(mode)];
}

/**
 * Visibility matrix — the single judgment table for mode × region.
 * false means hide the chrome region, never remove the command.
 *
 * - full: every region.
 * - focus: canvas-first — drawing/insertion paths, assets, cut tools, tool rail,
 *   status rail and quick actions only; panels and advanced launchers stay hidden.
 * - simple: the complete webtoon workflow; only the AI launch chrome stays folded.
 *   (Reference visibility additionally honors tools the user explicitly exposed —
 *   that per-tool choice lives in the surface's visibleIds, not in this matrix.)
 */
export const STUDIO_UI_DENSITY_MATRIX: Readonly<
  Record<StudioUiDensityMode, Readonly<Record<StudioUiChromeRegion, boolean>>>
> = Object.freeze({
  focus: Object.freeze({
    "toolbar-assets": true,
    "toolbar-cut": true,
    "toolbar-draw": true,
    "toolbar-reference": false,
    "toolbar-scene": false,
    "toolbar-style": false,
    "toolbar-ai": false,
    "toolbar-insert": true,
    "left-panel": false,
    "right-panel": false,
    "page-strip": false,
    "status-rail": true,
    "tool-rail": true,
    "quick-actions": true,
  }),
  simple: Object.freeze({
    "toolbar-assets": true,
    "toolbar-cut": true,
    "toolbar-draw": true,
    "toolbar-reference": true,
    "toolbar-scene": true,
    "toolbar-style": true,
    "toolbar-ai": false,
    "toolbar-insert": true,
    "left-panel": true,
    "right-panel": true,
    "page-strip": true,
    "status-rail": true,
    "tool-rail": true,
    "quick-actions": true,
  }),
  full: Object.freeze({
    "toolbar-assets": true,
    "toolbar-cut": true,
    "toolbar-draw": true,
    "toolbar-reference": true,
    "toolbar-scene": true,
    "toolbar-style": true,
    "toolbar-ai": true,
    "toolbar-insert": true,
    "left-panel": true,
    "right-panel": true,
    "page-strip": true,
    "status-rail": true,
    "tool-rail": true,
    "quick-actions": true,
  }),
});

/** Visibility judgment — a pure lookup into STUDIO_UI_DENSITY_MATRIX. No other per-mode conditionals. */
export function studioUiDensityAllows(
  mode: StudioUiDensityMode,
  region: StudioUiChromeRegion
): boolean {
  return STUDIO_UI_DENSITY_MATRIX[normalizeStudioUiDensityMode(mode)][region];
}

export type StudioUiFirstScreenExposure = "visible" | "folded" | "hidden";

/**
 * First-screen exposure — what a fresh entry actually shows before any interaction.
 *
 * - full: everything is visible; nothing is ever folded.
 * - focus: the focus core set is visible and everything else is hidden (matrix-identical).
 * - simple: core regions are visible; advanced clusters are "folded" — present on the
 *   surface only as the single advanced-tools expander until the user expands them,
 *   after which they render as visible. Folding never removes a command: the expander
 *   and command search still reach every cluster.
 */
export function studioUiDensityFirstScreenExposure(
  mode: StudioUiDensityMode,
  region: StudioUiChromeRegion,
  advancedExpanded = false
): StudioUiFirstScreenExposure {
  const normalized = normalizeStudioUiDensityMode(mode);
  if (normalized === "full") return "visible";
  if (normalized === "focus") {
    return studioUiDensityAllows("focus", region) ? "visible" : "hidden";
  }
  if (!isStudioUiAdvancedRegion(region)) return "visible";
  return advancedExpanded ? "visible" : "folded";
}

/** Regions shown immediately on first entry in this mode (folded ones excluded). */
export function studioUiDensityFirstScreenVisibleRegions(
  mode: StudioUiDensityMode,
  advancedExpanded = false
): readonly StudioUiChromeRegion[] {
  return STUDIO_UI_CHROME_REGIONS.filter(
    (region) => studioUiDensityFirstScreenExposure(mode, region, advancedExpanded) === "visible"
  );
}

/** How the user arrived at the editor; decides only the seed mode for users with no saved choice. */
export type StudioUiDensityEntryPath = "first-entry" | "learning-mission" | "review-link";

/**
 * Initial mode per entry path (BLUEPRINT §4.1):
 * - first editor entry = simple.
 * - learning-mission entry = simple (the mission bar is surface chrome, not a density mode).
 * - review-link entry = simple (the linked panel opens inside simple; panel state is not density).
 * An explicit `uiMode` launch hint is separate and keeps its existing mapping in studio-launch-mode.ts.
 */
export const STUDIO_UI_DENSITY_ENTRY_INITIAL_MODE: Readonly<
  Record<StudioUiDensityEntryPath, StudioUiDensityMode>
> = Object.freeze({
  "first-entry": "simple",
  "learning-mission": "simple",
  "review-link": "simple",
});

/**
 * Resolve the mode an entry starts in. A persisted choice (any valid saved mode,
 * focus included) is always respected; the entry table applies only when nothing
 * valid was saved — the §4.1 rule that the session-only focus policy never
 * overwrites an existing user's stored selection.
 */
export function resolveStudioUiDensityInitialMode(
  entryPath: StudioUiDensityEntryPath,
  savedMode: unknown
): StudioUiDensityMode {
  return isStudioUiDensityMode(savedMode)
    ? savedMode
    : STUDIO_UI_DENSITY_ENTRY_INITIAL_MODE[entryPath];
}

const DENSITY_LABEL_FALLBACK: Readonly<Record<StudioUiDensityMode, string>> = {
  simple: "기본 작업",
  focus: "집중 작업",
  full: "전체 도구",
};

const DENSITY_DESCRIPTION_FALLBACK: Readonly<Record<StudioUiDensityMode, string>> = {
  simple: "자주 쓰는 도구와 설정을 보여 주고 고급 기능은 필요할 때 펼칩니다.",
  focus: "캔버스와 그리기·말풍선·소재 같은 핵심 도구만 남깁니다.",
  full: "AI·3D를 포함한 모든 전문 도구와 패널을 표시합니다.",
};

function translatedOrFallback(
  t: ((key: string) => string) | undefined,
  key: string,
  fallback: string,
): string {
  if (!t) return fallback;
  const translated = t(key)?.trim();
  return translated && translated !== key ? translated : fallback;
}

/** Short labels describe the work style, not a judgement about the user's skill. */
export function studioUiDensityLabel(
  mode: StudioUiDensityMode,
  t?: (key: string) => string
): string {
  const normalized = normalizeStudioUiDensityMode(mode);
  return translatedOrFallback(
    t,
    `studio.settings.uiDensityMode.${normalized}`,
    DENSITY_LABEL_FALLBACK[normalized],
  );
}

export function studioUiDensityDescription(
  mode: StudioUiDensityMode,
  t?: (key: string) => string
): string {
  const normalized = normalizeStudioUiDensityMode(mode);
  return translatedOrFallback(
    t,
    `studio.settings.uiDensityDescription.${normalized}`,
    DENSITY_DESCRIPTION_FALLBACK[normalized],
  );
}

const ADVANCED_TOOLS_LABEL_FALLBACK = {
  expand: "고급 도구 펼치기",
  collapse: "고급 도구 접기",
} as const;

/** Label for the one first-screen expander that reveals the folded advanced clusters. */
export function studioUiAdvancedToolsToggleLabel(
  expanded: boolean,
  t?: (key: string) => string
): string {
  return translatedOrFallback(
    t,
    expanded
      ? "studio.settings.advancedTools.collapse"
      : "studio.settings.advancedTools.expand",
    expanded ? ADVANCED_TOOLS_LABEL_FALLBACK.collapse : ADVANCED_TOOLS_LABEL_FALLBACK.expand,
  );
}

/**
 * 메뉴바 머리의 '고급 도구 펼치기' 버튼(도구 막대 묶음 펼침)의 접근 이름과 툴팁.
 * 삽입·창작 메뉴 안에도 같은 글자의 펼침 행('고급 도구 펼치기 (N개)', 메뉴 섹션 펼침)이 있어
 * 둘이 헷갈렸다(실사용 감사 B-15). 보이는 글자는 그대로 두고, 접근 이름은 보이는 글자로
 * 시작해(WCAG 2.5.3) 범위를 덧붙인다.
 */
export function studioUiAdvancedToolsToggleAccessibleName(expanded: boolean): string {
  return `${studioUiAdvancedToolsToggleLabel(expanded)} (도구 막대)`;
}

export function studioUiAdvancedToolsToggleTooltip(expanded: boolean): string {
  return expanded
    ? "도구 막대에서 펼친 고급 도구 묶음을 다시 접습니다. 메뉴 안의 '고급 도구 펼치기 (N개)'와는 별개입니다."
    : "도구 막대에 접어 둔 고급 도구 묶음을 펼칩니다. 메뉴 안의 '고급 도구 펼치기 (N개)'와는 별개입니다.";
}

/** Map the existing mobile immersive flag without changing established non-immersive sessions. */
export function studioUiDensityFromImmersive(mobileImmersive: boolean): StudioUiDensityMode {
  return mobileImmersive ? "focus" : "full";
}
