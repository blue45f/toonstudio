import { normalizeShortcutChord } from "./shortcut-chord";

export { normalizeShortcutChord } from "./shortcut-chord";

/**
 * 프로 단축키 리매핑(ToonStudio·CSP·Photoshop·Procreate) · OS 정규화 · 충돌 감지 ·
 * 왼손/한손 태블릿 크롬 미러 솔버 · WCAG 2.2 AAA & 한국어 가독성 감사 순수 엔진 (Wave 41F).
 *
 * - 브라우저 스토리지 미사용(인메모리 순수 연산), BigInt 리터럴 미사용, 원시 색상 문자열 미사용.
 */

export type ShortcutPresetId = "toonstudio" | "csp" | "photoshop" | "procreate";
export type ShortcutOsPlatform = "mac" | "windows" | "ipad";
export type ShortcutCommandCategory = "draw" | "edit" | "view" | "panel";
export type NormalizedModifier = "Meta" | "Ctrl" | "Alt" | "Shift";
export type ShortcutConflictKind = "duplicate" | "invalid" | "browser-reserved";
export type ShortcutConflictSeverity = "error" | "warning";

export type ShortcutCommandId =
  | "brush" | "eraser" | "fill" | "eyedropper" | "lasso"
  | "move" | "textBalloon" | "brushSizeDown" | "brushSizeUp" | "swapColor"
  | "undo" | "redo" | "freeTransform" | "newLayer" | "mergeDown"
  | "flipHorizontal" | "panCanvas" | "zoomFit" | "toggleOrbitalWheel" | "toggleZenUi";

export interface ShortcutCommandSpec {
  readonly id: ShortcutCommandId; readonly category: ShortcutCommandCategory;
  readonly labelKo: string; readonly labelEn: string;
  readonly descriptionKo: string; readonly descriptionEn: string; readonly priority: number;
}

export interface ShortcutPresetMeta {
  readonly id: ShortcutPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly bindings: Readonly<Record<ShortcutCommandId, string>>;
}

export interface NormalizedShortcutChord {
  readonly valid: boolean; readonly raw: string; readonly canonical: string;
  readonly platformKey: string; readonly displayLabel: string;
  readonly modifiers: readonly NormalizedModifier[]; readonly key: string;
  readonly reasonKo: string | null; readonly reasonEn: string | null;
}

export interface ShortcutConflictItem {
  readonly id: string; readonly kind: ShortcutConflictKind; readonly severity: ShortcutConflictSeverity;
  readonly platformKey: string; readonly displayChord: string;
  readonly commandIds: readonly ShortcutCommandId[]; readonly reasonKo: string; readonly reasonEn: string;
}

export interface ShortcutConflictReport {
  readonly platform: ShortcutOsPlatform; readonly conflicts: readonly ShortcutConflictItem[];
  readonly errorCount: number; readonly warningCount: number; readonly hasBlockingConflicts: boolean;
  readonly conflictedCommandIds: readonly ShortcutCommandId[]; readonly boundCount: number; readonly totalCommands: number;
}

export const SHORTCUT_PROFILE_FORMAT = "toonstudio.ergonomics.shortcuts.v1" as const;
export const SHORTCUT_PROFILE_SCHEMA_VERSION = 1 as const;
export const SHORTCUT_PROFILE_MAX_JSON_BYTES = 64_000 as const;

export interface ShortcutProfileDocument {
  readonly format: typeof SHORTCUT_PROFILE_FORMAT;
  readonly schemaVersion: typeof SHORTCUT_PROFILE_SCHEMA_VERSION;
  readonly profileName: string; readonly presetId: ShortcutPresetId;
  readonly platform: ShortcutOsPlatform; readonly exportedAtIso: string;
  readonly bindings: Readonly<Record<ShortcutCommandId, string>>;
}

export type ShortcutProfileImportErrorCode =
  | "empty-input" | "payload-too-large" | "invalid-json"
  | "invalid-schema" | "unsupported-version" | "invalid-bindings";

export type ShortcutProfileImportResult =
  | { readonly ok: true; readonly profile: ShortcutProfileDocument; readonly conflicts: ShortcutConflictReport; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly errorCode: ShortcutProfileImportErrorCode; readonly messageKo: string; readonly messageEn: string };

export const SHORTCUT_PRESET_IDS: readonly ShortcutPresetId[] = ["toonstudio", "csp", "photoshop", "procreate"];
export const SHORTCUT_OS_PLATFORMS: readonly ShortcutOsPlatform[] = ["mac", "windows", "ipad"];

export const SHORTCUT_COMMANDS: readonly ShortcutCommandSpec[] = [
  { id: "brush", category: "draw", labelKo: "브러시 · 펜", labelEn: "Brush / Pen", descriptionKo: "주 선화·채색 브러시 선택", descriptionEn: "Select primary ink or paint brush", priority: 100 },
  { id: "eraser", category: "draw", labelKo: "지우개", labelEn: "Eraser", descriptionKo: "래스터·벡터 지우개 전환", descriptionEn: "Switch to raster/vector eraser", priority: 99 },
  { id: "fill", category: "draw", labelKo: "채우기 · 페인트", labelEn: "Fill / Paint Bucket", descriptionKo: "닫힌 영역 밑색 채우기", descriptionEn: "Flood fill closed lineart region", priority: 95 },
  { id: "eyedropper", category: "draw", labelKo: "스포이드", labelEn: "Eyedropper", descriptionKo: "캔버스 색상 추출", descriptionEn: "Sample color from canvas", priority: 96 },
  { id: "lasso", category: "edit", labelKo: "올가미 선택", labelEn: "Lasso Selection", descriptionKo: "자유 영역 올가미 선택", descriptionEn: "Freehand lasso selection", priority: 92 },
  { id: "move", category: "edit", labelKo: "레이어 이동", labelEn: "Move Layer", descriptionKo: "선택 레이어·컷 위치 이동", descriptionEn: "Reposition active layer or cut", priority: 90 },
  { id: "textBalloon", category: "panel", labelKo: "식자 · 말풍선", labelEn: "Lettering & Balloon", descriptionKo: "대사 입력·말풍선 도구", descriptionEn: "Insert dialogue and speech balloon", priority: 88 },
  { id: "brushSizeDown", category: "draw", labelKo: "브러시 축소", labelEn: "Decrease Brush Size", descriptionKo: "필압 브러시 직경 한 단계 축소", descriptionEn: "Step brush diameter down", priority: 94 },
  { id: "brushSizeUp", category: "draw", labelKo: "브러시 확대", labelEn: "Increase Brush Size", descriptionKo: "필압 브러시 직경 한 단계 확대", descriptionEn: "Step brush diameter up", priority: 94 },
  { id: "swapColor", category: "draw", labelKo: "전경/배경 색 전환", labelEn: "Swap FG / BG Color", descriptionKo: "주 색상과 보조 색상 즉시 교대", descriptionEn: "Swap primary and secondary swatches", priority: 89 },
  { id: "undo", category: "edit", labelKo: "실행 취소", labelEn: "Undo", descriptionKo: "직전 스트로크·편집 되돌리기", descriptionEn: "Revert most recent stroke or edit", priority: 100 },
  { id: "redo", category: "edit", labelKo: "다시 실행", labelEn: "Redo", descriptionKo: "되돌린 작업 재적용", descriptionEn: "Reapply undone operation", priority: 98 },
  { id: "freeTransform", category: "edit", labelKo: "자유 변형", labelEn: "Free Transform", descriptionKo: "크기·회전·원근 변형 핸들", descriptionEn: "Scale, rotate, and perspective transform", priority: 93 },
  { id: "newLayer", category: "panel", labelKo: "새 레이어", labelEn: "New Layer", descriptionKo: "현재 컷 위에 새 래스터 레이어 생성", descriptionEn: "Create a raster layer above current", priority: 91 },
  { id: "mergeDown", category: "panel", labelKo: "아래 레이어 병합", labelEn: "Merge Down", descriptionKo: "현재 레이어를 하단 레이어와 병합", descriptionEn: "Merge active layer into layer below", priority: 84 },
  { id: "flipHorizontal", category: "view", labelKo: "좌우 반전 검수", labelEn: "Flip View Horizontal", descriptionKo: "인체 밸런스 검수용 캔버스 좌우 미러", descriptionEn: "Mirror viewport to audit anatomy balance", priority: 91 },
  { id: "panCanvas", category: "view", labelKo: "캔버스 손바닥 이동", labelEn: "Pan Canvas", descriptionKo: "캔버스 자유 이동(누른 상태)", descriptionEn: "Hold to pan across canvas", priority: 97 },
  { id: "zoomFit", category: "view", labelKo: "화면에 맞춤", labelEn: "Zoom to Fit", descriptionKo: "현재 페이지/컷을 뷰포트에 맞춤", descriptionEn: "Fit active page to viewport", priority: 86 },
  { id: "toggleOrbitalWheel", category: "panel", labelKo: "오비탈 퀵 휠", labelEn: "Orbital Quick Wheel", descriptionKo: "방사형 한손 퀵 다이얼 호출", descriptionEn: "Open radial one-hand quick wheel", priority: 87 },
  { id: "toggleZenUi", category: "view", labelKo: "크롬 숨김(집중)", labelEn: "Toggle Zen Chrome", descriptionKo: "패널을 숨겨 캔버스 몰입 모드 전환", descriptionEn: "Hide chrome panels for focus mode", priority: 85 },
];

export const SHORTCUT_COMMAND_IDS: readonly ShortcutCommandId[] = SHORTCUT_COMMANDS.map((c) => c.id);

export const SHORTCUT_PRESETS: Readonly<Record<ShortcutPresetId, ShortcutPresetMeta>> = {
  toonstudio: {
    id: "toonstudio", labelKo: "ToonStudio 표준", labelEn: "ToonStudio Native",
    summaryKo: "웹툰 연재·오비탈 휠·좌우반전 검수에 맞춘 툰스튜디오 기본 단축키",
    summaryEn: "Native ToonStudio bindings tuned for webtoon episodes, orbital wheel, and quick flip checks",
    bindings: {
      brush: "B", eraser: "E", fill: "G", eyedropper: "I", lasso: "L",
      move: "V", textBalloon: "T", brushSizeDown: "[", brushSizeUp: "]", swapColor: "X",
      undo: "Mod+Z", redo: "Mod+Shift+Z", freeTransform: "Mod+T", newLayer: "Mod+Shift+N", mergeDown: "Mod+E",
      flipHorizontal: "H", panCanvas: "Space", zoomFit: "Mod+0", toggleOrbitalWheel: "Q", toggleZenUi: "Tab",
    },
  },
  csp: {
    id: "csp", labelKo: "Clip Studio Paint", labelEn: "Clip Studio Paint",
    summaryKo: "P 펜 · M 선택 · K 이동 · Mod+Y 다시실행 등 클립스튜디오 습관 호환",
    summaryEn: "Compatible with Clip Studio Paint habits: P pen, M selection, K move, Mod+Y redo",
    bindings: {
      brush: "P", eraser: "E", fill: "G", eyedropper: "I", lasso: "M",
      move: "K", textBalloon: "T", brushSizeDown: "[", brushSizeUp: "]", swapColor: "X",
      undo: "Mod+Z", redo: "Mod+Y", freeTransform: "Mod+T", newLayer: "Mod+Shift+N", mergeDown: "Mod+E",
      flipHorizontal: "Shift+H", panCanvas: "Space", zoomFit: "Mod+0", toggleOrbitalWheel: "Alt+Q", toggleZenUi: "Tab",
    },
  },
  photoshop: {
    id: "photoshop", labelKo: "Adobe Photoshop", labelEn: "Adobe Photoshop",
    summaryKo: "B 브러시 · L 올가미 · V 이동 · Mod+Shift+Z 포토샵 표준 리맵",
    summaryEn: "Adobe Photoshop standard keys: B brush, L lasso, V move, Mod+Shift+Z redo",
    bindings: {
      brush: "B", eraser: "E", fill: "G", eyedropper: "I", lasso: "L",
      move: "V", textBalloon: "T", brushSizeDown: "[", brushSizeUp: "]", swapColor: "X",
      undo: "Mod+Z", redo: "Mod+Shift+Z", freeTransform: "Mod+T", newLayer: "Mod+Shift+N", mergeDown: "Mod+E",
      flipHorizontal: "Shift+H", panCanvas: "Space", zoomFit: "Mod+0", toggleOrbitalWheel: "Shift+Q", toggleZenUi: "Tab",
    },
  },
  procreate: {
    id: "procreate", labelKo: "Procreate (iPad 키보드)", labelEn: "Procreate (iPad Keyboard)",
    summaryKo: "B 브러시 · S 선택 · L 레이어 · F 좌우반전 · Mod+; 전체화면 아이패드 키맵",
    summaryEn: "Procreate keyboard companion bindings: B brush, S selection, L layer, F flip, Mod+; zen",
    bindings: {
      brush: "B", eraser: "E", fill: "Shift+G", eyedropper: "Alt+I", lasso: "S",
      move: "V", textBalloon: "Shift+T", brushSizeDown: "[", brushSizeUp: "]", swapColor: "X",
      undo: "Mod+Z", redo: "Mod+Shift+Z", freeTransform: "Mod+Shift+T", newLayer: "L", mergeDown: "Mod+Alt+E",
      flipHorizontal: "F", panCanvas: "Space", zoomFit: "Mod+0", toggleOrbitalWheel: "Shift+Space", toggleZenUi: "Mod+;",
    },
  },
};

const BROWSER_RESERVED_CANONICAL: Readonly<Record<string, { readonly ko: string; readonly en: string }>> = {
  "Mod+W": { ko: "브라우저 현재 탭 닫기 단축키와 충돌합니다", en: "Conflicts with browser close-tab shortcut" },
  "Mod+R": { ko: "브라우저 페이지 새로고침과 충돌합니다", en: "Conflicts with browser reload shortcut" },
  "Mod+N": { ko: "브라우저 새 창 열기와 충돌합니다", en: "Conflicts with browser new-window shortcut" },
  "Mod+Q": { ko: "운영체제 앱 종료 단축키와 충돌합니다", en: "Conflicts with OS quit-application shortcut" },
  "Mod+L": { ko: "브라우저 주소창 포커스와 충돌합니다", en: "Conflicts with browser address bar focus" },
  "Alt+F4": { ko: "운영체제 창 닫기 단축키와 충돌합니다", en: "Conflicts with OS close-window shortcut" },
};

const FALLBACK_KEY_POOL: readonly string[] = [
  "Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+6", "Alt+7", "Alt+8", "Alt+9",
  "Shift+1", "Shift+2", "Shift+3", "Shift+4", "Shift+5", "Alt+A", "Alt+D", "Alt+F",
  "Alt+J", "Alt+K", "Alt+R", "Alt+W", "Mod+Alt+1", "Mod+Alt+2", "Mod+Alt+3",
];

/** 프리셋 기본 바인딩 사본 생성 */
export function createShortcutBindingsFromPreset(presetId: ShortcutPresetId): Record<ShortcutCommandId, string> {
  return { ...SHORTCUT_PRESETS[presetId].bindings };
}

/** 단일 명령 단축키 리매핑(불변 반환) */
export function remapShortcutCommand(
  bindings: Readonly<Record<ShortcutCommandId, string>>, commandId: ShortcutCommandId, nextChord: string, platform: ShortcutOsPlatform = "mac",
): Record<ShortcutCommandId, string> {
  const norm = normalizeShortcutChord(nextChord, platform);
  return { ...bindings, [commandId]: norm.valid ? norm.canonical : nextChord.trim() };
}

/** 실시간 단축키 코드 충돌·유효성·브라우저 예약 충돌 감지기 */
export function detectShortcutConflicts(
  bindings: Readonly<Record<ShortcutCommandId, string>>, platform: ShortcutOsPlatform = "mac",
): ShortcutConflictReport {
  const conflicts: ShortcutConflictItem[] = [];
  const grouped: Record<string, { displayChord: string; commandIds: ShortcutCommandId[] }> = {};
  const conflictedSet = new Set<ShortcutCommandId>();
  let boundCount = 0;

  for (const spec of SHORTCUT_COMMANDS) {
    const norm = normalizeShortcutChord(bindings[spec.id] ?? "", platform);
    if (!norm.valid) {
      conflictedSet.add(spec.id);
      conflicts.push({
        id: `invalid:${spec.id}`, kind: "invalid", severity: "error", platformKey: "", displayChord: norm.displayLabel,
        commandIds: [spec.id], reasonKo: norm.reasonKo ?? "잘못된 단축키 형식입니다.", reasonEn: norm.reasonEn ?? "Invalid shortcut format.",
      });
      continue;
    }
    boundCount += 1;
    const bucket = grouped[norm.platformKey];
    if (bucket) bucket.commandIds.push(spec.id);
    else grouped[norm.platformKey] = { displayChord: norm.displayLabel, commandIds: [spec.id] };

    const reserved = BROWSER_RESERVED_CANONICAL[norm.canonical];
    if (reserved) {
      conflicts.push({
        id: `reserved:${spec.id}:${norm.platformKey}`, kind: "browser-reserved", severity: "warning",
        platformKey: norm.platformKey, displayChord: norm.displayLabel, commandIds: [spec.id], reasonKo: reserved.ko, reasonEn: reserved.en,
      });
    }
  }

  for (const [platformKey, entry] of Object.entries(grouped)) {
    if (entry.commandIds.length > 1) {
      for (const cmdId of entry.commandIds) conflictedSet.add(cmdId);
      conflicts.push({
        id: `duplicate:${platformKey}`, kind: "duplicate", severity: "error",
        platformKey, displayChord: entry.displayChord, commandIds: entry.commandIds,
        reasonKo: `${entry.commandIds.length}개 명령이 동일한 키(${entry.displayChord})에 중복 배정되었습니다.`,
        reasonEn: `${entry.commandIds.length} commands share the same shortcut (${entry.displayChord}).`,
      });
    }
  }

  const errorCount = conflicts.filter((item) => item.severity === "error").length;
  const warningCount = conflicts.filter((item) => item.severity === "warning").length;
  return {
    platform, conflicts, errorCount, warningCount, hasBlockingConflicts: errorCount > 0,
    conflictedCommandIds: Array.from(conflictedSet), boundCount, totalCommands: SHORTCUT_COMMANDS.length,
  };
}

/** 중복·오류 단축키를 우선순위 기준으로 안전 키에 자동 재배정 */
export function autoResolveShortcutConflicts(
  bindings: Readonly<Record<ShortcutCommandId, string>>, presetId: ShortcutPresetId, platform: ShortcutOsPlatform = "mac",
): Record<ShortcutCommandId, string> {
  const next: Record<ShortcutCommandId, string> = { ...bindings };
  const usedKeys = new Set<string>();
  const presetDefaults = SHORTCUT_PRESETS[presetId].bindings;
  const pickSafe = (cmdId: ShortcutCommandId): string => {
    for (const rawCandidate of [presetDefaults[cmdId], ...FALLBACK_KEY_POOL]) {
      const c = normalizeShortcutChord(rawCandidate, platform);
      if (c.valid && !usedKeys.has(c.platformKey)) return c.canonical;
    }
    return presetDefaults[cmdId];
  };
  for (const spec of [...SHORTCUT_COMMANDS].sort((a, b) => b.priority - a.priority)) {
    const norm = normalizeShortcutChord(next[spec.id] ?? "", platform);
    if (norm.valid && !usedKeys.has(norm.platformKey)) {
      next[spec.id] = norm.canonical;
      usedKeys.add(norm.platformKey);
    } else {
      const safe = pickSafe(spec.id);
      const safeNorm = normalizeShortcutChord(safe, platform);
      next[spec.id] = safeNorm.valid ? safeNorm.canonical : safe;
      if (safeNorm.valid) usedKeys.add(safeNorm.platformKey);
    }
  }
  return next;
}

/** 단축키 프로필 JSON 직렬화 */
export function exportShortcutProfileJson(profile: ShortcutProfileDocument): string {
  const canonicalBindings: Record<string, string> = {};
  for (const id of SHORTCUT_COMMAND_IDS) {
    const raw = profile.bindings[id] ?? SHORTCUT_PRESETS[profile.presetId].bindings[id];
    const norm = normalizeShortcutChord(raw, profile.platform);
    canonicalBindings[id] = norm.valid ? norm.canonical : raw;
  }
  return JSON.stringify({
    format: SHORTCUT_PROFILE_FORMAT, schemaVersion: SHORTCUT_PROFILE_SCHEMA_VERSION,
    profileName: profile.profileName.trim() ? profile.profileName : "ToonStudio Custom",
    presetId: profile.presetId, platform: profile.platform, exportedAtIso: profile.exportedAtIso,
    bindings: canonicalBindings,
  }, null, 2);
}

const importFail = (errorCode: ShortcutProfileImportErrorCode, messageKo: string, messageEn: string): ShortcutProfileImportResult => ({
  ok: false, errorCode, messageKo, messageEn,
});

/** 단축키 프로필 JSON 엄격 검증 및 역직렬화 */
export function importShortcutProfileJson(rawJson: string, fallbackPlatform: ShortcutOsPlatform = "mac"): ShortcutProfileImportResult {
  const trimmed = rawJson.trim();
  if (!trimmed) return importFail("empty-input", "가져올 JSON 문자열이 비어 있습니다.", "Import JSON payload is empty.");
  if (new TextEncoder().encode(rawJson).byteLength > SHORTCUT_PROFILE_MAX_JSON_BYTES) return importFail("payload-too-large", `JSON 크기가 허용 한도(${SHORTCUT_PROFILE_MAX_JSON_BYTES}바이트)를 초과했습니다.`, `JSON payload exceeds ${SHORTCUT_PROFILE_MAX_JSON_BYTES} bytes.`);
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); } catch { return importFail("invalid-json", "JSON 문법 오류가 있어 단축키 프로필을 해석할 수 없습니다.", "Malformed JSON syntax in shortcut profile payload."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return importFail("invalid-schema", "최상위 JSON 구조가 객체 형식이 아닙니다.", "Root JSON value must be an object.");

  const rec = parsed as Record<string, unknown>;
  if (rec.format !== SHORTCUT_PROFILE_FORMAT) return importFail("invalid-schema", `지원하지 않는 프로필 포맷입니다(기대값: ${SHORTCUT_PROFILE_FORMAT}).`, `Unexpected profile format (expected ${SHORTCUT_PROFILE_FORMAT}).`);
  if (rec.schemaVersion !== SHORTCUT_PROFILE_SCHEMA_VERSION) return importFail("unsupported-version", `지원하지 않는 스키마 버전입니다(v${String(rec.schemaVersion)}).`, `Unsupported schema version (${String(rec.schemaVersion)}).`);
  if (!rec.bindings || typeof rec.bindings !== "object" || Array.isArray(rec.bindings)) return importFail("invalid-bindings", "bindings 필드가 유효한 키 맵 객체가 아닙니다.", "The bindings field must be a command-to-chord map.");

  const presetId: ShortcutPresetId = typeof rec.presetId === "string" && SHORTCUT_PRESET_IDS.includes(rec.presetId as ShortcutPresetId) ? (rec.presetId as ShortcutPresetId) : "toonstudio";
  const platform: ShortcutOsPlatform = typeof rec.platform === "string" && SHORTCUT_OS_PLATFORMS.includes(rec.platform as ShortcutOsPlatform) ? (rec.platform as ShortcutOsPlatform) : fallbackPlatform;
  const incoming = rec.bindings as Record<string, unknown>;
  const warnings: string[] = [];
  const validIds = new Set<string>(SHORTCUT_COMMAND_IDS);
  for (const key of Object.keys(incoming)) if (!validIds.has(key)) warnings.push(`알 수 없는 명령 키 "${key}"를 무시했습니다.`);

  const merged = createShortcutBindingsFromPreset(presetId);
  for (const cmdId of SHORTCUT_COMMAND_IDS) {
    const val = incoming[cmdId];
    if (typeof val !== "string") { warnings.push(`누락된 명령 "${cmdId}"을 ${presetId} 기본값으로 보완했습니다.`); continue; }
    const norm = normalizeShortcutChord(val, platform);
    merged[cmdId] = norm.valid ? norm.canonical : val.trim();
  }
  const profile: ShortcutProfileDocument = {
    format: SHORTCUT_PROFILE_FORMAT, schemaVersion: SHORTCUT_PROFILE_SCHEMA_VERSION,
    profileName: typeof rec.profileName === "string" && rec.profileName.trim() ? rec.profileName : "Imported Profile",
    presetId, platform,
    exportedAtIso: typeof rec.exportedAtIso === "string" && rec.exportedAtIso.trim() ? rec.exportedAtIso : "2026-11-25T00:00:00.000Z",
    bindings: merged,
  };
  return { ok: true, profile, conflicts: detectShortcutConflicts(merged, platform), warnings };
}

/* -------------------------------------------------------------------------- */
/*  2. 왼손잡이 · 한손 태블릿 스튜디오 크롬 미러 변환 솔버                    */
/* -------------------------------------------------------------------------- */

export type DominantHandMode = "right-handed" | "left-handed" | "one-hand-left-tablet" | "one-hand-right-tablet";
export type StudioViewportDevice = "desktop" | "tablet-landscape" | "tablet-portrait";
export type StudioChromeSlotId = "toolRail" | "orbitalWheel" | "brushSliders" | "inspectorDrawer" | "undoRedoCluster";
export type ChromeDockEdge = "left" | "right" | "bottom-left" | "bottom-right";

export interface HandednessLayoutInput {
  readonly handMode: DominantHandMode; readonly device?: StudioViewportDevice;
  readonly viewportWidthPx?: number; readonly viewportHeightPx?: number;
  readonly palmRejectionMarginPx?: number; readonly compactChrome?: boolean;
}

export interface ChromeSlotPlacement {
  readonly id: StudioChromeSlotId; readonly labelKo: string; readonly labelEn: string;
  readonly dockEdge: ChromeDockEdge; readonly xRatio: number; readonly yRatio: number;
  readonly widthRatio: number; readonly heightRatio: number;
  readonly mirroredFromBaseline: boolean; readonly inThumbZone: boolean; readonly thumbDistanceRatio: number;
}

export interface ThumbReachZone {
  readonly operatingHand: "left" | "right"; readonly anchorXRatio: number; readonly anchorYRatio: number;
  readonly comfortableRadiusRatio: number; readonly maxReachRadiusRatio: number;
}

export interface HandednessLayoutPlan {
  readonly scope: "example-only"; readonly actualLayoutApplied: false; readonly ergonomicRiskMeasured: false;
  readonly handMode: DominantHandMode; readonly device: StudioViewportDevice;
  readonly viewportWidthPx: number; readonly viewportHeightPx: number;
  readonly mirroredHorizontally: boolean; readonly oneHandOptimized: boolean;
  readonly palmRejectionMarginPx: number; readonly slots: readonly ChromeSlotPlacement[];
  readonly canvasRect: { readonly xRatio: number; readonly yRatio: number; readonly widthRatio: number; readonly heightRatio: number };
  readonly thumbZone: ThumbReachZone; readonly thumbReachCoveragePct: number;
  readonly palmCollisionRiskPct: number; readonly canvasViewportSharePct: number; readonly meetsCanvasBudget: boolean;
  readonly cssMirrorVars: Readonly<Record<string, string>>;
  readonly recommendationsKo: readonly string[]; readonly recommendationsEn: readonly string[];
}

export const DOMINANT_HAND_MODES: readonly DominantHandMode[] = [
  "right-handed", "left-handed", "one-hand-left-tablet", "one-hand-right-tablet",
];

const DEVICE_VIEWPORTS: Readonly<Record<StudioViewportDevice, { readonly w: number; readonly h: number }>> = {
  desktop: { w: 1280, h: 800 }, "tablet-landscape": { w: 1194, h: 834 }, "tablet-portrait": { w: 834, h: 1194 },
};

const clampNum = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min);
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const mirrorEdge = (edge: ChromeDockEdge): ChromeDockEdge =>
  edge === "left" ? "right" : edge === "right" ? "left" : edge === "bottom-left" ? "bottom-right" : "bottom-left";

/** 왼손잡이·한손 태블릿 스튜디오 크롬 좌우 반전 및 엄지 도달 영역 커버리지 솔버 */
export function computeHandednessLayoutPlan(input: HandednessLayoutInput): HandednessLayoutPlan {
  const device: StudioViewportDevice = input.device ?? "tablet-landscape";
  const dims = DEVICE_VIEWPORTS[device];
  const viewportWidthPx = clampNum(input.viewportWidthPx ?? dims.w, 360, 3840);
  const viewportHeightPx = clampNum(input.viewportHeightPx ?? dims.h, 480, 2160);
  const palmRejectionMarginPx = clampNum(input.palmRejectionMarginPx ?? 28, 0, 72);
  const compactChrome = input.compactChrome === true;
  const handMode = input.handMode;

  const isOneHand = handMode === "one-hand-left-tablet" || handMode === "one-hand-right-tablet";
  const mirroredHorizontally = handMode === "left-handed" || handMode === "one-hand-right-tablet";
  const operatingHand: "left" | "right" = mirroredHorizontally ? "right" : "left";

  const railW = compactChrome ? 0.036 : 0.044;
  const sliderW = compactChrome ? 0.028 : 0.034;
  const inspectorW = compactChrome ? 0.042 : 0.052;

  const baseSlots: readonly {
    readonly id: StudioChromeSlotId; readonly labelKo: string; readonly labelEn: string;
    readonly dockEdge: ChromeDockEdge; readonly x: number; readonly y: number;
    readonly w: number; readonly h: number; readonly weight: number;
  }[] = isOneHand
    ? [
        { id: "toolRail", labelKo: "툴 레일", labelEn: "Tool Rail", dockEdge: "left", x: 0.012, y: 0.36, w: railW, h: 0.36, weight: 0.28 },
        { id: "brushSliders", labelKo: "크기·불투명도 슬라이더", labelEn: "Brush Sliders", dockEdge: "bottom-left", x: 0.074, y: 0.56, w: sliderW, h: 0.26, weight: 0.26 },
        { id: "orbitalWheel", labelKo: "오비탈 퀵 휠", labelEn: "Orbital Wheel", dockEdge: "bottom-left", x: 0.128, y: 0.68, w: 0.12, h: 0.2, weight: 0.28 },
        { id: "undoRedoCluster", labelKo: "실행취소·다시실행", labelEn: "Undo / Redo", dockEdge: "bottom-left", x: 0.014, y: 0.78, w: 0.1, h: 0.088, weight: 0.18 },
        { id: "inspectorDrawer", labelKo: "컴팩트 인스펙터", labelEn: "Compact Inspector", dockEdge: "left", x: 0.012, y: 0.12, w: inspectorW, h: 0.21, weight: 0 },
      ]
    : [
        { id: "toolRail", labelKo: "툴 레일", labelEn: "Tool Rail", dockEdge: "left", x: 0.01, y: 0.12, w: railW, h: 0.56, weight: 0.3 },
        { id: "brushSliders", labelKo: "크기·불투명도 슬라이더", labelEn: "Brush Sliders", dockEdge: "left", x: 0.064, y: 0.42, w: sliderW, h: 0.32, weight: 0.25 },
        { id: "orbitalWheel", labelKo: "오비탈 퀵 휠", labelEn: "Orbital Wheel", dockEdge: "bottom-left", x: 0.112, y: 0.66, w: 0.115, h: 0.2, weight: 0.25 },
        { id: "undoRedoCluster", labelKo: "실행취소·다시실행", labelEn: "Undo / Redo", dockEdge: "bottom-left", x: 0.012, y: 0.78, w: 0.095, h: 0.085, weight: 0.2 },
        { id: "inspectorDrawer", labelKo: "인스펙터 독", labelEn: "Inspector Dock", dockEdge: "right", x: 1 - 0.01 - inspectorW, y: 0.1, w: inspectorW, h: 0.72, weight: 0 },
      ];

  const anchorXRatio = operatingHand === "left" ? 0.07 : 0.93;
  const anchorYRatio = device === "tablet-portrait" ? 0.82 : 0.8;
  const comfortableRadiusRatio = isOneHand ? 0.36 : 0.34;
  const maxReachRadiusRatio = isOneHand ? 0.52 : 0.48;
  const aspectScale = Math.min(1.2, Math.max(0.65, viewportHeightPx / viewportWidthPx));

  let weightedReach = 0;
  let totalWeight = 0;
  const slots: ChromeSlotPlacement[] = baseSlots.map((slot) => {
    const xRatio = mirroredHorizontally ? round3(1 - slot.x - slot.w) : round3(slot.x);
    const yRatio = round3(slot.y);
    const dockEdge = mirroredHorizontally ? mirrorEdge(slot.dockEdge) : slot.dockEdge;
    const dist = Math.hypot(xRatio + slot.w / 2 - anchorXRatio, (yRatio + slot.h / 2 - anchorYRatio) * aspectScale);
    if (slot.weight > 0) {
      totalWeight += slot.weight;
      if (dist <= comfortableRadiusRatio) weightedReach += slot.weight;
      else if (dist <= maxReachRadiusRatio) {
        weightedReach += slot.weight * (0.65 + 0.35 * (1 - (dist - comfortableRadiusRatio) / Math.max(0.01, maxReachRadiusRatio - comfortableRadiusRatio)));
      } else {
        weightedReach += slot.weight * Math.max(0, 0.35 - (dist - maxReachRadiusRatio));
      }
    }
    return {
      id: slot.id, labelKo: slot.labelKo, labelEn: slot.labelEn, dockEdge, xRatio, yRatio,
      widthRatio: round3(slot.w), heightRatio: round3(slot.h),
      mirroredFromBaseline: mirroredHorizontally, inThumbZone: dist <= maxReachRadiusRatio, thumbDistanceRatio: round3(dist),
    };
  });

  // 고정 배치 모델의 캔버스 면적을 계산하며 실제 화면 점유율은 측정하지 않는다.
  const topBarRatio = clampNum(44 / viewportHeightPx, 0.03, 0.056);
  const dockedInspectorStrip = compactChrome ? 0.028 : 0.038;
  const leftMarginRatio = isOneHand ? (mirroredHorizontally ? 0.012 : railW + 0.014) : mirroredHorizontally ? dockedInspectorStrip + 0.01 : railW + 0.012;
  const rightMarginRatio = isOneHand ? (mirroredHorizontally ? railW + 0.014 : 0.012) : mirroredHorizontally ? railW + 0.012 : dockedInspectorStrip + 0.01;
  const canvasWidthRatio = round3(clampNum(1 - leftMarginRatio - rightMarginRatio, 0.72, 0.96));
  const canvasHeightRatio = round3(clampNum(1 - topBarRatio - 0.008, 0.88, 0.96));
  const canvasViewportSharePct = round1(canvasWidthRatio * canvasHeightRatio * 100);
  const thumbReachCoveragePct = round1(totalWeight > 0 ? clampNum((weightedReach / totalWeight) * 100, 0, 100) : 0);
  const palmCollisionRiskPct = round1(clampNum((isOneHand ? 14 : 18) - clampNum((palmRejectionMarginPx / 36) * 11, 0, 13), 3, 45));

  const slotDock = (id: StudioChromeSlotId, fb: ChromeDockEdge): ChromeDockEdge => slots.find((s) => s.id === id)?.dockEdge ?? fb;
  const cssMirrorVars: Record<string, string> = {
    "--studio-hand-mode": handMode,
    "--studio-tool-rail-side": slotDock("toolRail", "left"),
    "--studio-slider-side": slotDock("brushSliders", "left"),
    "--studio-inspector-side": slotDock("inspectorDrawer", "right"),
    "--studio-orbital-origin-x": `${Math.round(anchorXRatio * 100)}%`,
    "--studio-orbital-origin-y": `${Math.round(anchorYRatio * 100)}%`,
    "--studio-palm-guard-px": `${Math.round(palmRejectionMarginPx)}px`,
  };

  const recommendationsKo = [
    mirroredHorizontally
      ? "툴레일·슬라이더·오비탈 휠을 우측으로 배치한 예제입니다. 오터치 방지 효과는 측정하지 않았습니다."
      : "주 조작 크롬을 좌측에 배치해 오른손 펜 작업 중 시선 이탈을 최소화합니다.",
    ...(isOneHand ? [`한손 엄지 호(반경 ${Math.round(comfortableRadiusRatio * 100)}%) 안에 자주 쓰는 도구와 실행취소를 집약했습니다.`] : []),
    ...(palmRejectionMarginPx < 20 ? ["보호 여백을 바꾸면 가정식 지수가 달라집니다. 실제 오터치 확률을 나타내지 않습니다."] : []),
  ];
  const recommendationsEn = [
    mirroredHorizontally
      ? "Example: tool rail, sliders, and wheel on the right. Palm-rejection effectiveness is unmeasured."
      : "Primary controls stay on the left so the right drawing hand remains unobstructed.",
    ...(isOneHand ? [`Frequent tools and undo/redo are clustered inside the ${Math.round(comfortableRadiusRatio * 100)}% one-hand thumb arc.`] : []),
    ...(palmRejectionMarginPx < 20 ? ["Changing the margin changes a heuristic index, not a measured misfire probability."] : []),
  ];

  return {
    scope: "example-only", actualLayoutApplied: false, ergonomicRiskMeasured: false,
    handMode, device, viewportWidthPx, viewportHeightPx, mirroredHorizontally, oneHandOptimized: isOneHand,
    palmRejectionMarginPx, slots,
    canvasRect: { xRatio: round3(leftMarginRatio), yRatio: round3(topBarRatio), widthRatio: canvasWidthRatio, heightRatio: canvasHeightRatio },
    thumbZone: { operatingHand, anchorXRatio, anchorYRatio, comfortableRadiusRatio, maxReachRadiusRatio },
    thumbReachCoveragePct, palmCollisionRiskPct, canvasViewportSharePct,
    meetsCanvasBudget: canvasViewportSharePct >= 82,
    cssMirrorVars, recommendationsKo, recommendationsEn,
  };
}

/* -------------------------------------------------------------------------- */
/*  3. WCAG 2.2 AAA 터치 타깃 · 포커스 링 · 한국어 난독 친화 가독성 감사기     */
/* -------------------------------------------------------------------------- */

export interface TouchTargetSample {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly widthPx: number; readonly heightPx: number; readonly gapPx: number;
}

export interface FocusIndicatorSpec {
  readonly outlineWidthPx: number; readonly contrastRatio: number; readonly offsetPx: number;
  readonly usesVisibleRing: boolean; readonly obscuredByStickyChrome: boolean;
}

export interface KoreanTypographyReadabilitySpec {
  readonly fontSizePx: number; readonly lineHeightRatio: number; readonly letterSpacingEm: number;
  readonly wordSpacingEm: number; readonly paragraphSpacingMultiplier: number; readonly maxMeasureChars: number;
  readonly usesKeepAllWordBreak: boolean; readonly usesTabularNums: boolean;
  readonly avoidsJustifyAlignment: boolean; readonly reducedMotionRespected: boolean;
}

export interface StudioAccessibilityAuditInput {
  readonly touchTargets: readonly TouchTargetSample[]; readonly focusRing: FocusIndicatorSpec;
  readonly textContrastRatio: number; readonly uiComponentContrastRatio: number;
  readonly typography: KoreanTypographyReadabilitySpec;
}

export type AccessibilityGrade = "AAA" | "AA" | "FAIL";
export type AccessibilityAuditPresetId = "atelier-aaa" | "dyslexia-korean" | "compact-violation";

export interface AccessibilityCheckItem {
  readonly criterionCode: string; readonly level: "AAA" | "AA"; readonly passed: boolean;
  readonly labelKo: string; readonly labelEn: string;
  readonly measuredText: string; readonly targetText: string;
  readonly detailKo: string; readonly detailEn: string;
}

export interface StudioAccessibilityAuditReport {
  readonly scope: "provided-input-example"; readonly domAudited: false; readonly clinicalAssessmentPerformed: false;
  readonly passesProvidedAaaChecks: boolean; readonly passesProvidedAaChecks: boolean;
  readonly grade: AccessibilityGrade; readonly overallScore: number;
  readonly passesW3cAaa: false; readonly passesW3cAa: false;
  readonly touchTargetSummary: {
    readonly total: number; readonly passingAaaCount: number; readonly passingAaCount: number;
    readonly failingIds: readonly string[]; readonly minWidthPx: number; readonly minHeightPx: number; readonly minGapPx: number;
  };
  readonly focusRingPassesAaa: boolean; readonly koreanReadabilityScore: number;
  /** 가독성 선호 규칙 충족 여부이며 난독 여부나 의학적 효과를 판정하지 않는다. */
  readonly passesDyslexiaFriendly: boolean;
  readonly checks: readonly AccessibilityCheckItem[];
  readonly remediationStepsKo: readonly string[]; readonly remediationStepsEn: readonly string[];
}

export const ACCESSIBILITY_AUDIT_PRESET_IDS: readonly AccessibilityAuditPresetId[] = [
  "atelier-aaa", "dyslexia-korean", "compact-violation",
];

function makeSampleTargets(sizes: readonly [number, number, number][]): readonly TouchTargetSample[] {
  const defs: readonly [string, string, string][] = [
    ["tool-brush", "브러시 버튼", "Brush Button"],
    ["tool-eraser", "지우개 버튼", "Eraser Button"],
    ["undo-btn", "실행 취소", "Undo Trigger"],
    ["orbital-hub", "오비탈 퀵 휠", "Orbital Wheel"],
  ];
  return defs.map(([id, labelKo, labelEn], idx) => {
    const [widthPx, heightPx, gapPx] = sizes[idx] ?? [44, 44, 8];
    return { id, labelKo, labelEn, widthPx, heightPx, gapPx };
  });
}

export const ACCESSIBILITY_AUDIT_PRESETS: Readonly<
  Record<AccessibilityAuditPresetId, { readonly labelKo: string; readonly labelEn: string; readonly input: StudioAccessibilityAuditInput }>
> = {
  "atelier-aaa": {
    labelKo: "Calm Atelier AAA 기준", labelEn: "Calm Atelier AAA Baseline",
    input: {
      touchTargets: makeSampleTargets([[44, 44, 8], [44, 44, 8], [48, 44, 10], [52, 52, 12]]),
      focusRing: { outlineWidthPx: 2, contrastRatio: 5.4, offsetPx: 2, usesVisibleRing: true, obscuredByStickyChrome: false },
      textContrastRatio: 8.6, uiComponentContrastRatio: 4.8,
      typography: {
        fontSizePx: 15, lineHeightRatio: 1.65, letterSpacingEm: 0.02, wordSpacingEm: 0.12, paragraphSpacingMultiplier: 2.0,
        maxMeasureChars: 38, usesKeepAllWordBreak: true, usesTabularNums: true, avoidsJustifyAlignment: true, reducedMotionRespected: true,
      },
    },
  },
  "dyslexia-korean": {
    labelKo: "한국어 가독성 확대 예제", labelEn: "Korean Readability Example",
    input: {
      touchTargets: makeSampleTargets([[52, 52, 12], [52, 52, 12], [56, 48, 12], [56, 56, 14]]),
      focusRing: { outlineWidthPx: 3, contrastRatio: 7.4, offsetPx: 2, usesVisibleRing: true, obscuredByStickyChrome: false },
      textContrastRatio: 10.5, uiComponentContrastRatio: 6.2,
      typography: {
        fontSizePx: 16, lineHeightRatio: 1.78, letterSpacingEm: 0.05, wordSpacingEm: 0.18, paragraphSpacingMultiplier: 2.2,
        maxMeasureChars: 34, usesKeepAllWordBreak: true, usesTabularNums: true, avoidsJustifyAlignment: true, reducedMotionRespected: true,
      },
    },
  },
  "compact-violation": {
    labelKo: "위반 진단 시뮬레이션", labelEn: "Violation Stress Demo",
    input: {
      touchTargets: makeSampleTargets([[30, 30, 2], [22, 22, 2], [36, 32, 4], [40, 40, 4]]),
      focusRing: { outlineWidthPx: 1, contrastRatio: 2.1, offsetPx: 0, usesVisibleRing: false, obscuredByStickyChrome: true },
      textContrastRatio: 3.9, uiComponentContrastRatio: 2.4,
      typography: {
        fontSizePx: 12, lineHeightRatio: 1.25, letterSpacingEm: -0.04, wordSpacingEm: 0.0, paragraphSpacingMultiplier: 1.1,
        maxMeasureChars: 64, usesKeepAllWordBreak: false, usesTabularNums: false, avoidsJustifyAlignment: false, reducedMotionRespected: false,
      },
    },
  },
};

const makeCheck = (
  criterionCode: string, level: "AAA" | "AA", passed: boolean,
  labelKo: string, labelEn: string, measuredText: string, targetText: string, detailKo: string, detailEn: string,
): AccessibilityCheckItem => ({ criterionCode, level, passed, labelKo, labelEn, measuredText, targetText, detailKo, detailEn });

/** WCAG 2.2 AAA 터치 타깃 · 포커스 링 · 한국어 난독 친화 가독성 종합 감사기 */
export function auditStudioAccessibilityBudget(input: StudioAccessibilityAuditInput): StudioAccessibilityAuditReport {
  const sanitized = input.touchTargets.map((t) => ({
    ...t, widthPx: clampNum(t.widthPx, 0, 400), heightPx: clampNum(t.heightPx, 0, 400), gapPx: clampNum(t.gapPx, 0, 100),
  }));
  let passingAaaCount = 0, passingAaCount = 0;
  const failingIds: string[] = [];
  let minWidthPx = sanitized.length > 0 ? Infinity : 0;
  let minHeightPx = sanitized.length > 0 ? Infinity : 0;
  let minGapPx = sanitized.length > 0 ? Infinity : 0;
  for (const t of sanitized) {
    if (t.widthPx < minWidthPx) minWidthPx = t.widthPx;
    if (t.heightPx < minHeightPx) minHeightPx = t.heightPx;
    if (t.gapPx < minGapPx) minGapPx = t.gapPx;
    if (t.widthPx >= 44 && t.heightPx >= 44) passingAaaCount += 1;
    else failingIds.push(t.id);
    if (t.widthPx >= 24 && t.heightPx >= 24) passingAaCount += 1;
  }

  const targetAaaPass = sanitized.length > 0 && passingAaaCount === sanitized.length;
  const targetAaPass = sanitized.length > 0 && passingAaCount === sanitized.length;
  const spacingPass = sanitized.length === 0 || minGapPx >= 6;
  const focusW = clampNum(input.focusRing.outlineWidthPx, 0, 12);
  const focusC = clampNum(input.focusRing.contrastRatio, 1, 21);
  const focusOff = clampNum(input.focusRing.offsetPx, 0, 12);
  const focusAppearancePass = input.focusRing.usesVisibleRing && focusW >= 2 && focusC >= 3.0 && focusOff >= 1;
  const focusUnobscuredPass = !input.focusRing.obscuredByStickyChrome;
  const textContrast = clampNum(input.textContrastRatio, 1, 21);
  const uiContrast = clampNum(input.uiComponentContrastRatio, 1, 21);
  const textContrastAaaPass = textContrast >= 7.0;
  const textContrastAaPass = textContrast >= 4.5;
  const uiContrastPass = uiContrast >= 3.0;

  const typo = input.typography;
  const fontSize = clampNum(typo.fontSizePx, 8, 48);
  const lineHeight = clampNum(typo.lineHeightRatio, 0.8, 3.0);
  const letterSpacing = clampNum(typo.letterSpacingEm, -0.2, 0.5);
  const wordSpacing = clampNum(typo.wordSpacingEm, -0.2, 1.0);
  const paragraphMult = clampNum(typo.paragraphSpacingMultiplier, 0.8, 4.0);
  const measureChars = clampNum(typo.maxMeasureChars, 10, 140);
  const spacingReadabilityPass = lineHeight >= 1.5 && letterSpacing >= 0.0 && paragraphMult >= 1.8 && fontSize >= 14;
  const koreanDyslexiaPass =
    fontSize >= 14 && lineHeight >= 1.55 && letterSpacing >= 0.015 && wordSpacing >= 0.08 &&
    measureChars <= 45 && typo.usesKeepAllWordBreak && typo.usesTabularNums && typo.avoidsJustifyAlignment;
  const motionAaaPass = typo.reducedMotionRespected;

  const krScore =
    (fontSize >= 14 ? 15 : 0) + (lineHeight >= 1.55 ? 20 : lineHeight >= 1.45 ? 10 : 0) +
    (letterSpacing >= 0.015 && letterSpacing <= 0.14 ? 15 : letterSpacing >= 0 ? 8 : 0) +
    (wordSpacing >= 0.08 ? 10 : 0) + (measureChars <= 45 ? 12 : 0) +
    (typo.usesKeepAllWordBreak ? 13 : 0) + (typo.usesTabularNums ? 8 : 0) + (typo.avoidsJustifyAlignment ? 7 : 0);

  const checks: AccessibilityCheckItem[] = [
    makeCheck("WCAG 2.2 SC 2.5.5", "AAA", targetAaaPass && spacingPass, "터치 타깃 크기 (AAA 44×44px)", "Target Size Enhanced (44×44px)", `${Math.round(minWidthPx)}×${Math.round(minHeightPx)}px · 간격 ${Math.round(minGapPx)}px`, ">= 44×44px · 간격 >= 6px", targetAaaPass ? "모든 조작 버튼이 44×44px 안전 면적을 충족합니다." : `${failingIds.length}개 컨트롤이 44×44px 미만입니다.`, targetAaaPass ? "All interactive controls satisfy 44×44px AAA touch targets." : `${failingIds.length} controls fall below 44×44px.`),
    makeCheck("WCAG 2.2 SC 2.4.13", "AAA", focusAppearancePass, "포커스 링 가시성 · 대비", "Focus Appearance (AAA)", `${focusW.toFixed(1)}px · ${focusC.toFixed(1)}:1 · offset ${focusOff}px`, ">= 2px · >= 3.0:1 · offset >= 1px", focusAppearancePass ? "키보드 포커스 외곽선이 2px 이상 고대비로 선명합니다." : "포커스 링 두께(>=2px)·대비(>=3:1)·오프셋(>=1px)을 보강하세요.", focusAppearancePass ? "Focus ring meets >= 2px thickness and >= 3:1 contrast." : "Increase focus ring width (>=2px), contrast (>=3:1), and offset (>=1px)."),
    makeCheck("WCAG 2.2 SC 2.4.12", "AAA", focusUnobscuredPass, "고정 크롬 포커스 가림 없음", "Focus Not Obscured (Enhanced)", focusUnobscuredPass ? "가림 없음" : "고정 바 가림 발생", "0% 가림", focusUnobscuredPass ? "초점 요소가 고정 바나 플로팅 패널에 가려지지 않습니다." : "고정 크롬이 초점 요소를 덮고 있어 여백 확보가 필요합니다.", focusUnobscuredPass ? "Focused elements are never obscured by sticky toolbars." : "Sticky chrome obscures focused controls; add scroll-margin."),
    makeCheck("WCAG 2.2 SC 1.4.6", "AAA", textContrastAaaPass, "본문 텍스트 명암 대비 (AAA 7:1)", "Enhanced Text Contrast (7:1)", `${textContrast.toFixed(1)}:1`, ">= 7.0:1 (AA >= 4.5:1)", textContrastAaaPass ? "장시간 작업에서도 선명한 7:1 이상 대비를 유지합니다." : "본문 대비를 7.0:1 이상으로 상향해야 AAA 기준을 충족합니다.", textContrastAaaPass ? "Body text exceeds 7.0:1 AAA contrast." : "Raise body text contrast to >= 7.0:1 for AAA."),
    makeCheck("WCAG 2.2 SC 1.4.11", "AA", uiContrastPass, "UI 경계·아이콘 대비 (3:1)", "Non-Text UI Contrast (3:1)", `${uiContrast.toFixed(1)}:1`, ">= 3.0:1", uiContrastPass ? "입력창 경계와 슬라이더 트랙이 뚜렷이 구분됩니다." : "비텍스트 UI 경계 대비를 3.0:1 이상으로 보강하세요.", uiContrastPass ? "Borders, sliders, and icons exceed 3.0:1 contrast." : "Increase UI border and icon contrast to >= 3.0:1."),
    makeCheck("WCAG 2.2 SC 1.4.12", "AA", spacingReadabilityPass, "행간·문단 간격 탄력성", "Text Spacing Resilience", `행간 ${lineHeight.toFixed(2)} · 자간 ${letterSpacing.toFixed(2)}em`, "행간 >= 1.50 · 자간 >= 0.00em", spacingReadabilityPass ? "행간 1.5배 이상과 충분한 문단 여백으로 줄 겹침을 방지합니다." : "행간 1.5+, 자간 0em+, 문단 간격 1.8x+로 넓히세요.", spacingReadabilityPass ? "Line height and paragraph spacing prevent collisions." : "Raise line height (>=1.5), letter spacing (>=0em), and paragraph spacing (>=1.8x)."),
    makeCheck("KR-DYSLEXIA-READ", "AAA", koreanDyslexiaPass, "한국어 어절·자간 선호 규칙", "Korean Readability Example Readability", `${krScore}/100 · ${typo.usesKeepAllWordBreak ? "keep-all" : "break-all"} · ${Math.round(measureChars)}자/줄`, "keep-all · tabular-nums · <= 45자/줄 · 행간 >= 1.55", koreanDyslexiaPass ? "어절 줄바꿈(keep-all), 고정폭 숫자, 여유 있는 한글 행간/자간을 충족합니다." : "keep-all, tabular-nums, 좌측 정렬, 45자 이하 줄길이를 적용하세요.", koreanDyslexiaPass ? "Hangul keep-all wrapping, tabular numerals, and generous spacing are active." : "Enable keep-all, tabular-nums, left alignment, and <= 45 Hangul chars/line."),
    makeCheck("WCAG 2.2 SC 2.3.3", "AAA", motionAaaPass, "모션 감소(prefers-reduced-motion) 존중", "Animation from Interactions (AAA)", motionAaaPass ? "모션 감소 준수" : "모션 감소 미반영", "motion-reduce 즉시 전환", motionAaaPass ? "입력값은 비필수 전환 애니메이션 감소를 가정합니다." : "prefers-reduced-motion 설정 시 0ms 즉시 전환을 적용하세요.", motionAaaPass ? "The input assumes that non-essential transitions are reduced." : "Respect prefers-reduced-motion with instant 0ms transitions."),
  ];

  const remediationPairs: readonly [boolean, string, string][] = [
    [!targetAaaPass || !spacingPass, "모든 터치 버튼을 최소 44×44px(min-h-11) 이상으로 키우고 간격을 8px 이상 확보하세요.", "Enlarge all interactive targets to >= 44×44px with >= 8px gaps."],
    [!focusAppearancePass || !focusUnobscuredPass, "포커스 링을 2px 이상 고대비(ring-2 ring-accent)로 유지하고 고정 크롬 가림을 해제하세요.", "Apply a >= 2px high-contrast focus ring and clear sticky chrome overlap."],
    [!textContrastAaaPass || !uiContrastPass, "본문 대비를 7.0:1 이상, 비텍스트 경계 대비를 3.0:1 이상으로 조정하세요.", "Raise body contrast to >= 7.0:1 and UI border contrast to >= 3.0:1."],
    [!koreanDyslexiaPass || !spacingReadabilityPass, "한국어 가독성을 위해 행간 1.65+, 자간 +0.02em+, keep-all, tabular-nums, 45자 이내 줄길이를 활성화하세요.", "Set line-height >= 1.65, letter-spacing >= 0.02em, keep-all, tabular-nums, and <= 45 chars/line."],
    [!motionAaaPass, "모션을 줄이는 표시 설정을 비교하고 실제 화면에서 동작을 확인하세요.", "Compare reduced-motion preferences and verify actual screen behavior."],
  ];
  const passedCount = checks.filter((c) => c.passed).length;
  const passesProvidedAaaChecks = checks.every((c) => c.passed);
  const passesProvidedAaChecks = targetAaPass && textContrastAaPass && uiContrastPass && spacingReadabilityPass && input.focusRing.usesVisibleRing;

  return {
    scope: "provided-input-example", domAudited: false, clinicalAssessmentPerformed: false,
    grade: passesProvidedAaaChecks ? "AAA" : passesProvidedAaChecks ? "AA" : "FAIL",
    overallScore: clampNum(Math.round((passedCount / checks.length) * 80 + krScore * 0.2), 0, 100),
    passesProvidedAaaChecks, passesProvidedAaChecks,
    passesW3cAaa: false, passesW3cAa: false,
    touchTargetSummary: {
      total: sanitized.length, passingAaaCount, passingAaCount, failingIds,
      minWidthPx: sanitized.length > 0 ? minWidthPx : 0, minHeightPx: sanitized.length > 0 ? minHeightPx : 0, minGapPx: sanitized.length > 0 ? minGapPx : 0,
    },
    focusRingPassesAaa: focusAppearancePass && focusUnobscuredPass,
    koreanReadabilityScore: krScore, passesDyslexiaFriendly: koreanDyslexiaPass, checks,
    remediationStepsKo: remediationPairs.filter(([need]) => need).map(([, ko]) => ko),
    remediationStepsEn: remediationPairs.filter(([need]) => need).map(([, , en]) => en),
  };
}

/** 미달 항목을 WCAG 2.2 AAA + 한국어 난독 친화 기준선으로 원클릭 자동 보정 */
export function applyAaaRemediation(input: StudioAccessibilityAuditInput): StudioAccessibilityAuditInput {
  const f = input.focusRing;
  const t = input.typography;
  return {
    touchTargets: input.touchTargets.map((item) => ({ ...item, widthPx: Math.max(44, clampNum(item.widthPx, 44, 400)), heightPx: Math.max(44, clampNum(item.heightPx, 44, 400)), gapPx: Math.max(8, clampNum(item.gapPx, 8, 100)) })),
    focusRing: { outlineWidthPx: Math.max(2, clampNum(f.outlineWidthPx, 2, 12)), contrastRatio: Math.max(5.0, clampNum(f.contrastRatio, 5.0, 21)), offsetPx: Math.max(2, clampNum(f.offsetPx, 2, 12)), usesVisibleRing: true, obscuredByStickyChrome: false },
    textContrastRatio: Math.max(8.0, clampNum(input.textContrastRatio, 8.0, 21)),
    uiComponentContrastRatio: Math.max(4.5, clampNum(input.uiComponentContrastRatio, 4.5, 21)),
    typography: {
      fontSizePx: Math.max(15, clampNum(t.fontSizePx, 15, 48)), lineHeightRatio: Math.max(1.65, clampNum(t.lineHeightRatio, 1.65, 3.0)),
      letterSpacingEm: Math.max(0.03, clampNum(t.letterSpacingEm, 0.03, 0.12)), wordSpacingEm: Math.max(0.14, clampNum(t.wordSpacingEm, 0.14, 0.4)),
      paragraphSpacingMultiplier: Math.max(2.0, clampNum(t.paragraphSpacingMultiplier, 2.0, 4.0)),
      maxMeasureChars: Math.min(42, Math.max(28, clampNum(t.maxMeasureChars, 28, 42))),
      usesKeepAllWordBreak: true, usesTabularNums: true, avoidsJustifyAlignment: true, reducedMotionRespected: true,
    },
  };
}
