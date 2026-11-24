/**
 * 온디바이스 로컬 습관 JSON 직렬화/복원 · OPFS 스냅샷 저장소 · 샘플 작업 시드.
 * Web Storage 미사용 · 외부 서버 전송 0바이트 · 프로토타입 오염 키 차단.
 */

import {
  LOCAL_HABIT_OPFS_DIR,
  LOCAL_HABIT_OPFS_FILE,
  LOCAL_HABIT_SNAPSHOT_SCHEMA_VERSION,
  MAX_ACTION_HISTORY,
  MAX_COLOR_OBSERVATIONS,
  MAX_IMPORT_JSON_BYTES,
  clampNumber,
  isSafeHabitKey,
  roundToDigits,
  sanitizeHabitKey,
  sanitizeOklchColor,
  type ActionDescriptor,
  type BrushDescriptor,
  type BrushWorkflowStage,
  type ColorUsageKind,
  type CreatorHabitEvent,
  type ImportLocalHabitsResult,
  type LocalCreatorHabitState,
  type OpfsDirectoryHandleLike,
  type OpfsSnapshotLoadResult,
  type OpfsSnapshotSaveResult,
  type OpfsStorageManagerLike,
  type StoredColorObservation,
  type StudioActionCategory,
} from "./local-habit-types";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeCountRecord(input: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isPlainRecord(input)) return out;
  for (const [key, val] of Object.entries(input)) {
    if (!isSafeHabitKey(key)) continue;
    if (typeof val === "number" && Number.isFinite(val) && val > 0) {
      out[key] = Math.round(val);
    }
  }
  return out;
}

export function exportLocalHabitsToJson(state: LocalCreatorHabitState): string {
  return JSON.stringify(
    { ...state, schemaVersion: LOCAL_HABIT_SNAPSHOT_SCHEMA_VERSION, externalBytesTransmitted: 0 },
    null,
    2,
  );
}

export function importLocalHabitsFromJson(jsonText: string): ImportLocalHabitsResult {
  const trimmed = jsonText.trim();
  if (!trimmed) {
    return {
      ok: false, state: null, errorCode: "empty",
      errorMessageKo: "가져올 JSON 데이터가 비어 있습니다.",
      errorMessageEn: "Import JSON payload is empty.",
      externalBytesTransmitted: 0,
    };
  }
  if (trimmed.length > MAX_IMPORT_JSON_BYTES) {
    return {
      ok: false, state: null, errorCode: "payload-too-large",
      errorMessageKo: "JSON 크기가 1 MiB 제한을 초과했습니다.",
      errorMessageEn: "JSON payload exceeds the 1 MiB safety limit.",
      externalBytesTransmitted: 0,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false, state: null, errorCode: "invalid-json",
      errorMessageKo: "올바른 JSON 형식이 아닙니다.",
      errorMessageEn: "Malformed JSON syntax.",
      externalBytesTransmitted: 0,
    };
  }
  if (!isPlainRecord(parsed) || parsed.schemaVersion !== LOCAL_HABIT_SNAPSHOT_SCHEMA_VERSION) {
    return {
      ok: false, state: null, errorCode: "invalid-schema",
      errorMessageKo: "지원하지 않는 스냅샷 버전(v1 필요)입니다.",
      errorMessageEn: "Unsupported habit snapshot schema version (v1 required).",
      externalBytesTransmitted: 0,
    };
  }

  const validUsages = new Set<ColorUsageKind>(["lineart", "base-fill", "shading", "highlight", "background"]);
  const validStages = new Set<BrushWorkflowStage>(["rough", "ink", "flat", "shade", "fx", "lettering"]);
  const validCategories = new Set<StudioActionCategory>(["panel", "layer", "color", "brush", "export"]);

  const rawColors = Array.isArray(parsed.colorObservations) ? parsed.colorObservations : [];
  const colorObservations: StoredColorObservation[] = [];
  for (const item of rawColors.slice(-MAX_COLOR_OBSERVATIONS)) {
    if (!isPlainRecord(item)) continue;
    const l = typeof item.l === "number" ? item.l : NaN;
    const c = typeof item.c === "number" ? item.c : NaN;
    const h = typeof item.h === "number" ? item.h : NaN;
    if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h)) continue;
    const safe = sanitizeOklchColor({ l, c, h });
    const usage = typeof item.usage === "string" && validUsages.has(item.usage as ColorUsageKind)
      ? (item.usage as ColorUsageKind)
      : "base-fill";
    const weight = typeof item.weight === "number" ? roundToDigits(clampNumber(item.weight, 0.1, 20), 3) : 1;
    colorObservations.push({ ...safe, weight, usage });
  }

  const brushCatalog: Record<string, BrushDescriptor> = {};
  if (isPlainRecord(parsed.brushCatalog)) {
    for (const [key, raw] of Object.entries(parsed.brushCatalog)) {
      if (!isSafeHabitKey(key) || !isPlainRecord(raw)) continue;
      const id = sanitizeHabitKey(typeof raw.id === "string" ? raw.id : key);
      if (!isSafeHabitKey(id)) continue;
      brushCatalog[id] = {
        id,
        labelKo: typeof raw.labelKo === "string" && raw.labelKo.trim() ? raw.labelKo.trim().slice(0, 64) : id,
        labelEn: typeof raw.labelEn === "string" && raw.labelEn.trim() ? raw.labelEn.trim().slice(0, 64) : id,
        stage: typeof raw.stage === "string" && validStages.has(raw.stage as BrushWorkflowStage)
          ? (raw.stage as BrushWorkflowStage)
          : "ink",
        totalUses: typeof raw.totalUses === "number" && Number.isFinite(raw.totalUses) ? Math.max(0, Math.round(raw.totalUses)) : 0,
      };
    }
  }

  const brushTransitions: Record<string, Record<string, number>> = {};
  if (isPlainRecord(parsed.brushTransitions)) {
    for (const [fromKey, row] of Object.entries(parsed.brushTransitions)) {
      if (!isSafeHabitKey(fromKey) || !isPlainRecord(row)) continue;
      const safeRow = sanitizeCountRecord(row);
      if (Object.keys(safeRow).length > 0) brushTransitions[fromKey] = safeRow;
    }
  }

  const actionCatalog: Record<string, ActionDescriptor> = {};
  if (isPlainRecord(parsed.actionCatalog)) {
    for (const [key, raw] of Object.entries(parsed.actionCatalog)) {
      if (!isSafeHabitKey(key) || !isPlainRecord(raw)) continue;
      const id = sanitizeHabitKey(typeof raw.id === "string" ? raw.id : key);
      if (!isSafeHabitKey(id)) continue;
      actionCatalog[id] = {
        id,
        labelKo: typeof raw.labelKo === "string" && raw.labelKo.trim() ? raw.labelKo.trim().slice(0, 64) : id,
        labelEn: typeof raw.labelEn === "string" && raw.labelEn.trim() ? raw.labelEn.trim().slice(0, 64) : id,
        category: typeof raw.category === "string" && validCategories.has(raw.category as StudioActionCategory)
          ? (raw.category as StudioActionCategory)
          : "layer",
        totalRuns: typeof raw.totalRuns === "number" && Number.isFinite(raw.totalRuns) ? Math.max(0, Math.round(raw.totalRuns)) : 0,
      };
    }
  }

  const actionHistory: string[] = Array.isArray(parsed.actionHistory)
    ? parsed.actionHistory
      .filter((x): x is string => typeof x === "string")
      .map(sanitizeHabitKey)
      .filter(isSafeHabitKey)
      .slice(-MAX_ACTION_HISTORY)
    : [];

  const lastBrushId = typeof parsed.lastBrushId === "string" && isSafeHabitKey(parsed.lastBrushId) && brushCatalog[parsed.lastBrushId]
    ? parsed.lastBrushId
    : null;

  const state: LocalCreatorHabitState = {
    schemaVersion: LOCAL_HABIT_SNAPSHOT_SCHEMA_VERSION,
    optInEnabled: Boolean(parsed.optInEnabled),
    updatedAtMs: typeof parsed.updatedAtMs === "number" && Number.isFinite(parsed.updatedAtMs) ? Math.max(0, Math.round(parsed.updatedAtMs)) : 0,
    externalBytesTransmitted: 0,
    totalRecordedEvents: typeof parsed.totalRecordedEvents === "number" && Number.isFinite(parsed.totalRecordedEvents)
      ? Math.max(0, Math.round(parsed.totalRecordedEvents))
      : colorObservations.length + actionHistory.length,
    colorObservations,
    brushCatalog,
    lastBrushId,
    brushTransitions,
    panelAspectCounts: sanitizeCountRecord(parsed.panelAspectCounts),
    panelAnchorCounts: sanitizeCountRecord(parsed.panelAnchorCounts),
    panelPairCounts: sanitizeCountRecord(parsed.panelPairCounts),
    actionCatalog,
    actionHistory,
    appliedSuggestionCount: typeof parsed.appliedSuggestionCount === "number" && Number.isFinite(parsed.appliedSuggestionCount)
      ? Math.max(0, Math.round(parsed.appliedSuggestionCount))
      : 0,
    executedMacroCount: typeof parsed.executedMacroCount === "number" && Number.isFinite(parsed.executedMacroCount)
      ? Math.max(0, Math.round(parsed.executedMacroCount))
      : 0,
  };

  return { ok: true, state, errorCode: null, errorMessageKo: null, errorMessageEn: null, externalBytesTransmitted: 0 };
}

// === OPFS 온디바이스 스냅샷 어댑터 ===

function resolveBrowserOpfsManager(explicit?: OpfsStorageManagerLike | null): OpfsStorageManagerLike | null {
  if (explicit !== undefined) return explicit;
  if (typeof navigator === "undefined") return null;
  const candidate = (navigator as Navigator & { readonly storage?: { readonly getDirectory?: unknown } }).storage;
  if (candidate && typeof candidate.getDirectory === "function") {
    return candidate as OpfsStorageManagerLike;
  }
  return null;
}

export async function saveLocalHabitsSnapshotToOpfs(
  state: LocalCreatorHabitState,
  storageManager?: OpfsStorageManagerLike | null,
): Promise<OpfsSnapshotSaveResult> {
  const manager = resolveBrowserOpfsManager(storageManager);
  if (!manager) {
    return {
      saved: false, backend: "memory-only", bytesWritten: 0, externalBytesTransmitted: 0,
      reason: "OPFS를 지원하지 않는 환경이므로 메모리 전용 모드로 동작합니다.",
    };
  }
  try {
    const root = await manager.getDirectory();
    const dir = await root.getDirectoryHandle(LOCAL_HABIT_OPFS_DIR, { create: true });
    const fileHandle = await dir.getFileHandle(LOCAL_HABIT_OPFS_FILE, { create: true });
    const writable = await fileHandle.createWritable();
    const payload = exportLocalHabitsToJson(state);
    await writable.write(payload);
    await writable.close();
    return {
      saved: true,
      backend: "opfs",
      bytesWritten: new TextEncoder().encode(payload).byteLength,
      externalBytesTransmitted: 0,
      reason: null,
    };
  } catch (error) {
    return {
      saved: false, backend: "memory-only", bytesWritten: 0, externalBytesTransmitted: 0,
      reason: error instanceof Error ? error.message : "OPFS 저장 실패",
    };
  }
}

export async function loadLocalHabitsSnapshotFromOpfs(
  storageManager?: OpfsStorageManagerLike | null,
): Promise<OpfsSnapshotLoadResult> {
  const manager = resolveBrowserOpfsManager(storageManager);
  if (!manager) {
    return { loaded: false, state: null, backend: "memory-only", externalBytesTransmitted: 0, reason: "OPFS 미지원" };
  }
  try {
    const root = await manager.getDirectory();
    const dir = await root.getDirectoryHandle(LOCAL_HABIT_OPFS_DIR, { create: false });
    const fileHandle = await dir.getFileHandle(LOCAL_HABIT_OPFS_FILE, { create: false });
    const file = await fileHandle.getFile();
    const imported = importLocalHabitsFromJson(await file.text());
    if (!imported.ok || !imported.state) {
      return { loaded: false, state: null, backend: "opfs", externalBytesTransmitted: 0, reason: imported.errorMessageKo };
    }
    return { loaded: true, state: imported.state, backend: "opfs", externalBytesTransmitted: 0, reason: null };
  } catch {
    return { loaded: false, state: null, backend: "opfs", externalBytesTransmitted: 0, reason: "저장된 로컬 스냅샷 없음" };
  }
}

export async function wipeLocalHabitsSnapshotInOpfs(
  storageManager?: OpfsStorageManagerLike | null,
): Promise<{ readonly wiped: boolean; readonly externalBytesTransmitted: 0 }> {
  const manager = resolveBrowserOpfsManager(storageManager);
  if (!manager) return { wiped: false, externalBytesTransmitted: 0 };
  try {
    const root = await manager.getDirectory();
    const dir = await root.getDirectoryHandle(LOCAL_HABIT_OPFS_DIR, { create: false });
    await dir.removeEntry(LOCAL_HABIT_OPFS_FILE);
    return { wiped: true, externalBytesTransmitted: 0 };
  } catch {
    return { wiped: true, externalBytesTransmitted: 0 };
  }
}

/** 테스트·헤드리스 미리보기용 순수 인메모리 OPFS 호환 어댑터. */
export function createInMemoryOpfsStorageManager(): OpfsStorageManagerLike {
  const tree = new Map<string, Map<string, string>>();
  const createDirHandle = (dirName: string): OpfsDirectoryHandleLike => ({
    async getDirectoryHandle(name, options) {
      const fullKey = `${dirName}/${name}`;
      if (!tree.has(fullKey)) {
        if (!options?.create) {
          const err = new Error("NotFoundError");
          err.name = "NotFoundError";
          throw err;
        }
        tree.set(fullKey, new Map());
      }
      return createDirHandle(fullKey);
    },
    async getFileHandle(name, options) {
      const files = tree.get(dirName);
      if (!files || (!files.has(name) && !options?.create)) {
        const err = new Error("NotFoundError");
        err.name = "NotFoundError";
        throw err;
      }
      if (!files.has(name)) files.set(name, "");
      return {
        async getFile() {
          return { async text() { return files.get(name) ?? ""; } };
        },
        async createWritable() {
          let buf = "";
          return {
            async write(data) {
              buf += typeof data === "string" ? data : new TextDecoder().decode(data);
            },
            async close() {
              files.set(name, buf);
            },
          };
        },
      };
    },
    async removeEntry(name) {
      const files = tree.get(dirName);
      if (!files || !files.has(name)) {
        const err = new Error("NotFoundError");
        err.name = "NotFoundError";
        throw err;
      }
      files.delete(name);
    },
  });
  return { async getDirectory() { return createDirHandle("root"); } };
}

export const SAMPLE_CREATOR_WORKFLOW_EVENTS: readonly CreatorHabitEvent[] = [
  { kind: "color-used", color: { l: 0.21, c: 0.018, h: 255 }, weight: 2.2, usage: "lineart", timestampMs: 1001 },
  { kind: "color-used", color: { l: 0.23, c: 0.021, h: 258 }, weight: 2.0, usage: "lineart", timestampMs: 1002 },
  { kind: "color-used", color: { l: 0.19, c: 0.015, h: 250 }, weight: 1.8, usage: "lineart", timestampMs: 1003 },
  { kind: "color-used", color: { l: 0.82, c: 0.068, h: 56 }, weight: 2.5, usage: "base-fill", timestampMs: 1004 },
  { kind: "color-used", color: { l: 0.8, c: 0.072, h: 52 }, weight: 2.3, usage: "base-fill", timestampMs: 1005 },
  { kind: "color-used", color: { l: 0.83, c: 0.064, h: 59 }, weight: 2.1, usage: "base-fill", timestampMs: 1006 },
  { kind: "color-used", color: { l: 0.58, c: 0.165, h: 24 }, weight: 1.9, usage: "shading", timestampMs: 1007 },
  { kind: "color-used", color: { l: 0.56, c: 0.172, h: 28 }, weight: 1.8, usage: "shading", timestampMs: 1008 },
  { kind: "color-used", color: { l: 0.6, c: 0.158, h: 20 }, weight: 1.5, usage: "shading", timestampMs: 1009 },
  { kind: "color-used", color: { l: 0.45, c: 0.092, h: 238 }, weight: 1.7, usage: "background", timestampMs: 1010 },
  { kind: "color-used", color: { l: 0.47, c: 0.088, h: 242 }, weight: 1.6, usage: "background", timestampMs: 1011 },
  { kind: "color-used", color: { l: 0.43, c: 0.095, h: 234 }, weight: 1.5, usage: "background", timestampMs: 1012 },
  { kind: "color-used", color: { l: 0.94, c: 0.022, h: 88 }, weight: 1.4, usage: "highlight", timestampMs: 1013 },
  { kind: "color-used", color: { l: 0.96, c: 0.018, h: 92 }, weight: 1.3, usage: "highlight", timestampMs: 1014 },
  ...Array.from({ length: 4 }, (_, cycle): readonly CreatorHabitEvent[] => {
    const base = 2000 + cycle * 10;
    return [
      { kind: "brush-selected", brushId: "rough-pencil", brushLabelKo: "러프 연필", brushLabelEn: "Rough Pencil", stage: "rough", timestampMs: base + 1 },
      { kind: "brush-selected", brushId: "g-pen-ink", brushLabelKo: "G펜 잉킹", brushLabelEn: "G-Pen Ink", stage: "ink", timestampMs: base + 2 },
      { kind: "brush-selected", brushId: "flat-fill", brushLabelKo: "평채색 브러시", brushLabelEn: "Flat Fill Brush", stage: "flat", timestampMs: base + 3 },
      { kind: "brush-selected", brushId: "cel-shade", brushLabelKo: "셀 명암 브러시", brushLabelEn: "Cel Shade Brush", stage: "shade", timestampMs: base + 4 },
      { kind: "brush-selected", brushId: "highlight-air", brushLabelKo: "하이라이트 에어", brushLabelEn: "Highlight Airbrush", stage: "fx", timestampMs: base + 5 },
    ];
  }).flat(),
  { kind: "brush-selected", brushId: "g-pen-ink", brushLabelKo: "G펜 잉킹", brushLabelEn: "G-Pen Ink", stage: "ink", timestampMs: 2099 },
  { kind: "panel-created", aspectRatio: "9:16", anchor: "top-center", timestampMs: 3001 },
  { kind: "panel-created", aspectRatio: "9:16", anchor: "top-center", timestampMs: 3002 },
  { kind: "panel-created", aspectRatio: "9:16", anchor: "top-center", timestampMs: 3003 },
  { kind: "panel-created", aspectRatio: "9:16", anchor: "top-center", timestampMs: 3004 },
  { kind: "panel-created", aspectRatio: "4:5", anchor: "center", timestampMs: 3005 },
  ...Array.from({ length: 4 }, (_, idx): readonly CreatorHabitEvent[] => {
    const base = 4000 + idx * 10;
    return [
      { kind: "studio-action", actionId: "create-vertical-panel", labelKo: "세로 컷 생성", labelEn: "Create Vertical Panel", category: "panel", timestampMs: base + 1 },
      { kind: "studio-action", actionId: "add-ink-layer", labelKo: "선화 레이어 추가", labelEn: "Add Ink Layer", category: "layer", timestampMs: base + 2 },
      { kind: "studio-action", actionId: "clip-multiply-shade", labelKo: "곱하기 명암 클리핑", labelEn: "Clip Multiply Shade", category: "layer", timestampMs: base + 3 },
    ];
  }).flat(),
  ...Array.from({ length: 3 }, (_, idx): readonly CreatorHabitEvent[] => {
    const base = 4200 + idx * 10;
    return [
      { kind: "studio-action", actionId: "add-glow-dodge", labelKo: "발광 닷지 레이어", labelEn: "Add Glow Dodge Layer", category: "layer", timestampMs: base + 1 },
      { kind: "studio-action", actionId: "lock-alpha-tint", labelKo: "알파 잠금 색 보정", labelEn: "Lock Alpha Tint", category: "color", timestampMs: base + 2 },
    ];
  }).flat(),
];
