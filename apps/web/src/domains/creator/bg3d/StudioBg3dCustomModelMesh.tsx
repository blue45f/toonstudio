/**
 * Studio bg3d 씬 노드 — 커스텀(GLB) 모델 메시.
 *
 * `StudioBg3dSceneNodes.tsx`에서 분리한 렌더 컴포넌트다. 지오메트리·텍스처는
 * 캐시가 소유하고, 인스턴스마다 복제된 머티리얼을 소유해 형제 배치로 조정값이
 * 새지 않게 하는 계약은 그대로 유지한다.
 */

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";

import {
  createStudioBg3dEditableThreeClone,
  sampleStudioBg3dAnimationActionAtTime,
  type BgCustomModelInstance,
  type StudioBg3dEditableThreeClone,
} from "../studio-background-3d-model";
import { resolveStudioBg3dAnimationSchedule } from "./studio-bg3d-animation-scheduler";
import {
  isStudioBg3dAnimationOnceComplete,
  resolveStudioBg3dAnimationTime,
} from "./studio-bg3d-animation-time";
import { projectStudioBg3dLodDiameterCssPx } from "./studio-bg3d-lod-selection";
import { isBgObjectVisible } from "./studio-bg3d-object-ops";
import { synchronizeStudioBg3dRootMatrix } from "./studio-bg3d-render-optimization";
import {
  applyStudioBg3dGlbTexturePaint,
  collectStudioBg3dGlbTexturePaintTargets,
} from "./studio-bg3d-glb-texture-paint-three";
import type { StudioBg3dRigPoseBakeSnapshot } from "./studio-bg3d-rig-pose-bake";
import type { StudioBg3dAnimationPlayback } from "./studio-bg3d-scene-document";
import type { StudioBg3dPaintPointerPhase } from "./StudioBg3dSceneNodes";

interface BgCustomModelMeshProps {
  instance: BgCustomModelInstance;
  cachedRoot: THREE.Object3D | undefined;
  animations: readonly THREE.AnimationClip[];
  selected: boolean;
  capturing: boolean;
  targetFps: number;
  lodBias: number;
  onSelect: (id: string, isMulti: boolean) => void;
  onSurfacePick: (id: string, event: ThreeEvent<MouseEvent>) => boolean;
  onSurfacePreview?: (event: ThreeEvent<PointerEvent>) => void;
  /**
   * 표면 직접 그리기 2단계(GLB)에서만 주입된다. 프리미티브 페인트와 같은 계약이며,
   * 교차의 대상 키 판정·획 확정은 studio-bg3d-glb-texture-paint-controller 세션이 맡는다.
   * 주입되지 않으면 기존 선택/스냅 동선과 완전히 동일하게 동작한다.
   */
  onPaintPointer?: (id: string, event: ThreeEvent<PointerEvent>, phase: StudioBg3dPaintPointerPhase) => void;
  registerRef: (id: string, obj: THREE.Group | null) => void;
  registerAnimationTime: (id: string, reader: (() => number) | null) => void;
  registerRigBake: (id: string, reader: StudioBg3dRigBakeReader | null) => void;
  onAnimationComplete: (id: string, timeSeconds: number) => void;
  onCloneStatus: (
    ids: readonly string[],
    status: "pending" | "ready" | "failed",
  ) => void;
  children?: React.ReactNode;
}

export type StudioBg3dRigBakeReader = () => StudioBg3dRigPoseBakeSnapshot | null;

function studioBg3dMatricesDiffer(
  left: THREE.Matrix4 | null,
  right: THREE.Matrix4,
  epsilon = 1e-10,
): boolean {
  if (!left) return true;
  return left.elements.some((value, index) =>
    Math.abs(value - (right.elements[index] ?? Number.NaN)) > epsilon
  );
}

export function BgCustomModelMesh({ instance, cachedRoot, animations, selected, capturing, targetFps, lodBias, onSelect, onSurfacePick, onSurfacePreview, onPaintPointer, registerRef, registerAnimationTime, registerRigBake, onAnimationComplete, onCloneStatus, children }: BgCustomModelMeshProps) {
  // Geometry/textures stay cache-owned, while each render instance owns cloned materials so its
  // adjustments cannot leak into sibling placements or the verified source cache.
  const [editableClone, setEditableClone] = useState<StudioBg3dEditableThreeClone | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const lastConstraintWorldMatrixRef = useRef<THREE.Matrix4 | null>(null);
  useLayoutEffect(() => {
    if (groupRef.current) synchronizeStudioBg3dRootMatrix(groupRef.current, selected);
  }, [instance.position, instance.rotation, instance.scale, selected]);
  const localBoundsRef = useRef(new THREE.Sphere(new THREE.Vector3(), 1));
  const worldBoundsRef = useRef(new THREE.Sphere(new THREE.Vector3(), 1));
  const projectionMatrixRef = useRef(new THREE.Matrix4());
  const frustumRef = useRef(new THREE.Frustum());
  const cameraSpaceCenterRef = useRef(new THREE.Vector3());
  const previousProjectedLodReasonRef = useRef<"near" | "far" | "very-far" | null>(null);
  const animationRunRef = useRef<{
    readonly mixer: THREE.AnimationMixer;
    readonly action: THREE.AnimationAction;
    readonly playback: StudioBg3dAnimationPlayback;
    readonly durationSeconds: number;
    sampledTimeSeconds: number;
    completed: boolean;
    startElapsedSeconds: number | null;
    lastSampleElapsedSeconds: number;
  } | null>(null);
  const poseRef = useRef(instance.pose);
  poseRef.current = instance.pose;
  const morphRef = useRef(instance.morph);
  morphRef.current = instance.morph;
  const animationRef = useRef(instance.animation);
  animationRef.current = instance.animation;
  const constraintsRef = useRef(instance.constraints);
  constraintsRef.current = instance.constraints;
  const onCloneStatusRef = useRef(onCloneStatus);
  useEffect(() => {
    onCloneStatusRef.current = onCloneStatus;
  });
  useEffect(() => {
    let active = true;
    setEditableClone(null);
    onCloneStatusRef.current([instance.id], "pending");
    if (!cachedRoot) {
      return () => {
        active = false;
      };
    }
    void createStudioBg3dEditableThreeClone(cachedRoot)
      .then((next) => {
        if (!active) {
          next.dispose();
          return;
        }
        setEditableClone(next);
      })
      .catch(() => {
        if (!active) return;
        onCloneStatusRef.current([instance.id], "failed");
      });
    return () => {
      active = false;
      onCloneStatusRef.current([instance.id], "pending");
    };
  }, [cachedRoot, instance.id]);

  useEffect(() => () => editableClone?.dispose(), [editableClone]);
  useEffect(() => {
    lastConstraintWorldMatrixRef.current = null;
    previousProjectedLodReasonRef.current = null;
  }, [editableClone]);
  useEffect(() => {
    editableClone?.applyMaterialOverride(instance.materialOverride);
  }, [editableClone, instance.materialOverride]);
  // 표면 직접 그리기 2단계: 문서의 GLB 텍스처 페인트(획 벡터)를 편집 클론 재질에 합성 텍스처로
  // 올린다. 재질 오버라이드 effect가 원본 재질을 다시 복사하면 map이 원본으로 돌아가므로,
  // 선언 순서상 그 뒤에 두고 오버라이드 변경에도 다시 적용한다. 정리 시 원본 map으로 복원된다.
  useEffect(() => {
    if (!editableClone || !instance.modelTexturePaint) return;
    const collection = collectStudioBg3dGlbTexturePaintTargets(editableClone.root);
    if (collection.targets.length === 0) return;
    const application = applyStudioBg3dGlbTexturePaint(
      collection.targets,
      instance.modelTexturePaint,
    );
    if (application.appliedTargetKeys.length === 0) {
      application.dispose();
      return;
    }
    return () => application.dispose();
  }, [editableClone, instance.materialOverride, instance.modelTexturePaint]);
  useEffect(() => {
    animationRunRef.current?.mixer.stopAllAction();
    animationRunRef.current = null;
    const playback = instance.animation;
    const clip = playback ? (animations[playback.clipIndex] ?? animations[0]) : undefined;
    if (!editableClone || !playback || !clip) return;
    const mixer = new THREE.AnimationMixer(editableClone.root);
    const action = mixer.clipAction(clip);
    action.enabled = true;
    // The Studio clock resolves repeat/ping-pong into an absolute clip-local time. Keeping the
    // Three action paused in LoopOnce prevents Three from applying a second loop transform.
    action.clampWhenFinished = true;
    action.setLoop(THREE.LoopOnce, 1);
    action.setEffectiveWeight(playback.weight);
    action.play();
    action.paused = true;
    const durationSeconds = Math.max(0, Number.isFinite(clip.duration) ? clip.duration : 0);
    editableClone.poseController.restoreRestPose();
    editableClone.morphController.restoreRestWeights();
    const sampledTimeSeconds = sampleStudioBg3dAnimationActionAtTime(mixer, action, resolveStudioBg3dAnimationTime({
      baseTimeSeconds: playback.timeSeconds,
      elapsedSeconds: 0,
      timeScale: playback.timeScale,
      durationSeconds,
      loop: playback.loop,
    }));
    editableClone.poseController.applyToCurrentPose(poseRef.current);
    editableClone.poseController.applyConstraints(constraintsRef.current);
    editableClone.morphController.applyToCurrentWeights(morphRef.current);
    const run = {
      mixer,
      action,
      playback,
      durationSeconds,
      sampledTimeSeconds,
      completed: false,
      startElapsedSeconds: null,
      lastSampleElapsedSeconds: Number.NEGATIVE_INFINITY,
    };
    animationRunRef.current = run;
    registerAnimationTime(instance.id, () => run.sampledTimeSeconds);
    return () => {
      registerAnimationTime(instance.id, null);
      mixer.stopAllAction();
      mixer.uncacheRoot(editableClone.root);
      if (animationRunRef.current?.mixer === mixer) animationRunRef.current = null;
    };
  }, [animations, editableClone, instance.animation, instance.id, registerAnimationTime]);
  useEffect(() => {
    if (!editableClone) {
      registerRigBake(instance.id, null);
      return;
    }
    const reader: StudioBg3dRigBakeReader = () => {
      const pose = editableClone.poseController.captureConstraintBakePose();
      if (!pose) return null;
      const sampledTimeSeconds = animationRunRef.current?.sampledTimeSeconds ??
        animationRef.current?.timeSeconds ?? 0;
      if (!Number.isFinite(sampledTimeSeconds) || sampledTimeSeconds < 0) return null;
      return { pose, sampledTimeSeconds };
    };
    registerRigBake(instance.id, reader);
    // Clone readiness means every command exposed by the inspector, including rig bake, already
    // has its live reader registered. This avoids an enabled-button/passive-effect race.
    onCloneStatusRef.current([instance.id], "ready");
    return () => registerRigBake(instance.id, null);
  }, [editableClone, instance.id, registerRigBake]);
  useEffect(() => {
    const group = groupRef.current;
    if (!editableClone || !group) return;
    group.updateWorldMatrix(true, true);
    const worldBounds = new THREE.Box3().setFromObject(editableClone.root)
      .getBoundingSphere(new THREE.Sphere());
    if (!Number.isFinite(worldBounds.radius) || worldBounds.radius <= 0) {
      localBoundsRef.current.set(new THREE.Vector3(), 1);
      return;
    }
    const inverseGroup = group.matrixWorld.clone().invert();
    worldBounds.applyMatrix4(inverseGroup);
    // Skinning can move vertices outside the rest-pose geometry bounds; a conservative margin keeps
    // near-edge characters updating instead of visibly popping when they re-enter the frustum.
    worldBounds.radius *= 1.5;
    localBoundsRef.current.copy(worldBounds);
  }, [editableClone]);
  useEffect(() => {
    if (!editableClone) return;
    const run = animationRunRef.current;
    if (run) {
      editableClone.poseController.removeAppliedPoseOffsets();
      editableClone.morphController.removeAppliedWeightOffsets();
      run.sampledTimeSeconds = sampleStudioBg3dAnimationActionAtTime(
        run.mixer,
        run.action,
        run.sampledTimeSeconds,
      );
      editableClone.poseController.applyToCurrentPose(instance.pose);
      editableClone.poseController.applyConstraints(instance.constraints);
      editableClone.morphController.applyToCurrentWeights(instance.morph);
    } else {
      editableClone.poseController.applyFromRestPose(instance.pose);
      editableClone.poseController.applyConstraints(instance.constraints);
      editableClone.morphController.applyFromRestWeights(instance.morph);
    }
    const group = groupRef.current;
    if (group) {
      group.updateWorldMatrix(true, false);
      lastConstraintWorldMatrixRef.current = group.matrixWorld.clone();
    }
  }, [editableClone, instance.animation, instance.constraints, instance.morph, instance.pose]);
  useFrame(({ clock, camera, size }) => {
    const run = animationRunRef.current;
    if (!editableClone) return;
    const group = groupRef.current;
    if (!group) return;
    group.updateWorldMatrix(true, false);
    const rootTransformChanged = studioBg3dMatricesDiffer(
      lastConstraintWorldMatrixRef.current,
      group.matrixWorld,
    );
    if (!run?.playback.playing) {
      if (rootTransformChanged && constraintsRef.current?.enabled) {
        if (run) {
          editableClone.poseController.removeAppliedPoseOffsets();
          editableClone.morphController.removeAppliedWeightOffsets();
          run.sampledTimeSeconds = sampleStudioBg3dAnimationActionAtTime(
            run.mixer,
            run.action,
            run.sampledTimeSeconds,
          );
          editableClone.poseController.applyToCurrentPose(poseRef.current);
          editableClone.poseController.applyConstraints(constraintsRef.current);
          editableClone.morphController.applyToCurrentWeights(morphRef.current);
        } else {
          editableClone.poseController.applyFromRestPose(poseRef.current);
          editableClone.poseController.applyConstraints(constraintsRef.current);
          editableClone.morphController.applyFromRestWeights(morphRef.current);
        }
      }
      lastConstraintWorldMatrixRef.current = group.matrixWorld.clone();
      return;
    }
    lastConstraintWorldMatrixRef.current = group.matrixWorld.clone();
    run.startElapsedSeconds ??= clock.elapsedTime;
    const elapsed = clock.elapsedTime - run.startElapsedSeconds;
    const timing = {
      baseTimeSeconds: run.playback.timeSeconds,
      elapsedSeconds: elapsed,
      timeScale: run.playback.timeScale,
      durationSeconds: run.durationSeconds,
      loop: run.playback.loop,
    } as const;
    const timeSeconds = resolveStudioBg3dAnimationTime(timing);
    let visibleInHierarchy = true;
    for (let object: THREE.Object3D | null = group; object; object = object.parent) {
      if (!object.visible) {
        visibleInHierarchy = false;
        break;
      }
    }
    worldBoundsRef.current.copy(localBoundsRef.current).applyMatrix4(group.matrixWorld);
    camera.updateWorldMatrix(true, false);
    projectionMatrixRef.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustumRef.current.setFromProjectionMatrix(projectionMatrixRef.current);
    cameraSpaceCenterRef.current.copy(worldBoundsRef.current.center)
      .applyMatrix4(camera.matrixWorldInverse);
    const projectedLod = projectStudioBg3dLodDiameterCssPx({
      worldRadius: worldBoundsRef.current.radius,
      viewDepth: -cameraSpaceCenterRef.current.z,
      verticalProjectionScale: camera.projectionMatrix.elements[5] ?? Number.NaN,
      viewportCssHeight: size.height,
      perspective: camera instanceof THREE.PerspectiveCamera,
      nearPlane: camera.near,
    });
    const schedule = resolveStudioBg3dAnimationSchedule({
      visibleInHierarchy,
      inCameraFrustum: frustumRef.current.intersectsSphere(worldBoundsRef.current),
      capturing,
      selected,
      targetFps,
      lodBias,
      projectedDiameterCssPx: projectedLod?.projectedDiameterCssPx,
      projectedForceHighestDetail: projectedLod?.forceHighestDetail,
      previousProjectedLodReason: previousProjectedLodReasonRef.current,
      distanceToCamera: camera.position.distanceTo(worldBoundsRef.current.center),
      boundingRadius: worldBoundsRef.current.radius,
    });
    if (
      schedule.reason === "near" || schedule.reason === "far" ||
      schedule.reason === "very-far"
    ) previousProjectedLodReasonRef.current = schedule.reason;
    if (
      schedule.suspended ||
      clock.elapsedTime - run.lastSampleElapsedSeconds < schedule.minimumIntervalSeconds
    ) {
      return;
    }
    run.lastSampleElapsedSeconds = clock.elapsedTime;
    editableClone.poseController.removeAppliedPoseOffsets();
    editableClone.morphController.removeAppliedWeightOffsets();
    run.sampledTimeSeconds = sampleStudioBg3dAnimationActionAtTime(
      run.mixer,
      run.action,
      timeSeconds,
    );
    editableClone.poseController.applyToCurrentPose(poseRef.current);
    editableClone.poseController.applyConstraints(constraintsRef.current);
    editableClone.morphController.applyToCurrentWeights(morphRef.current);
    if (!run.completed && isStudioBg3dAnimationOnceComplete(timing)) {
      run.completed = true;
      onAnimationComplete(instance.id, timeSeconds);
    }
  });

  useEffect(() => {
    registerRef(instance.id, groupRef.current);
    return () => registerRef(instance.id, null);
  }, [instance.id, registerRef]);

  const visible = isBgObjectVisible(instance);
  const handlePaintPointer = onPaintPointer
    ? (phase: StudioBg3dPaintPointerPhase) => (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        onPaintPointer(instance.id, event, phase);
      }
    : null;

  return (
    <group
      ref={groupRef}
      position={instance.position}
      rotation={instance.rotation}
      scale={instance.scale}
      userData={{ studioBg3dEntityId: instance.id, studioBg3dEntityKind: "model" }}
      visible={visible}
      {...(visible ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (onSurfacePick(instance.id, e)) return;
          onSelect(instance.id, e.shiftKey || e.metaKey || e.ctrlKey);
        },
        onPointerMove: (event: ThreeEvent<PointerEvent>) => {
          onSurfacePreview?.(event);
          if (event.buttons > 0) handlePaintPointer?.("move")(event);
        },
        ...(handlePaintPointer ? { onPointerDown: handlePaintPointer("down"), onPointerUp: handlePaintPointer("up") } : {}),
      } : {})}
    >
      {editableClone ? <primitive object={editableClone.root} /> : null}
      {children}
    </group>
  );
}

