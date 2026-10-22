/**
 * creator 루트 패널 로딩·실패·빈 상태 문구 사전 (A4 잔여 4라운드, GUARDED 제외 5파일).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. 소비 파일은
 * `panelStatusTextR4(key, fallback)`(비컴포넌트 생산자·다중 컴포넌트 파일용
 * 생산 시점 해석 헬퍼, studio-panel-status-i18n-r3c06의 panelStatusText
 * 선례와 동일 형태)로 호출한다.
 * studio-panel-status-i18n-r3c06.ts를 확장하지 않고 형제 모듈로 나눈
 * 근거: 그 모듈의 테스트(studio-status-i18n-r3c06.test.ts)가 등록 키
 * 개수를 정확히 단언해, 키 6개를 같은 블록에 넣으면 기존 계약이 깨진다.
 * 네임스페이스는 기존 studio.panelStatus.*를 그대로 잇는다.
 * 대상 표면: 3라운드 c06에서 잔여 6건으로 문서화됐던 5파일
 * (StudioAssetRightsManifestPanel·StudioFinishQualityView·
 * StudioLocalAssetManager·StudioLocalizationQaReport·
 * StudioProductionInsightsPanel).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.panelStatus.assetRights.blockingError": "차단 오류",
  "studio.panelStatus.finishQuality.needsWorkDescription": "오류 위치로 이동해 원고와 검토 상태를 정리하세요.",
  "studio.panelStatus.finishQuality.severityError": "오류",
  "studio.panelStatus.localAssets.libraryGuide": "현재 기기의 이미지 보관함입니다. 삭제에 실패한 원본은 목록에 유지합니다. 3D 렌더 이미지는 평면 이미지이며 3D 모델 원본과 별개입니다.",
  "studio.panelStatus.localizationQa.criticalErrorFailReason": "치명 오류가 있으면 점수와 무관하게 미달입니다.",
  "studio.panelStatus.productionInsights.severityError": "오류",
});

registerI18nLocaleEntries("en", {
  "studio.panelStatus.assetRights.blockingError": "Blocking errors",
  "studio.panelStatus.finishQuality.needsWorkDescription": "Go to the error locations and tidy up the manuscript and review status.",
  "studio.panelStatus.finishQuality.severityError": "Error",
  "studio.panelStatus.localAssets.libraryGuide": "This is the image library on this device. Originals that failed to delete stay in the list. 3D render images are flat images, separate from the original 3D models.",
  "studio.panelStatus.localizationQa.criticalErrorFailReason": "If there is a critical error, it fails regardless of the score.",
  "studio.panelStatus.productionInsights.severityError": "Error",
});

/**
 * 비컴포넌트 생산자용 생산 시점 로케일 해석 헬퍼 (studio-panel-status-i18n-r3c06의
 * `panelStatusText` 선례와 동일 형태). 키가 사전에 없으면 koFallback을 그대로
 * 돌려준다. `{token}` 보간은 useT 리졸버와 같은 규약으로 한 번만 치환한다.
 */
export function panelStatusTextR4(key: string, koFallback: string): string;
export function panelStatusTextR4(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function panelStatusTextR4(
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
