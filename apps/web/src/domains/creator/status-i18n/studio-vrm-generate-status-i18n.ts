/**
 * 조형 패널 "새 VRM 캐릭터" 구역(표정 편집·헤어 흔들림·아바타 정보) 상태 문구 사전.
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. 화면은 `vrmGenerateStatusText(키, …, 한국어 폴백)`
 * 으로 부르므로 키가 없거나 로케일이 비어도 한국어 폴백이 그대로 보인다(studio-frozen5-status-i18n 와
 * 같은 패턴). ko 값은 폴백과 글자 단위로 같고 en 은 신규 번역이며, 두 로케일의 키 집합은 항상 같다
 * (studio-vrm-generate-status-i18n.test.ts 가 고정한다).
 *
 * 차단·실패·빈 상태·완료 안내와 저장 상태만 다룬다. 폼 라벨·본문·표정·흔들림 이름은 주변 조형 패널과
 * 같이 대상이 아니다. 내보내기 검증 사유는 studio-vrm-export-error 의 고정 한글 어휘를 그대로 쓴다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.vrmGenerateStatus.generated": "{name} VRM을 만들었습니다. 라이브러리에 넣고 뷰포트에서 미리볼 수 있어요.",
  "studio.vrmGenerateStatus.metaInvalid": "아바타 정보에 고칠 항목이 {count}개 있어요. 위 폼에서 표시된 칸을 채워 주세요.",
  "studio.vrmGenerateStatus.thumbnailMissing": "썸네일로 쓸 이미지를 아직 고르지 않았어요. 이미지를 고르거나 자동·넣지 않음을 골라 주세요.",
  "studio.vrmGenerateStatus.thumbnailUnreadable": "이미지를 읽지 못했어요. 다른 PNG·JPEG 이미지를 골라 주세요.",
  "studio.vrmGenerateStatus.thumbnailSquareFailed": "정사각형으로 자르지 못했어요. 정사각형 이미지를 골라 주세요.",
  "studio.vrmGenerateStatus.profileMemoryOnly": "이 기기의 저장소(SQLite/OPFS)를 쓸 수 없어 제작자 정보를 이번 화면에서만 유지해요.",
  "studio.vrmGenerateStatus.profileDefaults": "폼을 쓰지 않으면 기본 정보(제작: ToonStudio, 제작자 전용)로 내보냅니다.",
  "studio.vrmGenerateStatus.profileRemembered": "이 기기에 기억해 둔 제작자 정보와 이용 조건을 쓰고 있어요.",
  "studio.vrmGenerateStatus.profileWillRemember": "VRM 을 만들면 제작자 정보와 이용 조건을 이 기기에 기억해 다음 캐릭터에도 씁니다.",
  "studio.vrmGenerateStatus.profileNotRemembered": "제작자 정보를 이 기기에 기억하지 않아요. 이번에 만드는 VRM 에만 들어갑니다.",
  "studio.vrmGenerateStatus.hairSwayNoHair": "흔들릴 헤어가 없어요. 헤어 탭에서 실루엣을 고르면 흔들림을 조율할 수 있습니다.",
  "studio.vrmGenerateStatus.hairSwayNoChains": "이 헤어에는 흔들리는 가닥이 없어요. 더 긴 실루엣을 고르면 흔들림을 조율할 수 있습니다.",
  "studio.vrmGenerateStatus.customExpressionLimit": "커스텀 표정은 {max}개까지 둘 수 있어요.",
});

registerI18nLocaleEntries("en", {
  "studio.vrmGenerateStatus.generated": "Created the {name} VRM. Add it to the library and preview it in the viewport.",
  "studio.vrmGenerateStatus.metaInvalid": "The avatar info has {count} item(s) to fix. Fill in the highlighted fields in the form above.",
  "studio.vrmGenerateStatus.thumbnailMissing": "No thumbnail image has been picked yet. Pick an image, or choose automatic or none.",
  "studio.vrmGenerateStatus.thumbnailUnreadable": "Could not read the image. Pick a different PNG or JPEG image.",
  "studio.vrmGenerateStatus.thumbnailSquareFailed": "Could not crop the image to a square. Pick a square image.",
  "studio.vrmGenerateStatus.profileMemoryOnly": "This device's storage (SQLite/OPFS) is unavailable, so the author info is kept on this screen only.",
  "studio.vrmGenerateStatus.profileDefaults": "If you leave the form untouched, the VRM is exported with the default info (made with ToonStudio, author only).",
  "studio.vrmGenerateStatus.profileRemembered": "Using the author info and usage terms remembered on this device.",
  "studio.vrmGenerateStatus.profileWillRemember": "Creating the VRM remembers your author info and usage terms on this device for your next character.",
  "studio.vrmGenerateStatus.profileNotRemembered": "The author info is not remembered on this device. It only goes into the VRM you create now.",
  "studio.vrmGenerateStatus.hairSwayNoHair": "There is no hair to sway. Pick a silhouette in the Hair tab to tune the sway.",
  "studio.vrmGenerateStatus.hairSwayNoChains": "This hairstyle has no swaying strands. Pick a longer silhouette to tune the sway.",
  "studio.vrmGenerateStatus.customExpressionLimit": "You can keep up to {max} custom expressions.",
});

/** 현재 로케일로 상태 문구를 푼다. 키가 없으면 한국어 폴백을 쓰고 `{이름}` 자리표시를 채운다. */
export function vrmGenerateStatusText(key: string, koFallback: string): string;
export function vrmGenerateStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function vrmGenerateStatusText(
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
