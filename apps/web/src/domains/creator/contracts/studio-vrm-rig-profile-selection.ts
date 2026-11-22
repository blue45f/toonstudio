/**
 * VRM 드로잉 참조 리그 프리셋 선택 계약 — 엔진·관절 한계 모듈과 분리된 순수 스키마 리프.
 * 문서 정규화(studio-vrm-scene-document)가 VRM 런타임 관절 한계 테이블 없이 선택값만 검증할 수 있게 한다.
 */

export const STUDIO_VRM_RIG_PROFILE_VERSION = 1 as const;
export const STUDIO_VRM_RIG_PROFILE_PURPOSE = "stylized-drawing-reference-only" as const;

export const STUDIO_VRM_RIG_PROFILE_IDS = [
  "neutral",
  "child",
  "teen",
  "adult",
  "senior",
  "flexible",
  "limited",
] as const;

export type StudioVrmRigProfileId = (typeof STUDIO_VRM_RIG_PROFILE_IDS)[number];
export type StudioVrmRigProfilePurpose = typeof STUDIO_VRM_RIG_PROFILE_PURPOSE;

/**
 * A stylized drawing-assist preset, not a medical, diagnostic, ergonomic, or anatomical claim.
 *
 * Names such as `child` and `senior` are only convenient illustration starting points. They must
 * never be used to infer a real person's health, age, disability, safe range of motion, or fitness.
 */
export interface StudioVrmRigProfile {
  readonly version: typeof STUDIO_VRM_RIG_PROFILE_VERSION;
  readonly purpose: StudioVrmRigProfilePurpose;
  readonly id: StudioVrmRigProfileId;
  readonly label: string;
  /** Scales the existing soft interval around its midpoint. It is always in `(0, 1]`. */
  readonly softRangeScale: number;
  /** Drawing-assist resistance in `[0, 1]`; it does not alter the hard safety boundary. */
  readonly damping: number;
  /** Share of whole-body correction suggested for the hips. Hips + spine always equals one. */
  readonly hipsWeight: number;
  /** Share of whole-body correction suggested for the spine. Hips + spine always equals one. */
  readonly spineWeight: number;
}

/** Minimal, stable selection shape suitable for a versioned scene document. */
export interface StudioVrmRigProfileSelection {
  readonly version: typeof STUDIO_VRM_RIG_PROFILE_VERSION;
  readonly purpose: StudioVrmRigProfilePurpose;
  readonly id: StudioVrmRigProfileId;
}

export type StudioVrmRigProfileInput =
  | StudioVrmRigProfileId
  | StudioVrmRigProfileSelection
  | StudioVrmRigProfile;

function profile(
  id: StudioVrmRigProfileId,
  label: string,
  softRangeScale: number,
  damping: number,
  hipsWeight: number,
): StudioVrmRigProfile {
  return Object.freeze({
    version: STUDIO_VRM_RIG_PROFILE_VERSION,
    purpose: STUDIO_VRM_RIG_PROFILE_PURPOSE,
    id,
    label,
    softRangeScale,
    damping,
    hipsWeight,
    spineWeight: 1 - hipsWeight,
  });
}

/**
 * Conservative illustration presets. Every soft-range scale is at most one, so selecting a
 * profile can only retain or narrow the existing soft interval; it can never expand hard limits.
 */
export const STUDIO_VRM_RIG_PROFILES: Readonly<
  Record<StudioVrmRigProfileId, StudioVrmRigProfile>
> = Object.freeze({
  neutral: profile("neutral", "중립", 1, 0.6, 0.5),
  child: profile("child", "어린이 드로잉", 0.88, 0.56, 0.44),
  teen: profile("teen", "청소년 드로잉", 0.95, 0.58, 0.48),
  adult: profile("adult", "성인 드로잉", 1, 0.62, 0.5),
  senior: profile("senior", "노년 드로잉", 0.76, 0.78, 0.58),
  flexible: profile("flexible", "유연한 연출", 1, 0.28, 0.42),
  limited: profile("limited", "제한된 연출", 0.56, 0.9, 0.64),
});

const PROFILE_ID_SET = new Set<string>(STUDIO_VRM_RIG_PROFILE_IDS);
const SELECTION_KEYS = new Set(["version", "purpose", "id"]);
const FULL_PROFILE_KEYS = new Set([
  "version",
  "purpose",
  "id",
  "label",
  "softRangeScale",
  "damping",
  "hipsWeight",
  "spineWeight",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function isProfileId(value: unknown): value is StudioVrmRigProfileId {
  return typeof value === "string" && PROFILE_ID_SET.has(value);
}

function exactlyCanonicalProfile(
  value: Record<string, unknown>,
  canonical: StudioVrmRigProfile,
): boolean {
  return hasExactKeys(value, FULL_PROFILE_KEYS)
    && value.version === canonical.version
    && value.purpose === canonical.purpose
    && value.id === canonical.id
    && value.label === canonical.label
    && value.softRangeScale === canonical.softRangeScale
    && value.damping === canonical.damping
    && value.hipsWeight === canonical.hipsWeight
    && value.spineWeight === canonical.spineWeight;
}

/**
 * Resolves only a known id, an exact versioned selection, or an exact canonical profile.
 * Unknown keys, partially trusted numeric overrides, and future versions fail closed with `null`.
 */
export function normalizeStudioVrmRigProfile(value: unknown): StudioVrmRigProfile | null {
  if (isProfileId(value)) return STUDIO_VRM_RIG_PROFILES[value];
  if (!isRecord(value) || !isProfileId(value.id)) return null;
  const canonical = STUDIO_VRM_RIG_PROFILES[value.id];
  if (
    hasExactKeys(value, SELECTION_KEYS)
    && value.version === STUDIO_VRM_RIG_PROFILE_VERSION
    && value.purpose === STUDIO_VRM_RIG_PROFILE_PURPOSE
  ) return canonical;
  return exactlyCanonicalProfile(value, canonical) ? canonical : null;
}

export function createStudioVrmRigProfileSelection(
  value: unknown,
): StudioVrmRigProfileSelection | null {
  const normalized = normalizeStudioVrmRigProfile(value);
  return normalized
    ? Object.freeze({
        version: STUDIO_VRM_RIG_PROFILE_VERSION,
        purpose: STUDIO_VRM_RIG_PROFILE_PURPOSE,
        id: normalized.id,
      })
    : null;
}
