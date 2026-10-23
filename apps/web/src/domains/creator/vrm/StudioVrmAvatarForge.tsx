import { createPortal } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { createStudioVrmAuthoredHairGeometry } from "./studio-vrm-authored-hair-geometry";
import {
  sanitizeAvatarForgeState,
  type AvatarForgeFaceAccent,
  type AvatarForgeHairPart,
  type AvatarForgeHairParams,
  type AvatarForgeState,
} from "./studio-vrm-avatar-forge";
import { addAvatarForgeHairParts, disposeAvatarForgeObject } from "./studio-vrm-avatar-forge-hair-object";
import { classifyMeshName } from "./studio-vrm-costume";
import { planStudioVrmHairTransition } from "./studio-vrm-hair-transition";
import { measureStudioVrmHeadFit } from "./studio-vrm-head-measure";
import { publishStudioVrmHairPreviewHair, publishStudioVrmHairPreviewHead } from "./studio-vrm-hair-preview-source";
import { applyStudioVrmSemanticFaceMorphs } from "./studio-vrm-semantic-face-morph";

import type { StudioVrmAvatarForgeFaceController } from "./studio-vrm-avatar-forge-face-controller";
import type { StudioVrmHeadFit } from "./studio-vrm-head-fit";
import type { VRM } from "@pixiv/three-vrm";

const AVATAR_FORGE_MARKER = "toonSpectrumAvatarForge";
const AVATAR_FORGE_HAIR_IDENTITY = "toonSpectrumAvatarForgeHairIdentity";
/** 마지막 두상 맞춤(진단·브라우저 게이트용). 포지 그룹 userData 에 둔다. */
const AVATAR_FORGE_HEAD_FIT = "toonSpectrumAvatarForgeHeadFit";
const HAIR_VISIBILITY_LEASES = new WeakMap<THREE.Object3D, { count: number; visible: boolean }>();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function materialNames(mesh: THREE.Mesh): string[] {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.map((material) => material?.name?.trim()).filter((name): name is string => Boolean(name));
}

function isGeneratedForgeObject(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData[AVATAR_FORGE_MARKER] === true) return true;
    current = current.parent;
  }
  return false;
}

/**
 * 보수적으로 "독립 교체 가능한" 헤어 메시만 찾는다.
 * Body/Face 하나에 skin+hair material이 함께 구워진 VRoid 메시 등은 절대 숨기지 않는다.
 */
function detectReplaceableHairMeshes(vrm: VRM | null): THREE.Mesh[] {
  if (!vrm) return [];
  const detected: THREE.Mesh[] = [];

  vrm.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || isGeneratedForgeObject(mesh)) return;

    const names = materialNames(mesh);
    const meshClass = classifyMeshName(mesh.name);
    const materialClasses = names.map((name) => classifyMeshName(name));
    const hasContraryMaterial = materialClasses.some(
      (classification) =>
        (classification.protected !== null && classification.protected !== "hair") || classification.slot !== null
    );

    // 이름 자체가 얼굴/피부/눈/몸통이면 결합 메시로 간주한다. Hair 재질이 섞여 있어도 안전 우선.
    if (meshClass.protected !== null && meshClass.protected !== "hair") return;
    if (meshClass.slot !== null || hasContraryMaterial) return;

    if (meshClass.protected === "hair") {
      detected.push(mesh);
      return;
    }

    // 일반 노드명(Node_001 등)은 모든 명시적 재질이 헤어일 때만 허용한다.
    if (names.length > 0 && materialClasses.every((classification) => classification.protected === "hair")) {
      detected.push(mesh);
    }
  });

  return detected;
}

/** UI에서 "교체 가능한 원본 헤어 N개"를 안내할 때 쓰는 비파괴 탐지 헬퍼. */
// 이 파일에서 component와 함께 export해 인티그레이션 측의 추가 순회 import를 피한다.
// eslint-disable-next-line react-refresh/only-export-components
export function countDetectedVrmHairMeshes(vrm: VRM | null): number {
  return detectReplaceableHairMeshes(vrm).length;
}

/**
 * `replaceOriginal` 은 "모델이 가진 헤어를 감춘다"는 작가의 명시적 의사다. 스타일과 무관하게
 * 그대로 지킨다 — `style: "none"` 과의 조합이 바로 민머리를 만드는 방법이고(모자 착용, 표면에
 * 직접 그릴 헤어), 원본을 되돌리는 조작은 스타일 선택이 아니라 이 토글을 끄는 것이다. 예전에는
 * "none" 을 예외로 두어 헤어를 감추지 않았는데, 그러면 "원본 헤어를 숨깁니다" 라고 적힌 카드가
 * 적용된 것처럼 보이면서 화면은 그대로인 상태가 된다.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function shouldHideAuthoredVrmHair(hair: Pick<AvatarForgeHairParams, "replaceOriginal">): boolean {
  return hair.replaceOriginal === true;
}

/**
 * 헤어 메시 가시성 "리스"를 획득한다(참조 카운팅 + 원복).
 *
 * 계약:
 *  1) 첫 획득 시에만 원래 visible 값을 기억한다.
 *  2) 중첩 획득은 카운트만 올린다(같은 메시를 여러 이펙트가 숨겨도 안전).
 *  3) 마지막 반납에서만 원래 값으로 되돌린다 → 다른 시스템이 `mesh.visible = true`로
 *     덮어쓰는 사고를 막는다.
 *
 * 워드로브(studio-vrm-wardrobe-catalogue.ts)도 같은 규약을 쓰되 **대상 집합이 서로소**다.
 * 여기서는 `classifyMeshName().protected === "hair"`인 메시만, 워드로브는 `slot !== null`인
 * 메시만 잡는다. 그래서 두 시스템이 같은 메시의 visible을 두고 다투는 상황 자체가 없다.
 */
function acquireHiddenHair(meshes: readonly THREE.Mesh[]) {
  for (const mesh of meshes) {
    const lease = HAIR_VISIBILITY_LEASES.get(mesh);
    if (lease) {
      lease.count += 1;
    } else {
      HAIR_VISIBILITY_LEASES.set(mesh, { count: 1, visible: mesh.visible });
    }
    mesh.visible = false;
  }

  return () => {
    for (const mesh of meshes) {
      const lease = HAIR_VISIBILITY_LEASES.get(mesh);
      if (!lease) continue;
      lease.count -= 1;
      if (lease.count > 0) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = lease.visible;
      HAIR_VISIBILITY_LEASES.delete(mesh);
    }
  };
}

/** The shipped runtime and tests share the same authored clump generator. */
// eslint-disable-next-line react-refresh/only-export-components
export function createAvatarForgeHairGeometry(part: AvatarForgeHairPart) {
  return createStudioVrmAuthoredHairGeometry(part);
}

/**
 * 볼 터치·주근깨는 실측 두개골 타원체 표면에 얹는다. 예전에는 눈 간격으로 추정한 작은 타원체
 * 위라 얼굴 안쪽에 묻혀 보이지 않았다.
 */
function faceSurfaceZ(fit: StudioVrmHeadFit, x: number, y: number, outset: number) {
  const normalizedX = (x - fit.center[0]) / Math.max(1e-5, fit.radiusX);
  const normalizedY = (y - fit.center[1]) / Math.max(1e-5, fit.radiusY);
  const surface = Math.sqrt(Math.max(0.06, 1 - normalizedX * normalizedX - normalizedY * normalizedY));
  return fit.center[2] + fit.frontSign * (fit.radiusZ * surface + outset);
}

function createAccentMaterial(accent: AvatarForgeFaceAccent, opacityMultiplier = 1) {
  return new THREE.MeshBasicMaterial({
    color: accent.color,
    transparent: true,
    opacity: clamp(accent.intensity * opacityMultiplier, 0.04, 0.82),
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function addFaceDisc(
  group: THREE.Group,
  fit: StudioVrmHeadFit,
  accent: AvatarForgeFaceAccent,
  id: string,
  x: number,
  y: number,
  radius: number,
  scaleX = 1,
  opacityMultiplier = 1
) {
  const geometry = new THREE.CircleGeometry(radius, 18);
  const material = createAccentMaterial(accent, opacityMultiplier);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `ToonStudioAvatarForgeFaceAccent_${id}`;
  mesh.position.set(x, y, faceSurfaceZ(fit, x, y, radius * 0.06));
  mesh.scale.x = scaleX;
  if (fit.frontSign < 0) mesh.rotation.y = Math.PI;
  mesh.renderOrder = 12;
  group.add(mesh);
}

function addFaceAccents(group: THREE.Group, state: AvatarForgeState, fit: StudioVrmHeadFit) {
  // 얼굴이 −z 인 VRM0 은 캐릭터 기준 좌우가 x 부호와 반대다. 비대칭 장식(매력점)의 위치를 맞춘다.
  const side = fit.frontSign;
  for (const accent of state.faceAccents ?? []) {
    if (!accent.enabled || accent.intensity <= 0) continue;

    if (accent.id === "blush") {
      const cheekY = fit.eyeCenter[1] - fit.radiusY * (0.22 + state.face.chinLength * 0.03);
      const cheekX = fit.radiusX * (0.52 + state.face.cheekVolume * 0.07);
      const radius = fit.radiusY * (0.105 + state.face.cheekVolume * 0.035);
      addFaceDisc(group, fit, accent, "blush-left", fit.center[0] - cheekX, cheekY, radius, 1.75, 0.52);
      addFaceDisc(group, fit, accent, "blush-right", fit.center[0] + cheekX, cheekY, radius, 1.75, 0.52);
      continue;
    }

    if (accent.id === "freckles") {
      const points = [
        [-0.38, -0.11], [-0.25, -0.16], [-0.11, -0.13],
        [0.12, -0.12], [0.26, -0.17], [0.39, -0.1],
      ] as const;
      points.forEach(([x, y], index) => {
        addFaceDisc(
          group,
          fit,
          accent,
          `freckle-${index}`,
          fit.center[0] + side * fit.radiusX * x,
          fit.eyeCenter[1] + fit.radiusY * y,
          fit.radiusX * (index % 2 === 0 ? 0.018 : 0.014),
          1,
          0.8
        );
      });
      continue;
    }

    if (accent.id === "beauty-mark") {
      addFaceDisc(
        group,
        fit,
        accent,
        "beauty-mark",
        fit.center[0] + side * fit.radiusX * 0.34,
        fit.eyeCenter[1] - fit.radiusY * 0.28,
        fit.radiusX * 0.026,
        1,
        0.9
      );
    }
  }
}

function buildAvatarForgeObject(state: AvatarForgeState, fit: StudioVrmHeadFit) {
  const group = new THREE.Group();
  group.name = "ToonStudioAvatarForge";
  group.userData[AVATAR_FORGE_MARKER] = true;
  group.userData[AVATAR_FORGE_HEAD_FIT] = fit;
  addAvatarForgeHairParts(group, state, fit);
  addFaceAccents(group, state, fit);
  return group;
}

function useStudioVrmStableSnapshot<T>(value: T, identity: string): T {
  const snapshotRef = useRef({ identity, value });
  if (snapshotRef.current.identity !== identity) {
    snapshotRef.current = { identity, value };
  }
  return snapshotRef.current.value;
}

export type StudioVrmAvatarForgeProps = {
  vrm: VRM;
  state: AvatarForgeState;
  rigRevision: number;
  faceController: StudioVrmAvatarForgeFaceController;
};

/**
 * rigged VRM을 유지한 채 normalized head에 절차형 헤어/페이스 디테일을 포털 부착한다.
 * 기본 얼굴형은 raw+normalized head scale로, 모델이 명시적으로 제공한 상세 shape key는
 * exact semantic binding으로 적용한다. 원본 geometry와 표정 expression 채널은 변경하지 않는다.
 */
export function StudioVrmAvatarForge({
  vrm,
  state,
  rigRevision,
  faceController,
}: StudioVrmAvatarForgeProps) {
  const safeState = useMemo(() => sanitizeAvatarForgeState(state), [state]);
  const normalizedHead = vrm.humanoid?.getNormalizedBoneNode("head") ?? null;
  const rawHead = vrm.humanoid?.getRawBoneNode("head") ?? null;
  // 두상은 머리 본이 지배하는 스킨 정점으로 잰다(A-01). 리그가 바뀔 때만 다시 잰다 — 얼굴형 배율은
  // 머리 본 스케일로 들어가 헤어가 자식으로 함께 따라간다.
  const fit = useMemo(
    () => {
      void rigRevision;
      return normalizedHead
        ? measureStudioVrmHeadFit(vrm, normalizedHead, { skip: isGeneratedForgeObject }).fit
        : null;
    },
    [normalizedHead, rigRevision, vrm]
  );
  useLayoutEffect(() => {
    if (!fit) return;
    return publishStudioVrmHairPreviewHead(fit);
  }, [fit]);

  // Generated surface ownership is independent from the original-hair visibility lease. A pure
  // visibility toggle keeps the current buffers, while any style/shape/material change gets a fresh
  // object so stale clumps, textures and future dynamic state cannot survive the transition.
  const committedHairRef = useRef<AvatarForgeHairParams | null>(null);
  const hairTransition = planStudioVrmHairTransition(
    committedHairRef.current,
    safeState.hair,
  );
  const hairGeometryIdentity = hairTransition.identity;
  useLayoutEffect(() => {
    committedHairRef.current = { ...safeState.hair };
  }, [safeState.hair]);
  const faceDecorationIdentity = JSON.stringify({
    face: safeState.face,
    faceAccents: safeState.faceAccents ?? [],
  });
  const objectIdentity = `${hairGeometryIdentity}:${faceDecorationIdentity}`;
  const stableObjectState = useStudioVrmStableSnapshot(safeState, objectIdentity);
  const stableFace = useStudioVrmStableSnapshot(
    safeState.face,
    JSON.stringify(safeState.face),
  );
  const stableSemanticFaceMorphs = useStudioVrmStableSnapshot(
    safeState.semanticFaceMorphs,
    JSON.stringify(safeState.semanticFaceMorphs ?? {}),
  );
  const object = useMemo(() => {
    if (!fit) return null;
    const next = buildAvatarForgeObject(stableObjectState, fit);
    next.userData[AVATAR_FORGE_HAIR_IDENTITY] = hairGeometryIdentity;
    return next;
  }, [fit, hairGeometryIdentity, stableObjectState]);
  // 헤어 카드 썸네일이 선택된 카드를 지금 헤어 그대로 그리도록 알린다.
  useLayoutEffect(() => {
    publishStudioVrmHairPreviewHair(stableObjectState.hair);
  }, [hairGeometryIdentity, stableObjectState.hair]);

  // Dispose in the same layout phase that swaps the primitive. The old and new hairstyles are never
  // painted together, and every geometry/material/owned texture is released exactly once.
  useLayoutEffect(() => {
    if (!object) return;
    return () => disposeAvatarForgeObject(object);
  }, [object]);

  useLayoutEffect(() => {
    faceController.replace({
      normalizedHead,
      rawHead,
      rigRevision,
      face: stableFace,
    });
    return () => {
      faceController.release();
    };
  }, [faceController, normalizedHead, rawHead, rigRevision, stableFace]);

  useLayoutEffect(
    () => applyStudioVrmSemanticFaceMorphs(vrm, stableSemanticFaceMorphs),
    [stableSemanticFaceMorphs, vrm],
  );

  const hideAuthoredHair = shouldHideAuthoredVrmHair(safeState.hair);
  useLayoutEffect(() => {
    if (!hideAuthoredHair) return;
    return acquireHiddenHair(detectReplaceableHairMeshes(vrm));
  }, [hideAuthoredHair, rigRevision, vrm]);

  if (!normalizedHead || !object) return null;
  return createPortal(
    <primitive key={objectIdentity} object={object} />,
    normalizedHead,
  );
}
