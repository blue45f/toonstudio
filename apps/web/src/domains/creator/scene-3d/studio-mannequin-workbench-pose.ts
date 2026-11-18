import type { StudioAsset3dMannequinPosePresetId } from "./studio-asset3d-character-lab-diorama-catalog";
import { buildStudioMannequinContrappostoPose } from "./studio-mannequin-gesture-dynamics";
import { buildStudioMannequinSpec, type StudioMannequinBodyParams } from "./studio-mannequin-model";
import { resolveStudioMannequinLibraryPresetPose } from "./studio-mannequin-preset-application";
import { findStudioMannequinPosePreset, normalizeStudioMannequinPose, type StudioMannequinPose } from "./studio-mannequin-poses";

const libraryIds = {
  standing: "stand", walking: "walk", running: "run", sitting: "sit-chair",
  action: "hero-landing", dramatic: "arms-spread", contrapposto: "stand", "webtoon-lookback": "stand",
} satisfies Record<StudioAsset3dMannequinPosePresetId, string>;

/** 워크벤치의 모션 분류를 현재 체형이 사용할 수 있는 한 프레임 포즈로 옮긴다. */
export function resolveStudioMannequinWorkbenchPose(
  motion: StudioAsset3dMannequinPosePresetId, params: StudioMannequinBodyParams, current: StudioMannequinPose,
): StudioMannequinPose {
  const preset = findStudioMannequinPosePreset(libraryIds[motion]);
  if (!preset) throw new Error("워크벤치에 연결된 포즈 프리셋을 찾지 못했습니다.");
  const pose = resolveStudioMannequinLibraryPresetPose(preset, params, current);
  if (motion === "contrapposto") return buildStudioMannequinContrappostoPose(buildStudioMannequinSpec(params), pose, "left");
  if (motion === "webtoon-lookback") {
    return normalizeStudioMannequinPose({
      ...pose, joints: { ...pose.joints, spine: [0, 0.18, 0], chest: [0, 0.32, 0], neck: [0, 0.3, 0], head: [0, 0.48, 0] },
    });
  }
  return pose;
}
