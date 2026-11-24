/**
 * 온디바이스 로컬 크리에이터 습관 학습 타입 · 프라이버시 계약 · OKLCH 지각 수학 유틸리티.
 * 외부 네트워크 호출 0건 · Web Storage 미사용 · 원시 hex/rgb/hsl 리터럴 0건.
 */

export const LOCAL_HABIT_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const LOCAL_HABIT_OPFS_DIR = "toonstudio-local-creator-copilot";
export const LOCAL_HABIT_OPFS_FILE = "creator-habits-v1.json";

export const MAX_COLOR_OBSERVATIONS = 600;
export const MAX_ACTION_HISTORY = 240;
export const MAX_IMPORT_JSON_BYTES = 1_048_576;
export const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const LOCAL_COPILOT_PRIVACY_CONTRACT = Object.freeze({
  externalBytesTransmitted: 0 as const,
  externalNetworkCalls: 0 as const,
  storageAuthority: "on-device-opfs-or-memory" as const,
  optInRequired: true as const,
  usesWebStorage: false as const,
  badgeTextKo: "로컬 전용 · 외부 전송 0바이트",
  badgeTextEn: "Local Only · 0 Bytes Sent",
});

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export interface OklabPoint {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export type ColorUsageKind = "lineart" | "base-fill" | "shading" | "highlight" | "background";
export type BrushWorkflowStage = "rough" | "ink" | "flat" | "shade" | "fx" | "lettering";
export type PanelAspectRatioKey = "9:16" | "4:5" | "16:9" | "1:1" | "2:3" | "3:4";
export type PanelLayoutAnchor = "top-left" | "top-center" | "center" | "bottom-wide" | "full-bleed" | "gutter-split";
export type StudioActionCategory = "panel" | "layer" | "color" | "brush" | "export";

export const PANEL_ASPECT_KEYS: readonly PanelAspectRatioKey[] = ["9:16", "4:5", "16:9", "1:1", "2:3", "3:4"];
export const PANEL_ANCHOR_KEYS: readonly PanelLayoutAnchor[] = [
  "top-left", "top-center", "center", "bottom-wide", "full-bleed", "gutter-split",
];

export const PANEL_ANCHOR_LABELS: Readonly<Record<PanelLayoutAnchor, { readonly ko: string; readonly en: string }>> = {
  "top-left": { ko: "좌상단 시작", en: "Top-Left Lead" },
  "top-center": { ko: "상단 중앙", en: "Top Center" },
  center: { ko: "화면 중앙", en: "Center Focus" },
  "bottom-wide": { ko: "하단 와이드", en: "Bottom Wide" },
  "full-bleed": { ko: "전면 블리드", en: "Full Bleed" },
  "gutter-split": { ko: "여백 분할", en: "Gutter Split" },
};

export const COLOR_USAGE_LABELS: Readonly<Record<ColorUsageKind, { readonly ko: string; readonly en: string }>> = {
  lineart: { ko: "선화", en: "Lineart" },
  "base-fill": { ko: "밑색", en: "Base Fill" },
  shading: { ko: "명암", en: "Shading" },
  highlight: { ko: "하이라이트", en: "Highlight" },
  background: { ko: "배경", en: "Background" },
};

export interface ColorUsedHabitEvent {
  readonly kind: "color-used";
  readonly color: OklchColor;
  readonly weight?: number;
  readonly usage?: ColorUsageKind;
  readonly timestampMs?: number;
}

export interface BrushSelectedHabitEvent {
  readonly kind: "brush-selected";
  readonly brushId: string;
  readonly brushLabelKo?: string;
  readonly brushLabelEn?: string;
  readonly stage?: BrushWorkflowStage;
  readonly timestampMs?: number;
}

export interface PanelCreatedHabitEvent {
  readonly kind: "panel-created";
  readonly aspectRatio: PanelAspectRatioKey;
  readonly anchor: PanelLayoutAnchor;
  readonly timestampMs?: number;
}

export interface StudioActionHabitEvent {
  readonly kind: "studio-action";
  readonly actionId: string;
  readonly labelKo?: string;
  readonly labelEn?: string;
  readonly category?: StudioActionCategory;
  readonly timestampMs?: number;
}

export type CreatorHabitEvent =
  | ColorUsedHabitEvent
  | BrushSelectedHabitEvent
  | PanelCreatedHabitEvent
  | StudioActionHabitEvent;

export interface StoredColorObservation {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly weight: number;
  readonly usage: ColorUsageKind;
}

export interface BrushDescriptor {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly stage: BrushWorkflowStage;
  readonly totalUses: number;
}

export interface ActionDescriptor {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly category: StudioActionCategory;
  readonly totalRuns: number;
}

export interface LocalCreatorHabitState {
  readonly schemaVersion: typeof LOCAL_HABIT_SNAPSHOT_SCHEMA_VERSION;
  readonly optInEnabled: boolean;
  readonly updatedAtMs: number;
  readonly externalBytesTransmitted: 0;
  readonly totalRecordedEvents: number;
  readonly colorObservations: readonly StoredColorObservation[];
  readonly brushCatalog: Readonly<Record<string, BrushDescriptor>>;
  readonly lastBrushId: string | null;
  readonly brushTransitions: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly panelAspectCounts: Readonly<Record<string, number>>;
  readonly panelAnchorCounts: Readonly<Record<string, number>>;
  readonly panelPairCounts: Readonly<Record<string, number>>;
  readonly actionCatalog: Readonly<Record<string, ActionDescriptor>>;
  readonly actionHistory: readonly string[];
  readonly appliedSuggestionCount: number;
  readonly executedMacroCount: number;
}

export interface RecordHabitEventResult {
  readonly state: LocalCreatorHabitState;
  readonly recorded: boolean;
  readonly ignoredReason: "opt-in-disabled" | "invalid-event" | null;
  readonly externalBytesTransmitted: 0;
}

export interface ExplainableEvidence {
  readonly confidence: number;
  readonly confidencePercent: number;
  readonly observationCount: number;
  readonly rationaleKo: string;
  readonly rationaleEn: string;
}

export interface SignatureColorSwatch {
  readonly id: string;
  readonly oklch: OklchColor;
  readonly cssOklch: string;
  readonly dominantUsage: ColorUsageKind;
  readonly hueFamilyKo: string;
  readonly hueFamilyEn: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly observationCount: number;
  readonly sharePercent: number;
  readonly confidence: number;
}

export interface SignaturePaletteSuggestion {
  readonly swatches: readonly SignatureColorSwatch[];
  readonly evidence: ExplainableEvidence;
}

export interface NextBrushCandidate {
  readonly brush: BrushDescriptor;
  readonly transitionCount: number;
  readonly probability: number;
  readonly probabilityPercent: number;
}

export interface NextBrushSuggestion {
  readonly fromBrush: BrushDescriptor | null;
  readonly recommendedBrush: BrushDescriptor;
  readonly isMarkovTransition: boolean;
  readonly transitionProbability: number;
  readonly candidates: readonly NextBrushCandidate[];
  readonly evidence: ExplainableEvidence;
}

export interface PreferredPanelLayoutHabit {
  readonly aspectRatio: PanelAspectRatioKey;
  readonly anchor: PanelLayoutAnchor;
  readonly anchorLabelKo: string;
  readonly anchorLabelEn: string;
  readonly pairObservationCount: number;
  readonly evidence: ExplainableEvidence;
}

export interface RepeatedMacroSuggestion {
  readonly macroId: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly steps: readonly ActionDescriptor[];
  readonly occurrences: number;
  readonly estimatedClicksSavedPerRun: number;
  readonly preferredPanelSpec: {
    readonly aspectRatio: PanelAspectRatioKey;
    readonly anchor: PanelLayoutAnchor;
    readonly anchorLabelKo: string;
    readonly anchorLabelEn: string;
  } | null;
  readonly evidence: ExplainableEvidence;
}

export interface MacroExecutionReceipt {
  readonly macroId: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly stepsExecuted: readonly ActionDescriptor[];
  readonly clicksSaved: number;
  readonly appliedPanelSpec: RepeatedMacroSuggestion["preferredPanelSpec"];
  readonly executedAtMs: number;
  readonly externalBytesTransmitted: 0;
  readonly nextState: LocalCreatorHabitState;
}

export interface LocalCopilotInsights {
  readonly privacy: typeof LOCAL_COPILOT_PRIVACY_CONTRACT;
  readonly optInEnabled: boolean;
  readonly totalObservations: number;
  readonly signaturePalette: SignaturePaletteSuggestion;
  readonly nextBrush: NextBrushSuggestion | null;
  readonly panelLayout: PreferredPanelLayoutHabit | null;
  readonly macros: readonly RepeatedMacroSuggestion[];
}

export interface ImportLocalHabitsResult {
  readonly ok: boolean;
  readonly state: LocalCreatorHabitState | null;
  readonly errorCode: "empty" | "payload-too-large" | "invalid-json" | "invalid-schema" | null;
  readonly errorMessageKo: string | null;
  readonly errorMessageEn: string | null;
  readonly externalBytesTransmitted: 0;
}

export interface OpfsWritableLike {
  write(data: string | Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface OpfsFileHandleLike {
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<OpfsWritableLike>;
}

export interface OpfsDirectoryHandleLike {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandleLike>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

export interface OpfsStorageManagerLike {
  getDirectory(): Promise<OpfsDirectoryHandleLike>;
}

export interface OpfsSnapshotSaveResult {
  readonly saved: boolean;
  readonly backend: "opfs" | "memory-only";
  readonly bytesWritten: number;
  readonly externalBytesTransmitted: 0;
  readonly reason: string | null;
}

export interface OpfsSnapshotLoadResult {
  readonly loaded: boolean;
  readonly state: LocalCreatorHabitState | null;
  readonly backend: "opfs" | "memory-only";
  readonly externalBytesTransmitted: 0;
  readonly reason: string | null;
}

// === 순수 수치 · OKLCH 지각 수학 · 키 검증 헬퍼 ===

export const clampNumber = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

export const roundToDigits = (value: number, digits = 3): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const normalizeHue = (hue: number): number => (Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : 0);

export function sanitizeOklchColor(color: OklchColor): OklchColor {
  return {
    l: roundToDigits(clampNumber(color.l, 0, 1), 4),
    c: roundToDigits(clampNumber(color.c, 0, 0.4), 4),
    h: roundToDigits(normalizeHue(color.h), 1),
  };
}

export function formatCssOklch(color: OklchColor): string {
  const safe = sanitizeOklchColor(color);
  return `oklch(${roundToDigits(safe.l * 100, 1)}% ${safe.c.toFixed(4)} ${safe.h.toFixed(1)})`;
}

export function oklchToOklab(color: OklchColor): OklabPoint {
  const safe = sanitizeOklchColor(color);
  const rad = (safe.h * Math.PI) / 180;
  return { l: safe.l, a: safe.c * Math.cos(rad), b: safe.c * Math.sin(rad) };
}

export function oklabToOklch(point: OklabPoint): OklchColor {
  const chroma = Math.hypot(point.a, point.b);
  const hue = chroma < 1e-5 ? 0 : (((Math.atan2(point.b, point.a) * 180) / Math.PI) + 360) % 360;
  return {
    l: roundToDigits(clampNumber(point.l, 0, 1), 4),
    c: roundToDigits(clampNumber(chroma, 0, 0.4), 4),
    h: roundToDigits(hue, 1),
  };
}

export function oklabDistanceSq(x: OklabPoint, y: OklabPoint): number {
  const dl = x.l - y.l;
  const da = x.a - y.a;
  const db = x.b - y.b;
  return dl * dl + da * da + db * db;
}

export function computeOklabDistance(a: OklchColor, b: OklchColor): number {
  return roundToDigits(Math.sqrt(oklabDistanceSq(oklchToOklab(a), oklchToOklab(b))), 4);
}

export function classifyOklchHueFamily(color: OklchColor): { readonly ko: string; readonly en: string } {
  if (color.c < 0.025) {
    if (color.l < 0.3) return { ko: "딥 잉크·차콜", en: "Deep Ink / Charcoal" };
    if (color.l > 0.85) return { ko: "페이퍼·하이라이트", en: "Paper / Highlight" };
    return { ko: "스톤·뉴트럴", en: "Stone Neutral" };
  }
  if (color.h < 35 || color.h >= 342) return { ko: "크림슨·테라코타", en: "Crimson / Terracotta" };
  if (color.h < 75) return { ko: "앰버·피치", en: "Amber / Peach" };
  if (color.h < 120) return { ko: "골드·올리브", en: "Gold / Olive" };
  if (color.h < 172) return { ko: "포레스트·세이지", en: "Forest / Sage" };
  if (color.h < 222) return { ko: "틸·아쿠아", en: "Teal / Aqua" };
  if (color.h < 276) return { ko: "코발트·슬레이트", en: "Cobalt / Slate" };
  return { ko: "플럼·라벤더", en: "Plum / Lavender" };
}

export function sanitizeHabitKey(raw: string): string {
  return raw.trim().slice(0, 64).replace(/[^a-zA-Z0-9._:-]/g, "_");
}

export function isSafeHabitKey(key: string): boolean {
  return key.length > 0 && !FORBIDDEN_OBJECT_KEYS.has(key);
}

export function isPanelAspectRatioKey(value: unknown): value is PanelAspectRatioKey {
  return typeof value === "string" && (PANEL_ASPECT_KEYS as readonly string[]).includes(value);
}

export function isPanelLayoutAnchor(value: unknown): value is PanelLayoutAnchor {
  return typeof value === "string" && (PANEL_ANCHOR_KEYS as readonly string[]).includes(value);
}
