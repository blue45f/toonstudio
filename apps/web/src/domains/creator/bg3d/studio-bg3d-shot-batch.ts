import { isStudioBg3dShotBatchNumberInRange, isStudioBg3dShotBatchIntegerInRange, STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION } from "./studio-bg3d-shot-batch-limits";
import { STUDIO_BG3D_LT_RENDER_MAX_PIXELS } from "./studio-bg3d-lt-render";
import { StudioBg3dShotBatchPublicPlanError } from "./studio-bg3d-shot-batch-public-plan-error";
import { StudioBg3dShotBatchArchiveError } from "./studio-bg3d-shot-batch-archive-error";
import { isStudioBg3dTilePipelineId, STUDIO_BG3D_TILED_PNG_PROFILE } from "./studio-bg3d-tiled-batch-policy";
import { buildStudioPackageArchiveBlob } from "../studio-package-archive";
import { compareStudioValidationStrings } from "../studio-validation-string-order";
import {
  verifyStudioBg3dLayeredPsdFile,
  verifyStudioBg3dOpaqueRgb8PngFile,
  verifyStudioBg3dRgba8PngFile,
} from "./studio-bg3d-file-integrity";
import { resolveStudioBg3dLtCaptureSize } from "./studio-bg3d-lt-capture-size";
import {
  STUDIO_BG3D_SHOT_BATCH_MAX_FILES,
  STUDIO_BG3D_SHOT_BATCH_PASSES,
  STUDIO_BG3D_SHOT_BATCH_PLAN_MAX_PIXELS,
  STUDIO_BG3D_SHOT_BATCH_PLAN_MAX_SOURCE_DIMENSION,
  STUDIO_BG3D_SHOT_BATCH_PSD_ENCODING_V1,
  computeStudioBg3dShotBatchRenderDigest,
  hydrateStudioBg3dShotBatchPlan,
  verifyStudioBg3dShotBatchSourceRevision,
  type StudioBg3dShotBatchPlan,
  type StudioBg3dShotBatchPass,
} from "./studio-bg3d-shot-batch-plan";
import {
  STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_OUTPUT_BYTES,
  STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_SHOTS,
  STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_TOTAL_OUTPUT_BYTES,
  type StudioBg3dShotContactSheetOutput,
} from "./studio-bg3d-shot-contact-sheet-contract";
import {
  STUDIO_BG3D_SHOT_PSD_MAX_OUTPUT_BYTES,
  STUDIO_BG3D_SHOT_PSD_MIME,
} from "./studio-bg3d-shot-psd-contract";

import type { StudioCrc32ExecutionMode } from "../studio-crc32-worker-client";

export const STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS = 64;
export const STUDIO_BG3D_SHOT_BATCH_MAX_ARTIFACTS = STUDIO_BG3D_SHOT_BATCH_MAX_FILES;
export const STUDIO_BG3D_SHOT_BATCH_MAX_ARCHIVE_ARTIFACTS =
  STUDIO_BG3D_SHOT_BATCH_MAX_ARTIFACTS + STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS * 2;
export const STUDIO_BG3D_SHOT_BATCH_MAX_IMAGE_BYTES = 24 * 1024 * 1024;
export const STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES = 384 * 1024 * 1024;
export { STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION } from "./studio-bg3d-shot-batch-limits";

export interface StudioBg3dShotBatchImage {
  readonly shotId: string;
  readonly shotName: string;
  readonly width: number;
  readonly height: number;
  /** Explicit v2 artifact identity. Omit only for a backwards-compatible v1 archive. */
  readonly pass?: StudioBg3dShotBatchPass;
  /** @deprecated v1 compatibility alias. New callers must use `pass`. */
  readonly output?: "beauty" | "lt-composite";
  /** Requested maximum height before device/raster budgets are applied. */
  readonly requestedHeight?: number;
  /** True when the actual artifact height is lower than `requestedHeight`. */
  readonly wasReduced?: boolean;
  readonly png: Blob;
}

export interface StudioBg3dShotBatchSkippedArtifact {
  readonly shotId: string;
  readonly shotName: string;
  readonly pass: StudioBg3dShotBatchPass;
  readonly reason: "disabled" | "unavailable";
}

export interface StudioBg3dShotBatchLayeredPsd {
  readonly shotId: string;
  readonly shotName: string;
  readonly width: number;
  readonly height: number;
  readonly psd: Blob;
}

export interface StudioBg3dShotBatchPsdFallback {
  readonly shotId: string;
  readonly shotName: string;
  readonly reason: "budget" | "unavailable" | "worker-failed";
}

export type StudioBg3dShotBatchContactSheet = StudioBg3dShotContactSheetOutput;

export type StudioBg3dShotBatchContactSheetFallback =
  | "budget"
  | "source-unavailable"
  | "unavailable"
  | "worker-failed";

export const STUDIO_BG3D_SHOT_BATCH_PUBLIC_RENDER_PLAN_KIND =
  "toonstudio-bg3d-shot-batch-public-render-plan";
export const STUDIO_BG3D_SHOT_BATCH_PUBLIC_RENDER_PLAN_VERSION = 1;
export const STUDIO_BG3D_SHOT_BATCH_APP_IMPLEMENTATION_PROFILE_V1 =
  "toonstudio-studio-bg3d-shot-batch-plan-v2";
export const STUDIO_BG3D_SHOT_BATCH_DEPTH_ENCODING_V1 =
  "normalized-device-depth-u8-near-black-far-white-v1";
export const STUDIO_BG3D_SHOT_BATCH_PSD_PROFILE_V1 =
  STUDIO_BG3D_SHOT_BATCH_PSD_ENCODING_V1;
export const STUDIO_BG3D_SHOT_BATCH_CONTACT_SHEET_PROFILE_V1 =
  "studio-bg3d-contact-sheet-srgb-opaque-rgb8-v1";
export const STUDIO_BG3D_SHOT_BATCH_ARCHIVE_PROFILE_V1 =
  "studio-bg3d-shot-batch-zip-store-manifest-v3";

export interface StudioBg3dShotBatchPublicRenderImplementation {
  readonly appProfileId: string;
  readonly engineId: StudioBg3dShotBatchPlan["captureOwner"]["engineId"];
  readonly engineRevision: string;
  readonly adapterImplementationRevision: string;
  readonly graphicsApi: StudioBg3dShotBatchPlan["captureOwner"]["graphicsApi"];
  readonly backend: StudioBg3dShotBatchPlan["captureOwner"]["backend"];
}

export interface StudioBg3dShotBatchPublicCaptureProfile {
  readonly profileId: string;
  readonly ltPipelineId: string;
  readonly pngEncodingId: string;
  readonly depthEncodingId: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly maxPixels: number;
  readonly maxEdge: number;
  readonly deviceProfile: "mobile" | "desktop";
  readonly textureScale: number;
  readonly lodBias: number;
}

export interface StudioBg3dShotBatchPublicArtifactProfiles {
  readonly psdProfileId: string;
  readonly contactSheetProfileId: string;
  readonly archiveProfileId: string;
}

export interface StudioBg3dShotBatchPublicFrozenCaptureSpec {
  readonly width: number;
  readonly height: number;
  readonly requestedHeight: number;
  readonly wasReduced: boolean;
  readonly includeDepth: boolean;
  readonly shadows: boolean;
  readonly shadowMapSize: 0 | 256 | 512 | 1024 | 2048 | 4096;
  readonly background: {
    readonly color: string;
    readonly alpha: 0 | 1;
  };
}

export interface StudioBg3dShotBatchPublicPlannedFile {
  readonly shotId: string;
  readonly shotName: string;
  readonly shotIndex: number;
  readonly pass: StudioBg3dShotBatchPass;
  readonly path: string;
}

export interface StudioBg3dShotBatchPublicPlannedShot {
  readonly shotId: string;
  readonly shotName: string;
  readonly shotIndex: number;
  readonly capture: StudioBg3dShotBatchPublicFrozenCaptureSpec;
  readonly files: readonly StudioBg3dShotBatchPublicPlannedFile[];
}

/**
 * Public, engine-neutral projection of Plan v2. It deliberately has no recovery partition,
 * authorization/work/page/element ids, resume key, or canonical source bytes.
 */
export interface StudioBg3dShotBatchPublicRenderPlan {
  readonly kind: typeof STUDIO_BG3D_SHOT_BATCH_PUBLIC_RENDER_PLAN_KIND;
  readonly version: typeof STUDIO_BG3D_SHOT_BATCH_PUBLIC_RENDER_PLAN_VERSION;
  readonly sourceDigest: string;
  /** Plan v2's scope-independent `planDigest`, renamed to make its public purpose explicit. */
  readonly renderDigest: string;
  readonly implementation: StudioBg3dShotBatchPublicRenderImplementation;
  readonly captureProfile: StudioBg3dShotBatchPublicCaptureProfile;
  readonly artifactProfiles: StudioBg3dShotBatchPublicArtifactProfiles;
  readonly passes: readonly StudioBg3dShotBatchPass[];
  readonly exportHeight: "per-shot" | number;
  readonly artifactRequests: {
    readonly layeredPsd: boolean;
    readonly contactSheet: boolean;
  };
  readonly shots: readonly StudioBg3dShotBatchPublicPlannedShot[];
}

export type StudioBg3dShotBatchPublicRenderPlanInput = StudioBg3dShotBatchPublicRenderPlan;

export interface StudioBg3dShotBatchPublicRenderProjectionOptions {
  readonly appProfileId: string;
  /** Private canonical source used only to verify `sourceDigest`; never copied into the projection. */
  readonly sourceRevision: string;
}

export interface StudioBg3dShotBatchLegacyManifestContext {
  readonly publicRenderPlan?: never;
  readonly resumeKey?: string;
  readonly shots?: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly requestedPasses?: readonly StudioBg3dShotBatchPass[];
  readonly resolution?:
    | { readonly mode: "per-shot-maximum" }
    | { readonly mode: "maximum-height"; readonly height: number };
  readonly skippedArtifacts?: readonly StudioBg3dShotBatchSkippedArtifact[];
  readonly psdFallbacks?: readonly StudioBg3dShotBatchPsdFallback[];
  readonly layeredPsdRequested?: boolean;
  readonly contactSheetRequested?: boolean;
  readonly contactSheetFallback?: StudioBg3dShotBatchContactSheetFallback;
}

export interface StudioBg3dShotBatchPublicManifestContext {
  readonly publicRenderPlan: StudioBg3dShotBatchPublicRenderPlan;
  readonly skippedArtifacts?: readonly StudioBg3dShotBatchSkippedArtifact[];
  readonly psdFallbacks?: readonly StudioBg3dShotBatchPsdFallback[];
  readonly contactSheetFallback?: StudioBg3dShotBatchContactSheetFallback;
  readonly resumeKey?: never;
  readonly shots?: never;
  readonly requestedPasses?: never;
  readonly resolution?: never;
  readonly layeredPsdRequested?: never;
  readonly contactSheetRequested?: never;
}

export type StudioBg3dShotBatchManifestContext =
  | StudioBg3dShotBatchLegacyManifestContext
  | StudioBg3dShotBatchPublicManifestContext;

export interface StudioBg3dShotBatchProgress {
  readonly completedFiles: number;
  readonly totalFiles: number;
}

export interface StudioBg3dShotBatchBuildOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: StudioBg3dShotBatchProgress) => void;
  readonly manifest?: StudioBg3dShotBatchManifestContext;
  readonly layeredPsds?: readonly StudioBg3dShotBatchLayeredPsd[];
  readonly contactSheets?: readonly StudioBg3dShotBatchContactSheet[];
  /** Fixed before ZIP construction. The archive Worker selects `direct-headless`. */
  readonly crc32ExecutionMode?: StudioCrc32ExecutionMode;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u;
const UNSAFE_TEXT_PATTERN = /\p{Cc}/u;
const EXTERNAL_REFERENCE_PATTERN = /(?:\b(?:blob|data|file|https?):|:\/\/|\bwww\.)/iu;
const MAX_DIMENSION = STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION;
const MAX_NAME_LENGTH = 80;
const RESUME_KEY_PATTERN = /^bg3d-batch-[0-9a-f]{8}$/u;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9._:+/-]{0,119}$/u;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/iu;
const PUBLIC_SOURCE_MAX_DIMENSION = STUDIO_BG3D_SHOT_BATCH_PLAN_MAX_SOURCE_DIMENSION;
const PUBLIC_MAX_PIXELS = STUDIO_BG3D_SHOT_BATCH_PLAN_MAX_PIXELS;
const SHADOW_MAP_SIZE_SET = new Set([0, 256, 512, 1024, 2048, 4096]);
const ENGINE_ID_SET = new Set(["three", "babylon", "playcanvas", "filament", "cesium"]);
const GRAPHICS_API_SET = new Set(["webgl2", "webgpu"]);
const CAPTURE_BACKEND_SET = new Set([
  "three-webgl",
  "three-webgpu",
  "babylon-webgl",
  "babylon-webgpu",
  "playcanvas-webgl",
  "playcanvas-webgpu",
  "filament-webgl",
  "filament-webgpu",
  "cesium-webgl",
  "cesium-webgpu",
]);
const PUBLIC_MANIFEST_KEYS = [
  "publicRenderPlan",
  "skippedArtifacts",
  "psdFallbacks",
  "contactSheetFallback",
] as const;
const LEGACY_MANIFEST_KEYS = [
  "resumeKey",
  "shots",
  "requestedPasses",
  "resolution",
  "skippedArtifacts",
  "psdFallbacks",
  "layeredPsdRequested",
  "contactSheetRequested",
  "contactSheetFallback",
] as const;
const PASS_SET = new Set<string>(STUDIO_BG3D_SHOT_BATCH_PASSES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort(compareStudioValidationStrings);
  const expected = [...keys].sort(compareStudioValidationStrings);
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function hasOnlyKeys(value: unknown, keys: readonly string[]): boolean {
  return isRecord(value) && Object.keys(value).every((key) => keys.includes(key));
}

function abortError(): Error {
  const error = new Error("컷 일괄 렌더를 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function validShotName(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 &&
    Array.from(normalized).length <= MAX_NAME_LENGTH &&
    normalized === value &&
    !UNSAFE_TEXT_PATTERN.test(normalized) &&
    !EXTERNAL_REFERENCE_PATTERN.test(normalized);
}

async function validatePng(
  image: StudioBg3dShotBatchImage,
  signal?: AbortSignal,
): Promise<void> {
  if (
    !ID_PATTERN.test(image.shotId) ||
    !validShotName(image.shotName) ||
    !isStudioBg3dShotBatchIntegerInRange(image.width, 1, MAX_DIMENSION) ||
    !isStudioBg3dShotBatchIntegerInRange(image.height, 1, MAX_DIMENSION) ||
    (image.pass !== undefined && !PASS_SET.has(image.pass)) ||
    (image.output !== undefined && image.output !== "beauty" && image.output !== "lt-composite") ||
    (image.pass !== undefined && image.output !== undefined && image.pass !== image.output) ||
    ((image.requestedHeight === undefined) !== (image.wasReduced === undefined)) ||
    (image.requestedHeight !== undefined && (
      !isStudioBg3dShotBatchIntegerInRange(image.requestedHeight, 256, MAX_DIMENSION) ||
      image.height > image.requestedHeight ||
      typeof image.wasReduced !== "boolean" ||
      image.wasReduced !== (image.height < image.requestedHeight)
    )) ||
    !(image.png instanceof Blob) ||
    image.png.type !== "image/png" ||
    image.png.size < 24 ||
    image.png.size > STUDIO_BG3D_SHOT_BATCH_MAX_IMAGE_BYTES
  ) {
    throw new StudioBg3dShotBatchArchiveError("pngItemUnsafeFormatOrBudget", "type");
  }
  await verifyStudioBg3dRgba8PngFile(image.png, {
    expectedWidth: image.width,
    expectedHeight: image.height,
    maxBytes: STUDIO_BG3D_SHOT_BATCH_MAX_IMAGE_BYTES,
    signal,
  });
}

async function validateLayeredPsd(
  artifact: StudioBg3dShotBatchLayeredPsd,
  signal?: AbortSignal,
): Promise<void> {
  if (
    !ID_PATTERN.test(artifact.shotId) ||
    !validShotName(artifact.shotName) ||
    !isStudioBg3dShotBatchIntegerInRange(artifact.width, 1, MAX_DIMENSION) ||
    !isStudioBg3dShotBatchIntegerInRange(artifact.height, 1, MAX_DIMENSION) ||
    !(artifact.psd instanceof Blob) ||
    artifact.psd.type !== STUDIO_BG3D_SHOT_PSD_MIME ||
    artifact.psd.size < 26 ||
    artifact.psd.size > STUDIO_BG3D_SHOT_PSD_MAX_OUTPUT_BYTES
  ) {
    throw new StudioBg3dShotBatchArchiveError("psdArtifactUnsafeFormatOrBudget", "type");
  }
  await verifyStudioBg3dLayeredPsdFile(artifact.psd, {
    expectedWidth: artifact.width,
    expectedHeight: artifact.height,
    maxBytes: STUDIO_BG3D_SHOT_PSD_MAX_OUTPUT_BYTES,
    signal,
  });
}

function artifactPass(image: StudioBg3dShotBatchImage): StudioBg3dShotBatchPass {
  return image.pass ?? image.output ?? "beauty";
}

function freezePublicRenderPlan(
  plan: StudioBg3dShotBatchPublicRenderPlan,
): StudioBg3dShotBatchPublicRenderPlan {
  Object.freeze(plan.implementation);
  Object.freeze(plan.captureProfile);
  Object.freeze(plan.artifactProfiles);
  Object.freeze(plan.artifactRequests);
  Object.freeze(plan.passes);
  for (const shot of plan.shots) {
    Object.freeze(shot.capture.background);
    Object.freeze(shot.capture);
    for (const file of shot.files) Object.freeze(file);
    Object.freeze(shot.files);
    Object.freeze(shot);
  }
  Object.freeze(plan.shots);
  return Object.freeze(plan);
}

function snapshotPublicRenderPlan(
  value: unknown,
  requireCanonicalOrder: boolean,
): StudioBg3dShotBatchPublicRenderPlan {
  if (!hasExactKeys(value, [
    "kind",
    "version",
    "sourceDigest",
    "renderDigest",
    "implementation",
    "captureProfile",
    "artifactProfiles",
    "passes",
    "exportHeight",
    "artifactRequests",
    "shots",
  ])) {
    throw new StudioBg3dShotBatchArchiveError("publicPlanUnknownOrMissingFields", "type");
  }
  const plan = value as unknown as StudioBg3dShotBatchPublicRenderPlan;
  if (
    plan.kind !== STUDIO_BG3D_SHOT_BATCH_PUBLIC_RENDER_PLAN_KIND ||
    plan.version !== STUDIO_BG3D_SHOT_BATCH_PUBLIC_RENDER_PLAN_VERSION ||
    !SHA256_HEX_PATTERN.test(plan.sourceDigest) ||
    !SHA256_HEX_PATTERN.test(plan.renderDigest) ||
    !hasExactKeys(plan.implementation, [
      "appProfileId",
      "engineId",
      "engineRevision",
      "adapterImplementationRevision",
      "graphicsApi",
      "backend",
    ]) ||
    !PROFILE_ID_PATTERN.test(plan.implementation.appProfileId) ||
    plan.implementation.appProfileId !== STUDIO_BG3D_SHOT_BATCH_APP_IMPLEMENTATION_PROFILE_V1 ||
    !ENGINE_ID_SET.has(plan.implementation.engineId) ||
    !PROFILE_ID_PATTERN.test(plan.implementation.engineRevision) ||
    !PROFILE_ID_PATTERN.test(plan.implementation.adapterImplementationRevision) ||
    !GRAPHICS_API_SET.has(plan.implementation.graphicsApi) ||
    !CAPTURE_BACKEND_SET.has(plan.implementation.backend) ||
    plan.implementation.backend !== `${plan.implementation.engineId}-${
      plan.implementation.graphicsApi === "webgl2" ? "webgl" : "webgpu"
    }` ||
    !hasExactKeys(plan.captureProfile, [
      "profileId",
      "ltPipelineId",
      "pngEncodingId",
      "depthEncodingId",
      "sourceWidth",
      "sourceHeight",
      "maxPixels",
      "maxEdge",
      "deviceProfile",
      "textureScale",
      "lodBias",
    ]) ||
    !PROFILE_ID_PATTERN.test(plan.captureProfile.profileId) ||
    !PROFILE_ID_PATTERN.test(plan.captureProfile.ltPipelineId) ||
    !PROFILE_ID_PATTERN.test(plan.captureProfile.pngEncodingId) ||
    !PROFILE_ID_PATTERN.test(plan.captureProfile.depthEncodingId) ||
    plan.captureProfile.depthEncodingId !== STUDIO_BG3D_SHOT_BATCH_DEPTH_ENCODING_V1 ||
    !isStudioBg3dShotBatchIntegerInRange(plan.captureProfile.sourceWidth, 1, PUBLIC_SOURCE_MAX_DIMENSION) ||
    !isStudioBg3dShotBatchIntegerInRange(plan.captureProfile.sourceHeight, 1, PUBLIC_SOURCE_MAX_DIMENSION) ||
    !isStudioBg3dShotBatchIntegerInRange(plan.captureProfile.maxPixels, 1, PUBLIC_MAX_PIXELS) ||
    (plan.captureProfile.maxPixels > STUDIO_BG3D_LT_RENDER_MAX_PIXELS &&
      (plan.implementation.engineId !== "three" || !isStudioBg3dTilePipelineId(plan.captureProfile.ltPipelineId)
        || plan.captureProfile.pngEncodingId !== STUDIO_BG3D_TILED_PNG_PROFILE)) ||
    !isStudioBg3dShotBatchIntegerInRange(plan.captureProfile.maxEdge, 1, MAX_DIMENSION) ||
    (plan.captureProfile.deviceProfile !== "mobile" &&
      plan.captureProfile.deviceProfile !== "desktop") ||
    !isStudioBg3dShotBatchNumberInRange(plan.captureProfile.textureScale, 0.01, 4) ||
    !isStudioBg3dShotBatchNumberInRange(plan.captureProfile.lodBias, 0, 8) ||
    !hasExactKeys(plan.artifactProfiles, [
      "psdProfileId",
      "contactSheetProfileId",
      "archiveProfileId",
    ]) ||
    !PROFILE_ID_PATTERN.test(plan.artifactProfiles.psdProfileId) ||
    !PROFILE_ID_PATTERN.test(plan.artifactProfiles.contactSheetProfileId) ||
    plan.artifactProfiles.contactSheetProfileId !==
      STUDIO_BG3D_SHOT_BATCH_CONTACT_SHEET_PROFILE_V1 ||
    !PROFILE_ID_PATTERN.test(plan.artifactProfiles.archiveProfileId) ||
    plan.artifactProfiles.archiveProfileId !== STUDIO_BG3D_SHOT_BATCH_ARCHIVE_PROFILE_V1 ||
    !Array.isArray(plan.passes) ||
    plan.passes.length < 1 ||
    plan.passes.length > STUDIO_BG3D_SHOT_BATCH_PASSES.length ||
    plan.passes.some((pass) => !PASS_SET.has(pass)) ||
    new Set(plan.passes).size !== plan.passes.length ||
    (plan.exportHeight !== "per-shot" && (
      !isStudioBg3dShotBatchIntegerInRange(plan.exportHeight, 256, MAX_DIMENSION)
    )) ||
    !hasExactKeys(plan.artifactRequests, ["layeredPsd", "contactSheet"]) ||
    typeof plan.artifactRequests.layeredPsd !== "boolean" ||
    typeof plan.artifactRequests.contactSheet !== "boolean" ||
    !Array.isArray(plan.shots) ||
    plan.shots.length < 1 ||
    plan.shots.length > STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS
  ) {
    throw new StudioBg3dShotBatchArchiveError("publicPlanUnsafeFormatOrBudget", "type");
  }
  const canonicalPasses = STUDIO_BG3D_SHOT_BATCH_PASSES.filter((pass) =>
    plan.passes.includes(pass));
  if (
    requireCanonicalOrder &&
    canonicalPasses.some((pass, index) => plan.passes[index] !== pass)
  ) {
    throw new StudioBg3dShotBatchArchiveError("publicPlanPassOrderNotCanonical", "type");
  }

  const shotIds = new Set<string>();
  const shotIndexes = new Set<number>();
  const shots = plan.shots.map((shot) => {
    if (
      !hasExactKeys(shot, ["shotId", "shotName", "shotIndex", "capture", "files"]) ||
      !ID_PATTERN.test(shot.shotId) ||
      !validShotName(shot.shotName) ||
      !isStudioBg3dShotBatchIntegerInRange(shot.shotIndex, 1, plan.shots.length) ||
      shotIds.has(shot.shotId) ||
      shotIndexes.has(shot.shotIndex) ||
      !hasExactKeys(shot.capture, [
        "width",
        "height",
        "requestedHeight",
        "wasReduced",
        "includeDepth",
        "shadows",
        "shadowMapSize",
        "background",
      ]) ||
      !isStudioBg3dShotBatchIntegerInRange(shot.capture.width, 1, plan.captureProfile.maxEdge) ||
      !isStudioBg3dShotBatchIntegerInRange(shot.capture.height, 1, plan.captureProfile.maxEdge) ||
      !Number.isSafeInteger(shot.capture.width * shot.capture.height) ||
      shot.capture.width * shot.capture.height > plan.captureProfile.maxPixels ||
      !isStudioBg3dShotBatchIntegerInRange(shot.capture.requestedHeight, 256, MAX_DIMENSION) ||
      shot.capture.height > shot.capture.requestedHeight ||
      typeof shot.capture.wasReduced !== "boolean" ||
      shot.capture.wasReduced !== (shot.capture.height < shot.capture.requestedHeight) ||
      (plan.exportHeight !== "per-shot" &&
        shot.capture.requestedHeight !== plan.exportHeight) ||
      typeof shot.capture.includeDepth !== "boolean" ||
      ((canonicalPasses.includes("depth") || canonicalPasses.includes("normal")) &&
        !shot.capture.includeDepth) ||
      typeof shot.capture.shadows !== "boolean" ||
      !Number.isSafeInteger(shot.capture.shadowMapSize) ||
      !SHADOW_MAP_SIZE_SET.has(shot.capture.shadowMapSize) ||
      (shot.capture.shadows
        ? shot.capture.shadowMapSize === 0
        : shot.capture.shadowMapSize !== 0) ||
      !hasExactKeys(shot.capture.background, ["color", "alpha"]) ||
      typeof shot.capture.background.color !== "string" ||
      !HEX_COLOR_PATTERN.test(shot.capture.background.color) ||
      (shot.capture.background.alpha !== 0 && shot.capture.background.alpha !== 1) ||
      !Array.isArray(shot.files) ||
      shot.files.length !== canonicalPasses.length
    ) {
      throw new StudioBg3dShotBatchArchiveError("publicPlanFrozenShotInvalid", "type");
    }
    const resolvedSize = resolveStudioBg3dLtCaptureSize({
      sourceWidth: plan.captureProfile.sourceWidth,
      sourceHeight: plan.captureProfile.sourceHeight,
      requestedHeight: shot.capture.requestedHeight,
      maxPixels: plan.captureProfile.maxPixels,
      maxEdge: plan.captureProfile.maxEdge,
    });
    if (
      !resolvedSize ||
      shot.capture.width !== resolvedSize.width ||
      shot.capture.height !== resolvedSize.height ||
      shot.capture.wasReduced !== resolvedSize.wasReduced
    ) {
      throw new StudioBg3dShotBatchArchiveError("publicPlanFrozenResolutionMismatch", "type");
    }
    shotIds.add(shot.shotId);
    shotIndexes.add(shot.shotIndex);
    const seenPasses = new Set<StudioBg3dShotBatchPass>();
    const files = shot.files.map((file: StudioBg3dShotBatchPublicPlannedFile) => {
      const ordinal = String(shot.shotIndex).padStart(3, "0");
      if (
        !hasExactKeys(file, ["shotId", "shotName", "shotIndex", "pass", "path"]) ||
        file.shotId !== shot.shotId ||
        file.shotName !== shot.shotName ||
        file.shotIndex !== shot.shotIndex ||
        !PASS_SET.has(file.pass) ||
        !canonicalPasses.includes(file.pass) ||
        seenPasses.has(file.pass) ||
        file.path !== `shots/${ordinal}/${file.pass}.png`
      ) {
        throw new StudioBg3dShotBatchArchiveError("publicPlanFileContractInvalid", "type");
      }
      seenPasses.add(file.pass);
      return {
        shotId: file.shotId,
        shotName: file.shotName,
        shotIndex: file.shotIndex,
        pass: file.pass,
        path: file.path,
      } satisfies StudioBg3dShotBatchPublicPlannedFile;
    }).sort((left: StudioBg3dShotBatchPublicPlannedFile, right: StudioBg3dShotBatchPublicPlannedFile) =>
      canonicalPasses.indexOf(left.pass) - canonicalPasses.indexOf(right.pass));
    if (
      canonicalPasses.some((pass) => !seenPasses.has(pass)) ||
      (requireCanonicalOrder && canonicalPasses.some((pass, index) =>
        shot.files[index]?.pass !== pass))
    ) {
      throw new StudioBg3dShotBatchArchiveError("publicPlanFileOrderNotCanonical", "type");
    }
    return {
      shotId: shot.shotId,
      shotName: shot.shotName,
      shotIndex: shot.shotIndex,
      capture: {
        width: shot.capture.width,
        height: shot.capture.height,
        requestedHeight: shot.capture.requestedHeight,
        wasReduced: shot.capture.wasReduced,
        includeDepth: shot.capture.includeDepth,
        shadows: shot.capture.shadows,
        shadowMapSize: shot.capture.shadowMapSize,
        background: {
          color: shot.capture.background.color.toLowerCase(),
          alpha: shot.capture.background.alpha,
        },
      },
      files,
    } satisfies StudioBg3dShotBatchPublicPlannedShot;
  }).sort((left, right) => left.shotIndex - right.shotIndex);
  if (
    shots.some((shot, index) => shot.shotIndex !== index + 1) ||
    (requireCanonicalOrder && shots.some((shot, index) => shot.shotId !== plan.shots[index]?.shotId)) ||
    (requireCanonicalOrder && plan.shots.some((shot) =>
      shot.capture.background.color !== shot.capture.background.color.toLowerCase()))
  ) {
    throw new StudioBg3dShotBatchArchiveError("publicPlanShotOrderNotCanonical", "type");
  }

  return freezePublicRenderPlan({
    kind: STUDIO_BG3D_SHOT_BATCH_PUBLIC_RENDER_PLAN_KIND,
    version: STUDIO_BG3D_SHOT_BATCH_PUBLIC_RENDER_PLAN_VERSION,
    sourceDigest: plan.sourceDigest,
    renderDigest: plan.renderDigest,
    implementation: {
      appProfileId: plan.implementation.appProfileId,
      engineId: plan.implementation.engineId,
      engineRevision: plan.implementation.engineRevision,
      adapterImplementationRevision: plan.implementation.adapterImplementationRevision,
      graphicsApi: plan.implementation.graphicsApi,
      backend: plan.implementation.backend,
    },
    captureProfile: {
      profileId: plan.captureProfile.profileId,
      ltPipelineId: plan.captureProfile.ltPipelineId,
      pngEncodingId: plan.captureProfile.pngEncodingId,
      depthEncodingId: plan.captureProfile.depthEncodingId,
      sourceWidth: plan.captureProfile.sourceWidth,
      sourceHeight: plan.captureProfile.sourceHeight,
      maxPixels: plan.captureProfile.maxPixels,
      maxEdge: plan.captureProfile.maxEdge,
      deviceProfile: plan.captureProfile.deviceProfile,
      textureScale: plan.captureProfile.textureScale,
      lodBias: plan.captureProfile.lodBias,
    },
    artifactProfiles: {
      psdProfileId: plan.artifactProfiles.psdProfileId,
      contactSheetProfileId: plan.artifactProfiles.contactSheetProfileId,
      archiveProfileId: plan.artifactProfiles.archiveProfileId,
    },
    passes: canonicalPasses,
    exportHeight: plan.exportHeight,
    artifactRequests: {
      layeredPsd: plan.artifactRequests.layeredPsd,
      contactSheet: plan.artifactRequests.contactSheet,
    },
    shots,
  });
}

/** Builds the only Plan-v2 projection allowed to cross the public archive boundary. */
export function createStudioBg3dShotBatchPublicRenderPlan(
  input: StudioBg3dShotBatchPublicRenderPlanInput,
): StudioBg3dShotBatchPublicRenderPlan {
  return snapshotPublicRenderPlan(input, false);
}

/**
 * Projects a validated private Plan v2 into the public archive schema. Recovery/scope fields and
 * private source bytes are never copied, even transiently into the returned object.
 */
export async function projectStudioBg3dShotBatchPlanForPublicArchive(
  plan: StudioBg3dShotBatchPlan,
  options: StudioBg3dShotBatchPublicRenderProjectionOptions,
): Promise<StudioBg3dShotBatchPublicRenderPlan> {
  let appProfileId: string;
  let sourceRevision: string;
  try {
    if (!hasExactKeys(options, ["appProfileId", "sourceRevision"])) {
      throw new StudioBg3dShotBatchPublicPlanError("publicProfileInvalid");
    }
    appProfileId = options.appProfileId;
    sourceRevision = options.sourceRevision;
  } catch {
    throw new StudioBg3dShotBatchPublicPlanError("publicProfileInvalid");
  }
  if (!PROFILE_ID_PATTERN.test(appProfileId) || typeof sourceRevision !== "string") {
    throw new StudioBg3dShotBatchPublicPlanError("publicProfileInvalid");
  }
  const verifiedPlan = await hydrateStudioBg3dShotBatchPlan(plan);
  if (
    !verifiedPlan ||
    !await verifyStudioBg3dShotBatchSourceRevision(verifiedPlan, sourceRevision)
  ) {
    throw new StudioBg3dShotBatchPublicPlanError("publicPlanDigestInvalid");
  }
  return createStudioBg3dShotBatchPublicRenderPlan({
    kind: STUDIO_BG3D_SHOT_BATCH_PUBLIC_RENDER_PLAN_KIND,
    version: STUDIO_BG3D_SHOT_BATCH_PUBLIC_RENDER_PLAN_VERSION,
    sourceDigest: verifiedPlan.sourceDigest,
    renderDigest: verifiedPlan.planDigest,
    implementation: {
      appProfileId,
      engineId: verifiedPlan.captureOwner.engineId,
      engineRevision: verifiedPlan.captureOwner.engineRevision,
      adapterImplementationRevision: verifiedPlan.captureOwner.implementationRevision,
      graphicsApi: verifiedPlan.captureOwner.graphicsApi,
      backend: verifiedPlan.captureOwner.backend,
    },
    captureProfile: {
      profileId: verifiedPlan.captureOwner.profileId,
      ltPipelineId: verifiedPlan.captureOwner.ltPipelineId,
      pngEncodingId: verifiedPlan.captureOwner.pngEncodingId,
      depthEncodingId: STUDIO_BG3D_SHOT_BATCH_DEPTH_ENCODING_V1,
      sourceWidth: verifiedPlan.captureOwner.sourceWidth,
      sourceHeight: verifiedPlan.captureOwner.sourceHeight,
      maxPixels: verifiedPlan.captureOwner.maxPixels,
      maxEdge: verifiedPlan.captureOwner.maxEdge,
      deviceProfile: verifiedPlan.captureOwner.deviceProfile,
      textureScale: verifiedPlan.captureOwner.textureScale,
      lodBias: verifiedPlan.captureOwner.lodBias,
    },
    artifactProfiles: {
      psdProfileId: verifiedPlan.captureOwner.psdEncodingId,
      contactSheetProfileId: STUDIO_BG3D_SHOT_BATCH_CONTACT_SHEET_PROFILE_V1,
      archiveProfileId: STUDIO_BG3D_SHOT_BATCH_ARCHIVE_PROFILE_V1,
    },
    passes: verifiedPlan.passes,
    exportHeight: verifiedPlan.exportHeight,
    artifactRequests: {
      layeredPsd: verifiedPlan.includeLayeredPsd,
      contactSheet: verifiedPlan.includeContactSheet,
    },
    shots: verifiedPlan.shots.map((shot) => ({
      shotId: shot.shotId,
      shotName: shot.shotName,
      shotIndex: shot.shotIndex,
      capture: {
        width: shot.capture.width,
        height: shot.capture.height,
        requestedHeight: shot.capture.requestedHeight,
        wasReduced: shot.capture.wasReduced,
        includeDepth: shot.capture.includeDepth,
        shadows: shot.capture.shadows,
        shadowMapSize: shot.capture.shadowMapSize,
        background: {
          color: shot.capture.background.color,
          alpha: shot.capture.background.alpha as 0 | 1,
        },
      },
      files: shot.files.map((file) => ({
        shotId: file.shotId,
        shotName: file.shotName,
        shotIndex: file.shotIndex,
        pass: file.pass,
        path: file.path,
      })),
    })),
  });
}

async function verifyStudioBg3dShotBatchPublicRenderDigest(
  plan: StudioBg3dShotBatchPublicRenderPlan,
): Promise<boolean> {
  const digest = await computeStudioBg3dShotBatchRenderDigest({
    sourceDigest: plan.sourceDigest,
    captureOwner: {
      backend: plan.implementation.backend,
      engineId: plan.implementation.engineId,
      engineRevision: plan.implementation.engineRevision,
      implementationRevision: plan.implementation.adapterImplementationRevision,
      graphicsApi: plan.implementation.graphicsApi,
      profileId: plan.captureProfile.profileId,
      sourceWidth: plan.captureProfile.sourceWidth,
      sourceHeight: plan.captureProfile.sourceHeight,
      maxPixels: plan.captureProfile.maxPixels,
      maxEdge: plan.captureProfile.maxEdge,
      deviceProfile: plan.captureProfile.deviceProfile,
      textureScale: plan.captureProfile.textureScale,
      lodBias: plan.captureProfile.lodBias,
      ltPipelineId: plan.captureProfile.ltPipelineId,
      pngEncodingId: plan.captureProfile.pngEncodingId,
      psdEncodingId: plan.artifactProfiles.psdProfileId,
    },
    shots: plan.shots.map((shot) => ({
      shotId: shot.shotId,
      shotName: shot.shotName,
      shotIndex: shot.shotIndex,
      capture: {
        width: shot.capture.width,
        height: shot.capture.height,
        requestedHeight: shot.capture.requestedHeight,
        wasReduced: shot.capture.wasReduced,
        includeDepth: shot.capture.includeDepth,
        shadows: shot.capture.shadows,
        shadowMapSize: shot.capture.shadowMapSize,
        background: {
          color: shot.capture.background.color,
          alpha: shot.capture.background.alpha,
        },
      },
      files: shot.files.map((file) => ({
        key: `${file.shotId}:${file.pass}`,
        shotId: file.shotId,
        shotName: file.shotName,
        shotIndex: file.shotIndex,
        pass: file.pass,
        path: file.path,
      })),
    })),
    passes: [...plan.passes],
    exportHeight: plan.exportHeight,
    includeLayeredPsd: plan.artifactRequests.layeredPsd,
    includeContactSheet: plan.artifactRequests.contactSheet,
  });
  return digest !== null && digest === plan.renderDigest;
}

export function isStudioBg3dShotBatchPublicRenderPlan(
  value: unknown,
): value is StudioBg3dShotBatchPublicRenderPlan {
  try {
    snapshotPublicRenderPlan(value, true);
    return true;
  } catch {
    return false;
  }
}

function validateManifestContext(
  value: unknown,
): StudioBg3dShotBatchManifestContext {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new StudioBg3dShotBatchArchiveError("manifestContextInvalid", "type");
  }
  const candidate = value as Record<string, unknown>;
  const publicRenderPlan = candidate.publicRenderPlan === undefined
    ? undefined
    : snapshotPublicRenderPlan(candidate.publicRenderPlan, true);
  if (!hasOnlyKeys(value, publicRenderPlan ? PUBLIC_MANIFEST_KEYS : LEGACY_MANIFEST_KEYS)) {
    throw new StudioBg3dShotBatchArchiveError("manifestContextUnknownField", "type");
  }
  if (
    candidate.resumeKey !== undefined &&
    (typeof candidate.resumeKey !== "string" || !RESUME_KEY_PATTERN.test(candidate.resumeKey))
  ) {
    throw new StudioBg3dShotBatchArchiveError("manifestResumeKeyInvalid", "type");
  }
  if (publicRenderPlan && candidate.resumeKey !== undefined) {
    throw new StudioBg3dShotBatchArchiveError("publicManifestResumeKeyForbidden", "type");
  }
  if (
    (candidate.layeredPsdRequested !== undefined &&
      typeof candidate.layeredPsdRequested !== "boolean") ||
    (candidate.contactSheetRequested !== undefined &&
      typeof candidate.contactSheetRequested !== "boolean")
  ) {
    throw new StudioBg3dShotBatchArchiveError("manifestOptionalArtifactRequestContextInvalid", "type");
  }
  const rawShots = publicRenderPlan
    ? publicRenderPlan.shots.map((shot) => ({ id: shot.shotId, name: shot.shotName }))
    : candidate.shots ?? [];
  if (
    !Array.isArray(rawShots) ||
    (candidate.shots !== undefined && rawShots.length < 1) ||
    rawShots.length > STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS
  ) {
    throw new StudioBg3dShotBatchArchiveError("manifestShotListOverLimit", "range");
  }
  const shotIds = new Set<string>();
  const shots = rawShots.map((rawShot): { readonly id: string; readonly name: string } => {
    const shot = rawShot as { readonly id?: unknown; readonly name?: unknown };
    if (
      !hasExactKeys(rawShot, ["id", "name"]) ||
      typeof shot.id !== "string" || !ID_PATTERN.test(shot.id) ||
      typeof shot.name !== "string" || !validShotName(shot.name) || shotIds.has(shot.id)
    ) {
      throw new StudioBg3dShotBatchArchiveError("manifestShotListInvalid", "type");
    }
    shotIds.add(shot.id);
    return { id: shot.id, name: shot.name };
  });
  const rawRequested = publicRenderPlan?.passes ?? candidate.requestedPasses ?? [];
  if (
    !Array.isArray(rawRequested) ||
    (candidate.requestedPasses !== undefined && rawRequested.length < 1) ||
    rawRequested.some((pass) => typeof pass !== "string" || !PASS_SET.has(pass))
  ) {
    throw new StudioBg3dShotBatchArchiveError("manifestRequestedPassesInvalid", "type");
  }
  const requested = rawRequested as StudioBg3dShotBatchPass[];
  if (new Set(requested).size !== requested.length) {
    throw new StudioBg3dShotBatchArchiveError("manifestRequestedPassesDuplicated", "type");
  }
  let resolution: StudioBg3dShotBatchLegacyManifestContext["resolution"];
  if (candidate.resolution !== undefined) {
    if (!isRecord(candidate.resolution)) {
      throw new StudioBg3dShotBatchArchiveError("manifestResolutionContextInvalid", "type");
    }
    if (candidate.resolution.mode === "per-shot-maximum") {
      if (!hasExactKeys(candidate.resolution, ["mode"])) {
        throw new StudioBg3dShotBatchArchiveError("manifestPerShotResolutionUnknownField", "type");
      }
      resolution = { mode: "per-shot-maximum" };
    } else if (
      candidate.resolution.mode !== "maximum-height" ||
      !hasExactKeys(candidate.resolution, ["mode", "height"]) ||
      !isStudioBg3dShotBatchIntegerInRange(candidate.resolution.height, 256, MAX_DIMENSION)
    ) {
      throw new StudioBg3dShotBatchArchiveError("manifestMaximumResolutionContextInvalid", "type");
    } else {
      resolution = {
        mode: "maximum-height",
        height: candidate.resolution.height as number,
      };
    }
  }
  const rawSkipped = candidate.skippedArtifacts ?? [];
  if (!Array.isArray(rawSkipped) || rawSkipped.length > STUDIO_BG3D_SHOT_BATCH_MAX_ARTIFACTS) {
    throw new StudioBg3dShotBatchArchiveError("manifestSkippedArtifactsOverLimit", "range");
  }
  const skippedKeys = new Set<string>();
  const skippedArtifacts = rawSkipped.map((rawArtifact): StudioBg3dShotBatchSkippedArtifact => {
    const artifact = rawArtifact as Partial<StudioBg3dShotBatchSkippedArtifact>;
    if (
      !hasExactKeys(rawArtifact, ["shotId", "shotName", "pass", "reason"]) ||
      typeof artifact.shotId !== "string" || !ID_PATTERN.test(artifact.shotId) ||
      typeof artifact.shotName !== "string" || !validShotName(artifact.shotName) ||
      typeof artifact.pass !== "string" || !PASS_SET.has(artifact.pass) ||
      (artifact.reason !== "disabled" && artifact.reason !== "unavailable")
    ) {
      throw new StudioBg3dShotBatchArchiveError("manifestSkippedArtifactInvalid", "type");
    }
    const key = `${artifact.shotId}:${artifact.pass}`;
    if (skippedKeys.has(key)) {
      throw new StudioBg3dShotBatchArchiveError("manifestSkippedArtifactDuplicated", "type");
    }
    skippedKeys.add(key);
    return {
      shotId: artifact.shotId,
      shotName: artifact.shotName,
      pass: artifact.pass as StudioBg3dShotBatchPass,
      reason: artifact.reason,
    };
  });
  const rawPsdFallbacks = candidate.psdFallbacks ?? [];
  if (!Array.isArray(rawPsdFallbacks) || rawPsdFallbacks.length > STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) {
    throw new StudioBg3dShotBatchArchiveError("manifestPsdFallbacksOverLimit", "range");
  }
  const fallbackIds = new Set<string>();
  const copiedPsdFallbacks = rawPsdFallbacks.map((rawFallback): StudioBg3dShotBatchPsdFallback => {
    const fallback = rawFallback as Partial<StudioBg3dShotBatchPsdFallback>;
    if (
      !hasExactKeys(rawFallback, ["shotId", "shotName", "reason"]) ||
      typeof fallback.shotId !== "string" || !ID_PATTERN.test(fallback.shotId) ||
      typeof fallback.shotName !== "string" || !validShotName(fallback.shotName) ||
      typeof fallback.reason !== "string" ||
      !["budget", "unavailable", "worker-failed"].includes(fallback.reason) ||
      fallbackIds.has(fallback.shotId)
    ) {
      throw new StudioBg3dShotBatchArchiveError("manifestPsdFallbackInvalid", "type");
    }
    fallbackIds.add(fallback.shotId);
    return {
      shotId: fallback.shotId,
      shotName: fallback.shotName,
      reason: fallback.reason as StudioBg3dShotBatchPsdFallback["reason"],
    };
  });
  const contactSheetFallback = candidate.contactSheetFallback;
  if (
    contactSheetFallback !== undefined && (
      typeof contactSheetFallback !== "string" ||
      !["budget", "source-unavailable", "unavailable", "worker-failed"].includes(
        contactSheetFallback,
      )
    )
  ) {
    throw new StudioBg3dShotBatchArchiveError("manifestContactSheetFallbackInvalid", "type");
  }
  if (publicRenderPlan) {
    const shotOrder = new Map(publicRenderPlan.shots.map((shot) => [shot.shotId, shot.shotIndex]));
    skippedArtifacts.sort((left, right) =>
      (shotOrder.get(left.shotId) ?? Number.MAX_SAFE_INTEGER) -
        (shotOrder.get(right.shotId) ?? Number.MAX_SAFE_INTEGER) ||
      STUDIO_BG3D_SHOT_BATCH_PASSES.indexOf(left.pass) -
        STUDIO_BG3D_SHOT_BATCH_PASSES.indexOf(right.pass));
    copiedPsdFallbacks.sort((left, right) =>
      (shotOrder.get(left.shotId) ?? Number.MAX_SAFE_INTEGER) -
      (shotOrder.get(right.shotId) ?? Number.MAX_SAFE_INTEGER));
    return {
      publicRenderPlan,
      ...(skippedArtifacts.length > 0 ? { skippedArtifacts } : {}),
      ...(copiedPsdFallbacks.length > 0 ? { psdFallbacks: copiedPsdFallbacks } : {}),
      ...(contactSheetFallback === undefined
        ? {}
        : { contactSheetFallback: contactSheetFallback as StudioBg3dShotBatchContactSheetFallback }),
    };
  }
  return {
    ...(candidate.resumeKey === undefined ? {} : { resumeKey: candidate.resumeKey as string }),
    ...(candidate.shots === undefined ? {} : { shots }),
    ...(candidate.requestedPasses === undefined ? {} : { requestedPasses: [...requested] }),
    ...(resolution === undefined ? {} : { resolution }),
    ...(candidate.skippedArtifacts === undefined ? {} : { skippedArtifacts }),
    ...(candidate.psdFallbacks === undefined ? {} : { psdFallbacks: copiedPsdFallbacks }),
    ...(candidate.layeredPsdRequested === undefined
      ? {}
      : { layeredPsdRequested: candidate.layeredPsdRequested as boolean }),
    ...(candidate.contactSheetRequested === undefined
      ? {}
      : { contactSheetRequested: candidate.contactSheetRequested as boolean }),
    ...(contactSheetFallback === undefined
      ? {}
      : { contactSheetFallback: contactSheetFallback as StudioBg3dShotBatchContactSheetFallback }),
  };
}

export function isStudioBg3dShotBatchManifestContext(
  value: unknown,
): value is StudioBg3dShotBatchManifestContext | undefined {
  try {
    validateManifestContext(value as StudioBg3dShotBatchManifestContext | undefined);
    return true;
  } catch {
    return false;
  }
}

/** Builds a deterministic, bounded PNG ZIP with a small engine-neutral manifest. */
export async function buildStudioBg3dShotBatchArchive(
  inputImages: readonly StudioBg3dShotBatchImage[],
  options: StudioBg3dShotBatchBuildOptions = {},
): Promise<Blob> {
  if (!Array.isArray(inputImages) || inputImages.length < 1 || inputImages.length > STUDIO_BG3D_SHOT_BATCH_MAX_ARTIFACTS) {
    throw new StudioBg3dShotBatchArchiveError("artifactCountOutOfRange", "range", { maxArtifacts: String(STUDIO_BG3D_SHOT_BATCH_MAX_ARTIFACTS) });
  }
  const signal = options.signal;
  const onProgress = options.onProgress;
  throwIfAborted(signal);
  // Snapshot every caller-owned collection and scalar before the first Blob read awaits. Blob
  // objects are immutable; all mutable wrappers and metadata are rebuilt explicitly.
  let images = inputImages.map((image): StudioBg3dShotBatchImage => {
    if (!isRecord(image)) {
      throw new StudioBg3dShotBatchArchiveError("pngItemInvalid", "type");
    }
    return {
      shotId: image.shotId,
      shotName: image.shotName,
      width: image.width,
      height: image.height,
      ...(image.pass === undefined ? {} : { pass: image.pass }),
      ...(image.output === undefined ? {} : { output: image.output }),
      ...(image.requestedHeight === undefined ? {} : { requestedHeight: image.requestedHeight }),
      ...(image.wasReduced === undefined ? {} : { wasReduced: image.wasReduced }),
      png: image.png,
    } as StudioBg3dShotBatchImage;
  });
  const manifestContext = validateManifestContext(options.manifest);
  const inputLayeredPsds = options.layeredPsds ?? [];
  if (!Array.isArray(inputLayeredPsds) || inputLayeredPsds.length > STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) {
    throw new StudioBg3dShotBatchArchiveError("psdCountOverLimit", "range");
  }
  let layeredPsds = inputLayeredPsds.map((artifact): StudioBg3dShotBatchLayeredPsd => {
    if (!isRecord(artifact)) {
      throw new StudioBg3dShotBatchArchiveError("psdArtifactInvalid", "type");
    }
    return {
      shotId: artifact.shotId,
      shotName: artifact.shotName,
      width: artifact.width,
      height: artifact.height,
      psd: artifact.psd,
    } as StudioBg3dShotBatchLayeredPsd;
  });
  const inputContactSheets = options.contactSheets ?? [];
  if (
    !Array.isArray(inputContactSheets) ||
    inputContactSheets.length > STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_SHOTS
  ) {
    throw new StudioBg3dShotBatchArchiveError("contactSheetCountOverLimit", "range");
  }
  const contactSheets = inputContactSheets.map((artifact): StudioBg3dShotBatchContactSheet => {
    if (!isRecord(artifact) || !Array.isArray(artifact.shotIds)) {
      throw new StudioBg3dShotBatchArchiveError("contactSheetArtifactInvalid", "type");
    }
    return {
      sheetNumber: artifact.sheetNumber,
      fileName: artifact.fileName,
      width: artifact.width,
      height: artifact.height,
      shotIds: [...artifact.shotIds],
      png: artifact.png,
    } as StudioBg3dShotBatchContactSheet;
  });
  const publicRenderPlan = manifestContext.publicRenderPlan;
  if (
    publicRenderPlan &&
    !await verifyStudioBg3dShotBatchPublicRenderDigest(publicRenderPlan)
  ) {
    throw new StudioBg3dShotBatchArchiveError("publicPlanRenderDigestMismatch", "type");
  }
  throwIfAborted(signal);
  if (publicRenderPlan) {
    const fileOrder = new Map(publicRenderPlan.shots.flatMap((shot) => shot.files)
      .map((file, index) => [`${file.shotId}:${file.pass}`, index]));
    images = [...images].sort((left, right) =>
      (fileOrder.get(`${left.shotId}:${artifactPass(left)}`) ?? Number.MAX_SAFE_INTEGER) -
      (fileOrder.get(`${right.shotId}:${artifactPass(right)}`) ?? Number.MAX_SAFE_INTEGER));
    const shotOrder = new Map(publicRenderPlan.shots.map((shot) => [shot.shotId, shot.shotIndex]));
    layeredPsds = [...layeredPsds].sort((left, right) =>
      (shotOrder.get(left.shotId) ?? Number.MAX_SAFE_INTEGER) -
      (shotOrder.get(right.shotId) ?? Number.MAX_SAFE_INTEGER));
  }
  const manifestShots = publicRenderPlan
    ? publicRenderPlan.shots.map((shot) => ({ id: shot.shotId, name: shot.shotName }))
    : manifestContext.shots;
  const manifestRequestedPasses = publicRenderPlan?.passes ?? manifestContext.requestedPasses;
  const manifestResolution = publicRenderPlan
    ? publicRenderPlan.exportHeight === "per-shot"
      ? { mode: "per-shot-maximum" as const }
      : { mode: "maximum-height" as const, height: publicRenderPlan.exportHeight }
    : manifestContext.resolution;
  const layeredPsdRequested = publicRenderPlan?.artifactRequests.layeredPsd ??
    manifestContext.layeredPsdRequested;
  const contactSheetRequested = publicRenderPlan?.artifactRequests.contactSheet ??
    manifestContext.contactSheetRequested;
  const seenArtifactKeys = new Set<string>();
  const requestedPassSet = manifestRequestedPasses
    ? new Set(manifestRequestedPasses)
    : null;
  const shots = new Map<string, { readonly name: string; readonly index: number }>();
  const shotRasterShape = new Map<string, {
    readonly width: number;
    readonly height: number;
    readonly requestedHeight?: number;
    readonly wasReduced?: boolean;
  }>();
  for (const shot of manifestShots ?? []) {
    shots.set(shot.id, { name: shot.name, index: shots.size + 1 });
  }
  let totalImageBytes = 0;
  for (const image of images) {
    throwIfAborted(signal);
    await validatePng(image, signal);
    if (
      requestedPassSet &&
      (image.pass === undefined || !requestedPassSet.has(image.pass))
    ) {
      throw new StudioBg3dShotBatchArchiveError("completedPngNotInRequestedPasses", "type");
    }
    const existingShot = shots.get(image.shotId);
    if (manifestShots && !existingShot) {
      throw new StudioBg3dShotBatchArchiveError("completedArtifactNotInRequestedShots", "type");
    }
    if (existingShot && existingShot.name !== image.shotName) {
      throw new StudioBg3dShotBatchArchiveError("shotNameMismatchAcrossArtifacts", "type");
    }
    if (publicRenderPlan) {
      const publicShot = publicRenderPlan.shots.find((shot) => shot.shotId === image.shotId);
      if (
        !publicShot ||
        image.pass === undefined ||
        !publicShot.files.some((file) => file.pass === image.pass) ||
        image.width !== publicShot.capture.width ||
        image.height !== publicShot.capture.height ||
        image.requestedHeight !== publicShot.capture.requestedHeight ||
        image.wasReduced !== publicShot.capture.wasReduced
      ) {
        throw new StudioBg3dShotBatchArchiveError("completedArtifactMismatchPublicPlan", "type");
      }
    }
    if (!existingShot) {
      if (shots.size >= STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) {
        throw new StudioBg3dShotBatchArchiveError("shotCountOverLimit", "range", { maxShots: String(STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) });
      }
      shots.set(image.shotId, { name: image.shotName, index: shots.size + 1 });
    }
    const key = `${image.shotId}:${artifactPass(image)}`;
    if (seenArtifactKeys.has(key)) {
      throw new StudioBg3dShotBatchArchiveError("duplicateShotPassArtifact", "type");
    }
    seenArtifactKeys.add(key);
    const existingShape = shotRasterShape.get(image.shotId);
    if (
      existingShape && (
        existingShape.width !== image.width ||
        existingShape.height !== image.height ||
        existingShape.requestedHeight !== image.requestedHeight ||
        existingShape.wasReduced !== image.wasReduced
      )
    ) {
      throw new StudioBg3dShotBatchArchiveError("sameShotPassShapeMismatch", "type");
    }
    if (!existingShape) {
      shotRasterShape.set(image.shotId, {
        width: image.width,
        height: image.height,
        ...(image.requestedHeight === undefined ? {} : {
          requestedHeight: image.requestedHeight,
          wasReduced: image.wasReduced,
        }),
      });
    }
    if (
      manifestResolution !== undefined && (
        image.requestedHeight === undefined ||
        (manifestResolution.mode === "maximum-height" &&
          image.requestedHeight !== manifestResolution.height)
      )
    ) {
      throw new StudioBg3dShotBatchArchiveError("passRequestedHeightMismatchManifestResolution", "type");
    }
    totalImageBytes += image.png.size;
    if (totalImageBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES) {
      throw new StudioBg3dShotBatchArchiveError("imageTotalBytesOverBudget", "range");
    }
  }

  const seenPsdShotIds = new Set<string>();
  for (const artifact of layeredPsds) {
    throwIfAborted(signal);
    await validateLayeredPsd(artifact, signal);
    const existingShot = shots.get(artifact.shotId);
    if (manifestShots && !existingShot) {
      throw new StudioBg3dShotBatchArchiveError("psdArtifactNotInRequestedShots", "type");
    }
    if (existingShot && existingShot.name !== artifact.shotName) {
      throw new StudioBg3dShotBatchArchiveError("shotNameMismatchAcrossPsdArtifacts", "type");
    }
    const rasterShape = shotRasterShape.get(artifact.shotId);
    if (rasterShape && (rasterShape.width !== artifact.width || rasterShape.height !== artifact.height)) {
      throw new StudioBg3dShotBatchArchiveError("psdPngResolutionMismatch", "type");
    }
    if (!existingShot) {
      if (shots.size >= STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) {
        throw new StudioBg3dShotBatchArchiveError("shotCountOverLimit", "range", { maxShots: String(STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) });
      }
      shots.set(artifact.shotId, { name: artifact.shotName, index: shots.size + 1 });
    }
    if (seenPsdShotIds.has(artifact.shotId)) {
      throw new StudioBg3dShotBatchArchiveError("duplicateLayeredPsd", "type");
    }
    seenPsdShotIds.add(artifact.shotId);
    totalImageBytes += artifact.psd.size;
    if (totalImageBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES) {
      throw new StudioBg3dShotBatchArchiveError("artifactTotalBytesOverBudget", "range");
    }
  }

  let totalContactSheetBytes = 0;
  const contactShotIds = new Set<string>();
  for (const [index, artifact] of contactSheets.entries()) {
    throwIfAborted(signal);
    if (
      artifact.sheetNumber !== index + 1 ||
      artifact.fileName !== `contact-sheet-${String(index + 1).padStart(3, "0")}.png` ||
      !isStudioBg3dShotBatchIntegerInRange(artifact.width, 1, 8_192) ||
      !isStudioBg3dShotBatchIntegerInRange(artifact.height, 1, 8_192) ||
      !Array.isArray(artifact.shotIds) || artifact.shotIds.length < 1 ||
      artifact.shotIds.some((shotId: string) => (
        !ID_PATTERN.test(shotId) || !shots.has(shotId) || contactShotIds.has(shotId)
      )) ||
      new Set(artifact.shotIds).size !== artifact.shotIds.length ||
      !(artifact.png instanceof Blob) || artifact.png.type !== "image/png" ||
      artifact.png.size < 24 || artifact.png.size > STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_OUTPUT_BYTES
    ) {
      throw new StudioBg3dShotBatchArchiveError("contactSheetArtifactInvalid", "type");
    }
    await verifyStudioBg3dOpaqueRgb8PngFile(artifact.png, {
      expectedWidth: artifact.width,
      expectedHeight: artifact.height,
      maxBytes: STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_OUTPUT_BYTES,
      signal,
    });
    artifact.shotIds.forEach((shotId: string) => contactShotIds.add(shotId));
    totalContactSheetBytes += artifact.png.size;
    totalImageBytes += artifact.png.size;
    if (
      totalContactSheetBytes > STUDIO_BG3D_SHOT_CONTACT_SHEET_MAX_TOTAL_OUTPUT_BYTES ||
      totalImageBytes > STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES
    ) {
      throw new StudioBg3dShotBatchArchiveError("contactSheetTotalBytesOverBudget", "range");
    }
  }
  if (contactSheets.length > 0 && contactShotIds.size !== shots.size) {
    throw new StudioBg3dShotBatchArchiveError("contactSheetMissingRequestedShots", "type");
  }
  if (contactSheets.length > 0 && manifestContext.contactSheetFallback !== undefined) {
    throw new StudioBg3dShotBatchArchiveError("completedContactSheetConflictsFallback", "type");
  }

  const seenSkippedArtifactKeys = new Set<string>();
  for (const skipped of manifestContext.skippedArtifacts ?? []) {
    const existingShot = shots.get(skipped.shotId);
    if (manifestShots && !existingShot) {
      throw new StudioBg3dShotBatchArchiveError("skippedArtifactNotInRequestedShots", "type");
    }
    if (existingShot && existingShot.name !== skipped.shotName) {
      throw new StudioBg3dShotBatchArchiveError("shotNameMismatchAcrossSkippedArtifacts", "type");
    }
    if (!existingShot) {
      if (shots.size >= STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) {
        throw new StudioBg3dShotBatchArchiveError("shotCountOverLimit", "range", { maxShots: String(STUDIO_BG3D_SHOT_BATCH_MAX_SHOTS) });
      }
      shots.set(skipped.shotId, { name: skipped.shotName, index: shots.size + 1 });
    }
    if (seenArtifactKeys.has(`${skipped.shotId}:${skipped.pass}`)) {
      throw new StudioBg3dShotBatchArchiveError("completedAndSkippedArtifactConflict", "type");
    }
    if (requestedPassSet && !requestedPassSet.has(skipped.pass)) {
      throw new StudioBg3dShotBatchArchiveError("skippedArtifactNotInRequestedPasses", "type");
    }
    seenSkippedArtifactKeys.add(`${skipped.shotId}:${skipped.pass}`);
  }
  const seenPsdFallbackShotIds = new Set<string>();
  for (const fallback of manifestContext.psdFallbacks ?? []) {
    const existingShot = shots.get(fallback.shotId);
    if (!existingShot || existingShot.name !== fallback.shotName) {
      throw new StudioBg3dShotBatchArchiveError("psdFallbackMismatchRequestedShots", "type");
    }
    if (seenPsdShotIds.has(fallback.shotId)) {
      throw new StudioBg3dShotBatchArchiveError("completedPsdConflictsFallback", "type");
    }
    seenPsdFallbackShotIds.add(fallback.shotId);
  }
  if (layeredPsdRequested === true) {
    for (const shot of manifestShots ?? []) {
      if (!seenPsdShotIds.has(shot.id) && !seenPsdFallbackShotIds.has(shot.id)) {
        throw new StudioBg3dShotBatchArchiveError("requestedShotPsdNotAccounted", "type");
      }
    }
  } else if (
    layeredPsdRequested === false &&
    (layeredPsds.length > 0 || (manifestContext.psdFallbacks?.length ?? 0) > 0)
  ) {
    throw new StudioBg3dShotBatchArchiveError("unrequestedPsdArtifactOrFallbackIncluded", "type");
  }
  if (contactSheetRequested === true) {
    if (contactSheets.length === 0 && manifestContext.contactSheetFallback === undefined) {
      throw new StudioBg3dShotBatchArchiveError("requestedContactSheetNotAccounted", "type");
    }
  } else if (
    contactSheetRequested === false &&
    (contactSheets.length > 0 || manifestContext.contactSheetFallback !== undefined)
  ) {
    throw new StudioBg3dShotBatchArchiveError("unrequestedContactSheetArtifactOrFallbackIncluded", "type");
  }
  if (requestedPassSet && manifestShots) {
    for (const shot of manifestShots) {
      for (const pass of requestedPassSet) {
        const key = `${shot.id}:${pass}`;
        if (!seenArtifactKeys.has(key) && !seenSkippedArtifactKeys.has(key)) {
          throw new StudioBg3dShotBatchArchiveError("requestedShotPassNotAccounted", "type");
        }
      }
    }
  }
  if (
    images.length +
    layeredPsds.length +
    contactSheets.length +
    (manifestContext.skippedArtifacts?.length ?? 0) +
    (manifestContext.psdFallbacks?.length ?? 0) +
    (manifestContext.contactSheetFallback === undefined ? 0 : 1) >
      STUDIO_BG3D_SHOT_BATCH_MAX_ARCHIVE_ARTIFACTS
  ) {
    throw new StudioBg3dShotBatchArchiveError("artifactTotalOverLimit", "range");
  }

  const legacyV1 = layeredPsds.length === 0 &&
    contactSheets.length === 0 &&
    images.every((image) => image.pass === undefined) &&
    images.length === shots.size &&
    publicRenderPlan === undefined &&
    manifestContext.resumeKey === undefined &&
    manifestContext.shots === undefined &&
    manifestContext.requestedPasses === undefined &&
    manifestContext.resolution === undefined &&
    manifestContext.skippedArtifacts === undefined &&
    manifestContext.psdFallbacks === undefined &&
    manifestContext.layeredPsdRequested === undefined &&
    manifestContext.contactSheetRequested === undefined &&
    manifestContext.contactSheetFallback === undefined;
  const files = images.map((image, index) => {
    const shot = shots.get(image.shotId)!;
    const pass = artifactPass(image);
    return {
      shotId: image.shotId,
      name: image.shotName,
      path: legacyV1
        ? `shots/${String(index + 1).padStart(3, "0")}.png`
        : `shots/${String(shot.index).padStart(3, "0")}/${pass}.png`,
      width: image.width,
      height: image.height,
      ...(legacyV1 ? { output: image.output ?? "beauty" } : {
        pass,
        status: "completed" as const,
        encoding: pass === "depth"
          ? "normalized-device-depth-u8"
          : pass === "normal"
            ? "view-normal-rgba8"
            : "srgb-straight-alpha-rgba8",
        ...(pass === "depth" ? { nearIs: "black", farIs: "white" } : {}),
        ...(image.requestedHeight === undefined ? {} : {
          requestedHeight: image.requestedHeight,
          wasReduced: image.wasReduced,
        }),
      }),
    };
  });
  const requestedPasses = manifestRequestedPasses ??
    STUDIO_BG3D_SHOT_BATCH_PASSES.filter((pass) => images.some((image) => artifactPass(image) === pass));
  const producedPasses = STUDIO_BG3D_SHOT_BATCH_PASSES.filter((pass) =>
    images.some((image) => artifactPass(image) === pass));
  const artifacts = [
    ...files,
    ...layeredPsds.map((artifact) => {
      const shot = shots.get(artifact.shotId)!;
      return {
        shotId: artifact.shotId,
        name: artifact.shotName,
        kind: "layered-psd" as const,
        path: `shots/${String(shot.index).padStart(3, "0")}/layers.psd`,
        width: artifact.width,
        height: artifact.height,
        status: "completed" as const,
        encoding: "psd-v1-rle-rgba8",
      };
    }),
    ...contactSheets.map((artifact) => ({
      kind: "contact-sheet" as const,
      path: `contact/${artifact.fileName}`,
      sheetNumber: artifact.sheetNumber,
      width: artifact.width,
      height: artifact.height,
      shotIds: artifact.shotIds,
      status: "completed" as const,
      encoding: "srgb-opaque-rgb8",
    })),
    ...(manifestContext.skippedArtifacts ?? []).map((artifact) => ({
      shotId: artifact.shotId,
      name: artifact.shotName,
      pass: artifact.pass,
      status: "skipped" as const,
      reason: artifact.reason,
    })),
  ];
  const manifestPayload = legacyV1
    ? {
        kind: "toonstudio-bg3d-shot-batch",
        version: 1,
        files,
      }
    : publicRenderPlan
      ? {
          kind: "toonstudio-bg3d-shot-batch",
          version: 3,
          publicRenderPlan,
          producedPasses,
          artifacts,
          psdFallbacks: manifestContext.psdFallbacks ?? [],
          contactSheetFallback: manifestContext.contactSheetFallback ?? null,
        }
      : {
        kind: "toonstudio-bg3d-shot-batch",
        version: 2,
        ...(manifestContext.resumeKey ? { resumeKey: manifestContext.resumeKey } : {}),
        requestedPasses,
        resolution: manifestResolution ?? { mode: "per-shot-maximum" as const },
        producedPasses,
        shots: [...shots].map(([shotId, shot]) => ({
          id: shotId,
          name: shot.name,
          index: shot.index,
        })),
        artifacts,
        layeredPsdRequested: layeredPsdRequested ?? layeredPsds.length > 0,
        psdFallbacks: manifestContext.psdFallbacks ?? [],
        contactSheetRequested: contactSheetRequested ?? contactSheets.length > 0,
        contactSheetFallback: manifestContext.contactSheetFallback ?? null,
      };
  const manifest = new TextEncoder().encode(JSON.stringify(manifestPayload, null, 2));
  throwIfAborted(signal);
  return buildStudioPackageArchiveBlob([
    { path: "manifest.json", data: manifest },
    ...images.map((image, index) => ({
      path: files[index]?.path ?? `shots/${String(index + 1).padStart(3, "0")}.png`,
      data: image.png,
    })),
    ...layeredPsds.map((artifact) => ({
      path: `shots/${String(shots.get(artifact.shotId)!.index).padStart(3, "0")}/layers.psd`,
      data: artifact.psd,
    })),
    ...contactSheets.map((artifact) => ({
      path: `contact/${artifact.fileName}`,
      data: artifact.png,
    })),
  ], {
    mimeType: "application/zip",
    crc32ExecutionMode: options.crc32ExecutionMode ?? "worker",
    signal,
    limits: {
      maxFiles: STUDIO_BG3D_SHOT_BATCH_MAX_ARCHIVE_ARTIFACTS + 1,
      maxEntryBytes: STUDIO_BG3D_SHOT_PSD_MAX_OUTPUT_BYTES,
      // The image budget was already checked above. Leave a small bounded allowance for the
      // manifest and ZIP bookkeeping instead of accidentally rejecting an exact-budget image set.
      maxTotalBytes: STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES + 256 * 1024,
      maxArchiveBytes: 400 * 1024 * 1024,
      maxPathBytes: 256,
    },
    onProgress: (progress) => {
      throwIfAborted(signal);
      onProgress?.({
        completedFiles: progress.completedFiles,
        totalFiles: progress.totalFiles,
      });
    },
  });
}
