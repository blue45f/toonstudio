/**
 * AI 자동 콘티·스토리 블루프린트 포맷 상수 — ai-quick-blueprint-engine.ts와
 * ai-quick-blueprint-handoff.ts 간 순환 의존성 제거용 리프 모듈.
 */
import type { StudioProjectFormat } from "../studio-project-definition";

export type AiBlueprintLocale = "ko" | "en";
export type AiBlueprintFormatId = "instatoon-4" | "webtoon-6" | "movingtoon-4";
export type AiBlueprintToneId = "romance" | "action" | "comedy" | "mystery";
export type AiBlueprintRemixStyle = "natural" | "dramatic" | "witty";
export type AiBlueprintSource = "smart-instant" | "cloud-ai";

export const AI_BLUEPRINT_FORMATS: readonly {
  readonly id: AiBlueprintFormatId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly badgeKo: string;
  readonly badgeEn: string;
  readonly cutCount: 4 | 6;
  readonly studioFormat: StudioProjectFormat;
  readonly studioTemplateId: string | null;
}[] = Object.freeze([
  {
    id: "instatoon-4",
    labelKo: "4컷 인스타툰",
    labelEn: "4-Panel Comic",
    badgeKo: "1080² · 기승전결 4컷",
    badgeEn: "1080² · 4-beat arc",
    cutCount: 4,
    studioFormat: "cuttoon",
    studioTemplateId: "cuttoon-square-4",
  },
  {
    id: "webtoon-6",
    labelKo: "세로 웹툰 1화 (6컷)",
    labelEn: "Vertical Ep.1 (6 Panels)",
    badgeKo: "800×세로 · 오프닝~엔딩훅",
    badgeEn: "800×Scroll · Hook to cliffhanger",
    cutCount: 6,
    studioFormat: "vertical-webtoon",
    studioTemplateId: null,
  },
  {
    id: "movingtoon-4",
    labelKo: "쇼츠 무빙툰 (4컷)",
    labelEn: "Shorts Motion Toon",
    badgeKo: "9:16 세로 · 카메라 워킹",
    badgeEn: "9:16 Vertical · Camera motion",
    cutCount: 4,
    studioFormat: "motion-toon",
    studioTemplateId: "motion-toon-vertical",
  },
]);
