import type { LocalizedText } from "./engineering-story-content";

/** interaction 카드 공통 도우미: ko/en 한 쌍을 만든다. */
export const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/** 카드 내용을 코드와 대조한 날짜. */
export const INTERACTION_REVIEWED_AT = "2026-10-07";
