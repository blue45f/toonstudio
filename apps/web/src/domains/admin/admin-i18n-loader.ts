import { ADMIN_I18N_NAMESPACES } from "@/shared/lib/i18n-asset-manifest";
import {
  FALLBACK_CHAIN,
  getLang,
  getLocaleCandidates,
  markAuthoredI18nDictionaryLoaded,
  registerI18nEnglishSourceEntries,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
  useI18n,
} from "@/shared/lib/i18n";
import dictionaries from "./i18n/generated/i18n-admin-builtins.json";

export const adminI18nBuiltins = dictionaries;

export const paidOperationsI18n = {
  ko: {
    "admin.paidOperations.title": "유료 운영",
    "admin.paidOperations.desc":
      "어드민에서 이 스위치를 켠 경우에만 유료 서비스가 실행됩니다. 끈 상태에서는 유료 호출이 거부되고 무료 기능은 그대로 동작합니다.",
    "admin.paidOperations.enabled": "유료 운영 중",
    "admin.paidOperations.disabled": "유료 운영 중단",
    "admin.paidOperations.toggleOn": "유료 운영 켜기",
    "admin.paidOperations.toggleOff": "유료 운영 끄기",
    "admin.paidOperations.saving": "저장하는 중…",
    "admin.paidOperations.loadFailed": "유료 운영 상태를 불러오지 못했습니다. 잠시 후 다시 시도하세요.",
    "admin.paidOperations.saveFailed": "유료 운영 상태 저장에 실패했습니다. 잠시 후 다시 시도하세요.",
    "admin.paidOperations.retry": "다시 불러오기",
    "admin.paidOperations.freeNote": "무료 기능은 이 스위치와 무관하게 동작합니다.",
  },
  en: {
    "admin.paidOperations.title": "Paid operations",
    "admin.paidOperations.desc":
      "Paid services run only while this switch is on. While it is off, paid calls are rejected and free features keep working.",
    "admin.paidOperations.enabled": "Paid operations on",
    "admin.paidOperations.disabled": "Paid operations off",
    "admin.paidOperations.toggleOn": "Turn paid operations on",
    "admin.paidOperations.toggleOff": "Turn paid operations off",
    "admin.paidOperations.saving": "Saving…",
    "admin.paidOperations.loadFailed": "Could not load the paid operations status.",
    "admin.paidOperations.saveFailed": "Could not save the paid operations status.",
    "admin.paidOperations.retry": "Reload",
    "admin.paidOperations.freeNote": "Free features work regardless of this switch.",
  },
} as const;

registerI18nLocaleEntries("ko", adminI18nBuiltins.ko);
registerI18nEnglishSourceEntries(adminI18nBuiltins.en);

registerI18nLocaleEntries("ko", paidOperationsI18n.ko);
registerI18nLocaleEntries("en", paidOperationsI18n.en);
registerI18nEnglishSourceEntries(paidOperationsI18n.en);

registerI18nLocaleEntries("ko", {
  "adminRest.status.integrations.loadFailed": "연동 운영 상태를 불러오지 못했습니다.",
  "adminRest.status.webVitals.loading": "성능 실측 불러오는 중",
  "adminRest.status.webVitals.retry": "다시 불러오기",
});

registerI18nLocaleEntries("en", {
  "adminRest.status.integrations.loadFailed": "Could not load integration operations status.",
  "adminRest.status.webVitals.loading": "Loading performance measurements",
  "adminRest.status.webVitals.retry": "Reload",
});

export function adminRestStatusText(key: string, koFallback: string): string;
export function adminRestStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function adminRestStatusText(
  key: string,
  paramsOrFallback: Readonly<Record<string, string | number>> | string,
  koFallback?: string,
): string {
  const params = typeof paramsOrFallback === "string" ? undefined : paramsOrFallback;
  const fallback = typeof paramsOrFallback === "string" ? paramsOrFallback : koFallback ?? "";
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  if (!params) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(params, token) ? String(params[token]) : placeholder,
  );
}

const pendingLoads = new Map<string, Promise<void>>();

export function adminI18nAssetUrl(
  locale: string,
  baseUrl = import.meta.env.BASE_URL,
  namespace = "dashboard",
): string {
  const normBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normBaseUrl}i18n/admin/${namespace}/${locale}.json`;
}

export async function loadAdminI18nLocale(
  locale: string,
  baseUrl = import.meta.env.BASE_URL,
): Promise<void> {
  const candidates = getLocaleCandidates(locale);
  const normalized = candidates[0] || "en";
  const rootLocale = normalized.split("-")[0] || "en";
  if (rootLocale === "ko" || rootLocale === "en") return;

  const assetLocale = candidates.includes("zh-hant") ? "zh-hant" : rootLocale;
  const existing = pendingLoads.get(assetLocale);
  if (existing) return existing;

  const job = (async () => {
    const dictionaries = await Promise.all(ADMIN_I18N_NAMESPACES.map(async (namespace) => {
      try {
        const response = await fetch(adminI18nAssetUrl(assetLocale, baseUrl, namespace), {
          cache: "force-cache",
          credentials: "same-origin",
        });
        if (!response?.ok) return null;
        const dictionary = await response.clone().json();
        return dictionary && typeof dictionary === "object" && !Array.isArray(dictionary)
          ? dictionary as Record<string, string>
          : null;
      } catch {
        return null;
      }
    }));
    const merged: Record<string, string> = {};
    for (const dictionary of dictionaries) {
      if (dictionary) Object.assign(merged, dictionary);
    }
    if (Object.keys(merged).length > 0) {
      // 화면을 그린 뒤 도착한 사전이면 번역기 참조를 바꿔 기억해 둔 대체 문구를 다시 계산하게 한다.
      if (registerI18nLocaleEntries(assetLocale, merged)) markAuthoredI18nDictionaryLoaded(assetLocale);
      if (normalized !== assetLocale && registerI18nLocaleEntries(normalized, merged)) {
        markAuthoredI18nDictionaryLoaded(normalized);
      }
      useI18n.setState((state) => ({
        translationBundleRevision: state.translationBundleRevision + 1,
      }));
    }
  })().catch(() => {
    pendingLoads.delete(assetLocale);
  });

  pendingLoads.set(assetLocale, job);
  await job;
}
