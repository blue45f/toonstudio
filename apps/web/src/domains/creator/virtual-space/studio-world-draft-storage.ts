import { validateStudioWorldManifest, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import type { StudioTileEffectDefinition } from "./studio-virtual-space-tile-effects";

const WORLD_DRAFT_PREFIX = "toonspectrum:virtual-studio-world-draft:v1";
const WORLD_DRAFT_CONTRACT = "studio-world-browser-draft-v2";

export interface StudioWorldAuthoringDraftRecord {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly tileEffectsByScope?: Readonly<Record<string, readonly StudioTileEffectDefinition[]>>;
  /** Undefined means a legacy/unbased draft; null explicitly means no server publication. */
  readonly basePublishedRevisionId?: string | null;
}
function validDraftBase(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || (typeof value === "string" && value.length > 0
    && value.length <= 240 && [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127));
}

export function studioWorldDraftStorageKey(projectId: string): string {
  return `${WORLD_DRAFT_PREFIX}:${projectId}`;
}

export function readStudioWorldAuthoringDraftRecord(
  projectId: string,
): StudioWorldAuthoringDraftRecord | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(studioWorldDraftStorageKey(projectId));
    if (!raw) return null;
    const candidate = JSON.parse(raw);
    if (candidate?.contract === WORLD_DRAFT_CONTRACT) {
      if (!validDraftBase(candidate.basePublishedRevisionId) || validateStudioWorldManifest(candidate.manifest).length) return null;
      return {
        manifest: candidate.manifest, basePublishedRevisionId: candidate.basePublishedRevisionId,
        ...(candidate.tileEffectsByScope && typeof candidate.tileEffectsByScope === "object" && !Array.isArray(candidate.tileEffectsByScope)
          ? { tileEffectsByScope: candidate.tileEffectsByScope } : {}),
      };
    }
    return validateStudioWorldManifest(candidate).length === 0 ? { manifest: candidate } : null;
  } catch {
    return null;
  }
}

export function readStudioWorldAuthoringDraft(projectId: string): StudioVirtualSpaceWorldManifest | null {
  return readStudioWorldAuthoringDraftRecord(projectId)?.manifest ?? null;
}

export function writeStudioWorldAuthoringDraft(
  projectId: string,
  manifest: StudioVirtualSpaceWorldManifest,
  basePublishedRevisionId?: string | null,
  tiles?: { readonly scope: string; readonly effects: readonly StudioTileEffectDefinition[] },
): boolean {
  if (typeof localStorage === "undefined") return false;
  if (validateStudioWorldManifest(manifest).length > 0 || !validDraftBase(basePublishedRevisionId)) return false;
  try {
    const previous = readStudioWorldAuthoringDraftRecord(projectId)?.tileEffectsByScope;
    const tileEffectsByScope = tiles ? { ...previous, [tiles.scope]: tiles.effects } : previous;
    localStorage.setItem(studioWorldDraftStorageKey(projectId), JSON.stringify({
      contract: WORLD_DRAFT_CONTRACT, manifest, basePublishedRevisionId, tileEffectsByScope,
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearStudioWorldAuthoringDraft(projectId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(studioWorldDraftStorageKey(projectId));
  } catch {
    // Storage can be blocked in privacy-restricted contexts.
  }
}
