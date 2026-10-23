/**
 * creator 하위 잔여 패널의 실패·빈 상태 문구 사전 (A4 잔여 3라운드 c14).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (대응하는 r3c14 테스트가 패리티를 고정한다). 콘텐츠 본문·폼 라벨·
 * placeholder는 대상이 아니며 로딩·실패·빈 상태 문구만 다룬다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "creatorRest.status.sceneAssembly.aiFallback": "AI 구조화에 실패해 규칙 기반으로 초안을 만들었어요.",
  "creatorRest.status.sceneAssembly.createFailed": "장면 초안을 만들지 못했습니다.",
  "creatorRest.status.sceneAssembly.applyFailed": "초안을 올리지 못했습니다.",
  "creatorRest.status.sceneAssembly.noPlace": "문장에서 장소를 찾지 못했습니다. 단색 프레임으로 시작합니다.",
  "creatorRest.status.wizard.defaultsApplied": "비어 있던 항목에 기본값이 자동 적용됐어요. 나중에 전문 에디터에서 바꿀 수 있습니다.",
  "creatorRest.status.wizard.emptyDialogue": "지금은 비어 있어요. 다음으로 넘어가면 시작 대사가 기본값으로 자동 적용됩니다.",
  "creatorRest.status.finishing.previewFailed": "효과를 붙일 연결이 없어 미리보기를 만들지 못했습니다.",
  "creatorRest.status.finishing.applyFailed": "효과 적용에 실패했습니다. 그래프를 확인해 주세요.",
  "creatorRest.status.writingPolish.staleSuggestion": "원문이 바뀌어 이 제안을 적용할 수 없어요. 제안을 새로 받아 주세요.",
  "creatorRest.status.writingPolish.empty": "지금 글에서는 다듬을 곳을 찾지 못했어요. 잘 쓰인 글이에요.",
  "creatorRest.status.vectorLine.demoFailed": "데모 선 생성 실패",
  "creatorRest.status.lift3d.unsupported": "이 브라우저에서는 3D 미리보기를 열 수 없습니다. GLB 파일 저장은 그대로 사용할 수 있습니다.",
  "creatorRest.status.ltConvert.noCanvas": "이미지를 만들 캔버스가 없습니다.",
  "creatorRest.status.panelSource.rightsRequired": "원고 권리 확인 없이는 파일을 읽을 수 없어요.",
  "creatorRest.status.pdfMetadata.empty": "기록된 속성이 없어요.",
  "creatorRest.status.vectorStroke.empty": "스트로크가 없습니다. 먼저 벡터 레이어에 선을 그리세요.",
});

registerI18nLocaleEntries("en", {
  "creatorRest.status.sceneAssembly.aiFallback": "AI structuring failed, so a rule-based draft was created.",
  "creatorRest.status.sceneAssembly.createFailed": "Could not create the scene draft.",
  "creatorRest.status.sceneAssembly.applyFailed": "Could not place the draft.",
  "creatorRest.status.sceneAssembly.noPlace": "No place was found in the sentence. Starting with a solid frame.",
  "creatorRest.status.wizard.defaultsApplied": "Defaults were applied to empty fields. You can change them later in the pro editor.",
  "creatorRest.status.wizard.emptyDialogue": "It is empty for now. Moving on applies a default opening line.",
  "creatorRest.status.finishing.previewFailed": "No connection to attach the effect to, so no preview could be built.",
  "creatorRest.status.finishing.applyFailed": "Failed to apply the effect. Check the graph.",
  "creatorRest.status.writingPolish.staleSuggestion": "The source text changed, so this suggestion cannot be applied. Request new suggestions.",
  "creatorRest.status.writingPolish.empty": "Nothing to polish in this text. It is well written.",
  "creatorRest.status.vectorLine.demoFailed": "Failed to create the demo line",
  "creatorRest.status.lift3d.unsupported": "This browser cannot open the 3D preview. Saving the GLB file still works.",
  "creatorRest.status.ltConvert.noCanvas": "No canvas is available to create the image.",
  "creatorRest.status.panelSource.rightsRequired": "Files cannot be read without confirming manuscript rights.",
  "creatorRest.status.pdfMetadata.empty": "No recorded properties.",
  "creatorRest.status.vectorStroke.empty": "No strokes yet. Draw a line on the vector layer first.",
});

export function creatorRestStatusText(key: string, koFallback: string): string;
export function creatorRestStatusText(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function creatorRestStatusText(
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
