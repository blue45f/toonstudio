/**
 * 소재 삽입 표면의 지연 로딩 경계 — 스티커 그리드와 콜라주 패널.
 *
 * studio-page-lazy-ui.ts(선택 표면 레지스트리)에서 분리했다(파일 크기 래칫 해소).
 * 레지스트리가 이 모듈을 재노출하므로 호출부의 import 경로는 그대로다. 동적 import
 * 리터럴은 Vite/Rolldown 정적 분석을 위해 이 모듈 안에서도 그대로 유지한다.
 */
import { lazyRetry } from "@/shared/lib/lazy-retry";

export const StudioStickerGrid = lazyRetry(
  () => import("./studio-sticker-grid").then((mod) => ({ default: mod.StudioStickerGrid })),
  "StudioStickerGrid"
);
export const StudioCollagePanel = lazyRetry(
  () => import("./StudioCollagePanel").then((mod) => ({ default: mod.StudioCollagePanel })),
  "StudioCollagePanel"
);
