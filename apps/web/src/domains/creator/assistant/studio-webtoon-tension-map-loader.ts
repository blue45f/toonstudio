import { createStudioIntentLazyLoader } from "../studio-intent-lazy-loader";

/**
 * 텐션 맵 탭 본문의 지연 로더 — 하나의 공유·재시도 가능한 요청.
 * 이 파일을 가져와도 차트·계산·포즈 추천 코드는 내려받지 않는다. 탭을 처음 열 때만 요청한다.
 */
export const studioWebtoonTensionMapLoader = createStudioIntentLazyLoader(
  () => import("./StudioWebtoonTensionMapTab"),
);
