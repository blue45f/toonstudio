import {
  CHARACTER_SLOT_CATALOG_REVISION_FALLBACK,
  CHARACTER_SLOT_ENTRY_VERSION_FALLBACK,
} from "../document/character-document-v2";

import type { CharacterSlotCatalog } from "../../character-shaper/character-shaper-contract";
import type { CharacterPartPresetPayload, CharacterPartPresetV1 } from "./character-part-preset";

export const LEGACY_LOOK_FORMAT = "toonstudio.character-lab.look/1";
export const LEGACY_LOOK_LIBRARY_KEY = "toonstudio.character-lab.look-library.v1";
export const MAX_LEGACY_RECIPE_BYTES = 64 * 1024 * 1024;

const HAIR_STYLES = new Map([
  ["hair/short-layered", "hair:short"], ["hair/soft-bob", "hair:bob"],
  ["hair/romance-long", "hair:long"], ["hair/action-pony", "hair:ponytail"],
  ["hair/hime-cut", "hair:hime"], ["hair/wolf-layered", "hair:wolf"], ["hair/twin-tail", "hair:twintail"],
]);

const COLOR_TARGETS = [
  ["skin", "skin"], ["iris", "iris"], ["hair", "hairBase"], ["hair-tip", "hairTip"],
  ["top", "top"], ["bottom", "bottom"], ["shoes", "shoes"],
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLook(value: Record<string, unknown>): boolean {
  return value.format === LEGACY_LOOK_FORMAT && typeof value.id === "string"
    && typeof value.nameKo === "string" && typeof value.scope === "string"
    && ["full", "outfit", "face", "colors", "style"].includes(value.scope) && isRecord(value.payload);
}

function isRecipe(value: Record<string, unknown>): boolean {
  return (value.version === 1 || value.version === 2 || value.version === 3)
    && isRecord(value.source) && ["procedural", "kit", "package"].includes(String(value.source.kind))
    && isRecord(value.slots) && isRecord(value.colors) && isRecord(value.pose) && isRecord(value.paint);
}

export interface LegacyAppearancePart {
  readonly key: string;
  readonly label: string;
  readonly payload: CharacterPartPresetPayload;
}

export interface LegacyAppearance {
  readonly name: string;
  readonly parts: readonly LegacyAppearancePart[];
}

/** 원본의 메시와 같은 모델이라고 가정하지 않고, Studio 카탈로그에서 실제 선택할 수 있는 값만 제시한다. */
export function readLegacyAppearance(value: unknown, fileName: string, catalog: CharacterSlotCatalog): LegacyAppearance {
  if (!isRecord(value) || (!isLook(value) && !isRecipe(value))) throw new Error("unsupported-source");
  const source = isRecord(value.payload) && value.format === LEGACY_LOOK_FORMAT ? value.payload : value;
  const name = typeof value.nameKo === "string" ? value.nameKo : fileName;
  const slots = isRecord(source.slots) ? source.slots : {};
  const parts: LegacyAppearancePart[] = [];
  for (const slot of catalog.slots) {
    const id = slots[slot.id];
    if (typeof id !== "string" || !id.startsWith(`${slot.id}/`)) continue;
    const entryId = HAIR_STYLES.get(id) ?? id.replace("/", ":");
    const entry = catalog.entries.find((candidate) => candidate.slot === slot.id && candidate.id === entryId);
    if (!entry) continue;
    parts.push({ key: slot.id, label: entry.label, payload: {
      slot: slot.id,
      selections: [{ entryId: entry.id, entryVersion: CHARACTER_SLOT_ENTRY_VERSION_FALLBACK,
        providerId: "toonstudio-builtin", catalogRevision: CHARACTER_SLOT_CATALOG_REVISION_FALLBACK }],
    } });
  }
  const colors = isRecord(source.colors) ? source.colors : {};
  for (const [legacy, target] of COLOR_TARGETS) {
    const color = colors[legacy];
    if (color === undefined) continue;
    if (typeof color !== "string" || !/^#[0-9a-f]{6}$/iu.test(color)) throw new Error("invalid-color");
    parts.push({ key: `color-${target}`, label: legacy, payload: { colors: { [target]: color.toLowerCase() } } });
  }
  return { name: name.trim().slice(0, 40) || fileName, parts };
}

export function readLegacyLookLibrary(raw: string | null): readonly { name: string; look: unknown }[] {
  if (raw === null) return [];
  const library: unknown = JSON.parse(raw);
  if (!isRecord(library) || library.format !== "toonstudio.character-lab.look-library/1" || !Array.isArray(library.entries)) {
    throw new Error("invalid-library");
  }
  return library.entries.map((entry: unknown) => {
    if (!isRecord(entry) || !isRecord(entry.look) || !isLook(entry.look) || typeof entry.look.nameKo !== "string") throw new Error("invalid-look");
    return { name: entry.look.nameKo, look: entry.look };
  });
}

/** 같은 이름의 서로 다른 파일이 기존 프리셋을 덮어쓰지 않도록 내용에 따라 식별한다. */
export async function legacyAppearancePresets(source: LegacyAppearance): Promise<readonly CharacterPartPresetV1[]> {
  const bytes = new TextEncoder().encode(JSON.stringify(source));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const id = Array.from(hash, (value) => value.toString(16).padStart(2, "0")).join("");
  const now = new Date().toISOString();
  return source.parts.map((part) => ({
    schemaVersion: 1, presetId: `legacy-look:${id}:${part.key}`, version: 1,
    name: `${source.name} · ${part.label}`.slice(0, 60), description: "",
    kind: part.payload.slot ? "slot" : "palette", scope: "personal", tags: [],
    sourceModel: { assetId: "legacy-character", assetVersion: "imported", topologyFamily: null },
    compatibility: { topologyFamilies: [], requiredCapabilities: [], allowPartial: true },
    payload: part.payload, createdAt: now, updatedAt: now,
  }));
}
