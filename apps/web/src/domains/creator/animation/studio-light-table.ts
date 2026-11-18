/**
 * Studio Light Table — CSP 라이트 테이블(`URLayerLightTable*`, tool var 535) 순수 모델.
 *
 * 특징:
 * - 캔버스 전역(global) 참조 셀과 개별 셀 전용(cel-specific) 참조 스택을 분리 관리한다.
 * - 각 항목은 원본 픽셀을 절대 변형하지 않고 비파괴 2x3 아핀 행렬(`tx, ty, scale, rotationDeg, flipX`),
 *   불투명도(`0..1`), 색조(`none | colorize | half-color`, `tintHex`)만 합성 메타데이터로 보관한다.
 * - 최종 이미지·영상 내보내기(`isExporting: true`) 시 항상 스택에서 자동 제외된다.
 * - 어니언스킨 인접 프레임들을 라이트 테이블 참조 슬롯으로 일괄 등록(`registerOnionSkinFramesToLightTable`)할 수 있다.
 *
 * REA 근거(clean-room math):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_84e24ea66b2393d0fa57182b4de9dbe3be9c25ee54f982c2dcfc534bf63eddda
 */
import {
  onionSkinLayers,
  onionSkinRgbToHex,
  resolveOnionSkinLayerColorRgb,
  type OnionSkinSettings,
  type StudioAnimFrame,
} from "../studio-frame-animation";

export type LightTableSourceKind = "layer" | "frame";
export type LightTableTintMode = "none" | "colorize" | "half-color";

/** 2x3 아핀 변환 행렬 `[a, b, c, d, tx, ty]` (`x' = a*x + c*y + tx`, `y' = b*x + d*y + ty`). */
export type AffineMatrix2D = readonly [number, number, number, number, number, number];

export interface LightTableTransform {
  readonly tx: number;
  readonly ty: number;
  readonly scale: number;
  readonly rotationDeg: number;
  readonly flipX: boolean;
}

export interface LightTableEntry {
  readonly id: string;
  readonly sourceKind: LightTableSourceKind;
  readonly sourceId: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly tintMode: LightTableTintMode;
  readonly tintHex: string;
  readonly transform: LightTableTransform;
}

export interface StudioLightTableState {
  readonly enabled: boolean;
  readonly globalEntries: readonly LightTableEntry[];
  readonly celEntriesByCelId: Readonly<Record<string, readonly LightTableEntry[]>>;
}

export interface ResolvedLightTableLayer {
  readonly entry: LightTableEntry;
  readonly scope: "cel" | "global";
  readonly matrix: AffineMatrix2D;
  readonly effectiveOpacity: number;
  readonly tintRgb: { readonly r: number; readonly g: number; readonly b: number } | null;
  readonly excludedFromExport: true;
}

export const DEFAULT_LIGHT_TABLE_TRANSFORM: LightTableTransform = Object.freeze({
  tx: 0,
  ty: 0,
  scale: 1,
  rotationDeg: 0,
  flipX: false,
});

const MIN_LIGHT_TABLE_SCALE = 0.05;
const MAX_LIGHT_TABLE_SCALE = 16;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(hex: string, fallback = "#3b82f6"): string {
  const cleaned = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/u.test(cleaned)) return cleaned;
  if (/^#[0-9a-f]{3}$/u.test(cleaned)) {
    const r = cleaned[1]!;
    const g = cleaned[2]!;
    const b = cleaned[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

export function hexToRgbColor(hex: string): { readonly r: number; readonly g: number; readonly b: number } {
  const norm = normalizeHexColor(hex);
  return {
    r: Number.parseInt(norm.slice(1, 3), 16),
    g: Number.parseInt(norm.slice(3, 5), 16),
    b: Number.parseInt(norm.slice(5, 7), 16),
  };
}

export function normalizeLightTableTransform(
  raw?: Partial<LightTableTransform> | null,
): LightTableTransform {
  return {
    tx: Number.isFinite(raw?.tx) ? (raw!.tx as number) : 0,
    ty: Number.isFinite(raw?.ty) ? (raw!.ty as number) : 0,
    scale: Number.isFinite(raw?.scale)
      ? clamp(raw!.scale as number, MIN_LIGHT_TABLE_SCALE, MAX_LIGHT_TABLE_SCALE)
      : 1,
    rotationDeg: Number.isFinite(raw?.rotationDeg) ? (raw!.rotationDeg as number) : 0,
    flipX: raw?.flipX === true,
  };
}

export function normalizeLightTableEntry(entry: LightTableEntry): LightTableEntry {
  const tintMode: LightTableTintMode =
    entry.tintMode === "colorize" || entry.tintMode === "half-color" ? entry.tintMode : "none";
  return {
    id: entry.id.trim() || `lt-${entry.sourceKind}-${entry.sourceId}`,
    sourceKind: entry.sourceKind === "layer" ? "layer" : "frame",
    sourceId: entry.sourceId.trim(),
    visible: entry.visible !== false,
    opacity: clamp(entry.opacity, 0, 1),
    tintMode,
    tintHex: normalizeHexColor(entry.tintHex),
    transform: normalizeLightTableTransform(entry.transform),
  };
}

// ── 순수 2x3 행렬 대수 헬퍼 ──────────────────────────────────────────

export function identityMatrix2D(): AffineMatrix2D {
  return [1, 0, 0, 1, 0, 0];
}

/** `m1 * m2` (오른쪽 `m2` 먼저 적용 후 왼쪽 `m1` 적용). */
export function multiplyMatrix2D(m1: AffineMatrix2D, m2: AffineMatrix2D): AffineMatrix2D {
  const [a1, b1, c1, d1, tx1, ty1] = m1;
  const [a2, b2, c2, d2, tx2, ty2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * tx2 + c1 * ty2 + tx1,
    b1 * tx2 + d1 * ty2 + ty1,
  ];
}

export function invertMatrix2D(m: AffineMatrix2D): AffineMatrix2D | null {
  const [a, b, c, d, tx, ty] = m;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  const na = d * invDet;
  const nb = -b * invDet;
  const nc = -c * invDet;
  const nd = a * invDet;
  return [
    na,
    nb,
    nc,
    nd,
    -(na * tx + nc * ty),
    -(nb * tx + nd * ty),
  ];
}

export function applyMatrix2DToPoint(
  m: AffineMatrix2D,
  x: number,
  y: number,
): { readonly x: number; readonly y: number } {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

/**
 * 라이트 테이블 항목의 `transform`을 선택적 회전/반전 중심(`pivot`) 기준 2x3 행렬로 변환한다.
 * 순서: 피벗 원점 이동 → 좌우 반전(`flipX`) → 등방 스케일(`scale`) → 회전(`rotationDeg`) → 피벗 복귀 + 평행이동(`tx, ty`).
 */
export function lightTableTransformToMatrix2D(
  rawTransform: Partial<LightTableTransform> | undefined,
  pivot: { readonly x: number; readonly y: number } = { x: 0, y: 0 },
): AffineMatrix2D {
  const t = normalizeLightTableTransform(rawTransform);
  const rad = (t.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = (t.flipX ? -1 : 1) * t.scale;
  const sy = t.scale;

  const toOrigin: AffineMatrix2D = [1, 0, 0, 1, -pivot.x, -pivot.y];
  const linear: AffineMatrix2D = [cos * sx, sin * sx, -sin * sy, cos * sy, 0, 0];
  const fromOriginAndTranslate: AffineMatrix2D = [1, 0, 0, 1, pivot.x + t.tx, pivot.y + t.ty];

  return multiplyMatrix2D(fromOriginAndTranslate, multiplyMatrix2D(linear, toOrigin));
}

// ── 라이트 테이블 상태 조작 (순수·불변) ─────────────────────────────

export function createEmptyLightTableState(enabled = true): StudioLightTableState {
  return {
    enabled,
    globalEntries: [],
    celEntriesByCelId: {},
  };
}

export function setLightTableEnabled(
  state: StudioLightTableState,
  enabled: boolean,
): StudioLightTableState {
  if (state.enabled === enabled) return state;
  return { ...state, enabled };
}

function upsertEntryInList(
  list: readonly LightTableEntry[],
  entry: LightTableEntry,
): readonly LightTableEntry[] {
  const normalized = normalizeLightTableEntry(entry);
  if (!normalized.sourceId) return list;
  const idx = list.findIndex((item) => item.id === normalized.id);
  if (idx < 0) return [...list, normalized];
  return list.map((item, i) => (i === idx ? normalized : item));
}

export function upsertGlobalLightTableEntry(
  state: StudioLightTableState,
  entry: LightTableEntry,
): StudioLightTableState {
  const next = upsertEntryInList(state.globalEntries, entry);
  if (next === state.globalEntries) return state;
  return { ...state, globalEntries: next };
}

export function upsertCelLightTableEntry(
  state: StudioLightTableState,
  celId: string,
  entry: LightTableEntry,
): StudioLightTableState {
  const key = celId.trim();
  if (!key) return state;
  const current = state.celEntriesByCelId[key] ?? [];
  const next = upsertEntryInList(current, entry);
  if (next === current) return state;
  return {
    ...state,
    celEntriesByCelId: { ...state.celEntriesByCelId, [key]: next },
  };
}

export function removeLightTableEntry(
  state: StudioLightTableState,
  entryId: string,
  celId?: string,
): StudioLightTableState {
  if (celId !== undefined) {
    const current = state.celEntriesByCelId[celId];
    if (!current) return state;
    const filtered = current.filter((item) => item.id !== entryId);
    if (filtered.length === current.length) return state;
    const nextMap = { ...state.celEntriesByCelId };
    if (filtered.length === 0) delete nextMap[celId];
    else nextMap[celId] = filtered;
    return { ...state, celEntriesByCelId: nextMap };
  }
  const filteredGlobal = state.globalEntries.filter((item) => item.id !== entryId);
  if (filteredGlobal.length === state.globalEntries.length) return state;
  return { ...state, globalEntries: filteredGlobal };
}

export function patchLightTableEntryTransform(
  state: StudioLightTableState,
  entryId: string,
  patch: Partial<LightTableTransform>,
  celId?: string,
): StudioLightTableState {
  const applyPatch = (list: readonly LightTableEntry[]) => {
    let touched = false;
    const mapped = list.map((item) => {
      if (item.id !== entryId) return item;
      touched = true;
      return {
        ...item,
        transform: normalizeLightTableTransform({ ...item.transform, ...patch }),
      };
    });
    return touched ? mapped : list;
  };

  if (celId !== undefined) {
    const current = state.celEntriesByCelId[celId];
    if (!current) return state;
    const updated = applyPatch(current);
    return updated === current
      ? state
      : { ...state, celEntriesByCelId: { ...state.celEntriesByCelId, [celId]: updated } };
  }
  const updatedGlobal = applyPatch(state.globalEntries);
  return updatedGlobal === state.globalEntries ? state : { ...state, globalEntries: updatedGlobal };
}

/**
 * 현재 활성 셀에서 합성할 라이트 테이블 참조 레이어 스택을 계산한다.
 * `isExporting: true`이거나 `state.enabled === false`이면 항상 빈 배열을 반환해 출력물 오염을 차단한다.
 */
export function resolveActiveLightTableStack(
  state: StudioLightTableState,
  options: {
    readonly activeCelId: string | null;
    readonly isExporting?: boolean;
    readonly pivot?: { readonly x: number; readonly y: number };
  },
): readonly ResolvedLightTableLayer[] {
  if (options.isExporting === true || !state.enabled) {
    return [];
  }
  const celSpecific = options.activeCelId ? (state.celEntriesByCelId[options.activeCelId] ?? []) : [];
  const resolved: ResolvedLightTableLayer[] = [];

  const append = (entries: readonly LightTableEntry[], scope: "cel" | "global") => {
    for (const entry of entries) {
      if (!entry.visible || entry.opacity <= 0) continue;
      resolved.push({
        entry,
        scope,
        matrix: lightTableTransformToMatrix2D(entry.transform, options.pivot),
        effectiveOpacity: clamp(entry.opacity, 0, 1),
        tintRgb: entry.tintMode === "none" ? null : hexToRgbColor(entry.tintHex),
        excludedFromExport: true,
      });
    }
  };

  // 전역 밑그림을 먼저 깔고, 셀 전용 참조를 그 위에 올린다.
  append(state.globalEntries, "global");
  append(celSpecific, "cel");
  return resolved;
}

/**
 * CSP `어니언스킨 프레임을 라이트 테이블에 등록` — 현재 프레임 기준 어니언스킨 레이어들을
 * 원본 프레임 데이터를 변경하지 않고 라이트 테이블 참조 항목으로 일괄 등록한다.
 */
export function registerOnionSkinFramesToLightTable(
  state: StudioLightTableState,
  frames: readonly StudioAnimFrame[],
  activeIndex: number,
  onionSettings: OnionSkinSettings,
  options?: { readonly targetCelId?: string; readonly tintMode?: LightTableTintMode },
): StudioLightTableState {
  const layers = onionSkinLayers([...frames], activeIndex, onionSettings);
  if (layers.length === 0) return state;

  let nextState = state;
  const preferredTintMode = options?.tintMode ?? "colorize";

  for (const layer of layers) {
    const resolvedRgb = resolveOnionSkinLayerColorRgb(layer, onionSettings);
    const tintHex = resolvedRgb ? onionSkinRgbToHex(resolvedRgb) : "#64748b";
    const entry: LightTableEntry = {
      id: `lt-onion-${layer.frame.id}`,
      sourceKind: "frame",
      sourceId: layer.frame.id,
      visible: true,
      opacity: layer.opacity,
      tintMode: layer.tint === "none" ? "none" : preferredTintMode,
      tintHex,
      transform: DEFAULT_LIGHT_TABLE_TRANSFORM,
    };
    nextState = options?.targetCelId
      ? upsertCelLightTableEntry(nextState, options.targetCelId, entry)
      : upsertGlobalLightTableEntry(nextState, entry);
  }
  return nextState;
}
