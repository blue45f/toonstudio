/**
 * 번역·대체 텍스트 도우미가 함께 쓰는 언어 목록. 다른 모듈을 가져오지 않는 잎 모듈이다.
 * assist-localize가 assist-alt-text를 다시 내보내므로, 이 목록이 assist-localize 안에 있으면 둘이 순환하고
 * assist-localize를 먼저 불러온 화면에서 assist-alt-text가 초기화되지 않은 목록을 읽어 깨진다.
 */
export const LOCALIZE_LANGUAGES = Object.freeze([
  { id: "ko", name: "한국어", english: "Korean" },
  { id: "en", name: "English", english: "English" },
  { id: "ja", name: "日本語", english: "Japanese" },
  { id: "zh-Hans", name: "简体中文", english: "Simplified Chinese" },
  { id: "zh-Hant", name: "繁體中文", english: "Traditional Chinese" },
  { id: "es", name: "Español", english: "Spanish" },
  { id: "fr", name: "Français", english: "French" },
  { id: "vi", name: "Tiếng Việt", english: "Vietnamese" },
  { id: "th", name: "ไทย", english: "Thai" },
  { id: "id", name: "Bahasa Indonesia", english: "Indonesian" },
] as const);
export type LocalizeLanguageId = (typeof LOCALIZE_LANGUAGES)[number]["id"];
