import { collectManuscriptHexColors } from "./color-channels";

const sampleColors = [
  { nameKo: "슬레이트 네이비", oklch: "oklch(0.28 0.04 252)" },
  { nameKo: "앰버", oklch: "oklch(0.76 0.11 72)" },
  { nameKo: "코랄", oklch: "oklch(0.64 0.19 24)" },
] as const;

/** 원고에서 확인한 지정색과 수동 비교용 예시를 구분하는 로컬 배색 안내. */
export function buildLocalColorMood(inputText: string) {
  const colors = collectManuscriptHexColors(inputText);
  const palette = colors.slice(0, 8).map(({ hex, oklch }) => ({
    role: "원고 지정색", nameKo: hex, oklch,
    usageTip: "색상 선택기에 원본 HEX를 붙여 넣어 원고에서 지정한 곳에 사용하세요.",
  }));
  for (const sample of sampleColors.slice(0, Math.max(0, 3 - palette.length))) {
    palette.push({ ...sample, role: "예시 후보", usageTip: "원고에서 따로 지정한 색이 있으면 그 색을 우선하세요." });
  }
  let summary = colors.length ? `원고의 서로 다른 HEX ${colors.length}색을 확인했습니다.` : "원고에 HEX 지정색이 없어 비교용 예시 세 색을 제안합니다.";
  if (colors.length > 8) summary += " 입력 순서대로 처음 여덟 색을 표시합니다.";
  if (colors.length > 0 && colors.length < 3) summary += " 나머지는 비교용 예시입니다.";
  return {
    emotionLabel: colors.length ? "원고 지정색" : "예시 배색",
    moodSummary: summary,
    palette,
    lightingGuide: "기준색을 별도 견본으로 남긴 뒤 조명 레이어를 켜고 꺼서 밝기와 색 변화를 비교하세요.",
    contrastWarning: "대사 글자와 말풍선 바탕의 대비를 확인하세요. 반투명 색은 최종 배경 위에 합성한 뒤 측정하세요.",
  };
}
