import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";

import { lazyRetry } from "@/shared/lib/lazy-retry";

import { hasStudioLessonMissionLinkShape } from "./studio-lesson-mission-link-shape";

const StudioLessonMissionBar = lazyRetry(
  () => import("../StudioLessonMissionBar").then((module) => ({ default: module.StudioLessonMissionBar })),
  "StudioLessonMissionBar",
);

/**
 * 강좌 실습 미션 바의 슬롯.
 *
 * 미션 바는 learn의 "스튜디오에서 실습하기" 딥링크로 들어왔을 때만 뜨지만, 바 본체는
 * 강좌 콘텐츠(learning-content)와 학습 진도·실습 기록 저장소를 함께 끌어온다. 에디터가
 * 상시 렌더하는 이 슬롯은 주소 모양만 확인하고, 딥링크가 있을 때만 바를 지연 로딩한다 —
 * 일반 에디터 진입이 학습 콘텐츠 청크를 내려받지 않는다(Studio 번들 기준선 경계).
 * 미션 id 검증과 표시 여부의 최종 판정은 바 본체가 그대로 맡으므로, 잘못된 딥링크는
 * 이전처럼 아무것도 그리지 않는다(로딩 중에도 캔버스 위에 자리표시를 얹지 않는다).
 */
export function StudioLessonMissionBarSlot() {
  const [params] = useSearchParams();
  if (!hasStudioLessonMissionLinkShape(params)) return null;
  return (
    <Suspense fallback={null}>
      <StudioLessonMissionBar />
    </Suspense>
  );
}
