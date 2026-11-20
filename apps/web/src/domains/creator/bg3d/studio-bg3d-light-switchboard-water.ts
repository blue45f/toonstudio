/**
 * 3D 배경 실내 다중 조명 스위치보드, 평면 수면 반사 패스, 수평선 고정 스카이돔 엔진.
 *
 * - 최대 16개 로컬 조명(point / spot / area) 예산과 시맨틱 태그 기반 원클릭 그룹 제어
 * - 색온도(2200K~9500K) 정규화 RGB 변환, 발광(emissive) 재질 동기화, 툰 갓레이 콘 메타데이터 생성
 * - 평면 거울 반사 행렬(4x4), 0.5x DPR 렌더 타깃 명세, 결정론적 물결 UV 왜곡 + 슐릭 프레넬 툰 양자화
 * - 수평선 고정(Horizon Lock) 프로시저럴 툰 스카이돔 및 StudioBg3dShot 직렬화 지원
 */

export const BG3D_MAX_LOCAL_LIGHTS = 16;
export const BG3D_MIN_KELVIN = 2200;
export const BG3D_MAX_KELVIN = 9500;
export const BG3D_DEFAULT_WATER_DPR_SCALE = 0.5;
export const BG3D_MIN_WATER_TARGET_EDGE_PX = 64;

export type Bg3dLocalLightKind = "point" | "spot" | "area";

export type Bg3dLightSemanticTag =
  | "light:chandelier"
  | "light:lamp"
  | "light:neon"
  | "light:window";

export type RgbTuple = readonly [number, number, number];
export type Vec3Tuple = readonly [number, number, number];

export interface Bg3dGodRayConfig {
  readonly enabled: boolean;
  readonly coneLengthM: number;
  readonly coneRadiusM: number;
  readonly opacity01: number;
  readonly toonSteps: number;
}

export interface Bg3dLocalLightFixture {
  readonly id: string;
  readonly label: string;
  readonly kind: Bg3dLocalLightKind;
  readonly tag: Bg3dLightSemanticTag;
  readonly groupId: string;
  readonly enabled: boolean;
  readonly positionM: Vec3Tuple;
  readonly direction: Vec3Tuple;
  readonly kelvin: number;
  readonly intensity: number;
  readonly attenuationRadiusM: number;
  readonly innerConeDeg: number;
  readonly outerConeDeg: number;
  readonly emissiveMeshId?: string;
  readonly emissiveBoost: number;
  readonly godRay: Bg3dGodRayConfig;
}

export interface Bg3dLightSwitchGroup {
  readonly id: string;
  readonly label: string;
  readonly tag: Bg3dLightSemanticTag;
  readonly enabled: boolean;
}

export interface Bg3dLightSwitchboardState {
  readonly fixtures: readonly Bg3dLocalLightFixture[];
  readonly groups: readonly Bg3dLightSwitchGroup[];
  readonly masterDimmer01: number;
}

export type Bg3dLightMutationResult =
  | { readonly ok: true; readonly state: Bg3dLightSwitchboardState }
  | {
      readonly ok: false;
      readonly code: "LIGHT_BUDGET_EXCEEDED" | "DUPLICATE_FIXTURE_ID" | "INVALID_FIXTURE_ID";
      readonly message: string;
    };

export interface Bg3dEmissiveSyncTarget {
  readonly fixtureId: string;
  readonly meshId: string;
  readonly colorRgb: RgbTuple;
  readonly emissiveIntensity: number;
  readonly active: boolean;
}

export interface Bg3dGodRayMeshDescriptor {
  readonly fixtureId: string;
  readonly apexM: Vec3Tuple;
  readonly axis: Vec3Tuple;
  readonly lengthM: number;
  readonly baseRadiusM: number;
  readonly colorRgb: RgbTuple;
  readonly opacity01: number;
  readonly toonSteps: number;
}

export interface Bg3dCompiledSwitchboardPass {
  readonly activeLightCount: number;
  readonly totalFixtureCount: number;
  readonly emissiveTargets: readonly Bg3dEmissiveSyncTarget[];
  readonly godRayMeshes: readonly Bg3dGodRayMeshDescriptor[];
}

export interface Bg3dWaterReflectionConfig {
  readonly enabled: boolean;
  readonly planeHeightY: number;
  readonly planeNormal: Vec3Tuple;
  readonly dprScale: number;
  readonly toonQuantizationSteps: number;
  readonly waveAmplitude: number;
  readonly waveFrequency: number;
  readonly waveSpeed: number;
  readonly fresnelF0: number;
  readonly fresnelPower: number;
  readonly tintRgb: RgbTuple;
  readonly ltExportLayerKey: "water-reflection";
}

export interface Bg3dWaterRenderTargetSpec {
  readonly enabled: boolean;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly dprScale: number;
  readonly clipPlane: readonly [number, number, number, number];
  readonly reflectionMatrix4x4: readonly number[];
  readonly ltAlphaMaskPassId: "water-reflection";
}

export interface Bg3dWaterSurfaceSample {
  readonly distortedU: number;
  readonly distortedV: number;
  readonly rawFresnel01: number;
  readonly quantizedReflection01: number;
}

export type Bg3dSkyDomePresetId =
  | "clear-day"
  | "sunset-glow"
  | "night-city"
  | "overcast-rain";

export interface Bg3dSkyDomeState {
  readonly presetId: Bg3dSkyDomePresetId;
  readonly horizonLockEnabled: boolean;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly maxHorizonPitchDeg: number;
  readonly cloudCoverage01: number;
  readonly cloudDriftSpeed: number;
  readonly zenithRgb: RgbTuple;
  readonly horizonRgb: RgbTuple;
  readonly nadirRgb: RgbTuple;
  readonly sunDirection: Vec3Tuple;
  readonly sunIntensity: number;
}

export interface Bg3dAtmosphereLightingSnapshot {
  readonly schemaVersion: 1;
  readonly switchboard: Bg3dLightSwitchboardState;
  readonly water: Bg3dWaterReflectionConfig;
  readonly skyDome: Bg3dSkyDomeState;
}

const VALID_LIGHT_KINDS: ReadonlySet<Bg3dLocalLightKind> = new Set(["point", "spot", "area"]);
const VALID_LIGHT_TAGS: ReadonlySet<Bg3dLightSemanticTag> = new Set([
  "light:chandelier",
  "light:lamp",
  "light:neon",
  "light:window",
]);
const VALID_SKY_PRESETS: ReadonlySet<Bg3dSkyDomePresetId> = new Set([
  "clear-day",
  "sunset-glow",
  "night-city",
  "overcast-rain",
]);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeVec3(v: Vec3Tuple, fallback: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(len) || len <= 1e-6) {
    return fallback;
  }
  return [v[0] / len, v[1] / len, v[2] / len];
}

function defaultGroupLabel(tag: Bg3dLightSemanticTag): string {
  switch (tag) {
    case "light:chandelier":
      return "샹들리에 조명";
    case "light:lamp":
      return "스탠드·테이블 램프";
    case "light:neon":
      return "네온·간판 조명";
    case "light:window":
      return "창문 채광";
  }
}

/**
 * 켈빈(2200K~9500K) 색온도를 정규화 [0, 1] RGB 튜플로 변환한다.
 */
export function kelvinToNormalizedRgb(kelvin: number): RgbTuple {
  const temp = clamp(kelvin, BG3D_MIN_KELVIN, BG3D_MAX_KELVIN) / 100;

  let red: number;
  if (temp <= 66) {
    red = 255;
  } else {
    red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
  }

  let green: number;
  if (temp <= 66) {
    green = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }

  let blue: number;
  if (temp >= 66) {
    blue = 255;
  } else if (temp <= 19) {
    blue = 0;
  } else {
    blue = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  }

  return [
    clamp(red, 0, 255) / 255,
    clamp(green, 0, 255) / 255,
    clamp(blue, 0, 255) / 255,
  ];
}

function sanitizeFixture(fixture: Bg3dLocalLightFixture): Bg3dLocalLightFixture {
  const inner = clamp(fixture.innerConeDeg, 0, 89);
  const outer = clamp(Math.max(fixture.outerConeDeg, inner), 1, 90);
  return {
    ...fixture,
    direction: normalizeVec3(fixture.direction, [0, -1, 0]),
    kelvin: clamp(fixture.kelvin, BG3D_MIN_KELVIN, BG3D_MAX_KELVIN),
    intensity: clamp(fixture.intensity, 0, 20),
    attenuationRadiusM: clamp(fixture.attenuationRadiusM, 0.2, 200),
    innerConeDeg: inner,
    outerConeDeg: outer,
    emissiveBoost: clamp(fixture.emissiveBoost, 0, 10),
    godRay: {
      enabled: Boolean(fixture.godRay.enabled),
      coneLengthM: clamp(fixture.godRay.coneLengthM, 0.2, 50),
      coneRadiusM: clamp(fixture.godRay.coneRadiusM, 0.05, 15),
      opacity01: clamp(fixture.godRay.opacity01, 0, 1),
      toonSteps: Math.round(clamp(fixture.godRay.toonSteps, 1, 8)),
    },
  };
}

function syncGroupsWithFixtures(
  existingGroups: readonly Bg3dLightSwitchGroup[],
  fixtures: readonly Bg3dLocalLightFixture[],
): readonly Bg3dLightSwitchGroup[] {
  const byId = new Map<string, Bg3dLightSwitchGroup>();
  for (const group of existingGroups) {
    byId.set(group.id, group);
  }
  for (const fixture of fixtures) {
    if (!byId.has(fixture.groupId)) {
      byId.set(fixture.groupId, {
        id: fixture.groupId,
        label: defaultGroupLabel(fixture.tag),
        tag: fixture.tag,
        enabled: true,
      });
    }
  }
  return Array.from(byId.values());
}

/**
 * 실내 다중 조명 스위치보드 상태를 초기화한다. (최대 16개 조명 예산 적용)
 */
export function createBg3dLightSwitchboard(
  initialFixtures: readonly Bg3dLocalLightFixture[] = [],
  masterDimmer01 = 1,
): Bg3dLightSwitchboardState {
  const seenIds = new Set<string>();
  const fixtures: Bg3dLocalLightFixture[] = [];

  for (const raw of initialFixtures) {
    if (fixtures.length >= BG3D_MAX_LOCAL_LIGHTS) break;
    const trimmedId = raw.id.trim();
    if (!trimmedId || seenIds.has(trimmedId)) continue;
    seenIds.add(trimmedId);
    fixtures.push(sanitizeFixture({ ...raw, id: trimmedId }));
  }

  return {
    fixtures,
    groups: syncGroupsWithFixtures([], fixtures),
    masterDimmer01: clamp(masterDimmer01, 0, 1),
  };
}

/**
 * 스위치보드에 새 로컬 조명을 추가한다. 16개 예산을 초과하면 거부한다.
 */
export function addBg3dLocalLightFixture(
  state: Bg3dLightSwitchboardState,
  fixture: Bg3dLocalLightFixture,
): Bg3dLightMutationResult {
  const trimmedId = fixture.id.trim();
  if (!trimmedId) {
    return {
      ok: false,
      code: "INVALID_FIXTURE_ID",
      message: "조명 ID가 비어 있어 등록할 수 없습니다.",
    };
  }
  if (state.fixtures.some((item) => item.id === trimmedId)) {
    return {
      ok: false,
      code: "DUPLICATE_FIXTURE_ID",
      message: `이미 등록된 조명 ID입니다: ${trimmedId}`,
    };
  }
  if (state.fixtures.length >= BG3D_MAX_LOCAL_LIGHTS) {
    return {
      ok: false,
      code: "LIGHT_BUDGET_EXCEEDED",
      message: `실내 로컬 조명은 최대 ${BG3D_MAX_LOCAL_LIGHTS}개까지만 배치할 수 있습니다.`,
    };
  }

  const nextFixtures = [...state.fixtures, sanitizeFixture({ ...fixture, id: trimmedId })];
  return {
    ok: true,
    state: {
      ...state,
      fixtures: nextFixtures,
      groups: syncGroupsWithFixtures(state.groups, nextFixtures),
    },
  };
}

/**
 * 시맨틱 태그 또는 그룹 ID 단위로 실내 조명을 원클릭 ON/OFF 전환한다.
 */
export function toggleBg3dLightGroup(
  state: Bg3dLightSwitchboardState,
  groupIdOrTag: string,
  forceEnabled?: boolean,
): Bg3dLightSwitchboardState {
  const targetGroups = state.groups.filter(
    (g) => g.id === groupIdOrTag || g.tag === groupIdOrTag,
  );
  if (targetGroups.length === 0) return state;

  const targetGroupIds = new Set(targetGroups.map((g) => g.id));
  const currentAnyEnabled = targetGroups.some((g) => g.enabled);
  const nextEnabled = forceEnabled ?? !currentAnyEnabled;

  return {
    ...state,
    groups: state.groups.map((group) =>
      targetGroupIds.has(group.id) ? { ...group, enabled: nextEnabled } : group,
    ),
    fixtures: state.fixtures.map((fixture) =>
      targetGroupIds.has(fixture.groupId) ? { ...fixture, enabled: nextEnabled } : fixture,
    ),
  };
}

/**
 * 개별 조명 스위치 상태를 전환한다.
 */
export function toggleBg3dLightFixture(
  state: Bg3dLightSwitchboardState,
  fixtureId: string,
  forceEnabled?: boolean,
): Bg3dLightSwitchboardState {
  let changed = false;
  const fixtures = state.fixtures.map((fixture) => {
    if (fixture.id !== fixtureId) return fixture;
    changed = true;
    return { ...fixture, enabled: forceEnabled ?? !fixture.enabled };
  });
  return changed ? { ...state, fixtures } : state;
}

/**
 * 개별 조명의 색온도(K), 세기, 감쇠 반경을 갱신한다.
 */
export function updateBg3dLightFixtureParams(
  state: Bg3dLightSwitchboardState,
  fixtureId: string,
  patch: {
    readonly kelvin?: number;
    readonly intensity?: number;
    readonly attenuationRadiusM?: number;
    readonly emissiveBoost?: number;
  },
): Bg3dLightSwitchboardState {
  let changed = false;
  const fixtures = state.fixtures.map((fixture) => {
    if (fixture.id !== fixtureId) return fixture;
    changed = true;
    return sanitizeFixture({
      ...fixture,
      kelvin: patch.kelvin ?? fixture.kelvin,
      intensity: patch.intensity ?? fixture.intensity,
      attenuationRadiusM: patch.attenuationRadiusM ?? fixture.attenuationRadiusM,
      emissiveBoost: patch.emissiveBoost ?? fixture.emissiveBoost,
    });
  });
  return changed ? { ...state, fixtures } : state;
}

/**
 * 현재 스위치보드 상태를 발광 재질 동기화 목록과 툰 갓레이 콘 메시 명세로 컴파일한다.
 */
export function compileBg3dSwitchboardPass(
  state: Bg3dLightSwitchboardState,
): Bg3dCompiledSwitchboardPass {
  const groupEnabledMap = new Map<string, boolean>();
  for (const group of state.groups) {
    groupEnabledMap.set(group.id, group.enabled);
  }

  const dimmer = clamp(state.masterDimmer01, 0, 1);
  let activeLightCount = 0;
  const emissiveTargets: Bg3dEmissiveSyncTarget[] = [];
  const godRayMeshes: Bg3dGodRayMeshDescriptor[] = [];

  for (const fixture of state.fixtures) {
    const groupEnabled = groupEnabledMap.get(fixture.groupId) ?? true;
    const isActive = fixture.enabled && groupEnabled && dimmer > 0 && fixture.intensity > 0;
    const colorRgb = kelvinToNormalizedRgb(fixture.kelvin);
    const effectiveIntensity = isActive ? fixture.intensity * dimmer : 0;

    if (isActive) {
      activeLightCount += 1;
    }

    if (fixture.emissiveMeshId) {
      emissiveTargets.push({
        fixtureId: fixture.id,
        meshId: fixture.emissiveMeshId,
        colorRgb,
        emissiveIntensity: isActive ? effectiveIntensity * fixture.emissiveBoost : 0,
        active: isActive,
      });
    }

    if (isActive && fixture.godRay.enabled && fixture.godRay.opacity01 > 0) {
      godRayMeshes.push({
        fixtureId: fixture.id,
        apexM: fixture.positionM,
        axis: normalizeVec3(fixture.direction, [0, -1, 0]),
        lengthM: fixture.godRay.coneLengthM,
        baseRadiusM: fixture.godRay.coneRadiusM,
        colorRgb,
        opacity01: clamp(fixture.godRay.opacity01 * dimmer, 0, 1),
        toonSteps: fixture.godRay.toonSteps,
      });
    }
  }

  return {
    activeLightCount,
    totalFixtureCount: state.fixtures.length,
    emissiveTargets,
    godRayMeshes,
  };
}

/**
 * 법선 n과 평면 높이 y=planeHeightY(수평 기준)에 대한 4x4 열 우선(column-major) 거울 반사 행렬을 계산한다.
 * 평면 방정식: nx*x + ny*y + nz*z + d = 0 (점 (0, planeHeightY, 0) 통과 시 d = -ny * planeHeightY).
 */
export function computePlanarReflectionMatrix(
  planeNormal: Vec3Tuple,
  planeHeightY: number,
): readonly number[] {
  const [nx, ny, nz] = normalizeVec3(planeNormal, [0, 1, 0]);
  const d = -ny * planeHeightY;

  // column-major 4x4: M = I - 2 * [n; 0] * [n^T, d]
  return [
    1 - 2 * nx * nx,
    -2 * ny * nx,
    -2 * nz * nx,
    0,

    -2 * nx * ny,
    1 - 2 * ny * ny,
    -2 * nz * ny,
    0,

    -2 * nx * nz,
    -2 * ny * nz,
    1 - 2 * nz * nz,
    0,

    -2 * nx * d,
    -2 * ny * d,
    -2 * nz * d,
    1,
  ];
}

/**
 * 4x4 열 우선 행렬로 3D 좌표를 변환한다. (검증 및 카메라 미러링용)
 */
export function transformPointByMatrix4(
  matrix: readonly number[],
  point: Vec3Tuple,
): Vec3Tuple {
  const [x, y, z] = point;
  const rx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const ry = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const rz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
  const rw = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (Math.abs(rw) > 1e-6 && rw !== 1) {
    return [rx / rw, ry / rw, rz / rw];
  }
  return [rx, ry, rz];
}

/**
 * 기본 평면 수면 반사 설정을 생성한다.
 */
export function createDefaultWaterReflectionConfig(
  planeHeightY = 0,
): Bg3dWaterReflectionConfig {
  return {
    enabled: true,
    planeHeightY,
    planeNormal: [0, 1, 0],
    dprScale: BG3D_DEFAULT_WATER_DPR_SCALE,
    toonQuantizationSteps: 4,
    waveAmplitude: 0.012,
    waveFrequency: 8,
    waveSpeed: 1.2,
    fresnelF0: 0.04,
    fresnelPower: 5,
    tintRgb: [0.76, 0.88, 0.96],
    ltExportLayerKey: "water-reflection",
  };
}

/**
 * 뷰포트 해상도를 기준으로 0.5x DPR 평면 수면 반사 렌더 타깃 명세를 생성한다.
 */
export function buildWaterReflectionRenderTargetSpec(
  config: Bg3dWaterReflectionConfig,
  viewportWidthPx: number,
  viewportHeightPx: number,
): Bg3dWaterRenderTargetSpec {
  const dprScale = clamp(config.dprScale, 0.25, 1);
  const rawW = Math.round(Math.max(1, viewportWidthPx) * dprScale);
  const rawH = Math.round(Math.max(1, viewportHeightPx) * dprScale);
  const evenW = Math.max(BG3D_MIN_WATER_TARGET_EDGE_PX, rawW - (rawW % 2));
  const evenH = Math.max(BG3D_MIN_WATER_TARGET_EDGE_PX, rawH - (rawH % 2));
  const [nx, ny, nz] = normalizeVec3(config.planeNormal, [0, 1, 0]);
  const d = -ny * config.planeHeightY;

  return {
    enabled: config.enabled,
    widthPx: evenW,
    heightPx: evenH,
    dprScale,
    clipPlane: [nx, ny, nz, d],
    reflectionMatrix4x4: computePlanarReflectionMatrix([nx, ny, nz], config.planeHeightY),
    ltAlphaMaskPassId: config.ltExportLayerKey,
  };
}

/**
 * 슐릭(Schlick) 프레넬 반사율을 계산한다.
 */
export function schlickFresnel(
  viewDotNormal: number,
  f0 = 0.04,
  power = 5,
): number {
  const cosTheta = clamp(viewDotNormal, 0, 1);
  const baseF0 = clamp(f0, 0, 1);
  const exponent = clamp(power, 1, 10);
  return clamp(baseF0 + (1 - baseF0) * Math.pow(1 - cosTheta, exponent), 0, 1);
}

/**
 * 결정론적 2-옥타브 물결 UV 왜곡과 툰 양자화 프레넬 반사 계수를 평가한다.
 */
export function evaluateWaterSurfaceSample(
  config: Bg3dWaterReflectionConfig,
  u: number,
  v: number,
  timeSec: number,
  viewDotNormal: number,
): Bg3dWaterSurfaceSample {
  const freq = clamp(config.waveFrequency, 0.5, 64);
  const amp = clamp(config.waveAmplitude, 0, 0.25);
  const phase = timeSec * config.waveSpeed;

  const wave1 = Math.sin((u * freq + phase) * Math.PI * 2);
  const wave2 = Math.cos((v * freq * 1.37 - phase * 0.83) * Math.PI * 2);
  const micro = Math.sin(((u + v) * freq * 2.1 + phase * 1.41) * Math.PI * 2) * 0.35;

  const distortedU = clamp(u + (wave1 + micro) * amp, 0, 1);
  const distortedV = clamp(v + (wave2 - micro) * amp, 0, 1);

  const rawFresnel01 = schlickFresnel(viewDotNormal, config.fresnelF0, config.fresnelPower);
  const steps = Math.round(clamp(config.toonQuantizationSteps, 1, 12));
  const quantizedReflection01 =
    steps <= 1
      ? rawFresnel01
      : clamp(Math.round(rawFresnel01 * steps) / steps, 0, 1);

  return {
    distortedU,
    distortedV,
    rawFresnel01,
    quantizedReflection01,
  };
}

/**
 * 프로시저럴 툰 스카이돔 프리셋을 생성한다.
 */
export function createSkyDomePreset(presetId: Bg3dSkyDomePresetId): Bg3dSkyDomeState {
  switch (presetId) {
    case "clear-day":
      return {
        presetId,
        horizonLockEnabled: true,
        yawDeg: 35,
        pitchDeg: 0,
        maxHorizonPitchDeg: 6,
        cloudCoverage01: 0.32,
        cloudDriftSpeed: 0.4,
        zenithRgb: [0.22, 0.48, 0.86],
        horizonRgb: [0.76, 0.88, 0.98],
        nadirRgb: [0.46, 0.52, 0.58],
        sunDirection: normalizeVec3([0.55, 0.72, 0.42], [0, 1, 0]),
        sunIntensity: 1.0,
      };
    case "sunset-glow":
      return {
        presetId,
        horizonLockEnabled: true,
        yawDeg: 210,
        pitchDeg: 0,
        maxHorizonPitchDeg: 6,
        cloudCoverage01: 0.48,
        cloudDriftSpeed: 0.3,
        zenithRgb: [0.19, 0.22, 0.48],
        horizonRgb: [0.96, 0.52, 0.32],
        nadirRgb: [0.24, 0.16, 0.22],
        sunDirection: normalizeVec3([-0.75, 0.18, -0.63], [0, 1, 0]),
        sunIntensity: 0.88,
      };
    case "night-city":
      return {
        presetId,
        horizonLockEnabled: true,
        yawDeg: 140,
        pitchDeg: 0,
        maxHorizonPitchDeg: 6,
        cloudCoverage01: 0.25,
        cloudDriftSpeed: 0.2,
        zenithRgb: [0.04, 0.06, 0.14],
        horizonRgb: [0.16, 0.2, 0.34],
        nadirRgb: [0.05, 0.06, 0.09],
        sunDirection: normalizeVec3([-0.3, 0.65, 0.7], [0, 1, 0]),
        sunIntensity: 0.22,
      };
    case "overcast-rain":
      return {
        presetId,
        horizonLockEnabled: true,
        yawDeg: 90,
        pitchDeg: 0,
        maxHorizonPitchDeg: 6,
        cloudCoverage01: 0.86,
        cloudDriftSpeed: 0.75,
        zenithRgb: [0.38, 0.43, 0.49],
        horizonRgb: [0.64, 0.68, 0.72],
        nadirRgb: [0.3, 0.33, 0.36],
        sunDirection: normalizeVec3([0.2, 0.85, 0.48], [0, 1, 0]),
        sunIntensity: 0.42,
      };
  }
}

/**
 * 스카이돔 방위각과 고도각을 회전하며, 수평선 고정(Horizon Lock) 활성 시 피치 기울어짐을 차단한다.
 */
export function orientSkyDomeWithHorizonLock(
  skyDome: Bg3dSkyDomeState,
  nextYawDeg: number,
  nextPitchDeg: number,
): Bg3dSkyDomeState {
  const normalizedYaw = ((nextYawDeg % 360) + 360) % 360;
  const maxPitch = clamp(skyDome.maxHorizonPitchDeg, 0, 25);
  const clampedPitch = skyDome.horizonLockEnabled
    ? clamp(nextPitchDeg, -maxPitch, maxPitch)
    : clamp(nextPitchDeg, -85, 85);

  return {
    ...skyDome,
    yawDeg: normalizedYaw,
    pitchDeg: clampedPitch,
  };
}

/**
 * StudioBg3dShot 내부에 저장할 조명·수면·스카이돔 스냅샷을 직렬화한다.
 */
export function serializeBg3dAtmosphereSnapshot(
  snapshot: Bg3dAtmosphereLightingSnapshot,
): string {
  return JSON.stringify(snapshot);
}

/**
 * 직렬화된 조명·수면·스카이돔 스냅샷을 검증하며 복원한다.
 */
export function deserializeBg3dAtmosphereSnapshot(
  rawJson: string,
): Bg3dAtmosphereLightingSnapshot {
  const parsed: unknown = JSON.parse(rawJson);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("유효하지 않은 3D 배경 조명·환경 스냅샷 형식입니다.");
  }

  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    throw new Error("지원하지 않는 3D 배경 조명·환경 스냅샷 버전입니다.");
  }

  const sb = record.switchboard as Bg3dLightSwitchboardState | undefined;
  const water = record.water as Bg3dWaterReflectionConfig | undefined;
  const sky = record.skyDome as Bg3dSkyDomeState | undefined;
  if (!sb || !Array.isArray(sb.fixtures) || !water || !sky) {
    throw new Error("필수 조명·수면·스카이돔 필드가 누락되었습니다.");
  }
  if (!VALID_SKY_PRESETS.has(sky.presetId)) {
    throw new Error(`알 수 없는 스카이돔 프리셋입니다: ${String(sky.presetId)}`);
  }

  const validFixtures = sb.fixtures.filter(
    (item) => VALID_LIGHT_KINDS.has(item.kind) && VALID_LIGHT_TAGS.has(item.tag),
  );
  const switchboard = createBg3dLightSwitchboard(validFixtures, sb.masterDimmer01);
  const syncedGroups = switchboard.groups.map((group) => {
    const saved = sb.groups?.find((item) => item.id === group.id);
    return saved ? { ...group, label: saved.label, enabled: Boolean(saved.enabled) } : group;
  });

  return {
    schemaVersion: 1,
    switchboard: {
      ...switchboard,
      groups: syncedGroups,
    },
    water: {
      ...createDefaultWaterReflectionConfig(water.planeHeightY),
      ...water,
      planeNormal: normalizeVec3(water.planeNormal, [0, 1, 0]),
      dprScale: clamp(water.dprScale, 0.25, 1),
      ltExportLayerKey: "water-reflection",
    },
    skyDome: orientSkyDomeWithHorizonLock(
      {
        ...createSkyDomePreset(sky.presetId),
        ...sky,
        sunDirection: normalizeVec3(sky.sunDirection, [0, 1, 0]),
      },
      sky.yawDeg,
      sky.pitchDeg,
    ),
  };
}
