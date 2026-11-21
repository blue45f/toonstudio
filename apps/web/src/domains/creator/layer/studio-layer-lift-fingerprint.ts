/**
 * 컷 레이어 분리 원본 이미지 지문(fingerprint) 계산 리프.
 * 가용성 판정기가 전체 레이어 분리 문서 플래너를 정적으로 끌어오지 않도록 분리한다.
 */
import { hasContiguousLayerGroups, type LayerGroup } from "../studio-layers";

import type { El, ImageEl } from "../studio-element-model";

const SOURCE_FINGERPRINT_PREFIX = "studio-layer-lift-source-v1";

export type StudioLayerLiftPlanErrorCode =
  | "duplicate-id"
  | "invalid-confidence"
  | "invalid-group-name"
  | "invalid-id"
  | "invalid-output"
  | "invalid-output-basis"
  | "invalid-persistence-scope"
  | "noncontiguous-groups"
  | "source-already-grouped"
  | "source-hidden"
  | "source-locked"
  | "source-missing"
  | "source-not-image"
  | "source-not-static"
  | "source-clipping-dependent"
  | "source-unfingerprintable";

export interface StudioLayerLiftSourceState {
  readonly elements: readonly El[];
  readonly groups: readonly LayerGroup[];
  readonly sourceId: string;
}

export type StudioLayerLiftSource = ImageEl & El;

export interface StudioLayerLiftSourceInspection {
  readonly source: StudioLayerLiftSource;
  readonly sourceIndex: number;
}

export interface StudioLayerLiftSourceInspectionFailure {
  readonly code: StudioLayerLiftPlanErrorCode;
  readonly message: string;
}

function isStaticImage(source: StudioLayerLiftSource): boolean {
  if (
    source.frames !== undefined
    || source.frameFps !== undefined
    || source.frameLoop !== undefined
    || source.activeFrameId !== undefined
    || source.isAnimatedGif === true
    || source.bg3dScene !== undefined
    || source.vrmScene !== undefined
    || source.bg3dLtBundleId !== undefined
    || source.bg3dLtRole !== undefined
    || source.bg3dLtRenderMode !== undefined
  ) {
    return false;
  }
  const normalizedSrc = source.src.trim().toLowerCase();
  return (
    !normalizedSrc.startsWith("data:image/gif")
    && !/\.gif(?:$|[?#])/u.test(normalizedSrc)
  );
}

function duplicateDocumentId(
  elements: readonly El[],
  groups: readonly LayerGroup[],
): boolean {
  const ids = new Set<string>();
  for (const entry of [...elements, ...groups]) {
    if (ids.has(entry.id)) return true;
    ids.add(entry.id);
  }
  return false;
}

export function inspectStudioLayerLiftSource(
  state: StudioLayerLiftSourceState,
): StudioLayerLiftSourceInspection | StudioLayerLiftSourceInspectionFailure {
  if (duplicateDocumentId(state.elements, state.groups)) {
    return {
      code: "duplicate-id",
      message: "문서에 중복된 레이어 또는 그룹 ID가 있어 분리를 중단했습니다.",
    };
  }
  if (!hasContiguousLayerGroups(state.elements)) {
    return {
      code: "noncontiguous-groups",
      message: "기존 레이어 그룹이 연속하지 않아 분리를 중단했습니다.",
    };
  }
  const sourceIndex = state.elements.findIndex((element) => element.id === state.sourceId);
  if (sourceIndex < 0) {
    return {
      code: "source-missing",
      message: "분리할 원본 레이어를 찾을 수 없습니다.",
    };
  }
  const element = state.elements[sourceIndex]!;
  if (element.type !== "image") {
    return {
      code: "source-not-image",
      message: "첫 버전에서는 정적 이미지 레이어만 분리할 수 있습니다.",
    };
  }
  const source = element as StudioLayerLiftSource;
  if (source.groupId !== undefined) {
    return {
      code: "source-already-grouped",
      message: "이미 그룹에 속한 레이어는 분리할 수 없습니다.",
    };
  }
  if (source.hidden === true) {
    return {
      code: "source-hidden",
      message: "숨긴 레이어는 표시한 뒤 분리해 주세요.",
    };
  }
  if (source.locked === true) {
    return {
      code: "source-locked",
      message: "잠긴 레이어는 잠금을 해제한 뒤 분리해 주세요.",
    };
  }
  if (!isStaticImage(source)) {
    return {
      code: "source-not-static",
      message: "애니메이션 이미지 레이어는 현재 분리할 수 없습니다.",
    };
  }
  const frontNeighbor = state.elements[sourceIndex + 1];
  if (source.clipBelow === true || frontNeighbor?.clipBelow === true) {
    return {
      code: "source-clipping-dependent",
      message: "클리핑 관계가 있는 이미지는 레이어를 평탄화한 뒤 분리해 주세요.",
    };
  }
  return { source, sourceIndex };
}

interface FingerprintState {
  first: number;
  second: number;
  nodes: number;
}

function updateFingerprint(state: FingerprintState, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    state.first = Math.imul(state.first ^ code, 0x01000193) >>> 0;
    state.second = Math.imul(state.second ^ code, 0x85ebca6b) >>> 0;
    state.second = (state.second ^ (state.second >>> 13)) >>> 0;
  }
}

function updateFingerprintValue(
  state: FingerprintState,
  value: unknown,
  ancestors: Set<object>,
  depth = 0,
): void {
  state.nodes += 1;
  if (depth > 64 || state.nodes > 200_000) {
    throw new TypeError("fingerprint structure budget exceeded");
  }
  if (value === null) {
    updateFingerprint(state, "null;");
    return;
  }
  if (typeof value === "string") {
    updateFingerprint(state, `s${value.length}:`);
    updateFingerprint(state, value);
    return;
  }
  if (typeof value === "boolean") {
    updateFingerprint(state, value ? "b1;" : "b0;");
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("non-finite fingerprint number");
    updateFingerprint(state, `n${String(value)};`);
    return;
  }
  if (typeof value !== "object") throw new TypeError("unsupported fingerprint value");
  if (ancestors.has(value)) throw new TypeError("circular fingerprint value");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      updateFingerprint(state, `a${value.length}[`);
      for (const entry of value) {
        updateFingerprintValue(state, entry, ancestors, depth + 1);
      }
      updateFingerprint(state, "];");
      return;
    }
    if (ArrayBuffer.isView(value)) {
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      updateFingerprint(state, `v${bytes.length}:`);
      for (const byte of bytes) updateFingerprint(state, String.fromCharCode(byte));
      return;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    updateFingerprint(state, `o${keys.length}{`);
    for (const key of keys) {
      updateFingerprint(state, `k${key.length}:`);
      updateFingerprint(state, key);
      updateFingerprintValue(state, record[key], ancestors, depth + 1);
    }
    updateFingerprint(state, "};");
  } finally {
    ancestors.delete(value);
  }
}

export function hashStudioLayerLiftFingerprintValue(value: unknown): string {
  const state: FingerprintState = {
    first: 0x811c9dc5,
    second: 0x9e3779b9,
    nodes: 0,
  };
  updateFingerprintValue(state, value, new Set<object>());
  return `${SOURCE_FINGERPRINT_PREFIX}:${state.first.toString(16).padStart(8, "0")}${state.second
    .toString(16)
    .padStart(8, "0")}`;
}

/**
 * Fingerprints the complete source element plus its z-order position as a supplemental stale
 * signal. The document mutation ticket remains authoritative. Key insertion order does not
 * affect the result. Null means the source is missing, ineligible, or unsafe to inspect.
 */
export function fingerprintStudioLayerLiftSource(
  state: StudioLayerLiftSourceState,
): string | null {
  const inspected = inspectStudioLayerLiftSource(state);
  if (!("source" in inspected)) return null;
  try {
    return hashStudioLayerLiftFingerprintValue({
      sourceIndex: inspected.sourceIndex,
      source: inspected.source,
    });
  } catch {
    return null;
  }
}

/** Re-checks source ownership after asynchronous foreground/background generation. */
export function isStudioLayerLiftSourceCurrent(
  expectedFingerprint: string,
  current: StudioLayerLiftSourceState,
): boolean {
  if (
    typeof expectedFingerprint !== "string"
    || !expectedFingerprint.startsWith(`${SOURCE_FINGERPRINT_PREFIX}:`)
  ) {
    return false;
  }
  return fingerprintStudioLayerLiftSource(current) === expectedFingerprint;
}
