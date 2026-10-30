/** 새 절단선 오류만 고정된 사용자 문장으로 바꾸며 다른 도구의 오류 계약은 유지한다. */
import { StudioHybridDccLoopCutError } from "./studio-hybrid-dcc-loop-cut-workspace";

import type { StudioHybridDccRunResult } from "./studio-hybrid-dcc-tool-catalog";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

type Bilingual = (ko: string, en: string) => string;

export function isStudioHybridDccRunResult(
  value: StudioHybridDccWorkspace | StudioHybridDccRunResult,
): value is StudioHybridDccRunResult {
  return Object.hasOwn(value, "workspace");
}

/** bt는 Panel의 useBilingual을 사용하므로 각 고정 ko/en 쌍의 번역 키·기본값을 함께 등록한다. */
export function describeStudioHybridDccOperationError(bt: Bilingual, error: unknown): string {
  if (!(error instanceof StudioHybridDccLoopCutError)) {
    return error instanceof Error ? error.message : String(error);
  }
  switch (error.code) {
    case "no-active-asset":
      return bt(
        "절단선을 넣을 오브젝트를 먼저 선택하세요.",
        "Select an object before adding a loop cut.",
      );
    case "missing-asset":
    case "no-edge":
    case "not-found":
    case "empty-selection":
      return bt(
        "절단할 모서리를 현재 메시에서 찾을 수 없습니다. 오브젝트와 모서리를 다시 선택하세요.",
        "The edge to cut is not in the current mesh. Select the object and edge again.",
      );
    case "invalid-parameter":
      return bt(
        "절단 위치는 모서리의 두 끝점 사이여야 합니다. 0보다 크고 1보다 작은 값을 입력하세요.",
        "The cut must lie between the edge endpoints. Enter a value greater than 0 and less than 1.",
      );
    case "budget-exceeded":
      return bt(
        "절단 결과가 한 번에 편집하거나 표시할 수 있는 메시 범위를 넘습니다. 모델을 나누거나 단순하게 만든 뒤 다시 시도하세요. 원본과 편집 이력은 그대로입니다.",
        "The cut exceeds what can be edited or displayed in one step. Split or simplify the model and try again. The original and edit history are unchanged.",
      );
    case "invalid-mesh":
      return bt(
        "현재 메시의 연결이나 UV 원본을 확인할 수 없어 절단하지 않았습니다. 메시를 확인하거나 다른 오브젝트를 선택하세요. 원본과 편집 이력은 그대로입니다.",
        "The mesh connections or UV source could not be verified, so the cut was cancelled. Check the mesh or select another object. The original and edit history are unchanged.",
      );
    case "non-manifold":
      return bt(
        "면이나 모서리의 연결이 겹치거나 끊겨 이 절단선을 만들 수 없습니다. 메시 연결을 정리한 뒤 다시 시도하세요. 원본과 편집 이력은 그대로입니다.",
        "Overlapping or disconnected mesh connections prevent this loop cut. Repair the connections and try again. The original and edit history are unchanged.",
      );
    case "topology-failed":
      return bt(
        "선택한 면 흐름이나 절단 위치에서는 안전한 절단선을 만들 수 없습니다. 다른 모서리나 위치를 선택하세요. 원본과 편집 이력은 그대로입니다.",
        "A valid loop cut cannot be made through these faces at this position. Choose another edge or cut position. The original and edit history are unchanged.",
      );
    case "surface-unavailable":
      return bt(
        "이 위치에서 자르면 화면에 표시할 수 없는 면이 생겨 취소했습니다. 절단 위치를 두 끝점에서 더 떨어뜨리거나 모델을 단순하게 만들어 보세요. 원본과 편집 이력은 그대로입니다.",
        "The cut would create faces that cannot be displayed, so it was cancelled. Move the cut farther from the endpoints or simplify the model. The original and edit history are unchanged.",
      );
    default:
      return bt(
        "절단선을 만들지 못했습니다. 선택이나 절단 위치를 바꿔 다시 시도하세요. 원본과 편집 이력은 그대로입니다.",
        "The loop cut could not be completed. Change the selection or cut position and try again. The original and edit history are unchanged.",
      );
  }
}
