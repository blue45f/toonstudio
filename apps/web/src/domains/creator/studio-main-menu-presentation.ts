/**
 * ToonStudio main-menu information architecture.
 *
 * The command catalogue keeps the complete V5 §15.3 grouping (17 groups + AI).
 * This module only changes presentation: command ids, handlers, search metadata,
 * localization paths and persistence contracts remain stable.
 *
 * ## Canvas-first nine-title layout (IA follow-up 2026-09-17)
 *
 * The visible application menu is intentionally limited to the document and
 * creation workflow artists repeatedly scan:
 *
 *   파일 | 편집 | 보기 | 캔버스 | 삽입 | 레이어 | 창작 | 효과 | 도움말
 *
 * AI is preserved as a first-class action menu beside Save/Share/Publish instead
 * of competing with document vocabulary in the primary menubar. Every source
 * catalogue group remains a labelled section inside its composite dropdown.
 *
 * ## Menu-depth relief in beginner density modes (complexity audit follow-up)
 *
 * A composite dropdown is effectively three levels deep — title → section
 * caption → command — so the artist scans one caption per absorbed source
 * group before reaching a command. In `simple`/`focus` this module folds the
 * low-frequency composite source sections (see
 * STUDIO_MAIN_MENU_ADVANCED_COMPOSITE_SOURCES) out of the presented groups:
 * the renderer (`StudioMenubarContent`) re-offers them behind one
 * "고급 도구 펼치기" disclosure row per affected title, inserted by
 * `insertStudioMainMenuAdvancedSectionFoldRows`. When folding leaves a
 * composite with a single section, that section's caption is dropped as
 * well — a lone caption disambiguates nothing, and the dropdown becomes a
 * flat two-level list scannable in one pass. `full` (and an unwired density
 * mode) presents exactly the legacy layout. Folding is presentation only:
 * the canonical catalogue is never mutated and command search keeps
 * consuming the unfolded groups, so every folded command stays searchable.
 */

import type { StudioUiDensityMode } from "./studio-ui-density";

/** Presentation order of the nine workflow-oriented primary menu titles. */
export const STUDIO_MAIN_MENU_PRESENTATION_ORDER = [
  "file",
  "edit",
  "view",
  "canvas",
  "insert",
  "layer",
  "create",
  "filter",
  "help",
] as const;

/** Action menus live next to document completion actions, outside the scroll lane. */
export const STUDIO_MAIN_MENU_ACTION_ORDER = ["ai"] as const;

export type StudioMainMenuPresentedGroupId =
  (typeof STUDIO_MAIN_MENU_PRESENTATION_ORDER)[number];
export type StudioMainMenuActionGroupId =
  (typeof STUDIO_MAIN_MENU_ACTION_ORDER)[number];

/** Presented titles and the canonical catalogue groups they absorb. */
export const STUDIO_MAIN_MENU_COMPOSITE_GROUPS = Object.freeze({
  file: Object.freeze(["file", "collaboration"] as const),
  edit: Object.freeze(["edit", "select", "transform"] as const),
  view: Object.freeze(["view", "window"] as const),
  insert: Object.freeze(["text", "vector", "3d"] as const),
  create: Object.freeze(["brush", "comic", "animation"] as const),
  filter: Object.freeze(["filter"] as const),
});

/**
 * Composite source groups that are specialist or low-frequency for the daily
 * webtoon workflow, in the order they appear inside their composites. In
 * beginner density modes (simple·focus) their whole section folds behind the
 * "고급 도구 펼치기" disclosure row:
 * - `collaboration` (협업) — team doors live in the project/team surfaces; the
 *   파일 menu's everyday half is the document commands themselves.
 * - `transform` (변형) — a single pixel-selection command, not a daily scan.
 * - `window` (창) — panel/window arrangement is setup, not per-page work;
 *   the 보기 menu's everyday half is the view toggles.
 * - `vector` (벡터) — two specialist rows (요소·교차 지우기); 삽입's everyday
 *   half is text/balloons. (The S3-13 catalog fold's source-group list omits
 *   vector; this section fold is where vector is covered — see the merge
 *   note in `insertStudioMainMenuAdvancedSectionFoldRows`.)
 * - `3d` (3D) — background/mannequin/sculpt launchers are specialist intake.
 * - `animation` (애니메이션) — timeline/frame tools serve a minority flow;
 *   창작's everyday halves are brush and comic production.
 * Everyday sources (`file`·`edit`·`select`·`view`·`text`·`brush`·`comic`)
 * are deliberately absent: they stay visible in every mode.
 */
export const STUDIO_MAIN_MENU_ADVANCED_COMPOSITE_SOURCES = Object.freeze([
  "collaboration",
  "transform",
  "window",
  "vector",
  "3d",
  "animation",
] as const);

const ADVANCED_COMPOSITE_SOURCE_SET: ReadonlySet<string> = new Set(
  STUDIO_MAIN_MENU_ADVANCED_COMPOSITE_SOURCES,
);

/** True when a catalogue source group folds as a whole section in simple/focus. */
export function isStudioMainMenuAdvancedCompositeSource(sourceId: string): boolean {
  return ADVANCED_COMPOSITE_SOURCE_SET.has(sourceId);
}

export type StudioMainMenuCompositeGroupId =
  keyof typeof STUDIO_MAIN_MENU_COMPOSITE_GROUPS;
export type StudioMainMenuPresentationLabelId =
  | StudioMainMenuCompositeGroupId
  | StudioMainMenuActionGroupId;

/**
 * 전문 영역으로 통째로 접히는 composite title id.
 * beginner 모드(simple·focus)의 specialist 경계가 이 목록에서
 * 처음 등장하는 title 앞에 그어진다. full 모드에는 경계가 없다.
 */
export const STUDIO_MAIN_MENU_SPECIALIST_GROUP_IDS: readonly StudioMainMenuCompositeGroupId[] =
  Object.freeze(["filter"]);

/** The complete primary workflow, retained for consumers that still reason in tiers. */
export const STUDIO_MAIN_MENU_FAMILIAR_CORE_ORDER =
  STUDIO_MAIN_MENU_PRESENTATION_ORDER;

/** Unknown/future catalogue groups appear immediately before Help. */
const UNKNOWN_GROUP_ANCHOR: StudioMainMenuPresentedGroupId = "help";

const WORKFLOW_LABELS: Readonly<
  Record<StudioMainMenuPresentationLabelId, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  file: { ko: "파일", en: "File" },
  edit: { ko: "편집", en: "Edit" },
  view: { ko: "보기", en: "View" },
  insert: { ko: "삽입", en: "Insert" },
  create: { ko: "창작", en: "Create" },
  filter: { ko: "효과", en: "Effects" },
  ai: { ko: "AI 도우미", en: "AI Assist" },
});

/**
 * 접힌 고급 섹션에서도 1단계에 바로 보이는 대표 진입(추가 행, 실사용 감사 B-15).
 *
 * beginner 모드(simple·focus)는 3D 섹션을 통째로 '고급 도구 펼치기' 뒤로 접는다. 그런데
 * 3D 데생 인형은 웹툰 작가가 컷마다 꺼내는 기본 도구라 접힌 메뉴 안에 숨으면 찾지 못했다.
 * 섹션이 접혀 있는 동안에만 그 행을 복제한 바로가기를 펼침 행 바로 앞(1단계)에 더한다.
 * 원래 행은 이름·역할·순서·위치를 바꾸지 않는다 — 펼치면 원래 행('기본 데생 인형')이 보이므로
 * 바로가기는 빠진다(한 메뉴에 같은 명령 두 번 금지). 바로가기 id에는 접미사를 붙여 원래 행의
 * `data-studio-menu-item-id`와 겹치지 않는다(게이트 선택자가 모호해지지 않게).
 */
export interface StudioMainMenuFoldedSectionShortcut {
  readonly sourceGroupId: string;
  readonly itemId: string;
  readonly label: { readonly ko: string; readonly en: string };
}

export const STUDIO_MAIN_MENU_FOLDED_SHORTCUT_ID_SUFFIX = ":folded-shortcut";

export const STUDIO_MAIN_MENU_FOLDED_SECTION_SHORTCUTS: Readonly<
  Partial<Record<StudioMainMenuCompositeGroupId, readonly StudioMainMenuFoldedSectionShortcut[]>>
> = Object.freeze({
  insert: Object.freeze([
    Object.freeze({
      sourceGroupId: "3d",
      itemId: "mannequin3d",
      label: Object.freeze({ ko: "3D 데생 인형", en: "3D drawing mannequin" }),
    }),
  ]),
});

export interface StudioMainMenuPresentableItem {
  readonly id: string;
  /** Visible label. Optional here because presentation only reads it for folded-section shortcuts. */
  readonly label?: string;
  /** Caption naming the canonical catalogue group inside a workflow composite. */
  readonly sectionLabel?: string;
  readonly separatorAfter?: boolean;
  /** Canonical catalogue group this row came from; stamped on composite rows. */
  readonly sourceGroupId?: string;
}

export interface StudioMainMenuPresentableGroup<
  TItem extends StudioMainMenuPresentableItem = StudioMainMenuPresentableItem,
> {
  readonly id: string;
  readonly label: string;
  readonly items: readonly TItem[];
}

/** One composite title's advanced (foldable) sections, for the fold-row renderer. */
export interface StudioMainMenuAdvancedCompositeSection {
  /** Presented composite title id (e.g. `insert`). */
  readonly groupId: string;
  /** Advanced source group ids inside that title, in section order. */
  readonly sourceGroupIds: readonly string[];
  /** Total command rows those sections carry. */
  readonly itemCount: number;
}

export interface StudioMainMenuPresentationOptions {
  /** Localized titles for workflow composites and detached action menus. */
  readonly labels?: Partial<Record<StudioMainMenuPresentationLabelId, string>>;
  /**
   * Active UI density mode, when the host wires one through. `simple` and
   * `focus` fold advanced composite sections (see the header note); `full`
   * — and an omitted mode, which keeps the legacy unfolded behaviour for
   * unwired hosts and existing tests — present every section as before.
   */
  readonly densityMode?: StudioUiDensityMode | undefined;
  /**
   * The user's explicit "고급 도구 펼치기" disclosure for composite
   * sections. Only consulted when `densityMode` folds: expanded restores
   * every section in its original order (the fold row then sits at the
   * visibility boundary, before the first advanced section).
   */
  readonly advancedSectionsExpanded?: boolean;
}

export interface StudioMainMenuPresentation<
  TGroup extends StudioMainMenuPresentableGroup,
> {
  /** Nine workflow titles in the primary menubar, plus unknown groups before Help. */
  readonly groups: readonly TGroup[];
  /** Contextual action menus rendered next to Save/Share/Publish. */
  readonly actionGroups: readonly TGroup[];
  /** Catalogue groups each composite title absorbed, in section order. */
  readonly compositeSources: Readonly<Record<string, readonly string[]>>;
  /** Presented primary ids in order, convenient for tests and overflow consumers. */
  readonly presentedGroupIds: readonly string[];
  /** Presented action ids in order. */
  readonly presentedActionGroupIds: readonly string[];
  /** Retained for StudioMainMenu's stable prop contract; workflow tiers need none. */
  readonly specialistBoundaryGroupId: string | null;
  /**
   * Advanced composite sections per presented title, reported whenever the
   * density mode folds (simple·focus) — collapsed or expanded — so the
   * renderer can place exactly one disclosure row per affected title.
   * Empty in `full` and for unwired modes.
   */
  readonly compositeAdvancedSections: readonly StudioMainMenuAdvancedCompositeSection[];
  /** Rows currently hidden by the section fold (0 when expanded/full/unwired). */
  readonly foldedCompositeItemCount: number;
}

const KNOWN_PRESENTED_IDS = new Set<string>([
  ...STUDIO_MAIN_MENU_PRESENTATION_ORDER,
  ...STUDIO_MAIN_MENU_ACTION_ORDER,
]);
const COMPOSITE_SOURCE_TO_TITLE = new Map<
  string,
  StudioMainMenuCompositeGroupId
>(
  (Object.keys(
    STUDIO_MAIN_MENU_COMPOSITE_GROUPS,
  ) as StudioMainMenuCompositeGroupId[]).flatMap((title) =>
    STUDIO_MAIN_MENU_COMPOSITE_GROUPS[title].map(
      (source) => [source, title] as const,
    ),
  ),
);

/** True when the catalogue arrived in Korean product voice. */
function isKoreanCatalogue(
  groups: readonly StudioMainMenuPresentableGroup[],
): boolean {
  const file = groups.find((group) => group.id === "file");
  if (file) return file.label === "파일";
  const help = groups.find((group) => group.id === "help");
  return help ? help.label === "도움말" : true;
}

/** Resolve the visible title that owns a canonical catalogue group. */
export function studioMainMenuPresentedTitleFor(groupId: string): string {
  return COMPOSITE_SOURCE_TO_TITLE.get(groupId) ?? groupId;
}

function buildComposite<
  TGroup extends StudioMainMenuPresentableGroup,
>(
  title: StudioMainMenuCompositeGroupId,
  sources: readonly TGroup[],
  label: string,
  flattenSingleSection = false,
): TGroup | null {
  if (sources.length === 0) return null;
  const items: StudioMainMenuPresentableItem[] = [];
  sources.forEach((source, sourceIndex) => {
    const lastSourceIndex = sources.length - 1;
    source.items.forEach((item, itemIndex) => {
      const first = itemIndex === 0;
      const lastInSource = itemIndex === source.items.length - 1;
      items.push({
        ...item,
        // Stamp the canonical source so downstream renderers (the menubar
        // density fold) can resolve this row's catalogue native id even
        // after the composite absorbed its group.
        sourceGroupId: source.id,
        // A lone surviving section needs no caption: the caption would only
        // repeat the scan level the section fold already removed.
        ...(first && !flattenSingleSection ? { sectionLabel: source.label } : {}),
        separatorAfter: lastInSource
          ? sourceIndex !== lastSourceIndex
          : Boolean(item.separatorAfter),
      });
    });
  });
  const template = sources[0] as TGroup;
  return { ...template, id: title, label, items } as TGroup;
}

/** 접힌 소스 섹션에서 1단계로 끌어올릴 바로가기 행들(원래 행을 복제하고 id·이름만 바꾼다). */
function foldedSectionShortcutItems<TGroup extends StudioMainMenuPresentableGroup>(
  title: StudioMainMenuCompositeGroupId,
  foldedSourceIds: ReadonlySet<string>,
  byId: ReadonlyMap<string, TGroup>,
  korean: boolean,
): StudioMainMenuPresentableItem[] {
  const shortcuts = STUDIO_MAIN_MENU_FOLDED_SECTION_SHORTCUTS[title] ?? [];
  return shortcuts.flatMap((shortcut) => {
    if (!foldedSourceIds.has(shortcut.sourceGroupId)) return [];
    const original = byId.get(shortcut.sourceGroupId)?.items.find((item) => item.id === shortcut.itemId);
    if (!original) return [];
    return [{
      ...original,
      id: `${original.id}${STUDIO_MAIN_MENU_FOLDED_SHORTCUT_ID_SUFFIX}`,
      label: shortcut.label[korean ? "ko" : "en"],
      sourceGroupId: shortcut.sourceGroupId,
      separatorAfter: false,
    }];
  });
}

/** Build the workflow presentation without mutating the canonical catalogue. */
export function createStudioMainMenuPresentation<
  TGroup extends StudioMainMenuPresentableGroup,
>(
  groups: readonly TGroup[],
  options: StudioMainMenuPresentationOptions = {},
): StudioMainMenuPresentation<TGroup> {
  const korean = isKoreanCatalogue(groups);
  const byId = new Map(groups.map((group) => [group.id, group] as const));
  const compositeSources: Record<string, readonly string[]> = {};
  // Section fold (header note): only an explicitly wired beginner mode
  // folds. `full` and an omitted mode keep the legacy presentation, so
  // unwired hosts and existing tests see byte-identical groups.
  const foldsSections =
    options.densityMode === "simple" || options.densityMode === "focus";
  const sectionsExpanded = options.advancedSectionsExpanded === true;
  const compositeAdvancedSections: StudioMainMenuAdvancedCompositeSection[] = [];
  let foldedCompositeItemCount = 0;

  const composite = (
    title: StudioMainMenuCompositeGroupId,
  ): TGroup | null => {
    const allSources = STUDIO_MAIN_MENU_COMPOSITE_GROUPS[title]
      .map((id) => byId.get(id))
      .filter((group): group is TGroup => group !== undefined);
    const advancedSources = foldsSections
      ? allSources.filter((source) => ADVANCED_COMPOSITE_SOURCE_SET.has(source.id))
      : [];
    if (advancedSources.length > 0) {
      compositeAdvancedSections.push({
        groupId: title,
        sourceGroupIds: advancedSources.map((source) => source.id),
        itemCount: advancedSources.reduce(
          (total, source) => total + source.items.length,
          0,
        ),
      });
    }
    const foldedSources =
      foldsSections && !sectionsExpanded ? advancedSources : [];
    if (foldedSources.length > 0) {
      foldedCompositeItemCount += foldedSources.reduce(
        (total, source) => total + source.items.length,
        0,
      );
    }
    const foldedSet = new Set(foldedSources.map((source) => source.id));
    const sources = allSources.filter((source) => !foldedSet.has(source.id));
    // compositeSources still reports the full absorbed set: consumers that
    // reason about the catalogue (search, overflow, tests) must not lose
    // the folded sources just because this presentation folds them.
    const fullSources = allSources;
    const primarySourceLabel = sources.find((source) => source.id === title)?.label;
    const firstSourceLabel = sources[0]?.label;
    const defaultLabel = (() => {
      if (title === "insert" || title === "create") {
        return WORKFLOW_LABELS[title][korean ? "ko" : "en"];
      }
      if (title === "filter") {
        if (firstSourceLabel === "필터") return WORKFLOW_LABELS.filter.ko;
        if (/^filters?$/iu.test(firstSourceLabel ?? "")) return WORKFLOW_LABELS.filter.en;
        return firstSourceLabel ?? WORKFLOW_LABELS.filter[korean ? "ko" : "en"];
      }
      return primarySourceLabel ?? WORKFLOW_LABELS[title][korean ? "ko" : "en"];
    })();
    const built = buildComposite(
      title,
      sources,
      options.labels?.[title] ?? defaultLabel,
      // Only a fold can flatten: a title that always had one section
      // (filter) keeps its legacy rendering untouched.
      foldedSources.length > 0 && sources.length === 1,
    );
    if (!built) return built;
    compositeSources[title] = fullSources.map((group) => group.id);
    // 접힌 섹션의 대표 진입은 1단계 끝(펼침 행이 붙기 바로 앞)에 바로가기로 더한다.
    const shortcuts = foldedSectionShortcutItems(title, foldedSet, byId, korean);
    if (shortcuts.length === 0) return built;
    const items: StudioMainMenuPresentableItem[] = [...built.items];
    const lastIndex = items.length - 1;
    if (lastIndex >= 0) items[lastIndex] = { ...items[lastIndex], separatorAfter: true } as StudioMainMenuPresentableItem;
    return { ...built, items: [...items, ...shortcuts] } as TGroup;
  };

  const unknown = groups.filter(
    (group) =>
      !KNOWN_PRESENTED_IDS.has(group.id) &&
      !COMPOSITE_SOURCE_TO_TITLE.has(group.id),
  );

  const presented: TGroup[] = [];
  for (const id of STUDIO_MAIN_MENU_PRESENTATION_ORDER) {
    if (id === UNKNOWN_GROUP_ANCHOR) presented.push(...unknown);
    const group =
      id in STUDIO_MAIN_MENU_COMPOSITE_GROUPS
        ? composite(id as StudioMainMenuCompositeGroupId)
        : byId.get(id) ?? null;
    if (group) presented.push(group);
  }

  const actionGroups = STUDIO_MAIN_MENU_ACTION_ORDER.flatMap((id) => {
    const source = byId.get(id);
    if (!source) return [];
    return [{
      ...source,
      label: options.labels?.[id] ?? WORKFLOW_LABELS[id][korean ? "ko" : "en"],
    } as TGroup];
  });

  const specialistGroupIds: ReadonlySet<string> = new Set(STUDIO_MAIN_MENU_SPECIALIST_GROUP_IDS);
  return {
    groups: presented,
    actionGroups,
    compositeSources,
    presentedGroupIds: presented.map((group) => group.id),
    presentedActionGroupIds: actionGroups.map((group) => group.id),
    specialistBoundaryGroupId:
      options.densityMode === "full"
        ? null
        : (presented.map((group) => group.id).find((id) => specialistGroupIds.has(id)) ?? null),
    compositeAdvancedSections,
    foldedCompositeItemCount,
  };
}

/**
 * Inserts the renderer's "고급 도구 펼치기" disclosure row into each
 * presented group that carries advanced composite sections.
 *
 * - Collapsed: the advanced sections are absent from the groups (the
 *   presentation folded them), so the row appends at the end — the artist
 *   scans only everyday rows, then the row that offers more.
 * - Expanded: the row sits at the visibility boundary, immediately before
 *   the first advanced-section row (located by its stamped
 *   `sourceGroupId`), so folding again is one click from the same spot.
 * - Groups without advanced sections — and an empty `sections` list
 *   (full/unwired) — keep their original references.
 *
 * Merge note (S3-13): the catalog tier fold (`studio-menubar-catalog.ts`)
 * provides the same disclosure row at item granularity for the filter pack
 * and the AI action menu. In a merged tree keep ONE row per group: run
 * this section fold for composite titles, let the catalog fold own
 * filter/AI, and add `vector` to its advanced source groups only if the
 * section fold is dropped there. The two row builders intentionally share
 * the i18n keys and label shape so either provider reads identically.
 */
export function insertStudioMainMenuAdvancedSectionFoldRows<
  TItem extends StudioMainMenuPresentableItem,
  TGroup extends StudioMainMenuPresentableGroup<TItem>,
>(
  groups: readonly TGroup[],
  sections: readonly StudioMainMenuAdvancedCompositeSection[],
  advancedSectionsExpanded: boolean,
  buildFoldItem: (
    groupId: string,
    advancedCount: number,
    expanded: boolean,
  ) => TItem,
): readonly TGroup[] {
  if (sections.length === 0) return groups;
  const sectionByGroup = new Map(sections.map((section) => [section.groupId, section]));
  let changed = false;
  const withRows = groups.map((group) => {
    const section = sectionByGroup.get(group.id);
    if (!section || section.itemCount === 0) return group;
    const foldItem = buildFoldItem(group.id, section.itemCount, advancedSectionsExpanded);
    if (!advancedSectionsExpanded) {
      changed = true;
      return { ...group, items: [...group.items, foldItem] } as TGroup;
    }
    const advancedSet = new Set<string>(section.sourceGroupIds);
    const boundary = group.items.findIndex(
      (item) => item.sourceGroupId !== undefined && advancedSet.has(item.sourceGroupId),
    );
    changed = true;
    if (boundary < 0) return { ...group, items: [...group.items, foldItem] } as TGroup;
    return {
      ...group,
      items: [
        ...group.items.slice(0, boundary),
        foldItem,
        ...group.items.slice(boundary),
      ],
    } as TGroup;
  });
  return changed ? withRows : groups;
}
