/**
 * 게시 패키지 manifest의 `rights` — 작가가 밝힌 AI 학습 허용 표기.
 *
 * 값 어휘와 해석 규칙은 작품 게시 계약(`creator-community-publication-contract`)과 같다:
 * 미지정(`unspecified`, 기본)·허용(`allowed`)·불허(`prohibited`). 표기는 작가의 의사 표시이며
 * 별도 계약을 대체하지 않고, 외부 AI 사업자가 따르도록 강제할 수 없다. 읽을 때는 알 수 없는 값,
 * 누락, `rights`가 없는 기존 v1 manifest를 모두 미지정으로 읽는다(근거 없이 허용으로 읽지 않는다).
 *
 * planner(`studio-publish-package.ts`)와 지연 로드되는 manifest 런타임이 함께 쓰는 leaf 모듈이다.
 */
import { isRecord } from "./studio-publish-package-primitives";

import {
  DEFAULT_CREATOR_COMMUNITY_AI_TRAINING_CONSENT,
  parseCreatorCommunityAiTrainingConsent,
  type CreatorCommunityAiTrainingConsent,
} from "@toonstudio/contracts/creator-community-publication-contract";

export type StudioPublishPackageAiTraining = CreatorCommunityAiTrainingConsent;

export const DEFAULT_STUDIO_PUBLISH_PACKAGE_AI_TRAINING: StudioPublishPackageAiTraining =
  DEFAULT_CREATOR_COMMUNITY_AI_TRAINING_CONSENT;

export interface StudioPublishPackageRights {
  readonly aiTraining: StudioPublishPackageAiTraining;
}

export function normalizeStudioPublishPackageAiTraining(
  value: unknown,
): StudioPublishPackageAiTraining {
  return parseCreatorCommunityAiTrainingConsent(value) ?? DEFAULT_STUDIO_PUBLISH_PACKAGE_AI_TRAINING;
}

/** manifest 또는 그 `rights` 값에서 공개 projection을 읽는다. 없거나 잘못된 값은 미지정이다. */
export function readStudioPublishPackageRights(value: unknown): StudioPublishPackageRights {
  return {
    aiTraining: normalizeStudioPublishPackageAiTraining(
      isRecord(value) ? value.aiTraining : undefined,
    ),
  };
}
