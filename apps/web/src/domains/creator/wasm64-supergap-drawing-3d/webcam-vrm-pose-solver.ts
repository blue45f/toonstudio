/**
 * Super-Gap Pillar B (#5): Webcam-to-VRM 52 ARKit Blendshapes & Upper-Body Pose Mirroring.
 * 정규화된 얼굴·상체 랜드마크를 60fps 시간-불변 지수 평활화(exponential smoothing)로
 * 52개 표준 ARKit 블렌드셰이프 가중치, 시선(gaze yaw/pitch), 머리·어깨·상체 기울기로
 * 변환하며, 만화 컷 고정(instant cut-freeze snapshot)과 거울 반전 모드를 지원한다.
 */

import type { Point2D } from "./curved-msdf-sfx";

export const ARKIT_52_BLENDSHAPE_NAMES = [
  "browDownLeft",
  "browDownRight",
  "browInnerUp",
  "browOuterUpLeft",
  "browOuterUpRight",
  "cheekPuff",
  "cheekSquintLeft",
  "cheekSquintRight",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyeLookDownLeft",
  "eyeLookDownRight",
  "eyeLookInLeft",
  "eyeLookInRight",
  "eyeLookOutLeft",
  "eyeLookOutRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeSquintLeft",
  "eyeSquintRight",
  "eyeWideLeft",
  "eyeWideRight",
  "jawForward",
  "jawLeft",
  "jawOpen",
  "jawRight",
  "mouthClose",
  "mouthDimpleLeft",
  "mouthDimpleRight",
  "mouthFrownLeft",
  "mouthFrownRight",
  "mouthFunnel",
  "mouthLeft",
  "mouthLowerDownLeft",
  "mouthLowerDownRight",
  "mouthPressLeft",
  "mouthPressRight",
  "mouthPucker",
  "mouthRight",
  "mouthRollLower",
  "mouthRollUpper",
  "mouthShrugLower",
  "mouthShrugUpper",
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthStretchLeft",
  "mouthStretchRight",
  "mouthUpperUpLeft",
  "mouthUpperUpRight",
  "noseSneerLeft",
  "noseSneerRight",
  "tongueOut",
] as const;

export type Arkit52BlendshapeName = (typeof ARKIT_52_BLENDSHAPE_NAMES)[number];
export type Arkit52BlendshapeMap = Record<Arkit52BlendshapeName, number>;

export interface EyeLandmarks {
  readonly outer: Point2D;
  readonly inner: Point2D;
  readonly top: Point2D;
  readonly bottom: Point2D;
  readonly iris: Point2D;
}

export interface BrowLandmarks {
  readonly inner: Point2D;
  readonly mid: Point2D;
  readonly outer: Point2D;
}

export interface MouthLandmarks {
  readonly leftCorner: Point2D;
  readonly rightCorner: Point2D;
  readonly upperLipTop: Point2D;
  readonly upperLipBottom: Point2D;
  readonly lowerLipTop: Point2D;
  readonly lowerLipBottom: Point2D;
}

export interface WebcamFaceLandmarks {
  readonly leftEye: EyeLandmarks;
  readonly rightEye: EyeLandmarks;
  readonly leftBrow: BrowLandmarks;
  readonly rightBrow: BrowLandmarks;
  readonly mouth: MouthLandmarks;
  readonly noseTip: Point2D;
  readonly noseBridge: Point2D;
  readonly jawChin: Point2D;
  readonly forehead: Point2D;
  readonly leftTemple: Point2D;
  readonly rightTemple: Point2D;
  readonly leftCheek: Point2D;
  readonly rightCheek: Point2D;
  /** 선택적 추가 관측 힌트 [0, 1] */
  readonly cheekPuffRatio?: number;
  readonly jawForwardRatio?: number;
  readonly tongueOutRatio?: number;
}

export interface WebcamUpperBodyLandmarks {
  readonly neck: Point2D;
  readonly chest: Point2D;
  readonly leftShoulder: Point2D;
  readonly rightShoulder: Point2D;
  readonly leftElbow?: Point2D;
  readonly rightElbow?: Point2D;
  readonly leftWrist?: Point2D;
  readonly rightWrist?: Point2D;
}

export interface WebcamLandmarkFrame {
  readonly timestampMs: number;
  readonly face: WebcamFaceLandmarks;
  readonly upperBody?: WebcamUpperBodyLandmarks;
}

export interface VrmGazePose {
  readonly yawRad: number;
  readonly pitchRad: number;
  readonly convergence01: number;
}

export interface VrmUpperBodyPose {
  readonly headYawRad: number;
  readonly headPitchRad: number;
  readonly headRollRad: number;
  readonly neckTiltRad: number;
  readonly shoulderTiltRad: number;
  readonly spineLeanRad: number;
  readonly leftUpperArmElevationRad: number;
  readonly rightUpperArmElevationRad: number;
  readonly leftForearmBendRad: number;
  readonly rightForearmBendRad: number;
}

export interface Vrm10PresetSummary {
  readonly happy: number;
  readonly angry: number;
  readonly sad: number;
  readonly relaxed: number;
  readonly surprised: number;
  readonly blinkLeft: number;
  readonly blinkRight: number;
  readonly aa: number;
  readonly ih: number;
  readonly ou: number;
  readonly ee: number;
  readonly oh: number;
}

export interface VrmExpressionPoseOutput {
  readonly timestampMs: number;
  readonly blendshapes: Readonly<Arkit52BlendshapeMap>;
  readonly vrmPresets: Vrm10PresetSummary;
  readonly gaze: VrmGazePose;
  readonly pose: VrmUpperBodyPose;
  readonly mirrored: boolean;
  readonly isFrozen: boolean;
  readonly frozenCutId: string | null;
  readonly targetFps: number;
  readonly smoothingAlphaExpr: number;
  readonly smoothingAlphaPose: number;
}

export interface VrmCutFreezeSnapshot {
  readonly snapshotId: string;
  readonly cutId: string;
  readonly capturedAtMs: number;
  readonly blendshapes: Readonly<Arkit52BlendshapeMap>;
  readonly vrmPresets: Vrm10PresetSummary;
  readonly gaze: VrmGazePose;
  readonly pose: VrmUpperBodyPose;
}

export interface WebcamVrmSolverOptions {
  readonly mirrorHorizontal?: boolean;
  readonly targetFps?: number;
  readonly expressionTauSec?: number;
  readonly poseTauSec?: number;
}

function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function clampRange(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  if (Math.abs(edge1 - edge0) <= 1e-8) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function dist2d(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function createZeroBlendshapeMap(): Arkit52BlendshapeMap {
  const map = {} as Arkit52BlendshapeMap;
  for (let i = 0; i < ARKIT_52_BLENDSHAPE_NAMES.length; i += 1) {
    map[ARKIT_52_BLENDSHAPE_NAMES[i]] = 0;
  }
  return map;
}

function cloneBlendshapeMap(src: Readonly<Arkit52BlendshapeMap>): Arkit52BlendshapeMap {
  const copy = {} as Arkit52BlendshapeMap;
  for (let i = 0; i < ARKIT_52_BLENDSHAPE_NAMES.length; i += 1) {
    const key = ARKIT_52_BLENDSHAPE_NAMES[i];
    copy[key] = src[key];
  }
  return copy;
}

/**
 * 기준 중립 표정 랜드마크 생성기 (정규화 0..1 이미지 좌표계, y 아래 방향).
 */
export function createNeutralWebcamFaceLandmarks(): WebcamFaceLandmarks {
  return {
    leftEye: {
      outer: { x: 0.34, y: 0.42 },
      inner: { x: 0.44, y: 0.42 },
      top: { x: 0.39, y: 0.402 },
      bottom: { x: 0.39, y: 0.438 },
      iris: { x: 0.39, y: 0.42 },
    },
    rightEye: {
      inner: { x: 0.56, y: 0.42 },
      outer: { x: 0.66, y: 0.42 },
      top: { x: 0.61, y: 0.402 },
      bottom: { x: 0.61, y: 0.438 },
      iris: { x: 0.61, y: 0.42 },
    },
    leftBrow: {
      outer: { x: 0.33, y: 0.355 },
      mid: { x: 0.39, y: 0.348 },
      inner: { x: 0.45, y: 0.356 },
    },
    rightBrow: {
      inner: { x: 0.55, y: 0.356 },
      mid: { x: 0.61, y: 0.348 },
      outer: { x: 0.67, y: 0.355 },
    },
    mouth: {
      leftCorner: { x: 0.415, y: 0.64 },
      rightCorner: { x: 0.585, y: 0.64 },
      upperLipTop: { x: 0.5, y: 0.615 },
      upperLipBottom: { x: 0.5, y: 0.635 },
      lowerLipTop: { x: 0.5, y: 0.642 },
      lowerLipBottom: { x: 0.5, y: 0.665 },
    },
    noseTip: { x: 0.5, y: 0.54 },
    noseBridge: { x: 0.5, y: 0.43 },
    jawChin: { x: 0.5, y: 0.78 },
    forehead: { x: 0.5, y: 0.24 },
    leftTemple: { x: 0.25, y: 0.42 },
    rightTemple: { x: 0.75, y: 0.42 },
    leftCheek: { x: 0.36, y: 0.55 },
    rightCheek: { x: 0.64, y: 0.55 },
  };
}

function solveEyeMetrics(eye: EyeLandmarks): {
  readonly blink: number;
  readonly wide: number;
  readonly squint: number;
  readonly lookIn: number;
  readonly lookOut: number;
  readonly lookUp: number;
  readonly lookDown: number;
  readonly irisOffsetX: number;
  readonly irisOffsetY: number;
} {
  const width = Math.max(1e-4, dist2d(eye.outer, eye.inner));
  const height = Math.max(0, eye.bottom.y - eye.top.y);
  const ear = height / width; // 중립 ~0.36

  const blink = smoothStep(0.24, 0.07, ear);
  const wide = smoothStep(0.42, 0.64, ear);
  const squint = smoothStep(0.32, 0.16, ear) * (1 - blink * 0.65);

  const centerX = 0.5 * (eye.outer.x + eye.inner.x);
  const centerY = 0.5 * (eye.top.y + eye.bottom.y);
  const halfW = Math.max(1e-4, width * 0.5);
  const halfH = Math.max(1e-4, Math.max(height, width * 0.22) * 0.5);

  // 눈 내측(코 방향)으로의 단위 방향 부호
  const inwardSign = eye.inner.x >= eye.outer.x ? 1 : -1;
  const normDx = clampRange((eye.iris.x - centerX) / halfW, -1, 1);
  const normDy = clampRange((eye.iris.y - centerY) / halfH, -1, 1);
  const inwardOffset = normDx * inwardSign;

  return {
    blink,
    wide,
    squint,
    lookIn: clamp01(inwardOffset),
    lookOut: clamp01(-inwardOffset),
    lookUp: clamp01(-normDy),
    lookDown: clamp01(normDy),
    irisOffsetX: normDx,
    irisOffsetY: normDy,
  };
}

export interface RawLandmarkSolveResult {
  readonly blendshapes: Arkit52BlendshapeMap;
  readonly vrmPresets: Vrm10PresetSummary;
  readonly gaze: VrmGazePose;
  readonly pose: VrmUpperBodyPose;
}

function buildVrm10Presets(b: Readonly<Arkit52BlendshapeMap>): Vrm10PresetSummary {
  const smile = 0.5 * (b.mouthSmileLeft + b.mouthSmileRight);
  const frown = 0.5 * (b.mouthFrownLeft + b.mouthFrownRight);
  const browDown = 0.5 * (b.browDownLeft + b.browDownRight);
  const eyeWide = 0.5 * (b.eyeWideLeft + b.eyeWideRight);
  return {
    happy: clamp01(smile * 0.85 + 0.15 * (b.cheekSquintLeft + b.cheekSquintRight) * 0.5),
    angry: clamp01(browDown * 0.7 + 0.3 * (b.noseSneerLeft + b.noseSneerRight) * 0.5),
    sad: clamp01(frown * 0.6 + b.browInnerUp * 0.4),
    relaxed: clamp01(1 - Math.max(smile, frown, browDown, b.jawOpen)),
    surprised: clamp01(eyeWide * 0.55 + b.browInnerUp * 0.25 + b.jawOpen * 0.2),
    blinkLeft: b.eyeBlinkLeft,
    blinkRight: b.eyeBlinkRight,
    aa: clamp01(b.jawOpen * (1 - b.mouthPucker * 0.5)),
    ih: clamp01(0.5 * (b.mouthStretchLeft + b.mouthStretchRight) * (1 - b.mouthPucker)),
    ou: clamp01(b.mouthPucker * 0.8 + b.mouthFunnel * 0.2),
    ee: clamp01(smile * 0.55 + 0.45 * (b.mouthStretchLeft + b.mouthStretchRight) * 0.5),
    oh: clamp01(b.mouthFunnel * 0.65 + b.jawOpen * 0.35),
  };
}

/**
 * 단일 랜드마크 프레임에서 52 ARKit 블렌드셰이프, 시선(yaw/pitch), 머리·상체 포즈를 계산한다.
 */
export function computeArkit52FromLandmarks(
  frame: WebcamLandmarkFrame,
  mirrorHorizontal: boolean = true,
): RawLandmarkSolveResult {
  const face = frame.face;
  const b = createZeroBlendshapeMap();
  const faceWidth = Math.max(1e-4, dist2d(face.leftTemple, face.rightTemple));
  const faceHeight = Math.max(1e-4, dist2d(face.forehead, face.jawChin));

  // 눈 & 시선
  const rawLeftEye = solveEyeMetrics(face.leftEye);
  const rawRightEye = solveEyeMetrics(face.rightEye);
  const lEye = mirrorHorizontal ? rawRightEye : rawLeftEye;
  const rEye = mirrorHorizontal ? rawLeftEye : rawRightEye;

  b.eyeBlinkLeft = lEye.blink;
  b.eyeBlinkRight = rEye.blink;
  b.eyeWideLeft = lEye.wide;
  b.eyeWideRight = rEye.wide;
  b.eyeSquintLeft = lEye.squint;
  b.eyeSquintRight = rEye.squint;
  b.eyeLookInLeft = lEye.lookIn;
  b.eyeLookOutLeft = lEye.lookOut;
  b.eyeLookUpLeft = lEye.lookUp;
  b.eyeLookDownLeft = lEye.lookDown;
  b.eyeLookInRight = rEye.lookIn;
  b.eyeLookOutRight = rEye.lookOut;
  b.eyeLookUpRight = rEye.lookUp;
  b.eyeLookDownRight = rEye.lookDown;

  // 눈썹 (눈 윗꺼풀 대비 수직 간격)
  const leftEyeY = 0.5 * (face.leftEye.top.y + face.leftEye.bottom.y);
  const rightEyeY = 0.5 * (face.rightEye.top.y + face.rightEye.bottom.y);
  const lBrowInnerDist = (leftEyeY - face.leftBrow.inner.y) / faceHeight;
  const rBrowInnerDist = (rightEyeY - face.rightBrow.inner.y) / faceHeight;
  const lBrowOuterDist = (leftEyeY - face.leftBrow.outer.y) / faceHeight;
  const rBrowOuterDist = (rightEyeY - face.rightBrow.outer.y) / faceHeight;
  const lBrowMidDist = (leftEyeY - face.leftBrow.mid.y) / faceHeight;
  const rBrowMidDist = (rightEyeY - face.rightBrow.mid.y) / faceHeight;

  const browInnerAvg = 0.5 * (lBrowInnerDist + rBrowInnerDist);
  b.browInnerUp = smoothStep(0.135, 0.195, browInnerAvg);
  const rawBrowDownL = smoothStep(0.115, 0.068, lBrowMidDist);
  const rawBrowDownR = smoothStep(0.115, 0.068, rBrowMidDist);
  const rawBrowOutUpL = smoothStep(0.135, 0.195, lBrowOuterDist);
  const rawBrowOutUpR = smoothStep(0.135, 0.195, rBrowOuterDist);
  b.browDownLeft = mirrorHorizontal ? rawBrowDownR : rawBrowDownL;
  b.browDownRight = mirrorHorizontal ? rawBrowDownL : rawBrowDownR;
  b.browOuterUpLeft = mirrorHorizontal ? rawBrowOutUpR : rawBrowOutUpL;
  b.browOuterUpRight = mirrorHorizontal ? rawBrowOutUpL : rawBrowOutUpR;

  // 입·턱 기하 비율
  const mouth = face.mouth;
  const mouthWidth = dist2d(mouth.leftCorner, mouth.rightCorner) / faceWidth;
  const mouthInnerOpen = Math.max(0, mouth.lowerLipTop.y - mouth.upperLipBottom.y) / faceHeight;
  const mouthOuterHeight = Math.max(0, mouth.lowerLipBottom.y - mouth.upperLipTop.y) / faceHeight;
  const mouthCenterY = 0.5 * (mouth.upperLipBottom.y + mouth.lowerLipTop.y);
  const mouthCenterX = 0.5 * (mouth.leftCorner.x + mouth.rightCorner.x);
  const faceMidX = 0.5 * (face.leftTemple.x + face.rightTemple.x);

  const jawOpen = smoothStep(0.025, 0.165, mouthInnerOpen);
  b.jawOpen = jawOpen;
  b.jawForward = clamp01(face.jawForwardRatio ?? 0);
  const jawShift = (face.jawChin.x - faceMidX) / faceWidth;
  const jawShiftSigned = mirrorHorizontal ? -jawShift : jawShift;
  b.jawLeft = clamp01(-jawShiftSigned * 7);
  b.jawRight = clamp01(jawShiftSigned * 7);

  const mouthShift = (mouthCenterX - faceMidX) / faceWidth;
  const mouthShiftSigned = mirrorHorizontal ? -mouthShift : mouthShift;
  b.mouthLeft = clamp01(-mouthShiftSigned * 8);
  b.mouthRight = clamp01(mouthShiftSigned * 8);

  const leftLift = (mouthCenterY - mouth.leftCorner.y) / faceHeight;
  const rightLift = (mouthCenterY - mouth.rightCorner.y) / faceHeight;
  const rawSmileL = smoothStep(0.008, 0.055, leftLift);
  const rawSmileR = smoothStep(0.008, 0.055, rightLift);
  const rawFrownL = smoothStep(0.008, 0.05, -leftLift);
  const rawFrownR = smoothStep(0.008, 0.05, -rightLift);

  b.mouthSmileLeft = mirrorHorizontal ? rawSmileR : rawSmileL;
  b.mouthSmileRight = mirrorHorizontal ? rawSmileL : rawSmileR;
  b.mouthFrownLeft = mirrorHorizontal ? rawFrownR : rawFrownL;
  b.mouthFrownRight = mirrorHorizontal ? rawFrownL : rawFrownR;

  const pucker = smoothStep(0.3, 0.18, mouthWidth);
  const stretch = smoothStep(0.38, 0.52, mouthWidth);
  b.mouthPucker = pucker;
  b.mouthFunnel = clamp01(pucker * 0.65 + jawOpen * 0.55) * smoothStep(0.06, 0.14, mouthOuterHeight);
  b.mouthStretchLeft = stretch;
  b.mouthStretchRight = stretch;
  b.mouthClose = clamp01((1 - jawOpen) * smoothStep(0.05, 0.015, mouthOuterHeight));

  const lipPress = smoothStep(0.082, 0.042, mouthOuterHeight) * (1 - jawOpen);
  b.mouthPressLeft = lipPress;
  b.mouthPressRight = lipPress;
  b.mouthRollUpper = clamp01(lipPress * 0.65);
  b.mouthRollLower = clamp01(lipPress * 0.65);
  b.mouthShrugUpper = clamp01(b.mouthPucker * 0.45 + b.mouthPressLeft * 0.25);
  b.mouthShrugLower = clamp01(b.mouthPucker * 0.4 + b.mouthFrownLeft * 0.3);
  b.mouthDimpleLeft = clamp01(b.mouthSmileLeft * 0.55);
  b.mouthDimpleRight = clamp01(b.mouthSmileRight * 0.55);

  const upperLift = smoothStep(0.115, 0.075, (mouth.upperLipTop.y - face.noseTip.y) / faceHeight);
  const lowerDrop = smoothStep(0.24, 0.16, (face.jawChin.y - mouth.lowerLipBottom.y) / faceHeight);
  b.mouthUpperUpLeft = upperLift;
  b.mouthUpperUpRight = upperLift;
  b.mouthLowerDownLeft = lowerDrop;
  b.mouthLowerDownRight = lowerDrop;

  // 볼·코·혀
  b.cheekPuff = clamp01(face.cheekPuffRatio ?? 0);
  b.cheekSquintLeft = clamp01(b.mouthSmileLeft * 0.65 + b.eyeSquintLeft * 0.35);
  b.cheekSquintRight = clamp01(b.mouthSmileRight * 0.65 + b.eyeSquintRight * 0.35);
  const cheekLiftL = smoothStep(0.26, 0.19, (face.leftCheek.y - leftEyeY) / faceHeight);
  const cheekLiftR = smoothStep(0.26, 0.19, (face.rightCheek.y - rightEyeY) / faceHeight);
  b.noseSneerLeft = clamp01((mirrorHorizontal ? cheekLiftR : cheekLiftL) * 0.6 + upperLift * 0.4);
  b.noseSneerRight = clamp01((mirrorHorizontal ? cheekLiftL : cheekLiftR) * 0.6 + upperLift * 0.4);
  b.tongueOut = clamp01((face.tongueOutRatio ?? 0) * smoothStep(0.15, 0.45, jawOpen));

  // 시선 (gaze yaw/pitch)
  const rawGazeX = 0.5 * (rawLeftEye.irisOffsetX + rawRightEye.irisOffsetX);
  const rawGazeY = 0.5 * (rawLeftEye.irisOffsetY + rawRightEye.irisOffsetY);
  const gazeYawRad = clampRange((mirrorHorizontal ? -rawGazeX : rawGazeX) * 0.52, -0.6, 0.6);
  const gazePitchRad = clampRange(-rawGazeY * 0.42, -0.45, 0.45);
  const convergence01 = clamp01(0.5 * (b.eyeLookInLeft + b.eyeLookInRight));

  // 머리 자세 (yaw / pitch / roll)
  const eyeLineDx = face.rightEye.outer.x - face.leftEye.outer.x;
  const eyeLineDy = face.rightEye.outer.y - face.leftEye.outer.y;
  const rawRoll = Math.atan2(eyeLineDy, Math.max(1e-4, eyeLineDx));
  const headRollRad = clampRange(mirrorHorizontal ? -rawRoll : rawRoll, -0.85, 0.85);

  const noseOffsetRatio = (face.noseTip.x - faceMidX) / (faceWidth * 0.5);
  const rawYaw = clampRange(noseOffsetRatio * 1.15, -1.1, 1.1);
  const headYawRad = mirrorHorizontal ? -rawYaw : rawYaw;

  const faceMidY = 0.5 * (face.forehead.y + face.jawChin.y);
  const noseVertRatio = (face.noseTip.y - faceMidY) / (faceHeight * 0.5);
  const headPitchRad = clampRange((0.11 - noseVertRatio) * 1.25, -0.85, 0.85);

  // 상체 자세 (어깨 기울기, 척추 기울기, 팔 각도)
  let shoulderTiltRad = 0;
  let spineLeanRad = 0;
  let leftUpperArmElevationRad = 0;
  let rightUpperArmElevationRad = 0;
  let leftForearmBendRad = 0;
  let rightForearmBendRad = 0;

  if (frame.upperBody) {
    const ub = frame.upperBody;
    const shDx = ub.rightShoulder.x - ub.leftShoulder.x;
    const shDy = ub.rightShoulder.y - ub.leftShoulder.y;
    const rawShoulderTilt = Math.atan2(shDy, Math.max(1e-4, shDx));
    shoulderTiltRad = clampRange(
      mirrorHorizontal ? -rawShoulderTilt : rawShoulderTilt,
      -0.65,
      0.65,
    );

    const rawSpine = Math.atan2(ub.neck.x - ub.chest.x, Math.max(1e-4, ub.chest.y - ub.neck.y));
    spineLeanRad = clampRange(mirrorHorizontal ? -rawSpine : rawSpine, -0.6, 0.6);

    const armElevation = (shoulder: Point2D, elbow?: Point2D): number => {
      if (!elbow) return 0;
      const dy = shoulder.y - elbow.y;
      const len = Math.max(1e-4, dist2d(shoulder, elbow));
      return clampRange(Math.asin(clampRange(dy / len, -1, 1)) + Math.PI * 0.5, 0, Math.PI);
    };

    const armBend = (shoulder: Point2D, elbow?: Point2D, wrist?: Point2D): number => {
      if (!elbow || !wrist) return 0;
      const v1x = shoulder.x - elbow.x;
      const v1y = shoulder.y - elbow.y;
      const v2x = wrist.x - elbow.x;
      const v2y = wrist.y - elbow.y;
      const l1 = Math.hypot(v1x, v1y);
      const l2 = Math.hypot(v2x, v2y);
      if (l1 < 1e-4 || l2 < 1e-4) return 0;
      const cosA = clampRange((v1x * v2x + v1y * v2y) / (l1 * l2), -1, 1);
      return clampRange(Math.PI - Math.acos(cosA), 0, 2.5);
    };

    const rawLArm = armElevation(ub.leftShoulder, ub.leftElbow);
    const rawRArm = armElevation(ub.rightShoulder, ub.rightElbow);
    const rawLBend = armBend(ub.leftShoulder, ub.leftElbow, ub.leftWrist);
    const rawRBend = armBend(ub.rightShoulder, ub.rightElbow, ub.rightWrist);

    leftUpperArmElevationRad = mirrorHorizontal ? rawRArm : rawLArm;
    rightUpperArmElevationRad = mirrorHorizontal ? rawLArm : rawRArm;
    leftForearmBendRad = mirrorHorizontal ? rawRBend : rawLBend;
    rightForearmBendRad = mirrorHorizontal ? rawLBend : rawRBend;
  }

  return {
    blendshapes: b,
    vrmPresets: buildVrm10Presets(b),
    gaze: { yawRad: gazeYawRad, pitchRad: gazePitchRad, convergence01 },
    pose: {
      headYawRad,
      headPitchRad,
      headRollRad,
      neckTiltRad: headRollRad * 0.45 + shoulderTiltRad * 0.35,
      shoulderTiltRad,
      spineLeanRad,
      leftUpperArmElevationRad,
      rightUpperArmElevationRad,
      leftForearmBendRad,
      rightForearmBendRad,
    },
  };
}

/**
 * 60fps 지수 평활화 + 컷 즉시 동결(cut-freeze snapshot) 지원 웹캠→VRM 솔버.
 */
export class WebcamVrmExpressionPoseSolver {
  private readonly mirrorHorizontal: boolean;
  private readonly targetFps: number;
  private readonly expressionTauSec: number;
  private readonly poseTauSec: number;

  private initialized = false;
  private lastTimestampMs = 0;
  private smoothBlendshapes: Arkit52BlendshapeMap = createZeroBlendshapeMap();
  private smoothGaze: VrmGazePose = { yawRad: 0, pitchRad: 0, convergence01: 0 };
  private smoothPose: VrmUpperBodyPose = {
    headYawRad: 0,
    headPitchRad: 0,
    headRollRad: 0,
    neckTiltRad: 0,
    shoulderTiltRad: 0,
    spineLeanRad: 0,
    leftUpperArmElevationRad: 0,
    rightUpperArmElevationRad: 0,
    leftForearmBendRad: 0,
    rightForearmBendRad: 0,
  };
  private frozenSnapshot: VrmCutFreezeSnapshot | null = null;
  private snapshotCounter = 0;

  constructor(options: WebcamVrmSolverOptions = {}) {
    this.mirrorHorizontal = options.mirrorHorizontal ?? true;
    this.targetFps = Math.max(15, Math.min(240, options.targetFps ?? 60));
    this.expressionTauSec = Math.max(0.004, options.expressionTauSec ?? 0.032);
    this.poseTauSec = Math.max(0.008, options.poseTauSec ?? 0.055);
  }

  public isFrozen(): boolean {
    return this.frozenSnapshot !== null;
  }

  public getFrozenSnapshot(): VrmCutFreezeSnapshot | null {
    return this.frozenSnapshot;
  }

  /**
   * 현재 표정·시선·상체 포즈를 컷 전용 스냅샷으로 즉시 동결한다.
   */
  public freezeCutSnapshot(cutId: string = "cut-active"): VrmCutFreezeSnapshot {
    this.snapshotCounter += 1;
    const blendCopy = cloneBlendshapeMap(this.smoothBlendshapes);
    const snapshot: VrmCutFreezeSnapshot = {
      snapshotId: `vrm-freeze-${this.snapshotCounter}`,
      cutId,
      capturedAtMs: this.lastTimestampMs,
      blendshapes: blendCopy,
      vrmPresets: buildVrm10Presets(blendCopy),
      gaze: { ...this.smoothGaze },
      pose: { ...this.smoothPose },
    };
    this.frozenSnapshot = snapshot;
    return snapshot;
  }

  public unfreeze(): void {
    this.frozenSnapshot = null;
  }

  public reset(): void {
    this.initialized = false;
    this.lastTimestampMs = 0;
    this.smoothBlendshapes = createZeroBlendshapeMap();
    this.smoothGaze = { yawRad: 0, pitchRad: 0, convergence01: 0 };
    this.smoothPose = {
      headYawRad: 0,
      headPitchRad: 0,
      headRollRad: 0,
      neckTiltRad: 0,
      shoulderTiltRad: 0,
      spineLeanRad: 0,
      leftUpperArmElevationRad: 0,
      rightUpperArmElevationRad: 0,
      leftForearmBendRad: 0,
      rightForearmBendRad: 0,
    };
    this.frozenSnapshot = null;
  }

  public update(frame: WebcamLandmarkFrame): VrmExpressionPoseOutput {
    if (this.frozenSnapshot !== null) {
      return {
        timestampMs: frame.timestampMs,
        blendshapes: cloneBlendshapeMap(this.frozenSnapshot.blendshapes),
        vrmPresets: { ...this.frozenSnapshot.vrmPresets },
        gaze: { ...this.frozenSnapshot.gaze },
        pose: { ...this.frozenSnapshot.pose },
        mirrored: this.mirrorHorizontal,
        isFrozen: true,
        frozenCutId: this.frozenSnapshot.cutId,
        targetFps: this.targetFps,
        smoothingAlphaExpr: 0,
        smoothingAlphaPose: 0,
      };
    }

    const raw = computeArkit52FromLandmarks(frame, this.mirrorHorizontal);
    const defaultDtSec = 1 / this.targetFps;
    const dtSec = this.initialized
      ? clampRange((frame.timestampMs - this.lastTimestampMs) / 1000, 0.001, 0.25)
      : defaultDtSec;
    this.lastTimestampMs = frame.timestampMs;

    const alphaExpr = this.initialized ? 1 - Math.exp(-dtSec / this.expressionTauSec) : 1;
    const alphaPose = this.initialized ? 1 - Math.exp(-dtSec / this.poseTauSec) : 1;
    this.initialized = true;

    for (let i = 0; i < ARKIT_52_BLENDSHAPE_NAMES.length; i += 1) {
      const key = ARKIT_52_BLENDSHAPE_NAMES[i];
      const cur = this.smoothBlendshapes[key];
      this.smoothBlendshapes[key] = clamp01(cur + alphaExpr * (raw.blendshapes[key] - cur));
    }

    this.smoothGaze = {
      yawRad: this.smoothGaze.yawRad + alphaExpr * (raw.gaze.yawRad - this.smoothGaze.yawRad),
      pitchRad:
        this.smoothGaze.pitchRad + alphaExpr * (raw.gaze.pitchRad - this.smoothGaze.pitchRad),
      convergence01:
        this.smoothGaze.convergence01 +
        alphaExpr * (raw.gaze.convergence01 - this.smoothGaze.convergence01),
    };

    const p = this.smoothPose;
    const rp = raw.pose;
    this.smoothPose = {
      headYawRad: p.headYawRad + alphaPose * (rp.headYawRad - p.headYawRad),
      headPitchRad: p.headPitchRad + alphaPose * (rp.headPitchRad - p.headPitchRad),
      headRollRad: p.headRollRad + alphaPose * (rp.headRollRad - p.headRollRad),
      neckTiltRad: p.neckTiltRad + alphaPose * (rp.neckTiltRad - p.neckTiltRad),
      shoulderTiltRad: p.shoulderTiltRad + alphaPose * (rp.shoulderTiltRad - p.shoulderTiltRad),
      spineLeanRad: p.spineLeanRad + alphaPose * (rp.spineLeanRad - p.spineLeanRad),
      leftUpperArmElevationRad:
        p.leftUpperArmElevationRad +
        alphaPose * (rp.leftUpperArmElevationRad - p.leftUpperArmElevationRad),
      rightUpperArmElevationRad:
        p.rightUpperArmElevationRad +
        alphaPose * (rp.rightUpperArmElevationRad - p.rightUpperArmElevationRad),
      leftForearmBendRad:
        p.leftForearmBendRad + alphaPose * (rp.leftForearmBendRad - p.leftForearmBendRad),
      rightForearmBendRad:
        p.rightForearmBendRad + alphaPose * (rp.rightForearmBendRad - p.rightForearmBendRad),
    };

    const outBlend = cloneBlendshapeMap(this.smoothBlendshapes);
    return {
      timestampMs: frame.timestampMs,
      blendshapes: outBlend,
      vrmPresets: buildVrm10Presets(outBlend),
      gaze: { ...this.smoothGaze },
      pose: { ...this.smoothPose },
      mirrored: this.mirrorHorizontal,
      isFrozen: false,
      frozenCutId: null,
      targetFps: this.targetFps,
      smoothingAlphaExpr: alphaExpr,
      smoothingAlphaPose: alphaPose,
    };
  }
}
