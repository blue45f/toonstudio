/**
 * P2-18 3D 배치: GLB 단위(mm 1000× / cm 100× / 초소형 0.01×) 및 위쪽 축(Z-up → Y-up 누움 / 바닥 아래 매몰)
 * 이상 징후를 미리보기·선택 단계에서 즉시 진단하고 한국어 보정 가이드를 돌려주는 순수 모듈.
 *
 * Three.js / Babylon.js 의존성 없이 순수 수치만으로 동작해 단위 테스트와 DOM HUD에서 공유한다.
 */
import type { Bg3dMutableVec3, Bg3dVec3 } from "./studio-bg3d-object-ops";

export type StudioBg3dGlbUnitAnomaly =
  | "none"
  | "millimeters-1000x"
  | "centimeters-100x"
  | "microscopic-0.01x";

export type StudioBg3dGlbAxisAnomaly =
  | "none"
  | "z-up-suspected"
  | "sunk-below-floor";

export interface StudioBg3dGlbUnitAxisInput {
  /** 정규화 이전 원본 GLB 바운딩 크기 `[dx, dy, dz]` (파일 단위). */
  readonly rawSize: readonly [number, number, number];
  /** 정규화 이전 원본 GLB 최저점 `min.y` (파일 단위). */
  readonly rawMinY: number;
  /** 루트·하위 노드 이름 목록(선택). Z-up/Blender/SketchUp 힌트 탐지 보조용. */
  readonly nodeNames?: readonly string[];
  /** 번들 환경 자산 여부(환경 자산은 7~40m가 정상이므로 cm 오탐에서 제외). */
  readonly isBundledEnvironment?: boolean;
}

export interface StudioBg3dGlbUnitAxisReport {
  readonly hasWarning: boolean;
  readonly unitAnomaly: StudioBg3dGlbUnitAnomaly;
  readonly axisAnomaly: StudioBg3dGlbAxisAnomaly;
  readonly rawMaxExtent: number;
  readonly headlineKo: string;
  readonly guidanceKo: string;
  readonly recommendedScaleFactor: number;
  readonly recommendedXRotationDeg: number;
}

const Z_UP_NAME_HINT_PATTERN = /\b(?:z[_-]?up|3dsmax|rhino|revit|cad)\b/iu;

function finitePositive(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 원본 GLB 바운딩 치수와 원점 오프셋을 검사해 단위·축 오류 여부를 진단한다.
 */
export function diagnoseStudioBg3dGlbUnitAndAxis(
  input: StudioBg3dGlbUnitAxisInput,
): StudioBg3dGlbUnitAxisReport {
  const dx = finitePositive(input.rawSize[0]);
  const dy = finitePositive(input.rawSize[1]);
  const dz = finitePositive(input.rawSize[2]);
  const rawMaxExtent = Math.max(dx, dy, dz);
  const rawMinY = Number.isFinite(input.rawMinY) ? input.rawMinY : 0;
  const isEnv = input.isBundledEnvironment === true;

  let unitAnomaly: StudioBg3dGlbUnitAnomaly = "none";
  let recommendedScaleFactor = 1;

  if (rawMaxExtent >= 500) {
    unitAnomaly = "millimeters-1000x";
    recommendedScaleFactor = 0.001;
  } else if (!isEnv && rawMaxExtent >= 45) {
    unitAnomaly = "centimeters-100x";
    recommendedScaleFactor = 0.01;
  } else if (rawMaxExtent > 0 && rawMaxExtent <= 0.03) {
    unitAnomaly = "microscopic-0.01x";
    recommendedScaleFactor = 100;
  }

  const hasZUpNameHint =
    input.nodeNames?.some((name) => Z_UP_NAME_HINT_PATTERN.test(name)) === true;
  const flatAlongYButTallAlongZ =
    !isEnv &&
    dy > 0 &&
    dz >= dy * 2.4 &&
    dz >= Math.max(dx * 1.45, 0.25) &&
    dy <= dz * 0.42;

  let axisAnomaly: StudioBg3dGlbAxisAnomaly = "none";
  let recommendedXRotationDeg = 0;

  if (hasZUpNameHint || flatAlongYButTallAlongZ) {
    axisAnomaly = "z-up-suspected";
    recommendedXRotationDeg = -90;
  } else if (dy > 0 && rawMinY < -dy * 0.65) {
    axisAnomaly = "sunk-below-floor";
  }

  const messages: string[] = [];
  const headlines: string[] = [];

  if (unitAnomaly === "millimeters-1000x") {
    headlines.push("GLB 밀리미터(mm · 1000×) 단위 감지");
    messages.push(
      `원본 치수(최대 ${rawMaxExtent.toFixed(0)}단위)가 밀리미터 기준으로 내보내져 장면 기준 크기로 자동 정규화했습니다.`,
    );
  } else if (unitAnomaly === "centimeters-100x") {
    headlines.push("GLB 센티미터(cm · 100×) 단위 감지");
    messages.push(
      `원본 치수(최대 ${rawMaxExtent.toFixed(1)}단위)가 센티미터 기준으로 감지되어 장면 배율로 자동 맞춤했습니다.`,
    );
  } else if (unitAnomaly === "microscopic-0.01x") {
    headlines.push("GLB 초소형(0.01×) 배율 감지");
    messages.push(
      `원본 치수(최대 ${rawMaxExtent.toFixed(4)}m)가 매우 작아 100배 확대 기준 미리보기를 적용했습니다.`,
    );
  }

  if (axisAnomaly === "z-up-suspected") {
    headlines.push("위쪽 축(Z-up → Y-up) 오류 의심");
    messages.push(
      "Z축이 높이 방향인 채 내보내져 모델이 옆/뒤로 누워 있을 수 있습니다. 배치 후 'Z-up 세우기·바닥 맞춤' 버튼으로 즉시 보정하세요.",
    );
  } else if (axisAnomaly === "sunk-below-floor") {
    headlines.push("모델 피벗 바닥 아래 매몰 감지");
    messages.push(
      "원본 피벗이 모델 상단에 있어 바닥 아래로 잠길 수 있습니다. '바닥 맞춤'으로 최저점을 Y=0에 접지하세요.",
    );
  }

  const hasWarning = unitAnomaly !== "none" || axisAnomaly !== "none";
  return {
    hasWarning,
    unitAnomaly,
    axisAnomaly,
    rawMaxExtent,
    headlineKo: hasWarning ? headlines.join(" · ") : "GLB 단위(m)·위쪽 축(Y-up) 정상",
    guidanceKo: hasWarning
      ? messages.join(" ")
      : "glTF 2.0 표준 미터(1m) 및 Y-up 기준과 일치합니다.",
    recommendedScaleFactor,
    recommendedXRotationDeg,
  };
}

/**
 * Z-up으로 누워 들어온 GLB 인스턴스를 Y-up으로 세우기 위해 X축 회전을 -90°(-π/2)만큼 보정한다.
 */
export function standUpZUpRotation(rotation: Bg3dVec3): Bg3dMutableVec3 {
  const rx = Number.isFinite(rotation[0]) ? rotation[0] : 0;
  const ry = Number.isFinite(rotation[1]) ? rotation[1] : 0;
  const rz = Number.isFinite(rotation[2]) ? rotation[2] : 0;
  return [rx - Math.PI / 2, ry, rz];
}
