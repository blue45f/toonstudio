/**
 * DesignDoll 초월 — GPU/정점 False-Perspective & 부위별(Per-Limb) 만화 원근 과장 연산 엔진.
 *
 * 일반 광각 렌즈는 배경 선까지 휘어뜨리는 반면, False-Perspective는 캐릭터 정점만 카메라 깊이
 * 기준으로 비선형 확대/압축하고 주먹·발·무기·머리 등 개별 부위 태그(Per-Limb)를 독립적으로
 * 과장한다. CPU 평가 함수와 Three.js GLSL 버텍스 셰이더 청크가 동일한 수식을 공유한다.
 */

export type Vec3Tuple = readonly [number, number, number];

export const FALSE_PERSPECTIVE_LIMB_TAG_IDS = Object.freeze([
  "leftFist",
  "rightFist",
  "leftFoot",
  "rightFoot",
  "weapon",
  "head",
] as const);

export type FalsePerspectiveLimbTagId = (typeof FALSE_PERSPECTIVE_LIMB_TAG_IDS)[number];

export const FALSE_PERSPECTIVE_LIMB_LABELS_KO: Readonly<Record<FalsePerspectiveLimbTagId, string>> = Object.freeze({
  leftFist: "왼주먹",
  rightFist: "오른주먹",
  leftFoot: "왼발",
  rightFoot: "오른발",
  weapon: "무기·소품",
  head: "머리",
});

export interface PerLimbExaggerationTag {
  readonly id: FalsePerspectiveLimbTagId;
  readonly enabled: boolean;
  /** 태그 중심 기준 국소 확대/축소 배율 (`1.0` 중립, `> 1` 과장 확대, `< 1` 축소). */
  readonly scaleBoost: number;
  /** 카메라 방향(`-forward`)으로 당겨오는 거리(m). 양수일수록 카메라에 가까워진다. */
  readonly depthPullM: number;
  /** 부드러운 에르미트 감쇠 반경(m). */
  readonly falloffRadiusM: number;
  /** 현재 포즈에서 해당 부위(주먹·발·무기·머리)의 월드 중심 좌표(m). */
  readonly anchorWorld: Vec3Tuple;
}

export interface FalsePerspectiveConfig {
  readonly enabled: boolean;
  /** 전체 만화 원근 강도 (`0` 끄기 ~ `2.0` 극단적 액션). */
  readonly globalIntensity: number;
  /** 원근 배율이 `1.0`으로 유지되는 기준 깊이(m, 보통 캐릭터 가슴 중심까지 거리). */
  readonly referenceDepthM: number;
  /** 근거리 비선형 확대 지수 (`1.0` 선형 ~ `2.4` 강한 전경 돌출). */
  readonly nearBoostExponent: number;
  /** 원거리 축소 강도 (`0` ~ `0.6`). */
  readonly farCompressFactor: number;
  /** 정점 확대 최대 배율 상한 (`1.0` ~ `3.0`). */
  readonly maxScaleMultiplier: number;
  /** 카메라 근평면 침범 방지 최소 깊이(m). */
  readonly minNearPlaneM: number;
  readonly limbTags: Readonly<Record<FalsePerspectiveLimbTagId, PerLimbExaggerationTag>>;
}

export interface FalsePerspectiveCameraBasis {
  readonly position: Vec3Tuple;
  /** 카메라가 바라보는 정규화 전방 벡터. */
  readonly forward: Vec3Tuple;
  /** 카메라 오른쪽 정규화 벡터. */
  readonly right: Vec3Tuple;
  /** 카메라 위쪽 정규화 벡터. */
  readonly up: Vec3Tuple;
}

export type FalsePerspectivePresetId =
  | "neutral"
  | "action-punch"
  | "dynamic-kick"
  | "sword-thrust"
  | "heroic-low-angle";

export interface FalsePerspectivePreset {
  readonly id: FalsePerspectivePresetId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly config: FalsePerspectiveConfig;
}

export interface FalsePerspectiveUniformPayload {
  readonly uFalsePerspEnabled: number;
  readonly uFalsePerspIntensity: number;
  readonly uFalsePerspRefDepth: number;
  readonly uFalsePerspNearPower: number;
  readonly uFalsePerspFarCompress: number;
  readonly uFalsePerspMaxScale: number;
  readonly uFalsePerspMinNear: number;
  readonly uFalsePerspCamPos: Vec3Tuple;
  readonly uFalsePerspCamForward: Vec3Tuple;
  readonly uFalsePerspCamRight: Vec3Tuple;
  readonly uFalsePerspCamUp: Vec3Tuple;
  readonly uFalsePerspLimbCount: number;
  /** 최대 6개 활성 부위 앵커 월드 좌표. */
  readonly uFalsePerspLimbAnchors: readonly Vec3Tuple[];
  /** `[scaleBoost, depthPullM, falloffRadiusM, enabledFlag]` 패킹 배열. */
  readonly uFalsePerspLimbParams: readonly (readonly [number, number, number, number])[];
}

const EPS = 1e-8;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function dot3(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize3(v: Vec3Tuple, fallback: Vec3Tuple): Vec3Tuple {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l <= EPS) return fallback;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function smoothstepFalloff(dist: number, radius: number): number {
  if (radius <= EPS || dist >= radius) return 0;
  const t = 1 - dist / radius;
  return t * t * (3 - 2 * t);
}

export function createNeutralLimbTags(): Record<FalsePerspectiveLimbTagId, PerLimbExaggerationTag> {
  return {
    leftFist: { id: "leftFist", enabled: false, scaleBoost: 1, depthPullM: 0, falloffRadiusM: 0.24, anchorWorld: [-0.35, 1.2, 0.2] },
    rightFist: { id: "rightFist", enabled: false, scaleBoost: 1, depthPullM: 0, falloffRadiusM: 0.24, anchorWorld: [0.35, 1.2, 0.2] },
    leftFoot: { id: "leftFoot", enabled: false, scaleBoost: 1, depthPullM: 0, falloffRadiusM: 0.28, anchorWorld: [-0.15, 0.1, 0.1] },
    rightFoot: { id: "rightFoot", enabled: false, scaleBoost: 1, depthPullM: 0, falloffRadiusM: 0.28, anchorWorld: [0.15, 0.1, 0.1] },
    weapon: { id: "weapon", enabled: false, scaleBoost: 1, depthPullM: 0, falloffRadiusM: 0.45, anchorWorld: [0.4, 1.25, 0.55] },
    head: { id: "head", enabled: false, scaleBoost: 1, depthPullM: 0, falloffRadiusM: 0.22, anchorWorld: [0, 1.58, 0] },
  };
}

export function createDefaultFalsePerspectiveConfig(): FalsePerspectiveConfig {
  return {
    enabled: false,
    globalIntensity: 0,
    referenceDepthM: 2.4,
    nearBoostExponent: 1.45,
    farCompressFactor: 0.25,
    maxScaleMultiplier: 2.4,
    minNearPlaneM: 0.25,
    limbTags: createNeutralLimbTags(),
  };
}

export const FALSE_PERSPECTIVE_PRESETS: Readonly<Record<FalsePerspectivePresetId, FalsePerspectivePreset>> = Object.freeze({
  neutral: {
    id: "neutral",
    labelKo: "표준 원근",
    summaryKo: "과장 없이 카메라 본래 투시를 유지합니다.",
    config: createDefaultFalsePerspectiveConfig(),
  },
  "action-punch": {
    id: "action-punch",
    labelKo: "액션 펀치 돌출",
    summaryKo: "전경 오른주먹을 극대화하고 머리를 살짝 줄여 타격감을 높입니다.",
    config: {
      ...createDefaultFalsePerspectiveConfig(),
      enabled: true,
      globalIntensity: 0.85,
      nearBoostExponent: 1.65,
      farCompressFactor: 0.3,
      limbTags: {
        ...createNeutralLimbTags(),
        rightFist: {
          id: "rightFist",
          enabled: true,
          scaleBoost: 1.75,
          depthPullM: 0.16,
          falloffRadiusM: 0.3,
          anchorWorld: [0.22, 1.32, 0.68],
        },
        head: {
          id: "head",
          enabled: true,
          scaleBoost: 0.9,
          depthPullM: -0.04,
          falloffRadiusM: 0.22,
          anchorWorld: [0, 1.58, 0],
        },
      },
    },
  },
  "dynamic-kick": {
    id: "dynamic-kick",
    labelKo: "하이킥 발 과장",
    summaryKo: "앞으로 뻗은 발과 하체를 웅장하게 확대합니다.",
    config: {
      ...createDefaultFalsePerspectiveConfig(),
      enabled: true,
      globalIntensity: 0.95,
      nearBoostExponent: 1.7,
      farCompressFactor: 0.35,
      limbTags: {
        ...createNeutralLimbTags(),
        rightFoot: {
          id: "rightFoot",
          enabled: true,
          scaleBoost: 1.85,
          depthPullM: 0.2,
          falloffRadiusM: 0.36,
          anchorWorld: [0.18, 1.15, 0.72],
        },
      },
    },
  },
  "sword-thrust": {
    id: "sword-thrust",
    labelKo: "무기 찌르기 원근",
    summaryKo: "칼끝·무기 소품만 카메라 쪽으로 뻗어 나오게 과장합니다.",
    config: {
      ...createDefaultFalsePerspectiveConfig(),
      enabled: true,
      globalIntensity: 0.75,
      nearBoostExponent: 1.6,
      limbTags: {
        ...createNeutralLimbTags(),
        weapon: {
          id: "weapon",
          enabled: true,
          scaleBoost: 1.9,
          depthPullM: 0.24,
          falloffRadiusM: 0.55,
          anchorWorld: [0.35, 1.25, 0.85],
        },
      },
    },
  },
  "heroic-low-angle": {
    id: "heroic-low-angle",
    labelKo: "영웅 로우앵글",
    summaryKo: "양발을 묵직하게 키우고 머리를 미세하게 줄여 장신 실루엣을 만듭니다.",
    config: {
      ...createDefaultFalsePerspectiveConfig(),
      enabled: true,
      globalIntensity: 0.65,
      nearBoostExponent: 1.4,
      limbTags: {
        ...createNeutralLimbTags(),
        leftFoot: {
          id: "leftFoot",
          enabled: true,
          scaleBoost: 1.35,
          depthPullM: 0.08,
          falloffRadiusM: 0.32,
          anchorWorld: [-0.2, 0.12, 0.2],
        },
        rightFoot: {
          id: "rightFoot",
          enabled: true,
          scaleBoost: 1.35,
          depthPullM: 0.08,
          falloffRadiusM: 0.32,
          anchorWorld: [0.2, 0.12, 0.2],
        },
        head: {
          id: "head",
          enabled: true,
          scaleBoost: 0.86,
          depthPullM: -0.05,
          falloffRadiusM: 0.22,
          anchorWorld: [0, 1.62, -0.05],
        },
      },
    },
  },
});

export function buildCameraBasisFromLookAt(
  position: Vec3Tuple,
  target: Vec3Tuple,
  worldUp: Vec3Tuple = [0, 1, 0],
): FalsePerspectiveCameraBasis {
  const forward = normalize3(
    [target[0] - position[0], target[1] - position[1], target[2] - position[2]],
    [0, 0, -1],
  );
  const right = normalize3(cross3(forward, worldUp), [1, 0, 0]);
  const up = normalize3(cross3(right, forward), [0, 1, 0]);
  return { position, forward, right, up };
}

/**
 * 단일 월드 정점에 False-Perspective + Per-Limb 태그 변형을 적용한다.
 */
export function evaluateFalsePerspectiveVertex(
  vertexWorld: Vec3Tuple,
  camera: FalsePerspectiveCameraBasis,
  config: FalsePerspectiveConfig,
): {
  readonly positionWorld: Vec3Tuple;
  readonly effectiveScale: number;
  readonly clampedByNearPlane: boolean;
} {
  if (!config.enabled) {
    return {
      positionWorld: [vertexWorld[0], vertexWorld[1], vertexWorld[2]],
      effectiveScale: 1,
      clampedByNearPlane: false,
    };
  }

  let vx = vertexWorld[0];
  let vy = vertexWorld[1];
  let vz = vertexWorld[2];
  let limbScaleAccum = 1;

  // 1) 부위별(Per-Limb) 국소 확대 + 카메라 방향 깊이 당김
  for (const id of FALSE_PERSPECTIVE_LIMB_TAG_IDS) {
    const tag = config.limbTags[id];
    if (!tag.enabled) continue;
    const dx = vx - tag.anchorWorld[0];
    const dy = vy - tag.anchorWorld[1];
    const dz = vz - tag.anchorWorld[2];
    const dist = Math.hypot(dx, dy, dz);
    const weight = smoothstepFalloff(dist, tag.falloffRadiusM);
    if (weight <= 0) continue;

    const localScale = 1 + (clamp(tag.scaleBoost, 0.5, 2.5) - 1) * weight;
    vx = tag.anchorWorld[0] + dx * localScale;
    vy = tag.anchorWorld[1] + dy * localScale;
    vz = tag.anchorWorld[2] + dz * localScale;

    const pull = clamp(tag.depthPullM, -0.5, 0.8) * weight;
    vx -= camera.forward[0] * pull;
    vy -= camera.forward[1] * pull;
    vz -= camera.forward[2] * pull;
    limbScaleAccum *= localScale;
  }

  // 2) 전역 False-Perspective (카메라 기준 깊이 편차에 따른 xy 방사 확대/압축)
  const rel: Vec3Tuple = [vx - camera.position[0], vy - camera.position[1], vz - camera.position[2]];
  let depth = dot3(rel, camera.forward);
  const cx = dot3(rel, camera.right);
  const cy = dot3(rel, camera.up);

  const minNear = Math.max(0.05, config.minNearPlaneM);
  let clampedByNearPlane = false;
  if (depth < minNear) {
    depth = minNear;
    clampedByNearPlane = true;
  }

  const refDepth = Math.max(minNear + 0.1, config.referenceDepthM);
  const intensity = clamp(config.globalIntensity, 0, 2);
  let globalScale = 1;

  if (intensity > EPS) {
    const ratio = refDepth / depth;
    if (ratio >= 1) {
      const boosted = Math.pow(ratio, clamp(config.nearBoostExponent, 1, 2.4));
      globalScale = 1 + (boosted - 1) * intensity * 0.5;
    } else {
      const compress = clamp(config.farCompressFactor, 0, 0.6);
      globalScale = 1 - (1 - ratio) * compress * intensity;
    }
  }

  const maxScale = clamp(config.maxScaleMultiplier, 1, 3);
  globalScale = clamp(globalScale, 0.45, maxScale);

  const scaledCx = cx * globalScale;
  const scaledCy = cy * globalScale;

  const outX = camera.position[0] + camera.right[0] * scaledCx + camera.up[0] * scaledCy + camera.forward[0] * depth;
  const outY = camera.position[1] + camera.right[1] * scaledCx + camera.up[1] * scaledCy + camera.forward[1] * depth;
  const outZ = camera.position[2] + camera.right[2] * scaledCx + camera.up[2] * scaledCy + camera.forward[2] * depth;

  return {
    positionWorld: [outX, outY, outZ],
    effectiveScale: globalScale * limbScaleAccum,
    clampedByNearPlane,
  };
}

/** 정점 배열(`Float32Array`) 전체에 False-Perspective를 일괄 적용한다. */
export function deformMeshWithFalsePerspective(
  worldPositions: Float32Array,
  camera: FalsePerspectiveCameraBasis,
  config: FalsePerspectiveConfig,
): Float32Array {
  const out = new Float32Array(worldPositions.length);
  for (let i = 0; i < worldPositions.length; i += 3) {
    const evaluated = evaluateFalsePerspectiveVertex(
      [worldPositions[i], worldPositions[i + 1], worldPositions[i + 2]],
      camera,
      config,
    );
    out[i] = evaluated.positionWorld[0];
    out[i + 1] = evaluated.positionWorld[1];
    out[i + 2] = evaluated.positionWorld[2];
  }
  return out;
}

/** Three.js `ShaderMaterial` / `onBeforeCompile`에 직접 주입할 유니폼 페이로드를 생성한다. */
export function buildFalsePerspectiveUniforms(
  camera: FalsePerspectiveCameraBasis,
  config: FalsePerspectiveConfig,
): FalsePerspectiveUniformPayload {
  const anchors: Vec3Tuple[] = [];
  const params: (readonly [number, number, number, number])[] = [];
  for (const id of FALSE_PERSPECTIVE_LIMB_TAG_IDS) {
    const tag = config.limbTags[id];
    anchors.push(tag.anchorWorld);
    params.push([
      clamp(tag.scaleBoost, 0.5, 2.5),
      clamp(tag.depthPullM, -0.5, 0.8),
      Math.max(0.01, tag.falloffRadiusM),
      tag.enabled ? 1 : 0,
    ]);
  }
  return {
    uFalsePerspEnabled: config.enabled ? 1 : 0,
    uFalsePerspIntensity: clamp(config.globalIntensity, 0, 2),
    uFalsePerspRefDepth: Math.max(0.15, config.referenceDepthM),
    uFalsePerspNearPower: clamp(config.nearBoostExponent, 1, 2.4),
    uFalsePerspFarCompress: clamp(config.farCompressFactor, 0, 0.6),
    uFalsePerspMaxScale: clamp(config.maxScaleMultiplier, 1, 3),
    uFalsePerspMinNear: Math.max(0.05, config.minNearPlaneM),
    uFalsePerspCamPos: camera.position,
    uFalsePerspCamForward: camera.forward,
    uFalsePerspCamRight: camera.right,
    uFalsePerspCamUp: camera.up,
    uFalsePerspLimbCount: FALSE_PERSPECTIVE_LIMB_TAG_IDS.length,
    uFalsePerspLimbAnchors: anchors,
    uFalsePerspLimbParams: params,
  };
}

/** Three.js `onBeforeCompile`용 GLSL 버텍스 셰이더 선언/변환 청크를 반환한다. */
export function createFalsePerspectiveVertexShaderChunk(): {
  readonly uniformDeclarationsGlsl: string;
  readonly vertexTransformGlsl: string;
} {
  const uniformDeclarationsGlsl = /* glsl */ `
uniform float uFalsePerspEnabled;
uniform float uFalsePerspIntensity;
uniform float uFalsePerspRefDepth;
uniform float uFalsePerspNearPower;
uniform float uFalsePerspFarCompress;
uniform float uFalsePerspMaxScale;
uniform float uFalsePerspMinNear;
uniform vec3 uFalsePerspCamPos;
uniform vec3 uFalsePerspCamForward;
uniform vec3 uFalsePerspCamRight;
uniform vec3 uFalsePerspCamUp;
uniform vec3 uFalsePerspLimbAnchors[6];
uniform vec4 uFalsePerspLimbParams[6];

vec3 applyStudioFalsePerspective(vec3 worldPos) {
  if (uFalsePerspEnabled < 0.5) return worldPos;
  vec3 p = worldPos;
  for (int i = 0; i < 6; i++) {
    vec4 param = uFalsePerspLimbParams[i];
    if (param.w < 0.5) continue;
    vec3 anchor = uFalsePerspLimbAnchors[i];
    vec3 d = p - anchor;
    float dist = length(d);
    if (dist < param.z) {
      float t = 1.0 - dist / max(param.z, 0.0001);
      float w = t * t * (3.0 - 2.0 * t);
      float localScale = 1.0 + (param.x - 1.0) * w;
      p = anchor + d * localScale - uFalsePerspCamForward * (param.y * w);
    }
  }
  vec3 rel = p - uFalsePerspCamPos;
  float depth = max(dot(rel, uFalsePerspCamForward), uFalsePerspMinNear);
  float cx = dot(rel, uFalsePerspCamRight);
  float cy = dot(rel, uFalsePerspCamUp);
  float ratio = uFalsePerspRefDepth / depth;
  float gScale = 1.0;
  if (uFalsePerspIntensity > 0.0001) {
    if (ratio >= 1.0) {
      gScale = 1.0 + (pow(ratio, uFalsePerspNearPower) - 1.0) * uFalsePerspIntensity * 0.5;
    } else {
      gScale = 1.0 - (1.0 - ratio) * uFalsePerspFarCompress * uFalsePerspIntensity;
    }
  }
  gScale = clamp(gScale, 0.45, uFalsePerspMaxScale);
  return uFalsePerspCamPos
    + uFalsePerspCamRight * (cx * gScale)
    + uFalsePerspCamUp * (cy * gScale)
    + uFalsePerspCamForward * depth;
}
`.trim();

  const vertexTransformGlsl = /* glsl */ `
vec4 fpWorldPos = modelMatrix * vec4(transformed, 1.0);
fpWorldPos.xyz = applyStudioFalsePerspective(fpWorldPos.xyz);
gl_Position = projectionMatrix * viewMatrix * fpWorldPos;
`.trim();

  return {
    uniformDeclarationsGlsl,
    vertexTransformGlsl,
  };
}
