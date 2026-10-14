/**
 * Menubar command catalog — the tier layer the menubar renderer consumes
 * (BLUEPRINT §4.2, S3-13).
 *
 * The S3-12 command catalog (`studio-command-catalog.ts`) is declaration data:
 * it knows every menubar command's canonical id, label and provenance, but it
 * carries no exposure tier. This module is the menubar surface's transition
 * layer on top of it:
 *
 * - Every tier judgment is derived from the public catalog inventory
 *   (`STUDIO_MENU_ITEM_INVENTORY`), so a command that is not in the catalog
 *   cannot silently gain or lose a tier, and the drift test can assert
 *   `advanced ⊆ inventory` instead of trusting a second hand-kept list.
 * - `StudioMenubarContent` renders `foldStudioMenubarGroupsForDensity(...)`
 *   output instead of deciding per-mode visibility itself. Renderers keep no
 *   per-mode conditionals of their own (BLUEPRINT §4.1: the density policy is
 *   the only judgment source; this module is its menubar projection).
 *
 * Tier rules (BLUEPRINT §4.2):
 * - `core` — always visible in every density mode.
 * - `contextual` — visible like core in the menubar. Contextual availability
 *   (selection/tool state) is already expressed per row by the item modules
 *   through `disabled`/`unavailableReason`; no menubar row is promoted to a
 *   catalog-level contextual tier yet. That promotion, together with pinned
 *   commands, is S3-14 scope.
 * - `advanced` — in `simple` (and `focus`, whose §4.1 exposure is core-only)
 *   these rows are reachable only through the group's "고급 도구 펼치기"
 *   disclosure row; in `full` they are always visible. Advanced is a fold,
 *   never a removal: command search keeps consuming the unfolded groups, so
 *   every advanced command stays searchable in every mode.
 *
 * Which commands are advanced — two grounded rules, no per-item taste:
 * 1. Whole catalogue source groups that are specialist or low-frequency for
 *    the daily webtoon workflow (the surface-complexity audit's S3-13 merge
 *    note: fold low-frequency composite source groups behind the expander):
 *    `3d`, `animation`, `collaboration`, `transform`, `window`, plus the
 *    detached `ai` action group — the density matrix already folds the AI
 *    toolbar cluster in simple (`toolbar-ai`), so the menubar agrees.
 * 2. The filter pack: the catalog itself records the split — "마지막 필터 +
 *    코어 5 + 레이어 보정 2" are the core rows and the remaining filter-pack
 *    rows (44) are specialist effects. Only those 8 named rows stay core.
 */
import { STUDIO_MENU_ITEM_INVENTORY } from "./studio-command-catalog";

import type { StudioUiDensityMode } from "./studio-ui-density";

export type StudioMenubarCommandTier = "core" | "contextual" | "advanced";

/** Catalogue source groups whose whole section is advanced (rule 1 above). */
export const STUDIO_MENUBAR_ADVANCED_SOURCE_GROUPS = Object.freeze([
  "3d",
  "ai",
  "animation",
  "collaboration",
  "transform",
  "window",
] as const);

/** The filter rows the catalog itself calls core (rule 2 above). */
export const STUDIO_MENUBAR_FILTER_CORE_NATIVE_IDS = Object.freeze([
  "filter/last-filter",
  "filter/brightness-contrast",
  "filter/color-curves",
  "filter/hue-saturation-brightness",
  "filter/color-to-alpha",
  "filter/duotone",
  "filter/levels",
  "filter/tone-curve",
] as const);

const ADVANCED_SOURCE_GROUP_SET: ReadonlySet<string> = new Set(
  STUDIO_MENUBAR_ADVANCED_SOURCE_GROUPS,
);
const FILTER_CORE_SET: ReadonlySet<string> = new Set(
  STUDIO_MENUBAR_FILTER_CORE_NATIVE_IDS,
);

/** Qualified `<group>/<item>` id exactly as the catalog inventory spells it. */
export function studioMenubarNativeId(sourceGroupId: string, itemId: string): string {
  return `${sourceGroupId}/${itemId}`;
}

function isAdvancedNativeId(nativeId: string): boolean {
  const slash = nativeId.indexOf("/");
  if (slash <= 0) return false;
  const sourceGroupId = nativeId.slice(0, slash);
  if (ADVANCED_SOURCE_GROUP_SET.has(sourceGroupId)) return true;
  if (sourceGroupId === "filter") return !FILTER_CORE_SET.has(nativeId);
  return false;
}

/**
 * Every advanced menubar command, derived from the catalog inventory.
 * A native id that leaves the catalog leaves this list in the same change —
 * the fold can never point at a command that no longer exists.
 */
export const STUDIO_MENUBAR_ADVANCED_NATIVE_IDS: readonly string[] = Object.freeze(
  STUDIO_MENU_ITEM_INVENTORY.filter(isAdvancedNativeId),
);

const ADVANCED_NATIVE_ID_SET: ReadonlySet<string> = new Set(
  STUDIO_MENUBAR_ADVANCED_NATIVE_IDS,
);

/**
 * Tier of one menubar command by its qualified native id.
 * Unknown ids (future catalogue groups, host-only rows) default to `core`:
 * an unregistered command is never silently folded away.
 */
export function studioMenubarCommandTier(nativeId: string): StudioMenubarCommandTier {
  return ADVANCED_NATIVE_ID_SET.has(nativeId) ? "advanced" : "core";
}

export type StudioMenubarTierExposure = "visible" | "folded";

/**
 * §4.1 command exposure projected onto one tier:
 * focus = core only, simple = core + contextual, full = all.
 * `advancedExpanded` is the user's explicit disclosure, which wins in the
 * modes that fold (the same contract as the toolbar advanced expander).
 */
export function studioMenubarTierExposure(
  mode: StudioUiDensityMode,
  tier: StudioMenubarCommandTier,
  advancedExpanded: boolean,
): StudioMenubarTierExposure {
  if (tier !== "advanced") return "visible";
  if (mode === "full") return "visible";
  return advancedExpanded ? "visible" : "folded";
}

/* ------------------------------------------------------------------ fold */

export interface StudioMenubarFoldableItem {
  readonly id: string;
  /** Catalogue source group this row came from; stamped by the presentation
   *  for composite titles. Standalone groups fall back to the group id. */
  readonly sourceGroupId?: string;
  readonly separatorAfter?: boolean;
}

export interface StudioMenubarFoldableGroup<
  TItem extends StudioMenubarFoldableItem = StudioMenubarFoldableItem,
> {
  readonly id: string;
  readonly items: readonly TItem[];
}

export interface StudioMenubarFoldOptions<TItem extends StudioMenubarFoldableItem> {
  /** Undefined while the host has not wired the density preference: the
   *  renderer then keeps its legacy unfolded behaviour, exactly like the
   *  density toggle that hides itself until wired. */
  readonly mode: StudioUiDensityMode | undefined;
  readonly advancedExpanded: boolean;
  /** Builds the disclosure row for one group. The renderer supplies the
   *  localized label, icon and toggle callback; this module stays pure. */
  readonly buildFoldItem: (
    groupId: string,
    advancedCount: number,
    expanded: boolean,
  ) => TItem;
}

/**
 * Applies the density fold to presented menubar groups.
 *
 * - `full` (or an unwired mode) returns the groups untouched — same array,
 *   same group references — so the full-mode menubar is byte-identical to
 *   the pre-catalog renderer.
 * - In `simple`/`focus`, each group's advanced rows move behind one
 *   disclosure row placed at the visibility boundary: core rows first, the
 *   fold row, then — only when expanded — the advanced rows in their
 *   original relative order. A group whose rows are all advanced keeps its
 *   title with just the fold row, so the fold's existence is always shown
 *   with its count (BLUEPRINT §4.2 risk guard).
 * - Groups without advanced rows keep their original reference.
 */
export function foldStudioMenubarGroupsForDensity<
  TItem extends StudioMenubarFoldableItem,
  TGroup extends StudioMenubarFoldableGroup<TItem>,
>(groups: readonly TGroup[], options: StudioMenubarFoldOptions<TItem>): readonly TGroup[] {
  const { mode, advancedExpanded, buildFoldItem } = options;
  if (mode === undefined || mode === "full") return groups;

  let changed = false;
  const folded = groups.map((group) => {
    const visible: TItem[] = [];
    const advanced: TItem[] = [];
    for (const item of group.items) {
      const nativeId = studioMenubarNativeId(item.sourceGroupId ?? group.id, item.id);
      const tier = studioMenubarCommandTier(nativeId);
      // Advanced rows are collected even when expanded: they render after
      // the disclosure row so the row sits exactly at the visibility
      // boundary and can fold them again.
      if (tier === "advanced") advanced.push(item);
      else visible.push(item);
    }
    if (advanced.length === 0) return group;
    changed = true;
    const foldItem = buildFoldItem(group.id, advanced.length, advancedExpanded);
    const expandedVisible =
      studioMenubarTierExposure(mode, "advanced", advancedExpanded) === "visible";
    return {
      ...group,
      items: expandedVisible ? [...visible, foldItem, ...advanced] : [...visible, foldItem],
    } as TGroup;
  });
  return changed ? folded : groups;
}
