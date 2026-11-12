/**
 * 미저장 캐릭터 작업(포즈·표정·체형·슬롯·색상 편집 및 6단 다중 페인트 서브레이어) 감지·저장 체크포인트·전환 전 스냅샷 복구.
 *
 * 설계 원칙:
 * 1. 초보 작가가 아무 편집 없이 모델만 둘러보는 초기 상태(`source/set`만 발생하고 외형·포즈·페인트 변경이 없는 상태)에서는
 *    불필요한 확인창으로 탐색을 방해하지 않는다.
 * 2. 포즈·슬롯·파라미터·색상 등 실제 레시피 내용(`recipeContentDigest`)이 기준점과 달라졌거나,
 *    페인트 세션에 저장되지 않은 픽셀/서브레이어 변경(`computePaintSignature`)이 있으면 미저장 작업으로 판정한다.
 * 3. 내보내기 탭에서 "레시피 저장"이 완료되면 현재 `(contentDigest, paintSignature)`를 저장됨으로 기록해
 *    이후 추가 편집 전까지는 모델 전환 시 경고를 띄우지 않는다.
 */
import { recipeDigest } from "../../contracts";
import { uploadReplacedLayers } from "../../paint/paint-bridge";
import { clonePaintLayer, isPaintLayerEmpty } from "../../paint/paint-layer";
import { fnv1a32Hex } from "../../shared/hash";

import type {
  CharacterEngine,
  CharacterRecipe,
  LabCommand,
  LabEvent,
  LabState,
  LabStore,
  PaintLayer,
  PaintPartSublayerState,
  SlotCapabilityMap,
} from "../../contracts";
import type { PaintSession } from "../../paint/paint-session";

const CANONICAL_SOURCE = Object.freeze({ kind: "procedural" as const });

interface WorkCheckpoint {
  readonly contentDigest: string;
  readonly paintSignature: string;
}

export interface UnsavedWorkSummary {
  readonly hasUnsaved: boolean;
  readonly hasUnsavedRecipe: boolean;
  readonly hasUnsavedPaint: boolean;
}

export interface CharacterWorkBackup {
  readonly recipe: CharacterRecipe;
  readonly capabilities: SlotCapabilityMap;
  readonly paintLayers: readonly PaintLayer[];
  readonly paintSublayers: readonly PaintPartSublayerState[];
  readonly capturedAt: number;
}

const checkpointsByStore = new WeakMap<object, WorkCheckpoint>();

/** 소스(모델 종류)만 제외한 캐릭터 편집 내용(슬롯·포즈·표정·체형·색상·의상·물리·셰이딩)의 결정적 요약 해시. */
export function recipeContentDigest(recipe: CharacterRecipe): string {
  return recipeDigest({ ...recipe, source: CANONICAL_SOURCE, paint: { layers: [] } });
}

function hashBytesSample(bytes: Uint8ClampedArray): string {
  // 비영 바이트의 전체 오프셋과 값을 해시해 큰 레이어에서도 위치 이동을 감지한다.
  let nonZeroCount = 0;
  let rolling = 2166136261;
  for (let i = 0; i < bytes.length; i += 1) {
    const v = bytes[i] ?? 0;
    if (v !== 0) {
      nonZeroCount += 1;
      rolling = Math.imul(rolling ^ i ^ (v << 8), 16777619) >>> 0;
    }
  }
  if (nonZeroCount === 0) return "empty";
  return `${nonZeroCount}:${rolling.toString(16)}`;
}

/** 페인트 세션의 합성 마스터 레이어와 6단 서브레이어(픽셀·가시성·불투명도·합성 순서) 상태를 결정적 서명으로 요약한다. */
export function computePaintSignature(session: PaintSession): string {
  const parts: string[] = [];
  for (const layer of session.layersForExport()) {
    if (isPaintLayerEmpty(layer)) continue;
    parts.push(`L:${layer.part}:${layer.width}x${layer.height}:${hashBytesSample(layer.rgba)}`);
  }
  for (const sub of session.sublayersForExport()) {
    const slotDesc = sub.slots
      .map((slot) => {
        const px = slot.rgba ? hashBytesSample(slot.rgba) : "null";
        return `${slot.index}:${slot.visible ? 1 : 0}:${slot.opacity.toFixed(4)}:${px}`;
      })
      .join(",");
    parts.push(`S:${sub.part}:${sub.order.join("")}:[${slotDesc}]`);
  }
  if (parts.length === 0) return "paint:empty";
  return `paint:${fnv1a32Hex(parts.sort().join("|"))}`;
}

const EMPTY_PAINT_SIGNATURE = "paint:empty";

function cloneSublayerState(sub: PaintPartSublayerState): PaintPartSublayerState {
  const clonedSlots = sub.slots.map((slot) => ({
    index: slot.index,
    visible: slot.visible,
    opacity: slot.opacity,
    rgba: slot.rgba ? new Uint8ClampedArray(slot.rgba) : null,
  })) as unknown as PaintPartSublayerState["slots"];
  return {
    part: sub.part,
    width: sub.width,
    height: sub.height,
    order: [...sub.order],
    slots: clonedSlots,
  };
}

/**
 * 스토어가 아직 편집 이력이 없는 초기 상태(`canUndo === false`)일 때 기준 체크포인트를 자동 등록한다.
 * 이미 `canUndo === true`인 상태로 주입된 스토어는 초기 기준점이 없으므로 미저장 편집이 있는 것으로 취급한다.
 */
function resolveCheckpoint(store: LabStore, state: LabState): WorkCheckpoint | null {
  const existing = checkpointsByStore.get(store);
  if (existing) return existing;
  if (!state.history.canUndo) {
    const initial: WorkCheckpoint = {
      contentDigest: recipeContentDigest(state.recipe),
      paintSignature: EMPTY_PAINT_SIGNATURE,
    };
    checkpointsByStore.set(store, initial);
    return initial;
  }
  return null;
}

/** 현재 스토어·페인트 세션에 저장되지 않은 캐릭터 편집 또는 페인트 작업이 있는지 판정한다. */
export function evaluateUnsavedCharacterWork(
  store: LabStore,
  state: LabState,
  session: PaintSession,
): UnsavedWorkSummary {
  const checkpoint = resolveCheckpoint(store, state);
  const currentContent = recipeContentDigest(state.recipe);
  const currentPaint = computePaintSignature(session);

  const hasUnsavedRecipe =
    checkpoint === null
      ? state.history.canUndo
      : currentContent !== checkpoint.contentDigest;
  const hasUnsavedPaint =
    checkpoint === null
      ? currentPaint !== EMPTY_PAINT_SIGNATURE
      : currentPaint !== checkpoint.paintSignature;

  return {
    hasUnsaved: hasUnsavedRecipe || hasUnsavedPaint,
    hasUnsavedRecipe,
    hasUnsavedPaint,
  };
}

export function hasUnsavedCharacterWork(
  store: LabStore,
  state: LabState,
  session: PaintSession,
): boolean {
  return evaluateUnsavedCharacterWork(store, state, session).hasUnsaved;
}

export function describeUnsavedWorkKo(summary: UnsavedWorkSummary): string {
  if (summary.hasUnsavedRecipe && summary.hasUnsavedPaint) {
    return "저장하지 않은 캐릭터 편집(포즈·외형)과 페인트 레이어";
  }
  if (summary.hasUnsavedPaint) {
    return "저장하지 않은 페인트 레이어(서브레이어 포함)";
  }
  if (summary.hasUnsavedRecipe) {
    return "저장하지 않은 캐릭터 편집(포즈·외형)";
  }
  return "변경 사항 없음";
}

/** "레시피 저장" 완료 시 현재 레시피 내용과 페인트 상태를 저장 완료 기준점으로 기록한다. */
export function markCharacterWorkSaved(
  store: LabStore,
  recipe: CharacterRecipe,
  session: PaintSession,
): void {
  checkpointsByStore.set(store, {
    contentDigest: recipeContentDigest(recipe),
    paintSignature: computePaintSignature(session),
  });
}

/** 레시피 불러오기·붙여넣기 직전에 현재 캐릭터 레시피·능력·6단 페인트 서브레이어 전체를 깊은 복사본으로 보관한다. */
export function captureCharacterWorkBackup(
  recipe: CharacterRecipe,
  capabilities: SlotCapabilityMap,
  session: PaintSession,
  now = Date.now(),
): CharacterWorkBackup {
  const clonedRecipe = JSON.parse(JSON.stringify(recipe)) as CharacterRecipe;
  return {
    recipe: clonedRecipe,
    capabilities,
    paintLayers: session.layersForExport().map((layer) => clonePaintLayer(layer)),
    paintSublayers: session.sublayersForExport().map((sub) => cloneSublayerState(sub)),
    capturedAt: now,
  };
}

export interface RestoreCharacterWorkParams {
  readonly backup: CharacterWorkBackup;
  readonly session: PaintSession;
  readonly engine: CharacterEngine | null;
  readonly dispatch: (cmd: LabCommand) => void;
  readonly applyStoreEvent: (event: LabEvent) => void;
}

/** 보관해 둔 이전 작업 스냅샷으로 레시피·슬롯 능력·다중 페인트 서브레이어·엔진 텍스처를 원자적으로 되돌린다. */
export function restoreCharacterWorkBackup(params: RestoreCharacterWorkParams): void {
  const { backup, session, engine, dispatch, applyStoreEvent } = params;
  const currentLayers = session.layersForExport();
  dispatch({ type: "recipe/load", recipe: backup.recipe });
  applyStoreEvent({ type: "source/capabilities", capabilities: backup.capabilities });
  session.replacePaintState({
    layers: backup.paintLayers,
    sublayers: backup.paintSublayers,
  });
  if (engine) {
    uploadReplacedLayers(currentLayers, session.layersForExport(), (layer) => engine.updatePaintTexture(layer));
  }
}
