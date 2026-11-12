/**
 * Studio 3D 데생 인형 v3 — 에코르셰(Écorché) 해부학 근육 면·유기 단면 로프트·2D 핸드 셋업 엔진.
 *
 * 클립스튜디오 기본 데생 인형의 단조로운 튜브형 실루엣을 넘어, 작가가 인체의 큰 면 전환(Asaro/Loomis),
 * 흉곽 아치·대흉근·삼각근·복직근·외복사근·견갑골·광배근·목빗근·내측광근(VMO)·비복근·비대칭 복숭아뼈,
 * 관절 굴곡에 따른 능동 근육 팽창(Dynamic Flexion Bulge), 손가락 벌림(Spread)·엄지 대립(Opposition)을
 * 즉시 읽고 제어할 수 있도록 순수 결정적 데이터 스펙을 생성한다.
 *
 * Three.js 비의존 순수 모듈 — 단위 테스트와 직렬화가 안전하다.
 */

import {
  STUDIO_MANNEQUIN_FINGER_NAMES,
  STUDIO_MANNEQUIN_FINGER_SEGMENT_MAX_DEG,
  blendStudioMannequinBuild,
  clampStudioMannequinFingerPose,
  type StudioMannequinFingerName,
  type StudioMannequinFingerPose,
  type StudioMannequinFingerSegmentCurls,
  type StudioMannequinJointId,
  type StudioMannequinPrimitiveMaterialRole,
  type StudioMannequinPrimitiveSpec,
  type StudioMannequinSpec,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import type { StudioMannequinPose } from "./studio-mannequin-poses";

export type StudioMannequinSurfaceMode = "standard" | "ecorche" | "planar";

export const STUDIO_MANNEQUIN_SURFACE_MODES: readonly {
  readonly id: StudioMannequinSurfaceMode;
  readonly label: string;
  readonly desc: string;
}[] = Object.freeze([
  {
    id: "ecorche",
    label: "에코르셰 해부학",
    desc: "대흉근·삼각근·흉곽 아치·비복근·비대칭 복숭아뼈와 유기적 로프트 곡면을 함께 표시합니다.",
  },
  {
    id: "planar",
    label: "아사로 다면체",
    desc: "명암 경계선(Terminator)과 큰 덩어리 면 전환을 읽기 쉽게 각진 조형 면으로 표시합니다.",
  },
  {
    id: "standard",
    label: "클래식 마네킹",
    desc: "기본 구·캡슐 중심의 경량 데생 마네킹 형태로 표시합니다.",
  },
]);

export function resolveStudioMannequinSurfaceMode(
  value: unknown,
): StudioMannequinSurfaceMode {
  return value === "standard" || value === "ecorche" || value === "planar"
    ? value
    : "ecorche";
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ── 관절 굴곡 기반 능동 근육 팽창(Dynamic Flexion Bulge) ────────────────────

export interface StudioMannequinFlexionBulge {
  /** 왼팔 팔꿈치 굴곡에 따른 상완 이두·전완 근복 팽창 배율 (1.0 ~ 1.22). */
  readonly leftBicepScale: number;
  readonly rightBicepScale: number;
  /** 무릎 굴곡에 따른 종아리 비복근·대퇴 후면 팽창 배율 (1.0 ~ 1.18). */
  readonly leftCalfScale: number;
  readonly rightCalfScale: number;
  /** 고관절 굴곡에 따른 둔근 신장/수축 배율 (0.94 ~ 1.14). */
  readonly leftGluteScale: number;
  readonly rightGluteScale: number;
}

/**
 * 포즈의 팔꿈치·무릎·고관절 굽힘 각도로부터 능동 근육 부피 변화율을 계산한다.
 * 클립스튜디오처럼 두 원통이 단순히 파고드는 대신, 팔을 접으면 이두박근이 자연스럽게 부풀어 오른다.
 */
export function computeStudioMannequinFlexionBulge(
  pose?: StudioMannequinPose | null,
  muscleDefinition = 1,
): StudioMannequinFlexionBulge {
  const def = clamp(muscleDefinition, 0, 1.5, 1);
  if (!pose || def <= 0) {
    return {
      leftBicepScale: 1,
      rightBicepScale: 1,
      leftCalfScale: 1,
      rightCalfScale: 1,
      leftGluteScale: 1,
      rightGluteScale: 1,
    };
  }
  const elbowRatio = (jointId: "leftLowerArm" | "rightLowerArm"): number => {
    const x = pose.joints[jointId]?.[0] ?? 0;
    // 팔꿈치 굴곡은 음수 X (-158° ~ 0°)
    return Math.min(1, Math.max(0, -x / rad(145)));
  };
  const kneeRatio = (jointId: "leftLowerLeg" | "rightLowerLeg"): number => {
    const x = pose.joints[jointId]?.[0] ?? 0;
    // 무릎 굴곡은 양수 X (0° ~ +158°)
    return Math.min(1, Math.max(0, x / rad(145)));
  };
  const hipRatio = (jointId: "leftUpperLeg" | "rightUpperLeg"): number => {
    const x = pose.joints[jointId]?.[0] ?? 0;
    return Math.min(1, Math.max(-0.5, -x / rad(110)));
  };

  return {
    leftBicepScale: 1 + 0.22 * elbowRatio("leftLowerArm") * def,
    rightBicepScale: 1 + 0.22 * elbowRatio("rightLowerArm") * def,
    leftCalfScale: 1 + 0.18 * kneeRatio("leftLowerLeg") * def,
    rightCalfScale: 1 + 0.18 * kneeRatio("rightLowerLeg") * def,
    leftGluteScale: 1 + 0.12 * hipRatio("leftUpperLeg") * def,
    rightGluteScale: 1 + 0.12 * hipRatio("rightUpperLeg") * def,
  };
}

// ── 유기적 다중 단면 로프트(Organic Multi-Section Loft) 스펙 ────────────────

export interface StudioMannequinLoftSection {
  readonly center: StudioMannequinVec3;
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly twistRad: number;
}

export interface StudioMannequinLoftTubeSpec {
  readonly id: string;
  readonly jointId: StudioMannequinJointId;
  readonly materialRole: StudioMannequinPrimitiveMaterialRole;
  /** 슈퍼엘립스 지수: 2.0=타원, 1.4~1.85=근육 평면감이 살아있는 사각-타원 단면. */
  readonly superellipsePower: number;
  readonly radialSegments: number;
  readonly flatShaded: boolean;
  readonly sections: readonly StudioMannequinLoftSection[];
}

export interface StudioMannequinEcorcheOptions {
  readonly surfaceMode?: StudioMannequinSurfaceMode;
  readonly pose?: StudioMannequinPose | null;
  /** 흉부/대흉근 볼륨 배율 (0.75 ~ 1.4). 기본 1.0. */
  readonly pectoralVolume?: number;
  /** 에코르셰 근육 선명도 (0.0 ~ 1.5). 기본 1.0. */
  readonly muscleDefinition?: number;
}

/**
 * 에코르셰 및 아사로 다면체 모드용 유기적 단면 로프트 튜브 목록을 생성한다.
 * 기존 프리미티브와 달리 상완→전완 회내 테이퍼, 허벅지→무릎, 종아리→아킬레스건 수축을 한 덩어리 곡면으로 잇는다.
 */
export function buildStudioMannequinLoftTubes(
  spec: StudioMannequinSpec,
  options: StudioMannequinEcorcheOptions = {},
): readonly StudioMannequinLoftTubeSpec[] {
  const mode = resolveStudioMannequinSurfaceMode(options.surfaceMode);
  if (mode === "standard") return [];

  const hu = spec.headUnit;
  const p = spec.params;
  const build = blendStudioMannequinBuild(p.build);
  const bulge = computeStudioMannequinFlexionBulge(options.pose, options.muscleDefinition ?? 1);
  const torsoDepth = p.torsoDepth ?? 1;
  const chestWidth = p.chestWidth ?? 1;
  const waistWidth = p.waistWidth ?? 1;
  const limbR = build.limbRadius * (p.limbThickness ?? 1);
  const upperArmR = limbR * (p.upperArmThickness ?? 1);
  const forearmR = limbR * (p.forearmThickness ?? 1);
  const thighR = limbR * (p.thighThickness ?? 1);
  const calfR = limbR * (p.calfThickness ?? 1);

  const isPlanar = mode === "planar";
  const power = isPlanar ? 1.42 : 1.84;
  const segs = isPlanar ? 10 : 22;

  const spineJoint = spec.joints.find((j) => j.id === "spine");
  const chestJoint = spec.joints.find((j) => j.id === "chest");
  const neckJoint = spec.joints.find((j) => j.id === "neck");
  const torsoLen =
    (spineJoint?.offset[1] ?? 0.16) +
    (chestJoint?.offset[1] ?? 0.18) +
    (neckJoint?.offset[1] ?? 0.18);

  const tubes: StudioMannequinLoftTubeSpec[] = [
    // 복부~흉곽 연결 코어 로프트
    {
      id: "loft-spine-waist",
      jointId: "spine",
      materialRole: "body",
      superellipsePower: power,
      radialSegments: segs,
      flatShaded: isPlanar,
      sections: [
        { center: [0, -0.22 * torsoLen, 0], radiusX: 0.34 * hu * p.pelvisWidth, radiusZ: 0.23 * hu * torsoDepth, twistRad: 0 },
        { center: [0, 0.02 * torsoLen, 0.01 * hu], radiusX: 0.29 * hu * build.torsoLower * waistWidth, radiusZ: 0.21 * hu * torsoDepth, twistRad: 0 },
        { center: [0, 0.28 * torsoLen, 0.012 * hu], radiusX: 0.34 * hu * build.torsoUpper * waistWidth, radiusZ: 0.24 * hu * torsoDepth, twistRad: 0 },
      ],
    },
    {
      id: "loft-chest-ribcage",
      jointId: "chest",
      materialRole: "body",
      superellipsePower: power,
      radialSegments: segs,
      flatShaded: isPlanar,
      sections: [
        { center: [0, -0.04 * torsoLen, 0.008 * hu], radiusX: 0.36 * hu * build.torsoUpper * chestWidth, radiusZ: 0.25 * hu * torsoDepth, twistRad: 0 },
        { center: [0, 0.16 * torsoLen, 0], radiusX: 0.46 * hu * p.shoulderWidth * chestWidth * build.torsoUpper, radiusZ: 0.27 * hu * torsoDepth, twistRad: 0 },
        { center: [0, 0.31 * torsoLen, -0.008 * hu], radiusX: 0.42 * hu * p.shoulderWidth * chestWidth, radiusZ: 0.23 * hu * torsoDepth, twistRad: 0 },
        { center: [0, 0.36 * torsoLen, -0.01 * hu], radiusX: 0.22 * hu, radiusZ: 0.17 * hu * torsoDepth, twistRad: 0 },
      ],
    },
  ];

  for (const side of ["left", "right"] as const) {
    const sign = side === "left" ? 1 : -1;
    const armChain = spec.chains[side === "left" ? "leftArm" : "rightArm"];
    const legChain = spec.chains[side === "left" ? "leftLeg" : "rightLeg"];
    const bicepScale = side === "left" ? bulge.leftBicepScale : bulge.rightBicepScale;
    const calfScale = side === "left" ? bulge.leftCalfScale : bulge.rightCalfScale;
    const uArm = armChain.upperLength;
    const fArm = armChain.lowerLength;
    const uLeg = legChain.upperLength;
    const lLeg = legChain.lowerLength;

    tubes.push(
      {
        id: `loft-${side}-upper-arm`,
        jointId: side === "left" ? "leftUpperArm" : "rightUpperArm",
        materialRole: "body",
        superellipsePower: power,
        radialSegments: isPlanar ? 8 : 18,
        flatShaded: isPlanar,
        sections: [
          { center: [0, -0.04 * uArm, 0], radiusX: 0.132 * hu * upperArmR, radiusZ: 0.136 * hu * upperArmR, twistRad: 0 },
          { center: [0, -0.44 * uArm, 0.012 * hu * (bicepScale - 1) * 4], radiusX: 0.124 * hu * upperArmR * Math.sqrt(bicepScale), radiusZ: 0.138 * hu * upperArmR * bicepScale, twistRad: 0 },
          { center: [0, -0.94 * uArm, 0], radiusX: 0.104 * hu * upperArmR, radiusZ: 0.096 * hu * upperArmR, twistRad: 0 },
        ],
      },
      {
        id: `loft-${side}-forearm`,
        jointId: side === "left" ? "leftLowerArm" : "rightLowerArm",
        materialRole: "body",
        superellipsePower: power,
        radialSegments: isPlanar ? 8 : 18,
        flatShaded: isPlanar,
        sections: [
          { center: [0, -0.04 * fArm, 0], radiusX: 0.108 * hu * forearmR, radiusZ: 0.104 * hu * forearmR, twistRad: 0 },
          { center: [sign * 0.006 * hu, -0.28 * fArm, 0.006 * hu], radiusX: 0.122 * hu * forearmR, radiusZ: 0.108 * hu * forearmR, twistRad: sign * 0.14 },
          { center: [0, -0.72 * fArm, 0], radiusX: 0.092 * hu * forearmR, radiusZ: 0.076 * hu * forearmR, twistRad: sign * 0.28 },
          { center: [0, -0.96 * fArm, 0], radiusX: 0.086 * hu * forearmR, radiusZ: 0.062 * hu * forearmR, twistRad: sign * 0.36 },
        ],
      },
      {
        id: `loft-${side}-thigh`,
        jointId: side === "left" ? "leftUpperLeg" : "rightUpperLeg",
        materialRole: "body",
        superellipsePower: power,
        radialSegments: isPlanar ? 10 : 20,
        flatShaded: isPlanar,
        sections: [
          { center: [0, -0.04 * uLeg, -0.012 * hu], radiusX: 0.184 * hu * thighR, radiusZ: 0.194 * hu * thighR, twistRad: 0 },
          { center: [sign * 0.008 * hu, -0.42 * uLeg, 0.01 * hu], radiusX: 0.176 * hu * thighR, radiusZ: 0.186 * hu * thighR, twistRad: 0 },
          { center: [0, -0.78 * uLeg, 0.006 * hu], radiusX: 0.146 * hu * thighR, radiusZ: 0.152 * hu * thighR, twistRad: 0 },
          { center: [0, -0.96 * uLeg, 0], radiusX: 0.132 * hu * thighR, radiusZ: 0.136 * hu * thighR, twistRad: 0 },
        ],
      },
      {
        id: `loft-${side}-calf`,
        jointId: side === "left" ? "leftLowerLeg" : "rightLowerLeg",
        materialRole: "body",
        superellipsePower: power,
        radialSegments: isPlanar ? 10 : 20,
        flatShaded: isPlanar,
        sections: [
          { center: [0, -0.04 * lLeg, 0], radiusX: 0.132 * hu * calfR, radiusZ: 0.136 * hu * calfR, twistRad: 0 },
          { center: [sign * 0.005 * hu, -0.32 * lLeg, -0.022 * hu * calfScale], radiusX: 0.146 * hu * calfR * Math.sqrt(calfScale), radiusZ: 0.162 * hu * calfR * calfScale, twistRad: 0 },
          { center: [0, -0.68 * lLeg, -0.006 * hu], radiusX: 0.104 * hu * calfR, radiusZ: 0.112 * hu * calfR, twistRad: 0 },
          { center: [0, -0.96 * lLeg, 0], radiusX: 0.086 * hu * calfR, radiusZ: 0.094 * hu * calfR, twistRad: 0 },
        ],
      },
    );
  }

  return tubes;
}

/**
 * 에코르셰 해부학 근육 블록 및 골격 랜드마크 프리미티브를 생성한다.
 * 불변식: head 관절에 추가하는 프리미티브가 없으므로 studioMannequinRestStature(spec) === heightM 을 100% 보존한다.
 */
export function buildStudioMannequinEcorchePrimitives(
  spec: StudioMannequinSpec,
  options: StudioMannequinEcorcheOptions = {},
): readonly StudioMannequinPrimitiveSpec[] {
  const mode = resolveStudioMannequinSurfaceMode(options.surfaceMode);
  if (mode === "standard") return [];

  const def = clamp(options.muscleDefinition, 0, 1.5, 1);
  const pecVol = clamp(options.pectoralVolume, 0.75, 1.4, 1);
  const bulge = computeStudioMannequinFlexionBulge(options.pose, def);
  const hu = spec.headUnit;
  const p = spec.params;
  const build = blendStudioMannequinBuild(p.build);
  const torsoDepth = p.torsoDepth ?? 1;
  const chestWidth = p.chestWidth ?? 1;
  const pelvisDepth = p.pelvisDepth ?? 1;
  const waistWidth = p.waistWidth ?? 1;
  const limbR = build.limbRadius * (p.limbThickness ?? 1);
  const upperArmR = limbR * (p.upperArmThickness ?? 1);
  const forearmR = limbR * (p.forearmThickness ?? 1);
  const thighR = limbR * (p.thighThickness ?? 1);
  const calfR = limbR * (p.calfThickness ?? 1);
  const handLen = 0.085 * spec.heightM * p.armLength * (p.handScale ?? 1);
  const neckLen = 0.26 * hu;

  const spineJoint = spec.joints.find((j) => j.id === "spine");
  const chestJoint = spec.joints.find((j) => j.id === "chest");
  const neckJoint = spec.joints.find((j) => j.id === "neck");
  const torsoLen =
    (spineJoint?.offset[1] ?? 0.16) +
    (chestJoint?.offset[1] ?? 0.18) +
    (neckJoint?.offset[1] ?? 0.18);

  const muscleScale = 0.88 + 0.16 * def;
  const out: StudioMannequinPrimitiveSpec[] = [];

  for (const side of [-1, 1] as const) {
    const isLeft = side === 1;
    const uArmId = isLeft ? "leftUpperArm" : "rightUpperArm";
    const lArmId = isLeft ? "leftLowerArm" : "rightLowerArm";
    const handId = isLeft ? "leftHand" : "rightHand";
    const uLegId = isLeft ? "leftUpperLeg" : "rightUpperLeg";
    const lLegId = isLeft ? "leftLowerLeg" : "rightLowerLeg";
    const footId = isLeft ? "leftFoot" : "rightFoot";
    const bicepBulge = isLeft ? bulge.leftBicepScale : bulge.rightBicepScale;
    const calfBulge = isLeft ? bulge.leftCalfScale : bulge.rightCalfScale;
    const gluteBulge = isLeft ? bulge.leftGluteScale : bulge.rightGluteScale;
    const uArmLen = spec.chains[isLeft ? "leftArm" : "rightArm"].upperLength;
    const fArmLen = spec.chains[isLeft ? "leftArm" : "rightArm"].lowerLength;
    const uLegLen = spec.chains[isLeft ? "leftLeg" : "rightLeg"].upperLength;
    const lLegLen = spec.chains[isLeft ? "leftLeg" : "rightLeg"].lowerLength;

    // 1. 대흉근(Pectoralis Major) + 흉곽 하단 아치(Costal Arch) + 견갑골(Scapula) + 광배근(Latissimus) + 승모근(Trapezius)
    out.push(
      {
        kind: "sphere",
        jointId: "chest",
        center: [side * 0.175 * hu * p.shoulderWidth * chestWidth, 0.21 * torsoLen, 0.19 * hu * torsoDepth],
        radius: 0.135 * hu * build.torsoUpper * pecVol * muscleScale,
        scale: [1.18, 0.78, 0.56 * pecVol],
        materialRole: "body",
      },
      {
        kind: "capsule",
        jointId: "chest",
        from: [side * 0.025 * hu, 0.065 * torsoLen, 0.232 * hu * torsoDepth],
        to: [side * 0.22 * hu * chestWidth, -0.02 * torsoLen, 0.165 * hu * torsoDepth],
        radius: 0.019 * hu,
        endRadius: 0.013 * hu,
        materialRole: "landmark",
      },
      {
        kind: "sphere",
        jointId: "chest",
        center: [side * 0.19 * hu * p.shoulderWidth * chestWidth, 0.20 * torsoLen, -0.205 * hu * torsoDepth],
        radius: 0.115 * hu * muscleScale,
        scale: [0.85, 1.15, 0.34],
        materialRole: "landmark",
      },
      {
        kind: "sphere",
        jointId: "chest",
        center: [side * 0.31 * hu * p.shoulderWidth * chestWidth, 0.11 * torsoLen, -0.04 * hu * torsoDepth],
        radius: 0.11 * hu * build.torsoUpper * muscleScale,
        scale: [0.62, 1.65, 0.88],
        materialRole: "body",
      },
      {
        kind: "capsule",
        jointId: "chest",
        from: [side * 0.08 * hu, 0.355 * torsoLen + 0.06 * hu, -0.03 * hu],
        to: [side * 0.38 * hu * p.shoulderWidth, 0.295 * torsoLen, -0.01 * hu],
        radius: 0.055 * hu * muscleScale,
        endRadius: 0.038 * hu * muscleScale,
        materialRole: "body",
      },
    );

    // 2. 목빗근(SCM) V라인 랜드마크
    out.push({
      kind: "capsule",
      jointId: "neck",
      from: [side * 0.035 * hu, 0.01 * hu, 0.088 * hu],
      to: [side * 0.105 * hu * (p.neckThickness ?? 1), neckLen * 0.92, -0.015 * hu],
      radius: 0.022 * hu * muscleScale,
      endRadius: 0.018 * hu * muscleScale,
      materialRole: "landmark",
    });

    // 3. 복직근(Rectus Abdominis) 2단 + 외복사근(External Oblique) 옆구리 패드
    out.push(
      {
        kind: "sphere",
        jointId: "spine",
        center: [side * 0.072 * hu * waistWidth, 0.14 * torsoLen, 0.158 * hu * torsoDepth],
        radius: 0.068 * hu * muscleScale,
        scale: [0.88, 1.12, 0.42],
        materialRole: "body",
      },
      {
        kind: "sphere",
        jointId: "spine",
        center: [side * 0.070 * hu * waistWidth, -0.02 * torsoLen, 0.154 * hu * torsoDepth],
        radius: 0.066 * hu * muscleScale,
        scale: [0.86, 1.18, 0.42],
        materialRole: "body",
      },
      {
        kind: "sphere",
        jointId: "spine",
        center: [side * 0.235 * hu * waistWidth * build.torsoLower, -0.05 * torsoLen, 0.01 * hu],
        radius: 0.082 * hu * muscleScale,
        scale: [0.58, 1.35, 0.92 * torsoDepth],
        materialRole: "body",
      },
    );

    // 4. 상전장골극(ASIS) 골반 전면 랜드마크 + 대둔근(Gluteus Maximus) 능동 부피
    out.push(
      {
        kind: "sphere",
        jointId: "pelvis",
        center: [side * 0.285 * hu * p.pelvisWidth, 0.095 * hu, 0.195 * hu * torsoDepth * pelvisDepth],
        radius: 0.036 * hu,
        scale: [0.9, 0.85, 0.72],
        materialRole: "landmark",
      },
      {
        kind: "sphere",
        jointId: "pelvis",
        center: [side * 0.165 * hu * p.pelvisWidth, -0.035 * hu, -0.165 * hu * torsoDepth * pelvisDepth],
        radius: 0.155 * hu * build.torsoLower * gluteBulge,
        scale: [0.92, 1.04, 0.86 * pelvisDepth],
        materialRole: "body",
      },
    );

    // 5. 삼각근 티어드롭 캡 + 능동 팽창 이두근 + 척골 경상돌기(손목 뼈) + 무지구(Thenar)
    out.push(
      {
        kind: "sphere",
        jointId: uArmId,
        center: [side * 0.035 * hu * upperArmR, -0.17 * uArmLen, 0],
        radius: 0.128 * hu * upperArmR * muscleScale,
        scale: [0.95, 1.48, 1.04],
        materialRole: "body",
      },
      {
        kind: "sphere",
        jointId: uArmId,
        center: [0, -0.46 * uArmLen, 0.042 * hu * bicepBulge],
        radius: 0.105 * hu * upperArmR * bicepBulge,
        scale: [0.88, 1.36, 0.95],
        materialRole: "body",
      },
      {
        kind: "sphere",
        jointId: lArmId,
        center: [-side * 0.072 * hu * forearmR, -0.95 * fArmLen, -0.022 * hu],
        radius: 0.026 * hu * forearmR,
        materialRole: "landmark",
      },
      {
        kind: "sphere",
        jointId: handId,
        center: [side * 0.11 * handLen, -0.34 * handLen, 0.085 * handLen],
        radius: 0.13 * handLen,
        scale: [0.78, 1.15, 0.68],
        materialRole: "body",
      },
    );

    // 6. 내측광근(VMO) 티어드롭 + 비복근 능동 팽창 + 비대칭 내·외과 복숭아뼈
    out.push(
      {
        kind: "sphere",
        jointId: uLegId,
        center: [-side * 0.068 * hu * thighR, -0.76 * uLegLen, 0.068 * hu * thighR],
        radius: 0.092 * hu * thighR * muscleScale,
        scale: [0.82, 1.38, 0.86],
        materialRole: "body",
      },
      {
        kind: "sphere",
        jointId: lLegId,
        center: [-side * 0.032 * hu * calfR, -0.34 * lLegLen, -0.062 * hu * calfBulge],
        radius: 0.102 * hu * calfR * calfBulge * muscleScale,
        scale: [0.78, 1.55, 0.92],
        materialRole: "body",
      },
      // 안쪽 복숭아뼈(내과): 더 높고 약간 앞쪽
      {
        kind: "sphere",
        jointId: footId,
        center: [-side * 0.092 * hu * limbR, 0.036 * hu, 0.018 * hu],
        radius: 0.028 * hu,
        materialRole: "landmark",
      },
      // 바깥쪽 복숭아뼈(외과): 더 낮고 약간 뒤쪽
      {
        kind: "sphere",
        jointId: footId,
        center: [side * 0.095 * hu * limbR, -0.012 * hu, -0.018 * hu],
        radius: 0.028 * hu,
        materialRole: "landmark",
      },
    );
  }

  return out;
}

// ── 2D 핸드 셋업 패드 + 손가락 벌림(Spread) & 엄지 대립(Opposition) ───────────

export type StudioMannequinFistStyleId =
  | "standard"
  | "catPaw"
  | "cylinderGrip"
  | "pinchPoint";

export const STUDIO_MANNEQUIN_FIST_STYLES: readonly {
  readonly id: StudioMannequinFistStyleId;
  readonly label: string;
  readonly desc: string;
}[] = Object.freeze([
  { id: "standard", label: "기본 주먹", desc: "엄지가 바깥을 자연스럽게 감싸는 표준 주먹" },
  { id: "catPaw", label: "갈퀴·고양이손", desc: "끝마디 위주로 오므리는 반굴곡 제스처" },
  { id: "cylinderGrip", label: "검·원통 파지", desc: "무기 자루·컵·마이크를 쥐는 중공 파지형" },
  { id: "pinchPoint", label: "검지 포인팅", desc: "검지를 펴고 나머지 손가락을 말아 쥐는 지시형" },
]);

export type StudioMannequinFingerSplayMap = Readonly<
  Record<StudioMannequinFingerName, number>
>;

export interface StudioMannequinHandPadInput {
  /** 손가락 벌림 (-0.25 밀착 ~ 0 기본 ~ 1.0 최대 벌림). */
  readonly spread: number;
  /** 주먹 쥐기 강도 (0.0 편 손 ~ 1.0 완전 주먹). */
  readonly clench: number;
  /** 엄지 맞섬/대립 강도 (0.0 바깥 ~ 1.0 손바닥 중앙 대립). */
  readonly thumbOpposition?: number;
  readonly fistStyle?: StudioMannequinFistStyleId;
  /** 잠긴 손가락은 현재 지정된 단일 컬(0~100)을 유지한다. */
  readonly lockedFingerCurls?: Partial<Record<StudioMannequinFingerName, number>>;
}

export interface StudioMannequinHandPadOutput {
  readonly segmentCurls: Readonly<
    Record<StudioMannequinFingerName, StudioMannequinFingerSegmentCurls>
  >;
  /** 각 손가락의 좌우 벌림 각도(deg, 손바닥 외측 방향 양수). */
  readonly splayDeg: StudioMannequinFingerSplayMap;
}

const FIST_STYLE_CURL_TARGETS: Readonly<
  Record<
    StudioMannequinFistStyleId,
    Readonly<Record<StudioMannequinFingerName, StudioMannequinFingerSegmentCurls>>
  >
> = Object.freeze({
  standard: {
    thumb: [72, 78, 68],
    index: [88, 94, 86],
    middle: [92, 96, 90],
    ring: [95, 98, 92],
    little: [98, 100, 95],
  },
  catPaw: {
    thumb: [38, 52, 45],
    index: [22, 86, 92],
    middle: [24, 88, 94],
    ring: [26, 90, 94],
    little: [30, 92, 96],
  },
  cylinderGrip: {
    thumb: [58, 54, 48],
    index: [62, 68, 56],
    middle: [66, 72, 60],
    ring: [70, 76, 64],
    little: [74, 80, 68],
  },
  pinchPoint: {
    thumb: [48, 36, 24],
    index: [6, 8, 4],
    middle: [84, 92, 86],
    ring: [90, 95, 90],
    little: [94, 98, 92],
  },
});

const FINGER_SPREAD_WEIGHTS: Readonly<Record<StudioMannequinFingerName, number>> = Object.freeze({
  thumb: 24,
  index: 15,
  middle: 2,
  ring: -11,
  little: -22,
});

/**
 * 2D 핸드 셋업 패드 좌표(가로: 벌림, 세로: 쥐기)와 주먹 변형으로부터
 * 5손가락×3마디 개별 굴곡값과 손가락 벌림(Splay) 각도를 결정적으로 산출한다.
 */
export function resolveStudioMannequinHandPadPose(
  input: StudioMannequinHandPadInput,
): StudioMannequinHandPadOutput {
  const spread = clamp(input.spread, -0.25, 1, 0);
  const clench = clamp(input.clench, 0, 1, 0);
  const thumbOpp = clamp(input.thumbOpposition, 0, 1, 0);
  const style = input.fistStyle ?? "standard";
  const targets = FIST_STYLE_CURL_TARGETS[style] ?? FIST_STYLE_CURL_TARGETS.standard;

  // 주먹을 강하게 쥘수록 손가락 사이 벌어짐은 해부학적으로 자연 수축(MCP 측부인대 긴장)한다.
  const effectiveSpread = spread * (1 - 0.68 * clench);

  const segmentCurls = {} as Record<
    StudioMannequinFingerName,
    StudioMannequinFingerSegmentCurls
  >;
  const splayDeg = {} as Record<StudioMannequinFingerName, number>;

  for (const finger of STUDIO_MANNEQUIN_FINGER_NAMES) {
    const locked = input.lockedFingerCurls?.[finger];
    if (typeof locked === "number" && Number.isFinite(locked)) {
      const c = clamp(locked, 0, 100, 0);
      segmentCurls[finger] = [c, c, c];
    } else {
      const target = targets[finger];
      const oppBoost = finger === "thumb" ? thumbOpp * 26 : 0;
      segmentCurls[finger] = [
        clamp(target[0] * clench + oppBoost, 0, 100, 0),
        clamp(target[1] * clench + oppBoost * 0.6, 0, 100, 0),
        clamp(target[2] * clench + oppBoost * 0.3, 0, 100, 0),
      ];
    }
    const baseWeight = FINGER_SPREAD_WEIGHTS[finger];
    splayDeg[finger] =
      finger === "thumb"
        ? baseWeight * effectiveSpread - thumbOpp * 18
        : baseWeight * effectiveSpread;
  }

  return { segmentCurls, splayDeg };
}

/** 양손 패드 출력을 StudioMannequinFingerPose로 합친다. */
export function mergeHandPadIntoFingerPose(
  current: StudioMannequinFingerPose | undefined,
  side: "left" | "right" | "both",
  padOutput: StudioMannequinHandPadOutput,
): StudioMannequinFingerPose {
  const resolved = clampStudioMannequinFingerPose(current);
  return {
    left: side === "left" || side === "both" ? padOutput.segmentCurls : resolved.left,
    right: side === "right" || side === "both" ? padOutput.segmentCurls : resolved.right,
  };
}

/**
 * 손가락 벌림(Splay)까지 반영한 고해상도 손가락 프리미티브 빌더.
 * splay가 전부 0이면 기존 buildStudioMannequinSpec의 손가락 체인과 동일하게 호환된다.
 */
export function buildSplayedHandDigitPrimitives(
  jointId: "leftHand" | "rightHand",
  handLen: number,
  sideSign: 1 | -1,
  handPose: Readonly<Record<StudioMannequinFingerName, StudioMannequinFingerSegmentCurls>>,
  splayDeg: Partial<StudioMannequinFingerSplayMap> = {},
): readonly StudioMannequinPrimitiveSpec[] {
  const fingers = [
    { name: "little", x: -0.16, knuckleY: -0.76, middleY: -0.94, endY: -1.07, radius: 0.047 },
    { name: "ring", x: -0.055, knuckleY: -0.77, middleY: -0.98, endY: -1.14, radius: 0.049 },
    { name: "middle", x: 0.055, knuckleY: -0.77, middleY: -1.0, endY: -1.17, radius: 0.05 },
    { name: "index", x: 0.16, knuckleY: -0.75, middleY: -0.95, endY: -1.1, radius: 0.046 },
  ] as const;

  const rotateAroundKnuckleZ = (
    origin: StudioMannequinVec3,
    point: StudioMannequinVec3,
    angleRad: number,
  ): StudioMannequinVec3 => {
    if (Math.abs(angleRad) < 1e-6) return point;
    const dx = point[0] - origin[0];
    const dy = point[1] - origin[1];
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    return [origin[0] + dx * c - dy * s, origin[1] + dx * s + dy * c, point[2]];
  };

  const bendAndSplay = (
    restPoints: readonly StudioMannequinVec3[],
    curls: StudioMannequinFingerSegmentCurls,
    maxDeg: readonly [number, number, number],
    abductRad: number,
  ): readonly StudioMannequinVec3[] => {
    const pts: StudioMannequinVec3[] = [restPoints[0] as StudioMannequinVec3];
    let cumRad = 0;
    for (let seg = 0; seg < 3; seg += 1) {
      const from = restPoints[seg] as StudioMannequinVec3;
      const to = restPoints[seg + 1] as StudioMannequinVec3;
      const rv: StudioMannequinVec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
      cumRad += ((curls[seg] ?? 0) / 100) * rad(maxDeg[seg] ?? 45);
      const c = Math.cos(-cumRad);
      const s = Math.sin(-cumRad);
      const bent: StudioMannequinVec3 = [rv[0], rv[1] * c - rv[2] * s, rv[1] * s + rv[2] * c];
      const prev = pts[seg] as StudioMannequinVec3;
      pts.push([prev[0] + bent[0], prev[1] + bent[1], prev[2] + bent[2]]);
    }
    const knuckle = pts[0] as StudioMannequinVec3;
    return pts.map((pt, i) => (i === 0 ? pt : rotateAroundKnuckleZ(knuckle, pt, abductRad)));
  };

  const result: StudioMannequinPrimitiveSpec[] = [];
  const emitChain = (
    pts: readonly StudioMannequinVec3[],
    factors: readonly [number, number, number, number],
    baseR: number,
    jointScale: StudioMannequinVec3,
  ): void => {
    for (let seg = 0; seg < 3; seg += 1) {
      result.push({
        kind: "capsule",
        jointId,
        from: pts[seg] as StudioMannequinVec3,
        to: pts[seg + 1] as StudioMannequinVec3,
        radius: baseR * factors[seg],
        endRadius: baseR * factors[seg + 1],
        materialRole: "body",
      });
    }
    for (let j = 0; j < 2; j += 1) {
      result.push({
        kind: "sphere",
        jointId,
        center: pts[j + 1] as StudioMannequinVec3,
        radius: baseR * factors[j + 1] * 1.08,
        scale: jointScale,
        materialRole: "joint",
      });
    }
  };

  for (const f of fingers) {
    const x = sideSign * f.x * handLen;
    const z = 0.026 * handLen;
    const k: StudioMannequinVec3 = [x, f.knuckleY * handLen, z];
    const m: StudioMannequinVec3 = [x, f.middleY * handLen, z];
    const e: StudioMannequinVec3 = [x, f.endY * handLen, z + 0.008 * handLen];
    const d: StudioMannequinVec3 = [(m[0] + e[0]) / 2, (m[1] + e[1]) / 2, (m[2] + e[2]) / 2];
    const abduct = sideSign * rad(splayDeg[f.name] ?? 0);
    const pts = bendAndSplay([k, m, d, e], handPose[f.name], STUDIO_MANNEQUIN_FINGER_SEGMENT_MAX_DEG[f.name], abduct);
    emitChain(pts, [1, 0.86, 0.74, 0.6], f.radius * handLen, [1, 0.72, 0.86]);
  }

  const ts: StudioMannequinVec3 = [sideSign * 0.19 * handLen, -0.43 * handLen, 0.025 * handLen];
  const tm: StudioMannequinVec3 = [sideSign * 0.34 * handLen, -0.61 * handLen, 0.065 * handLen];
  const te: StudioMannequinVec3 = [sideSign * 0.43 * handLen, -0.76 * handLen, 0.09 * handLen];
  const td: StudioMannequinVec3 = [(tm[0] + te[0]) / 2, (tm[1] + te[1]) / 2, (tm[2] + te[2]) / 2];
  const thumbPts = bendAndSplay(
    [ts, tm, td, te],
    handPose.thumb,
    STUDIO_MANNEQUIN_FINGER_SEGMENT_MAX_DEG.thumb,
    sideSign * rad(splayDeg.thumb ?? 0),
  );
  emitChain(thumbPts, [1, 0.83, 0.7, 0.56], 0.064 * handLen, [1, 0.76, 0.9]);

  return result;
}
