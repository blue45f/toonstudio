/**
 * 필터 갤러리 대화상자의 지연 로드 진입점.
 *
 * 세션 대화상자(즉시 로드 경로)는 이 작은 모듈만 가져오고, 대화상자·등록부·커널 전체는 처음 열 때 별도 청크로
 * 받는다. 기준선에 묶인 studio-page-lazy-ui 를 늘리지 않으려고 필터 갤러리 폴더 안에 둔다.
 */
import { lazyRetry } from "@/shared/lib/lazy-retry";

export const StudioFilterGalleryDialog = lazyRetry(
  () => import("./StudioFilterGalleryDialog").then((mod) => ({ default: mod.StudioFilterGalleryDialog })),
  "StudioFilterGalleryDialog",
);
