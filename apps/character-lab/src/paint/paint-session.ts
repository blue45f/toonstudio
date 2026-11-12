/**
 * 페인트 세션: 패널(PaintPanel)과 뷰포트(드로잉 포인터)가 공유하는 브러시 설정·활성 부위·서브레이어(Layer 0~5)·부위별 합성 레이어.
 * React 밖의 작은 외부 스토어(subscribe/getState)이며 Babylon을 모른다.
 * 엔진 업로드(engine.updatePaintTexture)는 호출 측(셸/ViewportPane/PaintPanel)이 합성된 마스터 레이어의 revision 변화를 보고 수행한다.
 */
import {
  DEFAULT_BRUSH,
  PAINTABLE_PART_ROLES,
  PAINT_LAYER_DEFAULT_SIZE,
  PAINT_TILE_SIZE,
  isValidSublayerOrder,
} from "../contracts";
import { normalizeHex } from "../shared/color";
import { bytesEqual } from "../shared/typed-array";

import {
  applyUndoToken,
  clonePaintLayer,
  createPaintLayer,
  createTileSnapshotSet,
  isPaintLayerEmpty,
  MAX_BRUSH_RADIUS_PX,
  MIN_BRUSH_RADIUS_PX,
  snapshotAllTiles,
  tileExtent,
  toUndoToken,
} from "./paint-layer";
import {
  PAINT_SUBLAYER_SPECS,
  clampSublayerOpacity,
  createPartSublayerStack,
  exportStackState,
  hasNonDefaultSublayerState,
  isPaintSublayerIndex,
  moveSublayerInOrder,
  readSublayerMetas,
  recompositePartSublayers,
  resetStackFromSingleLayer,
  restoreStackState,
} from "./paint-sublayers";
import { createStrokeSession } from "./stroke-session";
import { stampWebtoonDecal } from "./webtoon-decals";

import type { MutablePaintLayer } from "./paint-layer";
import type { PaintPressureMode } from "./paint-pressure";
import type {
  PaintPartSublayerState,
  PaintSublayerIndex,
  PaintSublayerMeta,
  PaintSublayerOrder,
  PartSublayerStack,
  SublayerMoveDirection,
} from "./paint-sublayers";
import type { PaintToolMode, StrokeSession } from "./stroke-session";
import type { StampWebtoonDecalOptions, WebtoonDecalId } from "./webtoon-decals";
import type { BrushDab, BrushSettings, PaintLayer, PaintUndoTile, PaintUndoToken, PartRole } from "../contracts";

export type SublayerPaintGuard =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasonKo: string };

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
  /** 부위별 6단 서브레이어(Layer 0 ~ Layer 5) 가시성·불투명도·순서·픽셀 유무 메타데이터 */
  readonly sublayers: ReadonlyMap<PartRole, readonly PaintSublayerMeta[]>;
  /** 부위별 현재 합성 순서(아래 → 위) */
  readonly sublayerOrders: ReadonlyMap<PartRole, PaintSublayerOrder>;
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

export interface ReplacePaintStateInput {
  readonly layers: readonly PaintLayer[];
  readonly sublayers?: readonly PaintPartSublayerState[];
}

export interface PaintSession {
  getState(): PaintSessionState;
  subscribe(listener: () => void): () => void;
  setBrush(patch: Partial<BrushSettings>): void;
  setActivePart(part: PartRole): void;
  setActiveSublayer(index: PaintSublayerIndex): void;
  /** 서브레이어 표시 여부를 바꾸고 Undo 토큰을 반환한다(변화가 없으면 null). */
  setSublayerVisible(part: PartRole, index: PaintSublayerIndex, visible: boolean): PaintUndoToken | null;
  /** 서브레이어 불투명도(0..1)를 바꾸고 Undo 토큰을 반환한다(변화가 없으면 null). */
  setSublayerOpacity(part: PartRole, index: PaintSublayerIndex, opacity: number): PaintUndoToken | null;
  /** 서브레이어 합성 순서를 한 단계 아래("down") 또는 위("up")로 옮기고 Undo 토큰을 반환한다. */
  moveSublayer(part: PartRole, index: PaintSublayerIndex, direction: SublayerMoveDirection): PaintUndoToken | null;
  /** 서브레이어 합성 순서를 지정 순열로 설정하고 Undo 토큰을 반환한다. */
  setSublayerOrder(part: PartRole, order: PaintSublayerOrder): PaintUndoToken | null;
  /** 현재 활성 서브레이어에 그리기/스탬프가 가능한지(숨김·불투명도 0 차단) 판별한다. */
  canPaintActiveSublayer(part?: PartRole): SublayerPaintGuard;
  setWrap(wrap: boolean): void;
  setPressureMode(mode: PaintPressureMode): void;
  setBodyLineMaskEnabled(enabled: boolean): void;
  setToolMode(mode: PaintToolMode): void;
  setSymmetry(enabled: boolean): void;
  /** 부위 합성 마스터 레이어(없으면 생성) */
  layer(part: PartRole): MutablePaintLayer;
  /** 특정 서브레이어 읽기 전용 조회(테스트·미리보기용) */
  sublayer(part: PartRole, index: PaintSublayerIndex): PaintLayer;
  /** 활성 부위의 활성 서브레이어에 스트로크를 시작한다(숨김·불투명도 0이면 시작하지 않는다). */
  beginStroke(dab: BrushDab, part?: PartRole): void;
  extendStroke(dab: BrushDab): number;
  /** 스트로크를 닫고 undo 토큰을 돌려준다(진행 중이 아니면 null). 토큰은 호출 측이 "paint/stroke"로 dispatch한다. */
  endStroke(): PaintUndoToken | null;
  /** 선택한 웹툰 디테일 데칼을 활성 부위(및 활성 서브레이어)에 스탬프하고 undo 토큰을 반환한다. */
  stampDecal(decalId: WebtoonDecalId, options?: StampWebtoonDecalOptions & { readonly part?: PartRole }): PaintUndoToken | null;
  /** 투영 페인트 등 외부에서 계산된 서브레이어 after 타일 토큰을 지정 서브레이어에 반영하고 마스터 역토큰을 돌려준다. */
  applySublayerAfterToken(part: PartRole, sublayerIndex: PaintSublayerIndex, afterSublayerToken: PaintUndoToken): PaintUndoToken | null;
  /** history undo/redo가 넘긴 토큰을 레이어(및 연결된 서브레이어 단계들)에 적용하고 역토큰을 돌려준다. */
  applyToken(token: PaintUndoToken): PaintUndoToken | null;
  /** 레시피 불러오기 등으로 레이어 전체를 교체한다(단일 레이어 목록은 Layer 0으로 적재). */
  replaceLayers(layers: readonly PaintLayer[]): void;
  /** 레시피 불러오기 시 마스터 레이어와 6단 서브레이어 상태(픽셀·숨김·순서·불투명도)를 함께 복원한다. */
  replacePaintState(input: ReplacePaintStateInput): void;
  /** 부위 전체(모든 서브레이어 포함)를 비우고 비우기 전 상태의 undo 토큰을 돌려준다. */
  clearLayer(part: PartRole): PaintUndoToken | null;
  /** 지정한 단일 서브레이어만 비우고 마스터 레이어를 재합성해 undo 토큰을 돌려준다. */
  clearSublayer(part: PartRole, index?: PaintSublayerIndex): PaintUndoToken | null;
  /** 저장·PSD용 합성 마스터 레이어 목록(생성 순) */
  layersForExport(): PaintLayer[];
  /** 레시피 직렬화용 비기본 서브레이어 스택 상태 목록 */
  sublayersForExport(): PaintPartSublayerState[];
}

interface SublayerMetaSnapshot {
  readonly order: PaintSublayerOrder;
  readonly slots: readonly [
    { readonly visible: boolean; readonly opacity: number },
    { readonly visible: boolean; readonly opacity: number },
    { readonly visible: boolean; readonly opacity: number },
    { readonly visible: boolean; readonly opacity: number },
    { readonly visible: boolean; readonly opacity: number },
    { readonly visible: boolean; readonly opacity: number },
  ];
}

type SublayerStepRecord =
  | {
      readonly kind: "single-sublayer";
      readonly sublayerIndex: PaintSublayerIndex;
      readonly innerToken: PaintUndoToken;
    }
  | {
      readonly kind: "sublayer-meta";
      readonly meta: SublayerMetaSnapshot;
    }
  | {
      readonly kind: "full-stack";
      readonly state: PaintPartSublayerState;
    };

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

function captureMetaSnapshot(stack: PartSublayerStack): SublayerMetaSnapshot {
  return {
    order: [...stack.order],
    slots: [
      { visible: stack.slots[0].visible, opacity: stack.slots[0].opacity },
      { visible: stack.slots[1].visible, opacity: stack.slots[1].opacity },
      { visible: stack.slots[2].visible, opacity: stack.slots[2].opacity },
      { visible: stack.slots[3].visible, opacity: stack.slots[3].opacity },
      { visible: stack.slots[4].visible, opacity: stack.slots[4].opacity },
      { visible: stack.slots[5].visible, opacity: stack.slots[5].opacity },
    ],
  };
}

function applyMetaSnapshot(stack: PartSublayerStack, meta: SublayerMetaSnapshot): void {
  stack.order = [...meta.order];
  for (let i = 0; i < 6; i += 1) {
    const src = meta.slots[i];
    const dst = stack.slots[i];
    if (src && dst) {
      dst.visible = src.visible;
      dst.opacity = src.opacity;
    }
  }
}

function diffMasterTiles(beforeRgba: Uint8ClampedArray, afterLayer: PaintLayer): PaintUndoTile[] {
  const tilesX = Math.ceil(afterLayer.width / PAINT_TILE_SIZE);
  const tilesY = Math.ceil(afterLayer.height / PAINT_TILE_SIZE);
  const changed: PaintUndoTile[] = [];
  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      const { x, y, w, h } = tileExtent(afterLayer, tx, ty);
      let differs = false;
      for (let row = 0; row < h && !differs; row += 1) {
        const start = ((y + row) * afterLayer.width + x) * 4;
        const end = start + w * 4;
        if (!bytesEqual(beforeRgba.subarray(start, end), afterLayer.rgba.subarray(start, end))) {
          differs = true;
        }
      }
      if (!differs) continue;
      const data = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row += 1) {
        const start = ((y + row) * afterLayer.width + x) * 4;
        data.set(beforeRgba.subarray(start, start + w * 4), row * w * 4);
      }
      changed.push({ x, y, data });
    }
  }
  return changed;
}

export function createPaintSession(options: PaintSessionOptions = {}): PaintSession {
  const layerSize = options.layerSize ?? PAINT_LAYER_DEFAULT_SIZE;
  const layers = new Map<PartRole, MutablePaintLayer>();
  const stacks = new Map<PartRole, PartSublayerStack>();
  const stepRegistry = new Map<number, SublayerStepRecord>();
  let nextStepId = 1;
  const listeners = new Set<() => void>();

  const registerStep = (record: SublayerStepRecord): number => {
    const id = nextStepId;
    nextStepId += 1;
    stepRegistry.set(id, record);
    return id;
  };

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

  const snapshotMasterForInnerToken = (
    master: MutablePaintLayer,
    innerToken: PaintUndoToken,
    stepId: number,
  ): PaintUndoToken => {
    const masterSet = createTileSnapshotSet(master);
    for (const tile of innerToken.tiles) {
      const tx = Math.floor(tile.x / innerToken.tileSize);
      const ty = Math.floor(tile.y / innerToken.tileSize);
      const key = `${tx},${ty}`;
      if (!masterSet.tiles.has(key)) {
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
    const base = toUndoToken(masterSet);
    return { ...base, sublayerSteps: [stepId] };
  };

  const commitMetaMutation = (
    part: PartRole,
    mutate: (stack: PartSublayerStack) => boolean,
  ): PaintUndoToken | null => {
    if (!PAINTABLE_PART_ROLES.includes(part)) return null;
    const { master, stack } = ensurePart(part);
    syncExternalMasterWriteIfNeeded(master, stack);
    const beforeMeta = captureMetaSnapshot(stack);
    const beforeMasterRgba = new Uint8ClampedArray(master.rgba);
    if (!mutate(stack)) return null;
    recompositePartSublayers(stack, master);
    const tiles = diffMasterTiles(beforeMasterRgba, master);
    const stepId = registerStep({ kind: "sublayer-meta", meta: beforeMeta });
    invalidate();
    return { part, tiles, tileSize: PAINT_TILE_SIZE, sublayerSteps: [stepId] };
  };

  const evaluatePaintGuard = (part: PartRole): SublayerPaintGuard => {
    const stack = stacks.get(part);
    if (!stack) return { ok: true };
    const slot = stack.slots[activeSublayer];
    const spec = PAINT_SUBLAYER_SPECS[activeSublayer];
    const label = spec?.shortLabelKo ?? `L${activeSublayer}`;
    if (!slot.visible) {
      return {
        ok: false,
        reasonKo: `현재 선택된 서브레이어(${label})가 숨김 상태여서 그릴 수 없습니다. 표시를 켜거나 다른 서브레이어를 선택하세요.`,
      };
    }
    if (slot.opacity <= 0) {
      return {
        ok: false,
        reasonKo: `현재 선택된 서브레이어(${label})의 불투명도가 0%여서 그릴 수 없습니다. 불투명도를 올리거나 다른 서브레이어를 선택하세요.`,
      };
    }
    return { ok: true };
  };

  return {
    getState() {
      if (!snapshot) {
        const sublayerEntries = new Map<PartRole, readonly PaintSublayerMeta[]>();
        const orderEntries = new Map<PartRole, PaintSublayerOrder>();
        for (const [part, stack] of stacks) {
          sublayerEntries.set(part, readSublayerMetas(stack));
          orderEntries.set(part, [...stack.order]);
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
          sublayerOrders: orderEntries,
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
      if (!isPaintSublayerIndex(index)) return null;
      return commitMetaMutation(part, (stack) => {
        const slot = stack.slots[index];
        if (slot.visible === visible) return false;
        slot.visible = visible;
        return true;
      });
    },
    setSublayerOpacity(part, index, opacity) {
      if (!isPaintSublayerIndex(index)) return null;
      const clamped = clampSublayerOpacity(opacity);
      return commitMetaMutation(part, (stack) => {
        const slot = stack.slots[index];
        if (Math.abs(slot.opacity - clamped) < 1e-6) return false;
        slot.opacity = clamped;
        return true;
      });
    },
    moveSublayer(part, index, direction) {
      if (!isPaintSublayerIndex(index)) return null;
      return commitMetaMutation(part, (stack) => {
        const nextOrder = moveSublayerInOrder(stack.order, index, direction);
        if (!nextOrder) return false;
        stack.order = nextOrder;
        return true;
      });
    },
    setSublayerOrder(part, order) {
      if (!isValidSublayerOrder(order)) return null;
      return commitMetaMutation(part, (stack) => {
        if (stack.order.every((v, idx) => v === order[idx])) return false;
        stack.order = [...order];
        return true;
      });
    },
    canPaintActiveSublayer(part = activePart) {
      return evaluatePaintGuard(part);
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
      if (!evaluatePaintGuard(part).ok) return;
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
      const touchedCoords = new Set(innerToken.tiles.map((t) => `${t.x},${t.y}`));
      const masterTiles = [...finished.masterBefore.tiles.values()]
        .filter((t) => touchedCoords.has(`${t.x},${t.y}`))
        .sort((a, b) => a.y - b.y || a.x - b.x);
      const stepId = registerStep({
        kind: "single-sublayer",
        sublayerIndex: finished.sublayerIndex,
        innerToken,
      });
      const masterToken: PaintUndoToken = {
        part: finished.part,
        tiles: masterTiles,
        tileSize: innerToken.tileSize,
        sublayerSteps: [stepId],
      };
      invalidate();
      return masterToken;
    },
    stampDecal(decalId, stampOptions = {}) {
      if (stroke) {
        stroke.inner.end();
        stroke = null;
      }
      const part = stampOptions.part ?? activePart;
      if (!evaluatePaintGuard(part).ok) return null;
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
      const beforeMasterRgba = new Uint8ClampedArray(master.rgba);
      const innerToken = stampWebtoonDecal(targetSublayer, decalId, {
        wrap,
        symmetry,
        ...stampOptions,
      });
      recompositePartSublayers(stack, master);
      const stepId = registerStep({
        kind: "single-sublayer",
        sublayerIndex,
        innerToken,
      });
      const changedMasterTiles = diffMasterTiles(beforeMasterRgba, master);
      const masterToken =
        changedMasterTiles.length > 0
          ? { part, tiles: changedMasterTiles, tileSize: PAINT_TILE_SIZE, sublayerSteps: [stepId] }
          : snapshotMasterForInnerToken(master, probeToken, stepId);
      invalidate();
      return masterToken;
    },
    applySublayerAfterToken(part, sublayerIndex, afterSublayerToken) {
      if (!PAINTABLE_PART_ROLES.includes(part) || !isPaintSublayerIndex(sublayerIndex)) return null;
      if (afterSublayerToken.tiles.length === 0) return null;
      const { master, stack } = ensurePart(part);
      syncExternalMasterWriteIfNeeded(master, stack);
      const beforeMasterRgba = new Uint8ClampedArray(master.rgba);
      const targetSublayer = stack.slots[sublayerIndex].layer;
      const innerBeforeToken = applyUndoToken(targetSublayer, afterSublayerToken);
      recompositePartSublayers(stack, master);
      const stepId = registerStep({
        kind: "single-sublayer",
        sublayerIndex,
        innerToken: innerBeforeToken,
      });
      const changedMasterTiles = diffMasterTiles(beforeMasterRgba, master);
      const masterToken =
        changedMasterTiles.length > 0
          ? { part, tiles: changedMasterTiles, tileSize: PAINT_TILE_SIZE, sublayerSteps: [stepId] }
          : snapshotMasterForInnerToken(master, innerBeforeToken, stepId);
      invalidate();
      return masterToken;
    },
    applyToken(token) {
      const master = layers.get(token.part);
      const stack = stacks.get(token.part);
      if (!master || !stack) return null;

      if (token.sublayerSteps && token.sublayerSteps.length > 0) {
        const beforeMasterRgba = new Uint8ClampedArray(master.rgba);
        const inverseSteps: number[] = [];
        for (let i = token.sublayerSteps.length - 1; i >= 0; i -= 1) {
          const stepId = token.sublayerSteps[i];
          const step = stepId !== undefined ? stepRegistry.get(stepId) : undefined;
          if (!step) continue;
          if (step.kind === "single-sublayer") {
            const targetSublayer = stack.slots[step.sublayerIndex].layer;
            const inverseInner = applyUndoToken(targetSublayer, step.innerToken);
            inverseSteps.push(
              registerStep({
                kind: "single-sublayer",
                sublayerIndex: step.sublayerIndex,
                innerToken: inverseInner,
              }),
            );
          } else if (step.kind === "sublayer-meta") {
            const currentMeta = captureMetaSnapshot(stack);
            applyMetaSnapshot(stack, step.meta);
            inverseSteps.push(registerStep({ kind: "sublayer-meta", meta: currentMeta }));
          } else if (step.kind === "full-stack") {
            const currentFull = exportStackState(stack);
            restoreStackState(stack, step.state);
            inverseSteps.push(registerStep({ kind: "full-stack", state: currentFull }));
          }
        }
        recompositePartSublayers(stack, master);
        const inverseTiles = diffMasterTiles(beforeMasterRgba, master);
        invalidate();
        return {
          part: token.part,
          tiles: inverseTiles,
          tileSize: PAINT_TILE_SIZE,
          sublayerSteps: inverseSteps,
        };
      }

      const inverse = applyUndoToken(master, token);
      resetStackFromSingleLayer(stack, master);
      invalidate();
      return inverse;
    },
    replaceLayers(next) {
      this.replacePaintState({ layers: next });
    },
    replacePaintState(input) {
      if (stroke) {
        stroke.inner.end();
        stroke = null;
      }
      layers.clear();
      stacks.clear();
      stepRegistry.clear();
      for (const incoming of input.layers) {
        const cloned = clonePaintLayer(incoming);
        const stack = createPartSublayerStack(incoming.part, incoming.width, incoming.height);
        resetStackFromSingleLayer(stack, cloned);
        layers.set(incoming.part, cloned);
        stacks.set(incoming.part, stack);
      }
      for (const subState of input.sublayers ?? []) {
        const master = createPaintLayer(subState.part, subState.width, subState.height);
        const stack = createPartSublayerStack(subState.part, subState.width, subState.height);
        restoreStackState(stack, subState);
        recompositePartSublayers(stack, master);
        layers.set(subState.part, master);
        stacks.set(subState.part, stack);
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
      const beforeFull = exportStackState(stack);
      for (const slot of stack.slots) {
        slot.layer.rgba.fill(0);
        slot.layer.revision += 1;
      }
      master.rgba.fill(0);
      master.revision += 1;
      const stepId = registerStep({ kind: "full-stack", state: beforeFull });
      const base = toUndoToken(snapshots);
      invalidate();
      return { ...base, sublayerSteps: [stepId] };
    },
    clearSublayer(part, index = activeSublayer) {
      const master = layers.get(part);
      const stack = stacks.get(part);
      if (!master || !stack || !isPaintSublayerIndex(index)) return null;
      syncExternalMasterWriteIfNeeded(master, stack);
      const targetSublayer = stack.slots[index].layer;
      if (isPaintLayerEmpty(targetSublayer)) return null;
      const beforeMasterRgba = new Uint8ClampedArray(master.rgba);
      const innerSnapshots = createTileSnapshotSet(targetSublayer);
      snapshotAllTiles(innerSnapshots);
      const innerToken = toUndoToken(innerSnapshots);
      targetSublayer.rgba.fill(0);
      targetSublayer.revision += 1;
      recompositePartSublayers(stack, master);
      const stepId = registerStep({
        kind: "single-sublayer",
        sublayerIndex: index,
        innerToken,
      });
      const changedMasterTiles = diffMasterTiles(beforeMasterRgba, master);
      const masterToken =
        changedMasterTiles.length > 0
          ? { part, tiles: changedMasterTiles, tileSize: PAINT_TILE_SIZE, sublayerSteps: [stepId] }
          : snapshotMasterForInnerToken(master, innerToken, stepId);
      invalidate();
      return masterToken;
    },
    layersForExport() {
      return [...layers.values()];
    },
    sublayersForExport() {
      const exported: PaintPartSublayerState[] = [];
      for (const stack of stacks.values()) {
        const master = layers.get(stack.part);
        if (master) syncExternalMasterWriteIfNeeded(master, stack);
        const state = exportStackState(stack);
        if (hasNonDefaultSublayerState(state)) {
          exported.push(state);
        }
      }
      return exported;
    },
  };
}

let defaultSession: PaintSession | null = null;

/** 앱 전역 기본 세션(지연 생성). 테스트는 createPaintSession으로 독립 세션을 만든다. */
export function getDefaultPaintSession(): PaintSession {
  if (!defaultSession) defaultSession = createPaintSession();
  return defaultSession;
}
