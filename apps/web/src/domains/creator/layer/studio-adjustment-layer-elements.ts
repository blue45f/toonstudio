/**
 * studio-adjustment-layer-elements.ts
 *
 * 문서 모델(El 유니온의 AdjustmentEl)과 스택형 조정 레이어 모델
 * (`studio-adjustment-layer.ts`의 spec/그래프 빌더/적용 범위 계산)을 잇는 다리.
 *
 * 책임:
 *  - AdjustmentEl ↔ StudioAdjustmentLayerSpec 변환 (메타데이터 규약 고정)
 *  - 조정 레이어 생성 팩토리 (레이어 패널 "조정 레이어 추가" 진입점)
 *  - 패널 조작(생성·삭제·순서·클립·활성·불투명도·블렌드)을 순수 배열 연산으로 제공
 *  - 합성 플래너: 페이지 요소를 아래→위 순서로 훑어 "일반 요소 구간"과
 *    "조정 단계(효과 그래프)"의 실행 계획을 만든다. 호스트 합성은 이 계획을
 *    순서대로 실행하기만 하면 되고, 조정 단계는 기존 그래프 실행 경로를 탄다.
 *
 * 메타데이터 규약 (AdjustmentEl & StudioElementLayerMetadata):
 *  - spec.name       ← el.name (없으면 종류별 기본 이름)
 *  - spec.enabled    ← !el.hidden
 *  - spec.opacity    ← el.opacity ?? 1 (0..1 클램프)
 *  - spec.blendMode  ← el.blendMode ?? "source-over"
 */
import type {
  StudioAdjustmentEffectGraph,
  StudioAdjustmentKind,
} from "../filter/studio-adjustment-effect-graph";
import type { AdjustmentEl, El } from "../studio-element-model";

import {
  adjustmentLayersAffecting,
  buildStudioAdjustmentLayerGraph,
  defaultAdjustmentLayerName,
  type StudioAdjustmentLayerSpec,
  type StudioStackEntry,
} from "./studio-adjustment-layer";

export type AdjustmentParameters = Readonly<
  Record<string, number | string | boolean | readonly number[]>
>;

/** El 유니온에서 조정 레이어 멤버만 뽑은 타입(메타데이터 인터섹션 포함). */
export type AdjustmentElement = Extract<El, { type: "adjustment" }>;

/** El 유니온에서 조정 레이어인지 판정하는 타입 가드. */
export function isAdjustmentEl(el: El): el is AdjustmentElement {
  return el.type === "adjustment";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

/** AdjustmentEl → 저장/그래프용 spec. 메타데이터 규약은 파일 헤더 참조. */
export function adjustmentSpecFromEl(el: AdjustmentElement): StudioAdjustmentLayerSpec {
  return {
    id: el.id,
    name: el.name ?? defaultAdjustmentLayerName(el.adjustment),
    adjustment: el.adjustment,
    parameters: el.parameters,
    enabled: el.hidden !== true,
    opacity: clamp01(el.opacity ?? 1),
    blendMode: el.blendMode ?? "source-over",
    clipToBelow: el.clipToBelow,
    ...(el.maskHash ? { maskHash: el.maskHash } : {}),
  };
}

export interface CreateAdjustmentElInput {
  readonly id: string;
  readonly kind: StudioAdjustmentKind;
  /** 페이지 경계 — 조정 레이어 지오메트리는 페이지 전체로 고정된다. */
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly name?: string;
  readonly parameters?: AdjustmentParameters;
  readonly clipToBelow?: boolean;
}

/** 레이어 패널 "조정 레이어 추가"가 만드는 기본 조정 레이어 요소. */
export function createAdjustmentEl(input: CreateAdjustmentElInput): El {
  const el: AdjustmentEl & { name: string } = {
    id: input.id,
    type: "adjustment",
    x: 0,
    y: 0,
    width: input.pageWidth,
    height: input.pageHeight,
    rotation: 0,
    adjustment: input.kind,
    parameters: input.parameters ?? {},
    clipToBelow: input.clipToBelow ?? false,
    name: input.name ?? defaultAdjustmentLayerName(input.kind),
  };
  return el;
}

/** 페이지 요소 배열(아래→위) → 적용 범위 계산용 스택 항목. */
export function stackEntriesFromElements(elements: readonly El[]): readonly StudioStackEntry[] {
  return elements.map((el): StudioStackEntry =>
    isAdjustmentEl(el)
      ? { type: "adjustment", spec: adjustmentSpecFromEl(el) }
      : { type: "layer", id: el.id },
  );
}

// ── 패널 조작 (전부 순수 함수 — 입력 배열을 바꾸지 않는다) ────────────────────

/** 조정 레이어를 스택 맨 위(배열 끝)에 추가한다. */
export function insertAdjustmentLayer(elements: readonly El[], el: El): readonly El[] {
  return [...elements, el];
}

/** 조정 레이어만 삭제한다(일반 요소 id를 넘기면 원본 그대로). */
export function removeAdjustmentLayer(elements: readonly El[], id: string): readonly El[] {
  const target = elements.find((el) => el.id === id);
  if (!target || !isAdjustmentEl(target)) return elements;
  return elements.filter((el) => el.id !== id);
}

/** 조정 레이어를 한 칸 위/아래로 이동한다. 경계에서는 원본 그대로. */
export function moveAdjustmentLayer(
  elements: readonly El[],
  id: string,
  direction: "up" | "down",
): readonly El[] {
  const index = elements.findIndex((el) => el.id === id);
  if (index < 0 || !isAdjustmentEl(elements[index] as El)) return elements;
  const swapWith = direction === "up" ? index + 1 : index - 1;
  if (swapWith < 0 || swapWith >= elements.length) return elements;
  const next = [...elements];
  const current = next[index] as El;
  next[index] = next[swapWith] as El;
  next[swapWith] = current;
  return next;
}

/** 조정 레이어 부분 패치 — 패널 컨트롤(클립·활성·불투명도·블렌드·파라미터)이 쓴다. */
export interface AdjustmentElPatch {
  readonly clipToBelow?: boolean;
  readonly enabled?: boolean;
  readonly opacity?: number;
  readonly blendMode?: string;
  readonly name?: string;
  readonly parameters?: AdjustmentParameters;
}

export function patchAdjustmentLayer(
  elements: readonly El[],
  id: string,
  patch: AdjustmentElPatch,
): readonly El[] {
  return elements.map((el) => {
    if (el.id !== id || !isAdjustmentEl(el)) return el;
    const next: AdjustmentElement = {
      ...el,
      ...(patch.clipToBelow !== undefined ? { clipToBelow: patch.clipToBelow } : {}),
      ...(patch.enabled !== undefined ? { hidden: !patch.enabled } : {}),
      ...(patch.opacity !== undefined ? { opacity: clamp01(patch.opacity) } : {}),
      ...(patch.blendMode !== undefined ? { blendMode: patch.blendMode } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.parameters !== undefined ? { parameters: patch.parameters } : {}),
    };
    return next;
  });
}

// ── 합성 플래너 ──────────────────────────────────────────────────────────────

export type StudioAdjustmentCompositeStep =
  | {
      readonly type: "elements";
      /** 이 구간에 그릴 일반 요소 id(아래→위). 조정 레이어는 포함되지 않는다. */
      readonly elementIds: readonly string[];
    }
  | {
      readonly type: "adjustment";
      readonly layerId: string;
      /** 기존 그래프 실행 경로에 그대로 넘기는 효과 그래프. */
      readonly graph: StudioAdjustmentEffectGraph;
      /** 이 조정이 실제로 닿는 일반 레이어 id(적용 순서). 빈 배열이면 닿는 대상 없음. */
      readonly affectingLayerIds: readonly string[];
      /** clipToBelow일 때 묶이는 베이스 레이어 id. 비클립이면 null(아래 합성 전체). */
      readonly clipTargetLayerId: string | null;
    };

export interface PlanAdjustmentCompositeInput {
  /** 그래프 id 접두사 — 문서/페이지 id를 넘겨 결정적 id를 만든다. */
  readonly graphIdPrefix: string;
  readonly revision: number;
  /** 아래쪽 합성 결과의 콘텐츠 해시 공급자 — 조정 레이어 id 기준으로 호출된다. */
  readonly compositeSourceHashFor: (adjustmentLayerId: string) => string;
}

/**
 * 페이지 요소를 아래→위로 훑어 합성 실행 계획을 만든다.
 * - 일반 요소는 연속 구간으로 묶인다.
 * - 조정 레이어는 그 지점에서 그래프 단계가 된다(비활성이어도 단계는 만들되
 *   그래프의 조정 노드 enabled=false라 실행기가 항등으로 통과시킨다).
 * - 클립 판정·적용 범위는 `adjustmentLayersAffecting` 단일 규약을 쓴다.
 */
export function planAdjustmentComposite(
  elements: readonly El[],
  input: PlanAdjustmentCompositeInput,
): readonly StudioAdjustmentCompositeStep[] {
  const stack = stackEntriesFromElements(elements);
  const steps: StudioAdjustmentCompositeStep[] = [];
  let pending: string[] = [];
  const flush = (): void => {
    if (pending.length > 0) {
      steps.push({ type: "elements", elementIds: pending });
      pending = [];
    }
  };
  elements.forEach((el, index) => {
    if (!isAdjustmentEl(el)) {
      pending.push(el.id);
      return;
    }
    flush();
    const spec = adjustmentSpecFromEl(el);
    const graph = buildStudioAdjustmentLayerGraph({
      spec,
      compositeSourceHash: input.compositeSourceHashFor(el.id),
      graphId: `${input.graphIdPrefix}:${el.id}`,
      revision: input.revision,
    });
    // 이 조정 레이어가 닿는 레이어 = 스택의 모든 일반 레이어 중 이 조정이 닿는 것.
    const affecting: string[] = [];
    stack.forEach((entry, targetIndex) => {
      if (entry.type !== "layer") return;
      if (adjustmentLayersAffecting(stack, targetIndex).includes(el.id)) affecting.push(entry.id);
    });
    // 클립 대상: 바로 아래 가장 가까운 일반 레이어.
    let clipTargetLayerId: string | null = null;
    if (spec.clipToBelow) {
      for (let i = index - 1; i >= 0; i -= 1) {
        const below = elements[i] as El;
        if (!isAdjustmentEl(below)) {
          clipTargetLayerId = below.id;
          break;
        }
      }
    }
    steps.push({ type: "adjustment", layerId: el.id, graph, affectingLayerIds: affecting, clipTargetLayerId });
  });
  flush();
  return steps;
}
