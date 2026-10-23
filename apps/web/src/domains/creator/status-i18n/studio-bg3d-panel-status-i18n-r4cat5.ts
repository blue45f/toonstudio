/**
 * bg3d 패널 상태 문구 사전 후속분 (A4 4라운드 cat5 재판정 이관).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (studio-status-i18n-r4cat5.test.ts가 패리티를 고정한다).
 * studio-bg3d-panel-status-i18n.ts(배치 3)를 확장하지 않고 형제 모듈로
 * 나눈 근거: 배치 3 테스트가 그 모듈의 등록 키 개수를 정확히 단언한다.
 * 네임스페이스는 studio.bg3dPanelStatusCat5.*로 분리한다: 소비 파일이
 * 배치 3 테스트의 dangling 검사 대상이라, 같은 접두를 쓰면 형제 모듈
 * 키가 미등록 참조로 잡힌다 (실측으로 확인한 제약).
 *
 * 대상은 4라운드 cat5 재판정에서 상태 문구로 확정된 1건이다:
 * StudioReferenceRebuildPresets의 전달 완료 안내 — 같은 파일의 실패
 * 문구와 같은 setMessage 상태 채널로 표시되는 완료 상태 문구라,
 * 배치 3의 "완료 안내는 상태가 아니다" 판정을 재판정으로 뒤집었다.
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.bg3dPanelStatusCat5.referenceRebuild.delivered": "기존 가져오기 경로로 전달했습니다. 안전 검사와 저장 결과는 모델 목록에서 확인하세요.",
});

registerI18nLocaleEntries("en", {
  "studio.bg3dPanelStatusCat5.referenceRebuild.delivered": "Handed off through the existing import path. Check the safety validation and save results in the model list.",
});

export function bg3dPanelStatusCat5Text(key: string, koFallback: string): string;
export function bg3dPanelStatusCat5Text(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function bg3dPanelStatusCat5Text(
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
