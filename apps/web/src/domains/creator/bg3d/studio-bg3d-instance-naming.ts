import { PRIMITIVE_DEFS, type BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";

export const STUDIO_BG3D_INSTANCE_NAME_MAX_LENGTH = 80;
const FALLBACK_CACHE_MAX_ENTRIES = 4_096;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function truncateCodePoints(value: string, maxCodePoints: number): string {
  const codePoints = [...value];
  if (codePoints.length <= maxCodePoints) return value;
  return codePoints.slice(0, Math.max(1, maxCodePoints)).join("").trimEnd();
}

export function splitStudioBg3dInstanceNameStem(raw: string): {
  readonly stem: string;
  readonly suffix: number | null;
} {
  const normalized = normalizeWhitespace(raw);
  if (!normalized) return { stem: "객체", suffix: null };
  const match = /^(.+?)\s+(\d+)$/u.exec(normalized);
  if (!match) return { stem: normalized, suffix: null };
  const parsed = Number(match[2]);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 999_999) {
    return { stem: normalized, suffix: null };
  }
  const stem = match[1]?.trim() || "객체";
  return { stem, suffix: parsed };
}

function formatNumberedInstanceName(stem: string, suffix: number): string {
  const suffixToken = ` ${suffix}`;
  const suffixCodePoints = [...suffixToken].length;
  const maxStemCodePoints = Math.max(1, STUDIO_BG3D_INSTANCE_NAME_MAX_LENGTH - suffixCodePoints);
  const safeStem = truncateCodePoints(stem, maxStemCodePoints) || "객체";
  return `${safeStem}${suffixToken}`;
}

/**
 * 장면 내 기존 인스턴스 이름들과 충돌하지 않는 다음 안정 이름을 할당한다.
 * - `alwaysNumber: true`: 배치 시 `상자 1`, `상자 2`, `상자 3`처럼 항상 번호를 부여하며 앞 번호가 삭제되어도 기존 최대 번호 다음 값을 사용한다.
 * - `alwaysNumber: false`(기본값, 복제용): `"창가 의자"` 복제 시 `"창가 의자 2"`, `"창가 의자 3"`을 순차 부여한다.
 */
export function allocateStudioBg3dNextInstanceName(input: {
  readonly baseName: string;
  readonly occupiedNames: ReadonlySet<string>;
  readonly alwaysNumber?: boolean;
}): string {
  const { stem } = splitStudioBg3dInstanceNameStem(input.baseName);
  const normalizedOccupied = new Set<string>();
  let maxSuffix = 0;

  for (const existing of input.occupiedNames) {
    const clean = normalizeWhitespace(existing);
    if (!clean) continue;
    normalizedOccupied.add(clean);
    if (clean === stem) {
      maxSuffix = Math.max(maxSuffix, 1);
      continue;
    }
    const parsed = splitStudioBg3dInstanceNameStem(clean);
    if (parsed.suffix !== null && parsed.stem === stem) {
      maxSuffix = Math.max(maxSuffix, parsed.suffix);
    }
  }

  let nextSuffix = input.alwaysNumber ? Math.max(1, maxSuffix + 1) : Math.max(2, maxSuffix + 1);
  let candidate = formatNumberedInstanceName(stem, nextSuffix);
  while (normalizedOccupied.has(candidate)) {
    nextSuffix += 1;
    candidate = formatNumberedInstanceName(stem, nextSuffix);
  }
  return candidate;
}

export function collectStudioBg3dOccupiedInstanceNames(input: {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly fallbackLabelsByEntityId?: ReadonlyMap<string, string>;
}): Set<string> {
  const occupied = new Set<string>();
  for (const prim of input.primitives) {
    const label = prim.name?.trim() || input.fallbackLabelsByEntityId?.get(prim.id)?.trim();
    if (label) occupied.add(normalizeWhitespace(label));
  }
  for (const inst of input.customModels) {
    const label = inst.name?.trim() || input.fallbackLabelsByEntityId?.get(inst.id)?.trim();
    if (label) occupied.add(normalizeWhitespace(label));
  }
  return occupied;
}

/**
 * 명시적 `name`이 없는 레거시/초기 노드에 대해서도 엔티티 ID 기준 안정 라벨을 고정해,
 * 앞선 형제 인스턴스를 삭제하거나 순서를 바꿔도 나머지 인스턴스 번호가 밀리지 않게 보장한다.
 */
export function resolveStudioBg3dStableEntityLabels(input: {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly modelLibrary: readonly { readonly id: string; readonly name: string }[];
  readonly fallbackCache: Map<string, string>;
}): ReadonlyMap<string, string> {
  const modelNameById = new Map(
    input.modelLibrary.map((entry) => [entry.id, entry.name?.trim() || "3D 모델"] as const),
  );
  const resolved = new Map<string, string>();
  const occupied = new Set<string>();

  for (const prim of input.primitives) {
    const explicit = prim.name?.trim();
    if (explicit) {
      const clean = normalizeWhitespace(explicit);
      resolved.set(prim.id, clean);
      occupied.add(clean);
    }
  }
  for (const inst of input.customModels) {
    const explicit = inst.name?.trim();
    if (explicit) {
      const clean = normalizeWhitespace(explicit);
      resolved.set(inst.id, clean);
      occupied.add(clean);
    }
  }

  const assignStableFallback = (entityId: string, defaultBaseName: string) => {
    const cached = input.fallbackCache.get(entityId);
    if (cached && !occupied.has(cached)) {
      resolved.set(entityId, cached);
      occupied.add(cached);
      return;
    }
    const next = allocateStudioBg3dNextInstanceName({
      baseName: defaultBaseName,
      occupiedNames: occupied,
      alwaysNumber: true,
    });
    if (input.fallbackCache.size >= FALLBACK_CACHE_MAX_ENTRIES && !input.fallbackCache.has(entityId)) {
      const oldestKey = input.fallbackCache.keys().next().value;
      if (typeof oldestKey === "string") input.fallbackCache.delete(oldestKey);
    }
    input.fallbackCache.set(entityId, next);
    resolved.set(entityId, next);
    occupied.add(next);
  };

  for (const prim of input.primitives) {
    if (!resolved.has(prim.id)) {
      assignStableFallback(prim.id, PRIMITIVE_DEFS[prim.kind].label);
    }
  }
  for (const inst of input.customModels) {
    if (!resolved.has(inst.id)) {
      assignStableFallback(inst.id, modelNameById.get(inst.modelId) ?? "3D 모델");
    }
  }

  return resolved;
}

export function nameNewStudioBg3dPrimitive(
  primitive: BgPrimitive,
  live: { readonly primitives: readonly BgPrimitive[]; readonly customModels: readonly BgCustomModelInstance[] },
  fallbackLabelsByEntityId?: ReadonlyMap<string, string>,
): BgPrimitive {
  if (primitive.name?.trim()) return primitive;
  const occupiedNames = collectStudioBg3dOccupiedInstanceNames({ ...live, fallbackLabelsByEntityId });
  return {
    ...primitive,
    name: allocateStudioBg3dNextInstanceName({
      baseName: PRIMITIVE_DEFS[primitive.kind].label,
      occupiedNames,
      alwaysNumber: true,
    }),
  };
}

export function nameNewStudioBg3dCustomModel(
  instance: BgCustomModelInstance,
  baseName: string,
  live: { readonly primitives: readonly BgPrimitive[]; readonly customModels: readonly BgCustomModelInstance[] },
  fallbackLabelsByEntityId?: ReadonlyMap<string, string>,
): BgCustomModelInstance {
  if (instance.name?.trim()) return instance;
  const occupiedNames = collectStudioBg3dOccupiedInstanceNames({ ...live, fallbackLabelsByEntityId });
  return {
    ...instance,
    name: allocateStudioBg3dNextInstanceName({
      baseName: baseName.trim() || "3D 모델",
      occupiedNames,
      alwaysNumber: true,
    }),
  };
}

export function assignUniqueNamesToDuplicatedBatch(input: {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly modelLibrary?: readonly { readonly id: string; readonly name: string }[];
  readonly fallbackLabelsByEntityId?: ReadonlyMap<string, string>;
  readonly primitivePairs: ReadonlyArray<{ source: BgPrimitive; clone: BgPrimitive }>;
  readonly modelPairs: ReadonlyArray<{ source: BgCustomModelInstance; clone: BgCustomModelInstance }>;
}): {
  readonly primitivePairs: Array<{ source: BgPrimitive; clone: BgPrimitive }>;
  readonly modelPairs: Array<{ source: BgCustomModelInstance; clone: BgCustomModelInstance }>;
} {
  const occupiedNames = collectStudioBg3dOccupiedInstanceNames({
    primitives: input.primitives,
    customModels: input.customModels,
    fallbackLabelsByEntityId: input.fallbackLabelsByEntityId,
  });
  const modelNameById = new Map(
    (input.modelLibrary ?? []).map((entry) => [entry.id, entry.name?.trim() || "3D 모델"] as const),
  );
  const primitivePairs = input.primitivePairs.map(({ source, clone }) => {
    const baseName =
      source.name?.trim() ||
      input.fallbackLabelsByEntityId?.get(source.id) ||
      PRIMITIVE_DEFS[source.kind].label;
    const nextName = allocateStudioBg3dNextInstanceName({ baseName, occupiedNames });
    occupiedNames.add(nextName);
    return { source, clone: { ...clone, name: nextName } };
  });
  const modelPairs = input.modelPairs.map(({ source, clone }) => {
    const baseName =
      source.name?.trim() ||
      input.fallbackLabelsByEntityId?.get(source.id) ||
      modelNameById.get(source.modelId) ||
      "3D 모델";
    const nextName = allocateStudioBg3dNextInstanceName({ baseName, occupiedNames });
    occupiedNames.add(nextName);
    return { source, clone: { ...clone, name: nextName } };
  });
  return { primitivePairs, modelPairs };
}

