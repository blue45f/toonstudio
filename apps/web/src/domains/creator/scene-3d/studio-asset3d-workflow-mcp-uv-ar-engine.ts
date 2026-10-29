/**
 * Studio 3D CustomWorkflow V2 노드 카탈로그/연결 검증·Generate3D 프리플라이트·MCP 에디터 브리지 v2·
 * UV 아틀라스 ORM 채널 언패커·iOS USDZ/Android AR Scene Viewer·10K 파티클 임베드·17-카테고리 모션 분류 엔진 —
 * VARCO 3D 심층 역공학 모듈 (6단계).
 *
 * `https://3d.varco.ai/_assets/index-0_QlvNS9.js`의 다음 핵심 서브시스템을 1:1 수식·상수 수준으로 역공학하여
 * ToonStudio 3D 인스펙터 워크벤치 및 포즈 스튜디오에 통합합니다:
 * 1. `catalogShim` (13개 노드 카탈로그) & `validateConnection` (포트 타입·meshKind·최대 연결 수 검증기)
 * 2. `measureImageMetadata` & `preflightGenerate3DRunInputsWithMetadata` & `computeRunBlockers` & `parseWorkflowNotRunnableBlockers`
 * 3. `useMcpBridge` (`PROTOCOL_VERSION = 2`, 지수 백오프 `2000..30000ms`, `deriveStatus`, 4족 보행 에이전트 가드, `classifySaveFailure`)
 * 4. `getOrmChannelImageUrl` / `UvMapViewerModal` (`ArrowLeft`/`ArrowRight` B/N/R/M 전환), `PBRViewerSceneManager` (`fit *= 1.8`),
 *    `EmbedSceneManager` (`PARTICLE_COUNT = 10000`, `fit *= 1.5`, `[x, -z, y]` 스왑), `createArExportApiUrl` / `createAndroidArUrl`
 * 5. `AnimationCategory` (17개 카테고리), `QUADRUPED_ANIMATION_KEYS` (22종), `EQUINE_ANIMATION_KEYS` (25종),
 *    `clipFamilyOfAnimationKey`, `searchAnimations` (한·영·일 루프 검색어 지원)
 */

// ============================================================================
// 1. CustomWorkflow V2 Node Catalog (13 Nodes) & Connection Validator
// ============================================================================

export type StudioAsset3dWorkflowPortDataType = "string" | "image" | "3d";
export type StudioAsset3dWorkflowMeshKind = "any" | "mesh" | "rigged";

export type StudioAsset3dWorkflowNodeType =
  | "TextInput"
  | "ImageInput"
  | "3DInput"
  | "Rigged3DInput"
  | "AIAssistant"
  | "GenerateImage"
  | "EditImage"
  | "Generate3D"
  | "Texture3D"
  | "Remesh"
  | "PBR"
  | "Rig"
  | "Animate";

export interface StudioAsset3dWorkflowInputPortSpec {
  readonly name: string;
  readonly role: "required" | "reference";
  readonly dataType: StudioAsset3dWorkflowPortDataType;
  readonly max: number;
  readonly meshKind: StudioAsset3dWorkflowMeshKind;
}

export interface StudioAsset3dWorkflowCatalogEntry {
  readonly kind: "input" | "action";
  readonly type: StudioAsset3dWorkflowNodeType;
  readonly category: "text" | "image" | "3d" | "animation";
  readonly label: string;
  readonly inputs: readonly StudioAsset3dWorkflowInputPortSpec[];
  readonly output: {
    readonly dataType: StudioAsset3dWorkflowPortDataType;
    readonly meshKind: StudioAsset3dWorkflowMeshKind;
  } | null;
}

/** Reverse-engineered from `catalogShim` (`index-0_QlvNS9.js` @ 4025719). */
export const STUDIO_ASSET3D_WORKFLOW_NODE_CATALOG: readonly StudioAsset3dWorkflowCatalogEntry[] =
  Object.freeze([
    Object.freeze({
      kind: "input",
      type: "TextInput",
      category: "text",
      label: "Text",
      inputs: Object.freeze([] as const),
      output: Object.freeze({ dataType: "string", meshKind: "any" }),
    }),
    Object.freeze({
      kind: "input",
      type: "ImageInput",
      category: "image",
      label: "Image",
      inputs: Object.freeze([] as const),
      output: Object.freeze({ dataType: "image", meshKind: "any" }),
    }),
    Object.freeze({
      kind: "input",
      type: "3DInput",
      category: "3d",
      label: "3D",
      inputs: Object.freeze([] as const),
      output: Object.freeze({ dataType: "3d", meshKind: "mesh" }),
    }),
    Object.freeze({
      kind: "input",
      type: "Rigged3DInput",
      category: "animation",
      label: "Rigged 3D",
      inputs: Object.freeze([] as const),
      output: Object.freeze({ dataType: "3d", meshKind: "rigged" }),
    }),
    Object.freeze({
      kind: "action",
      type: "AIAssistant",
      category: "text",
      label: "Generate Text",
      inputs: Object.freeze([
        { name: "prompt", role: "required", dataType: "string", max: 1, meshKind: "any" },
        { name: "referenceText", role: "reference", dataType: "string", max: 4, meshKind: "any" },
        { name: "reference", role: "reference", dataType: "image", max: 4, meshKind: "any" },
      ] as const),
      output: Object.freeze({ dataType: "string", meshKind: "any" }),
    }),
    Object.freeze({
      kind: "action",
      type: "GenerateImage",
      category: "image",
      label: "Generate Image",
      inputs: Object.freeze([
        { name: "prompt", role: "required", dataType: "string", max: 1, meshKind: "any" },
        { name: "reference", role: "reference", dataType: "image", max: 4, meshKind: "any" },
      ] as const),
      output: Object.freeze({ dataType: "image", meshKind: "any" }),
    }),
    Object.freeze({
      kind: "action",
      type: "EditImage",
      category: "image",
      label: "Edit Image",
      inputs: Object.freeze([
        { name: "sourceImage", role: "required", dataType: "image", max: 1, meshKind: "any" },
        { name: "referenceText", role: "reference", dataType: "string", max: 1, meshKind: "any" },
        { name: "reference", role: "reference", dataType: "image", max: 4, meshKind: "any" },
      ] as const),
      output: Object.freeze({ dataType: "image", meshKind: "any" }),
    }),
    Object.freeze({
      kind: "action",
      type: "Generate3D",
      category: "3d",
      label: "Generate 3D",
      inputs: Object.freeze([
        { name: "image", role: "required", dataType: "image", max: 1, meshKind: "any" },
      ] as const),
      output: Object.freeze({ dataType: "3d", meshKind: "mesh" }),
    }),
    Object.freeze({
      kind: "action",
      type: "Texture3D",
      category: "3d",
      label: "Texture 3D",
      inputs: Object.freeze([
        { name: "mesh", role: "required", dataType: "3d", max: 1, meshKind: "mesh" },
        { name: "sourceImage", role: "reference", dataType: "image", max: 1, meshKind: "any" },
      ] as const),
      output: Object.freeze({ dataType: "3d", meshKind: "mesh" }),
    }),
    Object.freeze({
      kind: "action",
      type: "Remesh",
      category: "3d",
      label: "Remesh",
      inputs: Object.freeze([
        { name: "mesh", role: "required", dataType: "3d", max: 1, meshKind: "mesh" },
      ] as const),
      output: Object.freeze({ dataType: "3d", meshKind: "mesh" }),
    }),
    Object.freeze({
      kind: "action",
      type: "PBR",
      category: "3d",
      label: "PBR",
      inputs: Object.freeze([
        { name: "mesh", role: "required", dataType: "3d", max: 1, meshKind: "mesh" },
      ] as const),
      output: Object.freeze({ dataType: "3d", meshKind: "mesh" }),
    }),
    Object.freeze({
      kind: "action",
      type: "Rig",
      category: "animation",
      label: "Rig",
      inputs: Object.freeze([
        { name: "mesh", role: "required", dataType: "3d", max: 1, meshKind: "mesh" },
      ] as const),
      output: Object.freeze({ dataType: "3d", meshKind: "rigged" }),
    }),
    Object.freeze({
      kind: "action",
      type: "Animate",
      category: "animation",
      label: "Animate",
      inputs: Object.freeze([
        { name: "mesh", role: "required", dataType: "3d", max: 1, meshKind: "rigged" },
      ] as const),
      output: null,
    }),
  ]);

export function findAsset3dWorkflowCatalogEntry(
  nodeType: string,
): StudioAsset3dWorkflowCatalogEntry | undefined {
  return STUDIO_ASSET3D_WORKFLOW_NODE_CATALOG.find((entry) => entry.type === nodeType);
}

/** Reverse-engineered from `validateConnection` (`index-0_QlvNS9.js` @ 4028074). */
export function validateAsset3dWorkflowConnection(params: {
  readonly nodes: ReadonlyArray<{ readonly id: string; readonly type?: string }>;
  readonly edges: ReadonlyArray<{
    readonly source: string;
    readonly target: string;
    readonly targetHandle?: string;
  }>;
  readonly candidate: {
    readonly source?: string | null;
    readonly target?: string | null;
    readonly sourceHandle?: string | null;
    readonly targetHandle?: string | null;
  };
}): { readonly ok: boolean; readonly reason: string | null } {
  const { nodes, edges, candidate } = params;
  if (
    !candidate.source ||
    !candidate.target ||
    !candidate.sourceHandle ||
    !candidate.targetHandle
  ) {
    return Object.freeze({ ok: false, reason: "Incomplete connection" });
  }
  if (candidate.source === candidate.target) {
    return Object.freeze({ ok: false, reason: "Cannot connect a node to itself" });
  }
  const srcNode = nodes.find((n) => n.id === candidate.source);
  const dstNode = nodes.find((n) => n.id === candidate.target);
  if (!srcNode || !dstNode) {
    return Object.freeze({ ok: false, reason: "Node not found" });
  }
  if (!srcNode.type || !dstNode.type) {
    return Object.freeze({ ok: false, reason: "Node type missing" });
  }
  const srcCat = findAsset3dWorkflowCatalogEntry(srcNode.type);
  const dstCat = findAsset3dWorkflowCatalogEntry(dstNode.type);
  if (!srcCat || !dstCat) {
    return Object.freeze({ ok: false, reason: "Catalog entry missing" });
  }
  if (dstCat.kind !== "action") {
    return Object.freeze({
      ok: false,
      reason: "Target must be an Action node — Inputs have no input ports",
    });
  }
  const port = dstCat.inputs.find((p) => p.name === candidate.targetHandle);
  if (!port) {
    return Object.freeze({
      ok: false,
      reason: `Port "${candidate.targetHandle}" is intrinsic-only (no external edges)`,
    });
  }
  if (!srcCat.output) {
    return Object.freeze({ ok: false, reason: "Source node has no output port" });
  }
  const srcType = srcCat.output.dataType;
  if (srcType !== port.dataType) {
    return Object.freeze({
      ok: false,
      reason: `Type mismatch: ${srcType} → ${port.dataType}`,
    });
  }
  if (
    srcType === "3d" &&
    port.meshKind !== "any" &&
    srcCat.output.meshKind !== port.meshKind
  ) {
    return Object.freeze({
      ok: false,
      reason:
        port.meshKind === "rigged"
          ? "Animate requires a rigged 3D (Rig output)"
          : "This port requires a regular 3D mesh (not a rigged output)",
    });
  }
  const currentCount = edges.filter(
    (e) => e.target === candidate.target && e.targetHandle === candidate.targetHandle,
  ).length;
  if (currentCount >= port.max) {
    return Object.freeze({
      ok: false,
      reason: `Port "${candidate.targetHandle}" is full (max ${port.max})`,
    });
  }
  return Object.freeze({ ok: true, reason: null });
}

// ============================================================================
// 2. Generate3D Run Preflight, RGBA Alpha Scanner & Blocker Analyzer
// ============================================================================

export const STUDIO_ASSET3D_WORKFLOW_PREFLIGHT_METRICS = Object.freeze({
  inputUpscaleMaxDimensionPx: 512,
  alphaScanMaxDimensionPx: 512,
  mcpProtocolVersion: 2,
  mcpReconnectMinMs: 2_000,
  mcpReconnectMaxMs: 30_000,
  quadrupedUnavailableMessage: "Quadruped rigging is temporarily unavailable to agents.",
});

/** Reverse-engineered from `measureImageMetadata` (`index-0_QlvNS9.js` @ 2494922). */
export function scanAsset3dRgbaTransparency(params: {
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly rgbaBytes: ArrayLike<number>;
  readonly checkTransparency: boolean;
}): {
  readonly maxDimension: number;
  readonly scanWidth: number;
  readonly scanHeight: number;
  readonly hasTransparency: boolean | null;
} {
  const maxDimension = Math.max(params.naturalWidth, params.naturalHeight);
  const scale =
    maxDimension > STUDIO_ASSET3D_WORKFLOW_PREFLIGHT_METRICS.alphaScanMaxDimensionPx
      ? STUDIO_ASSET3D_WORKFLOW_PREFLIGHT_METRICS.alphaScanMaxDimensionPx / maxDimension
      : 1;
  const scanWidth = Math.max(1, Math.round(params.naturalWidth * scale));
  const scanHeight = Math.max(1, Math.round(params.naturalHeight * scale));

  if (!params.checkTransparency) {
    return Object.freeze({
      maxDimension,
      scanWidth,
      scanHeight,
      hasTransparency: null,
    });
  }

  let hasTransparency = false;
  for (let i = 3; i < params.rgbaBytes.length; i += 4) {
    if (Number(params.rgbaBytes[i] ?? 255) < 255) {
      hasTransparency = true;
      break;
    }
  }
  return Object.freeze({
    maxDimension,
    scanWidth,
    scanHeight,
    hasTransparency,
  });
}

/** Reverse-engineered from `preflightGenerate3DRunInputsWithMetadata` (`index-0_QlvNS9.js`). */
export function evaluateAsset3dGenerate3dNodePreflight(params: {
  readonly nodeId: string;
  readonly useAlpha: boolean;
  readonly hasLicense: boolean;
  readonly isPlusAuthorized: boolean;
  readonly sourceNodeType: string | null;
  readonly imageMaxDimensionPx: number;
  readonly imageHasTransparency: boolean | null;
}): {
  readonly ok: boolean;
  readonly skipInputUpscale: boolean;
  readonly forceUseAlphaOff: boolean;
  readonly assignedDefaultLicense: "PRIVATE" | "CC_BY_4_0" | null;
  readonly errorKey: "error.transparentImageRequired" | null;
} {
  const isGeneratedSource =
    params.sourceNodeType === "GenerateImage" || params.sourceNodeType === "EditImage";
  const skipInputUpscale =
    isGeneratedSource ||
    params.imageMaxDimensionPx >
      STUDIO_ASSET3D_WORKFLOW_PREFLIGHT_METRICS.inputUpscaleMaxDimensionPx;
  const forceUseAlphaOff = isGeneratedSource && params.useAlpha;
  const assignedDefaultLicense = params.hasLicense
    ? null
    : params.isPlusAuthorized
      ? "PRIVATE"
      : "CC_BY_4_0";

  const blockedByOpaqueAlpha =
    !isGeneratedSource && params.useAlpha && params.imageHasTransparency === false;

  return Object.freeze({
    ok: !blockedByOpaqueAlpha,
    skipInputUpscale,
    forceUseAlphaOff,
    assignedDefaultLicense,
    errorKey: blockedByOpaqueAlpha ? "error.transparentImageRequired" : null,
  });
}

/** Reverse-engineered from `parseWorkflowNotRunnableBlockers` (`index-0_QlvNS9.js`). */
export function parseAsset3dNotRunnableError(
  errorMessage: string,
  isNodeBusyFn: (nodeId: string) => boolean = () => false,
): {
  readonly blockedNodeIds: readonly string[];
  readonly waitingNodeIds: readonly string[];
} | null {
  if (!errorMessage.startsWith("Flow not runnable:")) {
    return null;
  }
  const blocked = new Set<string>();
  const waiting = new Set<string>();

  for (const match of errorMessage.matchAll(/Node (\S+) not runnable/g)) {
    const id = match[1];
    if (id) {
      if (isNodeBusyFn(id)) {
        waiting.add(id);
      } else {
        blocked.add(id);
      }
    }
  }
  for (const match of errorMessage.matchAll(/(\S+) is busy in another Run/g)) {
    const id = match[1];
    if (id) {
      blocked.delete(id);
      waiting.add(id);
    }
  }
  if (blocked.size === 0 && waiting.size === 0) {
    return null;
  }
  return Object.freeze({
    blockedNodeIds: Object.freeze([...blocked]),
    waitingNodeIds: Object.freeze([...waiting]),
  });
}

// ============================================================================
// 3. MCP Editor Bridge v2 (Exponential Backoff, Status Derivation, Save Failure)
// ============================================================================

export type StudioAsset3dMcpNodeStatus =
  | "empty"
  | "running"
  | "pending"
  | "success"
  | "failure"
  | "mixed";

/** Reverse-engineered from `useMcpBridge` exponential reconnect backoff (`2000 -> 30000ms`). */
export function computeAsset3dMcpReconnectBackoffMs(failureAttemptIndex: number): number {
  const { mcpReconnectMinMs, mcpReconnectMaxMs } = STUDIO_ASSET3D_WORKFLOW_PREFLIGHT_METRICS;
  const exp = Math.max(0, Math.floor(failureAttemptIndex));
  return Math.min(mcpReconnectMinMs * Math.pow(2, exp), mcpReconnectMaxMs);
}

/** Reverse-engineered from `deriveStatus` (`index-0_QlvNS9.js` @ 4036300). */
export function deriveAsset3dMcpNodeOutputStatus(
  slotStatuses: readonly ("running" | "pending" | "success" | "failure")[],
): StudioAsset3dMcpNodeStatus {
  if (slotStatuses.length === 0) {
    return "empty";
  }
  if (slotStatuses.includes("running")) {
    return "running";
  }
  if (slotStatuses.includes("pending")) {
    return "pending";
  }
  if (slotStatuses.every((s) => s === "success")) {
    return "success";
  }
  if (slotStatuses.every((s) => s === "failure")) {
    return "failure";
  }
  return "mixed";
}

/** Reverse-engineered from `requestsQuadrupedRigging` (`index-0_QlvNS9.js`). */
export function requestsAsset3dQuadrupedRigging(
  riggingModeValues?: ReadonlyArray<{ readonly type: string; readonly value: string }> | null,
): boolean {
  return (
    riggingModeValues?.some((entry) => entry.type === "string" && entry.value === "quadruped") ===
    true
  );
}

/** Reverse-engineered from `classifySaveFailure` (`index-0_QlvNS9.js`). */
export function classifyAsset3dWorkflowSaveFailure(
  trpcCode: string | null | undefined,
  isTrpcError = true,
): "editor-lost" | "unreachable" | "access-denied" | "rejected" | "other" {
  if (!isTrpcError) {
    return "other";
  }
  if (trpcCode === "CONFLICT") {
    return "editor-lost";
  }
  if (trpcCode === null || trpcCode === undefined || trpcCode === "UNAUTHORIZED") {
    return "unreachable";
  }
  if (trpcCode === "NOT_FOUND" || trpcCode === "FORBIDDEN") {
    return "access-denied";
  }
  if (trpcCode === "BAD_REQUEST") {
    return "rejected";
  }
  return "other";
}

// ============================================================================
// 4. UV Atlas ORM Unpacker, PBR Channel Mask, Embed 10K Particles & AR Export
// ============================================================================

export type StudioAsset3dUvPreviewMode = "baseColor" | "normal" | "roughness" | "metallic";

/** Reverse-engineered from `getOrmChannelImageUrl` & `PBRViewerSceneManager.updateDisplay`. */
export function unpackAsset3dOrmChannelToGrayscaleRgba(
  ormRgba: ArrayLike<number>,
  channel: "occlusion" | "roughness" | "metallic",
): {
  readonly grayscaleRgba: Uint8ClampedArray;
  readonly channelMask: readonly [number, number, number];
} {
  const componentOffset = channel === "occlusion" ? 0 : channel === "roughness" ? 1 : 2;
  const channelMask: readonly [number, number, number] =
    channel === "occlusion"
      ? ([1, 0, 0] as const)
      : channel === "roughness"
        ? ([0, 1, 0] as const)
        : ([0, 0, 1] as const);

  const out = new Uint8ClampedArray(ormRgba.length);
  for (let i = 0; i <= ormRgba.length - 4; i += 4) {
    const val = Number(ormRgba[i + componentOffset] ?? 0);
    out[i] = val;
    out[i + 1] = val;
    out[i + 2] = val;
    out[i + 3] = 255;
  }
  return Object.freeze({ grayscaleRgba: out, channelMask });
}

/** Reverse-engineered from `UvMapViewerModal` ArrowLeft / ArrowRight navigation (`B / N / R / M`). */
export function stepAsset3dUvViewerChannelByArrowKey(
  availableModes: readonly StudioAsset3dUvPreviewMode[],
  currentMode: StudioAsset3dUvPreviewMode,
  key: "ArrowLeft" | "ArrowRight",
): {
  readonly nextMode: StudioAsset3dUvPreviewMode;
  readonly shortLabel: "B" | "N" | "R" | "M";
} {
  const safeModes: readonly StudioAsset3dUvPreviewMode[] =
    availableModes.length > 0 ? availableModes : ["baseColor"];
  const idx = Math.max(0, safeModes.indexOf(currentMode));
  const delta = key === "ArrowLeft" ? -1 : 1;
  const nextIdx = Math.min(safeModes.length - 1, Math.max(0, idx + delta));
  const nextMode = safeModes[nextIdx] ?? currentMode;
  const shortLabel =
    nextMode === "baseColor"
      ? "B"
      : nextMode === "normal"
        ? "N"
        : nextMode === "roughness"
          ? "R"
          : "M";
  return Object.freeze({ nextMode, shortLabel });
}

/** Reverse-engineered from `createArExportApiUrl` & `createAndroidArUrl` (`index-0_QlvNS9.js`). */
export function buildAsset3dArExportLinks(params: {
  readonly taskId: string;
  readonly glbOrUsdzUrl: string;
  readonly format?: "usdz" | "glb";
}): {
  readonly iosUsdzApiUrl: string;
  readonly androidSceneViewerIntentUrl: string;
} {
  const format = params.format ?? "usdz";
  const iosUsdzApiUrl = `/api/usdz?taskId=${encodeURIComponent(params.taskId)}&format=${format}`;
  const encodedFile = encodeURIComponent(params.glbOrUsdzUrl);
  const androidSceneViewerIntentUrl = `intent://arvr.google.com/scene-viewer/1.0?file=${encodedFile}&mode=ar_preferred#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${encodedFile};end;`;
  return Object.freeze({ iosUsdzApiUrl, androidSceneViewerIntentUrl });
}

/** Reverse-engineered from `EmbedSceneManager.onObjectLoaded` (`PARTICLE_COUNT = 10000`, `[x, -z, y]`). */
export function sampleAsset3dEmbedParticleTargets(params: {
  readonly sourcePositions3N: ArrayLike<number>;
  readonly particleCount?: number;
  readonly randomFn?: () => number;
}): Float32Array {
  const count = params.particleCount ?? 10_000;
  const rng = params.randomFn ?? Math.random;
  const vertexCount = Math.floor(params.sourcePositions3N.length / 3);
  const out = new Float32Array(count * 3);
  if (vertexCount === 0) {
    return out;
  }
  for (let i = 0; i < count; i += 1) {
    const dst = i * 3;
    const src = Math.floor(rng() * vertexCount) * 3;
    out[dst] = Number(params.sourcePositions3N[src] ?? 0);
    out[dst + 2] = Number(params.sourcePositions3N[src + 1] ?? 0);
    out[dst + 1] = -Number(params.sourcePositions3N[src + 2] ?? 0);
  }
  return out;
}

// ============================================================================
// 5. 17-Category Animation Catalog & Skeleton Clip Family Classifier
// ============================================================================

export const STUDIO_ASSET3D_ANIMATION_CATEGORIES = Object.freeze([
  "LOCOMOTION",
  "JUMP",
  "DANCE",
  "COMBAT",
  "ACROBATICS",
  "GESTURE",
  "POSE",
  "INTERACTION",
  "EMOTION",
  "SOCIAL",
  "SPORTS",
  "WALK",
  "TROT",
  "CANTER",
  "GALLOP",
  "IDLE",
  "ACTION",
] as const);

export type StudioAsset3dAnimationCategory =
  (typeof STUDIO_ASSET3D_ANIMATION_CATEGORIES)[number];

export type StudioAsset3dClipFamily = "humanoid" | "quadruped" | "equine";

const QUADRUPED_ANIMATION_KEYS = new Set([
  "dog_walk",
  "dog_backward_walk",
  "dog_trot",
  "dog_canter_left_lead",
  "dog_canter_right_lead",
  "dog_gallop_left_lead",
  "dog_gallop_right_lead",
  "dog_body_shake",
  "dog_stretch",
  "dog_lie_down",
  "dog_sit",
  "dog_death_front",
  "cat_walk",
  "cat_backward_walk",
  "cat_trot",
  "cat_canter_left_lead",
  "cat_canter_right_lead",
  "cat_gallop_left_lead",
  "cat_gallop_right_lead",
  "cat_idle_1",
  "cat_stand",
  "cat_stand_start_walk",
]);

const EQUINE_ANIMATION_KEYS = new Set([
  "horse_walk",
  "horse_walk_forward_start",
  "horse_backward_walk",
  "horse_trot",
  "horse_canter_left_lead",
  "horse_canter_right_lead",
  "horse_gallop_left_lead",
  "horse_gallop_right_lead",
  "horse_idle_1",
  "horse_stand",
  "horse_rear_up",
  "horse_death_front",
  "deer_walk",
  "deer_backward_walk",
  "deer_trot",
  "deer_canter_left_lead",
  "deer_canter_right_lead",
  "deer_gallop_left_lead",
  "deer_gallop_right_lead",
  "deer_bound_slow_left_lead",
  "deer_bound_slow_right_lead",
  "deer_bound_fast_left_lead",
  "deer_bound_fast_right_lead",
  "deer_idle_1",
  "deer_stand",
]);

const LOOPING_SEARCH_TERMS = new Set(["loop", "looping", "루프", "루핑", "ループ", "ルーピング"]);

/** Reverse-engineered from `clipFamilyOfAnimationKey` & `isLoopingAnimation` (`index-0_QlvNS9.js`). */
export function classifyAsset3dAnimationKey(animationKey: string): {
  readonly sourceKey: string;
  readonly isLooping: boolean;
  readonly clipFamily: StudioAsset3dClipFamily;
} {
  const isLooping = animationKey.endsWith("_looping");
  const sourceKey = isLooping ? animationKey.slice(0, -"_looping".length) : animationKey;
  const clipFamily: StudioAsset3dClipFamily = QUADRUPED_ANIMATION_KEYS.has(sourceKey)
    ? "quadruped"
    : EQUINE_ANIMATION_KEYS.has(sourceKey)
      ? "equine"
      : "humanoid";
  return Object.freeze({ sourceKey, isLooping, clipFamily });
}

/** Reverse-engineered from `searchAnimations` (`index-0_QlvNS9.js` @ 2505302). */
export function filterAsset3dAnimationCatalog<
  T extends { readonly key: string; readonly titleKo?: string; readonly category?: string },
>(
  items: readonly T[],
  query: string,
  loopingMode: boolean,
  categoryFilter = "ALL",
): readonly T[] {
  const normalizedQuery = query.toLowerCase().trim();
  const isLoopKeyword = LOOPING_SEARCH_TERMS.has(normalizedQuery);

  return items.filter((item) => {
    const info = classifyAsset3dAnimationKey(item.key);
    if (categoryFilter !== "ALL" && categoryFilter !== "POPULAR" && item.category !== categoryFilter) {
      return false;
    }
    if (isLoopKeyword) {
      return info.isLooping;
    }
    if (info.isLooping !== loopingMode) {
      return false;
    }
    if (normalizedQuery === "") {
      return true;
    }
    return (
      info.sourceKey.toLowerCase().includes(normalizedQuery) ||
      (item.titleKo?.toLowerCase().includes(normalizedQuery) ?? false)
    );
  });
}
