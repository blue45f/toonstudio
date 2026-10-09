import type { RawStage } from "./raw-stage";
import type { RawSample } from "../../core/types";

/** 통과 단계: 표본을 바꾸지 않는다(복사만). '끔'과 체인의 기준선, 그리고 단계 비교 측정의 기준이다. */
export function createPassthroughStage(): RawStage {
  return {
    id: "passthrough",
    label: "통과(보정 없음)",
    apply: (samples: readonly RawSample[]): RawSample[] => samples.map((s) => ({ ...s })),
    flush: (): RawSample[] => [],
    reset: (): void => undefined,
  };
}
