import {
  evaluateWorkflowPackRightsClearance,
  type StudioWorkflowPack,
  type WorkflowPackLockableField,
} from "./studio-workflow-pack";

import type { SkinToneId } from "./webtoon-color-harmony-assistant";
import type { PerspectiveGuidePreset } from "./webtoon-croquis-pose-guide";
import type { WebtoonPlatformId } from "./webtoon-platform-spec-validator";
import type { ReaderScrollSpeedProfile } from "./webtoon-scroll-pacing-simulator";

export interface ActiveWorkflowPolicyValues {
  readonly platformId: WebtoonPlatformId;
  readonly skinToneId: SkinToneId;
  readonly perspectivePreset: PerspectiveGuidePreset;
  readonly readerSpeed: ReaderScrollSpeedProfile;
}

export interface WorkflowPackTeamPolicyAudit {
  readonly enforced: boolean;
  readonly compliant: boolean;
  readonly teamLabel: string | null;
  readonly violations: readonly string[];
}

const FIELD_LABELS: Readonly<Record<WorkflowPackLockableField, string>> = {
  platformId: "플랫폼 규격",
  skinToneId: "피부톤 팔레트",
  perspectivePreset: "투시 구도",
  readerSpeed: "독자 스크롤 속도",
};

/**
 * 팀 스튜디오 정책 잠금(Team Policy Lock)이 설정된 워크플로우 팩에 대해
 * 현재 작업 설정과 상업 라이선스 상태가 규약을 준수하는지 검사한다.
 */
export function evaluateWorkflowPackTeamPolicy(
  pack: StudioWorkflowPack,
  activeValues: ActiveWorkflowPolicyValues,
): WorkflowPackTeamPolicyAudit {
  const policy = pack.teamPolicyLock;
  if (!policy) {
    return {
      enforced: false,
      compliant: true,
      teamLabel: null,
      violations: [],
    };
  }

  const violations: string[] = [];

  for (const field of policy.lockedFields) {
    if (activeValues[field] !== pack[field]) {
      violations.push(
        `${FIELD_LABELS[field]} 잠금 위반: 팀 기준(${pack[field]})과 현재 값(${activeValues[field]})이 다릅니다.`,
      );
    }
  }

  if (policy.requireCommercialClearance) {
    const clearance = evaluateWorkflowPackRightsClearance(pack);
    if (!clearance.clearedForCommercialExport) {
      violations.push(`상업 라이선스 필수 정책 위반: ${clearance.summary}`);
    }
  }

  return {
    enforced: true,
    compliant: violations.length === 0,
    teamLabel: policy.teamLabel,
    violations,
  };
}
