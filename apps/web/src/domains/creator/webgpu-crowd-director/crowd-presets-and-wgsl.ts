/**
 * Wave 38D — WebGPU 인스턴싱 기반 원근 군중 생성기의 8종 웹툰 프리셋·공유 계약·WGSL 셰이더 모듈.
 *
 * - 8종 웹툰 빈출 군중 프리셋(도심 횡단보도, 학교 복도, 경기장·콘서트, 판타지 기사단,
 *   중세 시장 골목, 만원 지하철, 카페 거리 테라스, 공항 출국장 로비).
 * - WebGPU `drawIndexedIndirect` 인스턴싱 컴퓨트 컬링 + 버텍스/프래그먼트 WGSL 셰이더(`CROWD_INSTANCING_WGSL`).
 * - Calm Atelier OKLCH 색공간 연산(원시 hex/rgb/hsl 0건 · BigInt 리터럴 0건).
 */

export type CrowdPresetId =
  | "crosswalk-rush"
  | "school-hallway"
  | "stadium-concert"
  | "fantasy-knights"
  | "medieval-market"
  | "crowded-subway"
  | "cafe-terrace"
  | "airport-lobby";

export type CrowdSpatialLayout =
  | "crosswalk-lanes"
  | "corridor-clusters"
  | "tiered-stadium"
  | "formation-ranks"
  | "narrow-alley"
  | "subway-aisle"
  | "terrace-tables"
  | "concourse-hall";

export type CrowdSilhouetteProp =
  | "briefcase-umbrella"
  | "school-bag"
  | "lightstick-cheer"
  | "spear-cape"
  | "hood-basket"
  | "handstrap-phone"
  | "coffee-seated"
  | "rolling-luggage";

export type CrowdFacingDirection = "front" | "left" | "right" | "back";

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export interface CrowdPresetSpec {
  readonly id: CrowdPresetId;
  readonly index: number;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly descriptionKo: string;
  readonly layout: CrowdSpatialLayout;
  readonly prop: CrowdSilhouetteProp;
  readonly defaultCount: number;
  readonly defaultHorizonRatio: number;
  readonly defaultVanishingX: number;
  readonly defaultFocalX: number;
  readonly defaultFocalY: number;
  readonly defaultFocalAttention: number;
  readonly defaultStrokeAttenuation: number;
  readonly nearDistanceM: number;
  readonly farDistanceM: number;
  readonly corridorHalfWidthRatio: number;
  readonly elevationSlope: number;
  readonly seatedRatio: number;
  readonly minSpacingM: number;
  readonly skyZenithOklch: OklchColor;
  readonly skyHorizonOklch: OklchColor;
  readonly groundFarOklch: OklchColor;
  readonly groundNearOklch: OklchColor;
  readonly inkNearOklch: OklchColor;
  readonly hazeFarOklch: OklchColor;
  readonly accentTintOklch: OklchColor;
}

export interface CrowdGenerationOptions {
  readonly presetId?: CrowdPresetId;
  readonly count?: number;
  readonly seed?: number;
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly horizonRatio?: number;
  readonly vanishingX?: number;
  readonly focalPointX?: number;
  readonly focalPointY?: number;
  readonly focalAttention?: number;
  readonly strokeAttenuation?: number;
  readonly nearStrokeWidthPx?: number;
  readonly farStrokeWidthPx?: number;
  readonly maxAtmosphericFade?: number;
}

export interface ResolvedCrowdGenerationOptions {
  readonly presetId: CrowdPresetId;
  readonly count: number;
  readonly seed: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly horizonRatio: number;
  readonly vanishingX: number;
  readonly focalPointX: number;
  readonly focalPointY: number;
  readonly focalAttention: number;
  readonly strokeAttenuation: number;
  readonly nearStrokeWidthPx: number;
  readonly farStrokeWidthPx: number;
  readonly maxAtmosphericFade: number;
}

export interface CrowdAgentInstance {
  readonly id: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
  readonly depth: number;
  readonly screenX: number;
  readonly screenY: number;
  readonly perspectiveScale: number;
  readonly heightFactor: number;
  readonly silhouetteHeightPx: number;
  readonly silhouetteWidthPx: number;
  readonly strokeWidthPx: number;
  readonly atmosphericFade: number;
  readonly opacity: number;
  readonly gazeAngleRad: number;
  readonly headYawRad: number;
  readonly bodyYawRad: number;
  readonly gazeAlignmentScore: number;
  readonly facing: CrowdFacingDirection;
  readonly lodTier: 0 | 1 | 2;
  readonly seated: boolean;
  readonly propVariant: 0 | 1 | 2;
  readonly stridePhase: number;
  readonly fillOklch: OklchColor;
  readonly strokeOklch: OklchColor;
}

export interface CrowdDrawCallMetrics {
  readonly basis: "theoretical-instancing";
  readonly agentCount: number;
  readonly naiveDrawCalls: number;
  readonly instancedDrawCalls: number;
  readonly drawCallReductionPct: number;
  readonly instanceStrideBytes: 64;
  readonly instanceBufferBytes: number;
  readonly indirectArgsBytes: 20;
  readonly cameraUniformBytes: 64;
  readonly lodDistribution: {
    readonly near: number;
    readonly mid: number;
    readonly far: number;
  };
  /** 고정 가정으로 계산한 호환용 값이며 실제 작업 시간 절감 측정값이 아니다. */
  readonly estimatedManualInkMinutesSaved: number;
}

export interface CrowdInstanceBufferPack {
  readonly instanceStrideBytes: 64;
  readonly instanceStrideFloats: 16;
  readonly instanceCount: number;
  readonly instanceData: Float32Array;
  readonly drawMode: "unculled" | "compute-culled";
  readonly visibleIndices: Uint32Array;
  readonly indirectArgs: Uint32Array;
  readonly cameraUniform: Float32Array;
  /** 매 프레임 reset dispatch를 마친 뒤 선택적 cull dispatch, draw 순서로 실행한다. */
  readonly frameDispatch: {
    readonly resetEntryPoint: "reset_crowd_indirect";
    readonly resetWorkgroupCount: number;
    readonly cullEntryPoint: "cull_and_build_indirect" | null;
    readonly cullWorkgroupCount: number;
  };
}

export interface CrowdSceneMetrics {
  readonly requestedCount: number;
  readonly placedCount: number;
  readonly generationTimeMs: number;
  readonly overlapViolations: number;
  readonly minObservedWorldSpacingM: number;
  readonly meanGazeAlignment: number;
  readonly nearStrokeWidthPx: number;
  readonly farStrokeWidthPx: number;
  readonly drawCallMetrics: CrowdDrawCallMetrics;
}

export interface CrowdSceneResult {
  readonly preset: CrowdPresetSpec;
  readonly options: ResolvedCrowdGenerationOptions;
  readonly agents: readonly CrowdAgentInstance[];
  readonly metrics: CrowdSceneMetrics;
  readonly gpuBuffers: CrowdInstanceBufferPack;
}

export interface WgslShaderValidationReport {
  readonly valid: boolean;
  readonly balancedDelimiters: boolean;
  readonly entryPoints: readonly string[];
  readonly computeEntryPoints: readonly string[];
  readonly vertexEntryPoints: readonly string[];
  readonly fragmentEntryPoints: readonly string[];
  readonly workgroupSizes: readonly string[];
  readonly bindings: readonly string[];
  readonly structs: readonly string[];
  readonly hasDrawIndexedIndirectStruct: boolean;
  readonly errors: readonly string[];
}

export const CROWD_MIN_COUNT = 20;
export const CROWD_MAX_COUNT = 2000;
export const CROWD_PANEL_MAX_COUNT = 1000;
export const CROWD_INSTANCE_STRIDE_BYTES = 64 as const;
export const CROWD_INSTANCE_STRIDE_FLOATS = 16 as const;
export const CROWD_INDIRECT_ARGS_BYTES = 20 as const;
export const CROWD_CAMERA_UNIFORM_BYTES = 64 as const;
export const CROWD_BASE_SILHOUETTE_INDEX_COUNT = 18;

export const DEFAULT_CROWD_PRESET: CrowdPresetSpec = {
  id: "crosswalk-rush",
  index: 0,
  labelKo: "도심 횡단보도 출근길",
  shortLabelKo: "횡단보도",
  descriptionKo: "양방향 보행 교차 · 코트/서류가방/우산 실루엣 · 강한 1점 원근 소실점",
  layout: "crosswalk-lanes",
  prop: "briefcase-umbrella",
  defaultCount: 180,
  defaultHorizonRatio: 0.36,
  defaultVanishingX: 0.5,
  defaultFocalX: 0.5,
  defaultFocalY: 0.68,
  defaultFocalAttention: 0.68,
  defaultStrokeAttenuation: 0.86,
  nearDistanceM: 2.5,
  farDistanceM: 34,
  corridorHalfWidthRatio: 0.94,
  elevationSlope: 0,
  seatedRatio: 0,
  minSpacingM: 0.82,
  skyZenithOklch: { l: 0.93, c: 0.014, h: 238 },
  skyHorizonOklch: { l: 0.97, c: 0.008, h: 82 },
  groundFarOklch: { l: 0.91, c: 0.007, h: 245 },
  groundNearOklch: { l: 0.85, c: 0.009, h: 250 },
  inkNearOklch: { l: 0.24, c: 0.014, h: 252 },
  hazeFarOklch: { l: 0.84, c: 0.011, h: 240 },
  accentTintOklch: { l: 0.55, c: 0.12, h: 245 },
};

export const CROWD_PRESETS: readonly CrowdPresetSpec[] = [
  DEFAULT_CROWD_PRESET,
  {
    id: "school-hallway",
    index: 1,
    labelKo: "학교 복도·운동장",
    shortLabelKo: "학교 복도",
    descriptionKo: "교복·책가방 소그룹 담소 및 등하교 동선 · 창측 자연광 페이드",
    layout: "corridor-clusters",
    prop: "school-bag",
    defaultCount: 120,
    defaultHorizonRatio: 0.4,
    defaultVanishingX: 0.48,
    defaultFocalX: 0.52,
    defaultFocalY: 0.66,
    defaultFocalAttention: 0.74,
    defaultStrokeAttenuation: 0.82,
    nearDistanceM: 2.4,
    farDistanceM: 28,
    corridorHalfWidthRatio: 0.66,
    elevationSlope: 0,
    seatedRatio: 0.04,
    minSpacingM: 0.76,
    skyZenithOklch: { l: 0.95, c: 0.016, h: 92 },
    skyHorizonOklch: { l: 0.98, c: 0.012, h: 85 },
    groundFarOklch: { l: 0.92, c: 0.012, h: 78 },
    groundNearOklch: { l: 0.87, c: 0.016, h: 72 },
    inkNearOklch: { l: 0.26, c: 0.022, h: 258 },
    hazeFarOklch: { l: 0.86, c: 0.014, h: 88 },
    accentTintOklch: { l: 0.58, c: 0.11, h: 68 },
  },
  {
    id: "stadium-concert",
    index: 2,
    labelKo: "경기장·콘서트 관중",
    shortLabelKo: "경기장·공연",
    descriptionKo: "계단식 관람석 원근 고도 · 응원봉/손든 실루엣 · 무대 포컬 집중 시선",
    layout: "tiered-stadium",
    prop: "lightstick-cheer",
    defaultCount: 360,
    defaultHorizonRatio: 0.28,
    defaultVanishingX: 0.5,
    defaultFocalX: 0.5,
    defaultFocalY: 0.84,
    defaultFocalAttention: 0.94,
    defaultStrokeAttenuation: 0.9,
    nearDistanceM: 2.8,
    farDistanceM: 42,
    corridorHalfWidthRatio: 1.0,
    elevationSlope: 0.11,
    seatedRatio: 0.24,
    minSpacingM: 0.64,
    skyZenithOklch: { l: 0.22, c: 0.032, h: 266 },
    skyHorizonOklch: { l: 0.34, c: 0.044, h: 274 },
    groundFarOklch: { l: 0.3, c: 0.026, h: 264 },
    groundNearOklch: { l: 0.2, c: 0.022, h: 262 },
    inkNearOklch: { l: 0.16, c: 0.018, h: 268 },
    hazeFarOklch: { l: 0.54, c: 0.042, h: 272 },
    accentTintOklch: { l: 0.78, c: 0.14, h: 82 },
  },
  {
    id: "fantasy-knights",
    index: 3,
    labelKo: "판타지 기사단 행군",
    shortLabelKo: "기사단 행군",
    descriptionKo: "정렬된 종대·횡대 편대 배치 · 장창·망토·투구 실루엣 · 로우 앵글 원근",
    layout: "formation-ranks",
    prop: "spear-cape",
    defaultCount: 240,
    defaultHorizonRatio: 0.32,
    defaultVanishingX: 0.5,
    defaultFocalX: 0.5,
    defaultFocalY: 0.72,
    defaultFocalAttention: 0.82,
    defaultStrokeAttenuation: 0.88,
    nearDistanceM: 2.8,
    farDistanceM: 38,
    corridorHalfWidthRatio: 0.88,
    elevationSlope: 0.02,
    seatedRatio: 0,
    minSpacingM: 0.92,
    skyZenithOklch: { l: 0.86, c: 0.024, h: 58 },
    skyHorizonOklch: { l: 0.94, c: 0.022, h: 66 },
    groundFarOklch: { l: 0.86, c: 0.022, h: 74 },
    groundNearOklch: { l: 0.78, c: 0.028, h: 68 },
    inkNearOklch: { l: 0.22, c: 0.018, h: 48 },
    hazeFarOklch: { l: 0.82, c: 0.02, h: 64 },
    accentTintOklch: { l: 0.52, c: 0.13, h: 32 },
  },
  {
    id: "medieval-market",
    index: 4,
    labelKo: "중세 시장 골목",
    shortLabelKo: "중세 시장",
    descriptionKo: "좁은 원근 골목 깔때기 분포 · 후드·망토·상인 바구니 · 좌우 노점 여백",
    layout: "narrow-alley",
    prop: "hood-basket",
    defaultCount: 150,
    defaultHorizonRatio: 0.38,
    defaultVanishingX: 0.52,
    defaultFocalX: 0.46,
    defaultFocalY: 0.68,
    defaultFocalAttention: 0.64,
    defaultStrokeAttenuation: 0.84,
    nearDistanceM: 2.4,
    farDistanceM: 30,
    corridorHalfWidthRatio: 0.58,
    elevationSlope: 0,
    seatedRatio: 0.08,
    minSpacingM: 0.78,
    skyZenithOklch: { l: 0.91, c: 0.022, h: 76 },
    skyHorizonOklch: { l: 0.96, c: 0.018, h: 80 },
    groundFarOklch: { l: 0.89, c: 0.02, h: 72 },
    groundNearOklch: { l: 0.82, c: 0.026, h: 66 },
    inkNearOklch: { l: 0.25, c: 0.024, h: 52 },
    hazeFarOklch: { l: 0.84, c: 0.018, h: 74 },
    accentTintOklch: { l: 0.56, c: 0.11, h: 44 },
  },
  {
    id: "crowded-subway",
    index: 5,
    labelKo: "만원 지하철 객차",
    shortLabelKo: "만원 지하철",
    descriptionKo: "깊은 객차 통로 원근 · 손잡이·스마트폰 포즈 · 근경 굵은 잉크 대비",
    layout: "subway-aisle",
    prop: "handstrap-phone",
    defaultCount: 140,
    defaultHorizonRatio: 0.44,
    defaultVanishingX: 0.5,
    defaultFocalX: 0.5,
    defaultFocalY: 0.62,
    defaultFocalAttention: 0.56,
    defaultStrokeAttenuation: 0.92,
    nearDistanceM: 2.1,
    farDistanceM: 24,
    corridorHalfWidthRatio: 0.52,
    elevationSlope: 0,
    seatedRatio: 0.18,
    minSpacingM: 0.58,
    skyZenithOklch: { l: 0.92, c: 0.01, h: 224 },
    skyHorizonOklch: { l: 0.95, c: 0.008, h: 215 },
    groundFarOklch: { l: 0.88, c: 0.01, h: 230 },
    groundNearOklch: { l: 0.81, c: 0.012, h: 236 },
    inkNearOklch: { l: 0.21, c: 0.014, h: 248 },
    hazeFarOklch: { l: 0.83, c: 0.01, h: 228 },
    accentTintOklch: { l: 0.54, c: 0.11, h: 215 },
  },
  {
    id: "cafe-terrace",
    index: 6,
    labelKo: "카페 거리 테라스",
    shortLabelKo: "카페 테라스",
    descriptionKo: "테이블 좌석 클러스터와 산책로 혼재 · 앉은/서있는 실루엣 비율 조절",
    layout: "terrace-tables",
    prop: "coffee-seated",
    defaultCount: 90,
    defaultHorizonRatio: 0.42,
    defaultVanishingX: 0.44,
    defaultFocalX: 0.56,
    defaultFocalY: 0.68,
    defaultFocalAttention: 0.62,
    defaultStrokeAttenuation: 0.78,
    nearDistanceM: 2.5,
    farDistanceM: 28,
    corridorHalfWidthRatio: 0.84,
    elevationSlope: 0,
    seatedRatio: 0.54,
    minSpacingM: 0.94,
    skyZenithOklch: { l: 0.94, c: 0.016, h: 86 },
    skyHorizonOklch: { l: 0.98, c: 0.012, h: 78 },
    groundFarOklch: { l: 0.91, c: 0.015, h: 72 },
    groundNearOklch: { l: 0.86, c: 0.02, h: 64 },
    inkNearOklch: { l: 0.27, c: 0.022, h: 48 },
    hazeFarOklch: { l: 0.86, c: 0.014, h: 76 },
    accentTintOklch: { l: 0.58, c: 0.11, h: 46 },
  },
  {
    id: "airport-lobby",
    index: 7,
    labelKo: "공항 출국장 로비",
    shortLabelKo: "공항 로비",
    descriptionKo: "광활한 대합실 원근 · 캐리어 끄는 보행 실루엣 · 전광판·게이트 동선",
    layout: "concourse-hall",
    prop: "rolling-luggage",
    defaultCount: 200,
    defaultHorizonRatio: 0.34,
    defaultVanishingX: 0.5,
    defaultFocalX: 0.48,
    defaultFocalY: 0.66,
    defaultFocalAttention: 0.66,
    defaultStrokeAttenuation: 0.86,
    nearDistanceM: 2.6,
    farDistanceM: 38,
    corridorHalfWidthRatio: 0.96,
    elevationSlope: 0,
    seatedRatio: 0.1,
    minSpacingM: 0.95,
    skyZenithOklch: { l: 0.94, c: 0.014, h: 228 },
    skyHorizonOklch: { l: 0.98, c: 0.008, h: 220 },
    groundFarOklch: { l: 0.92, c: 0.008, h: 232 },
    groundNearOklch: { l: 0.86, c: 0.01, h: 238 },
    inkNearOklch: { l: 0.23, c: 0.016, h: 244 },
    hazeFarOklch: { l: 0.85, c: 0.01, h: 230 },
    accentTintOklch: { l: 0.56, c: 0.12, h: 226 },
  },
] as const;

export function getCrowdPresetById(presetId?: CrowdPresetId): CrowdPresetSpec {
  const found = CROWD_PRESETS.find((preset) => preset.id === presetId);
  return found ?? DEFAULT_CROWD_PRESET;
}

/**
 * WebGPU `drawIndexedIndirect` 인스턴싱 WGSL 셰이더.
 *
 * - `CrowdInstance`는 64바이트 정렬(vec4<f32> 4개 = 16 floats).
 * - `DrawIndexedIndirectArgs`는 WebGPU `GPURenderPassEncoder.drawIndexedIndirect` 규격(20바이트, u32 5개).
 * - `@compute fn cull_and_build_indirect`: 깊이/크기 조건 검사 후 인스턴스 인덱스를 압축하고
 *   `atomicAdd(&indirectArgs.instanceCount, 1u)`로 단일 간접 드로우콜 인수를 갱신한다.
 * - `@vertex fn vs_crowd_instanced` + `@fragment fn fs_crowd_toon_ink`:
 *   깊이 원근 스케일링, 주인공 시선 회전, 근경 G펜 굵은 잉크 → 원경 얇은 실루엣 & 대기 페이드 출력.
 */
export const CROWD_INSTANCING_WGSL = /* wgsl */ `
struct CrowdCameraUniform {
  viewportAndHorizon: vec4<f32>,
  focalAndDepthRange: vec4<f32>,
  strokeAndAttention: vec4<f32>,
  sceneMeta: vec4<f32>,
};

struct CrowdInstance {
  worldPosAndScale: vec4<f32>,
  yawPitchDepthFade: vec4<f32>,
  inkFillOklchLchA: vec4<f32>,
  poseOutlineLodFlags: vec4<f32>,
};

struct DrawIndexedIndirectArgs {
  indexCount: u32,
  instanceCount: atomic<u32>,
  firstIndex: u32,
  baseVertex: i32,
  firstInstance: u32,
};

struct CrowdVertexIn {
  @location(0) localPos: vec2<f32>,
  @location(1) uv: vec2<f32>,
};

struct CrowdVertexOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) depthFade: vec2<f32>,
  @location(2) inkLchAlpha: vec4<f32>,
  @location(3) strokeAndYaw: vec2<f32>,
};

@group(0) @binding(0) var<uniform> camera: CrowdCameraUniform;
@group(0) @binding(1) var<storage, read> instances: array<CrowdInstance>;
@group(0) @binding(2) var<storage, read_write> visibleIndices: array<u32>;
@group(0) @binding(3) var<storage, read_write> indirectArgs: DrawIndexedIndirectArgs;

// 별도 dispatch를 완료한 뒤 cull을 실행한다. sceneMeta.w: 0=uncull, 1=compute-cull.
@compute @workgroup_size(64, 1, 1)
fn reset_crowd_indirect(@builtin(global_invocation_id) gid: vec3<u32>) {
  let totalCount = u32(camera.sceneMeta.y);
  let culled = camera.sceneMeta.w > 0.5;
  if (gid.x == 0u) {
    atomicStore(&indirectArgs.instanceCount, select(totalCount, 0u, culled));
  }
  if (gid.x < totalCount) {
    visibleIndices[gid.x] = select(gid.x, 0xffffffffu, culled);
  }
}

@compute @workgroup_size(64, 1, 1)
fn cull_and_build_indirect(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (camera.sceneMeta.w < 0.5) { return; }
  let idx = gid.x;
  let totalCount = u32(camera.sceneMeta.y);
  if (idx >= totalCount) {
    return;
  }

  let inst = instances[idx];
  let depth = inst.yawPitchDepthFade.z;
  let scale = inst.worldPosAndScale.w;
  if (depth < 0.0 || depth > 1.02 || scale <= 0.01) {
    return;
  }

  let slot = atomicAdd(&indirectArgs.instanceCount, 1u);
  visibleIndices[slot] = idx;
}

@vertex
fn vs_crowd_instanced(
  vert: CrowdVertexIn,
  @builtin(instance_index) instSlot: u32,
) -> CrowdVertexOut {
  let instIdx = visibleIndices[instSlot];
  let inst = instances[instIdx];

  let vpX = camera.viewportAndHorizon.w;
  let horizonY = camera.viewportAndHorizon.z;
  let nearM = camera.focalAndDepthRange.z;
  let worldZ = max(nearM, inst.worldPosAndScale.z);
  let scale = inst.worldPosAndScale.w;
  let yaw = inst.yawPitchDepthFade.x;

  let focalNorm = 0.84;
  let anchorX = vpX + (inst.worldPosAndScale.x * focalNorm) / worldZ;
  let anchorY = horizonY + ((1.68 - inst.worldPosAndScale.y) * focalNorm) / worldZ;

  let turnScaleX = 0.78 + 0.22 * abs(cos(yaw));
  let pxX = anchorX + vert.localPos.x * scale * 0.24 * turnScaleX;
  let pxY = anchorY - vert.localPos.y * scale * 0.62;

  var out: CrowdVertexOut;
  out.clipPos = vec4<f32>(pxX * 2.0 - 1.0, 1.0 - pxY * 2.0, clamp(inst.yawPitchDepthFade.z, 0.0, 0.999), 1.0);
  out.uv = vert.uv;
  out.depthFade = vec2<f32>(inst.yawPitchDepthFade.z, inst.yawPitchDepthFade.w);
  out.inkLchAlpha = inst.inkFillOklchLchA;
  out.strokeAndYaw = vec2<f32>(inst.poseOutlineLodFlags.x, yaw);
  return out;
}

@fragment
fn fs_crowd_toon_ink(in: CrowdVertexOut) -> @location(0) vec4<f32> {
  let edgeDist = min(min(in.uv.x, 1.0 - in.uv.x), min(in.uv.y, 1.0 - in.uv.y));
  let inkBand = clamp(in.strokeAndYaw.x * 0.025, 0.008, 0.14);
  let isOutline = step(edgeDist, inkBand);

  let baseLum = clamp(in.inkLchAlpha.x, 0.08, 0.96);
  let haze = clamp(in.depthFade.y, 0.0, 0.85);
  let outlineLum = mix(baseLum * 0.42, 0.84, haze * 0.82);
  let fillLum = mix(baseLum, 0.88, haze);
  let shaded = mix(fillLum, outlineLum, isOutline);

  let tint = in.inkLchAlpha.y * (1.0 - haze * 0.7);
  let alpha = clamp(in.inkLchAlpha.w, 0.18, 1.0);
  return vec4<f32>(shaded, shaded + tint * 0.08, shaded + tint * 0.18, alpha);
}
`;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = clampNumber(color.l, 0, 1).toFixed(3);
  const c = clampNumber(color.c, 0, 0.4).toFixed(3);
  const h = (((color.h % 360) + 360) % 360).toFixed(1);
  if (typeof alpha === "number" && Number.isFinite(alpha) && alpha < 0.999) {
    return `oklch(${l} ${c} ${h} / ${clampNumber(alpha, 0, 1).toFixed(2)})`;
  }
  return `oklch(${l} ${c} ${h})`;
}

export function mixOklch(a: OklchColor, b: OklchColor, t: number): OklchColor {
  const k = clampNumber(t, 0, 1);
  let dh = ((b.h - a.h + 540) % 360) - 180;
  if (a.c < 0.005) dh = 0;
  const h = a.c < 0.005 ? b.h : (((a.h + dh * k) % 360) + 360) % 360;
  return {
    l: clampNumber(a.l + (b.l - a.l) * k, 0, 1),
    c: clampNumber(a.c + (b.c - a.c) * k, 0, 0.4),
    h,
  };
}

function linearChannelToSrgbByte(linear: number): number {
  const clamped = clampNumber(linear, 0, 1);
  const gamma =
    clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(clampNumber(gamma, 0, 1) * 255);
}

/**
 * OKLCH 색상을 8비트 sRGB 바이트 삼중쌍으로 변환한다(오프스크린 RGBA 버퍼 렌더링용).
 */
export function oklchToSrgbBytes(color: OklchColor): readonly [number, number, number] {
  const L = clampNumber(color.l, 0, 1);
  const C = clampNumber(color.c, 0, 0.4);
  const rad = (color.h * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);

  const lPrime = L + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = L - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = L - 0.0894841775 * a - 1.291485548 * b;

  const l3 = lPrime * lPrime * lPrime;
  const m3 = mPrime * mPrime * mPrime;
  const s3 = sPrime * sPrime * sPrime;

  const rLin = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gLin = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bLin = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  return [
    linearChannelToSrgbByte(rLin),
    linearChannelToSrgbByte(gLin),
    linearChannelToSrgbByte(bLin),
  ];
}

/**
 * WGSL 컴퓨트/렌더 셰이더의 구문 균형, 진입점(@compute/@vertex/@fragment),
 * 바인딩 중복 여부, `DrawIndexedIndirectArgs` 구조체 계약을 정적 검증한다.
 */
export function validateCrowdWgslShader(source: string): WgslShaderValidationReport {
  const errors: string[] = [];
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let balanced = true;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    else if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "[") bracketDepth += 1;
    else if (ch === "]") bracketDepth -= 1;
    if (parenDepth < 0 || braceDepth < 0 || bracketDepth < 0) {
      balanced = false;
    }
  }
  if (parenDepth !== 0 || braceDepth !== 0 || bracketDepth !== 0) {
    balanced = false;
  }
  if (!balanced) {
    errors.push("WGSL 괄호/중괄호 짝이 맞지 않습니다.");
  }

  const computeEntryPoints: string[] = [];
  const vertexEntryPoints: string[] = [];
  const fragmentEntryPoints: string[] = [];

  for (const match of source.matchAll(
    /@compute[\s\S]{0,80}?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu,
  )) {
    const name = match[1];
    if (name) computeEntryPoints.push(name);
  }
  for (const match of source.matchAll(/@vertex\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu)) {
    const name = match[1];
    if (name) vertexEntryPoints.push(name);
  }
  for (const match of source.matchAll(/@fragment\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu)) {
    const name = match[1];
    if (name) fragmentEntryPoints.push(name);
  }

  const entryPoints = [...computeEntryPoints, ...vertexEntryPoints, ...fragmentEntryPoints];
  if (entryPoints.length === 0) {
    errors.push("유효한 @compute/@vertex/@fragment 진입점이 없습니다.");
  }

  const workgroupSizes: string[] = [];
  for (const match of source.matchAll(/@workgroup_size\(\s*([^)]+)\)/gu)) {
    const raw = match[1];
    if (raw) {
      workgroupSizes.push(raw.replace(/\s+/gu, ""));
    }
  }

  const bindings: string[] = [];
  const seenBindingKeys = new Set<string>();
  for (const match of source.matchAll(
    /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)\s*var(?:<[^>]+>)?\s+([A-Za-z_][A-Za-z0-9_]*)/gu,
  )) {
    const grp = match[1] ?? "0";
    const bnd = match[2] ?? "0";
    const varName = match[3] ?? "unknown";
    const key = `${grp}:${bnd}`;
    if (seenBindingKeys.has(key)) {
      errors.push(`중복 바인딩 슬롯 검출: @group(${grp}) @binding(${bnd})`);
    }
    seenBindingKeys.add(key);
    bindings.push(`group(${grp})/binding(${bnd}):${varName}`);
  }

  const structs: string[] = [];
  for (const match of source.matchAll(/\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gu)) {
    const name = match[1];
    if (name) structs.push(name);
  }

  const hasDrawIndexedIndirectStruct =
    /struct\s+DrawIndexedIndirectArgs\s*\{[\s\S]*?indexCount[\s\S]*?instanceCount[\s\S]*?firstIndex[\s\S]*?baseVertex[\s\S]*?firstInstance[\s\S]*?\}/u.test(
      source,
    );

  if (!hasDrawIndexedIndirectStruct) {
    errors.push("WebGPU drawIndexedIndirect 20B 규격 구조체(DrawIndexedIndirectArgs)가 누락되었습니다.");
  }

  return {
    valid: errors.length === 0,
    balancedDelimiters: balanced,
    entryPoints,
    computeEntryPoints,
    vertexEntryPoints,
    fragmentEntryPoints,
    workgroupSizes,
    bindings,
    structs,
    hasDrawIndexedIndirectStruct,
    errors,
  };
}
