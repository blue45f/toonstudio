/**
 * Studio Layer Comps Manager (레이어 콤프)
 *
 * CLIP STUDIO PAINT Ver.3.0 & Ver.4.0 Parity:
 * - Layer Comps (레이어 표시 상태 세트):
 *   - Allows creators to capture and switch between different layer state combinations:
 *     - Visibility (표시 / 비표시)
 *     - Opacity (불투명도 0..100)
 *     - Blend Mode (합성 모드)
 *   - Use Cases in Webtoon Production:
 *     1. "선화 전용" (Lineart review)
 *     2. "밑색 버전" (Flat coloring guide)
 *     3. "대사 없음 클린본" (Clean art export for merchandise/posters)
 *     4. "야간/노을 조명 콤프" (Lighting mood variations)
 *   - Batch export planning: export each comp as an individual image.
 *
 * Pure, deterministic, zero-dependency.
 */

/** Maximum number of saved visibility presets per page. */
export const STUDIO_LAYER_COMPS_MAX_COUNT = 64;

export interface LayerCompStateItem {
  readonly layerId: string;
  readonly visible: boolean;
  readonly opacity: number; // 0..1
  readonly blendMode?: string;
  readonly groupId?: string;
}

export interface StudioLayerComp {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly layerStates: Readonly<Record<string, LayerCompStateItem>>;
  /** Folder visibility is independent of each child's own hidden flag. */
  readonly groupStates?: Readonly<Record<string, { readonly groupId: string; readonly visible: boolean }>>;
  readonly notes?: string;
}

export interface StudioLayerLikeItem {
  readonly id: string;
  readonly visible: boolean;
  readonly opacity?: number;
  readonly blendMode?: string;
  readonly groupId?: string;
}

export interface StudioLayerCompGroupLike {
  readonly id: string;
  readonly hidden?: boolean;
}

function captureLayerStates(layers: readonly StudioLayerLikeItem[]): StudioLayerComp["layerStates"] {
  return Object.freeze(Object.fromEntries(layers.map((layer) => [layer.id, Object.freeze({
    layerId: layer.id,
    visible: layer.visible,
    opacity: typeof layer.opacity === "number" ? layer.opacity : 1,
    blendMode: layer.blendMode,
    ...(layer.groupId === undefined ? {} : { groupId: layer.groupId }),
  })])));
}

function captureGroupStates(groups: readonly StudioLayerCompGroupLike[]): StudioLayerComp["groupStates"] {
  return Object.freeze(Object.fromEntries(groups.map((group) => [group.id, Object.freeze({
    groupId: group.id,
    visible: !group.hidden,
  })])));
}

/**
 * Captures the current layer states into a new Layer Comp.
 */
export function captureLayerComp<T extends StudioLayerLikeItem>(
  name: string,
  layers: readonly T[],
  id?: string,
  nowMs = Date.now(),
  groups?: readonly StudioLayerCompGroupLike[],
): StudioLayerComp {
  const compId = id || `comp-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return Object.freeze({
    id: compId,
    name: name.trim() || "새 레이어 보기",
    createdAt: nowMs,
    layerStates: captureLayerStates(layers),
    ...(groups === undefined ? {} : { groupStates: captureGroupStates(groups) }),
  });
}

/**
 * Applies a Layer Comp to an array of layers, updating their visibility and opacity.
 */
export function applyLayerComp<T extends StudioLayerLikeItem>(
  layers: readonly T[],
  comp: StudioLayerComp,
): readonly T[] {
  return Object.freeze(
    layers.map((layer) => {
      const savedState = Object.hasOwn(comp.layerStates, layer.id) ? comp.layerStates[layer.id] : undefined;
      if (!savedState) return layer;

      // blendMode도 캡처 상태 그대로 복원한다. 캡처 당시 블렌드 모드가 없던(undefined)
      // 레이어는, 그 사이 사용자가 붙인 블렌드 모드를 지워야 캡처 상태와 같아진다 —
      // 조건부 스프레드로 두면 "콤프를 눌렀는데 합성 모드만 예전과 다르다"가 된다.
      const restored: Record<string, unknown> = {
        ...layer,
        visible: savedState.visible,
        opacity: savedState.opacity,
      };
      if (savedState.blendMode) restored.blendMode = savedState.blendMode;
      else delete restored.blendMode;
      return Object.freeze(restored) as T;
    }),
  );
}

/**
 * Updates an existing Layer Comp with the current layer states.
 */
export function updateLayerCompWithCurrentLayers<T extends StudioLayerLikeItem>(
  comp: StudioLayerComp,
  layers: readonly T[],
  groups?: readonly StudioLayerCompGroupLike[],
): StudioLayerComp {
  return Object.freeze({
    ...comp,
    layerStates: captureLayerStates(layers),
    ...(groups === undefined ? {} : { groupStates: captureGroupStates(groups) }),
  });
}

/**
 * Plans batch export jobs for a list of layer comps.
 */
export function planLayerCompsBatchExport(
  comps: readonly StudioLayerComp[],
  fileBaseName = "cut",
  format: "png" | "webp" = "png",
): readonly { readonly compId: string; readonly fileName: string; readonly compName: string }[] {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9가-힣_-]/gu, "_").trim();

  // sanitize를 거치면 서로 다른 콤프 이름이 같은 파일 이름이 될 수 있다
  // (예: "야간 버전"과 "야간 버전!"). 그대로 내보내면 한 파일이 다른 파일을
  // 덮어써 콤프 하나가 조용히 사라지므로, 충돌하면 -2, -3 접미사로 분리한다.
  // 대소문자만 다른 이름도 Windows/macOS 파일 시스템에서는 충돌하므로 소문자로 비교한다.
  const usedFileNames = new Set<string>();
  return Object.freeze(
    comps.map((c, index) => {
      const safeCompName = sanitize(c.name) || `comp_${index + 1}`;
      let fileName = `${fileBaseName}_${safeCompName}.${format}`;
      for (let suffix = 2; usedFileNames.has(fileName.toLowerCase()); suffix += 1) {
        fileName = `${fileBaseName}_${safeCompName}-${suffix}.${format}`;
      }
      usedFileNames.add(fileName.toLowerCase());
      return Object.freeze({
        compId: c.id,
        fileName,
        compName: c.name,
      });
    }),
  );
}
