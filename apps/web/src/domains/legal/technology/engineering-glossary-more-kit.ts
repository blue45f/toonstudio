import type { LocalizedText } from "./engineering-story-content";

/** 확장 용어집 파일들이 함께 쓰는 번역 쌍 헬퍼. */
export const t = (ko: string, en: string): LocalizedText => ({ ko, en });
