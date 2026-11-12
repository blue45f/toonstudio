import { formatI18nTemplate, translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";

/** 저장 안내 생산자가 명시한 기술 원인만 기본 안내와 분리한다. */
export const CREATOR_STORAGE_DETAIL_SEPARATOR = "\n\n[details] ";

export function creatorStorageText(ko: string, en: string, values?: Readonly<Record<string, string | number>>): string {
  const text = translateBilingualValueForActiveLocale("creator.deviceStorage", ko, en);
  return values ? formatI18nTemplate(text, values) : text;
}

export function creatorStorageDetail(message: string, cause: unknown): string {
  return `${message}${CREATOR_STORAGE_DETAIL_SEPARATOR}${cause instanceof Error ? cause.message : String(cause)}`;
}
