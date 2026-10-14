/**
 * Public command catalog. Existing declarations remain historical evidence in
 * `studio-command-catalog-base.ts`; this boundary applies shipped compatibility migrations
 * before search, help, and shortcut indexes consume them.
 */
import {
  catalogNativeIds as baseNativeIds,
  findCatalogEntriesBySource as findBaseEntries,
  STUDIO_COMMAND_CATALOG as BASE_CATALOG,
  STUDIO_COMMAND_SOURCES as BASE_SOURCES,
  STUDIO_MENU_ITEM_INVENTORY as BASE_MENU_INVENTORY,
} from "./studio-command-catalog-base";

import { STUDIO_BRUSH_LABELS } from "./brush/studio-brush-product-model";

import type { StudioCommandCatalogEntry, StudioCommandSource } from "./studio-command-catalog-base";
import type { CommandId } from "@toonstudio/studio-command-registry";

export {
  COMMAND_CONFLICTS,
  STUDIO_COMMAND_CATALOG_UNCOVERED,
  STUDIO_HELP_ROW_INVENTORY,
} from "./studio-command-catalog-base";
export type {
  StudioCommandCatalogEntry,
  StudioCommandConflict,
  StudioCommandConflictKind,
  StudioCommandOrigin,
  StudioCommandOriginStatus,
  StudioCommandSource,
  StudioCommandSourceInfo,
} from "./studio-command-catalog-base";

const MANUAL_MENU_ID = "help/user-manual";
const BRUSH_LAB_MENU_ID = "brush/brush-lab";
const FLOATING_LAYOUT_MENU_ID = "view/floating-layout";
const TRANSPARENT_COLOR_COMMAND_ID: CommandId = "color.toggle-transparent";
const TRANSPARENT_COLOR_SHORTCUT = "Shift+C";
const BRUSH_STUDIO_COMMAND_ID: CommandId = "brush.studio";

/**
 * The base file keeps measured historical conflicts. The public catalog must describe the
 * commands users can execute now while preserving old terminology as aliases.
 */
const NORMALIZED_BASE_CATALOG: readonly StudioCommandCatalogEntry[] = Object.freeze(
  BASE_CATALOG.map((entry) => {
    if (entry.id === TRANSPARENT_COLOR_COMMAND_ID) {
      return Object.freeze({
        ...entry,
        shortcut: TRANSPARENT_COLOR_SHORTCUT,
        origins: Object.freeze(
          entry.origins.map((origin) =>
            origin.source === "keymap"
              ? Object.freeze({ ...origin, shortcut: TRANSPARENT_COLOR_SHORTCUT })
              : origin,
          ),
        ),
        note: "Crop uses C; transparent-colour drawing uses Shift+C after the guided-UX migration.",
      });
    }

    if (entry.id === BRUSH_STUDIO_COMMAND_ID) {
      return Object.freeze({
        ...entry,
        labels: Object.freeze([
          {
            locale: "ko",
            label: STUDIO_BRUSH_LABELS.editCurrent,
            description: "캔버스를 떠나지 않고 현재 브러시의 펜촉·필압·도장·입력·엔진 조합을 빠르게 편집합니다.",
          },
          {
            locale: "en",
            label: "Edit current brush",
            description: "Quickly edit the selected brush tip, pressure, stamp, input, and engine settings without leaving the canvas.",
          },
        ]),
        aliases: Object.freeze([
          ...entry.aliases,
          { vendor: "toonstudio", locale: "ko", term: "브러시 스튜디오" } as const,
          { vendor: "toonstudio", locale: "ko", term: "브러시 상세 설정" } as const,
          { vendor: "toonstudio", locale: "ko", term: "현재 브러시 세부 설정" } as const,
          { vendor: "toonstudio", locale: "en", term: "Brush Studio" } as const,
        ]),
        note: "Compact and full editing are two depths of one Brush Studio product, not separate products.",
      });
    }

    return entry;
  }),
);

const MANUAL_COMMAND: StudioCommandCatalogEntry = {
  id: "help.user-manual",
  category: "help",
  labels: [
    { locale: "ko", label: "사용자 매뉴얼", description: "편집 중인 원고를 유지한 채 기능별 사용자 매뉴얼을 새 탭으로 엽니다." },
    { locale: "en", label: "User manual · Korean", description: "Open the Korean reference manual in a new tab without leaving the editor." },
  ],
  aliases: [
    { vendor: "toonstudio", locale: "ko", term: "매뉴얼" },
    { vendor: "toonstudio", locale: "ko", term: "사용 설명서" },
    { vendor: "toonstudio", locale: "en", term: "user guide" },
  ],
  helpNodeId: "help/help/user-manual",
  origins: [{ source: "menu", nativeId: MANUAL_MENU_ID, status: "wired" }],
};

const BRUSH_LAB_COMMAND: StudioCommandCatalogEntry = {
  id: "brush.lab",
  category: "brush",
  labels: [
    { locale: "ko", label: STUDIO_BRUSH_LABELS.create, description: "시작 브러시를 고르고 실제로 시험한 뒤 재질·물리·패턴·전문 엔진까지 전체 편집합니다." },
    { locale: "en", label: "Create a new brush", description: "Choose a starting brush, test it live, then refine material, physics, pattern, and expert engines in the full Brush Studio." },
  ],
  aliases: [
    { vendor: "toonstudio", locale: "ko", term: "목적별 브러시 제작실" },
    { vendor: "toonstudio", locale: "ko", term: "브러시 연구실" },
    { vendor: "toonstudio", locale: "ko", term: "브러시 제작실" },
    { vendor: "toonstudio", locale: "en", term: "Brush Studio V6" },
  ],
  helpNodeId: "help/brush/lab",
  origins: [{ source: "menu", nativeId: BRUSH_LAB_MENU_ID, status: "wired" }],
  note: "Navigation command to the canonical full Brush Studio while preserving manuscript context; former lab names remain search aliases only.",
};

const FLOATING_LAYOUT_COMMAND: StudioCommandCatalogEntry = {
  id: "view.floating-layout",
  category: "view",
  labels: [
    {
      locale: "ko",
      label: "플로팅 UI · 배치 설정",
      description: "플로팅 요소의 표시, 위치, 크기, 잠금과 작업공간 프리셋을 편집합니다.",
    },
    {
      locale: "en",
      label: "Floating UI · layout settings",
      description: "Edit visibility, position, size, locking, and workspace presets for floating surfaces.",
    },
  ],
  aliases: [
    { vendor: "toonstudio", locale: "ko", term: "작업공간 편집" },
    { vendor: "toonstudio", locale: "ko", term: "플로팅 요소 배치" },
    { vendor: "toonstudio", locale: "en", term: "workspace layout" },
  ],
  helpNodeId: "help/view/floating-layout",
  origins: [{ source: "menu", nativeId: FLOATING_LAYOUT_MENU_ID, status: "wired" }],
};

export const STUDIO_COMMAND_CATALOG: readonly StudioCommandCatalogEntry[] =
  Object.freeze([
    ...NORMALIZED_BASE_CATALOG,
    MANUAL_COMMAND,
    BRUSH_LAB_COMMAND,
    FLOATING_LAYOUT_COMMAND,
  ]);

export const STUDIO_MENU_ITEM_INVENTORY: readonly string[] = Object.freeze([
  ...BASE_MENU_INVENTORY.flatMap((id) => {
    // The manual rides directly after the pinned learning rows (help/shortcuts)
    // so the public inventory matches the Help group's rendered order (F4.4).
    if (id === "help/shortcuts") return [id, MANUAL_MENU_ID];
    if (id === "brush/brush-studio") return [id, BRUSH_LAB_MENU_ID];
    if (id === "view/production-insights") {
      return [id, FLOATING_LAYOUT_MENU_ID];
    }
    return [id];
  }),
]);

export const STUDIO_COMMAND_SOURCES = Object.freeze({
  ...BASE_SOURCES,
  menu: {
    ...BASE_SOURCES.menu,
    measuredCount: BASE_SOURCES.menu.measuredCount + 3,
  },
});

/** Canonical public chord → command ids after compatibility migrations. */
export function catalogShortcutIndex(): Map<string, CommandId[]> {
  const index = new Map<string, CommandId[]>();
  for (const entry of STUDIO_COMMAND_CATALOG) {
    if (!entry.shortcut) continue;
    const current = index.get(entry.shortcut);
    if (current) current.push(entry.id);
    else index.set(entry.shortcut, [entry.id]);
  }
  return index;
}

export function findCatalogEntriesBySource(
  source: StudioCommandSource,
  nativeId: string,
): StudioCommandCatalogEntry[] {
  const entries = findBaseEntries(source, nativeId).map((entry) =>
    STUDIO_COMMAND_CATALOG.find((candidate) => candidate.id === entry.id) ?? entry,
  );
  if (source !== "menu") return entries;
  if (nativeId === MANUAL_MENU_ID) return [...entries, MANUAL_COMMAND];
  if (nativeId === BRUSH_LAB_MENU_ID) return [...entries, BRUSH_LAB_COMMAND];
  if (nativeId === FLOATING_LAYOUT_MENU_ID) {
    return [...entries, FLOATING_LAYOUT_COMMAND];
  }
  return entries;
}

export function catalogNativeIds(source: StudioCommandSource): string[] {
  const ids = baseNativeIds(source);
  return source === "menu"
    ? [...ids, MANUAL_MENU_ID, BRUSH_LAB_MENU_ID, FLOATING_LAYOUT_MENU_ID]
    : ids;
}

/* ================================================================== */
/* S3-12 — 명령 카탈로그 인벤토리 (BLUEPRINT §4.2)                      */
/* ================================================================== */

/**
 * Exposure inventory layered over the command catalog above (BLUEPRINT §4.2).
 *
 * The catalog already registers every menu row (STUDIO_MENU_ITEM_INVENTORY,
 * 202 rows in this public view) plus the edit-menu, quick-access, radial,
 * keymap and help lists, and `studio-command-catalog.test.ts` pins that
 * equivalence. What it did not carry is the §4.2 exposure metadata —
 * `tier`, `stage`, `surfaces` — nor an inventory of the three surfaces that
 * are not command lists at all: the left tool rail, the inspector panels
 * and the launchers (creation modes, menubar fixed buttons, command bar).
 *
 * This section is **registration only**: no renderer reads it yet, so
 * rendering is unchanged. S3-13 moves the menubar renderer onto it and
 * S3-14 spreads it to the toolbar, launchers and command search. Where a
 * rail/panel/menubar label differs from the linked catalog entry's label,
 * the inventory keeps the surface's own label verbatim (that is what the
 * equivalence tests compare) and records the divergence in `note` — the
 * same provenance rule the base catalog uses for conflicts.
 *
 * Tier rule (data, reviewer-adjustable one row at a time):
 * - tools: `core` = the first-run rail (DEFAULT_STUDIO_RAIL_VISIBLE_IDS),
 *   `contextual` = view/selection/stage-bound tools, `advanced` = the rest.
 * - panels: `core` = always-reachable primary sections, else `contextual`.
 * - menubar: fixed buttons are `core`; overflow, immersive-exit and the
 *   command-bar-only rows are `contextual` (they appear conditionally).
 * - launcher modes: draw/story `core`, character/background/assets
 *   `contextual`, ai `advanced` (mirrors the density policy folding AI).
 * Stage ids mirror the episode stage model (plan → storyboard → art →
 * lettering → review → publish → operate); omitted where a command is not
 * bound to one stage.
 */

/** §4.2 exposure tier — never a deletion: search reaches every tier. */
export type StudioCommandTier = "core" | "contextual" | "advanced";

/** §4.2 render surfaces. */
export type StudioCommandSurface =
  | "menubar"
  | "toolbar"
  | "panel"
  | "launcher"
  | "palette";

/** Episode stage ids — mirrors production-episode-stage.ts (S2-1). */
export type StudioCommandStageId =
  | "plan"
  | "storyboard"
  | "art"
  | "lettering"
  | "review"
  | "publish"
  | "operate";

export interface StudioCommandInventoryEntry {
  /** Inventory id, `<surface-kind>:<native id>` — unique across the inventory. */
  id: string;
  /** The id exactly as the owning surface declares it. */
  nativeId: string;
  /** Korean label exactly as the owning surface shows it. */
  label: string;
  tier: StudioCommandTier;
  surfaces: readonly StudioCommandSurface[];
  stage?: StudioCommandStageId;
  /** Chord exactly as the owning surface advertises it, when it has one. */
  shortcut?: string;
  /** Canonical catalog entry for the same command, when one exists. */
  catalogId?: string;
  /** Owning declaration, for drift guards. */
  source: { file: string; declaration: string };
  note?: string;
}

/* ------------------------------------------------------------- tools */

/**
 * Left tool rail — every row of STUDIO_RAIL_TOOL_CATALOG
 * (studio-app-settings.ts), in declaration order, labels and chords
 * verbatim. `studio-command-catalog-inventory.test.ts` compares this list
 * against the live catalog both ways, so a rail tool cannot be added or
 * renamed without the inventory following.
 */
export const STUDIO_TOOL_INVENTORY: readonly StudioCommandInventoryEntry[] =
  Object.freeze([
    { id: "tool:select", nativeId: "select", label: "선택", tier: "core", surfaces: ["toolbar"], stage: "art", shortcut: "V", catalogId: "tool.select", note: "라벨 divergence: 카탈로그 정본은 「오브젝트 선택」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:transform", nativeId: "transform", label: "크기·회전 바꾸기", tier: "contextual", surfaces: ["toolbar"], stage: "art", shortcut: "Shift+T", catalogId: "tool.transform", note: "라벨 divergence: 카탈로그 정본은 「변형」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:hand", nativeId: "hand", label: "화면 이동", tier: "contextual", surfaces: ["toolbar"], stage: "art", shortcut: "Space", catalogId: "tool.hand", note: "라벨 divergence: 카탈로그 정본은 「핸드(팬)」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:pen", nativeId: "pen", label: "펜", tier: "core", surfaces: ["toolbar"], stage: "art", shortcut: "B", catalogId: "tool.pen", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:pixel-pencil", nativeId: "pixel-pencil", label: "픽셀 펜", tier: "advanced", surfaces: ["toolbar"], stage: "art", shortcut: "P", catalogId: "tool.pixel-pen", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:eraser", nativeId: "eraser", label: "지우개", tier: "core", surfaces: ["toolbar"], stage: "art", shortcut: "E", catalogId: "tool.eraser", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:blend", nativeId: "blend", label: "색 경계 섞기", tier: "advanced", surfaces: ["toolbar"], stage: "art", shortcut: "N", catalogId: "tool.smudge", note: "라벨 divergence: 카탈로그 정본은 「문지르기」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:wet-mix", nativeId: "wet-mix", label: "물감처럼 섞어 칠하기", tier: "advanced", surfaces: ["toolbar"], stage: "art", shortcut: "Shift+N", catalogId: "tool.wet-mix", note: "라벨 divergence: 카탈로그 정본은 「혼색 브러시」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:dodge-burn", nativeId: "dodge-burn", label: "밝게·어둡게 칠하기", tier: "advanced", surfaces: ["toolbar"], stage: "art", shortcut: "O", catalogId: "tool.dodge-burn", note: "라벨 divergence: 카탈로그 정본은 「닷지 · 번」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:liquify", nativeId: "liquify", label: "밀어서 모양 바꾸기", tier: "advanced", surfaces: ["toolbar"], stage: "art", shortcut: "J", catalogId: "tool.liquify", note: "라벨 divergence: 카탈로그 정본은 「리퀴파이」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:fill", nativeId: "fill", label: "색 채우기", tier: "core", surfaces: ["toolbar"], stage: "art", shortcut: "G", catalogId: "tool.fill", note: "라벨 divergence: 카탈로그 정본은 「채우기」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:lasso-fill", nativeId: "lasso-fill", label: "올가미 채우기", tier: "advanced", surfaces: ["toolbar"], stage: "art", note: "카탈로그에 대응 항목이 없는 레일 전용 도구 — S3-12는 등록만 하고 통합하지 않는다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:eyedropper", nativeId: "eyedropper", label: "색 가져오기", tier: "contextual", surfaces: ["toolbar"], stage: "art", shortcut: "I", catalogId: "tool.eyedropper", note: "라벨 divergence: 카탈로그 정본은 「스포이드」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:marquee-rect", nativeId: "marquee-rect", label: "사각 선택", tier: "core", surfaces: ["toolbar"], stage: "art", shortcut: "M", catalogId: "tool.marquee-rect", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:marquee-circle", nativeId: "marquee-circle", label: "원형 선택", tier: "contextual", surfaces: ["toolbar"], stage: "art", shortcut: "Shift+M", catalogId: "tool.marquee-ellipse", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:lasso", nativeId: "lasso", label: "올가미 선택", tier: "contextual", surfaces: ["toolbar"], stage: "art", shortcut: "L", catalogId: "tool.lasso", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:crop", nativeId: "crop", label: "자르기", tier: "contextual", surfaces: ["toolbar"], stage: "art", shortcut: "C", catalogId: "tool.crop", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:smart-shape", nativeId: "smart-shape", label: "스마트 도형", tier: "core", surfaces: ["toolbar"], stage: "art", catalogId: "tool.smart-shape", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:shape-rect", nativeId: "shape-rect", label: "사각형 도형", tier: "advanced", surfaces: ["toolbar"], stage: "art", note: "카탈로그에 대응 항목이 없는 레일 전용 도구 — S3-12는 등록만 하고 통합하지 않는다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:shape-ellipse", nativeId: "shape-ellipse", label: "타원 도형", tier: "advanced", surfaces: ["toolbar"], stage: "art", note: "카탈로그에 대응 항목이 없는 레일 전용 도구 — S3-12는 등록만 하고 통합하지 않는다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:text", nativeId: "text", label: "텍스트", tier: "core", surfaces: ["toolbar"], stage: "lettering", shortcut: "T", catalogId: "insert.text", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:bubble", nativeId: "bubble", label: "말풍선", tier: "contextual", surfaces: ["toolbar"], stage: "lettering", shortcut: "T", catalogId: "insert.balloon", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:image", nativeId: "image", label: "이미지·소재", tier: "core", surfaces: ["toolbar"], stage: "art", catalogId: "insert.image", note: "라벨 divergence: 카탈로그 정본은 「이미지…」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:comment", nativeId: "comment", label: "위치 댓글", tier: "contextual", surfaces: ["toolbar"], stage: "review", shortcut: "Alt+C", catalogId: "tool.comment", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:perspective", nativeId: "perspective", label: "투시 가이드", tier: "contextual", surfaces: ["toolbar"], stage: "art", catalogId: "view.perspective-guide", note: "라벨 divergence: 카탈로그 정본은 「원근 도우미 보기」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:frame-anim", nativeId: "frame-anim", label: "프레임 애니메이션", tier: "advanced", surfaces: ["toolbar"], stage: "art", catalogId: "animation.frame-cel", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:mannequin3d", nativeId: "mannequin3d", label: "기본 데생 인형", tier: "advanced", surfaces: ["toolbar"], stage: "storyboard", catalogId: "insert.mannequin-3d", note: "라벨 divergence: 카탈로그 정본은 「3D 데생 인형」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:vrm3d", nativeId: "vrm3d", label: "인물·포즈 편집", tier: "advanced", surfaces: ["toolbar"], stage: "storyboard", catalogId: "insert.character-3d", note: "라벨 divergence: 카탈로그 정본은 「3D 캐릭터」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:character-shaper", nativeId: "character-shaper", label: "캐릭터 만들기", tier: "advanced", surfaces: ["toolbar"], stage: "storyboard", catalogId: "insert.character-shaper", note: "라벨 divergence: 카탈로그 정본은 「캐릭터 셰이퍼」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:bg3d", nativeId: "bg3d", label: "장면 도우미", tier: "advanced", surfaces: ["toolbar"], stage: "storyboard", catalogId: "insert.background-3d", note: "라벨 divergence: 카탈로그 정본은 「3D 배경」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:hybrid-dcc", nativeId: "hybrid-dcc", label: "외부 3D 편집 연결", tier: "advanced", surfaces: ["toolbar"], stage: "storyboard", note: "카탈로그에 대응 항목이 없는 레일 전용 도구 — S3-12는 등록만 하고 통합하지 않는다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:reference", nativeId: "reference", label: "참고 이미지", tier: "contextual", surfaces: ["toolbar"], stage: "art", catalogId: "window.reference-panel", note: "라벨 divergence: 카탈로그 정본은 「참고 이미지 창」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:zoom", nativeId: "zoom", label: "화면 확대·축소", tier: "contextual", surfaces: ["toolbar"], stage: "art", shortcut: "Z", catalogId: "tool.zoom", note: "라벨 divergence: 카탈로그 정본은 「보기 확대 · 축소」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:zoom-fit", nativeId: "zoom-fit", label: "화면 맞춤", tier: "contextual", surfaces: ["toolbar"], stage: "art", shortcut: "Home", catalogId: "view.fit-width", note: "라벨 divergence: 카탈로그 정본은 「화면에 맞게 조정」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
    { id: "tool:rotate-view", nativeId: "rotate-view", label: "화면 회전", tier: "contextual", surfaces: ["toolbar"], stage: "art", shortcut: "R", catalogId: "tool.rotate-view", note: "라벨 divergence: 카탈로그 정본은 「보기 회전」 — 표면 라벨을 verbatim으로 고정하고 통합은 후속 판단으로 남긴다.", source: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG" } },
  ]);

/* ------------------------------------------------------------ panels */

/**
 * Inspector panel destinations — the sections a user can navigate to in
 * studio-inspector-layout.ts (primary · document · image section sets).
 * Labels are the matching inspector action labels from the same file,
 * verbatim. The `document` primary section is a container, so its three
 * sub-panels are registered individually instead. Panel *components*
 * (Studio*Panel.tsx) are opened through these destinations and the menu;
 * they are not separate commands and are not registered as such.
 */
export const STUDIO_PANEL_INVENTORY: readonly StudioCommandInventoryEntry[] =
  Object.freeze([
    { id: "panel:inspector/layers", nativeId: "inspector/layers", label: "레이어", tier: "core", surfaces: ["panel"], stage: "art", source: { file: "apps/web/src/domains/creator/studio-inspector-layout.ts", declaration: "studioInspectorActions action layers" } },
    { id: "panel:inspector/properties", nativeId: "inspector/properties", label: "선택 요소 속성", tier: "core", surfaces: ["panel"], stage: "art", source: { file: "apps/web/src/domains/creator/studio-inspector-layout.ts", declaration: "studioInspectorActions action selection-properties" } },
    { id: "panel:inspector/publish", nativeId: "inspector/publish", label: "작품 정보", tier: "contextual", surfaces: ["panel"], stage: "publish", source: { file: "apps/web/src/domains/creator/studio-inspector-layout.ts", declaration: "studioInspectorActions action publish" } },
    { id: "panel:inspector/document/canvas", nativeId: "inspector/document/canvas", label: "캔버스 설정", tier: "contextual", surfaces: ["panel"], stage: "art", source: { file: "apps/web/src/domains/creator/studio-inspector-layout.ts", declaration: "studioInspectorActions action canvas" } },
    { id: "panel:inspector/document/grade", nativeId: "inspector/document/grade", label: "페이지 색보정", tier: "contextual", surfaces: ["panel"], stage: "art", source: { file: "apps/web/src/domains/creator/studio-inspector-layout.ts", declaration: "studioInspectorActions action grade" } },
    { id: "panel:inspector/document/navigator", nativeId: "inspector/document/navigator", label: "미니맵·탐색", tier: "contextual", surfaces: ["panel"], stage: "art", source: { file: "apps/web/src/domains/creator/studio-inspector-layout.ts", declaration: "studioInspectorActions action navigator" } },
    { id: "panel:inspector/image/quick", nativeId: "inspector/image/quick", label: "이미지 빠른 수정", tier: "contextual", surfaces: ["panel"], stage: "art", source: { file: "apps/web/src/domains/creator/studio-inspector-layout.ts", declaration: "studioInspectorActions action image-quick" } },
    { id: "panel:inspector/image/fill", nativeId: "inspector/image/fill", label: "채우기·선화", tier: "contextual", surfaces: ["panel"], stage: "art", source: { file: "apps/web/src/domains/creator/studio-inspector-layout.ts", declaration: "studioInspectorActions action image-fill" } },
    { id: "panel:inspector/image/transform", nativeId: "inspector/image/transform", label: "크기·회전", tier: "contextual", surfaces: ["panel"], stage: "art", source: { file: "apps/web/src/domains/creator/studio-inspector-layout.ts", declaration: "studioInspectorActions action image-transform" } },
    { id: "panel:inspector/image/retouch", nativeId: "inspector/image/retouch", label: "선택·보정", tier: "contextual", surfaces: ["panel"], stage: "art", source: { file: "apps/web/src/domains/creator/studio-inspector-layout.ts", declaration: "studioInspectorActions action image-retouch" } },
    { id: "panel:inspector/image/mask", nativeId: "inspector/image/mask", label: "원본 유지하고 가리기", tier: "contextual", surfaces: ["panel"], stage: "art", source: { file: "apps/web/src/domains/creator/studio-inspector-layout.ts", declaration: "studioInspectorActions action image-mask" } },
  ]);

/* ------------------------------------------- menubar fixed + command bar */

/**
 * Menubar fixed buttons and the assignable command-bar commands
 * (StudioMenubarContent.tsx). The two surfaces share commands: a fixed
 * button that is also command-bar assignable is registered once, with
 * `commandBarId` naming its slot-editor id. Labels and hint ids are
 * verbatim from MENUBAR_HINTS / COMMAND_BAR_HINTS; the inventory test
 * re-extracts the hint ids from the menubar source as a drift guard.
 */
export interface StudioMenubarInventoryEntry extends StudioCommandInventoryEntry {
  /** Hint spec id in StudioMenubarContent.tsx. */
  hintId: string;
  /** Slot-editor id in COMMAND_BAR_COMMAND_LABELS, when assignable. */
  commandBarId?: string;
}

export const STUDIO_MENUBAR_INVENTORY: readonly StudioMenubarInventoryEntry[] =
  Object.freeze([
    { id: "menubar:menubar-undo", nativeId: "menubar-undo", hintId: "menubar-undo", label: "실행취소", tier: "core", surfaces: ["menubar"], shortcut: "⌘Z", catalogId: "edit.undo", commandBarId: "undo", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-redo", nativeId: "menubar-redo", hintId: "menubar-redo", label: "다시실행", tier: "core", surfaces: ["menubar"], shortcut: "⌘⇧Z", catalogId: "edit.redo", commandBarId: "redo", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-history", nativeId: "menubar-history", hintId: "menubar-history", label: "작업 내역", tier: "core", surfaces: ["menubar"], catalogId: "edit.history", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-assets", nativeId: "menubar-assets", hintId: "menubar-assets", label: "템플릿·에셋", tier: "core", surfaces: ["menubar"], catalogId: "insert.template", commandBarId: "assets", note: "라벨 divergence: 카탈로그 정본은 「템플릿 · 에셋」(띄어쓰기) — 표면 라벨을 verbatim으로 고정한다.", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-bubbles", nativeId: "menubar-bubbles", hintId: "menubar-bubbles", label: "말풍선", tier: "core", surfaces: ["menubar"], stage: "lettering", catalogId: "insert.balloon", commandBarId: "bubbles", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-pages", nativeId: "menubar-pages", hintId: "menubar-pages", label: "페이지", tier: "core", surfaces: ["menubar"], note: "페이지 목록 크롬 — 카탈로그 명령이 아니라 표면 등록만 한다.", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-download", nativeId: "menubar-download", hintId: "menubar-download", label: "다운로드", tier: "core", surfaces: ["menubar"], catalogId: "file.export", commandBarId: "download", note: "라벨 divergence: 카탈로그 정본은 「내보내기 / 다운로드」 — 고정 버튼은 즉시 다운로드만 가리킨다.", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-export-options", nativeId: "menubar-export-options", hintId: "menubar-export-options", label: "내보내기 옵션", tier: "core", surfaces: ["menubar"], commandBarId: "export-open", note: "file.export의 옵션 표면 — 별도 명령으로 세지 않는다.", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-project", nativeId: "menubar-project", hintId: "menubar-project", label: "프로젝트 센터", tier: "core", surfaces: ["menubar"], catalogId: "file.project-tools", commandBarId: "project", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-immersive", nativeId: "menubar-immersive", hintId: "menubar-immersive", label: "전체 화면 드로잉", tier: "core", surfaces: ["menubar"], catalogId: "view.fullscreen", note: "라벨 divergence: 카탈로그 정본은 「전체화면」 — 고정 버튼 라벨을 verbatim으로 고정한다.", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-immersive-exit", nativeId: "menubar-immersive-exit", hintId: "menubar-immersive-exit", label: "전체 화면 드로잉 종료", tier: "contextual", surfaces: ["menubar"], catalogId: "view.fullscreen", note: "몰입 중일 때만 보이는 종료 짝 — 같은 view.fullscreen 토글이다.", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-save-draft", nativeId: "menubar-save-draft", hintId: "menubar-save-draft", label: "초안 저장", tier: "core", surfaces: ["menubar"], shortcut: "⌘S", catalogId: "file.save-draft", commandBarId: "save", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-publish", nativeId: "menubar-publish", hintId: "menubar-publish", label: "게시하기", tier: "core", surfaces: ["menubar"], stage: "publish", catalogId: "file.publish", commandBarId: "publish", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-overflow", nativeId: "menubar-overflow", hintId: "menubar-overflow", label: "가려진 메뉴", tier: "contextual", surfaces: ["menubar"], note: "폭이 모자랄 때만 나타나는 크롬 — 명령이 아니다.", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-correct-stroke", nativeId: "menubar-correct-stroke", hintId: "menubar-correct-stroke", label: "현재 스트로크 교정", tier: "contextual", surfaces: ["menubar"], stage: "art", shortcut: "⌥⇧Q", catalogId: "brush.correct-current-stroke", commandBarId: "correct-current-stroke", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-zoom-fit", nativeId: "menubar-zoom-fit", hintId: "menubar-zoom-fit", label: "화면 폭 맞춤", tier: "contextual", surfaces: ["menubar"], catalogId: "view.fit-width", commandBarId: "zoom-fit", note: "라벨 divergence: 카탈로그 정본은 「화면에 맞게 조정」 — 명령 바 라벨을 verbatim으로 고정한다.", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
    { id: "menubar:menubar-command-bar-customize", nativeId: "menubar-command-bar-customize", hintId: "menubar-command-bar-customize", label: "명령 바 설정", tier: "contextual", surfaces: ["menubar"], catalogId: "window.command-bar", note: "라벨 divergence: 카탈로그 정본은 「명령 바」 — 설정 진입 라벨을 verbatim으로 고정한다.", source: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS" } },
  ]);

/* ---------------------------------------------------------- launcher */

/**
 * Creation-mode launcher — every mode of StudioCreationModeLauncher.tsx
 * (CREATION_MODES), labels verbatim. The floating quick-access palette
 * (⇧Q) and the radial quick actions are launchers too, but their rows are
 * already catalog sources (`quick-access`, `radial`), so they are not
 * duplicated here; `studioCommandSurfacesFor` maps them to `palette` /
 * `launcher` for §4.2 consumers.
 */
export const STUDIO_LAUNCHER_INVENTORY: readonly StudioCommandInventoryEntry[] =
  Object.freeze([
    { id: "launcher:draw", nativeId: "draw", label: "드로잉", tier: "core", surfaces: ["launcher"], stage: "art", note: "브러시·선화·채색", source: { file: "apps/web/src/domains/creator/StudioCreationModeLauncher.tsx", declaration: "CREATION_MODES" } },
    { id: "launcher:story", nativeId: "story", label: "스토리", tier: "core", surfaces: ["launcher"], stage: "storyboard", note: "컷·대사·말풍선", source: { file: "apps/web/src/domains/creator/StudioCreationModeLauncher.tsx", declaration: "CREATION_MODES" } },
    { id: "launcher:character", nativeId: "character", label: "캐릭터", tier: "contextual", surfaces: ["launcher"], stage: "storyboard", note: "3D 캐릭터·포즈·의상", source: { file: "apps/web/src/domains/creator/StudioCreationModeLauncher.tsx", declaration: "CREATION_MODES" } },
    { id: "launcher:background", nativeId: "background", label: "배경", tier: "contextual", surfaces: ["launcher"], stage: "storyboard", note: "장면·원근·3D 배경", source: { file: "apps/web/src/domains/creator/StudioCreationModeLauncher.tsx", declaration: "CREATION_MODES" } },
    { id: "launcher:assets", nativeId: "assets", label: "에셋", tier: "contextual", surfaces: ["launcher"], stage: "storyboard", note: "소재·이미지·참고", source: { file: "apps/web/src/domains/creator/StudioCreationModeLauncher.tsx", declaration: "CREATION_MODES" } },
    { id: "launcher:ai", nativeId: "ai", label: "AI 디렉터", tier: "advanced", surfaces: ["launcher"], stage: "storyboard", note: "구도·연출·생성", source: { file: "apps/web/src/domains/creator/StudioCreationModeLauncher.tsx", declaration: "CREATION_MODES" } },
  ]);

/* --------------------------------------------------------- aggregate */

/** Every non-menu surface registration, in surface order. */
export const STUDIO_COMMAND_INVENTORY: readonly StudioCommandInventoryEntry[] =
  Object.freeze([
    ...STUDIO_TOOL_INVENTORY,
    ...STUDIO_PANEL_INVENTORY,
    ...STUDIO_MENUBAR_INVENTORY,
    ...STUDIO_LAUNCHER_INVENTORY,
  ]);

/** Measured counts the drift guards assert against, per inventory source. */
export const STUDIO_COMMAND_INVENTORY_SOURCES = Object.freeze({
  tools: { file: "apps/web/src/domains/creator/studio-app-settings.ts", declaration: "STUDIO_RAIL_TOOL_CATALOG", measuredCount: 35 },
  panels: { file: "apps/web/src/domains/creator/studio-inspector-layout.ts", declaration: "studioInspectorActions + STUDIO_INSPECTOR_*_SECTIONS", measuredCount: 11 },
  menubar: { file: "apps/web/src/domains/creator/StudioMenubarContent.tsx", declaration: "MENUBAR_HINTS / COMMAND_BAR_HINTS", measuredCount: 17 },
  launcher: { file: "apps/web/src/domains/creator/StudioCreationModeLauncher.tsx", declaration: "CREATION_MODES", measuredCount: 6 },
});

export function studioCommandInventoryBySurface(
  surface: StudioCommandSurface,
): StudioCommandInventoryEntry[] {
  return STUDIO_COMMAND_INVENTORY.filter((entry) =>
    entry.surfaces.includes(surface),
  );
}

export function studioCommandInventoryByTier(
  tier: StudioCommandTier,
): StudioCommandInventoryEntry[] {
  return STUDIO_COMMAND_INVENTORY.filter((entry) => entry.tier === tier);
}

/**
 * §4.2 surfaces of a catalog entry, derived from its recorded origins —
 * the bridge S3-13/S3-14 renderers consume. Menu and edit-menu rows are
 * menubar, quick access is the floating palette, radial quick actions are
 * the launcher, and keymap/help rows are reachable through the palette
 * (command search and the shortcuts help it opens).
 */
const SURFACE_BY_SOURCE: Readonly<Record<StudioCommandSource, StudioCommandSurface>> = {
  menu: "menubar",
  "edit-menu": "menubar",
  "quick-access": "palette",
  radial: "launcher",
  keymap: "palette",
  help: "palette",
};

export function studioCommandSurfacesFor(
  entry: StudioCommandCatalogEntry,
): StudioCommandSurface[] {
  const surfaces = new Set<StudioCommandSurface>();
  for (const origin of entry.origins) surfaces.add(SURFACE_BY_SOURCE[origin.source]);
  return [...surfaces];
}

