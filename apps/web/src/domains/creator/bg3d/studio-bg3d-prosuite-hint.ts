import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 실제 장면에 연결된 프로 툴의 현재 세 단계를 안내한다. */
export function useStudioBg3dProSuiteHint() {
  const t = useBilingual("scene3d-specialists");
  return {
    id: "bg3d:viewport:prosuite",
    title: t("웹툰 컷 제작", "Webtoon shot production"),
    description: t(
      "구도와 선화를 조절하고, 컷 디렉터에서 장면을 저장한 뒤, 원고 출력에서 PNG·PSD·ZIP을 만듭니다.",
      "Adjust composition and line art, save scenes in the shot director, then export PNG, PSD and ZIP manuscripts.",
    ),
    preview: "camera-orbit" as const,
  };
}
