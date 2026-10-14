/**
 * Studio Draft Layer Batch Visibility Toggle (드래프트 레이어 일괄 표시 토글)
 *
 * 근거 (csp-feature-gap REPORT §2 · NOTES.md 설계 A):
 * - 기존 `studio-layer-batch-operations.ts`에는 숨기기/복원 원시 연산
 *   (`batchHideAllDraftLayers`·`batchRestoreAllDraftLayers`)만 있고, 패널 헤더에서
 *   한 번 눌러 숨기고 한 번 더 눌러 복원하는 "토글" 상태 기계, tri-state 도출,
 *   보기 상태의 분리 저장이 없었다. 숨기기를 두 번 호출하면 스냅샷이 전부
 *   꺼진 상태로 덮여 원래 가시 상태가 사라지는 결함이 그 예다.
 * - 이 모듈이 토글의 정본이다:
 *   1. tri-state(전부 보임/일부 보임/전부 숨김/밑그림 없음)를 레이어에서 도출한다.
 *   2. 토글 1회 = 보이는 밑그림 전체 숨기기 + 그 순간의 밑그림 가시 상태를
 *      스냅샷으로 보관. 토글 2회 = 스냅샷 그대로 복원.
 *   3. 복원 규칙: 스냅샷에 없는 레이어(숨긴 뒤 새로 만든 레이어, 밑그림이 아닌
 *      레이어)는 현재 상태를 그대로 유지한다. 스냅샷에만 있고 지금은 없는
 *      레이어(삭제됨)는 무시한다.
 *   4. 보기 상태(view state)는 문서 상태와 분리한다: 이 모듈의 상태는 문서
 *      레이어 객체가 아니라 별도 직렬화 값이며, 호출부는 페이지/프로젝트
 *      단위 저장소(아래 storage key)에 따로 보관한다. 그래서 토글이 문서
 *      Undo/Redo 스택이나 문서 저장 내용과 충돌하지 않는다.
 *
 * Pure, deterministic (시각은 주입), zero-dependency.
 */

export interface DraftVisibilityLayerLike {
  readonly id: string;
  readonly visible: boolean;
  readonly isDraft?: boolean;
}

/** 밑그림 레이어들의 가시 상태 요약. 패널 헤더 표시와 토글 분기에 함께 쓴다. */
export type DraftLayerTriState = "none" | "all-visible" | "some-visible" | "all-hidden";

export interface DraftLayerVisibilitySnapshot {
  readonly capturedAt: number;
  /** 숨기기 직전, 그때 존재한 밑그림 레이어 전원의 가시 상태 (id → visible). */
  readonly visibilityById: Readonly<Record<string, boolean>>;
}

/**
 * 문서와 분리해 보관하는 보기 상태.
 * batchHidden이 true인 동안만 snapshot이 의미를 가진다.
 */
export interface DraftLayerViewState {
  readonly batchHidden: boolean;
  readonly snapshot: DraftLayerVisibilitySnapshot | null;
}

export const EMPTY_DRAFT_LAYER_VIEW_STATE: DraftLayerViewState = Object.freeze({
  batchHidden: false,
  snapshot: null,
});

export interface DraftLayerCounts {
  readonly draftCount: number;
  readonly visibleDraftCount: number;
}

export function countDraftLayers(
  layers: readonly DraftVisibilityLayerLike[],
): DraftLayerCounts {
  let draftCount = 0;
  let visibleDraftCount = 0;
  for (const layer of layers) {
    if (!layer.isDraft) continue;
    draftCount += 1;
    if (layer.visible) visibleDraftCount += 1;
  }
  return { draftCount, visibleDraftCount };
}

export function draftLayerTriState(
  layers: readonly DraftVisibilityLayerLike[],
): DraftLayerTriState {
  const { draftCount, visibleDraftCount } = countDraftLayers(layers);
  if (draftCount === 0) return "none";
  if (visibleDraftCount === 0) return "all-hidden";
  if (visibleDraftCount === draftCount) return "all-visible";
  return "some-visible";
}

export type DraftLayerToggleAction = "hidden" | "restored" | "shown" | "noop";

export interface DraftLayerToggleResult<T extends DraftVisibilityLayerLike> {
  readonly layers: readonly T[];
  readonly viewState: DraftLayerViewState;
  readonly action: DraftLayerToggleAction;
  /** 가시 상태가 실제로 바뀐 레이어 수. */
  readonly affectedCount: number;
}

function captureSnapshot(
  layers: readonly DraftVisibilityLayerLike[],
  nowMs: number,
): DraftLayerVisibilitySnapshot {
  const visibilityById: Record<string, boolean> = {};
  for (const layer of layers) {
    if (layer.isDraft) visibilityById[layer.id] = layer.visible;
  }
  return Object.freeze({
    capturedAt: nowMs,
    visibilityById: Object.freeze(visibilityById),
  });
}

/**
 * 토글 본체. 같은 입력에는 항상 같은 결과를 내는 순수 함수다.
 *
 * - 일괄 숨김 상태가 아니면: 보이는 밑그림을 전부 숨기고, 숨기기 직전의
 *   밑그림 가시 상태 전체를 스냅샷으로 남긴다. 이미 손으로 숨겨 둔 밑그림도
 *   스냅샷에 포함되므로, 복원하면 "원래 꺼져 있던 것은 꺼진 채로" 돌아온다.
 * - 일괄 숨김 상태면: 스냅샷에 있는 레이어만 스냅샷 값으로 되돌린다.
 *   그 사이에 새로 만든 레이어·밑그림이 아닌 레이어는 건드리지 않는다.
 *   사용자가 중간에 손으로 다시 켠 밑그림도 스냅샷 값으로 정확히 복원한다
 *   (판정 기준: 토글 2회 = 원래 상태와 정확히 동일).
 * - 일괄 숨김 상태가 아닌데 밑그림이 전부 손으로 숨겨져 있으면: 숨길 것이
 *   없으므로 "모두 보이기"로 동작한다 (스냅샷은 만들지 않는다).
 * - 밑그림이 없으면 아무것도 바꾸지 않는다(noop, 입력 참조 유지).
 */
export function toggleDraftLayerVisibility<T extends DraftVisibilityLayerLike>(
  layers: readonly T[],
  viewState: DraftLayerViewState,
  nowMs: number = Date.now(),
): DraftLayerToggleResult<T> {
  const { draftCount, visibleDraftCount } = countDraftLayers(layers);
  if (draftCount === 0) {
    return { layers, viewState, action: "noop", affectedCount: 0 };
  }

  if (viewState.batchHidden && viewState.snapshot) {
    const { visibilityById } = viewState.snapshot;
    let affectedCount = 0;
    const restored = layers.map((layer) => {
      if (!layer.isDraft) return layer;
      if (!Object.prototype.hasOwnProperty.call(visibilityById, layer.id)) return layer;
      const priorVisible = visibilityById[layer.id];
      if (priorVisible === undefined || layer.visible === priorVisible) return layer;
      affectedCount += 1;
      return Object.freeze({ ...layer, visible: priorVisible }) as T;
    });
    return {
      layers: affectedCount > 0 ? Object.freeze(restored) : layers,
      viewState: EMPTY_DRAFT_LAYER_VIEW_STATE,
      action: "restored",
      affectedCount,
    };
  }

  if (visibleDraftCount > 0) {
    const snapshot = captureSnapshot(layers, nowMs);
    let affectedCount = 0;
    const hidden = layers.map((layer) => {
      if (!layer.isDraft || !layer.visible) return layer;
      affectedCount += 1;
      return Object.freeze({ ...layer, visible: false }) as T;
    });
    return {
      layers: Object.freeze(hidden),
      viewState: Object.freeze({ batchHidden: true, snapshot }),
      action: "hidden",
      affectedCount,
    };
  }

  // batchHidden인데 스냅샷이 없거나(손상 상태), 전부 손으로 숨긴 경우: 모두 보이기.
  let affectedCount = 0;
  const shown = layers.map((layer) => {
    if (!layer.isDraft || layer.visible) return layer;
    affectedCount += 1;
    return Object.freeze({ ...layer, visible: true }) as T;
  });
  return {
    layers: affectedCount > 0 ? Object.freeze(shown) : layers,
    viewState: EMPTY_DRAFT_LAYER_VIEW_STATE,
    action: "shown",
    affectedCount,
  };
}

/**
 * 스냅샷에서 지금은 존재하지 않는 레이어 항목을 걷어낸다.
 * 남은 항목이 없으면 일괄 숨김 상태 자체를 해제한다(복원할 것이 없으므로).
 * 호출부는 레이어 삭제 뒤에 불러 보기 상태가 stale해지지 않게 한다.
 */
export function pruneDraftLayerViewState(
  viewState: DraftLayerViewState,
  layers: readonly DraftVisibilityLayerLike[],
): DraftLayerViewState {
  if (!viewState.batchHidden || !viewState.snapshot) return viewState;
  const alive = new Set<string>();
  for (const layer of layers) {
    if (layer.isDraft) alive.add(layer.id);
  }
  const kept: Record<string, boolean> = {};
  let keptCount = 0;
  let dropped = false;
  for (const [id, visible] of Object.entries(viewState.snapshot.visibilityById)) {
    if (alive.has(id)) {
      kept[id] = visible;
      keptCount += 1;
    } else {
      dropped = true;
    }
  }
  if (!dropped) return viewState;
  if (keptCount === 0) return EMPTY_DRAFT_LAYER_VIEW_STATE;
  return Object.freeze({
    batchHidden: true,
    snapshot: Object.freeze({
      capturedAt: viewState.snapshot.capturedAt,
      visibilityById: Object.freeze(kept),
    }),
  });
}

// ── 패널 헤더 뷰 모델 ─────────────────────────────────────────────────────

export type DraftLayerToggleMode = "hide" | "restore" | "show" | "none";

export interface DraftLayerToggleView {
  readonly mode: DraftLayerToggleMode;
  readonly triState: DraftLayerTriState;
  readonly draftCount: number;
  readonly visibleDraftCount: number;
  /** 버튼에 그대로 쓰는 쉬운 말 라벨. */
  readonly label: string;
  /** title/스크린리더용 설명. */
  readonly description: string;
  /** aria-pressed: 일괄 숨김 상태일 때 true. */
  readonly pressed: boolean;
  readonly disabled: boolean;
}

export function draftLayerToggleView(
  layers: readonly DraftVisibilityLayerLike[],
  viewState: DraftLayerViewState,
): DraftLayerToggleView {
  const triState = draftLayerTriState(layers);
  const { draftCount, visibleDraftCount } = countDraftLayers(layers);
  const base = { triState, draftCount, visibleDraftCount };

  if (draftCount === 0) {
    return {
      ...base,
      mode: "none",
      label: "밑그림 모두 숨기기",
      description: "밑그림으로 표시한 레이어가 없어요.",
      pressed: false,
      disabled: true,
    };
  }
  if (viewState.batchHidden && viewState.snapshot) {
    return {
      ...base,
      mode: "restore",
      label: "밑그림 다시 보이기",
      description: `숨기기 전 상태 그대로 되돌려요. 지금 밑그림 ${draftCount}개가 모두 숨겨져 있어요.`,
      pressed: true,
      disabled: false,
    };
  }
  if (visibleDraftCount > 0) {
    return {
      ...base,
      mode: "hide",
      label: "밑그림 모두 숨기기",
      description:
        visibleDraftCount === draftCount
          ? `밑그림 ${draftCount}개를 한 번에 숨겨요. 한 번 더 누르면 그대로 돌아와요.`
          : `보이는 밑그림 ${visibleDraftCount}개를 숨겨요. 꺼져 있던 밑그림은 복원할 때도 꺼진 채로 남아요.`,
      pressed: false,
      disabled: false,
    };
  }
  return {
    ...base,
    mode: "show",
    label: "밑그림 모두 보이기",
    description: `숨겨 둔 밑그림 ${draftCount}개를 한 번에 보여요.`,
    pressed: false,
    disabled: false,
  };
}

// ── 보기 상태 분리 저장 (문서와 별도) ─────────────────────────────────────

export const DRAFT_LAYER_VIEW_STATE_VERSION = 1;
export const DRAFT_LAYER_VIEW_STORAGE_PREFIX = "toonstudio.studio.draft-layer-view.v1:";
/** 손상·악성 payload 방어용 상한. 페이지당 레이어 수의 현실적 상한보다 넉넉하다. */
export const DRAFT_LAYER_VIEW_SNAPSHOT_MAX_ENTRIES = 4096;

export function draftLayerViewStorageKey(scopeId: string): string {
  const safe = scopeId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${DRAFT_LAYER_VIEW_STORAGE_PREFIX}${safe.length > 0 ? safe : "default"}`;
}

interface DraftLayerViewStatePayload {
  readonly v: number;
  readonly batchHidden: boolean;
  readonly snapshot: {
    readonly capturedAt: number;
    readonly visibilityById: Record<string, boolean>;
  } | null;
}

export function serializeDraftLayerViewState(viewState: DraftLayerViewState): string {
  const payload: DraftLayerViewStatePayload = {
    v: DRAFT_LAYER_VIEW_STATE_VERSION,
    batchHidden: viewState.batchHidden,
    snapshot: viewState.snapshot
      ? {
          capturedAt: viewState.snapshot.capturedAt,
          visibilityById: { ...viewState.snapshot.visibilityById },
        }
      : null,
  };
  return JSON.stringify(payload);
}

/**
 * 엄격 검증 파서. 형식이 어긋난 항목은 항목 단위로 버리고, 스냅샷이 없는데
 * batchHidden만 true인 모순 상태는 batchHidden=false로 바로잡는다.
 * 어떤 입력에도 throw하지 않는다.
 */
export function parseDraftLayerViewState(raw: string | null | undefined): DraftLayerViewState {
  if (!raw) return EMPTY_DRAFT_LAYER_VIEW_STATE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_DRAFT_LAYER_VIEW_STATE;
  }
  if (typeof parsed !== "object" || parsed === null) return EMPTY_DRAFT_LAYER_VIEW_STATE;
  const obj = parsed as Record<string, unknown>;
  if (obj.v !== DRAFT_LAYER_VIEW_STATE_VERSION) return EMPTY_DRAFT_LAYER_VIEW_STATE;

  let snapshot: DraftLayerVisibilitySnapshot | null = null;
  const rawSnapshot = obj.snapshot;
  if (typeof rawSnapshot === "object" && rawSnapshot !== null) {
    const snap = rawSnapshot as Record<string, unknown>;
    const rawMap = snap.visibilityById;
    if (
      typeof snap.capturedAt === "number" &&
      Number.isFinite(snap.capturedAt) &&
      typeof rawMap === "object" &&
      rawMap !== null
    ) {
      const visibilityById: Record<string, boolean> = {};
      let count = 0;
      for (const [id, visible] of Object.entries(rawMap as Record<string, unknown>)) {
        if (typeof visible !== "boolean" || id.length === 0) continue;
        if (count >= DRAFT_LAYER_VIEW_SNAPSHOT_MAX_ENTRIES) break;
        visibilityById[id] = visible;
        count += 1;
      }
      snapshot = Object.freeze({
        capturedAt: snap.capturedAt,
        visibilityById: Object.freeze(visibilityById),
      });
    }
  }

  const batchHidden = obj.batchHidden === true && snapshot !== null;
  if (!batchHidden) return EMPTY_DRAFT_LAYER_VIEW_STATE;
  return Object.freeze({ batchHidden: true, snapshot });
}

export interface DraftLayerViewStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): DraftLayerViewStorageLike | null {
  try {
    const storage = (globalThis as { localStorage?: unknown }).localStorage;
    if (
      typeof storage === "object" &&
      storage !== null &&
      typeof (storage as DraftLayerViewStorageLike).getItem === "function" &&
      typeof (storage as DraftLayerViewStorageLike).setItem === "function"
    ) {
      return storage as DraftLayerViewStorageLike;
    }
  } catch {
    // 접근 자체가 막힌 환경(프라이빗 모드 등)에서는 저장 없이 동작한다.
  }
  return null;
}

export function loadDraftLayerViewState(
  scopeId: string,
  storage: DraftLayerViewStorageLike | null = defaultStorage(),
): DraftLayerViewState {
  if (!storage) return EMPTY_DRAFT_LAYER_VIEW_STATE;
  try {
    return parseDraftLayerViewState(storage.getItem(draftLayerViewStorageKey(scopeId)));
  } catch {
    return EMPTY_DRAFT_LAYER_VIEW_STATE;
  }
}

/** 저장 실패는 조용히 무시한다 — 보기 상태는 문서가 아니라 편의 상태다. */
export function saveDraftLayerViewState(
  scopeId: string,
  viewState: DraftLayerViewState,
  storage: DraftLayerViewStorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(draftLayerViewStorageKey(scopeId), serializeDraftLayerViewState(viewState));
  } catch {
    // 용량 초과 등: 토글 동작 자체는 인메모리 상태로 계속된다.
  }
}
