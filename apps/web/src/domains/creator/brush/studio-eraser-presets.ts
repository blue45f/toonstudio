/** 프리셋 굵기는 원고 픽셀, 농도는 한 번의 획이 걷어내는 최대 비율이다. */
export const STUDIO_ERASER_PRESETS = [
  { id: "standard-eraser", name: "일반 지우개", defaultWidth: 20, defaultOpacity: 1,
    en: { name: "Standard Eraser", description: "Remove the ink in one pass.", previewLabel: "The line before and after one full erase." },
    description: "한 번에 완전히 지워요", previewLabel: "지우기 전 선과 한 번 지운 뒤 빈 띠",
    searchAliases: ["기본 지우개", "완전 지우개", "standard eraser", "hard eraser"] },
  { id: "kneaded-eraser", name: "떡지우개", defaultWidth: 26, defaultOpacity: 0.38,
    en: { name: "Kneaded Eraser", description: "Lift 38% of the ink per stroke.", previewLabel: "The line keeps 62% of its original opacity." },
    description: "한 번에 38%만 걷어내요", previewLabel: "지우기 전 선과 한 번 지운 뒤 원래 농도의 62%가 남은 선",
    defaultColor: "#b7ada0", searchAliases: ["떡지우개(저농도)", "말랑 지우개", "찰흙 지우개", "kneaded eraser", "putty eraser"] },
  { id: "precision-eraser", name: "정밀 지우개", defaultWidth: 4, defaultOpacity: 1,
    en: { name: "Precision Eraser", description: "Trim line ends with a 4px round tip.", previewLabel: "A narrow gap in the middle of the line." },
    description: "4px 원형 팁으로 선 끝을 다듬어요", previewLabel: "선의 좁은 가운데만 지운 모양",
    searchAliases: ["가는 지우개", "세부 지우개", "precision eraser"] },
  { id: "broad-eraser", name: "넓은 면 지우개", defaultWidth: 72, defaultOpacity: 1,
    en: { name: "Broad Eraser", description: "Clear large areas with a 72px round tip.", previewLabel: "A broad gap in the middle of the line." },
    description: "72px 원형 팁으로 넓게 비워요", previewLabel: "선의 넓은 가운데를 지운 모양",
    searchAliases: ["넓은 지우개", "큰 지우개", "broad eraser"] },
  { id: "lift-eraser", name: "옅게 지우개", defaultWidth: 36, defaultOpacity: 0.16,
    en: { name: "Lifting Eraser", description: "Lift 16% per stroke to lighten shading.", previewLabel: "The line keeps 84% of its original opacity." },
    description: "한 획에 16%씩 명암을 덜어요", previewLabel: "원래 농도의 84%가 남은 선",
    searchAliases: ["명암", "옅은 지우개", "연하게 지우기", "lifting eraser"] },
] as const;

export type StudioEraserPresetId = (typeof STUDIO_ERASER_PRESETS)[number]["id"];

export function studioQuickEraserId(brushId: string): StudioEraserPresetId {
  return STUDIO_ERASER_PRESETS.find(preset => preset.id === brushId)?.id ?? "standard-eraser";
}

/** 정식 이름만 현지화해 사용자가 저장한 브러시 이름은 보존한다. */
export function studioEraserDisplayName(id: string | undefined, name: string | undefined, bt: (ko: string, en: string) => string) {
  const preset = STUDIO_ERASER_PRESETS.find(item => item.id === id);
  if (!preset || !name || (name !== preset.name && !(preset.id === "kneaded-eraser" && name === "연한 떡지우개"))) return name;
  return bt(name, preset.en.name);
}
