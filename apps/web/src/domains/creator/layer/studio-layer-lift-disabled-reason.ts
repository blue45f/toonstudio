/**
 * 컷 레이어 분리 진입 버튼의 동기 비활성 사유 계산 리프.
 */
import { inspectStudioLayerLiftAvailability } from "./studio-layer-lift-availability";

import type { El } from "../studio-element-model";
import type { LayerGroup } from "../studio-layers";

/** 렌더마다 계산되는 진입 차단 사유. 잠금·재생·저장 게이트가 가용성 검사보다 앞선다. */
export interface StudioLayerLiftDisabledReasonInput {
  readonly elements: readonly El[];
  readonly groups: readonly LayerGroup[];
  readonly selectedIds: readonly string[];
  readonly workId: string | null;
  readonly collaborationDocumentLocked: boolean;
  readonly collaborationLockMessage: () => string;
  readonly activeSurfaceReviewLocked: boolean;
  readonly pageEditLocked: boolean;
  readonly masterEditMode: boolean;
  readonly timelinePlaying: boolean;
  readonly timelapseCapturing: boolean;
  readonly saving: boolean;
}

export function resolveStudioLayerLiftDisabledReason(
  input: StudioLayerLiftDisabledReasonInput,
): string | null {
  const {
    elements,
    groups,
    selectedIds,
    workId,
    collaborationDocumentLocked,
    collaborationLockMessage,
    activeSurfaceReviewLocked,
    pageEditLocked,
    masterEditMode,
    timelinePlaying,
    timelapseCapturing,
    saving,
  } = input;
  const studioLayerLiftAvailability = inspectStudioLayerLiftAvailability({
    elements,
    groups,
    selectedIds,
  });
  return workId
    ? "저장된 팀 원고용 에셋 트랜잭션을 연결하는 중입니다. 현재 베타는 새 로컬 원고에서 사용할 수 있어요."
    : collaborationDocumentLocked
      ? collaborationLockMessage()
      : activeSurfaceReviewLocked || (pageEditLocked && !masterEditMode)
        ? "작업면 검토 잠금을 해제한 뒤 레이어를 복원하세요."
        : masterEditMode
          ? "현재 베타는 페이지 이미지 레이어에서만 사용할 수 있어요. 마스터 편집을 종료해 주세요."
          : timelinePlaying
            ? "타임라인 재생을 멈춘 뒤 레이어를 복원하세요."
            : timelapseCapturing
              ? "타임랩스 캡처가 끝난 뒤 레이어를 복원하세요."
              : saving
                ? "저장이 끝난 뒤 레이어를 복원하세요."
                : studioLayerLiftAvailability.available
                  ? null
                  : studioLayerLiftAvailability.message;
}
