import {
  disposeStudioBg3dThreeResources,
} from "../studio-background-3d-model";

import {
  StudioBg3dGeometryWorkerClientError,
  parseStudioBg3dGeometryInWorker,
} from "./studio-bg3d-geometry-worker-client";
import {
  hasValidStudioBg3dCanonicalGeometryNumbers,
  isStudioBg3dCanonicalGeometryPayload,
  type StudioBg3dCanonicalGeometryPayload,
} from "./studio-bg3d-geometry-worker-protocol";
import {
  type StudioBg3dGlbBudgetProfiles,
  type StudioBg3dGlbProfile,
  type StudioBg3dGlbValidationBudget,
} from "./studio-bg3d-glb-validation";
import { STUDIO_BG3D_MESHOPT_EXTENSION } from "./studio-bg3d-meshopt";
import {
  StudioBg3dObjPreflightWorkerClientError,
  preflightStudioBg3dMtlBytesInWorker,
  preflightStudioBg3dObjBytesInWorker,
} from "./studio-bg3d-obj-preflight-worker-client";
import {
  STUDIO_BG3D_OBJ_PREFLIGHT_WORKER_BUDGETS,
  STUDIO_BG3D_OBJ_PREFLIGHT_WORKER_PROTOCOL_VERSION,
  type StudioBg3dObjPreflightWorkerFailureCode,
  type StudioBg3dObjPreflightWorkerMtlEntry,
  type StudioBg3dObjPreflightWorkerMtlRequest,
  type StudioBg3dObjPreflightWorkerMtlResult,
  type StudioBg3dObjPreflightWorkerObjRequest,
  type StudioBg3dObjPreflightWorkerObjResult,
} from "./studio-bg3d-obj-preflight-worker-protocol";
import { hydrateStudioBg3dObjWorkerResult } from "./studio-bg3d-obj-three-hydrator";
import {
  convertStudioBg3dSkpToGlb,
  StudioBg3dSkpConverterUnavailableError,
  StudioBg3dSkpParseError,
} from "./studio-bg3d-skp-converter";
import {
  StudioBg3dObjWorkerClientError,
  parseStudioBg3dObjInWorker,
} from "./studio-bg3d-obj-worker-client";
import {
  STUDIO_BG3D_OBJ_WORKER_BUDGETS,
  STUDIO_BG3D_OBJ_WORKER_PROTOCOL_VERSION,
  isStudioBg3dObjWorkerResponseForRequest,
  type StudioBg3dObjWorkerCanonicalResult,
  type StudioBg3dObjWorkerFailureCode,
  type StudioBg3dObjWorkerMtlEntry,
  type StudioBg3dObjWorkerParseRequest,
} from "./studio-bg3d-obj-worker-protocol";

import type { Bg3dModelUploadSource } from "./bg3d-model-library";
import type * as THREE from "three";

import {
  inspectStrictJpegDimensions,
  inspectStrictStaticWebpDimensions,
} from "@/shared/lib/strict-raster-image-inspector";
import { assertStudioBg3dPreExportBudgets } from "./studio-bg3d-pre-export-budget";
import {
  STUDIO_BG3D_IMPORT_DIRECT_MAX_BYTES,
  STUDIO_BG3D_IMPORT_MAX_ACCESSOR_ELEMENTS,
  STUDIO_BG3D_IMPORT_MAX_CONVERSION_SOURCE_BYTES,
  STUDIO_BG3D_IMPORT_MAX_DECODED_GEOMETRY_BYTES,
  STUDIO_BG3D_IMPORT_MAX_DECODED_IMAGE_BYTES,
  STUDIO_BG3D_IMPORT_MAX_FILES,
  STUDIO_BG3D_IMPORT_MAX_FILE_BYTES,
  STUDIO_BG3D_IMPORT_MAX_GLTF_TABLE_ENTRIES,
  STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION,
  STUDIO_BG3D_IMPORT_MAX_INLINE_RESOURCE_BYTES,
  STUDIO_BG3D_IMPORT_MAX_INLINE_TOTAL_BYTES,
  STUDIO_BG3D_IMPORT_MAX_MATERIAL_RECORDS,
  STUDIO_BG3D_IMPORT_MAX_MESHES,
  STUDIO_BG3D_IMPORT_MAX_MESH_PRIMITIVES,
  STUDIO_BG3D_IMPORT_MAX_MODELS,
  STUDIO_BG3D_IMPORT_MAX_NODES,
  STUDIO_BG3D_IMPORT_MAX_OBJ_MATERIAL_LIBRARIES,
  STUDIO_BG3D_IMPORT_MAX_OBJ_MTL_TOTAL_BYTES,
  STUDIO_BG3D_IMPORT_MAX_OUTPUT_TOTAL_BYTES,
  STUDIO_BG3D_IMPORT_MAX_RESOURCE_RECORDS,
  STUDIO_BG3D_IMPORT_MAX_TEXT_BYTES,
  STUDIO_BG3D_IMPORT_MAX_TOTAL_BYTES,
  STUDIO_BG3D_IMPORT_MAX_TRIANGLES,
  STUDIO_BG3D_IMPORT_MAX_VERTICES,
  StudioBg3dModelImportError,
  importError,
  safeAddCount,
  safeMultiplyCount,
  throwIfAborted,
  type StudioBg3dParsedExportCandidate,
} from "./studio-bg3d-model-import-shared";

export {
  STUDIO_BG3D_IMPORT_DIRECT_MAX_BYTES,
  STUDIO_BG3D_IMPORT_MAX_ACCESSOR_ELEMENTS,
  STUDIO_BG3D_IMPORT_MAX_ANIMATION_BYTES,
  STUDIO_BG3D_IMPORT_MAX_ANIMATION_CLIPS,
  STUDIO_BG3D_IMPORT_MAX_ANIMATION_DURATION_SECONDS,
  STUDIO_BG3D_IMPORT_MAX_ANIMATION_KEYFRAMES,
  STUDIO_BG3D_IMPORT_MAX_ANIMATION_TRACKS,
  STUDIO_BG3D_IMPORT_MAX_CONVERSION_SOURCE_BYTES,
  STUDIO_BG3D_IMPORT_MAX_DECODED_GEOMETRY_BYTES,
  STUDIO_BG3D_IMPORT_MAX_DECODED_IMAGE_BYTES,
  STUDIO_BG3D_IMPORT_MAX_EXPORT_MATERIALS,
  STUDIO_BG3D_IMPORT_MAX_EXPORT_MATERIAL_SLOTS,
  STUDIO_BG3D_IMPORT_MAX_FILES,
  STUDIO_BG3D_IMPORT_MAX_FILE_BYTES,
  STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION,
  STUDIO_BG3D_IMPORT_MAX_INLINE_RESOURCE_BYTES,
  STUDIO_BG3D_IMPORT_MAX_INLINE_TOTAL_BYTES,
  STUDIO_BG3D_IMPORT_MAX_MESHES,
  STUDIO_BG3D_IMPORT_MAX_MESH_PRIMITIVES,
  STUDIO_BG3D_IMPORT_MAX_MODELS,
  STUDIO_BG3D_IMPORT_MAX_NODES,
  STUDIO_BG3D_IMPORT_MAX_OBJ_MATERIAL_LIBRARIES,
  STUDIO_BG3D_IMPORT_MAX_OBJ_MTL_DIRECTIVES,
  STUDIO_BG3D_IMPORT_MAX_OBJ_MTL_REFERENCE_DIRECTIVES,
  STUDIO_BG3D_IMPORT_MAX_OBJ_MTL_TOTAL_BYTES,
  STUDIO_BG3D_IMPORT_MAX_OUTPUT_TOTAL_BYTES,
  STUDIO_BG3D_IMPORT_MAX_TEXT_BYTES,
  STUDIO_BG3D_IMPORT_MAX_TOTAL_BYTES,
  STUDIO_BG3D_IMPORT_MAX_TRIANGLES,
  STUDIO_BG3D_IMPORT_MAX_VERTICES,
  StudioBg3dModelImportError,
  type StudioBg3dModelImportErrorCode,
  type StudioBg3dParsedExportCandidate,
} from "./studio-bg3d-model-import-shared";
export { assertStudioBg3dPreExportBudgets } from "./studio-bg3d-pre-export-budget";



export const STUDIO_BG3D_IMPORT_PRIMARY_FORMATS = [
  "glb",
  "gltf",
  "obj",
  "fbx",
  "dae",
  "stl",
  "ply",
  "3ds",
  "skp",
] as const;
export const STUDIO_BG3D_IMPORT_COMPANION_FORMATS = [
  "bin",
  "mtl",
  "png",
  "jpg",
  "jpeg",
  "webp",
] as const;

export type StudioBg3dImportPrimaryFormat = (typeof STUDIO_BG3D_IMPORT_PRIMARY_FORMATS)[number];
export type StudioBg3dImportCompanionFormat = (typeof STUDIO_BG3D_IMPORT_COMPANION_FORMATS)[number];
export type StudioBg3dImportProgressStage = "planning" | "reading" | "parsing" | "exporting" | "ready";

export interface StudioBg3dImportFile extends Blob {
  readonly name: string;
  readonly webkitRelativePath?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface StudioBg3dImportPlanItem {
  readonly primary: StudioBg3dImportFile;
  readonly primaryPath: string;
  readonly format: StudioBg3dImportPrimaryFormat;
}

export interface StudioBg3dImportPlan {
  readonly items: readonly StudioBg3dImportPlanItem[];
  readonly resources: ReadonlyMap<string, StudioBg3dImportFile>;
  readonly ignoredFiles: readonly string[];
  readonly totalBytes: number;
}

export interface StudioBg3dImportProgress {
  readonly stage: StudioBg3dImportProgressStage;
  readonly completedModels: number;
  readonly totalModels: number;
  readonly sourceName: string;
}

export interface StudioBg3dModelImportOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: StudioBg3dImportProgress) => void;
  /** Selected exactly once before conversion starts. Omission selects the product Worker. */
  readonly executionBackend?: StudioBg3dModelImportExecutionBackend;
  /**
   * Optional active device profile and document-intersected budgets. Supplying neither preserves
   * the legacy absolute pre-export ceilings; supplying one without the other fails closed.
   */
  readonly profile?: StudioBg3dGlbProfile;
  readonly budgets?: StudioBg3dGlbBudgetProfiles;
}

export type StudioBg3dModelImportExecutionBackend = "worker" | "direct";

const PRIMARY_FORMAT_SET = new Set<string>(STUDIO_BG3D_IMPORT_PRIMARY_FORMATS);
const COMPANION_FORMAT_SET = new Set<string>(STUDIO_BG3D_IMPORT_COMPANION_FORMATS);
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/iu;
const ENCODED_SEPARATOR_PATTERN = /%(?:2f|5c)/iu;
const SAFE_DATA_URI_PREFIX_PATTERN = /^data:(application\/(?:octet-stream|gltf-buffer)|image\/(?:png|jpeg|webp));base64,/iu;
const UNSUPPORTED_REQUIRED_GLTF_EXTENSIONS = new Set([
  "KHR_draco_mesh_compression",
  "KHR_texture_basisu",
  STUDIO_BG3D_MESHOPT_EXTENSION,
  "KHR_meshopt_compression",
]);
const JSON_GLTF_MESHOPT_EXTENSIONS = [
  STUDIO_BG3D_MESHOPT_EXTENSION,
  "KHR_meshopt_compression",
] as const;


function isSafeBudgetLimit(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function resolvePreExportBudget(
  options: Pick<StudioBg3dModelImportOptions, "budgets" | "profile">,
): StudioBg3dGlbValidationBudget | undefined {
  if (options.profile === undefined && options.budgets === undefined) return undefined;
  if (
    (options.profile !== "mobile" && options.profile !== "desktop")
    || !options.budgets
  ) {
    throw importError("parse-failed");
  }
  const budget = options.budgets[options.profile];
  const complexity = budget?.complexity;
  const textures = budget?.textures;
  if (
    !complexity
    || !textures
    || ![
      complexity.maxModelBytes,
      complexity.maxNodes,
      complexity.maxTriangles,
      complexity.maxDrawCalls,
      complexity.maxMaterials,
      complexity.maxLights,
      complexity.maxAnimations,
      complexity.maxAnimationChannels,
      complexity.maxAnimationKeyframes,
      complexity.maxAnimationValues,
      complexity.maxSkins,
      complexity.maxJoints,
      complexity.maxMorphTargets,
      complexity.maxAccessorElements,
      complexity.maxDecodedGeometryBytes,
      textures.maxTextures,
      textures.maxTotalBytes,
      textures.maxDimension,
    ].every(isSafeBudgetLimit)
  ) {
    throw importError("parse-failed");
  }
  return Object.freeze({
    complexity: Object.freeze({ ...complexity }),
    textures: Object.freeze({ ...textures }),
  });
}


function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 31 || codePoint === 127;
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some(isControlCharacter);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extensionOf(path: string): string {
  const lastSegment = path.slice(path.lastIndexOf("/") + 1);
  const dot = lastSegment.lastIndexOf(".");
  return dot > 0 && dot < lastSegment.length - 1 ? lastSegment.slice(dot + 1).toLowerCase() : "";
}

function modelBaseName(path: string): string {
  const segment = path.slice(path.lastIndexOf("/") + 1);
  const dot = segment.lastIndexOf(".");
  const raw = dot > 0 ? segment.slice(0, dot) : segment;
  const normalized = Array.from(raw.normalize("NFKC"), (character) =>
    isControlCharacter(character) ? " " : character)
    .slice(0, 116)
    .join("")
    .trim()
    .replace(/\s+/gu, "-")
    .replace(/[^\p{L}\p{N}._~-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized || "3d-model";
}

function canonicalFilePath(file: StudioBg3dImportFile): string {
  const raw = (file.webkitRelativePath || file.name).normalize("NFC").replace(/\\/gu, "/");
  if (!raw || raw.length > 1024 || raw.startsWith("/") || containsControlCharacter(raw)) {
    throw importError("invalid-path");
  }
  const segments = raw.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw importError("invalid-path");
  }
  return segments.join("/");
}

function validateInputFile(file: StudioBg3dImportFile): void {
  validateInputFileShape(file);
  if (file.size <= 0) throw importError("empty-file");
  if (file.size > STUDIO_BG3D_IMPORT_MAX_FILE_BYTES) throw importError("file-too-large");
}

function validateInputFileShape(file: StudioBg3dImportFile): void {
  if (
    typeof file?.name !== "string"
    || typeof file.size !== "number"
    || !Number.isSafeInteger(file.size)
    || typeof file.arrayBuffer !== "function"
  ) {
    throw importError("invalid-path");
  }
}

/**
 * Creates a bounded, deterministic plan before any file bytes are materialized. Unknown files are
 * ignored so a directory selection may include licenses/readmes, but every usable resource path
 * must still be unique case-insensitively across platforms.
 */
export function planStudioBg3dModelImports(
  input: readonly StudioBg3dImportFile[],
): StudioBg3dImportPlan {
  if (input.length > STUDIO_BG3D_IMPORT_MAX_FILES) throw importError("too-many-files");
  const resources = new Map<string, StudioBg3dImportFile>();
  const canonicalPathByFoldedPath = new Map<string, string>();
  const items: StudioBg3dImportPlanItem[] = [];
  const ignoredFiles: string[] = [];
  let totalBytes = 0;

  for (const file of input) {
    validateInputFileShape(file);
    const path = canonicalFilePath(file);
    const extension = extensionOf(path);
    const isPrimary = PRIMARY_FORMAT_SET.has(extension);
    const isCompanion = COMPANION_FORMAT_SET.has(extension);
    if (!isPrimary && !isCompanion) {
      ignoredFiles.push(path);
      continue;
    }
    validateInputFile(file);
    if (
      isPrimary
      && extension !== "glb"
      && file.size > STUDIO_BG3D_IMPORT_MAX_CONVERSION_SOURCE_BYTES
    ) {
      throw importError("file-too-large");
    }
    if (totalBytes > STUDIO_BG3D_IMPORT_MAX_TOTAL_BYTES - file.size) throw importError("total-too-large");
    totalBytes += file.size;
    const foldedPath = path.toLocaleLowerCase("en-US");
    if (canonicalPathByFoldedPath.has(foldedPath)) throw importError("duplicate-resource");
    canonicalPathByFoldedPath.set(foldedPath, path);
    resources.set(path, file);
    if (isPrimary) {
      items.push({
        primary: file,
        primaryPath: path,
        format: extension as StudioBg3dImportPrimaryFormat,
      });
    }
  }

  if (items.length === 0) throw importError("no-model");
  if (items.length > STUDIO_BG3D_IMPORT_MAX_MODELS) throw importError("too-many-models");
  return Object.freeze({
    items: Object.freeze(items),
    resources,
    ignoredFiles: Object.freeze(ignoredFiles),
    totalBytes,
  });
}

function safeDecodeUriPath(value: string): string {
  const withoutQuery = value.split(/[?#]/u, 1)[0] ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery).replace(/\\/gu, "/");
  } catch {
    throw importError("unsafe-resource-uri");
  }
  if (!decoded || decoded.startsWith("/") || containsControlCharacter(decoded)) {
    throw importError("unsafe-resource-uri");
  }
  const normalized: string[] = [];
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      // Do not normalize traversal, even when it would remain below the selected directory root.
      // The browser file picker does not give us a trustworthy package root to authorize it.
      throw importError("unsafe-resource-uri");
    } else {
      normalized.push(segment);
    }
  }
  if (normalized.length === 0) throw importError("unsafe-resource-uri");
  return normalized.join("/");
}

function directoryOf(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator >= 0 ? path.slice(0, separator + 1) : "";
}

function compareUtf8(left: string, right: string): number {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftBytes[index] ?? 0) - (rightBytes[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

class LocalResourceResolver {
  readonly #resources: ReadonlyMap<string, StudioBg3dImportFile>;
  readonly #primaryDirectory: string;
  readonly #pathByFoldedPath = new Map<string, string>();
  readonly #uniquePathByFoldedBaseName = new Map<string, string | null>();
  readonly #objectUrlByPath = new Map<string, string>();
  readonly #ownedObjectUrls = new Set<string>();
  readonly #approvedInlineUris = new Set<string>();
  readonly #packageRootDepth: number;

  constructor(resources: ReadonlyMap<string, StudioBg3dImportFile>, primaryPath: string) {
    this.#resources = resources;
    this.#primaryDirectory = directoryOf(primaryPath);
    this.#packageRootDepth = primaryPath.includes("/") ? 1 : 0;
    for (const path of resources.keys()) {
      this.#pathByFoldedPath.set(path.toLocaleLowerCase("en-US"), path);
      const baseName = path.slice(path.lastIndexOf("/") + 1).toLocaleLowerCase("en-US");
      if (!this.#uniquePathByFoldedBaseName.has(baseName)) {
        this.#uniquePathByFoldedBaseName.set(baseName, path);
      } else {
        this.#uniquePathByFoldedBaseName.set(baseName, null);
      }
    }
  }

  fileForUri(uri: string): StudioBg3dImportFile {
    return this.resourceForUri(uri).file;
  }

  fileForCanonicalPath(path: string): StudioBg3dImportFile {
    const file = this.#resources.get(path);
    if (!file) throw importError("missing-resource");
    return file;
  }

  canonicalResourcePaths(): readonly string[] {
    return [...this.#resources.keys()].sort(compareUtf8);
  }

  resourceForPackageUri(referrerPath: string, uri: string): {
    readonly path: string;
    readonly file: StudioBg3dImportFile;
  } {
    const path = this.#resolvePackagePath(referrerPath, uri);
    const file = this.#resources.get(path);
    if (!file) throw importError("missing-resource");
    return { path, file };
  }

  resourceForUri(uri: string): {
    readonly path: string;
    readonly file: StudioBg3dImportFile;
  } {
    const path = this.#resolvePath(uri);
    const file = this.#resources.get(path);
    if (!file) throw importError("missing-resource");
    return { path, file };
  }

  approveInlineUri(uri: string): void {
    this.#approvedInlineUris.add(uri);
  }

  urlForUri = (uri: string): string => {
    if (uri.startsWith("data:")) {
      if (!this.#approvedInlineUris.has(uri)) throw importError("unsafe-resource-uri");
      return uri;
    }
    if (uri.startsWith("blob:") && this.#ownedObjectUrls.has(uri)) return uri;
    if (SCHEME_PATTERN.test(uri) || uri.startsWith("//")) throw importError("unsafe-resource-uri");
    const path = this.#resolvePath(uri);
    return this.#urlForCanonicalPath(path);
  };

  urlForCanonicalPath(path: string): string {
    if (!this.#resources.has(path)) throw importError("missing-resource");
    return this.#urlForCanonicalPath(path);
  }

  #urlForCanonicalPath(path: string): string {
    const existing = this.#objectUrlByPath.get(path);
    if (existing) return existing;
    if (typeof URL?.createObjectURL !== "function") throw importError("environment-unsupported");
    const file = this.#resources.get(path);
    if (!file) throw importError("missing-resource");
    const objectUrl = URL.createObjectURL(file);
    this.#objectUrlByPath.set(path, objectUrl);
    this.#ownedObjectUrls.add(objectUrl);
    return objectUrl;
  }

  dispose(): void {
    for (const objectUrl of this.#ownedObjectUrls) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Revocation is best-effort, but one browser failure must not strand the remaining URLs.
      }
    }
    this.#ownedObjectUrls.clear();
    this.#objectUrlByPath.clear();
    this.#approvedInlineUris.clear();
  }

  #resolvePath(uri: string): string {
    if (SCHEME_PATTERN.test(uri) || uri.startsWith("//")) throw importError("unsafe-resource-uri");
    const normalized = safeDecodeUriPath(uri);
    const candidates = [`${this.#primaryDirectory}${normalized}`, normalized];
    for (const candidate of candidates) {
      const exact = this.#resources.has(candidate)
        ? candidate
        : this.#pathByFoldedPath.get(candidate.toLocaleLowerCase("en-US"));
      if (exact) return exact;
    }
    const baseName = normalized.slice(normalized.lastIndexOf("/") + 1).toLocaleLowerCase("en-US");
    const uniquePath = this.#uniquePathByFoldedBaseName.get(baseName);
    if (uniquePath) return uniquePath;
    throw importError("missing-resource");
  }

  #resolvePackagePath(referrerPath: string, uri: string): string {
    const raw = uri.trim();
    if (
      !raw
      || raw.length > 1_024
      || raw.startsWith("/")
      || raw.startsWith("//")
      || raw.includes("\\")
      || raw.includes("?")
      || raw.includes("#")
      || containsControlCharacter(raw)
      || SCHEME_PATTERN.test(raw)
      || ENCODED_SEPARATOR_PATTERN.test(raw)
    ) throw importError("unsafe-resource-uri");

    let decoded: string;
    try {
      decoded = decodeURIComponent(raw).normalize("NFC");
    } catch {
      throw importError("unsafe-resource-uri");
    }
    if (
      !decoded
      || decoded.startsWith("/")
      || decoded.startsWith("//")
      || decoded.includes("\\")
      || decoded.includes("?")
      || decoded.includes("#")
      || containsControlCharacter(decoded)
      || SCHEME_PATTERN.test(decoded)
    ) throw importError("unsafe-resource-uri");

    const segments = referrerPath.split("/").slice(0, -1);
    for (const segment of decoded.split("/")) {
      if (!segment || segment === ".") continue;
      if (segment === "..") {
        if (segments.length <= this.#packageRootDepth) throw importError("unsafe-resource-uri");
        segments.pop();
      } else {
        segments.push(segment);
      }
    }
    const relative = this.#canonicalPathForCandidate(segments.join("/"));
    if (relative) return relative;

    if (!decoded.includes("..")) {
      const direct = this.#canonicalPathForCandidate(
        decoded.split("/").filter((segment) => segment && segment !== ".").join("/"),
      );
      if (direct) return direct;
    }
    throw importError("missing-resource");
  }

  #canonicalPathForCandidate(candidate: string): string | null {
    if (!candidate) return null;
    if (this.#resources.has(candidate)) return candidate;
    return this.#pathByFoldedPath.get(candidate.toLocaleLowerCase("en-US")) ?? null;
  }
}

interface TrackedLoadingManager {
  readonly manager: THREE.LoadingManager;
  waitForIdle(signal?: AbortSignal): Promise<void>;
}

async function createTrackedLoadingManager(
  resolver: LocalResourceResolver,
): Promise<TrackedLoadingManager> {
  const { LoadingManager } = await import("three");
  const manager = new LoadingManager();
  let started = false;
  let settled = false;
  let failed = false;
  let settle: (() => void) | null = null;
  const idle = new Promise<void>((resolve) => {
    settle = resolve;
  });
  manager.setURLModifier(resolver.urlForUri);
  manager.onStart = () => {
    started = true;
  };
  manager.onLoad = () => {
    settled = true;
    settle?.();
  };
  manager.onError = () => {
    failed = true;
    settled = true;
    settle?.();
  };
  return {
    manager,
    async waitForIdle(signal) {
      throwIfAborted(signal);
      await Promise.resolve();
      if (!started || settled) {
        if (failed) throw importError("missing-resource");
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const handleAbort = () => reject(importError("aborted"));
        signal?.addEventListener("abort", handleAbort, { once: true });
        if (signal?.aborted) handleAbort();
        void idle.then(() => {
          signal?.removeEventListener("abort", handleAbort);
          resolve();
        });
      });
      if (failed) throw importError("missing-resource");
      throwIfAborted(signal);
    },
  };
}

async function readBytes(
  file: StudioBg3dImportFile,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  throwIfAborted(signal);
  try {
    const result = await file.arrayBuffer();
    throwIfAborted(signal);
    if (!(result instanceof ArrayBuffer) || result.byteLength !== file.size) throw importError("parse-failed");
    return result;
  } catch (error) {
    if (error instanceof StudioBg3dModelImportError) throw error;
    throw importError("parse-failed");
  }
}

async function readUtf8(
  file: StudioBg3dImportFile,
  signal?: AbortSignal,
): Promise<string> {
  if (file.size > STUDIO_BG3D_IMPORT_MAX_TEXT_BYTES) throw importError("file-too-large");
  const bytes = await readBytes(file, signal);
  return decodeUtf8(bytes, signal);
}

function decodeUtf8(bytes: ArrayBuffer, signal?: AbortSignal): string {
  throwIfAborted(signal);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw importError("invalid-text");
  }
}

interface ImportedImageDimensions {
  readonly width: number;
  readonly height: number;
}

function importedPngDimensions(bytes: Uint8Array): ImportedImageDimensions | null {
  if (
    bytes.byteLength < 24 ||
    ![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    )
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return width > 0 && height > 0 ? { width, height } : null;
}

function importedImageDimensions(
  extension: string,
  bytes: Uint8Array,
): ImportedImageDimensions | null {
  if (extension === "png") return importedPngDimensions(bytes);
  try {
    if (extension === "jpg" || extension === "jpeg") {
      return inspectStrictJpegDimensions(bytes);
    }
    if (extension === "webp") return inspectStrictStaticWebpDimensions(bytes);
  } catch {
    return null;
  }
  return null;
}

async function preflightCompanionImageMemory(
  resources: ReadonlyMap<string, StudioBg3dImportFile>,
  signal?: AbortSignal,
): Promise<number> {
  let decodedBytes = 0;
  for (const [path, file] of resources) {
    const extension = extensionOf(path);
    if (extension !== "png" && extension !== "jpg" && extension !== "jpeg" && extension !== "webp") {
      continue;
    }
    const dimensions = importedImageDimensions(
      extension,
      new Uint8Array(await readBytes(file, signal)),
    );
    if (!dimensions) throw importError("invalid-image");
    if (
      dimensions.width > STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION ||
      dimensions.height > STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION
    ) {
      throw importError("image-dimension-too-large");
    }
    const imageBytes = dimensions.width * dimensions.height * 4;
    if (
      !Number.isSafeInteger(imageBytes) ||
      decodedBytes > STUDIO_BG3D_IMPORT_MAX_DECODED_IMAGE_BYTES - imageBytes
    ) {
      throw importError("image-memory-too-large");
    }
    decodedBytes += imageBytes;
  }
  return decodedBytes;
}

interface ParsedInlineResource {
  readonly mimeType: string;
  readonly payload: string;
  readonly decodedByteLength: number;
}

function isBase64CodeUnit(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a)
    || (code >= 0x61 && code <= 0x7a)
    || (code >= 0x30 && code <= 0x39)
    || code === 0x2b
    || code === 0x2f
  );
}

/** Validates strict, unescaped base64 and computes its size without materializing decoded bytes. */
function parseInlineResourceUri(
  uri: string,
  expectedKind: "buffer" | "image",
  signal?: AbortSignal,
): ParsedInlineResource {
  const prefix = SAFE_DATA_URI_PREFIX_PATTERN.exec(uri);
  if (!prefix || typeof prefix[1] !== "string") throw importError("unsafe-resource-uri");
  const mimeType = prefix[1].toLowerCase();
  if (
    (expectedKind === "buffer" && !mimeType.startsWith("application/"))
    || (expectedKind === "image" && !mimeType.startsWith("image/"))
  ) {
    throw importError("unsafe-resource-uri");
  }
  const payload = uri.slice(prefix[0].length);
  if (payload.length === 0 || payload.length % 4 !== 0) throw importError("unsafe-resource-uri");
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const contentLength = payload.length - padding;
  for (let index = 0; index < contentLength; index += 1) {
    if ((index & 0x3fff) === 0) throwIfAborted(signal);
    if (!isBase64CodeUnit(payload.charCodeAt(index))) throw importError("unsafe-resource-uri");
  }
  for (let index = contentLength; index < payload.length; index += 1) {
    if (payload.charCodeAt(index) !== 0x3d) throw importError("unsafe-resource-uri");
  }
  const decodedByteLength = (payload.length / 4) * 3 - padding;
  if (
    !Number.isSafeInteger(decodedByteLength)
    || decodedByteLength <= 0
    || decodedByteLength > STUDIO_BG3D_IMPORT_MAX_INLINE_RESOURCE_BYTES
  ) {
    throw importError("inline-resource-too-large");
  }
  return { mimeType, payload, decodedByteLength };
}

function base64Value(code: number): number {
  if (code >= 0x41 && code <= 0x5a) return code - 0x41;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61 + 26;
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 52;
  return code === 0x2b ? 62 : 63;
}

/** Decodes only already-validated, individually capped inline resources. */
function decodeInlineResource(
  resource: ParsedInlineResource,
  signal?: AbortSignal,
): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(resource.decodedByteLength);
  let outputOffset = 0;
  for (let offset = 0; offset < resource.payload.length; offset += 4) {
    if ((offset & 0xffff) === 0) throwIfAborted(signal);
    const first = base64Value(resource.payload.charCodeAt(offset));
    const second = base64Value(resource.payload.charCodeAt(offset + 1));
    const thirdCode = resource.payload.charCodeAt(offset + 2);
    const fourthCode = resource.payload.charCodeAt(offset + 3);
    const third = thirdCode === 0x3d ? 0 : base64Value(thirdCode);
    const fourth = fourthCode === 0x3d ? 0 : base64Value(fourthCode);
    if (outputOffset < output.length) output[outputOffset++] = (first << 2) | (second >> 4);
    if (outputOffset < output.length) output[outputOffset++] = ((second & 0x0f) << 4) | (third >> 2);
    if (outputOffset < output.length) output[outputOffset++] = ((third & 0x03) << 6) | fourth;
  }
  return output;
}

function rejectJsonGltfMeshoptBufferViews(root: Record<string, unknown>): void {
  const bufferViews = root.bufferViews;
  if (bufferViews === undefined) return;
  if (!Array.isArray(bufferViews)) throw importError("parse-failed");
  for (const bufferView of bufferViews) {
    if (!isRecord(bufferView)) throw importError("parse-failed");
    const extensions = bufferView.extensions;
    if (extensions === undefined) continue;
    if (!isRecord(extensions)) throw importError("parse-failed");
    if (JSON_GLTF_MESHOPT_EXTENSIONS.some((extension) => Object.hasOwn(extensions, extension))) {
      throw importError("unsupported-extension");
    }
  }
}

function optionalGltfArray(
  root: Record<string, unknown>,
  key: string,
): readonly unknown[] {
  const value = root[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw importError("parse-failed");
  return value;
}

function preflightJsonGltf(
  root: unknown,
  resolver: LocalResourceResolver,
  signal?: AbortSignal,
  companionDecodedImageBytes = 0,
): void {
  if (!isRecord(root)) throw importError("parse-failed");
  const candidate = root as {
    readonly asset?: { readonly version?: unknown };
    readonly extensionsRequired?: unknown;
  };
  if (candidate.asset?.version !== "2.0") throw importError("parse-failed");
  rejectJsonGltfMeshoptBufferViews(root);
  const extensionsRequired = candidate.extensionsRequired;
  if (extensionsRequired !== undefined && !Array.isArray(extensionsRequired)) {
    throw importError("parse-failed");
  }
  for (const extension of extensionsRequired ?? []) {
    if (typeof extension !== "string") throw importError("parse-failed");
    if (UNSUPPORTED_REQUIRED_GLTF_EXTENSIONS.has(extension)) throw importError("unsupported-extension");
  }

  const nodes = optionalGltfArray(root, "nodes");
  if (nodes.length > STUDIO_BG3D_IMPORT_MAX_NODES) throw importError("node-budget-exceeded");
  const meshes = optionalGltfArray(root, "meshes");
  if (meshes.length > STUDIO_BG3D_IMPORT_MAX_MESHES) throw importError("mesh-budget-exceeded");
  const accessors = optionalGltfArray(root, "accessors");
  if (accessors.length > STUDIO_BG3D_IMPORT_MAX_GLTF_TABLE_ENTRIES) {
    throw importError("vertex-budget-exceeded");
  }
  for (const [key, limit, code] of [
    ["animations", 128, "mesh-budget-exceeded"],
    ["bufferViews", STUDIO_BG3D_IMPORT_MAX_GLTF_TABLE_ENTRIES, "geometry-memory-too-large"],
    ["cameras", 64, "node-budget-exceeded"],
    ["materials", STUDIO_BG3D_IMPORT_MAX_MATERIAL_RECORDS, "mesh-budget-exceeded"],
    ["samplers", STUDIO_BG3D_IMPORT_MAX_RESOURCE_RECORDS, "image-memory-too-large"],
    ["scenes", 128, "node-budget-exceeded"],
    ["skins", 128, "node-budget-exceeded"],
    ["textures", STUDIO_BG3D_IMPORT_MAX_RESOURCE_RECORDS, "image-memory-too-large"],
  ] as const) {
    if (optionalGltfArray(root, key).length > limit) throw importError(code);
  }
  const accessorCounts: number[] = [];
  let accessorElements = 0;
  for (let index = 0; index < accessors.length; index += 1) {
    if ((index & 0x3ff) === 0) throwIfAborted(signal);
    const accessor = accessors[index];
    if (!isRecord(accessor) || !Number.isSafeInteger(accessor.count) || (accessor.count as number) < 0) {
      throw importError("parse-failed");
    }
    const count = accessor.count as number;
    accessorElements = safeAddCount(accessorElements, count, "vertex-budget-exceeded");
    if (accessorElements > STUDIO_BG3D_IMPORT_MAX_ACCESSOR_ELEMENTS) {
      throw importError("vertex-budget-exceeded");
    }
    accessorCounts.push(count);
  }

  let primitiveCount = 0;
  let vertices = 0;
  let triangles = 0;
  for (let meshIndex = 0; meshIndex < meshes.length; meshIndex += 1) {
    throwIfAborted(signal);
    const mesh = meshes[meshIndex];
    if (!isRecord(mesh) || !Array.isArray(mesh.primitives)) throw importError("parse-failed");
    primitiveCount = safeAddCount(primitiveCount, mesh.primitives.length, "mesh-budget-exceeded");
    if (primitiveCount > STUDIO_BG3D_IMPORT_MAX_MESH_PRIMITIVES) {
      throw importError("mesh-budget-exceeded");
    }
    for (const primitive of mesh.primitives) {
      if (!isRecord(primitive) || !isRecord(primitive.attributes)) throw importError("parse-failed");
      const positionIndex = primitive.attributes.POSITION;
      if (
        !Number.isSafeInteger(positionIndex)
        || (positionIndex as number) < 0
        || (positionIndex as number) >= accessorCounts.length
      ) {
        throw importError("parse-failed");
      }
      const vertexCount = accessorCounts[positionIndex as number] ?? 0;
      vertices = safeAddCount(vertices, vertexCount, "vertex-budget-exceeded");
      if (vertices > STUDIO_BG3D_IMPORT_MAX_VERTICES) throw importError("vertex-budget-exceeded");

      const mode = primitive.mode === undefined ? 4 : primitive.mode;
      if (!Number.isSafeInteger(mode) || (mode as number) < 0 || (mode as number) > 6) {
        throw importError("parse-failed");
      }
      let elementCount = vertexCount;
      if (primitive.indices !== undefined) {
        if (
          !Number.isSafeInteger(primitive.indices)
          || (primitive.indices as number) < 0
          || (primitive.indices as number) >= accessorCounts.length
        ) {
          throw importError("parse-failed");
        }
        elementCount = accessorCounts[primitive.indices as number] ?? 0;
      }
      const primitiveTriangles = mode === 4
        ? Math.floor(elementCount / 3)
        : mode === 5 || mode === 6
          ? Math.max(0, elementCount - 2)
          : 0;
      triangles = safeAddCount(triangles, primitiveTriangles, "triangle-budget-exceeded");
      if (triangles > STUDIO_BG3D_IMPORT_MAX_TRIANGLES) {
        throw importError("triangle-budget-exceeded");
      }
    }
  }

  let inlineBytes = 0;
  let declaredBufferBytes = 0;
  const buffers = optionalGltfArray(root, "buffers");
  if (buffers.length > STUDIO_BG3D_IMPORT_MAX_RESOURCE_RECORDS) {
    throw importError("geometry-memory-too-large");
  }
  for (let index = 0; index < buffers.length; index += 1) {
    throwIfAborted(signal);
    const entry = buffers[index];
    if (
      !isRecord(entry)
      || !Number.isSafeInteger(entry.byteLength)
      || (entry.byteLength as number) <= 0
      || typeof entry.uri !== "string"
      || !entry.uri
    ) {
      // JSON glTF has no GLB BIN chunk, so every declared buffer must resolve locally.
      throw importError("parse-failed");
    }
    const declaredBytes = entry.byteLength as number;
    declaredBufferBytes = safeAddCount(
      declaredBufferBytes,
      declaredBytes,
      "geometry-memory-too-large",
    );
    if (declaredBufferBytes > STUDIO_BG3D_IMPORT_MAX_DECODED_GEOMETRY_BYTES) {
      throw importError("geometry-memory-too-large");
    }
    if (entry.uri.startsWith("data:")) {
      const inline = parseInlineResourceUri(entry.uri, "buffer", signal);
      if (inline.decodedByteLength < declaredBytes) throw importError("parse-failed");
      inlineBytes = safeAddCount(inlineBytes, inline.decodedByteLength, "inline-resource-too-large");
      if (inlineBytes > STUDIO_BG3D_IMPORT_MAX_INLINE_TOTAL_BYTES) {
        throw importError("inline-resource-too-large");
      }
      resolver.approveInlineUri(entry.uri);
    } else {
      const file = resolver.fileForUri(entry.uri);
      if (file.size < declaredBytes) throw importError("parse-failed");
    }
  }

  let decodedImageBytes = companionDecodedImageBytes;
  const images = optionalGltfArray(root, "images");
  if (images.length > STUDIO_BG3D_IMPORT_MAX_RESOURCE_RECORDS) {
    throw importError("image-memory-too-large");
  }
  for (let index = 0; index < images.length; index += 1) {
    throwIfAborted(signal);
    const entry = images[index];
    if (!isRecord(entry)) throw importError("parse-failed");
    if (typeof entry.uri !== "string" || !entry.uri) {
      // Buffer-view images require slicing and decoding arbitrary binary packages before the
      // canonical GLB validator can inspect them. Keep JSON glTF fail-closed at this boundary.
      throw importError("unsupported-extension");
    }
    if (entry.uri.startsWith("data:")) {
      const inline = parseInlineResourceUri(entry.uri, "image", signal);
      inlineBytes = safeAddCount(inlineBytes, inline.decodedByteLength, "inline-resource-too-large");
      if (inlineBytes > STUDIO_BG3D_IMPORT_MAX_INLINE_TOTAL_BYTES) {
        throw importError("inline-resource-too-large");
      }
      const extension = inline.mimeType.slice("image/".length);
      const dimensions = importedImageDimensions(
        extension,
        decodeInlineResource(inline, signal),
      );
      if (!dimensions) throw importError("invalid-image");
      if (
        dimensions.width > STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION
        || dimensions.height > STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION
      ) {
        throw importError("image-dimension-too-large");
      }
      const imageBytes = safeMultiplyCount(
        safeMultiplyCount(dimensions.width, dimensions.height, "image-memory-too-large"),
        4,
        "image-memory-too-large",
      );
      decodedImageBytes = safeAddCount(decodedImageBytes, imageBytes, "image-memory-too-large");
      if (decodedImageBytes > STUDIO_BG3D_IMPORT_MAX_DECODED_IMAGE_BYTES) {
        throw importError("image-memory-too-large");
      }
      resolver.approveInlineUri(entry.uri);
    } else {
      resolver.fileForUri(entry.uri);
    }
  }
}


type ParsedImport = StudioBg3dParsedExportCandidate;

async function parseGltfImport(
  item: StudioBg3dImportPlanItem,
  resolver: LocalResourceResolver,
  signal?: AbortSignal,
  companionDecodedImageBytes = 0,
): Promise<ParsedImport> {
  const source = item.format === "gltf"
    ? await readUtf8(item.primary, signal)
    : await readBytes(item.primary, signal);
  throwIfAborted(signal);
  if (typeof source === "string") {
    let root: unknown;
    try {
      root = JSON.parse(source) as unknown;
    } catch {
      throw importError("parse-failed");
    }
    preflightJsonGltf(root, resolver, signal, companionDecodedImageBytes);
  }
  return parseGlbSourceImport(source, resolver, signal);
}

/** Shared GLTFLoader tail for glTF/GLB sources — including GLB bytes produced by converters. */
async function parseGlbSourceImport(
  source: string | ArrayBuffer,
  resolver: LocalResourceResolver,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const tracked = await createTrackedLoadingManager(resolver);
  throwIfAborted(signal);
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  throwIfAborted(signal);
  const loader = new GLTFLoader(tracked.manager);
  let parsedRoot: THREE.Object3D | null = null;
  try {
    const gltf = await new Promise<import("three/examples/jsm/loaders/GLTFLoader.js").GLTF>((resolve, reject) => {
      loader.parse(source, "", resolve, () => reject(importError("parse-failed")));
    });
    throwIfAborted(signal);
    if (!gltf.scene) throw importError("parse-failed");
    parsedRoot = gltf.scene;
    await tracked.waitForIdle(signal);
    throwIfAborted(signal);
    return { root: parsedRoot, animations: gltf.animations };
  } catch (error) {
    if (parsedRoot) disposeStudioBg3dThreeResources(parsedRoot);
    throw error;
  }
}

/**
 * .skp(SketchUp) 가져오기: OpenSKP(MIT) 파사드로 브라우저에서 GLB로 변환한 뒤 기존 GLB
 * 경로로 합류한다. 변환 청크를 불러오지 못하거나 파서가 파일을 거부하면 전용 오류 코드로
 * 실패해 DAE·GLB 내보내기 대안을 안내한다 — 되는 척하는 대체 변환은 하지 않는다.
 */
async function parseSkpImport(
  item: StudioBg3dImportPlanItem,
  resolver: LocalResourceResolver,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const bytes = await readBytes(item.primary, signal);
  throwIfAborted(signal);
  let glb: Uint8Array;
  try {
    glb = await convertStudioBg3dSkpToGlb(bytes);
  } catch (error) {
    if (error instanceof StudioBg3dSkpConverterUnavailableError) {
      throw importError("skp-converter-unavailable");
    }
    if (error instanceof StudioBg3dSkpParseError) throw importError("skp-parse-failed");
    throw error;
  }
  throwIfAborted(signal);
  const glbBuffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
  return parseGlbSourceImport(glbBuffer, resolver, signal);
}

async function preflightObjBytesForImport(
  bytes: ArrayBuffer,
  executionBackend: StudioBg3dModelImportExecutionBackend,
  signal?: AbortSignal,
): Promise<StudioBg3dObjPreflightWorkerObjResult> {
  if (executionBackend === "worker") {
    try {
      return await preflightStudioBg3dObjBytesInWorker(bytes, { signal });
    } catch (error) {
      if (!(error instanceof StudioBg3dObjPreflightWorkerClientError)) throw error;
      throw mapObjPreflightFailure(error.code);
    }
  }
  if (bytes.byteLength > STUDIO_BG3D_IMPORT_DIRECT_MAX_BYTES) {
    throw importError("worker-required");
  }
  const {
    StudioBg3dObjPreflightWorkerRuntimeError,
    preflightStudioBg3dObjWorkerRequest,
  } = await import("./studio-bg3d-obj-preflight-worker-runtime");
  const directRequest: StudioBg3dObjPreflightWorkerObjRequest = {
    version: STUDIO_BG3D_OBJ_PREFLIGHT_WORKER_PROTOCOL_VERSION,
    kind: "preflight-obj",
    requestId: 1,
    generationId: 1,
    sourceByteLength: bytes.byteLength,
    bytes,
    budgets: STUDIO_BG3D_OBJ_PREFLIGHT_WORKER_BUDGETS,
  };
  try {
    const result = preflightStudioBg3dObjWorkerRequest(directRequest);
    if (result.kind !== "obj") throw importError("parse-failed");
    throwIfAborted(signal);
    return result;
  } catch (error) {
    if (error instanceof StudioBg3dObjPreflightWorkerRuntimeError) {
      throw mapObjPreflightFailure(error.code);
    }
    throw error;
  }
}

async function preflightMtlBytesForImport(
  materialLibraries: readonly StudioBg3dObjPreflightWorkerMtlEntry[],
  executionBackend: StudioBg3dModelImportExecutionBackend,
  signal?: AbortSignal,
): Promise<StudioBg3dObjPreflightWorkerMtlResult> {
  if (executionBackend === "worker") {
    try {
      return await preflightStudioBg3dMtlBytesInWorker(materialLibraries, { signal });
    } catch (error) {
      if (!(error instanceof StudioBg3dObjPreflightWorkerClientError)) throw error;
      throw mapObjPreflightFailure(error.code);
    }
  }
  const directInputBytes = materialLibraries.reduce(
    (total, entry) => safeAddCount(
      total,
      entry.sourceByteLength,
      "material-budget-exceeded",
    ),
    0,
  );
  if (directInputBytes > STUDIO_BG3D_IMPORT_DIRECT_MAX_BYTES) {
    throw importError("worker-required");
  }
  const {
    StudioBg3dObjPreflightWorkerRuntimeError,
    preflightStudioBg3dObjWorkerRequest,
  } = await import("./studio-bg3d-obj-preflight-worker-runtime");
  const directRequest: StudioBg3dObjPreflightWorkerMtlRequest = {
    version: STUDIO_BG3D_OBJ_PREFLIGHT_WORKER_PROTOCOL_VERSION,
    kind: "preflight-mtl",
    requestId: 1,
    generationId: 1,
    materialLibraries,
    budgets: STUDIO_BG3D_OBJ_PREFLIGHT_WORKER_BUDGETS,
  };
  try {
    const result = preflightStudioBg3dObjWorkerRequest(directRequest);
    if (result.kind !== "mtl") throw importError("parse-failed");
    throwIfAborted(signal);
    return result;
  } catch (error) {
    if (error instanceof StudioBg3dObjPreflightWorkerRuntimeError) {
      throw mapObjPreflightFailure(error.code);
    }
    throw error;
  }
}

async function parseObjImport(
  item: StudioBg3dImportPlanItem,
  resolver: LocalResourceResolver,
  executionBackend: StudioBg3dModelImportExecutionBackend,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  let bytes = await readBytes(item.primary, signal);
  const objPreflight = await preflightObjBytesForImport(bytes, executionBackend, signal);
  bytes = objPreflight.bytes;
  const materialLibraryReferences = objPreflight.materialLibraryReferences;
  const materialResources: Array<{
    readonly path: string;
    readonly file: StudioBg3dImportFile;
  }> = [];
  const seenMaterialPaths = new Set<string>();
  let totalMaterialBytes = 0;
  for (const reference of materialLibraryReferences) {
    let resources: readonly { readonly path: string; readonly file: StudioBg3dImportFile }[];
    try {
      resources = [resolver.resourceForPackageUri(item.primaryPath, reference)];
    } catch (error) {
      if (!(error instanceof StudioBg3dModelImportError) || error.code !== "missing-resource") {
        throw error;
      }
      const tokens = reference.split(/[\t ]+/u).filter(Boolean);
      if (tokens.length < 2) throw error;
      resources = tokens.map((token) => resolver.resourceForPackageUri(item.primaryPath, token));
    }
    for (const resource of resources) {
      if (extensionOf(resource.path) !== "mtl") throw importError("missing-resource");
      if (seenMaterialPaths.has(resource.path)) continue;
      seenMaterialPaths.add(resource.path);
      if (seenMaterialPaths.size > STUDIO_BG3D_IMPORT_MAX_OBJ_MATERIAL_LIBRARIES) {
        throw importError("material-budget-exceeded");
      }
      totalMaterialBytes = safeAddCount(
        totalMaterialBytes,
        resource.file.size,
        "material-budget-exceeded",
      );
      if (totalMaterialBytes > STUDIO_BG3D_IMPORT_MAX_OBJ_MTL_TOTAL_BYTES) {
        throw importError("material-budget-exceeded");
      }
      materialResources.push(resource);
    }
  }

  let materialLibraries: StudioBg3dObjWorkerMtlEntry[] = [];
  for (const resource of materialResources.sort((left, right) => compareUtf8(left.path, right.path))) {
    const materialBytes = await readBytes(resource.file, signal);
    materialLibraries.push({
      path: resource.path,
      sourceByteLength: materialBytes.byteLength,
      bytes: materialBytes,
    });
  }
  if (materialLibraries.length > 0) {
    const materialPreflight = await preflightMtlBytesForImport(
      materialLibraries,
      executionBackend,
      signal,
    );
    materialLibraries = materialPreflight.materialLibraries.map((entry) => ({
      path: entry.path,
      sourceByteLength: entry.sourceByteLength,
      bytes: entry.bytes,
    }));
  }

  const resourcePaths = resolver.canonicalResourcePaths();
  const directInputBytes = safeAddCount(
    bytes.byteLength,
    totalMaterialBytes,
    "material-budget-exceeded",
  );

  let result: StudioBg3dObjWorkerCanonicalResult;
  let root: THREE.Object3D | null = null;
  try {
    if (executionBackend === "worker") {
      try {
        result = await parseStudioBg3dObjInWorker({
          primaryPath: item.primaryPath,
          bytes,
          materialLibraries,
          resourcePaths,
        }, { signal });
      } catch (error) {
        if (!(error instanceof StudioBg3dObjWorkerClientError)) throw error;
        throw mapObjWorkerFailure(error.code);
      }
    } else {
      if (directInputBytes > STUDIO_BG3D_IMPORT_DIRECT_MAX_BYTES) {
        throw importError("worker-required");
      }
      const directRequest: StudioBg3dObjWorkerParseRequest = {
        version: STUDIO_BG3D_OBJ_WORKER_PROTOCOL_VERSION,
        kind: "parse",
        requestId: 1,
        generationId: 1,
        primaryPath: item.primaryPath,
        sourceByteLength: bytes.byteLength,
        bytes: bytes.slice(0),
        materialLibraries: materialLibraries.map((entry) => ({
          path: entry.path,
          sourceByteLength: entry.sourceByteLength,
          bytes: entry.bytes.slice(0),
        })),
        resourcePaths,
        budgets: STUDIO_BG3D_OBJ_WORKER_BUDGETS,
      };
      const {
        StudioBg3dObjWorkerRuntimeError,
        parseStudioBg3dObjWorkerRequest,
      } = await import("./studio-bg3d-obj-worker-runtime");
      let directResult: StudioBg3dObjWorkerCanonicalResult;
      try {
        directResult = await parseStudioBg3dObjWorkerRequest(directRequest);
      } catch (error) {
        if (error instanceof StudioBg3dObjWorkerRuntimeError) {
          throw mapObjWorkerFailure(error.code);
        }
        throw error;
      }
      const response = {
        version: STUDIO_BG3D_OBJ_WORKER_PROTOCOL_VERSION,
        kind: "result" as const,
        requestId: directRequest.requestId,
        generationId: directRequest.generationId,
        result: directResult,
      };
      if (!isStudioBg3dObjWorkerResponseForRequest(response, directRequest)) {
        throw importError("parse-failed");
      }
      result = response.result;
    }
    throwIfAborted(signal);
    for (const path of result.usedResourcePaths) resolver.fileForCanonicalPath(path);
    const tracked = await createTrackedLoadingManager(resolver);
    root = await hydrateStudioBg3dObjWorkerResult(result, {
      loadingManager: tracked.manager,
      signal,
      textureUrlForPath: (path) => resolver.urlForCanonicalPath(path),
    });
    await tracked.waitForIdle(signal);
    throwIfAborted(signal);
    return { root, animations: [] };
  } catch (error) {
    if (root) disposeStudioBg3dThreeResources(root);
    if (signal?.aborted) throw importError("aborted");
    throw error;
  }
}

function mapObjWorkerFailure(
  code: StudioBg3dObjWorkerFailureCode | StudioBg3dObjWorkerClientError["code"],
): StudioBg3dModelImportError {
  if (code === "aborted") return importError("aborted");
  if (
    code === "geometry-memory-too-large"
    || code === "material-budget-exceeded"
    || code === "mesh-budget-exceeded"
    || code === "missing-resource"
    || code === "node-budget-exceeded"
    || code === "triangle-budget-exceeded"
    || code === "unsafe-resource-uri"
    || code === "vertex-budget-exceeded"
  ) return importError(code);
  if (code === "parse-failed" || code === "protocol") return importError("parse-failed");
  return importError("worker-required");
}

function mapObjPreflightFailure(
  code:
    | StudioBg3dObjPreflightWorkerFailureCode
    | StudioBg3dObjPreflightWorkerClientError["code"],
): StudioBg3dModelImportError {
  if (code === "aborted") return importError("aborted");
  if (code === "invalid-text") return importError("invalid-text");
  if (
    code === "material-budget-exceeded"
    || code === "mesh-budget-exceeded"
    || code === "node-budget-exceeded"
    || code === "triangle-budget-exceeded"
    || code === "unsafe-resource-uri"
    || code === "vertex-budget-exceeded"
  ) return importError(code);
  if (code === "parse-failed" || code === "protocol") return importError("parse-failed");
  return importError("worker-required");
}

async function parseFbxImport(
  item: StudioBg3dImportPlanItem,
  resolver: LocalResourceResolver,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const bytes = await readBytes(item.primary, signal);
  const tracked = await createTrackedLoadingManager(resolver);
  throwIfAborted(signal);
  const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
  throwIfAborted(signal);
  let root: THREE.Group | null = null;
  try {
    root = new FBXLoader(tracked.manager).parse(bytes, "");
    throwIfAborted(signal);
    await tracked.waitForIdle(signal);
    throwIfAborted(signal);
    return { root, animations: root.animations };
  } catch (error) {
    if (root) disposeStudioBg3dThreeResources(root);
    throw error;
  }
}

async function parseDaeImport(
  item: StudioBg3dImportPlanItem,
  resolver: LocalResourceResolver,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const text = await readUtf8(item.primary, signal);
  const tracked = await createTrackedLoadingManager(resolver);
  throwIfAborted(signal);
  const { ColladaLoader } = await import("three/examples/jsm/loaders/ColladaLoader.js");
  throwIfAborted(signal);
  let root: THREE.Object3D | null = null;
  try {
    const collada = new ColladaLoader(tracked.manager).parse(text, "");
    throwIfAborted(signal);
    const scene = collada?.scene;
    if (!scene) throw importError("parse-failed");
    root = scene;
    await tracked.waitForIdle(signal);
    throwIfAborted(signal);
    return { root, animations: scene.animations };
  } catch (error) {
    if (root) disposeStudioBg3dThreeResources(root);
    throw error;
  }
}

async function parseStlOnMainThread(
  item: StudioBg3dImportPlanItem,
  bytes: ArrayBuffer,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const [{ Mesh, MeshStandardMaterial }, { STLLoader }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/STLLoader.js"),
  ]);
  throwIfAborted(signal);
  let geometry: THREE.BufferGeometry;
  try {
    geometry = new STLLoader().parse(bytes);
  } catch {
    throw importError("parse-failed");
  }
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  if (signal?.aborted) {
    geometry.dispose();
    throw importError("aborted");
  }
  const root = new Mesh(geometry, new MeshStandardMaterial({ color: 0xb8b8c2 }));
  root.name = modelBaseName(item.primaryPath);
  return { root, animations: [] };
}

async function parsePlyOnMainThread(
  item: StudioBg3dImportPlanItem,
  bytes: ArrayBuffer,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const [{ Mesh, MeshStandardMaterial, Points, PointsMaterial }, { PLYLoader }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/PLYLoader.js"),
  ]);
  throwIfAborted(signal);
  let geometry: THREE.BufferGeometry;
  try {
    geometry = new PLYLoader().parse(bytes);
  } catch {
    throw importError("parse-failed");
  }
  if (signal?.aborted) {
    geometry.dispose();
    throw importError("aborted");
  }
  const hasVertexColors = Boolean(geometry.getAttribute("color"));
  const hasMeshTopology = Boolean(geometry.index || geometry.getAttribute("normal"));
  if (hasMeshTopology) {
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    const root = new Mesh(geometry, new MeshStandardMaterial({
      color: 0xb8b8c2,
      vertexColors: hasVertexColors,
    }));
    root.name = modelBaseName(item.primaryPath);
    return { root, animations: [] };
  }
  const root = new Points(geometry, new PointsMaterial({
    color: 0xb8b8c2,
    size: 0.01,
    sizeAttenuation: true,
    vertexColors: hasVertexColors,
  }));
  root.name = modelBaseName(item.primaryPath);
  return { root, animations: [] };
}

function mapGeometryWorkerFailure(error: StudioBg3dGeometryWorkerClientError): StudioBg3dModelImportError {
  if (error.code === "aborted") return importError("aborted");
  if (
    error.code === "geometry-memory-too-large"
    || error.code === "triangle-budget-exceeded"
    || error.code === "vertex-budget-exceeded"
  ) return importError(error.code);
  if (error.code === "parse-failed" || error.code === "protocol") return importError("parse-failed");
  return importError("worker-required");
}

async function parsedImportFromCanonicalGeometry(
  item: StudioBg3dImportPlanItem,
  payload: StudioBg3dCanonicalGeometryPayload,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  if (
    !isStudioBg3dCanonicalGeometryPayload(payload, item.format === "stl" ? "stl" : "ply")
    || !hasValidStudioBg3dCanonicalGeometryNumbers(payload)
  ) throw importError("parse-failed");
  throwIfAborted(signal);
  const {
    BufferAttribute,
    BufferGeometry,
    Mesh,
    MeshStandardMaterial,
    Points,
    PointsMaterial,
  } = await import("three");
  throwIfAborted(signal);
  const geometry = new BufferGeometry();
  try {
    for (const attribute of payload.attributes) {
      geometry.setAttribute(
        attribute.name,
        new BufferAttribute(new Float32Array(attribute.buffer), attribute.itemSize, false),
      );
    }
    if (payload.index) {
      geometry.setIndex(new BufferAttribute(new Uint32Array(payload.index.buffer), 1, false));
    }
    const hasVertexColors = payload.attributes.some((attribute) => attribute.name === "color");
    if (payload.kind === "mesh") {
      const root = new Mesh(geometry, new MeshStandardMaterial({
        color: 0xb8b8c2,
        vertexColors: hasVertexColors,
      }));
      root.name = modelBaseName(item.primaryPath);
      return { root, animations: [] };
    }
    const root = new Points(geometry, new PointsMaterial({
      color: 0xb8b8c2,
      size: 0.01,
      sizeAttenuation: true,
      vertexColors: hasVertexColors,
    }));
    root.name = modelBaseName(item.primaryPath);
    return { root, animations: [] };
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

async function parseGeometryImport(
  item: StudioBg3dImportPlanItem & { readonly format: "ply" | "stl" },
  executionBackend: StudioBg3dModelImportExecutionBackend,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const bytes = await readBytes(item.primary, signal);
  if (executionBackend === "direct") {
    if (bytes.byteLength > STUDIO_BG3D_IMPORT_DIRECT_MAX_BYTES) {
      throw importError("worker-required");
    }
    return item.format === "stl"
      ? parseStlOnMainThread(item, bytes, signal)
      : parsePlyOnMainThread(item, bytes, signal);
  }
  try {
    const payload = await parseStudioBg3dGeometryInWorker(item.format, bytes, { signal });
    throwIfAborted(signal);
    return parsedImportFromCanonicalGeometry(item, payload, signal);
  } catch (error) {
    if (!(error instanceof StudioBg3dGeometryWorkerClientError)) throw error;
    throw mapGeometryWorkerFailure(error);
  }
}

async function parseStlImport(
  item: StudioBg3dImportPlanItem,
  executionBackend: StudioBg3dModelImportExecutionBackend,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  return parseGeometryImport(
    item as StudioBg3dImportPlanItem & { readonly format: "stl" },
    executionBackend,
    signal,
  );
}

async function parsePlyImport(
  item: StudioBg3dImportPlanItem,
  executionBackend: StudioBg3dModelImportExecutionBackend,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  return parseGeometryImport(
    item as StudioBg3dImportPlanItem & { readonly format: "ply" },
    executionBackend,
    signal,
  );
}

async function parse3dsImport(
  item: StudioBg3dImportPlanItem,
  resolver: LocalResourceResolver,
  signal?: AbortSignal,
): Promise<ParsedImport> {
  const bytes = await readBytes(item.primary, signal);
  const tracked = await createTrackedLoadingManager(resolver);
  throwIfAborted(signal);
  const { TDSLoader } = await import("three/examples/jsm/loaders/TDSLoader.js");
  throwIfAborted(signal);
  let root: THREE.Group | null = null;
  try {
    root = new TDSLoader(tracked.manager).parse(bytes, "");
    throwIfAborted(signal);
    await tracked.waitForIdle(signal);
    throwIfAborted(signal);
    return { root, animations: root.animations };
  } catch (error) {
    if (root) disposeStudioBg3dThreeResources(root);
    throw error;
  }
}

async function parsePlanItem(
  item: StudioBg3dImportPlanItem,
  resolver: LocalResourceResolver,
  executionBackend: StudioBg3dModelImportExecutionBackend,
  signal?: AbortSignal,
  companionDecodedImageBytes = 0,
): Promise<ParsedImport> {
  switch (item.format) {
    case "gltf":
      return parseGltfImport(item, resolver, signal, companionDecodedImageBytes);
    case "obj":
      return parseObjImport(item, resolver, executionBackend, signal);
    case "fbx":
      return parseFbxImport(item, resolver, signal);
    case "dae":
      return parseDaeImport(item, resolver, signal);
    case "stl":
      return parseStlImport(item, executionBackend, signal);
    case "ply":
      return parsePlyImport(item, executionBackend, signal);
    case "3ds":
      return parse3dsImport(item, resolver, signal);
    case "skp":
      return parseSkpImport(item, resolver, signal);
    case "glb":
      throw importError("parse-failed");
  }
}



function isLegacyPhongMaterial(material: THREE.Material): material is THREE.MeshPhongMaterial {
  return (material as THREE.MeshPhongMaterial).isMeshPhongMaterial === true;
}

/**
 * OBJ/MTL, FBX, COLLADA and 3DS loaders commonly produce MeshPhongMaterial. GLTFExporter can
 * approximate it but emits a browser warning for every material. Convert that known legacy PBR
 * boundary explicitly, preserving supported texture slots and a deterministic shininess ->
 * roughness approximation before export. Shared source materials remain shared after conversion.
 */
async function upgradeLegacyPhongMaterialsForGlb(root: THREE.Object3D): Promise<void> {
  const { MeshStandardMaterial } = await import("three");
  const converted = new Map<THREE.MeshPhongMaterial, THREE.MeshStandardMaterial>();

  const convert = (material: THREE.Material): THREE.Material => {
    if (!isLegacyPhongMaterial(material)) return material;
    const existing = converted.get(material);
    if (existing) return existing;
    const shininess = Number.isFinite(material.shininess) ? Math.max(0, material.shininess) : 30;
    const replacement = new MeshStandardMaterial({
      alphaMap: material.alphaMap,
      alphaTest: material.alphaTest,
      aoMap: material.aoMap,
      aoMapIntensity: material.aoMapIntensity,
      bumpMap: material.bumpMap,
      bumpScale: material.bumpScale,
      color: material.color,
      depthTest: material.depthTest,
      depthWrite: material.depthWrite,
      displacementBias: material.displacementBias,
      displacementMap: material.displacementMap,
      displacementScale: material.displacementScale,
      emissive: material.emissive,
      emissiveIntensity: material.emissiveIntensity,
      emissiveMap: material.emissiveMap,
      envMap: material.envMap,
      envMapRotation: material.envMapRotation,
      flatShading: material.flatShading,
      fog: material.fog,
      lightMap: material.lightMap,
      lightMapIntensity: material.lightMapIntensity,
      map: material.map,
      metalness: 0,
      normalMap: material.normalMap,
      normalMapType: material.normalMapType,
      normalScale: material.normalScale,
      opacity: material.opacity,
      roughness: Math.max(0.04, Math.min(1, Math.sqrt(2 / (shininess + 2)))),
      side: material.side,
      transparent: material.transparent,
      vertexColors: material.vertexColors,
      wireframe: material.wireframe,
    });
    replacement.name = material.name;
    replacement.alphaHash = material.alphaHash;
    replacement.alphaToCoverage = material.alphaToCoverage;
    replacement.colorWrite = material.colorWrite;
    replacement.depthFunc = material.depthFunc;
    replacement.dithering = material.dithering;
    replacement.forceSinglePass = material.forceSinglePass;
    replacement.premultipliedAlpha = material.premultipliedAlpha;
    replacement.shadowSide = material.shadowSide;
    replacement.toneMapped = material.toneMapped;
    replacement.userData = { ...material.userData };
    replacement.visible = material.visible;
    converted.set(material, replacement);
    return replacement;
  };

  root.traverse((object) => {
    const candidate = object as THREE.Object3D & {
      material?: THREE.Material | THREE.Material[];
    };
    if (!candidate.material) return;
    candidate.material = Array.isArray(candidate.material)
      ? candidate.material.map(convert)
      : convert(candidate.material);
  });

  // Material.dispose() does not dispose the texture slots reused by the replacement. The parsed
  // root now owns every replacement and the regular scene-resource disposer handles them later.
  for (const material of converted.keys()) material.dispose();
}

async function exportParsedImportToGlb(
  parsed: ParsedImport,
  sourcePath: string,
  signal?: AbortSignal,
): Promise<Bg3dModelUploadSource> {
  throwIfAborted(signal);
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  throwIfAborted(signal);
  await upgradeLegacyPhongMaterialsForGlb(parsed.root);
  throwIfAborted(signal);
  parsed.root.updateMatrixWorld(true);
  let exported: ArrayBuffer | object;
  try {
    exported = await new GLTFExporter().parseAsync(parsed.root, {
      animations: [...parsed.animations],
      binary: true,
      includeCustomExtensions: true,
      maxTextureSize: 8192,
      onlyVisible: false,
      truncateDrawRange: true,
    });
  } catch {
    throwIfAborted(signal);
    throw importError("export-failed");
  }
  throwIfAborted(signal);
  if (!(exported instanceof ArrayBuffer)) throw importError("export-failed");
  if (exported.byteLength <= 0) throw importError("export-failed");
  if (exported.byteLength > STUDIO_BG3D_IMPORT_MAX_FILE_BYTES) throw importError("output-too-large");
  const canonicalBytes = exported.slice(0);
  const name = `${modelBaseName(sourcePath)}.glb`;
  return Object.freeze({
    name,
    size: canonicalBytes.byteLength,
    type: "model/gltf-binary",
    async arrayBuffer() {
      return canonicalBytes.slice(0);
    },
  });
}

async function convertPlanItem(
  item: StudioBg3dImportPlanItem,
  resources: ReadonlyMap<string, StudioBg3dImportFile>,
  executionBackend: StudioBg3dModelImportExecutionBackend,
  signal: AbortSignal | undefined,
  companionDecodedImageBytes: number,
  preExportBudget: StudioBg3dGlbValidationBudget | undefined,
  onBeforeExport?: () => void,
): Promise<Bg3dModelUploadSource> {
  throwIfAborted(signal);
  if (item.format === "glb") return item.primary;
  const resolver = new LocalResourceResolver(resources, item.primaryPath);
  let parsed: ParsedImport | null = null;
  try {
    parsed = await parsePlanItem(
      item,
      resolver,
      executionBackend,
      signal,
      companionDecodedImageBytes,
    );
    throwIfAborted(signal);
    assertStudioBg3dPreExportBudgets(parsed, signal, preExportBudget);
    throwIfAborted(signal);
    onBeforeExport?.();
    throwIfAborted(signal);
    const exported = await exportParsedImportToGlb(parsed, item.primaryPath, signal);
    throwIfAborted(signal);
    return exported;
  } catch (error) {
    throwIfAborted(signal);
    if (error instanceof StudioBg3dModelImportError) throw error;
    throw importError("parse-failed");
  } finally {
    resolver.dispose();
    if (parsed) disposeStudioBg3dThreeResources(parsed.root);
  }
}

/**
 * Converts heterogeneous user files into the sole trusted persistence format: self-contained GLB.
 * GLB inputs pass through without copying here; every output still enters the existing hash,
 * container, extension, decoded-memory, and renderer-admission validation boundary afterwards.
 */
export async function convertStudioBg3dModelFilesToGlb(
  input: readonly StudioBg3dImportFile[],
  options: StudioBg3dModelImportOptions = {},
): Promise<readonly Bg3dModelUploadSource[]> {
  throwIfAborted(options.signal);
  const executionBackend = options.executionBackend ?? "worker";
  if (executionBackend !== "worker" && executionBackend !== "direct") {
    throw new TypeError("studio-bg3d-model-import:invalid-execution-backend");
  }
  const preExportBudget = resolvePreExportBudget(options);
  const plan = planStudioBg3dModelImports(input);
  options.onProgress?.({
    stage: "planning",
    completedModels: 0,
    totalModels: plan.items.length,
    sourceName: "",
  });
  throwIfAborted(options.signal);
  const converted: Bg3dModelUploadSource[] = [];
  let convertedOutputBytes = 0;
  let companionDecodedImageBytes = 0;
  if (plan.items.some((item) => item.format !== "glb")) {
    companionDecodedImageBytes = await preflightCompanionImageMemory(plan.resources, options.signal);
    throwIfAborted(options.signal);
  }
  for (let index = 0; index < plan.items.length; index += 1) {
    const item = plan.items[index];
    const progress = (stage: StudioBg3dImportProgressStage) => options.onProgress?.({
      stage,
      completedModels: index,
      totalModels: plan.items.length,
      sourceName: item.primary.name,
    });
    progress("reading");
    throwIfAborted(options.signal);
    if (
      item.format === "glb"
      && item.primary.size > STUDIO_BG3D_IMPORT_MAX_OUTPUT_TOTAL_BYTES - convertedOutputBytes
    ) {
      throw importError("output-total-too-large");
    }
    if (item.format !== "glb") progress("parsing");
    throwIfAborted(options.signal);
    const result = await convertPlanItem(
      item,
      plan.resources,
      executionBackend,
      options.signal,
      companionDecodedImageBytes,
      preExportBudget,
      item.format === "glb" ? undefined : () => progress("exporting"),
    );
    throwIfAborted(options.signal);
    if (result.size > STUDIO_BG3D_IMPORT_MAX_OUTPUT_TOTAL_BYTES - convertedOutputBytes) {
      throw importError("output-total-too-large");
    }
    convertedOutputBytes += result.size;
    converted.push(result);
    options.onProgress?.({
      stage: "ready",
      completedModels: index + 1,
      totalModels: plan.items.length,
      sourceName: item.primary.name,
    });
    throwIfAborted(options.signal);
  }
  throwIfAborted(options.signal);
  return Object.freeze(converted);
}
