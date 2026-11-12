/**
 * 페인트 세션: 패널(PaintPanel)과 뷰포트(드로잉 포인터)가 공유하는 브러시 설정·활성 부위·서브레이어(Layer 0~5)·부위별 합성 레이어.
 * React 밖의 작은 외부 스토어(subscribe/getState)이며 Babylon을 모른다.
 * 엔진 업로드(engine.updatePaintTexture)는 호출 측(셸/ViewportPane/PaintPanel)이 합성된 마스터 레이어의 revision 변화를 보고 수행한다.
 */
import { DEFAULT_BRUSH, PAINTABLE_PART_ROLES, PAINT_LAYER_DEFAULT_SIZE } from "../contracts";
import { normalizeHex } from "../shared/color";

import {
  applyUndoToken,
  clonePaintLayer,
  createPaintLayer,
  createTileSnapshotSet,
  isPaintLayerEmpty,
  MAX_BRUSH_RADIUS_PX,
  MIN_BRUSH_RADIUS_PX,
  snapshotAllTiles,
  toUndoToken,
} from "./paint-layer";
import {
  clampSublayerOpacity,
  createPartSublayerStack,
  isPaintSublayerIndex,
  readSublayerMetas,
  recompositePartSublayers,
  resetStackFromSingleLayer,
} from "./paint-sublayers";
import { createStrokeSession } from "./stroke-session";
import { stampWebtoonDecal } from "./webtoon-decals";

import type { MutablePaintLayer } from "./paint-layer";
import type { PaintPressureMode } from "./paint-pressure";
import type { PaintSublayerIndex, PaintSublayerMeta, PartSublayerStack } from "./paint-sublayers";
import type { PaintToolMode, StrokeSession } from "./stroke-session";
import type { StampWebtoonDecalOptions, WebtoonDecalId } from "./webtoon-decals";
import type { BrushDab, BrushSettings, PaintLayer, PaintUndoToken, PartRole } from "../contracts";

export interface PaintSessionState {
  readonly brush: BrushSettings;
  readonly activePart: PartRole;
  readonly activeSublayer: PaintSublayerIndex;
  readonly wrap: boolean;
  readonly pressureMode: PaintPressureMode;
  readonly bodyLineMaskEnabled: boolean;
  readonly toolMode: PaintToolMode;
  readonly symmetry: boolean;
  /** 생성된 합성 마스터 레이어(부위 → 레이어). 참조는 변경마다 새 Map. */
  readonly layers: ReadonlyMap<PartRole, PaintLayer>;
  /** 부위별 6단 서브레이어(Layer 0 ~ Layer 5) 가시성·불투명도·픽셀 유무 메타데이터 */
  readonly sublayers: ReadonlyMap<PartRole, readonly PaintSublayerMeta[]>;
  readonly strokeActive: boolean;
  /** 상태 변경마다 증가 */
  readonly version: number;
}

export interface PaintSessionOptions {
  readonly brush?: Partial<BrushSettings>;
  readonly activePart?: PartRole;
  readonly activeSublayer?: PaintSublayerIndex;
  readonly wrap?: boolean;
  readonly layerSize?: number;
  readonly pressureMode?: PaintPressureMode;
  readonly bodyLineMaskEnabled?: boolean;
  readonly toolMode?: PaintToolMode;
  readonly symmetry?: boolean;
}

export interface PaintSession {
  getState(): PaintSessionState;
  subscribe(listener: () => void): () => void;
  setBrush(patch: Partial<BrushSettings>): void;
  setActivePart(part: PartRole): void;
  setActiveSublayer(index: PaintSublayerIndex): void;
  setSublayerVisible(part: PartRole, index: PaintSublayerIndex, visible: boolean): void;
  setSublayerOpacity(part: PartRole, index: PaintSublayerIndex, opacity: number): void;
  setWrap(wrap: boolean): void;
  setPressureMode(mode: PaintPressureMode): void;
  setBodyLineMaskEnabled(enabled: boolean): void;
  setToolMode(mode: PaintToolMode): void;
  setSymmetry(enabled: boolean): void;
  /** 부위 합성 마스터 레이어(없으면 생성) */
  layer(part: PartRole): MutablePaintLayer;
  /** 특정 서브레이어 읽기 전용 조회(테스트·미리보기용) */
  sublayer(part: PartRole, index: PaintSublayerIndex): PaintLayer;
  /** 활성 부위의 활성 서브레이어에 스트로크를 시작한다. 진행 중인 스트로크가 있으면 먼저 닫는다. */
  beginStroke(dab: BrushDab, part?: PartRole): void;
  extendStroke(dab: BrushDab): number;
  /** 스트로크를 닫고 undo 토큰을 돌려준다(진행 중이 아니면 null). 토큰은 호출 측이 "paint/stroke"로 dispatch한다. */
  endStroke(): PaintUndoToken | null;
  /** 선택한 웹툰 디테일 데칼을 활성 부위(및 활성 서브레이어)에 스탬프하고 undo 토큰을 반환한다. */
  stampDecal(decalId: WebtoonDecalId, options?: StampWebtoonDecalOptions & { readonly part?: PartRole }): PaintUndoToken | null;
  /** history undo/redo가 넘긴 토큰을 레이어(및 연결된 서브레이어)에 적용하고 역토큰을 돌려준다. 레이어가 없으면 null. */
  applyToken(token: PaintUndoToken): PaintUndoToken | null;
  /** 레시피 불러오기 등으로 레이어 전체를 교체한다(복사, Layer 0으로 적재). */
  replaceLayers(layers: readonly PaintLayer[]): void;
  /** 부위 전체(모든 서브레이어 포함)를 비우고 비우기 전 상태의 undo 토큰을 돌려준다. */
  clearLayer(part: PartRole): PaintUndoToken | null;
  /** 지정한 단일 서브레이어만 비우고 마스터 레이어를 재합성해 undo 토큰을 돌려준다. */
  clearSublayer(part: PartRole, index?: PaintSublayerIndex): PaintUndoToken | null;
  /** 저장·PSD용 합성 마스터 레이어 목록(생성 순) */
  layersForExport(): PaintLayer[];
}

interface SublayerTokenRecord {
  readonly kind: "single-sublayer";
  readonly sublayerIndex: PaintSublayerIndex;
  readonly innerToken: PaintUndoToken;
}

interface FullStackTokenRecord {
  readonly kind: "full-stack";
  readonly slotSnapshots: ReadonlyArray<{
    readonly index: PaintSublayerIndex;
    readonly rgba: Uint8ClampedArray;
    readonly visible: boolean;
    readonly opacity: number;
  }>;
}

type LinkedUndoMeta = SublayerTokenRecord | FullStackTokenRecord;

export function clampBrush(brush: BrushSettings, patch: Partial<BrushSettings>): BrushSettings {
  const color = patch.color === undefined ? brush.color : (normalizeHex(patch.color) ?? brush.color);
  const clamp = (value: number | undefined, fallback: number, min: number, max: number): number =>
    value === undefined || !Number.isFinite(value) ? fallback : Math.min(max, Math.max(min, value));
  return {
    radiusPx: clamp(patch.radiusPx, brush.radiusPx, MIN_BRUSH_RADIUS_PX, MAX_BRUSH_RADIUS_PX),
    color,
    opacity: clamp(patch.opacity, brush.opacity, 0, 1),
    hardness: clamp(patch.hardness, brush.hardness, 0, 1),
    spacing: clamp(patch.spacing, brush.spacing, 0.02, 4),
  };
}

export function createPaintSession(options: PaintSessionOptions = {}): PaintSession {
  const layerSize = options.layerSize ?? PAINT_LAYER_DEFAULT_SIZE;
  const layers = new Map<PartRole, MutablePaintLayer>();
  const stacks = new Map<PartRole, PartSublayerStack>();
  const undoLinks = new WeakMap<PaintUndoToken, LinkedUndoMeta>();
  const listeners = new Set<() => void>();

  let brush = clampBrush(DEFAULT_BRUSH, options.brush ?? {});
  let activePart: PartRole = options.activePart ?? PAINTABLE_PART_ROLES[0] ?? "skin";
  let activeSublayer: PaintSublayerIndex = options.activeSublayer ?? 0;
  let wrap = options.wrap ?? true;
  let pressureMode: PaintPressureMode = options.pressureMode ?? "constant";
  let bodyLineMaskEnabled = options.bodyLineMaskEnabled ?? true;
  let toolMode: PaintToolMode = options.toolMode ?? "brush";
  let symmetry = options.symmetry ?? false;
  let stroke: {
    readonly part: PartRole;
    readonly sublayerIndex: PaintSublayerIndex;
    readonly inner: StrokeSession;
    readonly masterBefore: ReturnType<typeof createTileSnapshotSet>;
  } | null = null;
  let version = 0;
  let snapshot: PaintSessionState | null = null;

  const invalidate = (): void => {
    version += 1;
    snapshot = null;
    for (const listener of listeners) listener();
  };

  const ensurePart = (part: PartRole): { readonly master: MutablePaintLayer; readonly stack: PartSublayerStack } => {
    let master = layers.get(part);
    let stack = stacks.get(part);
    if (!master || !stack) {
      master = createPaintLayer(part, layerSize, layerSize);
      stack = createPartSublayerStack(part, layerSize, layerSize);
      layers.set(part, master);
      stacks.set(part, stack);
    }
    return { master, stack };
  };

  /** 테스트 등에서 `session.layer(part).rgba`를 직접 채운 경우 Layer 0과 동기화한다. */
  const syncExternalMasterWriteIfNeeded = (master: MutablePaintLayer, stack: PartSublayerStack): void => {
    const allSlotsEmpty = stack.slots.every((slot) => isPaintLayerEmpty(slot.layer));
    if (allSlotsEmpty && !isPaintLayerEmpty(master)) {
      stack.slots[0].layer.rgba.set(master.rgba);
      stack.slots[0].layer.revision += 1;
    }
  };

  const snapshotMasterForInnerToken = (master: MutablePaintLayer, innerToken: PaintUndoToken): PaintUndoToken => {
    const masterSet = createTileSnapshotSet(master);
    for (const tile of innerToken.tiles) {
      const tx = Math.floor(tile.x / innerToken.tileSize);
      const ty = Math.floor(tile.y / innerToken.tileSize);
      const key = `${tx},${ty}`;
      if (!masterSet.tiles.has(key)) {
        // 변경 전 마스터 타일 스냅샷
        const w = Math.min(innerToken.tileSize, master.width - tile.x);
        const h = Math.min(innerToken.tileSize, master.height - tile.y);
        const data = new Uint8ClampedArray(w * h * 4);
        for (let row = 0; row < h; row += 1) {
          const srcStart = ((tile.y + row) * master.width + tile.x) * 4;
          data.set(master.rgba.subarray(srcStart, srcStart + w * 4), row * w * 4);
        }
        masterSet.tiles.set(key, { x: tile.x, y: tile.y, data });
      }
    }
    return toUndoToken(masterSet);
  };

  return {
    getState() {
      if (!snapshot) {
        const sublayerEntries = new Map<PartRole, readonly PaintSublayerMeta[]>();
        for (const [part, stack] of stacks) {
          sublayerEntries.set(part, readSublayerMetas(stack));
        }
        snapshot = {
          brush,
          activePart,
          activeSublayer,
          wrap,
          pressureMode,
          bodyLineMaskEnabled,
          toolMode,
          symmetry,
          layers: new Map(layers),
          sublayers: sublayerEntries,
          strokeActive: stroke !== null,
          version,
        };
      }
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setBrush(patch) {
      brush = clampBrush(brush, patch);
      invalidate();
    },
    setActivePart(part) {
      if (!PAINTABLE_PART_ROLES.includes(part)) {
        throw new Error(`부위 "${part}"에는 페인트할 수 없습니다.`);
      }
      activePart = part;
      invalidate();
    },
    setActiveSublayer(index) {
      if (!isPaintSublayerIndex(index)) {
        throw new Error(`서브레이어 번호(${String(index)})는 0..5 정수여야 합니다.`);
      }
      activeSublayer = index;
      invalidate();
    },
    setSublayerVisible(part, index, visible) {
      if (!PAINTABLE_PART_ROLES.includes(part) || !isPaintSublayerIndex(index)) return;
      const { master, stack } = ensurePart(part);
      syncExternalMasterWriteIfNeeded(master, stack);
      const slot = stack.slots[index];
      if (slot.visible === visible) return;
      slot.visible = visible;
      recompositePartSublayers(stack, master);
      invalidate();
    },
    setSublayerOpacity(part, index, opacity) {
      if (!PAINTABLE_PART_ROLES.includes(part) || !isPaintSublayerIndex(index)) return;
      const { master, stack } = ensurePart(part);
      syncExternalMasterWriteIfNeeded(master, stack);
      const clamped = clampSublayerOpacity(opacity);
      const slot = stack.slots[index];
      if (Math.abs(slot.opacity - clamped) < 1e-6) return;
      slot.opacity = clamped;
      recompositePartSublayers(stack, master);
      invalidate();
    },
    setWrap(next) {
      wrap = next;
      invalidate();
    },
    setPressureMode(next) {
      pressureMode = next;
      invalidate();
    },
    setBodyLineMaskEnabled(next) {
      bodyLineMaskEnabled = next;
      invalidate();
    },
    setToolMode(next) {
      toolMode = next;
      invalidate();
    },
    setSymmetry(next) {
      symmetry = next;
      invalidate();
    },
    layer(part) {
      const created = !layers.has(part);
      const { master } = ensurePart(part);
      if (created) invalidate();
      return master;
    },
    sublayer(part, index) {
      const { master, stack } = ensurePart(part);
      syncExternalMasterWriteIfNeeded(master, stack);
      return stack.slots[index].layer;
    },
    beginStroke(dab, part = activePart) {
      if (stroke) {
        stroke.inner.end();
        stroke = null;
      }
      const { master, stack } = ensurePart(part);
      syncExternalMasterWriteIfNeeded(master, stack);
      const sublayerIndex = activeSublayer;
      const targetSublayer = stack.slots[sublayerIndex].layer;
      const masterBefore = createTileSnapshotSet(master);
      snapshotAllTiles(masterBefore);
      const inner = createStrokeSession(targetSublayer, brush, { wrap, pressureMode, toolMode, symmetry });
      inner.begin(dab);
      recompositePartSublayers(stack, master);
      stroke = { part, sublayerIndex, inner, masterBefore };
      invalidate();
    },
    extendStroke(dab) {
      if (!stroke) return 0;
      const count = stroke.inner.extend(dab);
      if (count > 0) {
        const { master, stack } = ensurePart(stroke.part);
        recompositePartSublayers(stack, master);
        invalidate();
      }
      return count;
    },
    endStroke() {
      if (!stroke) return null;
      const finished = stroke;
      stroke = null;
      const innerToken = finished.inner.end();
      if (innerToken.tiles.length === 0) {
        invalidate();
        return null;
      }
      // innerToken이 건드린 타일 좌표만 masterBefore에서 추려 결정적 타일 토큰을 구성한다.
      const touchedCoords = new Set(innerToken.tiles.map((t) => `${t.x},${t.y}`));
      const masterTiles = [...finished.masterBefore.tiles.values()]
        .filter((t) => touchedCoords.has(`${t.x},${t.y}`))
        .sort((a, b) => a.y - b.y || a.x - b.x);
      const masterToken: PaintUndoToken = {
        part: finished.part,
        tiles: masterTiles,
        tileSize: innerToken.tileSize,
      };
      undoLinks.set(masterToken, {
        kind: "single-sublayer",
        sublayerIndex: finished.sublayerIndex,
        innerToken,
      });
      invalidate();
      return masterToken;
    },
    stampDecal(decalId, stampOptions = {}) {
      if (stroke) {
        stroke.inner.end();
        stroke = null;
      }
      const part = stampOptions.part ?? activePart;
      const { master, stack } = ensurePart(part);
      syncExternalMasterWriteIfNeeded(master, stack);
      const sublayerIndex = activeSublayer;
      const targetSublayer = stack.slots[sublayerIndex].layer;
      const tempClone = clonePaintLayer(targetSublayer);
      const probeToken = stampWebtoonDecal(tempClone, decalId, {
        wrap,
        symmetry,
        ...stampOptions,
      });
      if (probeToken.tiles.length === 0) return null;
      const masterToken = snapshotMasterForInnerToken(master, probeToken);
      const innerToken = stampWebtoonDecal(targetSublayer, decalId, {
        wrap,
        symmetry,
        ...stampOptions,
      });
      recompositePartSublayers(stack, master);
      undoLinks.set(masterToken, {
        kind: "single-sublayer",
        sublayerIndex,
        innerToken,
      });
      invalidate();
      return masterToken;
    },
    applyToken(token) {
      const master = layers.get(token.part);
      const stack = stacks.get(token.part);
      if (!master || !stack) return null;
      const linked = undoLinks.get(token);
      if (linked?.kind === "single-sublayer") {
        const inverseMaster = snapshotMasterForInnerToken(master, linked.innerToken);
        const targetSublayer = stack.slots[linked.sublayerIndex].layer;
        const inverseInner = applyUndoToken(targetSublayer, linked.innerToken);
        recompositePartSublayers(stack, master);
        undoLinks.set(inverseMaster, {
          kind: "single-sublayer",
          sublayerIndex: linked.sublayerIndex,
          innerToken: inverseInner,
        });
        invalidate();
        return inverseMaster;
      }
      if (linked?.kind === "full-stack") {
        const prevSlotSnapshots = stack.slots.map((slot) => ({
          index: slot.index,
          rgba: new Uint8ClampedArray(slot.layer.rgba),
          visible: slot.visible,
          opacity: slot.opacity,
        }));
        const inverseMaster = applyUndoToken(master, token);
        for (const snap of linked.slotSnapshots) {
          const slot = stack.slots[snap.index];
          slot.layer.rgba.set(snap.rgba);
          slot.layer.revision += 1;
          slot.visible = snap.visible;
          slot.opacity = snap.opacity;
        }
        recompositePartSublayers(stack, master);
        undoLinks.set(inverseMaster, {
          kind: "full-stack",
          slotSnapshots: prevSlotSnapshots,
        });
        invalidate();
        return inverseMaster;
      }
      const inverse = applyUndoToken(master, token);
      resetStackFromSingleLayer(stack, master);
      invalidate();
      return inverse;
    },
    replaceLayers(next) {
      if (stroke) {
        stroke.inner.end();
        stroke = null;
      }
      layers.clear();
      stacks.clear();
      for (const incoming of next) {
        const cloned = clonePaintLayer(incoming);
        const stack = createPartSublayerStack(incoming.part, incoming.width, incoming.height);
        resetStackFromSingleLayer(stack, cloned);
        layers.set(incoming.part, cloned);
        stacks.set(incoming.part, stack);
      }
      invalidate();
    },
    clearLayer(part) {
      const master = layers.get(part);
      const stack = stacks.get(part);
      if (!master || !stack) return null;
      syncExternalMasterWriteIfNeeded(master, stack);
      const hasAnyData =
        !isPaintLayerEmpty(master) || stack.slots.some((slot) => !isPaintLayerEmpty(slot.layer));
      if (!hasAnyData) return null;
      const snapshots = createTileSnapshotSet(master);
      snapshotAllTiles(snapshots);
      const slotSnapshots = stack.slots.map((slot) => ({
        index: slot.index,
        rgba: new Uint8ClampedArray(slot.layer.rgba),
        visible: slot.visible,
        opacity: slot.opacity,
      }));
      for (const slot of stack.slots) {
        slot.layer.rgba.fill(0);
        slot.layer.revision += 1;
      }
      master.rgba.fill(0);
      master.revision += 1;
      const token = toUndoToken(snapshots);
      undoLinks.set(token, { kind: "full-stack", slotSnapshots });
      invalidate();
      return token;
    },
    clearSublayer(part, index = activeSublayer) {
      const master = layers.get(part);
      const stack = stacks.get(part);
      if (!master || !stack || !isPaintSublayerIndex(index)) return null;
      syncExternalMasterWriteIfNeeded(master, stack);
      const targetSublayer = stack.slots[index].layer;
      if (isPaintLayerEmpty(targetSublayer)) return null;
      const innerSnapshots = createTileSnapshotSet(targetSublayer);
      snapshotAllTiles(innerSnapshots);
      const innerToken = toUndoToken(innerSnapshots);
      const masterSnapshots = createTileSnapshotSet(master);
      snapshotAllTiles(masterSnapshots);
      const masterToken = toUndoToken(masterSnapshots);
      targetSublayer.rgba.fill(0);
      targetSublayer.revision += 1;
      recompositePartSublayers(stack, master);
      undoLinks.set(masterToken, {
        kind: "single-sublayer",
        sublayerIndex: index,
        innerToken,
      });
      invalidate();
      return masterToken;
    },
    layersForExport() {
      return [...layers.values()];
    },
  };
}

let defaultSession: PaintSession | null = null;

/** 앱 전역 기본 세션(지연 생성). 테스트는 createPaintSession으로 독립 세션을 만든다. */
export function getDefaultPaintSession(): PaintSession {
  if (!defaultSession) defaultSession = createPaintSession();
  return defaultSession;
}
