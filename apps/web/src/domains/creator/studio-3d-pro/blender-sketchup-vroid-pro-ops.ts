/**
 * SketchUp · Blender · VRoid 프로 3D 제작 기능 통합 내재화 연산 모듈 (T-028 ~ T-034).
 *
 * - SketchUp 프로(T-028~T-029): 동적 인터랙티브 컴포넌트(문·창문·커튼·조명 개폐),
 *   4계절 × 4시간대 조명·분위기 스위치, 자석 추론 스냅(끝점·중점·축선·직각·격자).
 * - Blender 프로(T-030~T-032): 3D 공간 펜선(Grease Pencil 스타일), 절차적 군중·가로등·소품 배치
 *   (Geometry Nodes 스타일 시드 분산), 비파괴 단계별 다듬기 스택, 사족 보행 탈것·무기 리깅 프리셋.
 * - VRoid 프로(T-033~T-034): 머리카락·의상 바람 물리 베이크, 눈·피부·헤어 셰이더 랩,
 *   52종 표정 블렌드셰이프(ARKit 52 표준) 편집기, VRM 1.0 내보내기 점검기.
 */

// ---------------------------------------------------------------------------
// 1. SketchUp 동적 인터랙티브 컴포넌트 · 4계절/시간대 · 추론 스냅
// ---------------------------------------------------------------------------

export interface DynamicStageComponentsState {
  /** 문 열림 각도 (0..110도) */
  readonly doorOpenDeg: number;
  /** 창문 열림 비율 (0..100%) */
  readonly windowOpenPercent: number;
  /** 커튼 걷힘 비율 (0..100%) */
  readonly curtainOpenPercent: number;
  /** 실내/스트링 조명 켜짐 여부 */
  readonly lampOn: boolean;
  /** 조명 밝기 (0..100%) */
  readonly lampIntensityPercent: number;
  /** 조명 색온도 (2400K..6500K) */
  readonly lampKelvin: number;
}

export type SeasonId = "spring" | "summer" | "autumn" | "winter";
export type TimeOfDayId = "dawn" | "noon" | "sunset" | "night";

export interface StageAtmospherePreset {
  readonly season: SeasonId;
  readonly timeOfDay: TimeOfDayId;
  readonly titleKo: string;
  readonly sunElevationDeg: number;
  readonly sunAzimuthDeg: number;
  readonly kelvin: number;
  readonly ambientStrength: number;
  readonly shadowContrast: number;
  readonly weatherParticleKo: string;
  readonly skyBadgeOklch: string;
}

export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type InferenceSnapKind =
  | "endpoint"
  | "midpoint"
  | "on-axis-x"
  | "on-axis-y"
  | "on-axis-z"
  | "perpendicular"
  | "grid";

export interface InferenceSnapTarget {
  readonly id: string;
  readonly start: Point3D;
  readonly end: Point3D;
}

export interface InferenceSnapResult {
  readonly kind: InferenceSnapKind;
  readonly snapped: Point3D;
  readonly guideKo: string;
  readonly distanceMeters: number;
}

export const INITIAL_DYNAMIC_STAGE_COMPONENTS: DynamicStageComponentsState = Object.freeze({
  doorOpenDeg: 35,
  windowOpenPercent: 50,
  curtainOpenPercent: 65,
  lampOn: true,
  lampIntensityPercent: 80,
  lampKelvin: 3200,
});

export function updateDynamicStageComponents(
  current: DynamicStageComponentsState,
  patch: Partial<DynamicStageComponentsState>,
): DynamicStageComponentsState {
  return {
    doorOpenDeg: Math.max(0, Math.min(110, Math.round(patch.doorOpenDeg ?? current.doorOpenDeg))),
    windowOpenPercent: Math.max(
      0,
      Math.min(100, Math.round(patch.windowOpenPercent ?? current.windowOpenPercent)),
    ),
    curtainOpenPercent: Math.max(
      0,
      Math.min(100, Math.round(patch.curtainOpenPercent ?? current.curtainOpenPercent)),
    ),
    lampOn: patch.lampOn ?? current.lampOn,
    lampIntensityPercent: Math.max(
      0,
      Math.min(100, Math.round(patch.lampIntensityPercent ?? current.lampIntensityPercent)),
    ),
    lampKelvin: Math.max(2400, Math.min(6500, Math.round(patch.lampKelvin ?? current.lampKelvin))),
  };
}

const SEASON_META: Readonly<
  Record<SeasonId, { readonly labelKo: string; readonly particleKo: string; readonly elevOffset: number }>
> = Object.freeze({
  spring: { labelKo: "봄", particleKo: "흩날리는 벚꽃 잎", elevOffset: 4 },
  summer: { labelKo: "여름", particleKo: "선명한 여름 햇살 먼지", elevOffset: 14 },
  autumn: { labelKo: "가을", particleKo: "따뜻한 단풍 잎", elevOffset: -4 },
  winter: { labelKo: "겨울", particleKo: "잔잔한 눈송이", elevOffset: -12 },
});

const TIME_META: Readonly<
  Record<
    TimeOfDayId,
    {
      readonly labelKo: string;
      readonly baseElev: number;
      readonly azimuth: number;
      readonly kelvin: number;
      readonly ambient: number;
      readonly contrast: number;
      readonly badgeOklch: string;
    }
  >
> = Object.freeze({
  dawn: {
    labelKo: "새벽",
    baseElev: 16,
    azimuth: 78,
    kelvin: 4400,
    ambient: 0.62,
    contrast: 0.58,
    badgeOklch: "oklch(0.76 0.09 285)",
  },
  noon: {
    labelKo: "정오",
    baseElev: 58,
    azimuth: 18,
    kelvin: 5600,
    ambient: 0.92,
    contrast: 0.72,
    badgeOklch: "oklch(0.84 0.08 220)",
  },
  sunset: {
    labelKo: "노을",
    baseElev: 18,
    azimuth: -72,
    kelvin: 3100,
    ambient: 0.68,
    contrast: 0.85,
    badgeOklch: "oklch(0.74 0.14 48)",
  },
  night: {
    labelKo: "밤",
    baseElev: 34,
    azimuth: -135,
    kelvin: 8200,
    ambient: 0.34,
    contrast: 0.92,
    badgeOklch: "oklch(0.38 0.08 265)",
  },
});

export function resolveSeasonTimeAtmosphere(
  season: SeasonId,
  timeOfDay: TimeOfDayId,
): StageAtmospherePreset {
  const s = SEASON_META[season];
  const t = TIME_META[timeOfDay];
  return {
    season,
    timeOfDay,
    titleKo: `${s.labelKo} · ${t.labelKo}`,
    sunElevationDeg: Math.max(8, Math.min(78, t.baseElev + s.elevOffset)),
    sunAzimuthDeg: t.azimuth,
    kelvin: t.kelvin,
    ambientStrength: t.ambient,
    shadowContrast: t.contrast,
    weatherParticleKo: s.particleKo,
    skyBadgeOklch: t.badgeOklch,
  };
}

/** SketchUp 스타일 자석 추론 스냅(끝점 -> 중점 -> 직각 -> 축선 -> 격자 우선순위). */
export function computeInferenceSnap(
  cursor: Point3D,
  targets: readonly InferenceSnapTarget[],
  gridStepMeters = 0.25,
  snapRadiusMeters = 0.18,
): InferenceSnapResult {
  const dist = (a: Point3D, b: Point3D): number =>
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  // 1. 끝점(Endpoint) 최우선
  let bestEnd: InferenceSnapResult | null = null;
  for (const target of targets) {
    for (const pt of [target.start, target.end]) {
      const d = dist(cursor, pt);
      if (d <= snapRadiusMeters && (!bestEnd || d < bestEnd.distanceMeters)) {
        bestEnd = {
          kind: "endpoint",
          snapped: pt,
          guideKo: "끝점에 맞춤",
          distanceMeters: Number(d.toFixed(4)),
        };
      }
    }
  }
  if (bestEnd) return bestEnd;

  // 2. 중점(Midpoint)
  for (const target of targets) {
    const mid: Point3D = {
      x: (target.start.x + target.end.x) * 0.5,
      y: (target.start.y + target.end.y) * 0.5,
      z: (target.start.z + target.end.z) * 0.5,
    };
    const d = dist(cursor, mid);
    if (d <= snapRadiusMeters) {
      return {
        kind: "midpoint",
        snapped: mid,
        guideKo: "가운데 지점에 맞춤",
        distanceMeters: Number(d.toFixed(4)),
      };
    }
  }

  // 3. 수선/직각 투영(Perpendicular)
  for (const target of targets) {
    const vx = target.end.x - target.start.x;
    const vy = target.end.y - target.start.y;
    const vz = target.end.z - target.start.z;
    const lenSq = vx * vx + vy * vy + vz * vz;
    if (lenSq < 1e-6) continue;
    const t =
      ((cursor.x - target.start.x) * vx +
        (cursor.y - target.start.y) * vy +
        (cursor.z - target.start.z) * vz) /
      lenSq;
    if (t > 0.05 && t < 0.95) {
      const proj: Point3D = {
        x: Number((target.start.x + vx * t).toFixed(4)),
        y: Number((target.start.y + vy * t).toFixed(4)),
        z: Number((target.start.z + vz * t).toFixed(4)),
      };
      const d = dist(cursor, proj);
      if (d <= snapRadiusMeters * 0.9) {
        return {
          kind: "perpendicular",
          snapped: proj,
          guideKo: "선분 직각 방향에 맞춤",
          distanceMeters: Number(d.toFixed(4)),
        };
      }
    }
  }

  // 4. 주축 정렬(X / Y / Z)
  const axisThreshold = snapRadiusMeters * 0.55;
  if (Math.abs(cursor.z) <= axisThreshold) {
    return {
      kind: "on-axis-x",
      snapped: { x: Number(cursor.x.toFixed(3)), y: Number(cursor.y.toFixed(3)), z: 0 },
      guideKo: "가로 기준선에 맞춤",
      distanceMeters: Number(Math.abs(cursor.z).toFixed(4)),
    };
  }
  if (Math.abs(cursor.x) <= axisThreshold) {
    return {
      kind: "on-axis-z",
      snapped: { x: 0, y: Number(cursor.y.toFixed(3)), z: Number(cursor.z.toFixed(3)) },
      guideKo: "깊이 기준선에 맞춤",
      distanceMeters: Number(Math.abs(cursor.x).toFixed(4)),
    };
  }
  if (Math.abs(cursor.y) <= axisThreshold) {
    return {
      kind: "on-axis-y",
      snapped: { x: Number(cursor.x.toFixed(3)), y: 0, z: Number(cursor.z.toFixed(3)) },
      guideKo: "바닥 높이에 맞춤",
      distanceMeters: Number(Math.abs(cursor.y).toFixed(4)),
    };
  }

  // 5. 격자(Grid) 스냅
  const step = Math.max(0.05, gridStepMeters);
  const snapped: Point3D = {
    x: Number((Math.round(cursor.x / step) * step).toFixed(3)),
    y: Number((Math.round(cursor.y / step) * step).toFixed(3)),
    z: Number((Math.round(cursor.z / step) * step).toFixed(3)),
  };
  return {
    kind: "grid",
    snapped,
    guideKo: `${Math.round(step * 100)}cm 격자에 맞춤`,
    distanceMeters: Number(dist(cursor, snapped).toFixed(4)),
  };
}

// ---------------------------------------------------------------------------
// 2. Blender 프로: 3D 공간 스트로크 · 절차적 분산 배치 · 비파괴 모디파이어 · 탈것/무기 리깅
// ---------------------------------------------------------------------------

export type SpatialStrokePresetId = "speedline" | "magic-rune" | "aura-ribbon" | "ink-callout";

export interface SpatialStrokePoint {
  readonly position: Point3D;
  readonly widthPx: number;
  readonly pressure: number;
}

export interface SpatialStroke3D {
  readonly id: string;
  readonly presetId: SpatialStrokePresetId;
  readonly points: readonly SpatialStrokePoint[];
  readonly totalLengthMeters: number;
}

/** 3D 공간 웹툰 펜선(Grease Pencil 스타일)을 스무딩과 필압 테이퍼로 생성한다. */
export function createGreasePencil3dStroke(
  rawPoints: readonly Point3D[],
  options: {
    readonly presetId: SpatialStrokePresetId;
    readonly baseWidthPx: number;
    readonly subdivisionsPerSegment?: number;
  },
): SpatialStroke3D {
  if (rawPoints.length < 2) {
    return {
      id: `stroke-${options.presetId}-empty`,
      presetId: options.presetId,
      points: rawPoints.map((position) => ({
        position,
        widthPx: options.baseWidthPx,
        pressure: 1,
      })),
      totalLengthMeters: 0,
    };
  }

  const subs = Math.max(1, Math.min(8, options.subdivisionsPerSegment ?? 3));
  const sampled: Point3D[] = [];
  for (let i = 0; i < rawPoints.length - 1; i += 1) {
    const a = rawPoints[i];
    const b = rawPoints[i + 1];
    for (let s = 0; s < subs; s += 1) {
      const t = s / subs;
      sampled.push({
        x: Number((a.x + (b.x - a.x) * t).toFixed(4)),
        y: Number((a.y + (b.y - a.y) * t).toFixed(4)),
        z: Number((a.z + (b.z - a.z) * t).toFixed(4)),
      });
    }
  }
  sampled.push(rawPoints[rawPoints.length - 1]);

  let totalLen = 0;
  const points: SpatialStrokePoint[] = sampled.map((position, idx) => {
    if (idx > 0) {
      const prev = sampled[idx - 1];
      totalLen += Math.hypot(
        position.x - prev.x,
        position.y - prev.y,
        position.z - prev.z,
      );
    }
    const u = sampled.length > 1 ? idx / (sampled.length - 1) : 0.5;
    // 양끝이 붓처럼 날렵하게 가늘어지는 필압 곡선
    const taper = Math.sin(u * Math.PI);
    const pressure = Number((0.18 + 0.82 * Math.pow(Math.max(0, taper), 0.7)).toFixed(3));
    return {
      position,
      pressure,
      widthPx: Number((options.baseWidthPx * pressure).toFixed(2)),
    };
  });

  return {
    id: `stroke-${options.presetId}-${points.length}`,
    presetId: options.presetId,
    points,
    totalLengthMeters: Number(totalLen.toFixed(3)),
  };
}

export type ProceduralScatterKind =
  | "crowd-silhouettes"
  | "street-lamps"
  | "blossom-petals"
  | "cafe-tables";

export interface ProceduralScatterConfig {
  readonly kind: ProceduralScatterKind;
  readonly count: number;
  readonly areaWidthMeters: number;
  readonly areaDepthMeters: number;
  readonly minSpacingMeters: number;
  readonly seed: number;
}

export interface ScatterInstance {
  readonly index: number;
  readonly position: Point3D;
  readonly yawDeg: number;
  readonly scale: number;
}

/** 결정적 시드 기반 절차적 소품·군중·가로등 분산 배치(Geometry Nodes 스타일). */
export function generateProceduralScatter(
  config: ProceduralScatterConfig,
): readonly ScatterInstance[] {
  let state = (Math.abs(Math.floor(config.seed)) || 1) >>> 0;
  const nextRand = (): number => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };

  const targetCount = Math.max(1, Math.min(80, Math.floor(config.count)));
  const instances: ScatterInstance[] = [];

  if (config.kind === "street-lamps") {
    // 가로등은 거리 양쪽 축선을 따라 질서 있게 정렬 배치
    const spacing = Math.max(config.minSpacingMeters, config.areaDepthMeters / targetCount);
    for (let i = 0; i < targetCount; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      instances.push({
        index: i,
        position: {
          x: Number((side * config.areaWidthMeters * 0.45).toFixed(3)),
          y: 0,
          z: Number((-config.areaDepthMeters * 0.5 + (i + 0.5) * spacing).toFixed(3)),
        },
        yawDeg: side < 0 ? 90 : -90,
        scale: 1,
      });
    }
    return instances;
  }

  const maxAttempts = targetCount * 24;
  for (let attempt = 0; attempt < maxAttempts && instances.length < targetCount; attempt += 1) {
    const x = (nextRand() - 0.5) * config.areaWidthMeters;
    const z = (nextRand() - 0.5) * config.areaDepthMeters;
    const y = config.kind === "blossom-petals" ? 0.6 + nextRand() * 2.4 : 0;

    const tooClose = instances.some(
      (other) => Math.hypot(other.position.x - x, other.position.z - z) < config.minSpacingMeters,
    );
    if (tooClose) continue;

    instances.push({
      index: instances.length,
      position: {
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3)),
        z: Number(z.toFixed(3)),
      },
      yawDeg: Math.round(nextRand() * 360),
      scale: Number((0.86 + nextRand() * 0.28).toFixed(2)),
    });
  }

  return instances;
}

export type ModifierKind =
  | "bevel"
  | "subsurf"
  | "mirror"
  | "array"
  | "solidify"
  | "weighted_normal";

export interface NonDestructiveModifierEntry {
  readonly id: string;
  readonly kind: ModifierKind;
  readonly labelKo: string;
  readonly enabled: boolean;
  readonly strength: number;
}

export interface ModifierStackEvaluation {
  readonly activeCount: number;
  readonly estimatedTriangles: number;
  readonly withinMobileHeroBudget: boolean;
  readonly summaryKo: string;
}

export const DEFAULT_MODIFIER_STACK: readonly NonDestructiveModifierEntry[] = Object.freeze([
  { id: "mod-mirror", kind: "mirror", labelKo: "좌우 대칭 복제", enabled: true, strength: 1 },
  { id: "mod-bevel", kind: "bevel", labelKo: "모서리 다듬기", enabled: true, strength: 2 },
  { id: "mod-subsurf", kind: "subsurf", labelKo: "곡면 부드럽게", enabled: false, strength: 1 },
  { id: "mod-array", kind: "array", labelKo: "반복 배열", enabled: false, strength: 3 },
  { id: "mod-wn", kind: "weighted_normal", labelKo: "면광택 깔끔 정리", enabled: true, strength: 1 },
]);

/** 비파괴 모디파이어 스택의 삼각형 예산과 활성 상태를 즉시 계산한다. */
export function evaluateModifierStack(
  baseTriangles: number,
  stack: readonly NonDestructiveModifierEntry[],
): ModifierStackEvaluation {
  let tris = Math.max(12, Math.floor(baseTriangles));
  let activeCount = 0;

  for (const mod of stack) {
    if (!mod.enabled) continue;
    activeCount += 1;
    if (mod.kind === "mirror") tris *= 2;
    else if (mod.kind === "bevel") tris = Math.round(tris * (1.25 + mod.strength * 0.22));
    else if (mod.kind === "subsurf") tris = Math.round(tris * Math.pow(4, Math.min(2, mod.strength)));
    else if (mod.kind === "array") tris *= Math.max(1, Math.min(8, Math.round(mod.strength)));
    else if (mod.kind === "solidify") tris = Math.round(tris * 2.1);
  }

  const withinMobileHeroBudget = tris <= 50_000;
  return {
    activeCount,
    estimatedTriangles: tris,
    withinMobileHeroBudget,
    summaryKo: withinMobileHeroBudget
      ? `활성 ${activeCount}단계 · 예상 면 수 ${tris.toLocaleString("ko-KR")} (모바일 쾌적)`
      : `활성 ${activeCount}단계 · 예상 면 수 ${tris.toLocaleString("ko-KR")} (단계 줄이기 권장)`,
  };
}

export interface QuadrupedAndWeaponRigPreset {
  readonly id: string;
  readonly category: "quadruped" | "weapon";
  readonly labelKo: string;
  readonly boneCount: number;
  readonly anchorBoneKo: string;
  readonly gaitOrGripModesKo: readonly string[];
}

export const QUADRUPED_AND_WEAPON_RIG_PRESETS: readonly QuadrupedAndWeaponRigPreset[] = Object.freeze([
  {
    id: "rofan-imperial-horse",
    category: "quadruped",
    labelKo: "로판 백마·제국 군마 (4족 보행)",
    boneCount: 38,
    anchorBoneKo: "안장 중앙 · 네 다리 지면 접지",
    gaitOrGripModesKo: ["우아한 걸음", "질주", "앞발 들기"],
  },
  {
    id: "murim-spirit-wolf",
    category: "quadruped",
    labelKo: "무협·헌터 영수 늑대 (4족 보행)",
    boneCount: 34,
    anchorBoneKo: "척추 · 꼬리 · 네 발톱",
    gaitOrGripModesKo: ["낮은 경계", "도약 포효", "달리기"],
  },
  {
    id: "murim-jade-sword-rig",
    category: "weapon",
    labelKo: "청옥보검 양손·한손 손잡이 리깅",
    boneCount: 5,
    anchorBoneKo: "오른손 손바닥 + 왼손 보조 앵커",
    gaitOrGripModesKo: ["한손 발도", "양손 상단", "등 뒤 거치"],
  },
  {
    id: "rofan-parasol-rig",
    category: "weapon",
    labelKo: "로판 레이스 양산·부채 리깅",
    boneCount: 4,
    anchorBoneKo: "오른손 손잡이 · 어깨 기대기",
    gaitOrGripModesKo: ["어깨 위 펼치기", "접어 들기"],
  },
]);

// ---------------------------------------------------------------------------
// 3. VRoid 프로: 바람 물리 베이크 · 눈/피부/헤어 셰이더 랩 · ARKit 52 표정 · VRM 1.0
// ---------------------------------------------------------------------------

export interface WindPhysicsBakeConfig {
  readonly windSpeedMps: number;
  readonly windDirectionDeg: number;
  readonly stiffness: number;
  readonly drag: number;
  readonly frameCount: number;
}

export interface WindPhysicsKeyframe {
  readonly frame: number;
  readonly hairSwayDeg: number;
  readonly capeSwayDeg: number;
  readonly ribbonFlutterDeg: number;
}

/** 의상·머리카락 바람 스프링 물리를 프레임별 결정적 키프레임으로 구워 낸다. */
export function bakeClothHairWindPhysics(
  config: WindPhysicsBakeConfig,
): readonly WindPhysicsKeyframe[] {
  const frames = Math.max(4, Math.min(120, Math.floor(config.frameCount)));
  const speed = Math.max(0, Math.min(20, config.windSpeedMps));
  const stiff = Math.max(0.1, Math.min(1, config.stiffness));
  const damping = Math.max(0.1, Math.min(0.95, config.drag));
  const dirSign = Math.cos((config.windDirectionDeg * Math.PI) / 180) >= 0 ? 1 : -1;

  const baseAngle = dirSign * Math.min(48, speed * (1.25 - stiff * 0.65) * 2.4);
  const result: WindPhysicsKeyframe[] = [];

  for (let frame = 0; frame < frames; frame += 1) {
    const t = frame / 24;
    const gust = Math.sin(t * 4.2) * 0.24 + Math.cos(t * 7.5) * 0.11;
    const settle = 1 - Math.exp(-t * (1.5 + damping * 2.5));
    const hair = baseAngle * settle * (1 + gust);
    const cape = baseAngle * 1.18 * settle * (1 + gust * 0.82);
    const ribbon = baseAngle * 1.38 * settle * (1 + Math.sin(t * 9.0) * 0.34);

    result.push({
      frame,
      hairSwayDeg: Number(hair.toFixed(2)),
      capeSwayDeg: Number(cape.toFixed(2)),
      ribbonFlutterDeg: Number(ribbon.toFixed(2)),
    });
  }
  return result;
}

export type EyeCatchlightShape = "star" | "heart" | "crescent" | "double-ring";

export interface VroidShaderLabState {
  readonly eyeCatchlight: EyeCatchlightShape;
  readonly irisDepthPercent: number;
  readonly skinPeachWarmthPercent: number;
  readonly hairAngelRingHeightPercent: number;
  readonly hairSheenSharpnessPercent: number;
}

export interface CompiledVroidShaderUniforms {
  readonly uCatchlightMode: 0 | 1 | 2 | 3;
  readonly uIrisGradientContrast: number;
  readonly uSkinSubsurfaceRgb: readonly [number, number, number];
  readonly uHairRingCenterV: number;
  readonly uHairSpecPower: number;
}

export const INITIAL_VROID_SHADER_LAB: VroidShaderLabState = Object.freeze({
  eyeCatchlight: "star",
  irisDepthPercent: 72,
  skinPeachWarmthPercent: 64,
  hairAngelRingHeightPercent: 58,
  hairSheenSharpnessPercent: 76,
});

export function compileVroidShaderLabUniforms(
  state: VroidShaderLabState,
): CompiledVroidShaderUniforms {
  const modeMap: Readonly<Record<EyeCatchlightShape, 0 | 1 | 2 | 3>> = {
    star: 0,
    heart: 1,
    crescent: 2,
    "double-ring": 3,
  };
  const warmth = Math.max(0, Math.min(100, state.skinPeachWarmthPercent)) / 100;
  return {
    uCatchlightMode: modeMap[state.eyeCatchlight],
    uIrisGradientContrast: Number((0.4 + (state.irisDepthPercent / 100) * 0.9).toFixed(3)),
    uSkinSubsurfaceRgb: [
      Number((0.88 + warmth * 0.10).toFixed(3)),
      Number((0.62 + warmth * 0.14).toFixed(3)),
      Number((0.66 - warmth * 0.08).toFixed(3)),
    ],
    uHairRingCenterV: Number((0.35 + (state.hairAngelRingHeightPercent / 100) * 0.45).toFixed(3)),
    uHairSpecPower: Number((12 + (state.hairSheenSharpnessPercent / 100) * 52).toFixed(1)),
  };
}

/** 표준 ARKit 52 표정 블렌드셰이프 전체 정본 키 목록 (52개 정확 일치) */
export const ARKIT_52_BLENDSHAPES = Object.freeze([
  "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
  "cheekPuff", "cheekSquintLeft", "cheekSquintRight",
  "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight",
  "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight",
  "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight",
  "eyeWideLeft", "eyeWideRight",
  "jawForward", "jawLeft", "jawOpen", "jawRight",
  "mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight",
  "mouthFunnel", "mouthLeft", "mouthLowerDownLeft", "mouthLowerDownRight",
  "mouthPressLeft", "mouthPressRight", "mouthPucker", "mouthRight",
  "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper",
  "mouthSmileLeft", "mouthSmileRight", "mouthStretchLeft", "mouthStretchRight",
  "mouthUpperUpLeft", "mouthUpperUpRight",
  "noseSneerLeft", "noseSneerRight", "tongueOut",
] as const);

export type Arkit52Key = (typeof ARKIT_52_BLENDSHAPES)[number];
export type ExpressionWeightMap = Readonly<Partial<Record<Arkit52Key, number>>>;

export type WebtoonExpressionRecipeId =
  | "rofan-flutter"
  | "duke-smirk"
  | "hunter-awaken"
  | "academy-bright"
  | "shocked-gasp"
  | "teary-plea";

export interface WebtoonExpressionRecipe {
  readonly id: WebtoonExpressionRecipeId;
  readonly labelKo: string;
  readonly weights: ExpressionWeightMap;
}

export const WEBTOON_EXPRESSION_RECIPES: readonly WebtoonExpressionRecipe[] = Object.freeze([
  { id: "rofan-flutter", labelKo: "로판 설렘", weights: { mouthSmileLeft: 0.52, mouthSmileRight: 0.52, cheekSquintLeft: 0.28, cheekSquintRight: 0.28, browInnerUp: 0.22, eyeWideLeft: 0.14, eyeWideRight: 0.14 } },
  { id: "duke-smirk", labelKo: "북부대공 냉소", weights: { browDownLeft: 0.34, browDownRight: 0.18, eyeSquintLeft: 0.26, eyeSquintRight: 0.22, mouthSmileRight: 0.42, mouthPressLeft: 0.24 } },
  { id: "hunter-awaken", labelKo: "헌터 각성", weights: { browDownLeft: 0.58, browDownRight: 0.58, eyeWideLeft: 0.36, eyeWideRight: 0.36, jawOpen: 0.22, noseSneerLeft: 0.25, noseSneerRight: 0.25 } },
  { id: "academy-bright", labelKo: "학원 환한 웃음", weights: { mouthSmileLeft: 0.82, mouthSmileRight: 0.82, cheekSquintLeft: 0.58, cheekSquintRight: 0.58, jawOpen: 0.18, browOuterUpLeft: 0.24, browOuterUpRight: 0.24 } },
  { id: "shocked-gasp", labelKo: "충격·당황", weights: { eyeWideLeft: 0.85, eyeWideRight: 0.85, browInnerUp: 0.72, browOuterUpLeft: 0.54, browOuterUpRight: 0.54, jawOpen: 0.56, mouthFunnel: 0.32 } },
  { id: "teary-plea", labelKo: "눈물 고임", weights: { browInnerUp: 0.82, eyeSquintLeft: 0.34, eyeSquintRight: 0.34, mouthFrownLeft: 0.46, mouthFrownRight: 0.46, mouthLowerDownLeft: 0.18, mouthLowerDownRight: 0.18 } },
]);

export function setBlendshapeWeight(
  weights: ExpressionWeightMap,
  key: Arkit52Key,
  value: number,
): ExpressionWeightMap {
  return {
    ...weights,
    [key]: Number(Math.max(0, Math.min(1, value)).toFixed(2)),
  };
}

export interface Vrm1ExportSettings {
  readonly title: string;
  readonly author: string;
  readonly commercialUsageAllowed: boolean;
  readonly bakeUnifiedScreenOutline: boolean;
  readonly includeSpringBones: boolean;
  readonly includeArkit52Expressions: boolean;
  readonly targetMaxTriangles: number;
  readonly currentTriangles: number;
}

export interface Vrm1ExportValidation {
  readonly ready: boolean;
  readonly specVersion: "VRM-1.0";
  readonly estimatedSizeKb: number;
  readonly issuesKo: readonly string[];
}

export function validateVrm1ExportSettings(
  settings: Vrm1ExportSettings,
): Vrm1ExportValidation {
  const issuesKo: string[] = [];
  if (settings.title.trim().length < 2) {
    issuesKo.push("캐릭터 이름을 2글자 이상 입력해 주세요.");
  }
  if (settings.author.trim().length < 1) {
    issuesKo.push("제작자 이름을 입력해 주세요.");
  }
  if (settings.currentTriangles > settings.targetMaxTriangles) {
    issuesKo.push(
      `현재 면 수(${settings.currentTriangles.toLocaleString("ko-KR")})가 목표 상한(${settings.targetMaxTriangles.toLocaleString("ko-KR")})을 넘습니다.`,
    );
  }
  const baseKb = Math.round(settings.currentTriangles * 0.032);
  const exprKb = settings.includeArkit52Expressions ? 140 : 25;
  const springKb = settings.includeSpringBones ? 18 : 0;

  return {
    ready: issuesKo.length === 0,
    specVersion: "VRM-1.0",
    estimatedSizeKb: baseKb + exprKb + springKb,
    issuesKo,
  };
}
