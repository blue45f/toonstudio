/** 제거한 외부 혼색 획의 원본 복원에만 사용하는 제한된 출처 계약이다. */
export interface StudioLegacyPigmentArchive {
  version: 1;
  sourceElementId: string;
  sourceGroupId?: string;
  sourceIndex: number;
  sourceHidden?: boolean;
}

/** v7은 보관 출처 또는 기존 DrawEl 보존 필드를 가진 획에만 사용한다. */
export const STUDIO_PRESERVED_DRAW_METADATA_STROKE_VERSION = 7 as const;
export const STUDIO_LEGACY_PIGMENT_ARCHIVE_STROKE_VERSION = STUDIO_PRESERVED_DRAW_METADATA_STROKE_VERSION;
export const STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY = "legacy-pigment-preservation.v1";
export const STUDIO_LEGACY_PIGMENT_ARCHIVE_ELEMENT_EXTENSION_KEYS = ["psdGroupId", "psdRasterSourceId", "psdSource", "psdFolderPath", "colorizeMask", "colorizeMaskEnabled", "linked3dCorrection"] as const;
const KEYS = ["version", "sourceElementId", "sourceGroupId", "sourceIndex", "sourceHidden"];
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    ? value as Record<string, unknown> : null;
}
function id(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && !/\p{Cc}/u.test(value);
}
export function parseStudioLegacyPigmentArchive(value: unknown): StudioLegacyPigmentArchive | null {
  const source = record(value);
  if (!source || Object.keys(source).some((key) => !KEYS.includes(key)) || source.version !== 1
    || !id(source.sourceElementId) || !Number.isSafeInteger(source.sourceIndex) || Number(source.sourceIndex) < 0
    || (Object.hasOwn(source, "sourceGroupId") && !id(source.sourceGroupId))
    || (Object.hasOwn(source, "sourceHidden") && typeof source.sourceHidden !== "boolean")) return null;
  return { ...source } as unknown as StudioLegacyPigmentArchive;
}

/** 기존 실행 영수증/권리 게이트와 별개로, 보관 대상이 실제 외부 혼색 획인지 확인한다. */
export function isStudioLegacyPigmentArchiveSource(value: unknown): boolean {
  const source = record(value), programs = record(source?.brushEnginePrograms), material = record(programs?.material);
  if (!source || source.type !== "draw" || (source.kind ?? "freehand") !== "freehand"
    || (source.mode ?? "pen") !== "pen" || !material) return false;
  if (material.version === 1) return record(material.slots)?.pigment === "pigment-mixbox";
  const bindings = record(material.runtime)?.bindings;
  return material.version === 2 && Array.isArray(bindings)
    && bindings.some((binding: unknown) => record(binding)?.providerId === "mixbox-js-v2");
}

export function hasValidStudioLegacyPigmentArchiveExtension(version: unknown, archive: unknown): boolean {
  return archive === undefined ? true
    : version === STUDIO_LEGACY_PIGMENT_ARCHIVE_STROKE_VERSION && parseStudioLegacyPigmentArchive(archive) !== null;
}

/** 공개 파일/복구 reader가 모르는 필드를 제거하는 대신 손상된 보관 기록 전체를 거절한다. */
export function assertStudioLegacyPigmentArchiveElement(value: unknown): void {
  const source = record(value);
  if (source && Object.hasOwn(source, "legacyPigmentArchive")
    && !isStudioLegacyPigmentArchivedElement(source)) {
    throw new Error("외부 혼색 원본의 보관 출처가 올바르지 않습니다.");
  }
}

const STROKE_EXTENSION_KEYS = ["smartShape", "stamp", "stampPipeline", "watercolorPipeline", "name", "hidden", "locked", "noClip", "frameClipId", "lockAspect", "groupId", "clipBelow", "alphaLocked", "maskSrc", "maskEnabled", "layerRole", "layerColor", "emeresSourceId", "brushEnginePrograms", "legacyPigmentArchive", "pressureModel", "paperModel", "outlineStroke", "inkInput", "materialPressureModel", "materialMinimumDiameterRatio", "paintModel", ...STUDIO_LEGACY_PIGMENT_ARCHIVE_ELEMENT_EXTENSION_KEYS];
export function hasValidStudioLegacyPigmentArchiveStroke(payload: {
  version?: unknown; type?: unknown; kind?: unknown; mode?: unknown; extensions?: unknown;
}): boolean {
  const extensions = record(payload.extensions), archive = extensions?.legacyPigmentArchive;
  if (!hasValidStudioLegacyPigmentArchiveExtension(payload.version, archive)) return false;
  const preservesFields = STUDIO_LEGACY_PIGMENT_ARCHIVE_ELEMENT_EXTENSION_KEYS.some((key) => extensions?.[key] !== undefined);
  if (payload.version !== STUDIO_PRESERVED_DRAW_METADATA_STROKE_VERSION) return !preservesFields;
  return !!extensions && (archive !== undefined || preservesFields)
    && Object.keys(extensions).every((key) => STROKE_EXTENSION_KEYS.includes(key))
    && (archive === undefined || (extensions.hidden === true
      && isStudioLegacyPigmentArchiveSource({ ...payload, brushEnginePrograms: extensions.brushEnginePrograms })));
}

export function isStudioLegacyPigmentArchivedElement(value: unknown): boolean {
  const source = record(value), archive = parseStudioLegacyPigmentArchive(source?.legacyPigmentArchive);
  return !!archive && id(source?.id) && source.id !== archive.sourceElementId && source.hidden === true
    && isStudioLegacyPigmentArchiveSource(source);
}
