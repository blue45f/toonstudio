/** 현재 frame은 runtime 순서로 고정하고 원본 clip은 복제 인스턴스의 UUID에 결합한다. */
import * as THREE from "three";
import { sampleStudioBg3dAnimationActionAtTime, type StudioBg3dEditableThreeClone } from "../studio-background-3d-model";
import { resolveStudioBg3dAnimationTime } from "./studio-bg3d-animation-time";
import { StudioBg3dSceneGlbGraphError } from "./studio-bg3d-scene-glb-errors";
import type { StudioBg3dModelNode } from "./studio-bg3d-scene-document-types";

export interface StudioBg3dSceneGlbAnimationState {
  readonly nodeId: string;
  readonly sampledTimeSeconds: number;
  readonly clipCount: number;
  readonly playback: "original-clips-retargeted";
  readonly composedPlaybackBaked: false;
}
function error(nodeId: string, reason: string): StudioBg3dSceneGlbGraphError {
  return new StudioBg3dSceneGlbGraphError("animation-unavailable", [nodeId], reason);
}
function sourceTargets(source: THREE.Object3D, clone: THREE.Object3D): Map<string, THREE.Object3D> {
  const result = new Map<string, THREE.Object3D>(), queue: Array<readonly [THREE.Object3D, THREE.Object3D]> = [[source, clone]];
  while (queue.length > 0) {
    const pair = queue.pop(); if (!pair) break;
    const [original, copied] = pair; result.set(original.uuid, copied);
    if (original.children.length !== copied.children.length) throw new Error("model clone hierarchy differs");
    original.children.forEach((child, index) => { const next = copied.children[index]; if (next) queue.push([child, next]); });
  }
  return result;
}
export function retargetStudioBg3dSceneGlbClips(
  source: THREE.Object3D, clone: THREE.Object3D, clips: readonly THREE.AnimationClip[], nodeId: string,
): THREE.AnimationClip[] {
  const bySourceUuid = sourceTargets(source, clone);
  return clips.map((clip, index) => {
    const copied = clip.clone(); copied.name = `${nodeId}/${index}/${clip.name}`;
    for (const track of copied.tracks) {
      let path: THREE.ParseTrackNameResults;
      try { path = THREE.PropertyBinding.parseTrackName(track.name); } catch { throw error(nodeId, "invalid-animation-track"); }
      const found = bySourceUuid.get(path.nodeName) ?? THREE.PropertyBinding.findNode(clone, path.nodeName);
      if (!(found instanceof THREE.Object3D)) throw error(nodeId, "animation-target-missing");
      let target = found;
      if (path.objectName) {
        if (path.objectName !== "bones" || !(found instanceof THREE.SkinnedMesh)) throw error(nodeId, "animation-object-binding-unsupported");
        const bone = found.skeleton.bones.find(({ name }) => name === path.objectIndex) ?? found.skeleton.bones[Number(path.objectIndex)];
        if (!bone) throw error(nodeId, "animation-bone-missing"); target = bone;
      }
      if (!["position", "quaternion", "scale", "morphTargetInfluences"].includes(path.propertyName)) throw error(nodeId, "animation-property-unsupported");
      if (path.propertyName === "morphTargetInfluences" && !(target instanceof THREE.Mesh && target.morphTargetInfluences)) throw error(nodeId, "animation-morph-missing");
      track.name = `${target.uuid}.${path.propertyName}${path.propertyIndex !== undefined ? `[${path.propertyIndex}]` : ""}`;
    }
    return copied;
  });
}
export function applyStudioBg3dSceneGlbModelState(
  clone: StudioBg3dEditableThreeClone, node: StudioBg3dModelNode, clips: readonly THREE.AnimationClip[], sampledTime?: number,
): StudioBg3dSceneGlbAnimationState {
  const joints = new Set(clone.poseController.joints.map(({ key }) => key));
  if (node.pose?.enabled && node.pose.weight > 0 && node.pose.joints.some(({ jointKey }) => !joints.has(jointKey))) throw error(node.id, "pose-joint-missing");
  const targets = new Set(clone.morphController.targets.map(({ key }) => key));
  if (node.morph?.enabled && node.morph.weight > 0 && node.morph.targets.some(({ targetKey }) => !targets.has(targetKey))) throw error(node.id, "morph-target-missing");
  let actualTime = 0;
  const playback = node.animation;
  if (playback) {
    const clip = clips[playback.clipIndex] ?? clips[0];
    if (!clip) throw error(node.id, "animation-clip-missing");
    if (playback.playing && (sampledTime === undefined || !Number.isFinite(sampledTime) || sampledTime < 0 || sampledTime > clip.duration)) throw error(node.id, "current-animation-time-missing");
    const time = playback.playing ? sampledTime ?? 0 : resolveStudioBg3dAnimationTime({ baseTimeSeconds: playback.timeSeconds,
      elapsedSeconds: 0, timeScale: playback.timeScale, durationSeconds: clip.duration, loop: playback.loop });
    const mixer = new THREE.AnimationMixer(clone.root), action = mixer.clipAction(clip);
    action.enabled = true; action.clampWhenFinished = true; action.setLoop(THREE.LoopOnce, 1); action.setEffectiveWeight(playback.weight); action.play(); action.paused = true;
    clone.poseController.restoreRestPose(); clone.morphController.restoreRestWeights();
    actualTime = sampleStudioBg3dAnimationActionAtTime(mixer, action, time);
    clone.poseController.applyToCurrentPose(node.pose); clone.poseController.applyConstraints(node.constraints); clone.morphController.applyToCurrentWeights(node.morph);
    // stop/uncache는 sample을 원래 property로 되돌린다. 추가 tick 없는 로컬 mixer는 여기서 참조를 놓는다.
  } else {
    clone.poseController.applyFromRestPose(node.pose); clone.poseController.applyConstraints(node.constraints); clone.morphController.applyFromRestWeights(node.morph);
  }
  if (node.constraints?.enabled && (node.constraints.aims.some(({ weight }) => weight > 0)
    || node.constraints.twoBoneIks.some(({ weight }) => weight > 0)) && !clone.poseController.captureConstraintBakePose()) throw error(node.id, "constraint-solve-unavailable");
  clone.root.updateWorldMatrix(true, true);
  return { nodeId: node.id, sampledTimeSeconds: actualTime, clipCount: clips.length, playback: "original-clips-retargeted", composedPlaybackBaked: false };
}
