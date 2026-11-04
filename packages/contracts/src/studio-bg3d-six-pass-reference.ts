/** 가벼운 문서·렌더 경계용 식별자. 무거운 manifest·해시·Zod 그래프를 가져오지 않는다. */
export const STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY = "bg3d-sixpass-bundle.v1" as const;
export const STUDIO_BG3D_SIX_PASS_BUNDLE_MIN_PROJECT_VERSION = 5 as const;
export const STUDIO_BG3D_SIX_PASS_ROLES = ["color", "tone", "shadow", "depth", "texture-line", "main-line"] as const;
export type StudioBg3dSixPassRole = typeof STUDIO_BG3D_SIX_PASS_ROLES[number];
/** Canvas 이미지 합성 연산 전체와 Studio의 기존 normal 별칭을 원문 그대로 보존한다. */
export const STUDIO_BG3D_SIX_PASS_IMAGE_BLEND_MODES = [
  "normal", "source-over", "source-in", "source-out", "source-atop", "destination-over",
  "destination-in", "destination-out", "destination-atop", "lighter", "copy", "xor",
  "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn",
  "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity",
] as const;
export type StudioBg3dSixPassImageBlendMode = typeof STUDIO_BG3D_SIX_PASS_IMAGE_BLEND_MODES[number];
export function isStudioBg3dSixPassImageBlendMode(value: unknown): value is StudioBg3dSixPassImageBlendMode {
  return typeof value === "string" && STUDIO_BG3D_SIX_PASS_IMAGE_BLEND_MODES.some((mode) => mode === value);
}
export type StudioBg3dSixPassContentHash = `sha256:${string}`;
export interface StudioBg3dSixPassBundleImageReference {
  readonly kind: "bg3d-sixpass-bundle";
  readonly bundleId: string;
  readonly renderRevisionId: string;
  readonly manifestHash: StudioBg3dSixPassContentHash;
  readonly role: StudioBg3dSixPassRole;
  readonly elementId: string;
}
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/u;
const URI = /^bg3d-lt-artifact:\/\/sha256\/([a-f0-9]{64})$/u;
const REFERENCE_KEYS = ["bundleId", "elementId", "kind", "manifestHash", "renderRevisionId", "role"];
export function isStudioBg3dSixPassContentHash(value: unknown): value is StudioBg3dSixPassContentHash {
  return typeof value === "string" && HASH.test(value);
}
export function isStudioBg3dSixPassRole(value: unknown): value is StudioBg3dSixPassRole {
  return typeof value === "string" && STUDIO_BG3D_SIX_PASS_ROLES.some((role) => role === value);
}
export function studioBg3dSixPassArtifactSourceUri(contentHash: StudioBg3dSixPassContentHash): string {
  if (!isStudioBg3dSixPassContentHash(contentHash)) throw new TypeError("6패스 artifact SHA-256이 올바르지 않습니다.");
  return `bg3d-lt-artifact://sha256/${contentHash.slice(7)}`;
}
export function parseStudioBg3dSixPassArtifactSourceUri(value: unknown): StudioBg3dSixPassContentHash | null {
  if (typeof value !== "string") return null;
  const match = URI.exec(value);
  return match ? `sha256:${match[1]}` : null;
}
export function parseStudioBg3dSixPassBundleImageReference(value: unknown): StudioBg3dSixPassBundleImageReference | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== REFERENCE_KEYS.length || keys.some((key, index) => key !== REFERENCE_KEYS[index])
    || record.kind !== "bg3d-sixpass-bundle" || !isStudioBg3dSixPassRole(record.role)
    || !isStudioBg3dSixPassContentHash(record.manifestHash)
    || typeof record.bundleId !== "string" || !ID.test(record.bundleId)
    || typeof record.renderRevisionId !== "string" || !ID.test(record.renderRevisionId)
    || typeof record.elementId !== "string" || !ID.test(record.elementId)) return null;
  return { kind: "bg3d-sixpass-bundle", bundleId: record.bundleId, renderRevisionId: record.renderRevisionId,
    manifestHash: record.manifestHash, role: record.role, elementId: record.elementId };
}
/**
 * 시작 시점에는 보존 봉투·reader·identity만 검사한다. 본문을 적용하거나 hydrate하기 전에는
 * lazy bundle 모듈의 parseStudioBg3dSixPassBundleState로 전체 계약을 반드시 검사한다.
 */
export function hasStudioBg3dSixPassBundleStateEnvelope(value: unknown): boolean {
  const object = (entry: unknown): entry is Record<string, unknown> => entry !== null && typeof entry === "object" && !Array.isArray(entry);
  const exact = (entry: Record<string, unknown>, keys: readonly string[]) => {
    const actual = Object.keys(entry).sort();
    return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
  };
  if (!object(value) || !exact(value, ["bundles", "contract", "minimumProjectVersion", "minimumReaderCapability", "version"])
    || value.contract !== "toonstudio.bg3d-sixpass-bundles.v1" || value.version !== 1
    || value.minimumProjectVersion !== 5 || value.minimumReaderCapability !== STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY
    || !Array.isArray(value.bundles)) return false;
  const ids = new Set<string>();
  for (const bundle of value.bundles) {
    if (!object(bundle) || !exact(bundle, ["activeRevisionId", "bundleId", "revisions"])
      || typeof bundle.bundleId !== "string" || !ID.test(bundle.bundleId) || ids.has(bundle.bundleId)
      || !Array.isArray(bundle.revisions) || bundle.revisions.length === 0) return false;
    ids.add(bundle.bundleId);
    const revisions = new Set<string>();
    for (const revision of bundle.revisions) {
      if (!object(revision) || revision.contract !== "toonstudio.bg3d-sixpass-bundle.v1" || revision.version !== 1
        || revision.minimumProjectVersion !== 5 || revision.minimumReaderCapability !== STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY
        || revision.bundleId !== bundle.bundleId || typeof revision.renderRevisionId !== "string"
        || !ID.test(revision.renderRevisionId) || revisions.has(revision.renderRevisionId)) return false;
      revisions.add(revision.renderRevisionId);
    }
    if (bundle.activeRevisionId !== null && (typeof bundle.activeRevisionId !== "string" || !revisions.has(bundle.activeRevisionId))) return false;
  }
  return true;
}
