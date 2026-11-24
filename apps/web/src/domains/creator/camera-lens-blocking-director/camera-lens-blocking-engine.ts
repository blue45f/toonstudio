/**
 * 3D 다이내믹 시네마 렌즈 & 180° 액션 축 연속성 스토리보드 연출 코어 엔진.
 *
 * - 35mm 풀프레임(36×24mm) 광학 화각, 샷 사이즈(ECU/CU/MCU/MS/WS), 180° 라인 오브 액션 교차 탐지,
 *   시선 일치(Eyeline Match) 각도 오차, 더치 앵글 긴장도, 1클릭 축 자동 교정,
 *   결정적 Three.js `PerspectiveCamera` JSON 리그 변환을 100% 로컬 수학으로 수행한다.
 */

import type {
  AxisLineOfAction,
  AxisSide,
  AxisViolation,
  BlockingDirectorReport,
  BlockingScenePreset,
  CameraCutSpec,
  CinemaFocalLengthMm,
  CutOpticalAnalysis,
  EyelineMatchQuality,
  ShotSizeCode,
  StageActor,
  ThreeJsCameraRigExport,
  ThreeJsPerspectiveCameraRigEntry,
  Vec3,
} from "./types";

export const FULL_FRAME_SENSOR_WIDTH_MM = 36;
export const FULL_FRAME_SENSOR_HEIGHT_MM = 24;
export const CINEMA_FOCAL_LENGTHS: readonly CinemaFocalLengthMm[] = [24, 35, 50, 85, 135];

export const SHOT_SIZE_LABELS_KO: Readonly<Record<ShotSizeCode, string>> = {
  ECU: "극클로즈업 (ECU)",
  CU: "클로즈업 (CU)",
  MCU: "미디엄 클로즈업 (MCU)",
  MS: "미디엄 샷 (MS)",
  WS: "와이드 샷 (WS)",
};

export const LENS_CHARACTER_KO: Readonly<Record<CinemaFocalLengthMm, string>> = {
  24: "광각 · 공간감·원근 과장",
  35: "준광각 · 현장감·시네마 표준",
  50: "표준 · 자연스러운 육안 원근",
  85: "중망원 · 인물 몰입·배경 분리",
  135: "망원 · 압축감·긴장 클로즈업",
};

export const CAMERA_BLOCKING_PRESETS: readonly BlockingScenePreset[] = [
  {
    id: "rooftop-confrontation",
    nameKo: "옥상 대치 (180° 이탈 포함)",
    genreKo: "액션 스릴러 · 대립 리버스 샷",
    descriptionKo: "컷 3에서 카메라가 180° 액션 라인을 넘어 시선이 엇갈리는 대표 오류 시나리오입니다. 원클릭 자동 교정으로 즉시 복구할 수 있습니다.",
    primaryAxisActorIds: ["hero", "rival"],
    actors: [
      { id: "hero", nameKo: "강현 (주인공)", role: "protagonist", position: { x: -2.2, y: 0, z: 0 }, facingYawDeg: 0, eyeHeightM: 1.66, shoulderWidthM: 0.46 },
      { id: "rival", nameKo: "세라 (라이벌)", role: "antagonist", position: { x: 2.2, y: 0, z: 0 }, facingYawDeg: 180, eyeHeightM: 1.62, shoulderWidthM: 0.42 },
    ],
    cuts: [
      { id: "cut-1", cutNumber: 1, labelKo: "오프닝 대치 전경", primaryActorId: "hero", lookTargetActorId: "rival", cameraPosition: { x: 0, y: 1.68, z: 5.2 }, focalLengthMm: 24, dutchRollDeg: 0, aspectRatio: 1.5 },
      { id: "cut-2", cutNumber: 2, labelKo: "강현 경고 OTS", primaryActorId: "hero", lookTargetActorId: "rival", cameraPosition: { x: 0.9, y: 1.66, z: 2.1 }, focalLengthMm: 50, dutchRollDeg: 4, aspectRatio: 1.5 },
      { id: "cut-3", cutNumber: 3, labelKo: "세라 반격 (축 이탈 오류)", primaryActorId: "rival", lookTargetActorId: "hero", cameraPosition: { x: -0.6, y: 1.62, z: -2.1 }, focalLengthMm: 85, dutchRollDeg: -16, aspectRatio: 1.5 },
      { id: "cut-4", cutNumber: 4, labelKo: "강현 눈빛 극클로즈업", primaryActorId: "hero", lookTargetActorId: "rival", cameraPosition: { x: -0.4, y: 1.66, z: 1.1 }, focalLengthMm: 135, dutchRollDeg: 12, aspectRatio: 1.5 },
      { id: "cut-5", cutNumber: 5, labelKo: "세라 발도 미디엄", primaryActorId: "rival", lookTargetActorId: "hero", cameraPosition: { x: -0.4, y: 1.58, z: 2.6 }, focalLengthMm: 35, dutchRollDeg: -8, aspectRatio: 1.5 },
    ],
  },
  {
    id: "cafe-confession",
    nameKo: "카페 고백 (정석 리버스)",
    genreKo: "로맨스 드라마 · 안정 180° 블로킹",
    descriptionKo: "50mm와 85mm 렌즈로 동일 반평면을 지키며 친밀한 시선 일치를 유지하는 정석 5컷 대화 씬입니다.",
    primaryAxisActorIds: ["jiwoo", "doyun"],
    actors: [
      { id: "jiwoo", nameKo: "지우", role: "protagonist", position: { x: -1.5, y: 0, z: 0.2 }, facingYawDeg: 0, eyeHeightM: 1.24, shoulderWidthM: 0.39 },
      { id: "doyun", nameKo: "도윤", role: "support", position: { x: 1.5, y: 0, z: 0.2 }, facingYawDeg: 180, eyeHeightM: 1.32, shoulderWidthM: 0.45 },
    ],
    cuts: [
      { id: "cafe-1", cutNumber: 1, labelKo: "창가 테이블 투샷", primaryActorId: "jiwoo", lookTargetActorId: "doyun", cameraPosition: { x: 0.1, y: 1.35, z: 3.4 }, focalLengthMm: 35, dutchRollDeg: 0, aspectRatio: 1.5 },
      { id: "cafe-2", cutNumber: 2, labelKo: "지우 망설임 MCU", primaryActorId: "jiwoo", lookTargetActorId: "doyun", cameraPosition: { x: 0.4, y: 1.26, z: 1.9 }, focalLengthMm: 50, dutchRollDeg: 0, aspectRatio: 1.5 },
      { id: "cafe-3", cutNumber: 3, labelKo: "도윤 경청 CU", primaryActorId: "doyun", lookTargetActorId: "jiwoo", cameraPosition: { x: -0.4, y: 1.3, z: 1.95 }, focalLengthMm: 85, dutchRollDeg: 0, aspectRatio: 1.5 },
      { id: "cafe-4", cutNumber: 4, labelKo: "지우 고백 CU", primaryActorId: "jiwoo", lookTargetActorId: "doyun", cameraPosition: { x: 0.25, y: 1.24, z: 1.7 }, focalLengthMm: 85, dutchRollDeg: 2, aspectRatio: 1.5 },
      { id: "cafe-5", cutNumber: 5, labelKo: "도윤 미소 ECU", primaryActorId: "doyun", lookTargetActorId: "jiwoo", cameraPosition: { x: 0.1, y: 1.32, z: 1.35 }, focalLengthMm: 135, dutchRollDeg: 0, aspectRatio: 1.5 },
    ],
  },
  {
    id: "corridor-thriller",
    nameKo: "복도 추격 (더치 & 광각 압박)",
    genreKo: "미스터리 서스펜스 · 심리 불균형",
    descriptionKo: "24mm 광각과 135mm 망원, 강한 더치 앵글을 조합하며 컷 4의 축 교차 오류를 탐지·교정합니다.",
    primaryAxisActorIds: ["detective", "suspect"],
    actors: [
      { id: "detective", nameKo: "민재 (형사)", role: "protagonist", position: { x: -2.4, y: 0, z: -0.4 }, facingYawDeg: 10, eyeHeightM: 1.7, shoulderWidthM: 0.46 },
      { id: "suspect", nameKo: "용의자", role: "antagonist", position: { x: 2.3, y: 0, z: 0.4 }, facingYawDeg: 190, eyeHeightM: 1.68, shoulderWidthM: 0.44 },
    ],
    cuts: [
      { id: "thr-1", cutNumber: 1, labelKo: "긴 복도 원근 와이드", primaryActorId: "detective", lookTargetActorId: "suspect", cameraPosition: { x: -0.4, y: 1.65, z: 4.5 }, focalLengthMm: 24, dutchRollDeg: 6, aspectRatio: 1.778 },
      { id: "thr-2", cutNumber: 2, labelKo: "형사 압박 미디엄", primaryActorId: "detective", lookTargetActorId: "suspect", cameraPosition: { x: 0.3, y: 1.68, z: 2.4 }, focalLengthMm: 35, dutchRollDeg: 14, aspectRatio: 1.778 },
      { id: "thr-3", cutNumber: 3, labelKo: "용의자 동요 CU", primaryActorId: "suspect", lookTargetActorId: "detective", cameraPosition: { x: -0.1, y: 1.66, z: 2.2 }, focalLengthMm: 85, dutchRollDeg: -19, aspectRatio: 1.778 },
      { id: "thr-4", cutNumber: 4, labelKo: "돌발 반전 (축 이탈)", primaryActorId: "detective", lookTargetActorId: "suspect", cameraPosition: { x: -0.3, y: 1.7, z: -2.0 }, focalLengthMm: 135, dutchRollDeg: 28, aspectRatio: 1.778 },
      { id: "thr-5", cutNumber: 5, labelKo: "대치 정적 MS", primaryActorId: "suspect", lookTargetActorId: "detective", cameraPosition: { x: 0.1, y: 1.64, z: 3.1 }, focalLengthMm: 50, dutchRollDeg: -10, aspectRatio: 1.778 },
    ],
  },
];

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** 35mm 풀프레임 센서 기준 수직 화각(FOV, 도)을 계산한다. */
export function computeVerticalFovDeg(focalLengthMm: CinemaFocalLengthMm): number {
  const rad = 2 * Math.atan(FULL_FRAME_SENSOR_HEIGHT_MM / (2 * focalLengthMm));
  return round2(rad * RAD_TO_DEG);
}

/** 수직 화각과 화면비로부터 수평 화각(도)을 계산한다. */
export function computeHorizontalFovDeg(verticalFovDeg: number, aspectRatio: number): number {
  const safeAspect = clamp(aspectRatio, 0.5, 2.5);
  const vRad = verticalFovDeg * DEG_TO_RAD;
  const hRad = 2 * Math.atan(Math.tan(vRad / 2) * safeAspect);
  return round2(hRad * RAD_TO_DEG);
}

/** 피사체 평면의 가시 수직 높이(m)로 영화·웹툰 샷 사이즈(ECU~WS)를 분류한다. */
export function classifyShotSize(visibleVerticalHeightM: number): ShotSizeCode {
  if (visibleVerticalHeightM <= 0.38) return "ECU";
  if (visibleVerticalHeightM <= 0.72) return "CU";
  if (visibleVerticalHeightM <= 1.28) return "MCU";
  if (visibleVerticalHeightM <= 2.2) return "MS";
  return "WS";
}

function findActor(actors: readonly StageActor[], actorId: string): StageActor {
  const found = actors.find((a) => a.id === actorId) ?? actors[0];
  if (!found) throw new Error("최소 1명의 스테이지 액터가 필요합니다.");
  return found;
}

/** 두 주요 액터 사이의 180° 액션 라인과 기준 반평면(referenceSide)을 계산한다. */
export function computeLineOfAction(
  actorA: StageActor,
  actorB: StageActor,
  referenceCut?: CameraCutSpec,
): AxisLineOfAction {
  const dx = actorB.position.x - actorA.position.x;
  const dz = actorB.position.z - actorA.position.z;
  const lengthM = Math.max(0.001, Math.hypot(dx, dz));
  const dirX = dx / lengthM;
  const dirZ = dz / lengthM;
  const angleDeg = round2(Math.atan2(dirZ, dirX) * RAD_TO_DEG);

  let referenceSide: Exclude<AxisSide, "on-axis"> = "left";
  if (referenceCut) {
    const signed = computeSignedDistanceRaw(
      actorA.position.x,
      actorA.position.z,
      dirX,
      dirZ,
      referenceCut.cameraPosition.x,
      referenceCut.cameraPosition.z,
    );
    referenceSide = signed < 0 ? "right" : "left";
  }

  return {
    actorAId: actorA.id,
    actorBId: actorB.id,
    originX: round2(actorA.position.x),
    originZ: round2(actorA.position.z),
    dirX: round4(dirX),
    dirZ: round4(dirZ),
    lengthM: round2(lengthM),
    angleDeg,
    referenceSide,
  };
}

function computeSignedDistanceRaw(
  originX: number,
  originZ: number,
  dirX: number,
  dirZ: number,
  px: number,
  pz: number,
): number {
  // 2D 외적(D × (P - A)) = dirX * (pz - originZ) - dirZ * (px - originX)
  return dirX * (pz - originZ) - dirZ * (px - originX);
}

/** 180° 액션 라인으로부터 카메라의 부호 있는 수직 거리(m)를 반환한다. */
export function computeSignedAxisDistanceM(line: AxisLineOfAction, point: Vec3): number {
  return round2(
    computeSignedDistanceRaw(line.originX, line.originZ, line.dirX, line.dirZ, point.x, point.z),
  );
}

/** 부호 있는 거리를 180° 반평면(`left` / `right` / `on-axis`)으로 분류한다. */
export function classifyAxisSide(signedDistanceM: number): AxisSide {
  if (Math.abs(signedDistanceM) < 0.08) return "on-axis";
  return signedDistanceM > 0 ? "left" : "right";
}

/**
 * 180° 액션 라인을 기준으로 카메라 위치를 정확히 대칭 반사한다.
 * 피사체와의 거리와 화각·샷 사이즈를 보존하면서 올바른 반평면으로 되돌린다.
 */
export function mirrorCameraAcrossAxis(line: AxisLineOfAction, cameraPosition: Vec3): Vec3 {
  const signed = computeSignedDistanceRaw(
    line.originX,
    line.originZ,
    line.dirX,
    line.dirZ,
    cameraPosition.x,
    cameraPosition.z,
  );
  // 단위 법선 N = (-dirZ, dirX), cross(D, N) = +1
  const nx = -line.dirZ;
  const nz = line.dirX;
  const mirroredX = cameraPosition.x - 2 * signed * nx;
  const mirroredZ = cameraPosition.z - 2 * signed * nz;
  return {
    x: round2(mirroredX),
    y: round2(cameraPosition.y),
    z: round2(mirroredZ),
  };
}

/** 더치 앵글 기울기·초점거리·샷 사이즈를 결합해 극적 긴장도(0~100)를 계산한다. */
export function computeDutchTensionScore(
  dutchRollDeg: number,
  focalLengthMm: CinemaFocalLengthMm,
  shotSize: ShotSizeCode,
): number {
  const absRoll = clamp(Math.abs(dutchRollDeg), 0, 45);
  const rollComponent = Math.min(68, (absRoll / 30) * 68);
  const lensComponent =
    focalLengthMm === 24 || focalLengthMm === 135 ? 14 : focalLengthMm === 85 ? 10 : 6;
  const shotComponent =
    shotSize === "ECU" ? 18 : shotSize === "CU" ? 13 : shotSize === "MCU" ? 8 : 4;
  return Math.round(clamp(rollComponent + lensComponent + shotComponent, 0, 100));
}

function computeScreenGazeAndAngle(
  cameraPos: Vec3,
  subject: StageActor,
  target: StageActor,
): { readonly screenGazeX: number; readonly gazeAngleFromLensDeg: number } {
  const fx = subject.position.x - cameraPos.x;
  const fz = subject.position.z - cameraPos.z;
  const fLen = Math.max(0.0001, Math.hypot(fx, fz));
  const fnx = fx / fLen;
  const fnz = fz / fLen;

  // 오른손 좌표계(Y-Up) 카메라 스크린 우측 벡터 R = normalize(F × up) = (-fnz, fnx)
  const rx = -fnz;
  const rz = fnx;

  const gx = target.position.x - subject.position.x;
  const gz = target.position.z - subject.position.z;
  const gLen = Math.max(0.0001, Math.hypot(gx, gz));
  const gnx = gx / gLen;
  const gnz = gz / gLen;

  const screenGazeX = round2(clamp(gnx * rx + gnz * rz, -1, 1));
  // 카메라를 향한 시선 편차 각도(피사체가 카메라 축과 이루는 각)
  const dotToCam = clamp(gnx * -fnx + gnz * -fnz, -1, 1);
  const gazeAngleFromLensDeg = round2(Math.acos(dotToCam) * RAD_TO_DEG);
  return { screenGazeX, gazeAngleFromLensDeg };
}

/** 멀티컷 3D 카메라 블로킹을 분석해 180° 축 이탈·시선 오차·더치 긴장도 리포트를 생성한다. */
export function analyzeCameraBlocking(input: {
  readonly sceneId: string;
  readonly actors: readonly StageActor[];
  readonly cuts: readonly CameraCutSpec[];
  readonly primaryAxisActorIds: readonly [string, string];
}): BlockingDirectorReport {
  const actorA = findActor(input.actors, input.primaryAxisActorIds[0]);
  const actorB = findActor(input.actors, input.primaryAxisActorIds[1]);
  const firstCut = input.cuts[0];
  const lineOfAction = computeLineOfAction(actorA, actorB, firstCut);

  const cutAnalyses: CutOpticalAnalysis[] = [];
  const violations: AxisViolation[] = [];
  let prevSide: Exclude<AxisSide, "on-axis"> = lineOfAction.referenceSide;
  let prevCut: CameraCutSpec | null = null;
  let prevGazeInfo: { readonly screenGazeX: number; readonly gazeAngleFromLensDeg: number } | null = null;

  for (const cut of input.cuts) {
    const subject = findActor(input.actors, cut.primaryActorId);
    const target = findActor(input.actors, cut.lookTargetActorId);
    const subjectEyePos: Vec3 = { x: subject.position.x, y: subject.eyeHeightM, z: subject.position.z };

    const distanceToSubjectM = round2(
      Math.max(
        0.2,
        Math.hypot(
          cut.cameraPosition.x - subjectEyePos.x,
          cut.cameraPosition.y - subjectEyePos.y,
          cut.cameraPosition.z - subjectEyePos.z,
        ),
      ),
    );
    const verticalFovDeg = computeVerticalFovDeg(cut.focalLengthMm);
    const horizontalFovDeg = computeHorizontalFovDeg(verticalFovDeg, cut.aspectRatio);
    const visibleVerticalHeightM = round2(
      2 * distanceToSubjectM * Math.tan((verticalFovDeg * DEG_TO_RAD) / 2),
    );
    const shotSize = classifyShotSize(visibleVerticalHeightM);
    const signedAxisDistanceM = computeSignedAxisDistanceM(lineOfAction, cut.cameraPosition);
    const axisSide = classifyAxisSide(signedAxisDistanceM);
    const gazeInfo = computeScreenGazeAndAngle(cut.cameraPosition, subject, target);
    const dutchTensionScore = computeDutchTensionScore(cut.dutchRollDeg, cut.focalLengthMm, shotSize);
    const lensCompressionIndex = round2(clamp((cut.focalLengthMm - 18) / (135 - 18), 0.05, 1));

    const warningsKo: string[] = [];
    let axisCrossedFromCutNumber: number | null = null;

    if (
      axisSide !== "on-axis" &&
      axisSide !== lineOfAction.referenceSide &&
      !cut.allowIntentionalAxisCross
    ) {
      axisCrossedFromCutNumber = prevCut?.cutNumber ?? 1;
      const suggestedMirrorPosition = mirrorCameraAcrossAxis(lineOfAction, cut.cameraPosition);
      const msg = `컷 ${cut.cutNumber}(${cut.labelKo})가 180° 액션 라인을 넘어 반대 반평면(${axisSide})으로 이탈했습니다.`;
      warningsKo.push(msg);
      violations.push({
        id: `axis-${cut.id}`,
        fromCutNumber: axisCrossedFromCutNumber,
        toCutNumber: cut.cutNumber,
        cutId: cut.id,
        severity: "critical",
        kind: "axis-crossing",
        messageKo: msg,
        suggestedMirrorPosition,
      });
    }

    // 시선 일치(Eyeline Match) 각도 오차 계산
    let eyelineMatchErrorDeg = 0;
    if (prevCut && prevGazeInfo) {
      const isReverseShot =
        prevCut.primaryActorId === cut.lookTargetActorId &&
        prevCut.lookTargetActorId === cut.primaryActorId;

      if (isReverseShot) {
        const sameScreenDirection =
          Math.sign(prevGazeInfo.screenGazeX) !== 0 &&
          Math.sign(gazeInfo.screenGazeX) === Math.sign(prevGazeInfo.screenGazeX);
        const angleAsymmetry = Math.abs(gazeInfo.gazeAngleFromLensDeg - prevGazeInfo.gazeAngleFromLensDeg);
        if (sameScreenDirection) {
          // 두 인물이 스크린의 같은 방향을 바라보면 시선 교차 불일치
          eyelineMatchErrorDeg = round2(
            clamp(
              Math.abs(Math.asin(Math.abs(prevGazeInfo.screenGazeX)) * RAD_TO_DEG) +
                Math.abs(Math.asin(Math.abs(gazeInfo.screenGazeX)) * RAD_TO_DEG),
              28,
              135,
            ),
          );
        } else {
          eyelineMatchErrorDeg = round2(clamp(angleAsymmetry * 0.45, 0, 45));
        }
      } else if (prevCut.primaryActorId === cut.primaryActorId) {
        // 동일 인물 연속 컷에서 스크린 시선 방향이 반전되면 불일치
        const flipped =
          Math.abs(prevGazeInfo.screenGazeX) > 0.12 &&
          Math.abs(gazeInfo.screenGazeX) > 0.12 &&
          Math.sign(prevGazeInfo.screenGazeX) !== Math.sign(gazeInfo.screenGazeX);
        eyelineMatchErrorDeg = flipped
          ? round2(60 + Math.abs(gazeInfo.screenGazeX - prevGazeInfo.screenGazeX) * 20)
          : round2(Math.abs(gazeInfo.gazeAngleFromLensDeg - prevGazeInfo.gazeAngleFromLensDeg) * 0.25);
      }
    }

    const eyelineMatchQuality: EyelineMatchQuality =
      eyelineMatchErrorDeg <= 12 ? "exact" : eyelineMatchErrorDeg <= 24 ? "acceptable" : "broken";

    if (eyelineMatchQuality === "broken") {
      const msg = `컷 ${cut.cutNumber} 시선 일치 오차가 ${eyelineMatchErrorDeg.toFixed(1)}°로 기준(24°)을 초과했습니다.`;
      warningsKo.push(msg);
      violations.push({
        id: `eyeline-${cut.id}`,
        fromCutNumber: prevCut?.cutNumber ?? cut.cutNumber,
        toCutNumber: cut.cutNumber,
        cutId: cut.id,
        severity: "critical",
        kind: "eyeline-mismatch",
        messageKo: msg,
        suggestedMirrorPosition:
          axisSide !== lineOfAction.referenceSide
            ? mirrorCameraAcrossAxis(lineOfAction, cut.cameraPosition)
            : undefined,
      });
    }

    if (Math.abs(cut.dutchRollDeg) >= 26) {
      const msg = `컷 ${cut.cutNumber} 더치 앵글(${cut.dutchRollDeg}°)이 과도해 모바일 스크롤에서 어지러움을 유발할 수 있습니다.`;
      warningsKo.push(msg);
      violations.push({
        id: `dutch-${cut.id}`,
        fromCutNumber: cut.cutNumber,
        toCutNumber: cut.cutNumber,
        cutId: cut.id,
        severity: "warning",
        kind: "extreme-dutch",
        messageKo: msg,
      });
    }

    cutAnalyses.push({
      cutId: cut.id,
      cutNumber: cut.cutNumber,
      verticalFovDeg,
      horizontalFovDeg,
      distanceToSubjectM,
      visibleVerticalHeightM,
      shotSize,
      shotSizeLabelKo: SHOT_SIZE_LABELS_KO[shotSize],
      axisSide,
      signedAxisDistanceM,
      axisCrossedFromCutNumber,
      screenGazeX: gazeInfo.screenGazeX,
      eyelineMatchErrorDeg,
      eyelineMatchQuality,
      dutchTensionScore,
      lensCompressionIndex,
      warningsKo,
    });

    if (axisSide !== "on-axis") prevSide = axisSide;
    prevCut = cut;
    prevGazeInfo = gazeInfo;
  }

  void prevSide;
  const axisViolationCount = violations.filter((v) => v.kind === "axis-crossing").length;
  const averageEyelineErrorDeg =
    cutAnalyses.length > 0
      ? round2(cutAnalyses.reduce((s, c) => s + c.eyelineMatchErrorDeg, 0) / cutAnalyses.length)
      : 0;
  const maxDutchTensionScore =
    cutAnalyses.length > 0 ? Math.max(...cutAnalyses.map((c) => c.dutchTensionScore)) : 0;

  const criticalCount = violations.filter((v) => v.severity === "critical").length;
  const warningCount = violations.filter((v) => v.severity === "warning").length;
  const continuityScore = Math.round(
    clamp(100 - criticalCount * 22 - warningCount * 6 - Math.max(0, averageEyelineErrorDeg - 8) * 0.6, 0, 100),
  );

  return {
    sceneId: input.sceneId,
    lineOfAction,
    cutAnalyses,
    violations,
    axisViolationCount,
    averageEyelineErrorDeg,
    maxDutchTensionScore,
    continuityScore,
    isContinuityClean: axisViolationCount === 0 && criticalCount === 0,
  };
}

/** 1클릭 180° 축 위반 자동 교정: 이탈한 모든 컷의 카메라를 기준 반평면으로 대칭 반사한다. */
export function autoFixAxisViolations(input: {
  readonly actors: readonly StageActor[];
  readonly cuts: readonly CameraCutSpec[];
  readonly primaryAxisActorIds: readonly [string, string];
}): readonly CameraCutSpec[] {
  const actorA = findActor(input.actors, input.primaryAxisActorIds[0]);
  const actorB = findActor(input.actors, input.primaryAxisActorIds[1]);
  const line = computeLineOfAction(actorA, actorB, input.cuts[0]);

  return input.cuts.map((cut) => {
    if (cut.allowIntentionalAxisCross) return cut;
    const signed = computeSignedAxisDistanceM(line, cut.cameraPosition);
    const side = classifyAxisSide(signed);
    if (side === "on-axis" || side === line.referenceSide) {
      return cut;
    }
    return {
      ...cut,
      cameraPosition: mirrorCameraAcrossAxis(line, cut.cameraPosition),
    };
  });
}

function normalize3(v: readonly [number, number, number]): readonly [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len <= 1e-8) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): readonly [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** 3×3 직교 회전 행렬의 열벡터 `[xAxis, yAxis, zAxis]`를 단위 쿼터니언 `[x, y, z, w]`로 변환한다. */
function basisToUnitQuaternion(
  xAxis: readonly [number, number, number],
  yAxis: readonly [number, number, number],
  zAxis: readonly [number, number, number],
): readonly [number, number, number, number] {
  const m00 = xAxis[0];
  const m10 = xAxis[1];
  const m20 = xAxis[2];
  const m01 = yAxis[0];
  const m11 = yAxis[1];
  const m21 = yAxis[2];
  const m02 = zAxis[0];
  const m12 = zAxis[1];
  const m22 = zAxis[2];

  const trace = m00 + m11 + m22;
  let qx: number;
  let qy: number;
  let qz: number;
  let qw: number;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }

  const norm = Math.hypot(qx, qy, qz, qw) || 1;
  return [round4(qx / norm), round4(qy / norm), round4(qz / norm), round4(qw / norm)];
}

/** Three.js `PerspectiveCamera`에 바로 주입 가능한 결정적 JSON 리그 데이터를 생성한다. */
export function exportThreeJsCameraRig(input: {
  readonly sceneId: string;
  readonly sceneNameKo: string;
  readonly actors: readonly StageActor[];
  readonly cuts: readonly CameraCutSpec[];
  readonly primaryAxisActorIds: readonly [string, string];
}): ThreeJsCameraRigExport {
  const report = analyzeCameraBlocking(input);

  const cameras: ThreeJsPerspectiveCameraRigEntry[] = input.cuts.map((cut, index) => {
    const subject = findActor(input.actors, cut.primaryActorId);
    const analysis = report.cutAnalyses[index];
    const fov = analysis?.verticalFovDeg ?? computeVerticalFovDeg(cut.focalLengthMm);
    const shotSize = analysis?.shotSize ?? "MS";

    const pos: readonly [number, number, number] = [
      round2(cut.cameraPosition.x),
      round2(cut.cameraPosition.y),
      round2(cut.cameraPosition.z),
    ];
    const target: readonly [number, number, number] = [
      round2(subject.position.x),
      round2(subject.eyeHeightM),
      round2(subject.position.z),
    ];

    // Three.js PerspectiveCamera는 로컬 -Z 방향을 바라보므로 zAxis = normalize(pos - target)
    const zAxis = normalize3([pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]]);
    const worldUp: readonly [number, number, number] = Math.abs(zAxis[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
    const x0 = normalize3(cross3(worldUp, zAxis));
    const y0 = normalize3(cross3(zAxis, x0));

    const rollRad = clamp(cut.dutchRollDeg, -45, 45) * DEG_TO_RAD;
    const cosR = Math.cos(rollRad);
    const sinR = Math.sin(rollRad);
    const xRolled = normalize3([
      x0[0] * cosR + y0[0] * sinR,
      x0[1] * cosR + y0[1] * sinR,
      x0[2] * cosR + y0[2] * sinR,
    ]);
    const yRolled = normalize3([
      -x0[0] * sinR + y0[0] * cosR,
      -x0[1] * sinR + y0[1] * cosR,
      -x0[2] * sinR + y0[2] * cosR,
    ]);
    const quaternion = basisToUnitQuaternion(xRolled, yRolled, zAxis);

    return {
      cutId: cut.id,
      cutNumber: cut.cutNumber,
      labelKo: cut.labelKo,
      shotSize,
      cameraType: "PerspectiveCamera",
      fov,
      focalLengthMm: cut.focalLengthMm,
      filmGaugeMm: 35,
      aspect: round4(cut.aspectRatio),
      near: 0.1,
      far: 120,
      position: pos,
      lookAt: target,
      up: [round4(yRolled[0]), round4(yRolled[1]), round4(yRolled[2])],
      rollDeg: round2(cut.dutchRollDeg),
      quaternion,
    };
  });

  return {
    schemaVersion: "toonstudio.camera-rig.v1",
    sceneId: input.sceneId,
    sceneNameKo: input.sceneNameKo,
    filmGaugeMm: 35,
    lineOfAction: report.lineOfAction,
    cameras,
  };
}

/** Three.js 카메라 리그를 결정적 JSON 문자열로 직렬화한다. */
export function serializeThreeJsCameraRig(rig: ThreeJsCameraRigExport): string {
  return JSON.stringify(rig, null, 2);
}

/** 프리셋 ID로 내장 카메라 블로킹 프리셋을 안전하게 조회한다. */
export function findCameraBlockingPresetById(presetId: string | undefined): BlockingScenePreset {
  const matched = CAMERA_BLOCKING_PRESETS.find((preset) => preset.id === presetId);
  if (matched) return matched;
  const fallback = CAMERA_BLOCKING_PRESETS[0];
  if (!fallback) throw new Error("내장 3D 카메라 블로킹 프리셋이 비어 있습니다.");
  return fallback;
}
