import { getAuthSessionRevision, getAuthUserId } from "@/domains/auth/public/session/auth-session-state";
import { accessStudioSpaceRecord } from "./studio-space-device-record";
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

/** 구판의 계정 없는 기기 초안을 새로 로그인한 회원에게 귀속하지 않는다. */
export function studioWorldDeviceScope(deviceKey: string) {
  const actor = getAuthUserId();
  const revision = getAuthSessionRevision();
  return { key: actor ? "studio-space-actor-record:v1:" + JSON.stringify([actor, deviceKey]) : deviceKey,
    current: () => getAuthUserId() === actor && getAuthSessionRevision() === revision };
}

function decode(raw: string | null): StudioWorldAuthoringDraftRecord | null {
  if (!raw) return null;
  try {
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
  } catch { return null; }
}

export async function readStudioWorldAuthoringDraftRecord(projectId: string): Promise<StudioWorldAuthoringDraftRecord | null> {
  const scope = studioWorldDeviceScope(studioWorldDraftStorageKey(projectId));
  const raw = await accessStudioSpaceRecord(scope.key, undefined, scope.current);
  return scope.current() ? decode(raw) : null;
}

export async function readStudioWorldAuthoringDraft(projectId: string): Promise<StudioVirtualSpaceWorldManifest | null> {
  return (await readStudioWorldAuthoringDraftRecord(projectId))?.manifest ?? null;
}

export async function writeStudioWorldAuthoringDraft(
  projectId: string,
  manifest: StudioVirtualSpaceWorldManifest,
  basePublishedRevisionId?: string | null,
  tiles?: { readonly scope: string; readonly effects: readonly StudioTileEffectDefinition[] },
): Promise<boolean> {
  if (validateStudioWorldManifest(manifest).length || !validDraftBase(basePublishedRevisionId)) return false;
  const scope = studioWorldDeviceScope(studioWorldDraftStorageKey(projectId));
  try {
    await accessStudioSpaceRecord(scope.key, raw => {
      const previous = decode(raw);
      const tileEffectsByScope = previous?.tileEffectsByScope;
      return { preserveDamaged: raw !== null && !previous, value: JSON.stringify({ contract: WORLD_DRAFT_CONTRACT,
        manifest, basePublishedRevisionId, tileEffectsByScope: tiles ? { ...tileEffectsByScope, [tiles.scope]: tiles.effects } : tileEffectsByScope }) };
    }, scope.current);
    return scope.current();
  } catch { return false; }
}

/** 복제한 월드의 타일만 고쳐도 다른 탭에서 변경한 지도와 게시 기준은 유지한다. */
export async function updateStudioWorldDraftTiles(projectId: string, tileScope: string, effects: readonly StudioTileEffectDefinition[]) {
  const scope = studioWorldDeviceScope(studioWorldDraftStorageKey(projectId));
  let updated = false;
  await accessStudioSpaceRecord(scope.key, raw => {
    const draft = decode(raw);
    if (!draft?.tileEffectsByScope?.[tileScope]) return { value: raw };
    updated = true;
    return { value: JSON.stringify({ contract: WORLD_DRAFT_CONTRACT, ...draft, tileEffectsByScope: { ...draft.tileEffectsByScope, [tileScope]: effects } }) };
  }, scope.current);
  return updated;
}

export async function clearStudioWorldAuthoringDraft(projectId: string): Promise<boolean> {
  const scope = studioWorldDeviceScope(studioWorldDraftStorageKey(projectId));
  try {
    await accessStudioSpaceRecord(scope.key, raw => ({ value: null, preserveDamaged: raw !== null && !decode(raw) }), scope.current);
    return scope.current();
  } catch { return false; }
}
