import { STUDIO_PROJECT_ARCHIVE_LIMITS, type StudioProjectArchiveDocumentReference, type StudioProjectArchiveImportedAttachment, type StudioProjectArchiveManifest, StudioProjectArchiveManifestAttachment, StudioProjectArchiveAttachmentInput, StudioProjectArchiveLimits  } from "../studio-project-archive";
import { parseStudioProjectFile, type StudioProjectFile } from "../studio-project-file";

import { STUDIO_VRM_SCENE_DOCUMENT_KIND, parseStudioVrmSceneDocument, serializeStudioVrmSceneDocument, type StudioVrmSurfacePaintTexture } from "./studio-vrm-scene-document";
import {
  STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_KIND,
  STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME,
  STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_SCHEMA_VERSION,
  verifyStudioVrmTexturePaintArtifact,
  type StudioVrmTexturePaintArtifact,
  type StudioVrmTexturePaintArtifactHash,
  type StudioVrmTexturePaintArtifactMetadata,
  type StudioVrmTexturePaintArtifactOptions,
  type StudioVrmTexturePaintArtifactResolveContext,
  type StudioVrmTexturePaintArtifactResolver,
  type StudioVrmTexturePaintArtifactSource,
} from "./studio-vrm-texture-paint-artifact";
// 집계자 예외: 이 파일의 프레젠테이션 함수(고지 생성)는 결과 타입이 문자열로 고정된
// 집계 경계라, 그 함수 내부에서만 아래 리졸버로 해석한다. 그 밖의 생산자는 코드를
// 그대로 방출하고 표시 지점(오케스트레이션 런타임)에서 해석한다.
import { resolveStudioVrmPaintLibraryNotice } from "../status-i18n/studio-producer-error-i18n-vrm-paint";
import { StudioVrmTexturePaintLibraryError, deleteStudioVrmTexturePaintLibraryCreationBatchIfMatches, getStudioVrmTexturePaintLibraryArtifact, saveStudioVrmTexturePaintLibraryArtifact, type StudioVrmTexturePaintLibraryCreationReceipt, type StudioVrmTexturePaintLibraryOptions } from "./studio-vrm-texture-paint-library";

/**
 * Project/archive bridge for content-addressed VRM surface-paint PNGs.
 *
 * Scene documents keep only immutable receipts. This module resolves and verifies the matching
 * PNGs without introducing object URLs, raw pixels, local database keys, or path assumptions into
 * the project document.
 */

export const STUDIO_VRM_TEXTURE_PAINT_PROJECT_LIBRARY_SCHEMA_VERSION = 1 as const;

export type StudioVrmTexturePaintProjectLibraryDiagnosticCode =
  | "ARCHIVE_ATTACHMENT_MISSING"
  | "LIBRARY_ARTIFACT_MISSING"
  | "LIBRARY_UNAVAILABLE";

export interface StudioVrmTexturePaintProjectLibraryDiagnostic {
  readonly severity: "error";
  readonly code: StudioVrmTexturePaintProjectLibraryDiagnosticCode;
  readonly message: string;
  readonly contentHash: StudioVrmTexturePaintArtifactHash;
  readonly pointers: readonly string[];
}

export type StudioVrmTexturePaintProjectLibraryErrorCode =
  | "ABORTED" | "ARCHIVE_METADATA_CONFLICT" | "ARTIFACT_VERIFICATION_FAILED" | "CANONICAL_SCENE_FINGERPRINT_MISMATCH"
  | "CRYPTO_UNAVAILABLE" | "LIBRARY_INSTALL_FAILED" | "LIBRARY_READ_FAILED" | "PROJECT_INVALID"
  | "PROJECT_LIMIT_EXCEEDED" | "SCENE_INVALID" | "SURFACE_PAINT_METADATA_CONFLICT";

/**
 * D4 구조화 방출 (R14, 2026-10-23): 생산자는 표시 문구 대신 구조화 코드를 방출한다.
 * code는 기존 11종 분류(category), detailCode는 방출 지점별 세부 코드이며,
 * 표시는 표시 지점(status-i18n/studio-producer-error-i18n-vrm-paint의
 * vrmPaintLibrary 구간 리졸버)에서만 해석한다. message는 세부 코드 문자열 자체다.
 */
export type StudioVrmTexturePaintProjectLibraryDetailCode =
  | "aborted" | "aggregate-apply-compensation-failed" | "archive-export-unresolved" | "archive-manifest-duplicate-hash"
  | "archive-manifest-incomplete" | "archive-manifest-range-conflict" | "archive-metadata-mismatch" | "crypto-fingerprint-failed"
  | "crypto-fingerprint-format-invalid" | "crypto-fingerprint-unavailable" | "fingerprint-mismatch-apply" | "fingerprint-mismatch-archive"
  | "fingerprint-mismatch-parser" | "install-recheck-failed" | "install-result-invalid" | "install-rollback-blocked"
  | "install-rollback-failed" | "install-save-failed" | "install-session-invalid" | "limit-device-png-count"
  | "limit-device-png-single" | "limit-device-png-total" | "limit-png-count" | "limit-png-single" | "limit-png-total"
  | "limit-preflight-invalid" | "limit-refs" | "limit-scenes-or-refs" | "metadata-binding-missing" | "metadata-mime-conflict"
  | "metadata-pointer-duplicate" | "project-page-structure-invalid" | "project-reference-invalid" | "project-structure-invalid"
  | "read-local-png-failed" | "scene-id-invalid" | "scene-not-canonical-v6" | "scene-png-hash-invalid" | "scene-pointer-invalid"
  | "verify-failed" | "verify-receipt-mismatch";

export type StudioVrmTexturePaintProjectNoticeCode =
  | "export-missing-references" | "export-missing-vrm" | "export-self-contained" | "export-with-warnings"
  | "import-fully-resolved" | "import-partially-resolved" | "json-import-missing" | "json-import-missing-suffix"
  | "json-import-unavailable" | "json-import-unavailable-suffix" | "json-inspect-failed" | "json-receipts-only";

export class StudioVrmTexturePaintProjectLibraryError extends Error {
  constructor(
    readonly code: StudioVrmTexturePaintProjectLibraryErrorCode,
    readonly detailCode: StudioVrmTexturePaintProjectLibraryDetailCode,
    readonly pointer?: string,
    options?: ErrorOptions,
    readonly params?: Readonly<Record<string, string>>,
  ) {
    super(detailCode, options);
    this.name = code === "ABORTED" ? "AbortError" : "StudioVrmTexturePaintProjectLibraryError";
  }
}

export interface StudioVrmTexturePaintProjectReference {
  readonly pointer: string;
  readonly bindingKey: string;
  readonly materialLocator: string;
  readonly textureSlot: string;
}

export interface StudioVrmTexturePaintProjectArtifactPlan {
  readonly contentHash: StudioVrmTexturePaintArtifactHash;
  readonly mimeType: typeof STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly references: readonly StudioVrmTexturePaintProjectReference[];
  readonly documentReferences: readonly StudioProjectArchiveDocumentReference[];
}

export interface StudioVrmTexturePaintProjectPlan {
  readonly schemaVersion: typeof STUDIO_VRM_TEXTURE_PAINT_PROJECT_LIBRARY_SCHEMA_VERSION;
  readonly project: StudioProjectFile;
  readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
  readonly artifacts: readonly StudioVrmTexturePaintProjectArtifactPlan[];
  readonly referenceCount: number;
  readonly totalBytes: number;
}

export interface StudioVrmTexturePaintProjectLibraryInstaller {
  install(
    artifact: StudioVrmTexturePaintArtifact,
    context: StudioVrmTexturePaintArtifactResolveContext,
  ): Promise<"installed" | "reused"> | "installed" | "reused";
}

export interface StudioVrmTexturePaintProjectLibraryAdapter
  extends StudioVrmTexturePaintArtifactResolver,
    StudioVrmTexturePaintProjectLibraryInstaller {}

export interface StudioVrmTexturePaintProjectAtomicInstallResult {
  readonly disposition: "installed" | "reused";
  readonly creationReceipt: StudioVrmTexturePaintLibraryCreationReceipt | null;
  readonly mutationGeneration: number | null;
}

export interface StudioVrmTexturePaintProjectAtomicLibraryAdapter
  extends StudioVrmTexturePaintArtifactResolver {
  installWithCreationReceipt(
    artifact: StudioVrmTexturePaintArtifact,
    context: StudioVrmTexturePaintArtifactResolveContext,
  ): Promise<StudioVrmTexturePaintProjectAtomicInstallResult>
    | StudioVrmTexturePaintProjectAtomicInstallResult;
  compensateCreated(
    receipts: readonly StudioVrmTexturePaintLibraryCreationReceipt[],
    mutationGenerations: readonly number[],
    context: StudioVrmTexturePaintArtifactResolveContext,
  ): Promise<boolean> | boolean;
}

export type StudioVrmTexturePaintProjectArtifactVerifier = (
  metadata: unknown,
  source: StudioVrmTexturePaintArtifactSource,
  options?: StudioVrmTexturePaintArtifactOptions,
) => Promise<StudioVrmTexturePaintArtifact>;

export interface StudioVrmTexturePaintProjectLibraryDependencies {
  readonly verifyArtifact?: StudioVrmTexturePaintProjectArtifactVerifier;
  readonly digestText?: (value: string, signal?: AbortSignal) => Promise<string>;
  readonly libraryOptions?: Omit<StudioVrmTexturePaintLibraryOptions, "signal">;
}

export interface StudioVrmTexturePaintProjectBridgeInput {
  /** Project immediately before archive processing. */
  readonly project: unknown;
  /** Project returned by the canonical archive/project writer. */
  readonly canonicalProject: unknown;
  readonly signal?: AbortSignal;
  readonly dependencies?: StudioVrmTexturePaintProjectLibraryDependencies;
}

export interface ExportStudioVrmTexturePaintProjectLibraryInput
  extends StudioVrmTexturePaintProjectBridgeInput {
  readonly library?: StudioVrmTexturePaintArtifactResolver;
  /**
   * Optional device/archive ceilings enforced before any PNG is read from browser storage.
   * The archive builder remains authoritative for the combined project and all other assets.
   */
  readonly limits?: Partial<
    Pick<
      StudioProjectArchiveLimits,
      "maxAttachmentBytes" | "maxTotalAttachmentBytes" | "maxAttachments"
    >
  >;
}

export type ExportStudioVrmTexturePaintProjectLibraryResult =
  | {
      readonly status: "ready";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly attachments: readonly StudioProjectArchiveAttachmentInput[];
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "unresolved";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly attachments: readonly [];
      readonly diagnostics: readonly StudioVrmTexturePaintProjectLibraryDiagnostic[];
    };

export interface AuditStudioVrmTexturePaintProjectLibraryAvailabilityInput
  extends StudioVrmTexturePaintProjectBridgeInput {
  readonly library?: StudioVrmTexturePaintArtifactResolver;
}

export type AuditStudioVrmTexturePaintProjectLibraryAvailabilityResult =
  | {
      readonly status: "ready";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly artifactCount: number;
      readonly checkedCount: number;
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "unresolved";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly artifactCount: number;
      readonly checkedCount: number;
      readonly diagnostics: readonly StudioVrmTexturePaintProjectLibraryDiagnostic[];
    }
  | {
      readonly status: "unavailable";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly artifactCount: number;
      readonly checkedCount: number;
      readonly diagnostics: readonly StudioVrmTexturePaintProjectLibraryDiagnostic[];
    };

export interface ImportStudioVrmTexturePaintProjectLibraryInput
  extends StudioVrmTexturePaintProjectBridgeInput {
  readonly manifest: StudioProjectArchiveManifest;
  readonly attachments: ReadonlyMap<string, StudioProjectArchiveImportedAttachment>;
  readonly library?: StudioVrmTexturePaintProjectLibraryAdapter;
}

export interface PrepareStudioVrmTexturePaintProjectArchiveImportInput
  extends Omit<ImportStudioVrmTexturePaintProjectLibraryInput, "library"> {
  readonly library?: StudioVrmTexturePaintProjectAtomicLibraryAdapter;
}

export type ImportStudioVrmTexturePaintProjectLibraryResult =
  | {
      readonly status: "ready";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly installed: number;
      readonly reused: number;
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "unresolved";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly installed: 0;
      readonly reused: 0;
      readonly diagnostics: readonly StudioVrmTexturePaintProjectLibraryDiagnostic[];
    };

export type PrepareStudioVrmTexturePaintProjectArchiveImportResult =
  | {
      readonly status: "ready";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly project: StudioProjectFile;
      readonly plan: StudioVrmTexturePaintProjectPlan;
      readonly verifiedArchive: readonly {
        readonly plan: StudioVrmTexturePaintProjectArtifactPlan;
        readonly artifact: StudioVrmTexturePaintArtifact;
      }[];
      readonly diagnostics: readonly [];
    }
  | {
      readonly status: "unresolved";
      readonly sceneFingerprint: StudioVrmTexturePaintArtifactHash;
      readonly project: StudioProjectFile;
      readonly plan: StudioVrmTexturePaintProjectPlan;
      readonly verifiedArchive: readonly [];
      readonly diagnostics: readonly StudioVrmTexturePaintProjectLibraryDiagnostic[];
    };

export type InstallPreparedStudioVrmTexturePaintProjectArchiveImportResult<ApplyResult> =
  ImportStudioVrmTexturePaintProjectLibraryResult & { readonly applyResult: ApplyResult };

export interface StudioVrmTexturePaintProjectNotice {
  readonly tone: "good" | "warn";
  readonly text: string;
}

export interface StudioVrmTexturePaintJsonImportPresentation {
  readonly notice: StudioVrmTexturePaintProjectNotice | null;
  readonly alertSuffix: string;
}

export interface StudioVrmTexturePaintArchiveImportPresentationInput {
  readonly isSelfContained: boolean;
  readonly attachmentCount: number;
  readonly warningCount: number;
  readonly referenceInstalled: number;
  readonly referenceReused: number;
  readonly referenceUnresolved: number;
  readonly vrmInstalled: number;
  readonly vrmReused: number;
  readonly vrmUnresolved: number;
  readonly background3dInstalled: number;
  readonly texturePaint: ImportStudioVrmTexturePaintProjectLibraryResult;
}

export interface StudioVrmTexturePaintArchiveExportPresentationInput {
  readonly isSelfContained: boolean;
  readonly attachmentCount: number;
  readonly warningCount: number;
  readonly missingReferenceCount: number;
  readonly missingVrmCount: number;
}

export interface StudioVrmTexturePaintArchiveImportPresentation {
  readonly fullyResolved: boolean;
  readonly notice: StudioVrmTexturePaintProjectNotice;
}

interface StrictSceneScan {
  readonly pointer: string;
  readonly serialized: string;
  readonly textures: readonly StudioVrmSurfacePaintTexture[];
}

interface MutableArtifactPlan {
  readonly contentHash: StudioVrmTexturePaintArtifactHash;
  readonly mimeType: typeof STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME;
  readonly byteLength: number;
  readonly width: number;
  readonly height: number;
  readonly references: StudioVrmTexturePaintProjectReference[];
}

const CONTENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const RAW_SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SURFACE_PAINT_POINTER_PATTERN =
  /^\/(?:pagesList\/[0-9]+|master)\/elements\/[0-9]+\/vrmScene\/surfacePaint\/textures\/[0-9]+\/hash$/u;
const textEncoder = new TextEncoder();
const EMPTY_RESULT_ITEMS: readonly [] = Object.freeze([]);
const PREPARED_TEXTURE_IMPORTS = new WeakMap<object, {
  readonly library: StudioVrmTexturePaintProjectAtomicLibraryAdapter;
  readonly signal?: AbortSignal;
  readonly dependencies?: StudioVrmTexturePaintProjectLibraryDependencies;
}>();

function fail(
  code: StudioVrmTexturePaintProjectLibraryErrorCode,
  detailCode: StudioVrmTexturePaintProjectLibraryDetailCode,
  pointer?: string,
  cause?: unknown,
  params?: Readonly<Record<string, string>>,
): never {
  throw new StudioVrmTexturePaintProjectLibraryError(
    code,
    detailCode,
    pointer,
    cause === undefined ? undefined : { cause },
    params,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) fail("ABORTED", "aborted");
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && (error.name === "AbortError" || error.code === "ABORTED");
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function scanStrictScene(
  element: unknown,
  scenePointer: string,
): StrictSceneScan | null {
  if (!isRecord(element) || element.type !== "image" || element.vrmScene === undefined) {
    return null;
  }
  if (
    !isRecord(element.vrmScene)
    || element.vrmScene.kind !== STUDIO_VRM_SCENE_DOCUMENT_KIND
  ) {
    fail("SCENE_INVALID", "scene-id-invalid", scenePointer);
  }
  const serialized = serializeStudioVrmSceneDocument(element.vrmScene);
  if (!serialized) {
    fail(
      "SCENE_INVALID", "scene-not-canonical-v6",
      scenePointer);
  }
  const scene = parseStudioVrmSceneDocument(serialized);
  if (!scene || serializeStudioVrmSceneDocument(scene) !== serialized) {
    fail(
      "SCENE_INVALID", "scene-not-canonical-v6",
      scenePointer);
  }
  return {
    pointer: scenePointer,
    serialized,
    textures: scene.surfacePaint.textures,
  };
}

function scanStrictProjectScenes(
  value: unknown,
  signal?: AbortSignal,
): readonly StrictSceneScan[] {
  if (!isRecord(value) || !Array.isArray(value.pagesList)) {
    fail("PROJECT_INVALID", "project-structure-invalid");
  }
  const scenes: StrictSceneScan[] = [];
  let sceneBytes = 0;
  let surfaceReferences = 0;
  const append = (scene: StrictSceneScan | null): void => {
    if (!scene) return;
    sceneBytes += textEncoder.encode(scene.serialized).byteLength;
    surfaceReferences += scene.textures.length;
    if (
      sceneBytes > STUDIO_PROJECT_ARCHIVE_LIMITS.maxProjectBytes
      || surfaceReferences > STUDIO_PROJECT_ARCHIVE_LIMITS.maxReferences
    ) {
      fail(
        "PROJECT_LIMIT_EXCEEDED", "limit-scenes-or-refs");
    }
    scenes.push(scene);
  };
  for (let pageIndex = 0; pageIndex < value.pagesList.length; pageIndex += 1) {
    throwIfAborted(signal);
    const page = value.pagesList[pageIndex];
    if (!isRecord(page) || !Array.isArray(page.elements)) {
      fail("PROJECT_INVALID", "project-page-structure-invalid");
    }
    for (let elementIndex = 0; elementIndex < page.elements.length; elementIndex += 1) {
      throwIfAborted(signal);
      const pointer = `/pagesList/${pageIndex}/elements/${elementIndex}/vrmScene`;
      append(scanStrictScene(page.elements[elementIndex], pointer));
    }
  }
  if (isRecord(value.master) && Array.isArray(value.master.elements)) {
    for (let elementIndex = 0; elementIndex < value.master.elements.length; elementIndex += 1) {
      throwIfAborted(signal);
      const pointer = `/master/elements/${elementIndex}/vrmScene`;
      append(scanStrictScene(value.master.elements[elementIndex], pointer));
    }
  }
  return scenes;
}

function sceneFingerprintSource(scenes: readonly StrictSceneScan[]): string {
  return JSON.stringify(scenes.map((scene) => [scene.pointer, scene.serialized]));
}

async function defaultDigestText(value: string, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") {
    fail("CRYPTO_UNAVAILABLE", "crypto-fingerprint-unavailable");
  }
  const bytes = textEncoder.encode(value);
  let digest: ArrayBuffer;
  try {
    digest = await subtle.digest("SHA-256", bytes);
  } catch (cause) {
    if (isAbortError(cause) || signal?.aborted) {
      fail("ABORTED", "aborted");
    }
    fail("CRYPTO_UNAVAILABLE", "crypto-fingerprint-failed", undefined, cause);
  }
  throwIfAborted(signal);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function addTextureReference(
  byHash: Map<StudioVrmTexturePaintArtifactHash, MutableArtifactPlan>,
  texture: StudioVrmSurfacePaintTexture,
  pointer: string,
): void {
  if (!CONTENT_HASH_PATTERN.test(texture.hash)) {
    fail("SCENE_INVALID", "scene-png-hash-invalid", pointer);
  }
  const contentHash = texture.hash as StudioVrmTexturePaintArtifactHash;
  const reference: StudioVrmTexturePaintProjectReference = {
    pointer,
    bindingKey: texture.bindingKey,
    materialLocator: texture.materialLocator,
    textureSlot: texture.textureSlot,
  };
  const existing = byHash.get(contentHash);
  if (existing) {
    if (
      existing.mimeType !== texture.mime
      || existing.byteLength !== texture.byteSize
      || existing.width !== texture.width
      || existing.height !== texture.height
    ) {
      fail(
        "SURFACE_PAINT_METADATA_CONFLICT",
        "metadata-mime-conflict",
        pointer,
      );
    }
    if (existing.references.some((candidate) => candidate.pointer === pointer)) {
      fail("SURFACE_PAINT_METADATA_CONFLICT", "metadata-pointer-duplicate", pointer);
    }
    existing.references.push(reference);
    return;
  }
  byHash.set(contentHash, {
    contentHash,
    mimeType: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME,
    byteLength: texture.byteSize,
    width: texture.width,
    height: texture.height,
    references: [reference],
  });
}

function canonicalArtifactPlan(value: MutableArtifactPlan): StudioVrmTexturePaintProjectArtifactPlan {
  const references = [...value.references].sort((left, right) => compareText(left.pointer, right.pointer));
  return Object.freeze({
    contentHash: value.contentHash,
    mimeType: value.mimeType,
    byteLength: value.byteLength,
    width: value.width,
    height: value.height,
    references: Object.freeze(references.map((reference) => Object.freeze({ ...reference }))),
    documentReferences: Object.freeze(references.map((reference) => Object.freeze({
      pointer: reference.pointer,
      usage: "raster" as const,
      mode: "sha256-prefixed" as const,
    }))),
  });
}

async function collectCanonicalProjectPlan(
  rawProject: unknown,
  signal: AbortSignal | undefined,
  dependencies: StudioVrmTexturePaintProjectLibraryDependencies | undefined,
): Promise<StudioVrmTexturePaintProjectPlan> {
  throwIfAborted(signal);
  let project: StudioProjectFile;
  try {
    project = parseStudioProjectFile(rawProject);
  } catch (cause) {
    fail("PROJECT_INVALID", "project-reference-invalid", undefined, cause);
  }
  const sourceScenes = scanStrictProjectScenes(rawProject, signal);
  const canonicalScenes = scanStrictProjectScenes(project, signal);
  const sourceFingerprint = sceneFingerprintSource(sourceScenes);
  const canonicalFingerprint = sceneFingerprintSource(canonicalScenes);
  if (sourceFingerprint !== canonicalFingerprint) {
    fail(
      "CANONICAL_SCENE_FINGERPRINT_MISMATCH", "fingerprint-mismatch-parser");
  }

  const byHash = new Map<StudioVrmTexturePaintArtifactHash, MutableArtifactPlan>();
  let referenceCount = 0;
  for (const scene of canonicalScenes) {
    for (let textureIndex = 0; textureIndex < scene.textures.length; textureIndex += 1) {
      const pointer = `${scene.pointer}/surfacePaint/textures/${textureIndex}/hash`;
      if (!SURFACE_PAINT_POINTER_PATTERN.test(pointer)) {
        fail("SCENE_INVALID", "scene-pointer-invalid", pointer);
      }
      addTextureReference(byHash, scene.textures[textureIndex], pointer);
      referenceCount += 1;
      if (referenceCount > STUDIO_PROJECT_ARCHIVE_LIMITS.maxReferences) {
        fail("PROJECT_LIMIT_EXCEEDED", "limit-refs");
      }
    }
  }
  const artifacts = Array.from(byHash.values())
    .map(canonicalArtifactPlan)
    .sort((left, right) => compareText(left.contentHash, right.contentHash));
  if (artifacts.length > STUDIO_PROJECT_ARCHIVE_LIMITS.maxAttachments) {
    fail("PROJECT_LIMIT_EXCEEDED", "limit-png-count");
  }
  let totalBytes = 0;
  for (const artifact of artifacts) {
    if (artifact.byteLength > STUDIO_PROJECT_ARCHIVE_LIMITS.maxAttachmentBytes) {
      fail("PROJECT_LIMIT_EXCEEDED", "limit-png-single");
    }
    totalBytes += artifact.byteLength;
    if (totalBytes > STUDIO_PROJECT_ARCHIVE_LIMITS.maxTotalAttachmentBytes) {
      fail("PROJECT_LIMIT_EXCEEDED", "limit-png-total");
    }
  }
  const digest = dependencies?.digestText ?? defaultDigestText;
  const rawFingerprint = await digest(canonicalFingerprint, signal);
  if (!RAW_SHA256_PATTERN.test(rawFingerprint)) {
    fail("CRYPTO_UNAVAILABLE", "crypto-fingerprint-format-invalid");
  }
  return Object.freeze({
    schemaVersion: STUDIO_VRM_TEXTURE_PAINT_PROJECT_LIBRARY_SCHEMA_VERSION,
    project,
    sceneFingerprint: `sha256:${rawFingerprint}`,
    artifacts: Object.freeze(artifacts),
    referenceCount,
    totalBytes,
  });
}

function plansMatch(
  project: StudioVrmTexturePaintProjectPlan,
  canonical: StudioVrmTexturePaintProjectPlan,
): boolean {
  if (
    project.sceneFingerprint !== canonical.sceneFingerprint
    || project.referenceCount !== canonical.referenceCount
    || project.totalBytes !== canonical.totalBytes
    || project.artifacts.length !== canonical.artifacts.length
  ) return false;
  return project.artifacts.every((artifact, artifactIndex) => {
    const right = canonical.artifacts[artifactIndex];
    if (
      !right
      || artifact.contentHash !== right.contentHash
      || artifact.mimeType !== right.mimeType
      || artifact.byteLength !== right.byteLength
      || artifact.width !== right.width
      || artifact.height !== right.height
      || artifact.references.length !== right.references.length
    ) return false;
    return artifact.references.every((reference, referenceIndex) => {
      const candidate = right.references[referenceIndex];
      return candidate?.pointer === reference.pointer
        && candidate.bindingKey === reference.bindingKey
        && candidate.materialLocator === reference.materialLocator
        && candidate.textureSlot === reference.textureSlot;
    });
  });
}

async function collectMatchingPlans(
  input: StudioVrmTexturePaintProjectBridgeInput,
): Promise<StudioVrmTexturePaintProjectPlan> {
  const projectPlan = await collectCanonicalProjectPlan(
    input.project,
    input.signal,
    input.dependencies,
  );
  if (Object.is(input.project, input.canonicalProject)) return projectPlan;
  const canonicalPlan = await collectCanonicalProjectPlan(
    input.canonicalProject,
    input.signal,
    input.dependencies,
  );
  if (!plansMatch(projectPlan, canonicalPlan)) {
    fail(
      "CANONICAL_SCENE_FINGERPRINT_MISMATCH", "fingerprint-mismatch-archive");
  }
  return projectPlan;
}

export async function collectStudioVrmTexturePaintProjectPlan(
  project: unknown,
  options: {
    readonly signal?: AbortSignal;
    readonly dependencies?: StudioVrmTexturePaintProjectLibraryDependencies;
  } = {},
): Promise<StudioVrmTexturePaintProjectPlan> {
  return collectCanonicalProjectPlan(project, options.signal, options.dependencies);
}

function metadataForPlan(
  artifact: StudioVrmTexturePaintProjectArtifactPlan,
): StudioVrmTexturePaintArtifactMetadata {
  const bindingKey = [...artifact.references]
    .map((reference) => reference.bindingKey)
    .sort(compareText)[0];
  if (!bindingKey) {
    fail("SURFACE_PAINT_METADATA_CONFLICT", "metadata-binding-missing");
  }
  return {
    schemaVersion: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_SCHEMA_VERSION,
    kind: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_KIND,
    bindingKey,
    contentHash: artifact.contentHash,
    mimeType: artifact.mimeType,
    byteLength: artifact.byteLength,
    width: artifact.width,
    height: artifact.height,
  };
}

function verifiedArtifactMatchesPlan(
  verified: StudioVrmTexturePaintArtifact,
  plan: StudioVrmTexturePaintProjectArtifactPlan,
): boolean {
  return verified.metadata.contentHash === plan.contentHash
    && verified.metadata.mimeType === plan.mimeType
    && verified.metadata.byteLength === plan.byteLength
    && verified.metadata.width === plan.width
    && verified.metadata.height === plan.height
    && verified.archiveEntry.contentHash === plan.contentHash
    && verified.archiveEntry.mimeType === plan.mimeType
    && verified.archiveEntry.byteLength === plan.byteLength
    && verified.archiveEntry.width === plan.width
    && verified.archiveEntry.height === plan.height
    && verified.archiveEntry.data.size === plan.byteLength;
}

function defaultLibraryAdapter(
  dependencies: StudioVrmTexturePaintProjectLibraryDependencies | undefined,
): StudioVrmTexturePaintProjectLibraryAdapter {
  const atomic = defaultAtomicLibraryAdapter(dependencies);
  return {
    resolve: (contentHash, context) => atomic.resolve(contentHash, context),
    async install(artifact, context) {
      return (await atomic.installWithCreationReceipt(artifact, context)).disposition;
    },
  };
}

function defaultAtomicLibraryAdapter(
  dependencies: StudioVrmTexturePaintProjectLibraryDependencies | undefined,
): StudioVrmTexturePaintProjectAtomicLibraryAdapter {
  const corrupt = new Set<StudioVrmTexturePaintArtifactHash>();
  return {
    async resolve(contentHash, context) {
      try {
        const artifact = await getStudioVrmTexturePaintLibraryArtifact(contentHash, {
          ...dependencies?.libraryOptions,
          signal: context.signal,
        });
        return artifact.archiveEntry.data;
      } catch (cause) {
        if (
          cause instanceof StudioVrmTexturePaintLibraryError
          && (cause.code === "ARTIFACT_MISSING" || cause.code === "STORAGE_CORRUPT")
        ) {
          if (cause.code === "STORAGE_CORRUPT") corrupt.add(contentHash);
          return null;
        }
        throw cause;
      }
    },
    async installWithCreationReceipt(artifact, context) {
      const result = await saveStudioVrmTexturePaintLibraryArtifact(artifact, {
        ...dependencies?.libraryOptions,
        signal: context.signal,
      });
      const repaired = corrupt.delete(artifact.metadata.contentHash);
      return Object.freeze({
        disposition: repaired || !result.deduplicated ? "installed" : "reused",
        creationReceipt: result.creationReceipt,
        mutationGeneration: result.mutationGeneration,
      });
    },
    compensateCreated(receipts, mutationGenerations, context) {
      return deleteStudioVrmTexturePaintLibraryCreationBatchIfMatches(
        receipts,
        mutationGenerations,
        {
          ...dependencies?.libraryOptions,
          signal: context.signal,
        },
      );
    },
  };
}

async function resolveLibrarySource(
  library: StudioVrmTexturePaintArtifactResolver,
  contentHash: StudioVrmTexturePaintArtifactHash,
  signal: AbortSignal | undefined,
): Promise<StudioVrmTexturePaintArtifactSource | null> {
  throwIfAborted(signal);
  try {
    const source = await library.resolve(contentHash, { signal });
    throwIfAborted(signal);
    return source;
  } catch (cause) {
    if (isAbortError(cause) || signal?.aborted) {
      fail("ABORTED", "aborted");
    }
    fail("LIBRARY_READ_FAILED", "read-local-png-failed", undefined, cause);
  }
}

async function verifyAgainstPlan(
  plan: StudioVrmTexturePaintProjectArtifactPlan,
  source: StudioVrmTexturePaintArtifactSource,
  signal: AbortSignal | undefined,
  dependencies: StudioVrmTexturePaintProjectLibraryDependencies | undefined,
): Promise<StudioVrmTexturePaintArtifact> {
  const verifier = dependencies?.verifyArtifact ?? verifyStudioVrmTexturePaintArtifact;
  let verified: StudioVrmTexturePaintArtifact;
  try {
    verified = await verifier(metadataForPlan(plan), source, { signal });
  } catch (cause) {
    if (isAbortError(cause) || signal?.aborted) {
      fail("ABORTED", "aborted");
    }
    fail(
      "ARTIFACT_VERIFICATION_FAILED",
      "verify-failed",
      plan.references[0]?.pointer,
      cause,
    );
  }
  if (!verifiedArtifactMatchesPlan(verified, plan)) {
    fail(
      "ARTIFACT_VERIFICATION_FAILED", "verify-receipt-mismatch",
      plan.references[0]?.pointer);
  }
  return verified;
}

function unresolvedDiagnostic(
  code: StudioVrmTexturePaintProjectLibraryDiagnosticCode,
  artifact: StudioVrmTexturePaintProjectArtifactPlan,
): StudioVrmTexturePaintProjectLibraryDiagnostic {
  return Object.freeze({
    severity: "error",
    code,
    message: code === "LIBRARY_UNAVAILABLE"
      ? "로컬 VRM 표면 페인팅 저장소의 사용 가능 여부를 확인하지 못했습니다."
      : code === "LIBRARY_ARTIFACT_MISSING"
        ? "로컬 라이브러리에서 VRM 표면 페인팅 PNG를 찾지 못했습니다."
        : "프로젝트 archive에서 VRM 표면 페인팅 PNG를 찾지 못했습니다.",
    contentHash: artifact.contentHash,
    pointers: Object.freeze(artifact.references.map((reference) => reference.pointer)),
  });
}

function exportPreflightLimit(
  value: number | undefined,
  hardMaximum: number,
  label: string,
): number {
  if (value === undefined) return hardMaximum;
  if (!Number.isSafeInteger(value) || value < 1 || value > hardMaximum) {
    fail("PROJECT_LIMIT_EXCEEDED", "limit-preflight-invalid", undefined, undefined, { label });
  }
  return value;
}

function assertExportPlanWithinLimits(
  plan: StudioVrmTexturePaintProjectPlan,
  limits: ExportStudioVrmTexturePaintProjectLibraryInput["limits"],
): void {
  const maxAttachments = exportPreflightLimit(
    limits?.maxAttachments,
    STUDIO_PROJECT_ARCHIVE_LIMITS.maxAttachments,
    "attachment 수",
  );
  const maxAttachmentBytes = exportPreflightLimit(
    limits?.maxAttachmentBytes,
    STUDIO_PROJECT_ARCHIVE_LIMITS.maxAttachmentBytes,
    "attachment 크기",
  );
  const maxTotalAttachmentBytes = exportPreflightLimit(
    limits?.maxTotalAttachmentBytes,
    STUDIO_PROJECT_ARCHIVE_LIMITS.maxTotalAttachmentBytes,
    "attachment 합계",
  );
  if (plan.artifacts.length > maxAttachments) {
    fail(
      "PROJECT_LIMIT_EXCEEDED", "limit-device-png-count");
  }
  if (plan.totalBytes > maxTotalAttachmentBytes) {
    fail(
      "PROJECT_LIMIT_EXCEEDED", "limit-device-png-total");
  }
  const oversized = plan.artifacts.find(
    (artifact) => artifact.byteLength > maxAttachmentBytes,
  );
  if (oversized) {
    fail(
      "PROJECT_LIMIT_EXCEEDED", "limit-device-png-single",
      oversized.references[0]?.pointer);
  }
}

function sourceMatchesAvailabilityReceipt(
  source: StudioVrmTexturePaintArtifactSource,
  plan: StudioVrmTexturePaintProjectArtifactPlan,
): boolean {
  if (source instanceof Blob) {
    return source.type === plan.mimeType && source.size === plan.byteLength;
  }
  return source instanceof Uint8Array && source.byteLength === plan.byteLength;
}

/**
 * Audits browser-local editability for a JSON project without creating archive attachments,
 * re-hashing, or re-encoding its PNG artifacts. Archive import/export remains the integrity
 * boundary; this path only distinguishes present, missing, and unreadable local storage.
 */
export async function auditStudioVrmTexturePaintProjectLibraryAvailability(
  input: AuditStudioVrmTexturePaintProjectLibraryAvailabilityInput,
): Promise<AuditStudioVrmTexturePaintProjectLibraryAvailabilityResult> {
  const plan = await collectMatchingPlans(input);
  const library = input.library ?? defaultLibraryAdapter(input.dependencies);
  const diagnostics: StudioVrmTexturePaintProjectLibraryDiagnostic[] = [];
  let checkedCount = 0;
  for (const artifactPlan of plan.artifacts) {
    throwIfAborted(input.signal);
    let source: StudioVrmTexturePaintArtifactSource | null;
    try {
      source = await library.resolve(artifactPlan.contentHash, { signal: input.signal });
      throwIfAborted(input.signal);
    } catch (cause) {
      if (isAbortError(cause) || input.signal?.aborted) {
        fail("ABORTED", "aborted");
      }
      return Object.freeze({
        status: "unavailable",
        sceneFingerprint: plan.sceneFingerprint,
        artifactCount: plan.artifacts.length,
        checkedCount,
        diagnostics: Object.freeze([
          unresolvedDiagnostic("LIBRARY_UNAVAILABLE", artifactPlan),
        ]),
      });
    }
    checkedCount += 1;
    if (source === null) {
      diagnostics.push(unresolvedDiagnostic("LIBRARY_ARTIFACT_MISSING", artifactPlan));
      continue;
    }
    if (!sourceMatchesAvailabilityReceipt(source, artifactPlan)) {
      return Object.freeze({
        status: "unavailable",
        sceneFingerprint: plan.sceneFingerprint,
        artifactCount: plan.artifacts.length,
        checkedCount,
        diagnostics: Object.freeze([
          unresolvedDiagnostic("LIBRARY_UNAVAILABLE", artifactPlan),
        ]),
      });
    }
  }
  if (diagnostics.length > 0) {
    return Object.freeze({
      status: "unresolved",
      sceneFingerprint: plan.sceneFingerprint,
      artifactCount: plan.artifacts.length,
      checkedCount,
      diagnostics: Object.freeze(diagnostics),
    });
  }
  return Object.freeze({
    status: "ready",
    sceneFingerprint: plan.sceneFingerprint,
    artifactCount: plan.artifacts.length,
    checkedCount,
    diagnostics: EMPTY_RESULT_ITEMS,
  });
}

export async function exportStudioVrmTexturePaintProjectLibrary(
  input: ExportStudioVrmTexturePaintProjectLibraryInput,
): Promise<ExportStudioVrmTexturePaintProjectLibraryResult> {
  const plan = await collectMatchingPlans(input);
  assertExportPlanWithinLimits(plan, input.limits);
  const library = input.library ?? defaultLibraryAdapter(input.dependencies);
  const verified: Array<{
    plan: StudioVrmTexturePaintProjectArtifactPlan;
    artifact: StudioVrmTexturePaintArtifact;
  }> = [];
  const diagnostics: StudioVrmTexturePaintProjectLibraryDiagnostic[] = [];
  for (const artifactPlan of plan.artifacts) {
    const source = await resolveLibrarySource(library, artifactPlan.contentHash, input.signal);
    if (!source) {
      diagnostics.push(unresolvedDiagnostic("LIBRARY_ARTIFACT_MISSING", artifactPlan));
      continue;
    }
    verified.push({
      plan: artifactPlan,
      artifact: await verifyAgainstPlan(
        artifactPlan,
        source,
        input.signal,
        input.dependencies,
      ),
    });
  }
  if (diagnostics.length > 0) {
    return Object.freeze({
      status: "unresolved",
      sceneFingerprint: plan.sceneFingerprint,
      attachments: EMPTY_RESULT_ITEMS,
      diagnostics: Object.freeze(diagnostics),
    });
  }
  const attachments = verified.map(({ plan: artifactPlan, artifact }) => Object.freeze({
    kind: "raster" as const,
    data: artifact.archiveEntry.data,
    mimeType: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME,
    documentReferences: artifactPlan.documentReferences,
  }));
  return Object.freeze({
    status: "ready",
    sceneFingerprint: plan.sceneFingerprint,
    attachments: Object.freeze(attachments),
    diagnostics: EMPTY_RESULT_ITEMS,
  });
}

function expectedArchivePath(contentHash: StudioVrmTexturePaintArtifactHash): string {
  return `assets/sha256/${contentHash.slice("sha256:".length)}.png`;
}

function referenceMatches(
  left: StudioProjectArchiveDocumentReference,
  right: StudioProjectArchiveDocumentReference,
): boolean {
  return left.pointer === right.pointer
    && left.usage === right.usage
    && left.mode === right.mode;
}

function manifestAttachmentMatchesPlan(
  metadata: StudioProjectArchiveManifestAttachment,
  plan: StudioVrmTexturePaintProjectArtifactPlan,
): boolean {
  if (
    !exactKeys(metadata, [
      "path",
      "mimeType",
      "byteSize",
      "sha256",
      "kinds",
      "documentReferences",
    ])
    || metadata.path !== expectedArchivePath(plan.contentHash)
    || metadata.mimeType !== STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME
    || metadata.byteSize !== plan.byteLength
    || metadata.sha256 !== plan.contentHash.slice("sha256:".length)
    || !metadata.kinds.includes("raster")
  ) return false;
  return plan.documentReferences.every((expected) => {
    const reference = metadata.documentReferences.find(
      (candidate) => candidate.pointer === expected.pointer,
    );
    return reference !== undefined
      && exactKeys(reference, ["pointer", "usage", "mode"])
      && referenceMatches(reference, expected);
  });
}

function importedAttachmentMetadataMatchesManifest(
  imported: StudioProjectArchiveImportedAttachment,
  manifest: StudioProjectArchiveManifestAttachment,
): boolean {
  const metadata = imported.metadata;
  return exactKeys(imported, ["metadata", "blob"])
    && exactKeys(metadata, [
      "path",
      "mimeType",
      "byteSize",
      "sha256",
      "kinds",
      "documentReferences",
    ])
    && metadata.path === manifest.path
    && metadata.mimeType === manifest.mimeType
    && metadata.byteSize === manifest.byteSize
    && metadata.sha256 === manifest.sha256
    && metadata.kinds.length === manifest.kinds.length
    && metadata.kinds.every((kind, index) => kind === manifest.kinds[index])
    && metadata.documentReferences.length === manifest.documentReferences.length
    && metadata.documentReferences.every((reference, index) => {
      const candidate = manifest.documentReferences[index];
      return candidate !== undefined && referenceMatches(reference, candidate);
    });
}

function validateNoForeignSurfacePaintReferences(
  manifest: StudioProjectArchiveManifest,
  plannedPointers: ReadonlyMap<string, string>,
): number {
  const seen = new Set<string>();
  for (const attachment of manifest.attachments) {
    for (const reference of attachment.documentReferences) {
      if (!SURFACE_PAINT_POINTER_PATTERN.test(reference.pointer)) continue;
      const expectedHash = plannedPointers.get(reference.pointer);
      if (
        expectedHash === undefined
        || expectedHash !== attachment.sha256
        || seen.has(reference.pointer)
      ) {
        fail(
          "ARCHIVE_METADATA_CONFLICT", "archive-manifest-range-conflict",
          reference.pointer);
      }
      seen.add(reference.pointer);
    }
  }
  return seen.size;
}

async function installVerifiedArtifact(
  library: StudioVrmTexturePaintProjectLibraryAdapter,
  artifact: StudioVrmTexturePaintArtifact,
  plan: StudioVrmTexturePaintProjectArtifactPlan,
  signal: AbortSignal | undefined,
  dependencies: StudioVrmTexturePaintProjectLibraryDependencies | undefined,
): Promise<"installed" | "reused"> {
  throwIfAborted(signal);
  let disposition: "installed" | "reused";
  try {
    disposition = await library.install(artifact, { signal });
  } catch (cause) {
    if (isAbortError(cause) || signal?.aborted) {
      fail("ABORTED", "aborted");
    }
    fail("LIBRARY_INSTALL_FAILED", "install-save-failed", undefined, cause);
  }
  if (disposition !== "installed" && disposition !== "reused") {
    fail("LIBRARY_INSTALL_FAILED", "install-result-invalid");
  }
  const installed = await resolveLibrarySource(library, plan.contentHash, signal);
  if (!installed) {
    fail("LIBRARY_INSTALL_FAILED", "install-recheck-failed");
  }
  await verifyAgainstPlan(plan, installed, signal, dependencies);
  return disposition;
}

async function compensateTextureImport(
  library: StudioVrmTexturePaintProjectAtomicLibraryAdapter,
  receipts: readonly StudioVrmTexturePaintLibraryCreationReceipt[],
  mutationGenerations: readonly number[],
): Promise<void> {
  if (receipts.length === 0) return;
  let compensated: boolean;
  try {
    // Once a durable row exists, caller cancellation cannot cancel its rollback. Product storage
    // still applies its own bounded authority operation; only the forward import uses caller signal.
    compensated = await library.compensateCreated(receipts, mutationGenerations, {});
  } catch (cause) {
    fail(
      "LIBRARY_INSTALL_FAILED", "install-rollback-failed",
      undefined,
      cause);
  }
  if (!compensated) {
    fail(
      "LIBRARY_INSTALL_FAILED", "install-rollback-blocked");
  }
}

/** Authenticates the full archive map and all PNG bytes without mutating durable storage. */
export async function prepareStudioVrmTexturePaintProjectArchiveImport(
  input: PrepareStudioVrmTexturePaintProjectArchiveImportInput,
): Promise<PrepareStudioVrmTexturePaintProjectArchiveImportResult> {
  const plan = await collectMatchingPlans(input);
  const manifestByHash = new Map<string, StudioProjectArchiveManifestAttachment>();
  for (const attachment of input.manifest.attachments) {
    if (manifestByHash.has(attachment.sha256)) {
      fail("ARCHIVE_METADATA_CONFLICT", "archive-manifest-duplicate-hash");
    }
    manifestByHash.set(attachment.sha256, attachment);
  }
  const plannedPointers = new Map(
    plan.artifacts.flatMap((artifact) => artifact.references.map((reference) => [
      reference.pointer,
      artifact.contentHash.slice("sha256:".length),
    ] as const)),
  );
  const coveredPointerCount = validateNoForeignSurfacePaintReferences(
    input.manifest,
    plannedPointers,
  );
  const diagnostics: StudioVrmTexturePaintProjectLibraryDiagnostic[] = [];
  const candidates: Array<{
    plan: StudioVrmTexturePaintProjectArtifactPlan;
    imported: StudioProjectArchiveImportedAttachment;
  }> = [];
  for (const artifactPlan of plan.artifacts) {
    const rawHash = artifactPlan.contentHash.slice("sha256:".length);
    const manifestAttachment = manifestByHash.get(rawHash);
    const imported = input.attachments.get(rawHash);
    if (!manifestAttachment || !imported) {
      diagnostics.push(unresolvedDiagnostic("ARCHIVE_ATTACHMENT_MISSING", artifactPlan));
      continue;
    }
    if (
      !manifestAttachmentMatchesPlan(manifestAttachment, artifactPlan)
      || !importedAttachmentMetadataMatchesManifest(imported, manifestAttachment)
      || imported.blob.size !== artifactPlan.byteLength
      || imported.blob.type !== STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME
    ) {
      fail(
        "ARCHIVE_METADATA_CONFLICT", "archive-metadata-mismatch",
        artifactPlan.references[0]?.pointer);
    }
    candidates.push({ plan: artifactPlan, imported });
  }
  if (coveredPointerCount !== plannedPointers.size && diagnostics.length === 0) {
    fail(
      "ARCHIVE_METADATA_CONFLICT", "archive-manifest-incomplete");
  }
  const library = input.library ?? defaultAtomicLibraryAdapter(input.dependencies);
  if (diagnostics.length > 0) {
    const unresolved: PrepareStudioVrmTexturePaintProjectArchiveImportResult = Object.freeze({
      status: "unresolved",
      sceneFingerprint: plan.sceneFingerprint,
      project: plan.project,
      plan,
      verifiedArchive: EMPTY_RESULT_ITEMS,
      diagnostics: Object.freeze(diagnostics),
    });
    PREPARED_TEXTURE_IMPORTS.set(unresolved, {
      library,
      signal: input.signal,
      dependencies: input.dependencies,
    });
    return unresolved;
  }
  const verifiedArchive: Array<{
    readonly plan: StudioVrmTexturePaintProjectArtifactPlan;
    readonly artifact: StudioVrmTexturePaintArtifact;
  }> = [];
  // Every attachment is authenticated before the one-shot plan becomes committable.
  for (const { plan: artifactPlan, imported } of candidates) {
    verifiedArchive.push(Object.freeze({
      plan: artifactPlan,
      artifact: await verifyAgainstPlan(
        artifactPlan,
        imported.blob,
        input.signal,
        input.dependencies,
      ),
    }));
  }
  const prepared: PrepareStudioVrmTexturePaintProjectArchiveImportResult = Object.freeze({
    status: "ready",
    sceneFingerprint: plan.sceneFingerprint,
    project: plan.project,
    plan,
    verifiedArchive: Object.freeze(verifiedArchive),
    diagnostics: EMPTY_RESULT_ITEMS,
  });
  PREPARED_TEXTURE_IMPORTS.set(prepared, {
    library,
    signal: input.signal,
    dependencies: input.dependencies,
  });
  return prepared;
}

/** Final one-shot install/apply seam with exact created-only compensation. */
export async function installPreparedStudioVrmTexturePaintProjectArchiveImportAndApply<ApplyResult>(
  prepared: PrepareStudioVrmTexturePaintProjectArchiveImportResult,
  project: unknown,
  applyProject: (project: StudioProjectFile) => ApplyResult | Promise<ApplyResult>,
  options: { readonly didApply: (result: ApplyResult) => boolean },
): Promise<InstallPreparedStudioVrmTexturePaintProjectArchiveImportResult<ApplyResult>> {
  const state = PREPARED_TEXTURE_IMPORTS.get(prepared);
  if (!state) {
    fail("LIBRARY_INSTALL_FAILED", "install-session-invalid");
  }
  // Atomically take the one-shot capability before the first asynchronous fingerprint/hash step.
  // A concurrent caller therefore observes absence instead of sharing the same prepared bytes.
  PREPARED_TEXTURE_IMPORTS.delete(prepared);
  const currentPlan = await collectCanonicalProjectPlan(project, state.signal, state.dependencies);
  if (!plansMatch(prepared.plan, currentPlan)) {
    fail(
      "CANONICAL_SCENE_FINGERPRINT_MISMATCH", "fingerprint-mismatch-apply");
  }
  if (prepared.status === "unresolved") {
    const applyResult = await applyProject(currentPlan.project);
    return Object.freeze({
      status: "unresolved",
      sceneFingerprint: prepared.sceneFingerprint,
      installed: 0 as const,
      reused: 0 as const,
      diagnostics: prepared.diagnostics,
      applyResult,
    });
  }
  const creationReceipts: StudioVrmTexturePaintLibraryCreationReceipt[] = [];
  const mutationGenerations: number[] = [];
  let installed = 0;
  let reused = 0;
  try {
    for (const { plan: artifactPlan, artifact } of prepared.verifiedArchive) {
      const existing = await resolveLibrarySource(
        state.library,
        artifactPlan.contentHash,
        state.signal,
      );
      if (existing) {
        try {
          await verifyAgainstPlan(artifactPlan, existing, state.signal, state.dependencies);
          reused += 1;
          continue;
        } catch (cause) {
          if (
            !(cause instanceof StudioVrmTexturePaintProjectLibraryError)
            || cause.code !== "ARTIFACT_VERIFICATION_FAILED"
          ) throw cause;
        }
      }
      throwIfAborted(state.signal);
      let result: StudioVrmTexturePaintProjectAtomicInstallResult;
      try {
        result = await state.library.installWithCreationReceipt(artifact, { signal: state.signal });
      } catch (cause) {
        if (isAbortError(cause) || state.signal?.aborted) {
          fail("ABORTED", "aborted");
        }
        fail(
          "LIBRARY_INSTALL_FAILED", "install-save-failed",
          undefined,
          cause);
      }
      if (result.disposition !== "installed" && result.disposition !== "reused") {
        fail("LIBRARY_INSTALL_FAILED", "install-result-invalid");
      }
      if (result.creationReceipt) creationReceipts.push(result.creationReceipt);
      if (result.mutationGeneration !== null) mutationGenerations.push(result.mutationGeneration);
      const persisted = await resolveLibrarySource(
        state.library,
        artifactPlan.contentHash,
        state.signal,
      );
      if (!persisted) {
        fail("LIBRARY_INSTALL_FAILED", "install-recheck-failed");
      }
      await verifyAgainstPlan(artifactPlan, persisted, state.signal, state.dependencies);
      if (result.disposition === "installed") installed += 1;
      else reused += 1;
    }
    const applyResult = await applyProject(currentPlan.project);
    if (!options.didApply(applyResult)) {
      const receipts = creationReceipts.splice(0);
      await compensateTextureImport(
        state.library,
        receipts,
        mutationGenerations,
      );
      installed = 0;
    }
    return Object.freeze({
      status: "ready",
      sceneFingerprint: prepared.sceneFingerprint,
      installed,
      reused,
      diagnostics: EMPTY_RESULT_ITEMS,
      applyResult,
    });
  } catch (cause) {
    try {
      const receipts = creationReceipts.splice(0);
      await compensateTextureImport(
        state.library,
        receipts,
        mutationGenerations,
      );
    } catch (rollbackCause) {
      const aggregate = new AggregateError(
        [cause, rollbackCause],
        "aggregate-apply-compensation-failed",
        { cause: rollbackCause },
      );
      (aggregate as { detailCode?: string }).detailCode =
        "aggregate-apply-compensation-failed";
      throw aggregate;
    }
    throw cause;
  }
}

export async function importStudioVrmTexturePaintProjectLibrary(
  input: ImportStudioVrmTexturePaintProjectLibraryInput,
): Promise<ImportStudioVrmTexturePaintProjectLibraryResult> {
  const plan = await collectMatchingPlans(input);
  const library = input.library ?? defaultLibraryAdapter(input.dependencies);
  const manifestByHash = new Map<string, StudioProjectArchiveManifestAttachment>();
  for (const attachment of input.manifest.attachments) {
    if (manifestByHash.has(attachment.sha256)) {
      fail("ARCHIVE_METADATA_CONFLICT", "archive-manifest-duplicate-hash");
    }
    manifestByHash.set(attachment.sha256, attachment);
  }
  const plannedPointers = new Map(
    plan.artifacts.flatMap((artifact) =>
      artifact.references.map((reference) => [
        reference.pointer,
        artifact.contentHash.slice("sha256:".length),
      ] as const)
    ),
  );
  const coveredPointerCount = validateNoForeignSurfacePaintReferences(
    input.manifest,
    plannedPointers,
  );

  const diagnostics: StudioVrmTexturePaintProjectLibraryDiagnostic[] = [];
  const archiveCandidates: Array<{
    plan: StudioVrmTexturePaintProjectArtifactPlan;
    imported: StudioProjectArchiveImportedAttachment;
  }> = [];
  for (const artifactPlan of plan.artifacts) {
    const rawHash = artifactPlan.contentHash.slice("sha256:".length);
    const manifestAttachment = manifestByHash.get(rawHash);
    const imported = input.attachments.get(rawHash);
    if (!manifestAttachment || !imported) {
      diagnostics.push(unresolvedDiagnostic("ARCHIVE_ATTACHMENT_MISSING", artifactPlan));
      continue;
    }
    if (
      !manifestAttachmentMatchesPlan(manifestAttachment, artifactPlan)
      || !importedAttachmentMetadataMatchesManifest(imported, manifestAttachment)
      || imported.blob.size !== artifactPlan.byteLength
      || imported.blob.type !== STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_MIME
    ) {
      fail(
        "ARCHIVE_METADATA_CONFLICT", "archive-metadata-mismatch",
        artifactPlan.references[0]?.pointer);
    }
    archiveCandidates.push({ plan: artifactPlan, imported });
  }
  if (diagnostics.length > 0) {
    return Object.freeze({
      status: "unresolved",
      sceneFingerprint: plan.sceneFingerprint,
      installed: 0,
      reused: 0,
      diagnostics: Object.freeze(diagnostics),
    });
  }
  if (coveredPointerCount !== plannedPointers.size) {
    fail(
      "ARCHIVE_METADATA_CONFLICT", "archive-manifest-incomplete");
  }

  // Authenticate every archive PNG before the first IndexedDB mutation.
  const verifiedArchive: Array<{
    plan: StudioVrmTexturePaintProjectArtifactPlan;
    artifact: StudioVrmTexturePaintArtifact;
  }> = [];
  for (const { plan: artifactPlan, imported } of archiveCandidates) {
    verifiedArchive.push({
      plan: artifactPlan,
      artifact: await verifyAgainstPlan(
        artifactPlan,
        imported.blob,
        input.signal,
        input.dependencies,
      ),
    });
  }
  const reusable = new Map<StudioVrmTexturePaintArtifactHash, boolean>();
  for (const { plan: artifactPlan } of verifiedArchive) {
    const existing = await resolveLibrarySource(library, artifactPlan.contentHash, input.signal);
    if (!existing) {
      reusable.set(artifactPlan.contentHash, false);
      continue;
    }
    try {
      await verifyAgainstPlan(artifactPlan, existing, input.signal, input.dependencies);
      reusable.set(artifactPlan.contentHash, true);
    } catch (cause) {
      if (
        cause instanceof StudioVrmTexturePaintProjectLibraryError
        && cause.code === "ARTIFACT_VERIFICATION_FAILED"
      ) {
        reusable.set(artifactPlan.contentHash, false);
        continue;
      }
      throw cause;
    }
  }

  let installed = 0;
  let reused = 0;
  for (const { plan: artifactPlan, artifact } of verifiedArchive) {
    if (reusable.get(artifactPlan.contentHash) === true) {
      reused += 1;
      continue;
    }
    const disposition = await installVerifiedArtifact(
      library,
      artifact,
      artifactPlan,
      input.signal,
      input.dependencies,
    );
    if (disposition === "reused") reused += 1;
    else installed += 1;
  }
  return Object.freeze({
    status: "ready",
    sceneFingerprint: plan.sceneFingerprint,
    installed,
    reused,
    diagnostics: EMPTY_RESULT_ITEMS,
  });
}

/**
 * JSON deliberately carries only immutable SHA-256 receipts. Keep the portability decision and
 * its long user-facing copy in this user-triggered module so Studio's initial route does not pay
 * for archive guidance before an export is requested.
 */
export async function inspectStudioVrmTexturePaintJsonExport(
  project: unknown,
): Promise<StudioVrmTexturePaintProjectNotice | null> {
  try {
    const plan = await collectStudioVrmTexturePaintProjectPlan(project);
    if (plan.artifacts.length === 0) return null;
    return Object.freeze({
      tone: "warn",
      text: resolveStudioVrmPaintLibraryNotice("json-receipts-only", {
        count: String(plan.artifacts.length),
      }),
    });
  } catch {
    return Object.freeze({
      tone: "warn",
      text: resolveStudioVrmPaintLibraryNotice("json-inspect-failed"),
    });
  }
}

export async function auditStudioVrmTexturePaintJsonImport(
  project: unknown,
): Promise<StudioVrmTexturePaintJsonImportPresentation> {
  const availability = await auditStudioVrmTexturePaintProjectLibraryAvailability({
    project,
    canonicalProject: project,
  });
  if (availability.status === "unresolved") {
    const missingCount = availability.diagnostics.length;
    return Object.freeze({
      notice: Object.freeze({
        tone: "warn",
        text: resolveStudioVrmPaintLibraryNotice("json-import-missing", {
          missingCount: String(missingCount),
        }),
      }),
      alertSuffix: resolveStudioVrmPaintLibraryNotice("json-import-missing-suffix", {
        missingCount: String(missingCount),
      }),
    });
  }
  if (availability.status === "unavailable") {
    return Object.freeze({
      notice: Object.freeze({
        tone: "warn",
        text: resolveStudioVrmPaintLibraryNotice("json-import-unavailable"),
      }),
      alertSuffix: resolveStudioVrmPaintLibraryNotice("json-import-unavailable-suffix"),
    });
  }
  return Object.freeze({ notice: null, alertSuffix: "" });
}

export async function prepareStudioVrmTexturePaintProjectArchiveExport(
  input: ExportStudioVrmTexturePaintProjectLibraryInput,
): Promise<readonly StudioProjectArchiveAttachmentInput[]> {
  const result = await exportStudioVrmTexturePaintProjectLibrary(input);
  if (result.status !== "ready") {
    const unresolved = new Error("archive-export-unresolved") as Error & {
      detailCode?: string;
      params?: Readonly<Record<string, string>>;
    };
    unresolved.detailCode = "archive-export-unresolved";
    unresolved.params = { count: String(result.diagnostics.length) };
    throw unresolved;
  }
  return result.attachments;
}

export function presentStudioVrmTexturePaintProjectArchiveExport(
  input: StudioVrmTexturePaintArchiveExportPresentationInput,
): StudioVrmTexturePaintProjectNotice {
  return input.isSelfContained
    ? Object.freeze({
        tone: "good",
        text: resolveStudioVrmPaintLibraryNotice("export-self-contained", {
          attachmentCount: String(input.attachmentCount),
        }),
      })
    : Object.freeze({
        tone: "warn",
        text: resolveStudioVrmPaintLibraryNotice("export-with-warnings", {
          warningCount: String(input.warningCount),
        }) + (input.missingReferenceCount > 0
          ? resolveStudioVrmPaintLibraryNotice("export-missing-references", {
              missingReferenceCount: String(input.missingReferenceCount),
            })
          : "") + (input.missingVrmCount > 0
          ? resolveStudioVrmPaintLibraryNotice("export-missing-vrm", {
              missingVrmCount: String(input.missingVrmCount),
            })
          : ""),
      });
}

export function presentStudioVrmTexturePaintProjectArchiveImport(
  input: StudioVrmTexturePaintArchiveImportPresentationInput,
): StudioVrmTexturePaintArchiveImportPresentation {
  const fullyResolved =
    input.isSelfContained
    && input.referenceUnresolved === 0
    && input.vrmUnresolved === 0
    && input.texturePaint.status === "ready";
  if (fullyResolved && input.texturePaint.status === "ready") {
    return Object.freeze({
      fullyResolved: true,
      notice: Object.freeze({
        tone: "good",
        text: resolveStudioVrmPaintLibraryNotice("import-fully-resolved", {
          attachmentCount: String(input.attachmentCount),
          referenceInstalled: String(input.referenceInstalled),
          referenceReused: String(input.referenceReused),
          vrmInstalled: String(input.vrmInstalled),
          vrmReused: String(input.vrmReused),
          textureInstalled: String(input.texturePaint.installed),
          textureReused: String(input.texturePaint.reused),
          background3dInstalled: String(input.background3dInstalled),
        }),
      }),
    });
  }
  return Object.freeze({
    fullyResolved: false,
    notice: Object.freeze({
      tone: "warn",
      text: resolveStudioVrmPaintLibraryNotice("import-partially-resolved", {
        warningCount: String(input.warningCount),
        referenceUnresolved: String(input.referenceUnresolved),
        vrmUnresolved: String(input.vrmUnresolved),
        textureUnresolved: String(
          input.texturePaint.status === "unresolved" ? input.texturePaint.diagnostics.length : 0,
        ),
      }),
    }),
  });
}
