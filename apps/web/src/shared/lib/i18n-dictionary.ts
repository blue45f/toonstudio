import { builtinAppDictionaries } from "./i18n-built-in-dictionaries";
import { type Dict } from "./i18n-constants";
import { normalizeLocaleCode } from "./i18n-locale-list";

export type DictByLocale = Record<string, Dict>;

// 앱 셸에 정적으로 포함되는 유일한 두 사전. 나머지는 전부 지연 자산이다.
export const DICT: DictByLocale = {
  ko: { ...builtinAppDictionaries.ko },
  en: { ...builtinAppDictionaries.en },
};

export interface I18nRuntimeTranslationSource {
  readonly key: string;
  readonly locale: string;
}

const runtimeTranslationSources = new Map<string, string>(
  Object.keys(DICT.en).map((key) => [key, "en"] as const),
);

/**
 * Registers a route-owned dictionary without forcing its strings into the
 * application shell bundle. Route modules call this synchronously while their
 * lazy chunk is evaluated, so the first committed render already sees the
 * localized labels.
 */
export function registerI18nLocaleEntries(
  locale: string,
  entries: Readonly<Record<string, string>>,
): boolean {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return false;

  const target = DICT[normalized] ?? (DICT[normalized] = {});
  let changed = false;
  for (const [key, value] of Object.entries(entries)) {
    if (target[key] === value) continue;
    target[key] = value;
    changed = true;
  }
  return changed;
}

/** 사전을 등록하고 기계 번역의 원문으로도 올린다. 등록으로 값이 바뀌었으면 true. */
export function registerI18nRuntimeSourceEntries(
  locale: string,
  entries: Readonly<Record<string, string>>,
): boolean {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return false;
  const changed = registerI18nLocaleEntries(normalized, entries);
  for (const key of Object.keys(entries)) runtimeTranslationSources.set(key, normalized);
  return changed;
}

export function registerI18nEnglishSourceEntries(
  entries: Readonly<Record<string, string>>,
): boolean {
  return registerI18nRuntimeSourceEntries("en", entries);
}

export function getI18nRuntimeTranslationSources(): readonly I18nRuntimeTranslationSource[] {
  return [...runtimeTranslationSources].map(([key, locale]) => ({ key, locale }));
}

export function getI18nRuntimeTranslationSourceKeys(): readonly string[] {
  return [...runtimeTranslationSources.keys()];
}

const translationBundleListeners = new Set<() => void>();
const authoredDictionaryListeners = new Set<(normalizedLocale: string) => void>();

export function subscribeTranslationBundleUpdate(listener: () => void): () => void {
  translationBundleListeners.add(listener);
  return () => {
    translationBundleListeners.delete(listener);
  };
}

export function triggerTranslationBundleUpdate(): void {
  for (const listener of translationBundleListeners) listener();
}

export function subscribeAuthoredDictionaryLoaded(
  listener: (normalizedLocale: string) => void,
): () => void {
  authoredDictionaryListeners.add(listener);
  return () => {
    authoredDictionaryListeners.delete(listener);
  };
}

export function markAuthoredI18nDictionaryLoaded(locale: string): void {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return;
  for (const listener of authoredDictionaryListeners) listener(normalized);
}
