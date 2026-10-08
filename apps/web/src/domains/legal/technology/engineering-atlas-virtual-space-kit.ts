import type { LocalizedText } from "./engineering-story-content";

/** virtual-space 카테고리 카드가 함께 쓰는 작은 도우미. 카드 내용은 두지 않는다. */
export const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/** 카드를 마지막으로 코드와 대조한 날짜. */
export const VIRTUAL_SPACE_REVIEWED_AT = "2026-10-07";
