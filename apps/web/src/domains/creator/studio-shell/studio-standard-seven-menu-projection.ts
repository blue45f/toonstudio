/** 원본 메뉴 카탈로그를 명령 손실 없이 7대 표준 메뉴로 투영하는 순수 변환. */
export type StudioStandardSevenMenuId =
  | "file"
  | "edit"
  | "canvas-layer"
  | "webtoon-lettering"
  | "3d-motion"
  | "collab-ai"
  | "view-help";

export interface StudioStandardSevenMenuGroupSpec {
  readonly id: StudioStandardSevenMenuId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly sourceGroupIds: readonly string[];
}

/**
 * PRODUCT.md 7대 표준 메뉴 프로젝션.
 * V5 §15.3 18개 원본 카탈로그 그룹(17 규격 + AI)을 손실·중복 없이
 * 7개 표준 창작 메뉴로 분할 투영한다(Three Doors One Command).
 */
export const STUDIO_STANDARD_SEVEN_MENU_GROUPS: readonly StudioStandardSevenMenuGroupSpec[] = Object.freeze([
  Object.freeze({
    id: "file",
    labelKo: "파일",
    labelEn: "File",
    sourceGroupIds: Object.freeze(["file"]),
  }),
  Object.freeze({
    id: "edit",
    labelKo: "편집",
    labelEn: "Edit",
    sourceGroupIds: Object.freeze(["edit", "select", "transform"]),
  }),
  Object.freeze({
    id: "canvas-layer",
    labelKo: "캔버스/레이어",
    labelEn: "Canvas & Layer",
    sourceGroupIds: Object.freeze(["canvas", "layer", "brush", "filter"]),
  }),
  Object.freeze({
    id: "webtoon-lettering",
    labelKo: "웹툰/식자",
    labelEn: "Webtoon & Text",
    sourceGroupIds: Object.freeze(["comic", "text", "vector"]),
  }),
  Object.freeze({
    id: "3d-motion",
    labelKo: "3D/모션",
    labelEn: "3D & Motion",
    sourceGroupIds: Object.freeze(["3d", "animation"]),
  }),
  Object.freeze({
    id: "collab-ai",
    labelKo: "협업/AI",
    labelEn: "Collab & AI",
    sourceGroupIds: Object.freeze(["collaboration", "ai"]),
  }),
  Object.freeze({
    id: "view-help",
    labelKo: "보기/도움말",
    labelEn: "View & Help",
    sourceGroupIds: Object.freeze(["view", "window", "help"]),
  }),
]);

const SOURCE_TO_STANDARD_SEVEN_MENU = new Map<string, StudioStandardSevenMenuId>(
  STUDIO_STANDARD_SEVEN_MENU_GROUPS.flatMap((spec) =>
    spec.sourceGroupIds.map((sourceId) => [sourceId, spec.id] as const),
  ),
);

/** 원본 §15.3 그룹 ID가 귀속되는 7대 표준 메뉴 ID를 반환한다. */
export function studioStandardSevenMenuGroupFor(
  sourceGroupId: string,
): StudioStandardSevenMenuId | null {
  return SOURCE_TO_STANDARD_SEVEN_MENU.get(sourceGroupId) ?? null;
}

export interface StudioStandardSevenProjectableItem {
  readonly id: string;
  readonly sectionLabel?: string;
  readonly separatorAfter?: boolean;
  readonly sourceGroupId?: string;
}

export interface StudioStandardSevenProjectableGroup<
  TItem extends StudioStandardSevenProjectableItem = StudioStandardSevenProjectableItem,
> {
  readonly id: string;
  readonly label: string;
  readonly items: readonly TItem[];
}

export interface ProjectStudioMainMenuToSevenOptions {
  readonly lang?: "ko" | "en";
  readonly includeEmpty?: boolean;
}

/**
 * 18개 카탈로그 그룹을 명령 ID·실행 핸들러 손실 없이 7대 표준 메뉴로 투영한다.
 * 알 수 없는 신규 그룹도 `view-help`의 도움말 앞에 흡수해 명령이 사라지지 않게 보호한다.
 */
export function projectStudioMainMenuToSevenStandardGroups<
  TItem extends StudioStandardSevenProjectableItem,
  TGroup extends StudioStandardSevenProjectableGroup<TItem>,
>(
  groups: readonly TGroup[],
  options: ProjectStudioMainMenuToSevenOptions = {},
): readonly TGroup[] {
  const detectedLang: "ko" | "en" =
    options.lang
    ?? (groups.find((group) => group.id === "file")?.label === "File" ? "en" : "ko");
  const byId = new Map<string, TGroup>(groups.map((group) => [group.id, group] as const));
  const unknownGroups = groups.filter(
    (group) => !SOURCE_TO_STANDARD_SEVEN_MENU.has(group.id) && group.items.length > 0,
  );
  const projected: TGroup[] = [];

  for (const spec of STUDIO_STANDARD_SEVEN_MENU_GROUPS) {
    const sources: TGroup[] = [];
    for (const sourceId of spec.sourceGroupIds) {
      if (spec.id === "view-help" && sourceId === "help" && unknownGroups.length > 0) {
        sources.push(...unknownGroups);
      }
      const match = byId.get(sourceId);
      if (match && match.items.length > 0) {
        sources.push(match);
      }
    }
    if (sources.length === 0) {
      if (options.includeEmpty) {
        projected.push({
          id: spec.id,
          label: detectedLang === "en" ? spec.labelEn : spec.labelKo,
          items: [],
        } as unknown as TGroup);
      }
      continue;
    }

    const multiSource = sources.length > 1;
    const mergedItems: TItem[] = [];
    sources.forEach((source, sourceIndex) => {
      const isLastSource = sourceIndex === sources.length - 1;
      source.items.forEach((item, itemIndex) => {
        const isFirstItem = itemIndex === 0;
        const isLastItem = itemIndex === source.items.length - 1;
        mergedItems.push({
          ...item,
          sourceGroupId: item.sourceGroupId ?? source.id,
          ...(isFirstItem && multiSource && !item.sectionLabel
            ? { sectionLabel: source.label }
            : {}),
          separatorAfter: isLastItem ? !isLastSource : Boolean(item.separatorAfter),
        });
      });
    });

    const template = sources[0];
    if (!template) continue;
    projected.push({
      ...template,
      id: spec.id,
      label: detectedLang === "en" ? spec.labelEn : spec.labelKo,
      items: mergedItems,
    });
  }

  return projected;
}
