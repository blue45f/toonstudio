/**
 * studio-adjustment-layer.ts (초안 — PhotoCraft 분석 반영 과제)
 *
 * 스택형 조정 레이어의 데이터 모델 + 효과 그래프 빌더.
 *
 * 배경: ToonStudio의 조정은 지금까지 레이어에 붙는 효과 그래프
 * (`filter/studio-adjustment-effect-graph.ts`)로만 존재했다. Photoshop/PhotoCraft
 * 식 "조정 레이어" — 스택의 한 칸을 차지해 아래쪽 합성 전체에 작용하고, 자기
 * 블렌드 모드·불투명도·마스크를 가지며, 바로 아래 레이어에만 묶을(clip) 수 있는
 * 1급 레이어 — 은 문서 모델에 없었다. PSD 가져오기가 조정 레이어를 버리는
 * 근본 이유도 이것이다.
 *
 * 이 모듈은 그 빈칸의 순수 모델층이다.
 *  - `StudioAdjustmentLayerSpec`: 문서에 저장될 조정 레이어의 직렬화 형태
 *  - `buildStudioAdjustmentLayerGraph`: 합성 입력(source) → 조정 → 출력 으로
 *    이어지는 `StudioAdjustmentEffectGraph`를 만들어 기존 검증기를 통과시킨다.
 *    렌더러는 새 경로를 만들 필요 없이 기존 그래프 실행 경로를 재사용한다.
 *  - `adjustmentLayersAffecting`: 스택 순서만으로 어떤 조정 레이어가 어느
 *    레이어에 닿는지를 계산한다(클립 규칙 포함). 합성 순서 검증·UI 배지용.
 *
 * 문서 모델(El 유니온)·호스트 렌더 배선은 후속 단계에서 이 spec을 참조한다.
 */
import {
  validateStudioAdjustmentEffectGraph,
  type StudioAdjustmentEffectGraph,
  type StudioAdjustmentKind,
} from "../filter/studio-adjustment-effect-graph";

export interface StudioAdjustmentLayerSpec {
  readonly id: string;
  readonly name: string;
  readonly adjustment: StudioAdjustmentKind;
  readonly parameters: Readonly<Record<string, number | string | boolean | readonly number[]>>;
  readonly enabled: boolean;
  /** 0..1 — 조정 강도(합성 결과와의 혼합 비율이 아니라 조정 노드 opacity). */
  readonly opacity: number;
  /** El.blendMode 문자열과 같은 규약. "source-over"면 통상 합성. */
  readonly blendMode: string;
  /**
   * true면 스택에서 바로 아래 레이어 1개에만 적용된다(Photoshop의
   * "Clip to layer below"). false면 아래쪽 전체에 적용된다.
   */
  readonly clipToBelow: boolean;
  /** 레이어 마스크 소스 해시(있으면). 마스크 노드는 후속 단계에서 그래프에 끼운다. */
  readonly maskHash?: string;
}

export interface StudioAdjustmentLayerGraphInput {
  readonly spec: StudioAdjustmentLayerSpec;
  /** 이 조정 레이어보다 아래쪽 합성 결과의 콘텐츠 해시(그래프 source 노드용). */
  readonly compositeSourceHash: string;
  /** 그래프 id 접두사 — 결정적 id 생성을 위해 호출자가 문서 id를 넘긴다. */
  readonly graphId: string;
  readonly revision: number;
}

/**
 * 조정 레이어 1개를 기존 효과 그래프 1개로 편다.
 * 노드 구성: source(아래쪽 합성) → adjustment → output.
 * 생성 직후 `validateStudioAdjustmentEffectGraph` 로 자기 검증한다.
 */
export function buildStudioAdjustmentLayerGraph(
  input: StudioAdjustmentLayerGraphInput,
): StudioAdjustmentEffectGraph {
  const { spec } = input;
  const sourceId = `${spec.id}:source`;
  const adjustmentId = `${spec.id}:adjustment`;
  const outputId = `${spec.id}:output`;
  const graph: StudioAdjustmentEffectGraph = {
    version: 1,
    id: input.graphId,
    revision: input.revision,
    outputNodeId: outputId,
    nodes: [
      {
        id: sourceId,
        kind: "source",
        enabled: true,
        opacity: 1,
        blendMode: "source-over",
        sourceHash: input.compositeSourceHash,
        embedded: true,
      },
      {
        id: adjustmentId,
        kind: "adjustment",
        enabled: spec.enabled,
        opacity: spec.opacity,
        blendMode: spec.blendMode,
        adjustment: spec.adjustment,
        parameters: spec.parameters,
        colorSpace: "srgb",
      },
      {
        id: outputId,
        kind: "output",
        enabled: true,
        opacity: 1,
        blendMode: "source-over",
        outputColorSpace: "srgb",
      },
    ],
    edges: [
      { from: sourceId, to: adjustmentId, input: "source" },
      { from: adjustmentId, to: outputId, input: "source" },
    ],
  };
  validateStudioAdjustmentEffectGraph(graph);
  return graph;
}

/** 스택 원소: 일반 레이어이거나 조정 레이어. 아래→위 순서로 정렬된 배열을 받는다. */
export type StudioStackEntry =
  | { readonly type: "layer"; readonly id: string }
  | { readonly type: "adjustment"; readonly spec: StudioAdjustmentLayerSpec };

/**
 * 스택(아래→위)에서 targetIndex 위치의 일반 레이어에 닿는 조정 레이어 id 목록을
 * 적용 순서(아래→위)대로 돌려준다.
 *
 * 규칙(Photoshop 의미론):
 *  - 조정 레이어는 자기보다 아래의 합성에 작용한다.
 *  - clipToBelow 인 조정 레이어는 바로 아래 "일반 레이어"에만 닿고, 그 위쪽
 *    일반 레이어들에는 닿지 않는다. 클립된 조정 레이어가 연속으로 쌓이면
 *    전부 같은 베이스 레이어에 묶인다.
 *  - 비활성(enabled:false) 조정 레이어도 목록에 포함하되 호출자가 거른다 —
 *    이 함수는 "닿는 범위"만 답하고 실행 여부는 렌더러 판단이다.
 */
export function adjustmentLayersAffecting(
  stackBottomToTop: readonly StudioStackEntry[],
  targetIndex: number,
): readonly string[] {
  const target = stackBottomToTop[targetIndex];
  if (!target || target.type !== "layer") return [];
  const affecting: string[] = [];
  // target 바로 위부터 위쪽으로: 첫 일반 레이어를 만나면 그 위는 남의 영역이다.
  // 단, 클립 조정 레이어는 "자기 바로 아래 일반 레이어"에만 묶이므로, target이
  // 아닌 일반 레이어가 사이에 있으면 그 조정 레이어들은 target에 닿지 않는다.
  let blockedByOtherLayer = false;
  for (let index = targetIndex + 1; index < stackBottomToTop.length; index += 1) {
    const entry = stackBottomToTop[index];
    if (!entry) continue;
    if (entry.type === "layer") {
      blockedByOtherLayer = true;
      continue;
    }
    if (entry.spec.clipToBelow && blockedByOtherLayer) continue;
    affecting.push(entry.spec.id);
  }
  return affecting;
}

/** PSD 가져오기 등에서 이름 없는 조정 레이어의 폴백 이름(종류별 한국어 라벨). */
export const STUDIO_ADJUSTMENT_KIND_LABELS: Readonly<Record<StudioAdjustmentKind, string>> = {
  levels: "레벨",
  curves: "곡선",
  hsl: "색조/채도",
  "color-balance": "색상 균형",
  "channel-mixer": "채널 믹서",
  "gradient-map": "그라디언트 맵",
  lab: "Lab 조정",
  "brightness-contrast": "밝기/대비",
  exposure: "노출",
  vibrance: "활기",
  invert: "반전",
  posterize: "포스터리제이션",
  threshold: "임계값",
  "black-white": "흑백",
  "photo-filter": "사진 필터",
  "selective-color": "선택 색상",
  "color-lookup": "컬러 룩업",
};

export function defaultAdjustmentLayerName(kind: StudioAdjustmentKind): string {
  return `${STUDIO_ADJUSTMENT_KIND_LABELS[kind]} 조정 레이어`;
}
