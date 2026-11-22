import { isBoundedStudioCrdtId } from "./studio-crdt-identifiers";
import {
  STUDIO_CRDT_COLLECTION_MAX_ENTRIES,
  encodedJsonByteLength,
  finiteNumberInRange,
  hasOnlyJsonKeys,
  isExactJsonObject,
} from "./studio-crdt-root-schema-primitives";

export const STUDIO_CRDT_SHARED_3D_STAGE_RECORDS_ROOT =
  "studio-shared-3d-stage-records-v1";
export const STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPTS_ROOT =
  "studio-shared-3d-stage-visibility-receipts-v1";
export const STUDIO_CRDT_SHARED_3D_STAGE_RECORD_ROOT_PREFIX =
  "studio-shared-3d-stage-record:";
export const STUDIO_CRDT_SHARED_3D_STAGE_VISIBILITY_RECEIPT_ROOT_PREFIX =
  "studio-shared-3d-stage-visibility-receipt:";

export const STUDIO_CRDT_SHARED_3D_STAGE_PAYLOAD_VERSION = 1;
const STUDIO_CRDT_SHARED_3D_STAGE_DOCUMENT_MAX_BYTES = 8 * 1_024;
const STUDIO_CRDT_SHARED_3D_STAGE_ENTRY_MAX_BYTES = 12 * 1_024;
const STUDIO_CRDT_SHARED_3D_STAGE_COLLECTION_MAX_BYTES = 1_024 * 1_024;
const STUDIO_CRDT_SHARED_3D_STAGE_PAGE_SIZE = 64;
const STUDIO_CRDT_SHARED_3D_RECEIPT_PAGE_SIZE = 256;
const STUDIO_CRDT_SHARED_3D_MAX_PAGE_COUNT = 1_024;
const STUDIO_CRDT_SHARED_3D_MAX_CHARACTERS = 12;
const STUDIO_CRDT_SHARED_3D_SAFE_ID_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;
const STUDIO_CRDT_SHARED_3D_SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const STUDIO_CRDT_SHARED_3D_MODEL_RUNTIME_KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}:sha256:[a-f0-9]{64}$/u;
const STUDIO_CRDT_SHARED_3D_FORBIDDEN_IDS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export const STUDIO_CRDT_SHARED_3D_STAGE_RECORD_KEYS = new Set([
  "pageId",
  "stageId",
  "payloadVersion",
  "order",
  "payload",
]);
export const STUDIO_CRDT_SHARED_3D_RECEIPT_RECORD_KEYS = new Set([
  "pageId",
  "elementId",
  "payloadVersion",
  "modelRuntimeKey",
]);
export const STUDIO_CRDT_SHARED_3D_EVENT_KEY_PATTERN = /^(activate|deactivate):(0|[1-9][0-9]*)$/u;
export const STUDIO_CRDT_SHARED_3D_EVENT_MAX_PER_RECORD = 256;
export const STUDIO_CRDT_SHARED_3D_EVENT_MAX_GENERATION = 255;
export const STUDIO_CRDT_SHARED_3D_EVENT_MAX_TOTAL = STUDIO_CRDT_COLLECTION_MAX_ENTRIES;

export interface StudioCrdtShared3dStageIdentity {
  readonly key: string;
  readonly pageId: string;
  readonly id: string;
}

export interface StudioCrdtShared3dStageCharacter {
  readonly elementId: string;
  readonly modelRuntimeKey: string;
  readonly sourceHash: string;
  readonly placement?: {
    readonly position: readonly [number, number, number];
    readonly rotationY: number;
  };
}

export interface StudioCrdtShared3dStageEntry {
  readonly id: string;
  readonly capturePolicy: "require-all-linked" | "background-only";
  readonly background: {
    readonly bundleId: string;
    readonly sourceHash: string;
  };
  readonly characters: readonly StudioCrdtShared3dStageCharacter[];
  readonly dccSource?: {
    readonly sourceDocumentId: string;
    readonly sourceStateHash: string;
    readonly sourceWorkspaceHash: string;
    readonly sourceBridgeSetHash: string;
    readonly sourceCommandCount: number;
    readonly sourceBridgeCommandSequence: number;
  };
}

export interface StudioCrdtShared3dActiveStage {
  readonly order: number;
  readonly entry: StudioCrdtShared3dStageEntry;
}

function compareStudioCrdtShared3dIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isStudioCrdtShared3dSafeId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    STUDIO_CRDT_SHARED_3D_SAFE_ID_PATTERN.test(value) &&
    !STUDIO_CRDT_SHARED_3D_FORBIDDEN_IDS.has(value.toLowerCase());
}

function isStudioCrdtShared3dHash(value: unknown): value is string {
  return typeof value === "string" &&
    value.length === 71 &&
    STUDIO_CRDT_SHARED_3D_SHA256_PATTERN.test(value);
}

function hasStudioCrdtShared3dUnsafeText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return true;
    const codePoint = value.codePointAt(index) ?? 0;
    if (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) return true;
  }
  return false;
}

function isStudioCrdtShared3dProvenanceText(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 160 &&
    !hasStudioCrdtShared3dUnsafeText(value);
}

export function isStudioCrdtShared3dRuntimeKey(
  value: unknown,
  elementId: string
): value is string {
  return typeof value === "string" &&
    value.length <= 200 &&
    STUDIO_CRDT_SHARED_3D_MODEL_RUNTIME_KEY_PATTERN.test(value) &&
    value.startsWith(`${elementId}:`);
}

function parseStudioCrdtShared3dPlacement(value: unknown): {
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
} | null {
  if (!isExactJsonObject(value, new Set(["position", "rotationY"]))) return null;
  if (!Array.isArray(value.position) || value.position.length !== 3) return null;
  if (Object.keys(value.position).some((key) => key !== "0" && key !== "1" && key !== "2")) {
    return null;
  }
  const position = value.position;
  if (
    position.some((component) => !finiteNumberInRange(component, -10, 10)) ||
    !finiteNumberInRange(value.rotationY, -Math.PI, Math.PI)
  ) return null;
  return {
    position: [
      Object.is(position[0], -0) ? 0 : position[0] as number,
      Object.is(position[1], -0) ? 0 : position[1] as number,
      Object.is(position[2], -0) ? 0 : position[2] as number,
    ],
    rotationY: Object.is(value.rotationY, -0) ? 0 : value.rotationY as number,
  };
}

function parseStudioCrdtShared3dStageEntry(value: unknown): StudioCrdtShared3dStageEntry | null {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !hasOnlyJsonKeys(value as Record<string, unknown>, new Set([
      "id",
      "capturePolicy",
      "background",
      "characters",
      "dccSource",
    ]))
  ) return null;
  const candidate = value as Record<string, unknown>;
  if (
    !isStudioCrdtShared3dSafeId(candidate.id) ||
    (candidate.capturePolicy !== "require-all-linked" &&
      candidate.capturePolicy !== "background-only") ||
    !isExactJsonObject(candidate.background, new Set(["bundleId", "sourceHash"])) ||
    !isStudioCrdtShared3dSafeId(candidate.background.bundleId) ||
    !isStudioCrdtShared3dHash(candidate.background.sourceHash) ||
    !Array.isArray(candidate.characters) ||
    candidate.characters.length > STUDIO_CRDT_SHARED_3D_MAX_CHARACTERS ||
    (candidate.capturePolicy === "background-only" && candidate.characters.length > 0)
  ) return null;

  const characters: StudioCrdtShared3dStageCharacter[] = [];
  const elementIds = new Set<string>();
  for (const rawCharacter of candidate.characters) {
    if (
      rawCharacter === null ||
      typeof rawCharacter !== "object" ||
      Array.isArray(rawCharacter) ||
      !hasOnlyJsonKeys(rawCharacter as Record<string, unknown>, new Set([
        "elementId",
        "modelRuntimeKey",
        "sourceHash",
        "placement",
      ]))
    ) return null;
    const character = rawCharacter as Record<string, unknown>;
    if (
      !isStudioCrdtShared3dSafeId(character.elementId) ||
      elementIds.has(character.elementId) ||
      !isStudioCrdtShared3dRuntimeKey(character.modelRuntimeKey, character.elementId) ||
      !isStudioCrdtShared3dHash(character.sourceHash)
    ) return null;
    const placement = character.placement === undefined
      ? undefined
      : parseStudioCrdtShared3dPlacement(character.placement);
    if (character.placement !== undefined && !placement) return null;
    elementIds.add(character.elementId);
    characters.push({
      elementId: character.elementId,
      modelRuntimeKey: character.modelRuntimeKey,
      sourceHash: character.sourceHash,
      ...(placement ? { placement } : {}),
    });
  }

  let dccSource: StudioCrdtShared3dStageEntry["dccSource"];
  if (candidate.dccSource !== undefined) {
    const rawDccSource = candidate.dccSource;
    const keys = new Set([
      "sourceDocumentId",
      "sourceStateHash",
      "sourceWorkspaceHash",
      "sourceBridgeSetHash",
      "sourceCommandCount",
      "sourceBridgeCommandSequence",
    ]);
    if (
      !isExactJsonObject(rawDccSource, keys) ||
      !isStudioCrdtShared3dProvenanceText(rawDccSource.sourceDocumentId) ||
      !isStudioCrdtShared3dProvenanceText(rawDccSource.sourceStateHash) ||
      !isStudioCrdtShared3dHash(rawDccSource.sourceWorkspaceHash) ||
      !isStudioCrdtShared3dProvenanceText(rawDccSource.sourceBridgeSetHash) ||
      !Number.isSafeInteger(rawDccSource.sourceCommandCount) ||
      (rawDccSource.sourceCommandCount as number) < 0 ||
      !Number.isSafeInteger(rawDccSource.sourceBridgeCommandSequence) ||
      (rawDccSource.sourceBridgeCommandSequence as number) < 0
    ) return null;
    dccSource = {
      sourceDocumentId: rawDccSource.sourceDocumentId,
      sourceStateHash: rawDccSource.sourceStateHash,
      sourceWorkspaceHash: rawDccSource.sourceWorkspaceHash,
      sourceBridgeSetHash: rawDccSource.sourceBridgeSetHash,
      sourceCommandCount: rawDccSource.sourceCommandCount as number,
      sourceBridgeCommandSequence: rawDccSource.sourceBridgeCommandSequence as number,
    };
  }

  const entry: StudioCrdtShared3dStageEntry = {
    id: candidate.id,
    capturePolicy: candidate.capturePolicy,
    background: {
      bundleId: candidate.background.bundleId,
      sourceHash: candidate.background.sourceHash,
    },
    characters,
    ...(dccSource ? { dccSource } : {}),
  };
  // The browser collection parser first projects every placement-aware entry through its legacy
  // reference-only v1 document. Keep that stricter 8 KiB gate as well as the v3 entry's 12 KiB
  // envelope or the server could admit a sidecar that every client aggregate reader rejects.
  const referenceOnlyDocument = {
    kind: "toonstudio.studio-shared-3d-stage",
    version: 1,
    authority: "page-background-with-linked-character-sources",
    capturePolicy: entry.capturePolicy,
    background: entry.background,
    characters: entry.characters.map(({ placement: _placement, ...character }) => character),
    ...(entry.dccSource ? { dccSource: entry.dccSource } : {}),
  };
  const referenceOnlyByteLength = encodedJsonByteLength(referenceOnlyDocument);
  const byteLength = encodedJsonByteLength(entry);
  return referenceOnlyByteLength !== null &&
    referenceOnlyByteLength <= STUDIO_CRDT_SHARED_3D_STAGE_DOCUMENT_MAX_BYTES &&
    byteLength !== null &&
    byteLength <= STUDIO_CRDT_SHARED_3D_STAGE_ENTRY_MAX_BYTES
    ? entry
    : null;
}

export function parseCanonicalStudioCrdtShared3dStagePayload(
  value: unknown,
  stageId: string
): StudioCrdtShared3dStageEntry | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const entry = parseStudioCrdtShared3dStageEntry(JSON.parse(value));
    return entry && entry.id === stageId && JSON.stringify(entry) === value ? entry : null;
  } catch {
    return null;
  }
}

export function encodeStudioCrdtShared3dCompositeKey(pageId: string, id: string): string {
  return `${pageId.length}:${pageId}${id.length}:${id}`;
}

export function parseStudioCrdtShared3dCompositeKey(
  key: string,
  validateId: (value: unknown) => value is string
): StudioCrdtShared3dStageIdentity | null {
  if (key.length < 5 || key.length > 328) return null;
  const readPart = (offset: number): { value: string; nextOffset: number } | null => {
    const separator = key.indexOf(":", offset);
    if (separator < 0) return null;
    const lengthToken = key.slice(offset, separator);
    if (!/^(?:0|[1-9][0-9]*)$/u.test(lengthToken)) return null;
    const length = Number(lengthToken);
    if (!Number.isSafeInteger(length) || length <= 0 || length > 160) return null;
    const start = separator + 1;
    const end = start + length;
    return end <= key.length ? { value: key.slice(start, end), nextOffset: end } : null;
  };
  const page = readPart(0);
  if (!page) return null;
  const id = readPart(page.nextOffset);
  if (
    !id ||
    id.nextOffset !== key.length ||
    !isBoundedStudioCrdtId(page.value) ||
    !validateId(id.value)
  ) return null;
  const canonical = encodeStudioCrdtShared3dCompositeKey(page.value, id.value);
  return canonical === key
    ? { key, pageId: page.value, id: id.value }
    : null;
}

function serializedStudioCrdtShared3dFingerprint(serialized: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function studioCrdtShared3dCollectionPageId(
  prefix: "stage" | "receipt",
  index: number,
  items: unknown
): string {
  const serialized = JSON.stringify(items);
  return `${prefix}-page-${index.toString(36).padStart(4, "0")}-${
    serializedStudioCrdtShared3dFingerprint(serialized)
  }`;
}

function chunkStudioCrdtShared3dCollection<T>(
  values: readonly T[],
  size: number,
  prefix: "stage" | "receipt"
): Array<{ readonly id: string; readonly items: readonly T[] }> {
  const pages: Array<{ readonly id: string; readonly items: readonly T[] }> = [];
  for (let offset = 0; offset < values.length; offset += size) {
    const items = values.slice(offset, offset + size);
    pages.push({ id: studioCrdtShared3dCollectionPageId(prefix, pages.length, items), items });
  }
  return pages;
}

export function hasValidStudioCrdtShared3dAggregate(
  stages: readonly StudioCrdtShared3dActiveStage[],
  receipts: readonly { readonly elementId: string; readonly modelRuntimeKey: string }[]
): boolean {
  // The caller has already proved that this page owns at least one Stage record. Active receipts
  // without a matching active Stage are dormant grow-only history, not an invalid receipt-only page.
  if (stages.length === 0) return true;
  const bundleIds = new Set<string>();
  const characterAuthorities = new Set<string>();
  const entries = stages
    .slice()
    .sort((left, right) => (
      left.order - right.order || compareStudioCrdtShared3dIds(left.entry.id, right.entry.id)
    ))
    .map(({ entry }) => entry);
  for (const entry of entries) {
    if (bundleIds.has(entry.background.bundleId)) return false;
    bundleIds.add(entry.background.bundleId);
    for (const character of entry.characters) {
      characterAuthorities.add(`${character.elementId}\0${character.modelRuntimeKey}`);
    }
  }
  const orderedReceipts = receipts
    .filter((receipt) => characterAuthorities.has(
      `${receipt.elementId}\0${receipt.modelRuntimeKey}`
    ))
    .sort((left, right) => compareStudioCrdtShared3dIds(left.elementId, right.elementId));

  let collection: unknown;
  if (entries.length <= STUDIO_CRDT_SHARED_3D_STAGE_PAGE_SIZE) {
    collection = {
      kind: "toonstudio.studio-shared-3d-stage-collection",
      version: 3,
      authority: "page-shared-3d-stage-collection",
      stages: entries,
      visibilityReceipts: orderedReceipts,
    };
  } else {
    const stagePages = chunkStudioCrdtShared3dCollection(
      entries,
      STUDIO_CRDT_SHARED_3D_STAGE_PAGE_SIZE,
      "stage"
    );
    const visibilityReceiptPages = chunkStudioCrdtShared3dCollection(
      orderedReceipts,
      STUDIO_CRDT_SHARED_3D_RECEIPT_PAGE_SIZE,
      "receipt"
    );
    if (
      stagePages.length > STUDIO_CRDT_SHARED_3D_MAX_PAGE_COUNT ||
      visibilityReceiptPages.length > STUDIO_CRDT_SHARED_3D_MAX_PAGE_COUNT
    ) return false;
    collection = {
      kind: "toonstudio.studio-shared-3d-stage-collection",
      version: 4,
      authority: "page-shared-3d-stage-collection",
      stagePages,
      visibilityReceiptPages,
    };
  }
  const byteLength = encodedJsonByteLength(collection);
  return byteLength !== null &&
    byteLength <= STUDIO_CRDT_SHARED_3D_STAGE_COLLECTION_MAX_BYTES;
}
