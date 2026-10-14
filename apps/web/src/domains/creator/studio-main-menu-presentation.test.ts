import { describe, expect, it } from "vitest";

import {
  STUDIO_MAIN_MENU_ACTION_ORDER,
  STUDIO_MAIN_MENU_ADVANCED_COMPOSITE_SOURCES,
  STUDIO_MAIN_MENU_COMPOSITE_GROUPS,
  STUDIO_MAIN_MENU_PRESENTATION_ORDER,
  STUDIO_MAIN_MENU_SPECIALIST_GROUP_IDS,
  createStudioMainMenuPresentation,
  insertStudioMainMenuAdvancedSectionFoldRows,
  isStudioMainMenuAdvancedCompositeSource,
  studioMainMenuPresentedTitleFor,
  type StudioMainMenuPresentableGroup,
  type StudioMainMenuPresentableItem,
} from "./studio-main-menu-presentation";

const CATALOGUE_IDS = [
  "file",
  "edit",
  "view",
  "canvas",
  "layer",
  "select",
  "transform",
  "brush",
  "filter",
  "vector",
  "text",
  "comic",
  "animation",
  "3d",
  "collaboration",
  "window",
  "ai",
  "help",
] as const;

const KO_LABELS: Record<string, string> = {
  file: "파일",
  edit: "편집",
  view: "보기",
  canvas: "캔버스",
  layer: "레이어",
  select: "선택",
  transform: "변형",
  brush: "그리기",
  filter: "필터",
  vector: "벡터",
  text: "텍스트",
  comic: "만화",
  animation: "애니메이션",
  "3d": "3D",
  collaboration: "협업",
  window: "창",
  ai: "AI",
  help: "도움말",
};

function catalogue(
  rowsPerGroup = 2,
  labels: Record<string, string> = KO_LABELS,
): StudioMainMenuPresentableGroup[] {
  return CATALOGUE_IDS.map((id): StudioMainMenuPresentableGroup => ({
    id,
    label: labels[id] ?? id,
    items: Array.from({ length: rowsPerGroup }, (_, index) => ({
      id: `${id}-command-${index}`,
    })),
  }));
}

describe("createStudioMainMenuPresentation", () => {
  it("presents nine primary workflow titles and detaches AI beside completion actions", () => {
    const presentation = createStudioMainMenuPresentation(catalogue());

    expect(presentation.presentedGroupIds).toEqual([...STUDIO_MAIN_MENU_PRESENTATION_ORDER]);
    expect(presentation.presentedGroupIds).toHaveLength(9);
    expect(presentation.presentedGroupIds).not.toContain("ai");
    expect(presentation.presentedGroupIds.at(-1)).toBe("help");
    expect(presentation.presentedActionGroupIds).toEqual([...STUDIO_MAIN_MENU_ACTION_ORDER]);
    expect(presentation.actionGroups[0]?.label).toBe("AI 도우미");
    // No density mode wired: the beginner-safe default draws the specialist
    // boundary before 효과 (filter), the specialist-only title.
    expect(presentation.specialistBoundaryGroupId).toBe("filter");
  });

  it("draws the specialist boundary in beginner modes and lifts it in full mode", () => {
    expect([...STUDIO_MAIN_MENU_SPECIALIST_GROUP_IDS]).toEqual(["filter"]);
    expect(
      createStudioMainMenuPresentation(catalogue(), { densityMode: "simple" })
        .specialistBoundaryGroupId,
    ).toBe("filter");
    expect(
      createStudioMainMenuPresentation(catalogue(), { densityMode: "focus" })
        .specialistBoundaryGroupId,
    ).toBe("filter");
    // full is the explicit all-tools choice: one undivided professional lane.
    expect(
      createStudioMainMenuPresentation(catalogue(), { densityMode: "full" })
        .specialistBoundaryGroupId,
    ).toBeNull();

    // A catalogue without the specialist group yields no boundary in any mode.
    const noFilter = catalogue().filter((group) => group.id !== "filter");
    expect(
      createStudioMainMenuPresentation(noFilter, { densityMode: "simple" })
        .specialistBoundaryGroupId,
    ).toBeNull();
    expect(
      createStudioMainMenuPresentation(noFilter).presentedGroupIds,
    ).not.toContain("filter");
  });

  it("folds related catalogue groups without dropping or reordering commands", () => {
    const groups = catalogue(3);
    const presentation = createStudioMainMenuPresentation(groups);

    expect(presentation.compositeSources).toEqual({
      file: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.file],
      edit: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.edit],
      view: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.view],
      insert: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.insert],
      create: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.create],
      filter: [...STUDIO_MAIN_MENU_COMPOSITE_GROUPS.filter],
    });

    for (const [title, sources] of Object.entries(STUDIO_MAIN_MENU_COMPOSITE_GROUPS)) {
      const presented = presentation.groups.find((group) => group.id === title);
      const expectedIds = sources.flatMap((sourceId) =>
        groups.find((group) => group.id === sourceId)!.items.map((item) => item.id),
      );
      expect(presented?.items.map((item) => item.id)).toEqual(expectedIds);
    }

    for (const sourceId of [
      "collaboration",
      "select",
      "transform",
      "window",
      "text",
      "vector",
      "3d",
      "brush",
      "comic",
      "animation",
    ]) {
      expect(presentation.presentedGroupIds).not.toContain(sourceId);
    }
  });

  it("captions every source section and draws one rule between adjacent sections", () => {
    const presentation = createStudioMainMenuPresentation(catalogue(2));
    const create = presentation.groups.find((group) => group.id === "create")!;

    expect(
      create.items.map((item) => item.sectionLabel).filter((label) => label !== undefined),
    ).toEqual(["그리기", "만화", "애니메이션"]);
    expect(create.items.map((item) => Boolean(item.separatorAfter))).toEqual([
      false,
      true,
      false,
      true,
      false,
      false,
    ]);
  });

  it("uses workflow labels in Korean and English while honouring explicit overrides", () => {
    const korean = createStudioMainMenuPresentation(catalogue(1));
    expect(korean.groups.find((group) => group.id === "insert")?.label).toBe("삽입");
    expect(korean.groups.find((group) => group.id === "create")?.label).toBe("창작");
    expect(korean.groups.find((group) => group.id === "filter")?.label).toBe("효과");
    expect(korean.actionGroups.find((group) => group.id === "ai")?.label).toBe("AI 도우미");

    const english = createStudioMainMenuPresentation(
      catalogue(1, {
        file: "File",
        edit: "Edit",
        view: "View",
        brush: "Brush",
        comic: "Comic",
        animation: "Animation",
        filter: "Filters",
        ai: "AI",
        help: "Help",
      }),
    );
    expect(english.groups.find((group) => group.id === "file")?.label).toBe("File");
    expect(english.groups.find((group) => group.id === "insert")?.label).toBe("Insert");
    expect(english.groups.find((group) => group.id === "create")?.label).toBe("Create");
    expect(english.groups.find((group) => group.id === "filter")?.label).toBe("Effects");
    expect(english.actionGroups.find((group) => group.id === "ai")?.label).toBe("AI Assist");

    const overridden = createStudioMainMenuPresentation(catalogue(1), {
      labels: { insert: "挿入", create: "制作", filter: "効果", ai: "AI 補助" },
    });
    expect(overridden.groups.find((group) => group.id === "insert")?.label).toBe("挿入");
    expect(overridden.groups.find((group) => group.id === "create")?.label).toBe("制作");
    expect(overridden.groups.find((group) => group.id === "filter")?.label).toBe("効果");
    expect(overridden.actionGroups.find((group) => group.id === "ai")?.label).toBe("AI 補助");
  });

  it("stamps composite rows with their canonical source group for tier consumers", () => {
    const presentation = createStudioMainMenuPresentation(catalogue(2));
    const create = presentation.groups.find((group) => group.id === "create")!;
    expect(create.items.map((item) => item.sourceGroupId)).toEqual([
      "brush",
      "brush",
      "comic",
      "comic",
      "animation",
      "animation",
    ]);
    // Standalone groups are not composites: their rows stay unstamped and
    // consumers fall back to the presented group id.
    const help = presentation.groups.find((group) => group.id === "help")!;
    expect(help.items.every((item) => item.sourceGroupId === undefined)).toBe(true);
  });

  it("keeps unknown future groups in source order immediately before Help", () => {
    const groups: StudioMainMenuPresentableGroup[] = [
      { id: "layer", label: "레이어", items: [{ id: "layer" }] },
      { id: "future-a", label: "A", items: [{ id: "a" }] },
      { id: "ai", label: "AI", items: [{ id: "assist" }] },
      { id: "future-b", label: "B", items: [{ id: "b" }] },
      { id: "help", label: "도움말", items: [{ id: "h" }] },
    ];

    const presentation = createStudioMainMenuPresentation(groups);
    expect(presentation.presentedGroupIds).toEqual([
      "layer",
      "future-a",
      "future-b",
      "help",
    ]);
    expect(presentation.presentedActionGroupIds).toEqual(["ai"]);
  });

  it("passes standalone primary groups through and leaves catalogue actions immutable", () => {
    const groups = catalogue(2);
    const presentation = createStudioMainMenuPresentation(groups);

    for (const id of ["canvas", "layer", "help"]) {
      const source = groups.find((group) => group.id === id);
      const presented = presentation.groups.find((group) => group.id === id);
      expect(presented).toBe(source);
      expect(presented?.items).toBe(source?.items);
    }

    const aiSource = groups.find((group) => group.id === "ai")!;
    const aiAction = presentation.actionGroups.find((group) => group.id === "ai")!;
    expect(aiAction).not.toBe(aiSource);
    expect(aiAction.items).toBe(aiSource.items);
    expect(aiSource.label).toBe("AI");
  });

  it("omits workflow composites and actions whose source groups are absent", () => {
    const presentation = createStudioMainMenuPresentation([
      { id: "layer", label: "레이어", items: [{ id: "layer" }] },
      { id: "help", label: "도움말", items: [{ id: "help" }] },
    ]);
    expect(presentation.presentedGroupIds).toEqual(["layer", "help"]);
    expect(presentation.presentedActionGroupIds).toEqual([]);
    expect(presentation.compositeSources).toEqual({});
  });

  it("maps every absorbed group to its visible workflow title", () => {
    expect(studioMainMenuPresentedTitleFor("collaboration")).toBe("file");
    expect(studioMainMenuPresentedTitleFor("select")).toBe("edit");
    expect(studioMainMenuPresentedTitleFor("transform")).toBe("edit");
    expect(studioMainMenuPresentedTitleFor("canvas")).toBe("canvas");
    expect(studioMainMenuPresentedTitleFor("window")).toBe("view");
    expect(studioMainMenuPresentedTitleFor("text")).toBe("insert");
    expect(studioMainMenuPresentedTitleFor("3d")).toBe("insert");
    expect(studioMainMenuPresentedTitleFor("brush")).toBe("create");
    expect(studioMainMenuPresentedTitleFor("comic")).toBe("create");
    expect(studioMainMenuPresentedTitleFor("animation")).toBe("create");
    expect(studioMainMenuPresentedTitleFor("filter")).toBe("filter");
    expect(studioMainMenuPresentedTitleFor("ai")).toBe("ai");
  });

  it("stamps the canonical source group on composite rows", () => {
    const presentation = createStudioMainMenuPresentation(catalogue(2));
    const insert = presentation.groups.find((group) => group.id === "insert")!;
    expect(insert.items.map((item) => item.sourceGroupId)).toEqual([
      "text",
      "text",
      "vector",
      "vector",
      "3d",
      "3d",
    ]);
  });
});

describe("composite section fold for menu-depth relief", () => {
  const EXPECTED_ADVANCED_SECTIONS = [
    { groupId: "file", sourceGroupIds: ["collaboration"], itemCount: 2 },
    { groupId: "edit", sourceGroupIds: ["transform"], itemCount: 2 },
    { groupId: "view", sourceGroupIds: ["window"], itemCount: 2 },
    { groupId: "insert", sourceGroupIds: ["vector", "3d"], itemCount: 4 },
    { groupId: "create", sourceGroupIds: ["animation"], itemCount: 2 },
  ];

  it("names exactly the low-frequency composite sources as advanced", () => {
    expect([...STUDIO_MAIN_MENU_ADVANCED_COMPOSITE_SOURCES]).toEqual([
      "collaboration",
      "transform",
      "window",
      "vector",
      "3d",
      "animation",
    ]);
    expect(isStudioMainMenuAdvancedCompositeSource("vector")).toBe(true);
    expect(isStudioMainMenuAdvancedCompositeSource("text")).toBe(false);
    expect(isStudioMainMenuAdvancedCompositeSource("brush")).toBe(false);
  });

  it("folds advanced sections in simple, leaving flat one-scan dropdowns", () => {
    const presentation = createStudioMainMenuPresentation(catalogue(2), {
      densityMode: "simple",
    });

    expect(presentation.compositeAdvancedSections).toEqual(EXPECTED_ADVANCED_SECTIONS);
    expect(presentation.foldedCompositeItemCount).toBe(12);
    // compositeSources still reports the full absorbed set for search/tests.
    expect(presentation.compositeSources.insert).toEqual(["text", "vector", "3d"]);

    const byId = (id: string) => presentation.groups.find((group) => group.id === id)!;
    // Single surviving section: caption dropped, dropdown is a flat list.
    expect(byId("file").items.map((item) => item.id)).toEqual([
      "file-command-0",
      "file-command-1",
    ]);
    expect(byId("file").items.map((item) => item.sectionLabel)).toEqual([
      undefined,
      undefined,
    ]);
    expect(byId("view").items.map((item) => item.sectionLabel)).toEqual([
      undefined,
      undefined,
    ]);
    expect(byId("insert").items.map((item) => item.id)).toEqual([
      "text-command-0",
      "text-command-1",
    ]);
    expect(byId("insert").items.map((item) => item.sectionLabel)).toEqual([
      undefined,
      undefined,
    ]);
    // Two surviving everyday sections keep their captions.
    expect(byId("edit").items.map((item) => item.sectionLabel)).toEqual([
      "편집",
      undefined,
      "선택",
      undefined,
    ]);
    expect(byId("create").items.map((item) => item.id)).toEqual([
      "brush-command-0",
      "brush-command-1",
      "comic-command-0",
      "comic-command-1",
    ]);
    // Standalone titles are untouched.
    expect(byId("filter").items).toHaveLength(2);
    expect(byId("canvas").items).toHaveLength(2);
  });

  it("folds the same sections in focus", () => {
    const presentation = createStudioMainMenuPresentation(catalogue(2), {
      densityMode: "focus",
    });
    expect(presentation.compositeAdvancedSections).toEqual(EXPECTED_ADVANCED_SECTIONS);
    expect(presentation.foldedCompositeItemCount).toBe(12);
  });

  it("restores every section in original order when expanded in simple", () => {
    const presentation = createStudioMainMenuPresentation(catalogue(2), {
      densityMode: "simple",
      advancedSectionsExpanded: true,
    });
    expect(presentation.compositeAdvancedSections).toEqual(EXPECTED_ADVANCED_SECTIONS);
    expect(presentation.foldedCompositeItemCount).toBe(0);
    const insert = presentation.groups.find((group) => group.id === "insert")!;
    expect(insert.items.map((item) => item.id)).toEqual([
      "text-command-0",
      "text-command-1",
      "vector-command-0",
      "vector-command-1",
      "3d-command-0",
      "3d-command-1",
    ]);
    expect(
      insert.items.map((item) => item.sectionLabel).filter((label) => label !== undefined),
    ).toEqual(["텍스트", "벡터", "3D"]);
  });

  it("keeps the legacy presentation in full and when the mode is unwired", () => {
    for (const options of [{ densityMode: "full" as const }, {}]) {
      const presentation = createStudioMainMenuPresentation(catalogue(2), options);
      expect(presentation.compositeAdvancedSections).toEqual([]);
      expect(presentation.foldedCompositeItemCount).toBe(0);
      const insert = presentation.groups.find((group) => group.id === "insert")!;
      expect(insert.items).toHaveLength(6);
      expect(insert.items[0]?.sectionLabel).toBe("텍스트");
    }
  });

  it("inserts one fold row per affected title, at the boundary when expanded", () => {
    const buildFoldItem = (
      groupId: string,
      advancedCount: number,
    ): StudioMainMenuPresentableItem => ({
      id: `fold:${groupId}:${advancedCount}`,
    });

    const collapsed = createStudioMainMenuPresentation(catalogue(2), {
      densityMode: "simple",
    });
    const collapsedGroups = insertStudioMainMenuAdvancedSectionFoldRows(
      collapsed.groups,
      collapsed.compositeAdvancedSections,
      false,
      buildFoldItem,
    );
    const collapsedFile = collapsedGroups.find((group) => group.id === "file")!;
    expect(collapsedFile.items.map((item) => item.id)).toEqual([
      "file-command-0",
      "file-command-1",
      "fold:file:2",
    ]);
    // Titles without advanced sections keep their original reference.
    const collapsedCanvas = collapsedGroups.find((group) => group.id === "canvas");
    expect(collapsedCanvas).toBe(
      collapsed.groups.find((group) => group.id === "canvas"),
    );

    const expanded = createStudioMainMenuPresentation(catalogue(2), {
      densityMode: "simple",
      advancedSectionsExpanded: true,
    });
    const expandedGroups = insertStudioMainMenuAdvancedSectionFoldRows(
      expanded.groups,
      expanded.compositeAdvancedSections,
      true,
      buildFoldItem,
    );
    const expandedInsert = expandedGroups.find((group) => group.id === "insert")!;
    expect(expandedInsert.items.map((item) => item.id)).toEqual([
      "text-command-0",
      "text-command-1",
      "fold:insert:4",
      "vector-command-0",
      "vector-command-1",
      "3d-command-0",
      "3d-command-1",
    ]);

    // No sections (full/unwired) returns the groups untouched.
    expect(
      insertStudioMainMenuAdvancedSectionFoldRows(
        collapsed.groups,
        [],
        false,
        buildFoldItem,
      ),
    ).toBe(collapsed.groups);
  });
});
