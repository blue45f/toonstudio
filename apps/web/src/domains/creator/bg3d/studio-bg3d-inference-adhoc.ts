/**
 * 일회용 추론 해석 — 호출마다 작은 후보 집합으로 색인을 만들어 단일 파이프라인에 태운다.
 *
 * 레거시 엔진 두 개(`scene-3d/studio-3d-inference-engine.ts`, `studio-build-inference-snap.ts`)는
 * "후보 점/선분 목록 + 커서 하나"를 받아 결과를 돌려주는 API였다. 이 함수가 그 입력을 새 파이프라인
 * (`resolveStudioBg3dInference`)의 입력으로 바꿔 주므로, 레거시 쪽은 매핑만 남기고 후보 수학은 한곳에 모인다.
 * 장면 전체를 반복 해석하는 용도가 아니다(그 경우 서비스의 영속 색인을 쓴다).
 */

import { resolveStudioBg3dInference } from "./studio-bg3d-inference-engine";
import { createStudioBg3dInferenceIndex } from "./studio-bg3d-inference-index";
import { buildStudioBg3dInferenceSourceSet } from "./studio-bg3d-inference-sources";

import type { StudioBg3dInferenceKind } from "./studio-bg3d-inference-kinds";
import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type {
  StudioBg3dInferenceLineSource,
  StudioBg3dInferencePointSource,
} from "./studio-bg3d-inference-sources";
import type {
  StudioBg3dInferenceLock,
  StudioBg3dInferenceOutcome,
  StudioBg3dInferenceThresholds,
} from "./studio-bg3d-inference-types";

export interface StudioBg3dAdhocInferenceInput {
  readonly points?: readonly StudioBg3dInferencePointSource[];
  readonly lines?: readonly StudioBg3dInferenceLineSource[];
  readonly cursorPoint: StudioBg3dInferenceVec3;
  /** 커서 깊이에서 화면 1px에 해당하는 월드 길이. */
  readonly worldPerPixel: number;
  readonly referencePoint?: StudioBg3dInferenceVec3 | null;
  readonly hoverReferences?: readonly StudioBg3dInferenceVec3[];
  readonly lock?: StudioBg3dInferenceLock;
  readonly grid?: { readonly step: number } | null;
  readonly thresholds?: StudioBg3dInferenceThresholds;
  readonly enabledKinds?: ReadonlySet<StudioBg3dInferenceKind> | null;
  readonly preferKinds?: ReadonlySet<StudioBg3dInferenceKind> | null;
}

export function resolveStudioBg3dAdhocInference(input: StudioBg3dAdhocInferenceInput): StudioBg3dInferenceOutcome {
  const source = buildStudioBg3dInferenceSourceSet({
    entities: [],
    points: input.points ?? [],
    lines: input.lines ?? [],
  });
  const index = createStudioBg3dInferenceIndex(source);
  return resolveStudioBg3dInference({
    index,
    cursor: { kind: "point", point: input.cursorPoint, worldPerPixel: input.worldPerPixel },
    referencePoint: input.referencePoint ?? null,
    hoverReferences: input.hoverReferences ?? [],
    ...(input.lock ? { lock: input.lock } : {}),
    ...(input.grid ? { grid: input.grid } : {}),
    ...(input.thresholds ? { thresholds: input.thresholds } : {}),
    ...(input.enabledKinds ? { enabledKinds: input.enabledKinds } : {}),
    ...(input.preferKinds ? { preferKinds: input.preferKinds } : {}),
  });
}
