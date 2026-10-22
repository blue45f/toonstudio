/**
 * creator 잔여 상태 문구 사전 (A4 5라운드 cat1 잔여 후속).
 *
 * 기존 등록 모듈은 키 개수 단언 테스트가 있어 확장하지 않고 형제 모듈로
 * 신설한다. `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은
 * 이관 전 원문 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상
 * 일치해야 한다 (r5-cat1-status-i18n.test.ts가 패리티를 고정한다).
 *
 * 소비 파일은 모듈을 직접 import하고 생산 시점에 현재 로케일로 해석하는
 * `r5CreatorStatusText(key, koFallback)` 형태로 호출한다 (r4 패턴 준용).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "r5cat1.creator.aiComicDirector.qualityFailed": "후보 품질을 분석하지 못했습니다.",
  "r5cat1.creator.aiComicDirector.layerSplitFailed": "레이어를 분리하지 못했습니다.",
  "r5cat1.creator.localizationQa.unscorable": "채점 불가",
  "r5cat1.creator.localizationQa.emptyCues": "검사할 대사가 없어 점수를 낼 수 없습니다.",
  "r5cat1.creator.publication.noBlockingIssues": "공개를 막는 문제가 없습니다. 최종 미리보기에서 독자 화면을 확인하세요.",
  "r5cat1.creator.revisionCompare.noChangeOnRestore": "복원해도 서버와 편집 내용은 달라지지 않습니다.",
  "r5cat1.creator.pathBoolean.fastIdleStatus": "곡선을 다각형으로 근사해 즉시 결합합니다. 구멍·분리 영역도 결과에 그대로 남습니다. 기본 결합이 실패해도 이 경로가 자동으로 실행되지는 않습니다.",
  "r5cat1.creator.browserTransfer.localOnlyNotice": "로컬·새 원고는 주소만으로 다른 브라우저에 옮길 수 없습니다. 기본 편집기에서 프로젝트 파일로 내보낸 뒤 다른 브라우저에서 가져와 주세요.",
  "r5cat1.creator.deliveryHub.offlineGate": "현재 화면 링크는 복사할 수 있지만, 연결이 복구되어 서버 권한을 다시 읽기 전에는 외부 공유와 공식 전달을 실행하지 않습니다.",
  "r5cat1.creator.bg3dLt.noDepthCaptured": "깊이 정보가 있을 때만 적용돼요. 지금은 깊이를 캡처하지 않아 효과가 없어요. ‘깊이선 검출’이나 ‘내부선 억제’를 켜면 함께 캡처해요.",
  "r5cat1.creator.bg3dTexturePaint.clearedNotice": "표면 그림을 모두 지웠습니다. 실행 취소로 되돌릴 수 없습니다.",
  "r5cat1.creator.brushProgram.noSamePreset": " — 같은 기본 프리셋은 없습니다",
  "r5cat1.creator.brushV6.notAppliedToCurrentStroke": "현재 획에는 적용되지 않습니다. 가져온 설정은 보관합니다.",
  "r5cat1.creator.plausibility.exampleSeedHint": "지금 설정은 처음 보여 드린 예시라서, 새로 시작해도 잃을 내 작업이 없어요.",
});

registerI18nLocaleEntries("en", {
  "r5cat1.creator.aiComicDirector.qualityFailed": "Could not analyze the candidate quality.",
  "r5cat1.creator.aiComicDirector.layerSplitFailed": "Could not split the layers.",
  "r5cat1.creator.localizationQa.unscorable": "Cannot be scored",
  "r5cat1.creator.localizationQa.emptyCues": "There are no lines to check, so no score can be given.",
  "r5cat1.creator.publication.noBlockingIssues": "There are no issues blocking publication. Check the reader view in the final preview.",
  "r5cat1.creator.revisionCompare.noChangeOnRestore": "Restoring will not change the server or editing content.",
  "r5cat1.creator.pathBoolean.fastIdleStatus": "Curves are approximated as polygons and merged immediately. Holes and separate regions stay in the result. This path does not run automatically even if the basic merge fails.",
  "r5cat1.creator.browserTransfer.localOnlyNotice": "Local or new manuscripts cannot be moved to another browser by address alone. Export a project file from the basic editor, then import it in the other browser.",
  "r5cat1.creator.deliveryHub.offlineGate": "You can copy the current screen link, but external sharing and official delivery stay off until the connection is restored and server permissions are read again.",
  "r5cat1.creator.bg3dLt.noDepthCaptured": "This applies only when depth information exists. No depth is captured right now, so it has no effect. Turn on depth line detection or inner line suppression to capture it together.",
  "r5cat1.creator.bg3dTexturePaint.clearedNotice": "All surface painting was cleared. This cannot be undone.",
  "r5cat1.creator.brushProgram.noSamePreset": " — there is no matching base preset",
  "r5cat1.creator.brushV6.notAppliedToCurrentStroke": "It does not apply to the current stroke. The imported settings are kept.",
  "r5cat1.creator.plausibility.exampleSeedHint": "The current settings are the example shown at the start, so starting over loses none of your work.",
});

/** 비훅 생산자·렌더 시점용 상태 문구 리졸버 — r4 헬퍼와 같은 계약. */
export function r5CreatorStatusText(key: string, koFallback: string): string;
export function r5CreatorStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function r5CreatorStatusText(
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
