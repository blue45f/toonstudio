/**
 * webtoon-cut-pose-catalog.ts
 *
 * 포즈 추천이 점수화할 카탈로그(NATURAL_IDLE_POSES + EXTRA_POSE_PRESETS)를 사용자 의도 시점에
 * 지연 로드한다. 프리셋 한 벌이 본 회전값을 통째로 들고 있어 가볍지 않으므로, 텐션 맵 탭을 열었다는
 * 이유만으로는 요청하지 않는다. 곡선이 그려져 추천 패널이 처음 보일 때(`use-cut-pose-catalog.ts` 를
 * 부르는 구역이 마운트될 때) 처음 요청한다(apps/web/AGENTS.md 의 번들 경계 규칙).
 *
 * 한 번 받은 모듈은 재사용하고, 실패하면 캐시를 비워 다음 시도가 다시 요청하게 한다
 * (`createStudioIntentLazyLoader` 계약). 화면은 실패를 `다시 시도` 버튼으로 이어 준다.
 */

import { createStudioIntentLazyLoader } from "../studio-intent-lazy-loader";

import { poseCandidatesFromPresets, type CutPoseCandidate } from "./webtoon-cut-pose-suggestion";

export const cutPoseCatalogLoader = createStudioIntentLazyLoader(
  async (): Promise<readonly CutPoseCandidate[]> => {
    const presets = await import("../studio-pose-presets");
    return poseCandidatesFromPresets(presets.NATURAL_IDLE_POSES, presets.EXTRA_POSE_PRESETS);
  },
);
