/**
 * 마네킹 포저 → 구도 생성 브리프 스냅샷 어댑터 (E2 호스트 마운트, 2026-10-22).
 *
 * 포저의 현재 상태(카메라 프리셋·포즈 프리셋·체형·재질)를
 * `CompositionGenerationSnapshot`(ai/studio-composition-generation-brief 계약)으로
 * 바꾸는 순수 어댑터. 패널(StudioCompositionGenerationBriefPanel)은 이 스냅샷만으로
 * 브리프를 조립하므로, 호스트는 "지금 포저가 무엇을 보고 있는가"만 정직하게 넘기면 된다.
 *
 * 카메라 각도는 씬(studio-mannequin-scene)의 CAMERA_REFERENCE_OFFSETS와 같은
 * 오프셋 방향에서 기하로 계산한다 — 프리셋이 바뀌어도 각도 표가 따로 놀지 않게,
 * 오프셋 벡터 자체를 이 표의 단일 출처로 삼고 방위/고도를 atan2로 도출한다.
 * 화각은 씬의 PerspectiveCamera(35도)와 같은 값이다.
 */

import type { CompositionGenerationSnapshot } from "../ai/studio-composition-generation-brief";
import type { StudioMannequinCameraPreset } from "./studio-mannequin-scene";

/** 브리프에서 포저 캐릭터를 가리키는 안정 식별자. 일관성 키 character:<id>의 근거. */
export const STUDIO_MANNEQUIN_COMPOSITION_CHARACTER_ID = "studio-mannequin";

/** 씬 PerspectiveCamera의 화각(도). studio-mannequin-scene의 생성 인자와 같은 값. */
export const STUDIO_MANNEQUIN_COMPOSITION_FOV_DEGREES = 35;

/**
 * 카메라 프리셋 오프셋 방향 — studio-mannequin-scene의
 * CAMERA_REFERENCE_OFFSETS(기준 신장에서의 카메라 위치 − 목표점)와 같은 벡터.
 * 균일 배율만 다를 뿐 방향이 각도를 결정하므로, 각도 계산에는 이 방향이면 충분하다.
 */
const CAMERA_PRESET_OFFSETS: Readonly<
  Record<StudioMannequinCameraPreset, readonly [number, number, number]>
> = Object.freeze({
  home: [1.55, 0.53, 3.1],
  front: [0, 0.18, 3.4],
  side: [3.4, 0.18, 0],
  back: [0, 0.18, -3.4],
  top: [0, 2.88, 0.01],
  high: [1.8, 2.28, 2.6],
  low: [1.4, -0.72, 2.8],
});

const RAD_TO_DEG = 180 / Math.PI;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 오프셋 방향 → (방위각, 고도각). 방위는 브리프 규약(0=정면, +X쪽이 우측면)과 같다. */
export function resolveStudioMannequinCameraAngles(
  preset: StudioMannequinCameraPreset,
): { readonly azimuthDegrees: number; readonly elevationDegrees: number } {
  const [dx, dy, dz] = CAMERA_PRESET_OFFSETS[preset];
  const azimuth = ((Math.atan2(dx, dz) * RAD_TO_DEG) % 360 + 360) % 360;
  const elevation = Math.atan2(dy, Math.hypot(dx, dz)) * RAD_TO_DEG;
  return { azimuthDegrees: round1(azimuth), elevationDegrees: round1(elevation) };
}

export interface StudioMannequinCompositionSnapshotInput {
  readonly cameraPreset: StudioMannequinCameraPreset;
  /** 체형 신장(cm). 유한 양수가 아니면 기준 신장(165cm)으로 떨어진다. */
  readonly heightCm?: number;
  /** 마지막으로 적용한 포즈 프리셋 id. 없으면 포즈 조건 없이 브리프를 만든다. */
  readonly posePresetId?: string | null;
  /** 포즈 프리셋의 사람용 이름 — 있으면 설명 문구로 브리프에 실린다. */
  readonly poseLabel?: string | null;
  /** 표면 재질 스타일 id — 외형 일관성 정보로 실린다. */
  readonly materialStyle?: string | null;
}

export function buildStudioMannequinCompositionSnapshot(
  input: StudioMannequinCompositionSnapshotInput,
): CompositionGenerationSnapshot {
  const heightCm =
    typeof input.heightCm === "number" && Number.isFinite(input.heightCm) && input.heightCm > 0
      ? Math.round(input.heightCm)
      : 165;
  const appearance: string[] = [`신장 ${heightCm}cm`];
  if (input.materialStyle?.trim()) appearance.push(`재질 ${input.materialStyle.trim()}`);
  const angles = resolveStudioMannequinCameraAngles(input.cameraPreset);
  const posePresetId = input.posePresetId?.trim() ? input.posePresetId.trim() : undefined;
  return {
    characterId: STUDIO_MANNEQUIN_COMPOSITION_CHARACTER_ID,
    characterName: "3D 데생 인형",
    characterAppearance: appearance,
    ...(posePresetId ? { posePresetId } : {}),
    ...(input.poseLabel?.trim() ? { poseDescription: input.poseLabel.trim() } : {}),
    camera: {
      fovDegrees: STUDIO_MANNEQUIN_COMPOSITION_FOV_DEGREES,
      azimuthDegrees: angles.azimuthDegrees,
      elevationDegrees: angles.elevationDegrees,
      // 포저 프리셋은 전부 전신이 들어오는 프레임(resolveStudioMannequinCameraFrame)이다.
      framing: "full-body",
    },
  };
}
