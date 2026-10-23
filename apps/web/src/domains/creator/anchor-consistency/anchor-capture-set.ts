/**
 * 앵커 캡처 세트 — 세트 모델, 파일 이름, 결정적 해시, 검증.
 *
 * 상태: current. 이미지 바이트는 이 모듈이 들지 않는다. 호출자가 바이트로 계산한 SHA-256 과 크기만 받아
 * 메타데이터와 해시를 만든다(DOM·React·네트워크 없음, 같은 입력은 항상 같은 결과).
 *
 * 해시 규칙: 세트 해시와 항목 해시는 앵커 id · 원본 캐릭터 id · 각도 · 이미지 SHA-256 · 크기처럼 내용에서 오는 값만
 * 정본 JSON(키 정렬)으로 직렬화해 SHA-256 한다. 생성 시각·표시 이름·권리 확인 시각은 넣지 않으므로 같은 이미지를
 * 다시 내보내도 해시가 같다.
 */

import { sha256HexPortable } from "../studio-sha256";

import {
  ANCHOR_ANGLE_IDS,
  ANCHOR_LIMITS,
  ANCHOR_MIRROR_PAIRS,
  ANCHOR_SET_SCHEMA,
  ANCHOR_SPEC_VERSION,
  anchorAngleSpec,
  anchorImageExtension,
  isAnchorAngleId,
  isAnchorImageMimeType,
  isValidAnchorCharacterId,
  isValidAnchorId,
  sortAnchorAngles,
  type AnchorAngleId,
  type AnchorImageMimeType,
} from "./anchor-capture-spec";

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const ENCODER = new TextEncoder();

// ── 검증 ────────────────────────────────────────────────────────────────────

export type AnchorValidationCode =
  | "invalid-anchor-id"
  | "invalid-character-id"
  | "no-images"
  | "unknown-angle"
  | "duplicate-angle"
  | "unsupported-format"
  | "invalid-dimensions"
  | "image-too-small"
  | "image-too-large"
  | "file-empty"
  | "file-too-large"
  | "invalid-hash"
  | "set-too-large";

export interface AnchorValidationIssue {
  readonly code: AnchorValidationCode;
  readonly angleId?: AnchorAngleId;
  /** 화면 문구에 끼울 수치. 사용자 입력 문자열은 담지 않는다. */
  readonly params?: Readonly<Record<string, number>>;
}

export class AnchorSetError extends Error {
  readonly issues: readonly AnchorValidationIssue[];

  constructor(issues: readonly AnchorValidationIssue[]) {
    super(`앵커 세트를 만들 수 없어요: ${issues.map((issue) => issue.code).join(", ")}`);
    this.name = "AnchorSetError";
    this.issues = issues;
  }
}

/** 이미지 한 장의 메타데이터. 바이트가 아니라 바이트에서 계산한 값이다. */
export interface AnchorImageInput {
  readonly angleId: AnchorAngleId;
  readonly mimeType: AnchorImageMimeType;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  /** 파일 바이트의 SHA-256(소문자 hex 64자). */
  readonly imageSha256: string;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** 한 장을 검사한다. 오류가 없으면 빈 배열. 입력이 올바른 모양이 아니어도 던지지 않는다. */
export function validateAnchorImage(image: AnchorImageInput): readonly AnchorValidationIssue[] {
  const issues: AnchorValidationIssue[] = [];
  const angleId = isAnchorAngleId(image.angleId) ? image.angleId : undefined;
  const at = (code: AnchorValidationCode, params?: Record<string, number>): AnchorValidationIssue =>
    Object.freeze({ code, ...(angleId ? { angleId } : {}), ...(params ? { params: Object.freeze(params) } : {}) });
  if (!angleId) issues.push(at("unknown-angle"));
  if (!isAnchorImageMimeType(image.mimeType)) issues.push(at("unsupported-format"));
  if (!isPositiveSafeInteger(image.width) || !isPositiveSafeInteger(image.height)) {
    issues.push(at("invalid-dimensions"));
  } else {
    const { minEdgePx, maxEdgePx, maxPixels } = ANCHOR_LIMITS;
    if (Math.min(image.width, image.height) < minEdgePx) {
      issues.push(at("image-too-small", { width: image.width, height: image.height, min: minEdgePx }));
    }
    if (Math.max(image.width, image.height) > maxEdgePx || image.width * image.height > maxPixels) {
      issues.push(at("image-too-large", { width: image.width, height: image.height, max: maxEdgePx }));
    }
  }
  if (!isPositiveSafeInteger(image.byteLength)) {
    issues.push(at("file-empty"));
  } else if (image.byteLength > ANCHOR_LIMITS.maxImageBytes) {
    issues.push(at("file-too-large", { bytes: image.byteLength, max: ANCHOR_LIMITS.maxImageBytes }));
  }
  if (typeof image.imageSha256 !== "string" || !SHA256_HEX_PATTERN.test(image.imageSha256)) {
    issues.push(at("invalid-hash"));
  }
  return issues;
}

export interface AnchorSetIdentity {
  readonly anchorId: string;
  readonly sourceCharacterId: string;
}

/** 세트 입력 전체를 검사한다(식별자, 각도 중복, 이미지별 검사, 세트 총 크기). */
export function validateAnchorSetInput(
  identity: AnchorSetIdentity,
  images: readonly AnchorImageInput[],
): readonly AnchorValidationIssue[] {
  const issues: AnchorValidationIssue[] = [];
  if (!isValidAnchorId(identity.anchorId)) issues.push(Object.freeze({ code: "invalid-anchor-id" as const }));
  if (!isValidAnchorCharacterId(identity.sourceCharacterId)) {
    issues.push(Object.freeze({ code: "invalid-character-id" as const }));
  }
  if (images.length === 0) issues.push(Object.freeze({ code: "no-images" as const }));
  const seen = new Set<AnchorAngleId>();
  let totalBytes = 0;
  for (const image of images) {
    issues.push(...validateAnchorImage(image));
    if (isAnchorAngleId(image.angleId)) {
      if (seen.has(image.angleId)) {
        issues.push(Object.freeze({ code: "duplicate-angle" as const, angleId: image.angleId }));
      }
      seen.add(image.angleId);
    }
    if (isPositiveSafeInteger(image.byteLength)) totalBytes += image.byteLength;
  }
  if (totalBytes > ANCHOR_LIMITS.maxSetBytes) {
    issues.push(Object.freeze({
      code: "set-too-large" as const,
      params: Object.freeze({ bytes: totalBytes, max: ANCHOR_LIMITS.maxSetBytes }),
    }));
  }
  return issues;
}

// ── 정본 직렬화·해시 ─────────────────────────────────────────────────────────

/** 키를 정렬해 공백 없이 직렬화한다. 유한한 숫자·문자열·불리언·null·배열·일반 객체만 받는다. */
export function canonicalAnchorJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("정본 JSON 에는 유한한 숫자만 쓸 수 있어요.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalAnchorJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const parts = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalAnchorJson(record[key])}`);
    return `{${parts.join(",")}}`;
  }
  throw new TypeError("정본 JSON 으로 만들 수 없는 값이에요.");
}

export function anchorTextSha256(text: string): string {
  return sha256HexPortable(ENCODER.encode(text));
}

/** 파일 이름. `<앵커id>.<각도>.<이미지 해시 앞 8자>.<확장자>` — 구분자는 점이고 id·각도에는 점이 없다. */
export function anchorImageFileName(input: {
  readonly anchorId: string;
  readonly angleId: AnchorAngleId;
  readonly imageSha256: string;
  readonly mimeType: AnchorImageMimeType;
}): string {
  if (!isValidAnchorId(input.anchorId)) throw new RangeError("앵커 id 가 올바르지 않아요.");
  if (!SHA256_HEX_PATTERN.test(input.imageSha256)) throw new RangeError("이미지 해시가 올바르지 않아요.");
  anchorAngleSpec(input.angleId);
  return `${input.anchorId}.${input.angleId}.${input.imageSha256.slice(0, 8)}.${anchorImageExtension(input.mimeType)}`;
}

export interface ParsedAnchorFileName {
  readonly anchorId: string;
  readonly angleId: AnchorAngleId;
  /** 이름에 해시 8자가 있으면 그 값. */
  readonly hash8: string | null;
}

const ANCHOR_FILE_NAME_PATTERN =
  /^([a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)\.(front|left-34|left|back|right|right-34)(?:\.([0-9a-f]{8}))?\.(?:png|jpe?g|webp)$/u;

function baseName(fileName: string): string {
  const cut = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\"));
  return cut >= 0 ? fileName.slice(cut + 1) : fileName;
}

/** 내보낸 파일 이름 규칙을 따르는 이름만 읽는다. 아니면 null. */
export function parseAnchorImageFileName(fileName: string): ParsedAnchorFileName | null {
  const match = ANCHOR_FILE_NAME_PATTERN.exec(baseName(fileName).trim().toLowerCase());
  if (!match) return null;
  const [, anchorId, angleId, hash8] = match;
  if (!anchorId || !isAnchorAngleId(angleId)) return null;
  return Object.freeze({ anchorId, angleId, hash8: hash8 ?? null });
}

const THREE_QUARTER = "(?:3\\s*[-_/]?\\s*4|3q|three[-_ ]?quarter|반측면?)";
const LEFT_WORD = "(?:left|좌측?|왼쪽)";
const RIGHT_WORD = "(?:right|우측?|오른쪽)";

const GUESS_RULES: ReadonlyArray<{ readonly angle: AnchorAngleId; readonly pattern: RegExp }> = [
  { angle: "left-34", pattern: new RegExp(`${LEFT_WORD}[^a-z가-힣0-9]{0,3}${THREE_QUARTER}`, "iu") },
  { angle: "right-34", pattern: new RegExp(`${RIGHT_WORD}[^a-z가-힣0-9]{0,3}${THREE_QUARTER}`, "iu") },
  { angle: "front", pattern: /(?:^|[^a-z])front(?:[^a-z]|$)|정면/iu },
  { angle: "back", pattern: /(?:^|[^a-z])(?:back|rear)(?:[^a-z]|$)|후면|뒷모습/iu },
  { angle: "left", pattern: /(?:^|[^a-z])left(?:[^a-z]|$)|좌측|왼쪽/iu },
  { angle: "right", pattern: /(?:^|[^a-z])right(?:[^a-z]|$)|우측|오른쪽/iu },
];

/**
 * 규칙에 없는 이름에서 각도를 조심스럽게 짐작한다. 가리키는 각도가 정확히 하나일 때만 돌려주고,
 * 모호하면 null 이다(화면은 짐작한 것을 사용자가 확인하게 안내한다).
 */
export function guessAnchorAngleFromFileName(fileName: string): AnchorAngleId | null {
  const parsed = parseAnchorImageFileName(fileName);
  if (parsed) return parsed.angleId;
  const name = baseName(fileName).replace(/\.[A-Za-z0-9]+$/u, "");
  const hits: AnchorAngleId[] = [];
  let working = name;
  for (const rule of GUESS_RULES) {
    if (!rule.pattern.test(working)) continue;
    hits.push(rule.angle);
    // 3/4 규칙이 먼저 잡힌 이름에서 같은 left/right 가 옆면으로 다시 잡히지 않게 지운다.
    if (rule.angle === "left-34" || rule.angle === "right-34") {
      working = working.replace(rule.pattern, " ");
    }
  }
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

// ── 세트 ────────────────────────────────────────────────────────────────────

export interface AnchorSetEntry extends AnchorImageInput {
  readonly azimuthDeg: number;
  readonly fileName: string;
  readonly entryHash: string;
}

export interface AnchorCaptureSet {
  readonly schema: typeof ANCHOR_SET_SCHEMA;
  readonly specVersion: typeof ANCHOR_SPEC_VERSION;
  readonly anchorId: string;
  readonly sourceCharacterId: string;
  /** 정본 각도 순서. */
  readonly entries: readonly AnchorSetEntry[];
  /** 내용에서만 계산한 SHA-256(소문자 hex). 생성 시각·표시 이름은 포함하지 않는다. */
  readonly setHash: string;
}

function entryHashOf(identity: AnchorSetIdentity, image: AnchorImageInput, azimuthDeg: number): string {
  return anchorTextSha256(canonicalAnchorJson({
    specVersion: ANCHOR_SPEC_VERSION,
    anchorId: identity.anchorId,
    sourceCharacterId: identity.sourceCharacterId,
    angleId: image.angleId,
    azimuthDeg,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    byteLength: image.byteLength,
    imageSha256: image.imageSha256,
  }));
}

function setHashOf(identity: AnchorSetIdentity, entries: readonly AnchorSetEntry[]): string {
  return anchorTextSha256(canonicalAnchorJson({
    schema: ANCHOR_SET_SCHEMA,
    specVersion: ANCHOR_SPEC_VERSION,
    anchorId: identity.anchorId,
    sourceCharacterId: identity.sourceCharacterId,
    entries: entries.map((entry) => ({ angleId: entry.angleId, entryHash: entry.entryHash })),
  }));
}

/** 검증을 통과한 이미지로 세트를 만든다. 문제가 있으면 AnchorSetError 로 모든 문제를 함께 알린다. */
export function createAnchorCaptureSet(
  identity: AnchorSetIdentity,
  images: readonly AnchorImageInput[],
): AnchorCaptureSet {
  const issues = validateAnchorSetInput(identity, images);
  if (issues.length > 0) throw new AnchorSetError(issues);
  const byAngle = new Map(images.map((image) => [image.angleId, image] as const));
  const entries: AnchorSetEntry[] = [];
  for (const angleId of sortAnchorAngles(byAngle.keys())) {
    const image = byAngle.get(angleId);
    if (!image) continue;
    const azimuthDeg = anchorAngleSpec(angleId).azimuthDeg;
    entries.push(Object.freeze({
      angleId,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      byteLength: image.byteLength,
      imageSha256: image.imageSha256,
      azimuthDeg,
      fileName: anchorImageFileName({
        anchorId: identity.anchorId,
        angleId,
        imageSha256: image.imageSha256,
        mimeType: image.mimeType,
      }),
      entryHash: entryHashOf(identity, image, azimuthDeg),
    }));
  }
  return Object.freeze({
    schema: ANCHOR_SET_SCHEMA,
    specVersion: ANCHOR_SPEC_VERSION,
    anchorId: identity.anchorId,
    sourceCharacterId: identity.sourceCharacterId,
    entries: Object.freeze(entries),
    setHash: setHashOf(identity, entries),
  });
}

// ── 세트 완전성 ──────────────────────────────────────────────────────────────

export type AnchorCompletenessCode =
  | "missing-angle"
  | "missing-mirror-pair"
  | "size-mismatch"
  | "aspect-off-convention"
  | "below-recommended-size"
  | "duplicate-image";

export interface AnchorCompletenessIssue {
  readonly code: AnchorCompletenessCode;
  /** warning: 세트를 쓰기 전에 확인할 것, info: 알아 두면 좋은 것. */
  readonly severity: "warning" | "info";
  readonly angleId: AnchorAngleId;
  /** missing-mirror-pair 면 비어 있는 짝, duplicate-image 면 같은 이미지를 가진 다른 각도. */
  readonly relatedAngleId?: AnchorAngleId;
  readonly params?: Readonly<Record<string, number>>;
}

export interface AnchorCompletenessEntry {
  readonly angleId: AnchorAngleId;
  readonly width: number;
  readonly height: number;
  readonly imageSha256: string;
}

export interface AnchorCompletenessReport {
  /** empty: 한 장도 없음, partial: 일부만 있음, complete: 여섯 각도가 모두 있음. */
  readonly status: "empty" | "partial" | "complete";
  readonly present: readonly AnchorAngleId[];
  readonly missing: readonly AnchorAngleId[];
  readonly issues: readonly AnchorCompletenessIssue[];
  /** 참조 팩에 쓸 수 있는 최소 조건: 정면이 있다. */
  readonly usableForReferencePack: boolean;
  /** 여섯 각도가 모두 있고 쌍·크기·중복 경고가 하나도 없다. */
  readonly clean: boolean;
}

function modeOfSizes(entries: readonly AnchorCompletenessEntry[]): { width: number; height: number } | null {
  const counts = new Map<string, { width: number; height: number; count: number; firstOrder: number }>();
  entries.forEach((entry, order) => {
    const key = `${entry.width}x${entry.height}`;
    const found = counts.get(key);
    if (found) found.count += 1;
    else counts.set(key, { width: entry.width, height: entry.height, count: 1, firstOrder: order });
  });
  let best: { width: number; height: number; count: number; firstOrder: number } | null = null;
  for (const candidate of counts.values()) {
    if (!best || candidate.count > best.count || (candidate.count === best.count && candidate.firstOrder < best.firstOrder)) {
      best = candidate;
    }
  }
  return best ? { width: best.width, height: best.height } : null;
}

/** 현재 들어 있는 이미지로 세트 완전성을 본다. 순서·중복 각도와 무관하게 정본 순서로 판정한다. */
export function checkAnchorCompleteness(
  entries: readonly AnchorCompletenessEntry[],
): AnchorCompletenessReport {
  const byAngle = new Map<AnchorAngleId, AnchorCompletenessEntry>();
  for (const entry of entries) {
    if (isAnchorAngleId(entry.angleId) && !byAngle.has(entry.angleId)) byAngle.set(entry.angleId, entry);
  }
  const present = sortAnchorAngles(byAngle.keys());
  const missing = ANCHOR_ANGLE_IDS.filter((id) => !byAngle.has(id));
  const ordered = present.flatMap((id) => {
    const entry = byAngle.get(id);
    return entry ? [entry] : [];
  });
  const issues: AnchorCompletenessIssue[] = [];

  if (present.length > 0) {
    for (const angleId of missing) {
      issues.push(Object.freeze({ code: "missing-angle" as const, severity: "warning" as const, angleId }));
    }
    for (const [left, right] of ANCHOR_MIRROR_PAIRS) {
      const hasLeft = byAngle.has(left);
      const hasRight = byAngle.has(right);
      if (hasLeft !== hasRight) {
        issues.push(Object.freeze({
          code: "missing-mirror-pair" as const,
          severity: "warning" as const,
          angleId: hasLeft ? left : right,
          relatedAngleId: hasLeft ? right : left,
        }));
      }
    }
    const expected = modeOfSizes(ordered);
    const convention = 2 / 3;
    const seenHash = new Map<string, AnchorAngleId>();
    for (const entry of ordered) {
      if (expected && (entry.width !== expected.width || entry.height !== expected.height)) {
        issues.push(Object.freeze({
          code: "size-mismatch" as const,
          severity: "warning" as const,
          angleId: entry.angleId,
          params: Object.freeze({
            width: entry.width,
            height: entry.height,
            expectedWidth: expected.width,
            expectedHeight: expected.height,
          }),
        }));
      }
      if (entry.width > 0 && entry.height > 0) {
        const aspect = entry.width / entry.height;
        if (Math.abs(aspect - convention) > ANCHOR_LIMITS.aspectTolerance) {
          issues.push(Object.freeze({
            code: "aspect-off-convention" as const,
            severity: "info" as const,
            angleId: entry.angleId,
            params: Object.freeze({ width: entry.width, height: entry.height }),
          }));
        }
        if (Math.max(entry.width, entry.height) < ANCHOR_LIMITS.recommendedLongEdgePx) {
          issues.push(Object.freeze({
            code: "below-recommended-size" as const,
            severity: "info" as const,
            angleId: entry.angleId,
            params: Object.freeze({ width: entry.width, height: entry.height, recommended: ANCHOR_LIMITS.recommendedLongEdgePx }),
          }));
        }
      }
      const earlier = seenHash.get(entry.imageSha256);
      if (earlier) {
        issues.push(Object.freeze({
          code: "duplicate-image" as const,
          severity: "warning" as const,
          angleId: entry.angleId,
          relatedAngleId: earlier,
        }));
      } else {
        seenHash.set(entry.imageSha256, entry.angleId);
      }
    }
  }

  const status = present.length === 0 ? "empty" : missing.length === 0 ? "complete" : "partial";
  return Object.freeze({
    status,
    present: Object.freeze(present),
    missing: Object.freeze(missing),
    issues: Object.freeze(issues),
    usableForReferencePack: byAngle.has("front"),
    clean: status === "complete" && issues.every((issue) => issue.severity === "info"),
  });
}
