/**
 * Studio command exposure — BLUEPRINT §4.2 registry expansion (S3-14).
 *
 * The command catalog (`studio-command-catalog.ts`) is declaration data: it has
 * no tier, no surface list and no notion of a user-pinned command, so the
 * toolbar, the floating launcher, the panel mount points and the in-editor
 * command search each re-decided what to show. This module is the single
 * judgment source those four surfaces consume:
 *
 * - Tier and surfaces are DERIVED from catalog data already measured
 *   (category + origin sources), never hand-listed per command, so a new
 *   catalog entry is classified the moment it is registered and cannot drift.
 * - Exposure is `density mode × tier`, with the two BLUEPRINT §4.2 invariants
 *   that outrank the matrix:
 *   1. Command search (palette) reaches EVERY tier in EVERY mode — tier is a
 *      presentation order, never a deletion. Advanced hits carry a badge.
 *   2. A user-pinned command outranks tier: it is always exposed, and pinning
 *      also mounts it on the toolbar and the launcher.
 * - This module is pure (storage is injected, like `studio-ui-density.ts`).
 *   Host wiring (StudioPage / menubar renderers consuming these selectors)
 *   stays with the host-patch track; renderers must not re-implement the
 *   matrix with their own per-mode conditionals.
 */

import type { StudioUiDensityMode } from "./studio-ui-density";

/* ------------------------------------------------------------------ types */

export const STUDIO_COMMAND_TIERS = ["core", "contextual", "advanced"] as const;
export type StudioCommandTier = (typeof STUDIO_COMMAND_TIERS)[number];

export const STUDIO_COMMAND_SURFACES = [
  "menubar",
  "toolbar",
  "panel",
  "launcher",
  "palette",
] as const;
export type StudioCommandSurface = (typeof STUDIO_COMMAND_SURFACES)[number];

/**
 * Structural minimum of a catalog entry this module reads. The real
 * `StudioCommandCatalogEntry` (id: CommandId, LocalizedLabel[],
 * TerminologyAlias[], origins with `source`) is assignable to this shape, so
 * callers pass `STUDIO_COMMAND_CATALOG` directly without an adapter.
 */
export interface StudioCommandExposureEntry {
  id: string;
  category: string;
  labels: readonly { locale: string; label: string }[];
  aliases: readonly { term: string }[];
  origins: readonly { source: string }[];
}

export interface StudioCommandExposureContext {
  mode: StudioUiDensityMode;
  /** Pinned command ids, in the user's pin order. */
  pinnedIds?: readonly string[];
  /**
   * Categories relevant right now (active tool, selection, episode stage).
   * A contextual command is exposed outside `full` only when its category is
   * listed here — e.g. lettering commands while a speech balloon is selected.
   */
  activeCategories?: readonly string[];
}

export interface StudioCommandSearchHit {
  entry: StudioCommandExposureEntry;
  tier: StudioCommandTier;
  pinned: boolean;
  /** "advanced" when the hit needs the 고급 도구 badge in search results. */
  badge: StudioCommandTier | null;
}

/* ------------------------------------------------------- tier derivation */

/**
 * Categories whose commands are professional-only bulk: the filter gallery
 * (52 catalog entries) and AI generation. This matches the density matrix,
 * which already folds `toolbar-ai` away in simple/focus.
 */
const ADVANCED_CATEGORIES: ReadonlySet<string> = new Set(["filter", "ai"]);

/** Origin sources that prove a command already lives on a quick surface. */
const QUICK_SURFACE_SOURCES: ReadonlySet<string> = new Set(["quick-access", "radial"]);

/**
 * Derive the BLUEPRINT §4.2 tier from measured catalog data:
 * - `core` — the command already earned a place on a curated quick surface
 *   (quick-access or radial origin). Core stays small because those lists are
 *   small; promoting a command to core means adding it to a quick surface,
 *   which is the exchange the blueprint asks for.
 * - `advanced` — filter/AI category commands that no quick surface curates.
 * - `contextual` — everything else: menu/keymap/help commands shown when
 *   their category is relevant to the current tool, selection or stage.
 */
export function studioCommandTier(entry: StudioCommandExposureEntry): StudioCommandTier {
  if (entry.origins.some((origin) => QUICK_SURFACE_SOURCES.has(origin.source))) {
    return "core";
  }
  if (ADVANCED_CATEGORIES.has(entry.category)) return "advanced";
  return "contextual";
}

/* ---------------------------------------------------- surface derivation */

/** Surfaces a pin mounts a command on, on top of its derived surfaces. */
export const STUDIO_COMMAND_PIN_SURFACES: readonly StudioCommandSurface[] = Object.freeze([
  "toolbar",
  "launcher",
]);

/**
 * Derive the surfaces a command belongs to, from its origins and category:
 * - `menubar`: menu / edit-menu origin.
 * - `toolbar`: quick-access origin, or a drawing-tool category command.
 * - `launcher`: quick-access / radial origin (the floating quick surfaces).
 * - `panel`: window-category commands toggle panels and panel hosts.
 * - `palette`: every command — search is the universal reachability path.
 */
export function studioCommandSurfaces(
  entry: StudioCommandExposureEntry,
): readonly StudioCommandSurface[] {
  const sources = new Set(entry.origins.map((origin) => origin.source));
  const surfaces: StudioCommandSurface[] = [];
  if (sources.has("menu") || sources.has("edit-menu")) surfaces.push("menubar");
  if (sources.has("quick-access") || entry.category === "tool" || entry.category === "brush") {
    surfaces.push("toolbar");
  }
  if (sources.has("quick-access") || sources.has("radial")) surfaces.push("launcher");
  if (entry.category === "window") surfaces.push("panel");
  surfaces.push("palette");
  return Object.freeze(surfaces);
}

/** Derived surfaces plus the pin mounts, when the command is pinned. */
export function studioCommandEffectiveSurfaces(
  entry: StudioCommandExposureEntry,
  pinned: boolean,
): readonly StudioCommandSurface[] {
  const derived = studioCommandSurfaces(entry);
  if (!pinned) return derived;
  const merged = [...derived];
  for (const surface of STUDIO_COMMAND_PIN_SURFACES) {
    if (!merged.includes(surface)) merged.push(surface);
  }
  return Object.freeze(merged);
}

/* ------------------------------------------------------------- exposure */

/**
 * The tier × density matrix (BLUEPRINT §4.1 command exposure row):
 * - focus: core only (+ search) — contextual stays searchable, not mounted.
 * - simple: core + contextual-when-active.
 * - full: everything.
 * Palette and pinned are handled by the callers below, not this matrix.
 */
export function studioCommandTierExposed(
  tier: StudioCommandTier,
  mode: StudioUiDensityMode,
  contextualActive: boolean,
): boolean {
  if (mode === "full") return true;
  if (tier === "core") return true;
  if (mode === "simple" && tier === "contextual") return contextualActive;
  return false;
}

/**
 * Is this command exposed on this surface right now?
 * Invariants, in priority order: palette reaches every tier in every mode;
 * a pin outranks tier and density; otherwise the matrix decides, and only
 * for commands that belong to the surface.
 */
export function isStudioCommandExposed(
  entry: StudioCommandExposureEntry,
  surface: StudioCommandSurface,
  context: StudioCommandExposureContext,
): boolean {
  const pinned = (context.pinnedIds ?? []).includes(entry.id);
  if (!studioCommandEffectiveSurfaces(entry, pinned).includes(surface)) return false;
  if (surface === "palette") return true;
  if (pinned) return true;
  const active = new Set(context.activeCategories ?? []);
  return studioCommandTierExposed(
    studioCommandTier(entry),
    context.mode,
    active.has(entry.category),
  );
}

/**
 * Ordered commands for one mount point (toolbar, launcher, panel, menubar):
 * pinned first in pin order, then the rest in catalog order. Palette mounts
 * use `searchStudioCommands` instead, which applies the same pin-first order.
 */
export function studioCommandsForSurface(
  entries: readonly StudioCommandExposureEntry[],
  surface: StudioCommandSurface,
  context: StudioCommandExposureContext,
): StudioCommandExposureEntry[] {
  const pinnedIds = context.pinnedIds ?? [];
  const pinRank = new Map(pinnedIds.map((id, index) => [id, index] as const));
  return entries
    .filter((entry) => isStudioCommandExposed(entry, surface, context))
    .sort((a, b) => {
      const rankA = pinRank.get(a.id);
      const rankB = pinRank.get(b.id);
      if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
      if (rankA !== undefined) return -1;
      if (rankB !== undefined) return 1;
      return 0;
    });
}

/* --------------------------------------------------------------- search */

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase();
}

function entryMatchesQuery(entry: StudioCommandExposureEntry, query: string): boolean {
  if (query === "") return true;
  if (entry.id.toLowerCase().includes(query)) return true;
  if (entry.labels.some((label) => label.label.toLowerCase().includes(query))) return true;
  return entry.aliases.some((alias) => alias.term.toLowerCase().includes(query));
}

/**
 * Command search over the whole registry. Every tier is reachable in every
 * density mode (BLUEPRINT §4.2 acceptance for S3-14); advanced hits are
 * flagged so the renderer can attach the 고급 도구 badge instead of hiding
 * them. Pinned hits sort first, in pin order; the rest keep catalog order.
 */
export function searchStudioCommands(
  entries: readonly StudioCommandExposureEntry[],
  query: string,
  context: Pick<StudioCommandExposureContext, "pinnedIds">,
): StudioCommandSearchHit[] {
  const normalized = normalizeQuery(query);
  const pinnedIds = context.pinnedIds ?? [];
  const pinRank = new Map(pinnedIds.map((id, index) => [id, index] as const));
  return entries
    .filter((entry) => entryMatchesQuery(entry, normalized))
    .map((entry) => {
      const tier = studioCommandTier(entry);
      return {
        entry,
        tier,
        pinned: pinRank.has(entry.id),
        badge: tier === "advanced" ? ("advanced" as const) : null,
      };
    })
    .sort((a, b) => {
      const rankA = pinRank.get(a.entry.id);
      const rankB = pinRank.get(b.entry.id);
      if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
      if (rankA !== undefined) return -1;
      if (rankB !== undefined) return 1;
      return 0;
    });
}

/** Korean badge label for advanced search hits; single source for renderers. */
export const STUDIO_COMMAND_ADVANCED_BADGE_LABEL = "고급 도구";

/* --------------------------------------------------------- pinned store */

export const STUDIO_PINNED_COMMANDS_STORAGE_KEY = "toonstudio-studio-pinned-commands:v1";

export interface StudioPinnedCommandsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Pin order is user order: dedupe keeps the first occurrence, ids only. */
export function normalizePinnedCommandIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item === "" || seen.has(item)) continue;
    seen.add(item);
    ids.push(item);
  }
  return ids;
}

export function loadPinnedCommandIds(
  storage: StudioPinnedCommandsStorage | null | undefined,
): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STUDIO_PINNED_COMMANDS_STORAGE_KEY);
    if (!raw) return [];
    return normalizePinnedCommandIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function savePinnedCommandIds(
  storage: StudioPinnedCommandsStorage | null | undefined,
  ids: readonly string[],
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STUDIO_PINNED_COMMANDS_STORAGE_KEY, JSON.stringify(normalizePinnedCommandIds(ids)));
    return true;
  } catch {
    return false;
  }
}

/** Toggle one pin; a new pin appends, so pin order equals pinning order. */
export function togglePinnedCommandId(ids: readonly string[], id: string): string[] {
  const normalized = normalizePinnedCommandIds(ids);
  return normalized.includes(id)
    ? normalized.filter((pinned) => pinned !== id)
    : [...normalized, id];
}
