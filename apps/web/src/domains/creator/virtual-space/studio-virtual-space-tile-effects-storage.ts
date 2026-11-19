import {
  createTileEffect,
  type StudioTileEffectDefinition,
  type StudioTileEffectInput,
} from "./studio-virtual-space-tile-effects";

import { accessStudioSpaceRecord } from "./studio-space-device-record";
import { readStudioWorldAuthoringDraftRecord, studioWorldDeviceScope, updateStudioWorldDraftTiles } from "./studio-world-draft-storage";

function authoringProject(scope?: string): string | null {
  if (!scope?.startsWith("[")) return null;
  try {
    const fields: unknown = JSON.parse(scope);
    return Array.isArray(fields) && fields.length === 3 && typeof fields[0] === "string" && fields[2] === true ? fields[0] : null;
  } catch { return null; }
}

const TILE_EFFECTS_STORAGE_KEY = "toonspectrum:virtual-space-tile-effects:v1";

function storageKey(scope?: string): string {
  return scope ? `${TILE_EFFECTS_STORAGE_KEY}:${encodeURIComponent(scope)}` : TILE_EFFECTS_STORAGE_KEY;
}

/** 저장값을 살균된 타일 이펙트 목록으로 되돌린다. 형식이 깨졌으면 빈 목록. */
export function parseStudioTileEffects(raw: string | null): readonly StudioTileEffectDefinition[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const effects: StudioTileEffectDefinition[] = [];
  for (const item of parsed) {
    const result = createTileEffect(item as StudioTileEffectInput, effects.map((effect) => effect.id));
    if (result.ok) effects.push(result.effect);
  }
  return Object.freeze(effects);
}

export async function readStudioTileEffects(scope?: string): Promise<readonly StudioTileEffectDefinition[]> {
  const record = studioWorldDeviceScope(storageKey(scope));
  const projectId = authoringProject(scope);
  const draft = projectId && scope ? await readStudioWorldAuthoringDraftRecord(projectId) : null;
  const override = scope ? draft?.tileEffectsByScope?.[scope] : undefined;
  const raw = Array.isArray(override) ? JSON.stringify(override) : await accessStudioSpaceRecord(record.key, undefined, record.current);
  return record.current() ? parseStudioTileEffects(raw) : [];
}

export async function writeStudioTileEffects(effects: readonly StudioTileEffectDefinition[], scope?: string): Promise<boolean> {
  const record = studioWorldDeviceScope(storageKey(scope));
  try {
    const projectId = authoringProject(scope);
    if (projectId && scope && await updateStudioWorldDraftTiles(projectId, scope, effects)) return record.current();
    if (!record.current()) return false;
    await accessStudioSpaceRecord(record.key, raw => ({ value: JSON.stringify(effects),
      preserveDamaged: raw !== null && !isValidTileRecord(raw) }), record.current);
    return record.current();
  } catch { return false; }
}

function isValidTileRecord(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length === parseStudioTileEffects(raw).length;
  } catch { return false; }
}
