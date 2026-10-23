import type {
  StudioBg3dAssetMetadata,
  StudioBg3dAssetRightsReceipt,
} from "./bg3d/studio-bg3d-asset-metadata";
import type {
  StudioBg3dGlbMetrics,
  StudioBg3dGlbValidationResult,
} from "./bg3d/studio-bg3d-glb-validation";
import type { StudioBg3dObjWorkerCanonicalResult } from "./bg3d/studio-bg3d-obj-worker-protocol";
import type { StudioBg3dAttachmentRights } from "./bg3d/studio-bg3d-scene-document";
import { STUDIO_GENERIC_3D_SOURCE_FORMATS, type StudioGeneric3dSourceFormat } from "./generic-3d-model/studio-generic-3d-source-formats";
import type {
  StudioGeneric3dAdmissionMessageCode,
  StudioGeneric3dCapabilityDetailCode,
  StudioGeneric3dLimitationDetailCode,
} from "./studio-generic-3d-model-mode-codes";
import { resolveStudioBg3dGlbError } from "./status-i18n/studio-producer-error-i18n-glb";

export type {
  StudioGeneric3dAdmissionMessageCode,
  StudioGeneric3dCapabilityDetailCode,
  StudioGeneric3dLimitationDetailCode,
} from "./studio-generic-3d-model-mode-codes";

export { STUDIO_GENERIC_3D_SOURCE_FORMATS };
export type { StudioGeneric3dSourceFormat };
export type StudioGeneric3dClassification = "character" | "creature" | "prop";
export type StudioGeneric3dRigStatus = "skinned" | "rigged" | "static" | "unverified";
export type StudioGeneric3dAdmissionStatus = "ready" | "canonical-validation-pending" | "blocked";
export type StudioGeneric3dCapabilityAvailability = "available" | "limited" | "unavailable";
export type StudioGeneric3dCapabilityId =
  | "root-transform"
  | "part-transform"
  | "bone-pose"
  | "skinned-deformation"
  | "animation-playback"
  | "morph-expression"
  | "pose-proxy"
  | "material-editing"
  | "normal-map"
  | "surface-snap";

export type StudioGeneric3dLimitationCode =
  | "canonical-validation-pending"
  | "validation-blocked"
  | "static-no-deformation"
  | "single-part-model"
  | "part-transform-runtime-unavailable"
  | "missing-animation"
  | "missing-morph-targets"
  | "missing-mtl"
  | "normal-map-unknown"
  | "rights-review"
  | "commercial-use-restricted"
  | "team-share-restricted";

export interface StudioGeneric3dRightsEvidence {
  readonly source: "asset-metadata" | "scene-attachment" | "none";
  readonly status: "owned" | "licensed" | "public-domain" | "unknown";
  readonly commercialUse: boolean;
  readonly teamShareAllowed: boolean | null;
  readonly attributionRequired: boolean;
  readonly provider: string | null;
  readonly author: string | null;
  readonly license: string | null;
  readonly attribution: string | null;
  readonly reviewRequired: boolean;
}

export interface StudioGeneric3dStructuralEvidence {
  readonly nodes: number;
  readonly meshes: number;
  readonly parts: number;
  /** False when a renderer can inspect parts but the scene document cannot persist part transforms. */
  readonly partTransformsSupported: boolean;
  readonly materials: number;
  readonly textures: number;
  readonly triangles: number;
  readonly animations: number;
  readonly skins: number;
  readonly joints: number;
  readonly bones: number;
  readonly skinnedMeshes: number | null;
  readonly morphTargets: number;
  readonly normalMaps: number | null;
  readonly nodeNames: readonly string[];
}

export interface StudioGeneric3dAdmissionManifest {
  readonly status: StudioGeneric3dAdmissionStatus;
  readonly sourceValidation: "passed" | "blocked";
  readonly canonicalValidation: "passed" | "pending" | "blocked";
  readonly profile: "mobile" | "desktop" | null;
  readonly code: string;
  /** A4 D4 (R15): 표시 문구 대신 코드+params만 싣는다 — Panel이 리졸버로 해석한다. */
  readonly messageCode: StudioGeneric3dAdmissionMessageCode;
  readonly messageParams?: Readonly<Record<string, string>>;
  readonly contentHash: `sha256:${string}` | null;
  readonly byteSize: number | null;
}

export interface StudioGeneric3dCapability {
  readonly id: StudioGeneric3dCapabilityId;
  readonly availability: StudioGeneric3dCapabilityAvailability;
  /** A4 D4 (R15): 라벨은 id가 곧 코드라 리졸버 라벨 표가 소유하고, 상세는 코드+params만 싣는다. */
  readonly detailCode: StudioGeneric3dCapabilityDetailCode;
  readonly detailParams?: Readonly<Record<string, string>>;
}

export interface StudioGeneric3dLimitation {
  readonly code: StudioGeneric3dLimitationCode;
  readonly severity: "info" | "warning" | "blocking";
  /** A4 D4 (R15): 제목은 code가 곧 코드라 리졸버가 소유하고, 상세는 코드+params만 싣는다. */
  readonly detailCode: StudioGeneric3dLimitationDetailCode;
  readonly detailParams?: Readonly<Record<string, string>>;
}

export interface StudioGeneric3dModelManifest {
  readonly version: 1;
  readonly kind: "generic-3d-model";
  readonly isVrm: false;
  readonly name: string;
  readonly sourceFormat: StudioGeneric3dSourceFormat;
  readonly canonicalFormat: "glb";
  readonly convertedToCanonicalGlb: boolean;
  readonly classification: StudioGeneric3dClassification;
  readonly classificationSource: "manual" | "heuristic" | "fallback";
  readonly classificationConfidence: "high" | "medium" | "low";
  readonly rigStatus: StudioGeneric3dRigStatus;
  readonly structure: StudioGeneric3dStructuralEvidence;
  readonly admission: StudioGeneric3dAdmissionManifest;
  readonly rights: StudioGeneric3dRightsEvidence;
  readonly capabilities: readonly StudioGeneric3dCapability[];
  readonly limitations: readonly StudioGeneric3dLimitation[];
}

export interface StudioGeneric3dManifestHints {
  readonly classification?: StudioGeneric3dClassification;
  readonly tags?: readonly string[];
  readonly nodeNames?: readonly string[];
  /** Optional renderer scan evidence which is more precise than validator aggregate metrics. */
  readonly bones?: number;
  readonly skinnedMeshes?: number;
  readonly parts?: number;
  readonly partTransformsSupported?: boolean;
  readonly normalMaps?: number;
}

export interface StudioGeneric3dGlbManifestInput extends StudioGeneric3dManifestHints {
  readonly name: string;
  readonly sourceFormat?: "glb" | "gltf";
  readonly validation: StudioBg3dGlbValidationResult;
  readonly rights?: StudioGeneric3dRightsEvidence;
}

export interface StudioGeneric3dObjManifestInput extends StudioGeneric3dManifestHints {
  readonly name: string;
  readonly parsed: StudioBg3dObjWorkerCanonicalResult;
  /** OBJ Worker validation is only the first gate; the canonical exported GLB must also pass. */
  readonly canonicalValidation?: StudioBg3dGlbValidationResult;
  readonly rights?: StudioGeneric3dRightsEvidence;
}

/** Trusted persisted evidence after the canonical GLB validator and storage admission both pass. */
export interface StudioGeneric3dVerifiedManifestInput extends StudioGeneric3dManifestHints {
  readonly name: string;
  readonly sourceFormat: StudioGeneric3dSourceFormat;
  readonly profile: "mobile" | "desktop";
  readonly contentHash: `sha256:${string}`;
  readonly metrics: StudioBg3dGlbMetrics;
  readonly message?: string;
  readonly rights?: StudioGeneric3dRightsEvidence;
}

const SOURCE_FORMATS = new Set<string>(STUDIO_GENERIC_3D_SOURCE_FORMATS);
const MAX_TEXT_CODE_POINTS = 160;
const MAX_HINTS = 4_096;

const CAPABILITY_IDS: readonly StudioGeneric3dCapabilityId[] = Object.freeze([
  "root-transform",
  "part-transform",
  "bone-pose",
  "skinned-deformation",
  "animation-playback",
  "morph-expression",
  "pose-proxy",
  "material-editing",
  "normal-map",
  "surface-snap",
]);

function normalizeText(value: unknown, fallback: string | null = null): string | null {
  if (typeof value !== "string") return fallback;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return fallback;
  }
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!normalized || Array.from(normalized).length > MAX_TEXT_CODE_POINTS) return fallback;
  return normalized;
}

function normalizeNames(values: readonly string[] | undefined): readonly string[] {
  if (!Array.isArray(values) || values.length > MAX_HINTS) return Object.freeze([]);
  const names = new Set<string>();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) names.add(normalized);
  }
  return Object.freeze([...names]);
}

function safeCount(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

function optionalSafeCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function rightsText(value: unknown): string | null {
  return normalizeText(value);
}

const EMPTY_RIGHTS: StudioGeneric3dRightsEvidence = Object.freeze({
  source: "none",
  status: "unknown",
  commercialUse: false,
  teamShareAllowed: null,
  attributionRequired: false,
  provider: null,
  author: null,
  license: null,
  attribution: null,
  reviewRequired: true,
});

/** Links the searchable asset record to the generic model mode without copying local DB IDs. */
export function createStudioGeneric3dRightsFromAssetMetadata(
  metadata: Pick<StudioBg3dAssetMetadata, "rights">,
): StudioGeneric3dRightsEvidence {
  const rights: StudioBg3dAssetRightsReceipt = metadata.rights;
  return Object.freeze({
    source: "asset-metadata",
    status: rights.status,
    commercialUse: rights.commercialUse,
    teamShareAllowed: rights.teamShareAllowed,
    attributionRequired: false,
    provider: rightsText(rights.provider),
    author: rightsText(rights.author),
    license: rightsText(rights.license),
    attribution: null,
    reviewRequired: rights.status === "unknown",
  });
}

/** Links the persisted scene attachment receipt to the same renderer-neutral rights summary. */
export function createStudioGeneric3dRightsFromAttachment(
  rights: StudioBg3dAttachmentRights,
): StudioGeneric3dRightsEvidence {
  return Object.freeze({
    source: "scene-attachment",
    status: rights.status,
    commercialUse: rights.commercialUse,
    teamShareAllowed: null,
    attributionRequired: rights.attributionRequired,
    provider: null,
    author: null,
    license: rightsText(rights.licenseName),
    attribution: rightsText(rights.attribution),
    reviewRequired:
      rights.status === "unknown"
      || (rights.status === "licensed" && !rightsText(rights.licenseName))
      || (rights.attributionRequired && !rightsText(rights.attribution)),
  });
}

export function isStudioGeneric3dSourceFormat(
  value: unknown,
): value is StudioGeneric3dSourceFormat {
  return typeof value === "string" && SOURCE_FORMATS.has(value);
}

function foldedSearchText(input: {
  readonly name: string;
  readonly tags: readonly string[];
  readonly nodeNames: readonly string[];
}): string {
  return [input.name, ...input.tags, ...input.nodeNames]
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
}

function classify(input: {
  readonly name: string;
  readonly tags: readonly string[];
  readonly nodeNames: readonly string[];
  readonly manual?: StudioGeneric3dClassification;
}): Pick<
  StudioGeneric3dModelManifest,
  "classification" | "classificationSource" | "classificationConfidence"
> {
  if (input.manual) {
    return {
      classification: input.manual,
      classificationSource: "manual",
      classificationConfidence: "high",
    };
  }
  const search = foldedSearchText(input);
  const creature = /(?:creature|monster|dragon|animal|dog|cat|wolf|horse|bird|beast|크리처|몬스터|괴물|동물|용|고양이|강아지|늑대|말|새)/iu;
  const character = /(?:character|human|humanoid|person|avatar|woman|female|girl|man|male|boy|student|doctor|캐릭터|사람|인간|휴머노이드|여자|여성|소녀|남자|남성|소년|학생|의사)/iu;
  if (creature.test(search)) {
    return {
      classification: "creature",
      classificationSource: "heuristic",
      classificationConfidence: "medium",
    };
  }
  if (character.test(search)) {
    return {
      classification: "character",
      classificationSource: "heuristic",
      classificationConfidence: "medium",
    };
  }
  return {
    classification: "prop",
    classificationSource: "fallback",
    classificationConfidence: "low",
  };
}

function rigStatus(
  structure: StudioGeneric3dStructuralEvidence,
  admission: StudioGeneric3dAdmissionManifest,
): StudioGeneric3dRigStatus {
  if (admission.status === "blocked") return "unverified";
  if (structure.skins > 0 || (structure.skinnedMeshes ?? 0) > 0) return "skinned";
  if (structure.bones > 0 || structure.joints > 0) return "rigged";
  return "static";
}

function capability(
  id: StudioGeneric3dCapabilityId,
  availability: StudioGeneric3dCapabilityAvailability,
  detailCode: StudioGeneric3dCapabilityDetailCode,
  detailParams?: Readonly<Record<string, string>>,
): StudioGeneric3dCapability {
  return Object.freeze({
    id,
    availability,
    detailCode,
    ...(detailParams !== undefined ? { detailParams } : {}),
  });
}

function countParam(value: number): Readonly<Record<string, string>> {
  return { count: value.toLocaleString("ko-KR") };
}

function createCapabilities(
  structure: StudioGeneric3dStructuralEvidence,
  rig: StudioGeneric3dRigStatus,
  admission: StudioGeneric3dAdmissionManifest,
): readonly StudioGeneric3dCapability[] {
  if (admission.status !== "ready") {
    const reason: StudioGeneric3dCapabilityDetailCode = admission.status === "blocked"
      ? "blocked"
      : "pending";
    return Object.freeze(CAPABILITY_IDS.map((id) => capability(id, "unavailable", reason)));
  }

  const hasRig = rig === "skinned" || rig === "rigged";
  return Object.freeze([
    capability("root-transform", "available", "rootTransform"),
    capability(
      "part-transform",
      structure.parts > 1 && structure.partTransformsSupported ? "available" : "unavailable",
      structure.parts > 1 && structure.partTransformsSupported
        ? "partAvailable"
        : structure.parts > 1
          ? "partNotStored"
          : "partSingle",
      structure.parts > 1 ? countParam(structure.parts) : undefined,
    ),
    capability(
      "bone-pose",
      hasRig ? "available" : "unavailable",
      hasRig ? "boneAvailable" : "boneUnavailable",
      hasRig ? countParam(structure.bones) : undefined,
    ),
    capability(
      "skinned-deformation",
      rig === "skinned" ? "available" : "unavailable",
      rig === "skinned" ? "skinnedAvailable" : "skinnedUnavailable",
    ),
    capability(
      "animation-playback",
      structure.animations > 0 ? "available" : "unavailable",
      structure.animations > 0 ? "animationAvailable" : "animationUnavailable",
      structure.animations > 0 ? countParam(structure.animations) : undefined,
    ),
    capability(
      "morph-expression",
      structure.morphTargets > 0 ? "available" : "unavailable",
      structure.morphTargets > 0 ? "morphAvailable" : "morphUnavailable",
      structure.morphTargets > 0 ? countParam(structure.morphTargets) : undefined,
    ),
    capability(
      "pose-proxy",
      hasRig ? "available" : "limited",
      hasRig
        ? "poseRig"
        : structure.parts > 1 && structure.partTransformsSupported
          ? "poseParts"
          : structure.parts > 1
            ? "poseGuideOnly"
            : "poseStatic",
    ),
    capability(
      "material-editing",
      structure.materials > 0 ? "available" : "unavailable",
      structure.materials > 0 ? "materialAvailable" : "materialUnavailable",
      structure.materials > 0 ? countParam(structure.materials) : undefined,
    ),
    capability(
      "normal-map",
      (structure.normalMaps ?? 0) > 0
        ? "available"
        : structure.normalMaps === null
          ? "limited"
          : "unavailable",
      (structure.normalMaps ?? 0) > 0
        ? "normalAvailable"
        : structure.normalMaps === null
          ? "normalUnknown"
          : "normalUnavailable",
    ),
    capability("surface-snap", "available", "surfaceSnap"),
  ]);
}

function limitation(
  code: StudioGeneric3dLimitationCode,
  severity: StudioGeneric3dLimitation["severity"],
  detailParams?: Readonly<Record<string, string>>,
): StudioGeneric3dLimitation {
  return Object.freeze({
    code,
    severity,
    detailCode: code,
    ...(detailParams !== undefined ? { detailParams } : {}),
  });
}

/** admission 표시 문구(패스스루 채널)를 limitation 상세 params로 옮긴다 — blocked admission은 항상 패스스루다. */
function admissionText(admission: StudioGeneric3dAdmissionManifest): string {
  return admission.messageParams?.text ?? "";
}

function createLimitations(input: {
  readonly structure: StudioGeneric3dStructuralEvidence;
  readonly rig: StudioGeneric3dRigStatus;
  readonly admission: StudioGeneric3dAdmissionManifest;
  readonly rights: StudioGeneric3dRightsEvidence;
  readonly sourceFormat: StudioGeneric3dSourceFormat;
}): readonly StudioGeneric3dLimitation[] {
  const result: StudioGeneric3dLimitation[] = [];
  if (input.admission.status === "blocked") {
    result.push(limitation("validation-blocked", "blocking", { text: admissionText(input.admission) }));
  } else if (input.admission.status === "canonical-validation-pending") {
    result.push(limitation("canonical-validation-pending", "blocking"));
  }
  if (input.rig === "static") {
    result.push(limitation("static-no-deformation", "info"));
  }
  if (input.structure.parts <= 1) {
    result.push(limitation("single-part-model", "info"));
  } else if (!input.structure.partTransformsSupported) {
    result.push(limitation("part-transform-runtime-unavailable", "info"));
  }
  if (input.structure.animations === 0) {
    result.push(limitation("missing-animation", "info"));
  }
  if (input.structure.morphTargets === 0) {
    result.push(limitation("missing-morph-targets", "info"));
  }
  if (input.sourceFormat === "obj") {
    result.push(limitation("missing-mtl", "warning"));
  }
  if (input.structure.normalMaps === null) {
    result.push(limitation("normal-map-unknown", "info"));
  }
  if (input.rights.reviewRequired) {
    result.push(limitation("rights-review", "warning"));
  }
  if (!input.rights.commercialUse) {
    result.push(limitation("commercial-use-restricted", "warning"));
  }
  if (input.rights.teamShareAllowed === false) {
    result.push(limitation("team-share-restricted", "warning"));
  }
  return Object.freeze(result);
}

function metricsStructure(
  metrics: StudioBg3dGlbMetrics | null,
  hints: StudioGeneric3dManifestHints,
): StudioGeneric3dStructuralEvidence {
  const nodeNames = normalizeNames(hints.nodeNames);
  const joints = safeCount(metrics?.joints);
  const parts = safeCount(hints.parts, safeCount(metrics?.meshes));
  return Object.freeze({
    nodes: safeCount(metrics?.nodes),
    meshes: safeCount(metrics?.meshes),
    parts,
    partTransformsSupported: hints.partTransformsSupported ?? parts > 1,
    materials: safeCount(metrics?.materials),
    textures: safeCount(metrics?.textures),
    triangles: safeCount(metrics?.triangles),
    animations: safeCount(metrics?.animations),
    skins: safeCount(metrics?.skins),
    joints,
    bones: safeCount(hints.bones, joints),
    skinnedMeshes: optionalSafeCount(hints.skinnedMeshes),
    morphTargets: safeCount(metrics?.morphTargets),
    normalMaps: optionalSafeCount(hints.normalMaps),
    nodeNames,
  });
}

function buildManifest(input: {
  readonly name: string;
  readonly sourceFormat: StudioGeneric3dSourceFormat;
  readonly structure: StudioGeneric3dStructuralEvidence;
  readonly admission: StudioGeneric3dAdmissionManifest;
  readonly rights: StudioGeneric3dRightsEvidence;
  readonly hints: StudioGeneric3dManifestHints;
}): StudioGeneric3dModelManifest {
  const name = normalizeText(input.name, "이름 없는 3D 모델")!;
  const tags = normalizeNames(input.hints.tags);
  const classification = classify({
    name,
    tags,
    nodeNames: input.structure.nodeNames,
    manual: input.hints.classification,
  });
  const rig = rigStatus(input.structure, input.admission);
  const capabilities = createCapabilities(input.structure, rig, input.admission);
  const limitations = createLimitations({
    structure: input.structure,
    rig,
    admission: input.admission,
    rights: input.rights,
    sourceFormat: input.sourceFormat,
  });
  return Object.freeze({
    version: 1,
    kind: "generic-3d-model",
    isVrm: false,
    name,
    sourceFormat: input.sourceFormat,
    canonicalFormat: "glb",
    convertedToCanonicalGlb: input.sourceFormat !== "glb",
    ...classification,
    rigStatus: rig,
    structure: input.structure,
    admission: input.admission,
    rights: input.rights,
    capabilities,
    limitations,
  });
}

function glbAdmission(validation: StudioBg3dGlbValidationResult): StudioGeneric3dAdmissionManifest {
  if (!validation.ok) {
    return Object.freeze({
      status: "blocked",
      sourceValidation: "blocked",
      canonicalValidation: "blocked",
      profile: null,
      code: validation.code,
      // A4 D4 (R11·R15): GLB 실패 문구는 검증자 코드라 이 경계에서 해석해 패스스루 params로 싣는 집계자 예외를 유지한다.
      messageCode: "passthrough" as const,
      messageParams: { text: resolveStudioBg3dGlbError(validation) },
      contentHash: null,
      byteSize: null,
    });
  }
  return Object.freeze({
    status: "ready",
    sourceValidation: "passed",
    canonicalValidation: "passed",
    profile: validation.profile,
    code: validation.code,
    messageCode: "passthrough" as const,
    messageParams: { text: validation.message },
    contentHash: validation.verifiedSha256,
    byteSize: validation.metrics.byteSize,
  });
}

export function createStudioGeneric3dGlbManifest(
  input: StudioGeneric3dGlbManifestInput,
): StudioGeneric3dModelManifest {
  if (
    input.sourceFormat !== undefined
    && input.sourceFormat !== "glb"
    && input.sourceFormat !== "gltf"
  ) {
    throw new TypeError("Generic 3D GLB manifests cannot use VRM or an unsupported source format.");
  }
  const admission = glbAdmission(input.validation);
  const structure = metricsStructure(input.validation.ok ? input.validation.metrics : null, input);
  return buildManifest({
    name: input.name,
    sourceFormat: input.sourceFormat ?? "glb",
    structure,
    admission,
    rights: input.rights ?? EMPTY_RIGHTS,
    hints: input,
  });
}

/**
 * Rebuilds the same capability document from a verified IndexedDB record without fabricating the
 * validator-owned byte snapshot required by `StudioBg3dGlbValidationSuccess`.
 */
export function createStudioGeneric3dVerifiedManifest(
  input: StudioGeneric3dVerifiedManifestInput,
): StudioGeneric3dModelManifest {
  if (!isStudioGeneric3dSourceFormat(input.sourceFormat)) {
    throw new TypeError("Verified generic 3D manifests cannot use VRM or an unsupported format.");
  }
  if (
    !/^sha256:[a-f0-9]{64}$/iu.test(input.contentHash)
    || input.metrics.byteSize < 1
    || (input.profile !== "mobile" && input.profile !== "desktop")
  ) {
    throw new TypeError("Verified generic 3D manifest evidence is invalid.");
  }
  const admission: StudioGeneric3dAdmissionManifest = Object.freeze({
    status: "ready",
    sourceValidation: "passed",
    canonicalValidation: "passed",
    profile: input.profile,
    code: "valid",
    messageCode: input.message !== undefined ? "passthrough" as const : "verifiedPassed" as const,
    ...(input.message !== undefined ? { messageParams: { text: input.message } } : {}),
    contentHash: input.contentHash,
    byteSize: input.metrics.byteSize,
  });
  return buildManifest({
    name: input.name,
    sourceFormat: input.sourceFormat,
    structure: metricsStructure(input.metrics, input),
    admission,
    rights: input.rights ?? EMPTY_RIGHTS,
    hints: input,
  });
}

function objHasMtl(parsed: StudioBg3dObjWorkerCanonicalResult): boolean {
  return parsed.materials.some(
    (material) => material.sourceMtlPath !== null && !material.synthesized,
  );
}

function objNormalMapCount(parsed: StudioBg3dObjWorkerCanonicalResult): number {
  return parsed.materials.reduce(
    (count, material) => count + (material.textures.some(
      (texture) => texture.slot === "normal" || texture.slot === "bump",
    ) ? 1 : 0),
    0,
  );
}

function objAdmission(
  validation: StudioBg3dGlbValidationResult | undefined,
): StudioGeneric3dAdmissionManifest {
  if (!validation) {
    return Object.freeze({
      status: "canonical-validation-pending",
      sourceValidation: "passed",
      canonicalValidation: "pending",
      profile: null,
      code: "canonical-validation-pending",
      messageCode: "objPending" as const,
      contentHash: null,
      byteSize: null,
    });
  }
  const canonical = glbAdmission(validation);
  return Object.freeze({
    ...canonical,
    sourceValidation: "passed",
  });
}

export function createStudioGeneric3dObjManifest(
  input: StudioGeneric3dObjManifestInput,
): StudioGeneric3dModelManifest {
  const canonicalMetrics = input.canonicalValidation?.ok
    ? input.canonicalValidation.metrics
    : null;
  const inferredParts = input.parsed.nodes.filter((node) => node.renderableIndex !== null).length;
  const structure: StudioGeneric3dStructuralEvidence = Object.freeze({
    nodes: safeCount(input.parsed.metrics.nodes),
    meshes: safeCount(input.parsed.metrics.meshes),
    parts: safeCount(input.parts, inferredParts),
    partTransformsSupported: input.partTransformsSupported ?? inferredParts > 1,
    materials: safeCount(input.parsed.metrics.materials),
    textures: new Set(input.parsed.materials.flatMap((material) =>
      material.textures.map((texture) => texture.resourcePath),
    )).size,
    triangles: safeCount(input.parsed.metrics.triangles),
    animations: safeCount(canonicalMetrics?.animations),
    skins: 0,
    joints: 0,
    bones: 0,
    skinnedMeshes: 0,
    morphTargets: 0,
    normalMaps: safeCount(input.normalMaps, objNormalMapCount(input.parsed)),
    nodeNames: normalizeNames([
      ...input.parsed.nodes.map((node) => node.name),
      ...(input.nodeNames ?? []),
    ]),
  });
  const sourceFormat: StudioGeneric3dSourceFormat = objHasMtl(input.parsed)
    ? "obj-mtl"
    : "obj";
  return buildManifest({
    name: input.name,
    sourceFormat,
    structure,
    admission: objAdmission(input.canonicalValidation),
    rights: input.rights ?? EMPTY_RIGHTS,
    hints: input,
  });
}

export function getStudioGeneric3dCapability(
  manifest: StudioGeneric3dModelManifest,
  id: StudioGeneric3dCapabilityId,
): StudioGeneric3dCapability {
  return manifest.capabilities.find((item) => item.id === id)
    ?? capability(id, "unavailable", "unknown");
}
