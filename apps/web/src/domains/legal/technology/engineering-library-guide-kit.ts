import type { LocalizedText } from "./engineering-story-content";

/** 라이브러리 해설 데이터 파일이 함께 쓰는 한국어·영어 쌍 만들기. */
export const t = (ko: string, en: string): LocalizedText => ({ ko, en });
