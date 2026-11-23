/**
 * 15관절 3D 손 모델 Forward Kinematics(FK) 솔버 · 8종 웹툰 실전 포즈 · 좌우 미러링 · 원근 투영 엔진.
 *
 * - 엄지(CMC · MCP · IP) 3관절 + 검지·중지·약지·소지 각(MCP · PIP · DIP) 3관절 = 총 15관절
 * - 3×3 직교 회전 행렬 계층 합성(Wrist → Base → Phalanx 1/2/3 → Fingertip)
 * - 왼손/오른손 YZ 평면 정확 대칭(`M = diag(-1, 1, 1)` 공액 불변)
 * - 실시간 2D 원근 투영 + 깊이 정렬 캡슐(Painter's order) + NPR 외곽선 굵기 + 3점 광원 음영 계수
 */

export interface Vec2 { readonly x: number; readonly y: number }
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export type Handedness = "right" | "left";
export type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";
export type HandJointRole = "CMC" | "MCP" | "PIP" | "DIP" | "IP";
export type CelShadeBand = "highlight" | "midtone" | "shadow";

export type HandJointId =
  | "thumb-cmc" | "thumb-mcp" | "thumb-ip"
  | "index-mcp" | "index-pip" | "index-dip"
  | "middle-mcp" | "middle-pip" | "middle-dip"
  | "ring-mcp" | "ring-pip" | "ring-dip"
  | "pinky-mcp" | "pinky-pip" | "pinky-dip";

export type HandPosePresetId =
  | "open-relaxed" | "fist" | "point-index" | "hold-pen"
  | "grip-sword" | "wave-hello" | "finger-heart" | "pray-clasped";

export interface FingerPose {
  readonly curl1Deg: number;
  readonly curl2Deg: number;
  readonly curl3Deg: number;
  readonly spreadDeg: number;
  readonly twistDeg: number;
}

export interface WristRotationDeg {
  readonly pitch: number;
  readonly yaw: number;
  readonly roll: number;
}

export interface HandPose3d {
  readonly presetId: HandPosePresetId | "custom";
  readonly wrist: WristRotationDeg;
  readonly fingers: Readonly<Record<FingerName, FingerPose>>;
}

export interface HandCamera3d {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly distance: number;
  readonly fovDeg: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly target: Vec3;
}

export interface HandPosePresetDefinition {
  readonly id: HandPosePresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly pose: HandPose3d;
}

export interface ProjectedJoint3d {
  readonly id: string;
  readonly finger: FingerName | "wrist";
  readonly role: HandJointRole | "WRIST" | "TIP";
  readonly world: Vec3;
  readonly view: Vec3;
  readonly screen: Vec2;
  readonly radiusPx: number;
  readonly depth: number;
}

export interface CapsuleLighting3Point {
  readonly keyFactor: number;
  readonly fillFactor: number;
  readonly rimFactor: number;
  readonly shadeIntensity: number;
  readonly celBand: CelShadeBand;
}

export interface ProjectedCapsuleSegment {
  readonly id: string;
  readonly kind: "palm" | "phalanx";
  readonly finger: FingerName;
  readonly jointId?: HandJointId;
  readonly start3d: Vec3;
  readonly end3d: Vec3;
  readonly start2d: Vec2;
  readonly end2d: Vec2;
  readonly radiusStartPx: number;
  readonly radiusEndPx: number;
  readonly depth: number;
  readonly nprOutlineWidthPx: number;
  readonly lighting: CapsuleLighting3Point;
}

export interface SolvedHandSkeleton3d {
  readonly handedness: Handedness;
  readonly presetId: HandPosePresetId | "custom";
  readonly wrist: ProjectedJoint3d;
  readonly joints: readonly ProjectedJoint3d[];
  readonly fingertips: readonly ProjectedJoint3d[];
  readonly palmPolygon2d: readonly Vec2[];
  readonly capsules: readonly ProjectedCapsuleSegment[];
  readonly boundingBox3d: { readonly min: Vec3; readonly max: Vec3 };
  readonly summary: {
    readonly jointCount: 15;
    readonly capsuleCount: number;
    readonly averageNprOutlinePx: number;
    readonly meanShadeIntensity: number;
  };
}

export const FINGER_ORDER: readonly FingerName[] = ["thumb", "index", "middle", "ring", "pinky"];

export const FINGER_LABELS: Readonly<Record<FingerName, { readonly ko: string; readonly en: string }>> = {
  thumb: { ko: "엄지", en: "Thumb" },
  index: { ko: "검지", en: "Index" },
  middle: { ko: "중지", en: "Middle" },
  ring: { ko: "약지", en: "Ring" },
  pinky: { ko: "소지", en: "Pinky" },
};

export const DEFAULT_HAND_CAMERA: HandCamera3d = {
  azimuthDeg: -14,
  elevationDeg: 8,
  distance: 0.42,
  fovDeg: 38,
  viewportWidth: 320,
  viewportHeight: 260,
  target: { x: 0, y: 0.088, z: 0.01 },
};

type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

interface FingerAnatomySpec {
  readonly jointIds: readonly [HandJointId, HandJointId, HandJointId];
  readonly jointRoles: readonly [HandJointRole, HandJointRole, HandJointRole];
  readonly baseOffsetRight: Vec3;
  readonly baseSpreadDeg: number;
  readonly basePitchDeg: number;
  readonly baseTwistDeg: number;
  readonly lengths: readonly [number, number, number];
  readonly radii: readonly [number, number, number, number];
}

const FINGER_ANATOMY: Readonly<Record<FingerName, FingerAnatomySpec>> = {
  thumb: {
    jointIds: ["thumb-cmc", "thumb-mcp", "thumb-ip"],
    jointRoles: ["CMC", "MCP", "IP"],
    baseOffsetRight: { x: 0.028, y: 0.024, z: 0.011 },
    baseSpreadDeg: 36, basePitchDeg: 14, baseTwistDeg: -42,
    lengths: [0.041, 0.031, 0.025],
    radii: [0.013, 0.011, 0.0095, 0.008],
  },
  index: {
    jointIds: ["index-mcp", "index-pip", "index-dip"],
    jointRoles: ["MCP", "PIP", "DIP"],
    baseOffsetRight: { x: 0.028, y: 0.087, z: 0.002 },
    baseSpreadDeg: 5, basePitchDeg: 0, baseTwistDeg: 0,
    lengths: [0.042, 0.025, 0.020],
    radii: [0.0102, 0.0088, 0.0078, 0.0066],
  },
  middle: {
    jointIds: ["middle-mcp", "middle-pip", "middle-dip"],
    jointRoles: ["MCP", "PIP", "DIP"],
    baseOffsetRight: { x: 0.005, y: 0.093, z: 0.0 },
    baseSpreadDeg: 0, basePitchDeg: 0, baseTwistDeg: 0,
    lengths: [0.047, 0.028, 0.021],
    radii: [0.0106, 0.0092, 0.008, 0.0068],
  },
  ring: {
    jointIds: ["ring-mcp", "ring-pip", "ring-dip"],
    jointRoles: ["MCP", "PIP", "DIP"],
    baseOffsetRight: { x: -0.018, y: 0.088, z: -0.002 },
    baseSpreadDeg: -5, basePitchDeg: 0, baseTwistDeg: 0,
    lengths: [0.043, 0.026, 0.020],
    radii: [0.0098, 0.0086, 0.0074, 0.0064],
  },
  pinky: {
    jointIds: ["pinky-mcp", "pinky-pip", "pinky-dip"],
    jointRoles: ["MCP", "PIP", "DIP"],
    baseOffsetRight: { x: -0.038, y: 0.078, z: -0.005 },
    baseSpreadDeg: -11, basePitchDeg: 0, baseTwistDeg: 0,
    lengths: [0.034, 0.021, 0.017],
    radii: [0.0086, 0.0076, 0.0066, 0.0056],
  },
};

const DEG_TO_RAD = Math.PI / 180;
const normalizeZero = (v: number): number => (Object.is(v, -0) || Math.abs(v) < 1e-12 ? 0 : v);
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const vecAdd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const vecSub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vecScale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const vecDot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const vecCross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const vecLength = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const vecNormalize = (v: Vec3): Vec3 => {
  const len = vecLength(v);
  return len < 1e-9 ? { x: 0, y: 1, z: 0 } : { x: v.x / len, y: v.y / len, z: v.z / len };
};

function rotX(deg: number): Mat3 {
  const r = deg * DEG_TO_RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

function rotY(deg: number): Mat3 {
  const r = deg * DEG_TO_RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

function rotZ(deg: number): Mat3 {
  const r = deg * DEG_TO_RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

function mulMat3(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

function mulMat3Vec3(m: Mat3, v: Vec3): Vec3 {
  return {
    x: normalizeZero(m[0] * v.x + m[1] * v.y + m[2] * v.z),
    y: normalizeZero(m[3] * v.x + m[4] * v.y + m[5] * v.z),
    z: normalizeZero(m[6] * v.x + m[7] * v.y + m[8] * v.z),
  };
}

const fp = (curl1Deg: number, curl2Deg: number, curl3Deg: number, spreadDeg = 0, twistDeg = 0): FingerPose => ({
  curl1Deg, curl2Deg, curl3Deg, spreadDeg, twistDeg,
});

/** 웹툰 실전 8종 3D 손 포즈 프리셋(클립스튜디오 5.0 15관절 대응) */
export const HAND_POSE_PRESETS: readonly HandPosePresetDefinition[] = [
  {
    id: "open-relaxed", labelKo: "자연스럽게 편 손", labelEn: "Open Relaxed",
    summaryKo: "검지에서 소지로 자연스러운 캐스케이드 굽힘을 준 일상 대기 포즈",
    summaryEn: "Natural relaxed hand with gentle cascade curvature from index to pinky.",
    pose: {
      presetId: "open-relaxed", wrist: { pitch: -4, yaw: 6, roll: -3 },
      fingers: { thumb: fp(14, 12, 10, 8, 8), index: fp(10, 14, 8, 4), middle: fp(14, 18, 10), ring: fp(20, 24, 14, -4), pinky: fp(26, 28, 18, -8) },
    },
  },
  {
    id: "fist", labelKo: "단단한 주먹", labelEn: "Clenched Fist",
    summaryKo: "네 손가락을 손바닥에 밀착하고 엄지로 감싸는 액션 격투 주먹",
    summaryEn: "Tightly curled fingers locked by an opposing thumb for action cuts.",
    pose: {
      presetId: "fist", wrist: { pitch: 6, yaw: -8, roll: 4 },
      fingers: { thumb: fp(46, 54, 48, -28, 46), index: fp(88, 102, 72, -3), middle: fp(92, 106, 74), ring: fp(94, 104, 72, 2), pinky: fp(92, 98, 68, 5) },
    },
  },
  {
    id: "point-index", labelKo: "검지 가리키기", labelEn: "Point Index",
    summaryKo: "검지만 곧게 뻗고 나머지 세 손가락을 접은 지시·추리 컷 포즈",
    summaryEn: "Straight extended index finger with middle, ring, and pinky tucked in.",
    pose: {
      presetId: "point-index", wrist: { pitch: -6, yaw: 12, roll: -4 },
      fingers: { thumb: fp(36, 38, 32, -18, 32), index: fp(3, 4, 2, 2), middle: fp(86, 98, 68, -2), ring: fp(90, 100, 70, 2), pinky: fp(90, 96, 66, 5) },
    },
  },
  {
    id: "hold-pen", labelKo: "펜·소품 쥐기", labelEn: "Hold Pen",
    summaryKo: "엄지·검지·중지 삼점 파지로 펜·붓·서류를 쥔 학원/오피스 컷",
    summaryEn: "Three-point tripod grip for pens, styluses, or props.",
    pose: {
      presetId: "hold-pen", wrist: { pitch: 10, yaw: -16, roll: 12 },
      fingers: { thumb: fp(34, 28, 22, -18, 42), index: fp(42, 56, 34, -4), middle: fp(54, 62, 42, -2), ring: fp(74, 82, 54), pinky: fp(80, 84, 58, 4) },
    },
  },
  {
    id: "grip-sword", labelKo: "검·무기 파지", labelEn: "Grip Sword",
    summaryKo: "소지·약지 힘점을 강조하고 엄지를 잠근 판타지·무협 검 파지",
    summaryEn: "Diagonal power grip with strong lower-finger lock for sword handles.",
    pose: {
      presetId: "grip-sword", wrist: { pitch: 14, yaw: -18, roll: -12 },
      fingers: { thumb: fp(42, 46, 36, -24, 50), index: fp(64, 78, 52, 4), middle: fp(76, 92, 64), ring: fp(86, 98, 68, -2), pinky: fp(92, 100, 70, -4) },
    },
  },
  {
    id: "wave-hello", labelKo: "손 흔들기", labelEn: "Wave Hello",
    summaryKo: "다섯 손가락을 활짝 벌리고 손목을 가볍게 기울인 인사 포즈",
    summaryEn: "Wide splayed open palm with friendly wrist tilt for greeting scenes.",
    pose: {
      presetId: "wave-hello", wrist: { pitch: -10, yaw: 8, roll: 16 },
      fingers: { thumb: fp(4, 6, 4, 24, -6), index: fp(4, 6, 4, 15), middle: fp(3, 5, 3, 2), ring: fp(6, 8, 5, -12), pinky: fp(10, 12, 6, -22) },
    },
  },
  {
    id: "finger-heart", labelKo: "손가락 하트", labelEn: "Finger Heart",
    summaryKo: "엄지와 검지 끝을 교차해 하트를 만들고 나머지 손가락을 접은 K-웹툰 포즈",
    summaryEn: "Thumb and index fingertips pinched in a crossed heart silhouette.",
    pose: {
      presetId: "finger-heart", wrist: { pitch: -2, yaw: 14, roll: 6 },
      fingers: { thumb: fp(28, 18, 12, -26, 36), index: fp(48, 38, 22, -16), middle: fp(88, 102, 70, -2), ring: fp(92, 104, 72, 2), pinky: fp(92, 98, 68, 6) },
    },
  },
  {
    id: "pray-clasped", labelKo: "기도·합장", labelEn: "Pray Clasped",
    summaryKo: "손가락 사이 간격을 닫고 곧게 모아 경건한 감정선을 표현하는 포즈",
    summaryEn: "Straight aligned fingers pressed tightly together for emotional prayer beats.",
    pose: {
      presetId: "pray-clasped", wrist: { pitch: -12, yaw: -10, roll: -8 },
      fingers: { thumb: fp(16, 10, 6, -20, 18), index: fp(8, 10, 6, -5), middle: fp(8, 10, 6), ring: fp(10, 12, 8, 4), pinky: fp(12, 14, 10, 9) },
    },
  },
];

export const HAND_POSE_PRESET_MAP: Readonly<Record<HandPosePresetId, HandPosePresetDefinition>> =
  HAND_POSE_PRESETS.reduce((acc, preset) => {
    acc[preset.id] = preset;
    return acc;
  }, {} as Record<HandPosePresetId, HandPosePresetDefinition>);

export function getHandPosePreset(id: HandPosePresetId): HandPosePresetDefinition {
  return HAND_POSE_PRESET_MAP[id];
}

/** 왼손/오른손 YZ 평면 대칭 미러링(손목 Yaw·Roll 반전, 이중 호출 시 항등 복귀). */
export function mirrorHandPose(pose: HandPose3d): HandPose3d {
  return {
    presetId: pose.presetId,
    wrist: {
      pitch: normalizeZero(pose.wrist.pitch),
      yaw: normalizeZero(-pose.wrist.yaw),
      roll: normalizeZero(-pose.wrist.roll),
    },
    fingers: {
      thumb: { ...pose.fingers.thumb },
      index: { ...pose.fingers.index },
      middle: { ...pose.fingers.middle },
      ring: { ...pose.fingers.ring },
      pinky: { ...pose.fingers.pinky },
    },
  };
}

export function updateFingerCurlRatio(pose: HandPose3d, finger: FingerName, curlPercent: number): HandPose3d {
  const ratio = clamp(curlPercent, 0, 100) / 100;
  const maxCurls = finger === "thumb" ? [52, 60, 56] : [92, 106, 76];
  return {
    presetId: "custom",
    wrist: { ...pose.wrist },
    fingers: {
      ...pose.fingers,
      [finger]: {
        ...pose.fingers[finger],
        curl1Deg: Math.round(maxCurls[0] * ratio),
        curl2Deg: Math.round(maxCurls[1] * ratio),
        curl3Deg: Math.round(maxCurls[2] * ratio),
      },
    },
  };
}

interface CameraBasis {
  readonly position: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
  readonly focalPx: number;
  readonly cx: number;
  readonly cy: number;
}

function buildCameraBasis(camera: HandCamera3d): CameraBasis {
  const az = camera.azimuthDeg * DEG_TO_RAD;
  const el = clamp(camera.elevationDeg, -80, 80) * DEG_TO_RAD;
  const dist = Math.max(0.15, camera.distance);
  const cosEl = Math.cos(el);
  const position: Vec3 = {
    x: camera.target.x + dist * cosEl * Math.sin(az),
    y: camera.target.y + dist * Math.sin(el),
    z: camera.target.z + dist * cosEl * Math.cos(az),
  };
  const forward = vecNormalize(vecSub(camera.target, position));
  const right = vecNormalize(vecCross(forward, { x: 0, y: 1, z: 0 }));
  const up = vecNormalize(vecCross(right, forward));
  const focalPx = (camera.viewportHeight * 0.5) / Math.tan(clamp(camera.fovDeg, 15, 110) * 0.5 * DEG_TO_RAD);
  return { position, right, up, forward, focalPx, cx: camera.viewportWidth * 0.5, cy: camera.viewportHeight * 0.5 };
}

function projectPoint(world: Vec3, radiusM: number, cam: CameraBasis) {
  const rel = vecSub(world, cam.position);
  const vx = vecDot(rel, cam.right);
  const vy = vecDot(rel, cam.up);
  const vz = Math.max(0.05, vecDot(rel, cam.forward));
  return {
    view: { x: vx, y: vy, z: vz },
    screen: { x: Number((cam.cx + (vx / vz) * cam.focalPx).toFixed(2)), y: Number((cam.cy - (vy / vz) * cam.focalPx).toFixed(2)) },
    radiusPx: Number(Math.max(1.5, (radiusM / vz) * cam.focalPx).toFixed(2)),
    depth: Number(vz.toFixed(5)),
  };
}

const KEY_LIGHT_DIR = vecNormalize({ x: 0.55, y: 0.68, z: 0.48 });
const FILL_LIGHT_DIR = vecNormalize({ x: -0.72, y: 0.18, z: 0.67 });
const RIM_LIGHT_DIR = vecNormalize({ x: -0.35, y: 0.64, z: -0.68 });

function computeCapsuleLightingAndNpr(
  start3d: Vec3, end3d: Vec3, camPos: Vec3,
  radiusStartPx: number, radiusEndPx: number, depth: number, cameraDistance: number,
): { readonly lighting: CapsuleLighting3Point; readonly nprOutlineWidthPx: number } {
  const mid = vecScale(vecAdd(start3d, end3d), 0.5);
  const axis = vecNormalize(vecSub(end3d, start3d));
  const viewDir = vecNormalize(vecSub(camPos, mid));
  const dotViewAxis = vecDot(viewDir, axis);
  const perp = vecSub(viewDir, vecScale(axis, dotViewAxis));
  const normal = vecLength(perp) > 1e-5 ? vecNormalize(perp) : viewDir;

  const keyFactor = Number(clamp(vecDot(normal, KEY_LIGHT_DIR) * 0.5 + 0.5, 0, 1).toFixed(3));
  const fillFactor = Number(clamp(vecDot(normal, FILL_LIGHT_DIR) * 0.5 + 0.5, 0, 1).toFixed(3));
  const grazing = clamp(1 - Math.abs(dotViewAxis), 0, 1);
  const rimFactor = Number(clamp((vecDot(normal, RIM_LIGHT_DIR) * 0.5 + 0.5) * (0.45 + 0.55 * grazing), 0, 1).toFixed(3));
  const shadeIntensity = Number(clamp(0.14 + keyFactor * 0.58 + fillFactor * 0.18 + rimFactor * 0.16, 0, 1).toFixed(3));
  const celBand: CelShadeBand = shadeIntensity >= 0.72 ? "highlight" : shadeIntensity >= 0.44 ? "midtone" : "shadow";

  const avgRadiusPx = (radiusStartPx + radiusEndPx) * 0.5;
  const depthScale = clamp(cameraDistance / Math.max(0.12, depth), 0.72, 1.38);
  const nprOutlineWidthPx = Number(clamp((1.45 + avgRadiusPx * 0.08 + (1 - rimFactor) * 0.45) * depthScale, 1.25, 3.8).toFixed(2));
  return { lighting: { keyFactor, fillFactor, rimFactor, shadeIntensity, celBand }, nprOutlineWidthPx };
}

/** 15관절 3D 손 모델 Forward Kinematics 솔버 + 2D 원근 투영 + 깊이 정렬 캡슐 생성기. */
export function solveHandSkeleton3d(
  pose: HandPose3d,
  handedness: Handedness = "right",
  camera: Partial<HandCamera3d> = {},
): SolvedHandSkeleton3d {
  const camConfig: HandCamera3d = { ...DEFAULT_HAND_CAMERA, ...camera, target: camera.target ?? DEFAULT_HAND_CAMERA.target };
  const cam = buildCameraBasis(camConfig);
  const signX = handedness === "left" ? -1 : 1;

  const wristMatrix = mulMat3(
    rotZ(clamp(pose.wrist.roll, -90, 90)),
    mulMat3(rotY(clamp(pose.wrist.yaw, -90, 90)), rotX(clamp(pose.wrist.pitch, -90, 90))),
  );

  const wristWorld: Vec3 = { x: 0, y: 0, z: 0 };
  const wristProj = projectPoint(wristWorld, 0.022, cam);
  const wristJoint: ProjectedJoint3d = { id: "wrist", finger: "wrist", role: "WRIST", world: wristWorld, ...wristProj };

  const joints: ProjectedJoint3d[] = [];
  const fingertips: ProjectedJoint3d[] = [];
  const capsules: ProjectedCapsuleSegment[] = [];
  const palmBaseScreens: Partial<Record<FingerName, Vec2>> = {};
  let minX = 0; let minY = 0; let minZ = 0; let maxX = 0; let maxY = 0; let maxZ = 0;

  const trackBounds = (p: Vec3) => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z);
  };

  for (const finger of FINGER_ORDER) {
    const spec = FINGER_ANATOMY[finger];
    const fPose = pose.fingers[finger];
    const baseWorld = mulMat3Vec3(wristMatrix, { x: spec.baseOffsetRight.x * signX, y: spec.baseOffsetRight.y, z: spec.baseOffsetRight.z });
    trackBounds(baseWorld);

    const baseProj = projectPoint(baseWorld, spec.radii[0], cam);
    palmBaseScreens[finger] = baseProj.screen;
    const palmDepth = Number(((wristProj.depth + baseProj.depth) * 0.5).toFixed(5));
    const palmR0 = Number((wristProj.radiusPx * 0.72).toFixed(2));
    const palmR1 = Number((baseProj.radiusPx * 1.05).toFixed(2));
    const palmShade = computeCapsuleLightingAndNpr(wristWorld, baseWorld, cam.position, palmR0, palmR1, palmDepth, camConfig.distance);
    capsules.push({
      id: `palm-${finger}`, kind: "palm", finger, start3d: wristWorld, end3d: baseWorld,
      start2d: wristProj.screen, end2d: baseProj.screen, radiusStartPx: palmR0, radiusEndPx: palmR1,
      depth: palmDepth, ...palmShade,
    });

    const spreadTotal = clamp(spec.baseSpreadDeg + fPose.spreadDeg, -55, 70);
    const twistTotal = clamp(spec.baseTwistDeg + fPose.twistDeg, -90, 90);
    const curl1Total = clamp(spec.basePitchDeg + fPose.curl1Deg, -25, 105);
    const r1World = mulMat3(wristMatrix, mulMat3(rotZ(-spreadTotal * signX), mulMat3(rotY(twistTotal * signX), rotX(curl1Total))));
    const r2World = mulMat3(r1World, rotX(clamp(fPose.curl2Deg, -15, 115)));
    const r3World = mulMat3(r2World, rotX(clamp(fPose.curl3Deg, -15, 95)));

    const p1 = baseWorld;
    const p2 = vecAdd(p1, mulMat3Vec3(r1World, { x: 0, y: spec.lengths[0], z: 0 }));
    const p3 = vecAdd(p2, mulMat3Vec3(r2World, { x: 0, y: spec.lengths[1], z: 0 }));
    const tip = vecAdd(p3, mulMat3Vec3(r3World, { x: 0, y: spec.lengths[2], z: 0 }));
    const points3d: readonly [Vec3, Vec3, Vec3, Vec3] = [p1, p2, p3, tip];
    const projections = points3d.map((pt, idx) => { trackBounds(pt); return projectPoint(pt, spec.radii[idx], cam); });

    for (let j = 0; j < 3; j += 1) {
      const jointId = spec.jointIds[j];
      const proj = projections[j];
      const nextProj = projections[j + 1];
      joints.push({ id: jointId, finger, role: spec.jointRoles[j], world: points3d[j], ...proj });
      const segDepth = Number(((proj.depth + nextProj.depth) * 0.5).toFixed(5));
      const shade = computeCapsuleLightingAndNpr(points3d[j], points3d[j + 1], cam.position, proj.radiusPx, nextProj.radiusPx, segDepth, camConfig.distance);
      capsules.push({
        id: `seg-${jointId}`, kind: "phalanx", finger, jointId,
        start3d: points3d[j], end3d: points3d[j + 1], start2d: proj.screen, end2d: nextProj.screen,
        radiusStartPx: proj.radiusPx, radiusEndPx: nextProj.radiusPx, depth: segDepth, ...shade,
      });
    }
    fingertips.push({ id: `${finger}-tip`, finger, role: "TIP", world: tip, ...projections[3] });
  }

  capsules.sort((a, b) => b.depth - a.depth || a.id.localeCompare(b.id));
  const palmPolygon2d: Vec2[] = [
    wristJoint.screen,
    palmBaseScreens.thumb ?? wristJoint.screen,
    palmBaseScreens.index ?? wristJoint.screen,
    palmBaseScreens.middle ?? wristJoint.screen,
    palmBaseScreens.ring ?? wristJoint.screen,
    palmBaseScreens.pinky ?? wristJoint.screen,
  ];

  return {
    handedness, presetId: pose.presetId, wrist: wristJoint, joints, fingertips, palmPolygon2d, capsules,
    boundingBox3d: { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } },
    summary: {
      jointCount: 15,
      capsuleCount: capsules.length,
      averageNprOutlinePx: Number((capsules.reduce((s, c) => s + c.nprOutlineWidthPx, 0) / capsules.length).toFixed(2)),
      meanShadeIntensity: Number((capsules.reduce((s, c) => s + c.lighting.shadeIntensity, 0) / capsules.length).toFixed(3)),
    },
  };
}
