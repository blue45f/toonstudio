import { translateBilingualPair } from "@/shared/lib/i18n-bilingual-copy";

/** 문서 수신 capability와 렌더러 지원을 합친다. 편집 권한을 부여하지 않는다. */
export function studioBg3dSixPassUnavailableReason(
  documentReason: string | null | undefined,
  rendererSupported: boolean,
): string | null {
  if (documentReason === "six-pass-unsupported-document-surface") {
    return translateBilingualPair("Bg3dSixPassSurface",
      "현재 원고의 공동·기기 탭 동기화 및 마스터 편집에서는 6패스 분리 출력을 지원하지 않습니다. 일반 LT로 전환하면 배경을 추가할 수 있습니다.",
      "Six-pass separated output is not supported by this document's collaborative, cross-tab, or master editing path. Switch to standard LT to add the background.");
  }
  if (documentReason) return documentReason;
  return rendererSupported ? null : translateBilingualPair("Bg3dSixPassRenderer",
    "현재 렌더러는 실제 6패스 분리 캡처를 지원하지 않습니다. Three.js WebGL 렌더러가 필요합니다.",
    "This renderer does not support six-pass capture. Select the Three.js WebGL renderer.");
}
