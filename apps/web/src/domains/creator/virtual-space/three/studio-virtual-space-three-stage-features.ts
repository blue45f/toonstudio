import * as THREE from "three";

import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { STUDIO_POSE_SEAT_ANCHOR_RADIUS, studioPoseSeatAnchors, type StudioSeatAnchor } from "../studio-virtual-space-pose-controller";
import type { StudioWorldInteractionSlotDefinition } from "../studio-virtual-space-world-manifest";
import { STUDIO_THREE_SCALE, threeToWorld } from "./studio-virtual-space-three-coords";
import type { StudioThreeActorNode } from "./studio-virtual-space-three-scene";
import type { StudioThreeSeatedActor } from "./studio-virtual-space-three-stage-props";
import type { StudioThreeWorldArchitecture } from "./studio-virtual-space-three-world-layout";

/**
 * 3D 리뷰 시어터 월 스크린(`THREE.VideoTexture`) 제어기.
 * Hero 씬의 `reviewScreenMesh`가 있으면 우선 투사하고, 없으면 기본 캠퍼스/스튜디오용 보조 월 스크린을 배치한다.
 */
export interface StudioThreeLiveScreenController {
  readonly sync: (stream: MediaStream | null | undefined, architecture: StudioThreeWorldArchitecture | null) => void;
  readonly dispose: () => void;
}

export function createStudioThreeLiveScreenController(
  scene: THREE.Scene,
  fallbackAnchor: THREE.Vector3,
): StudioThreeLiveScreenController {
  const fallbackGroup = new THREE.Group();
  fallbackGroup.name = "studio-three-review-theater-screen";
  fallbackGroup.position.set(fallbackAnchor.x, 2.05, fallbackAnchor.z - 4.2);
  fallbackGroup.visible = false;

  const bezelGeo = new THREE.BoxGeometry(3.34, 1.94, 0.08);
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x1e2436, roughness: 0.45, metalness: 0.35 });
  const bezel = new THREE.Mesh(bezelGeo, bezelMat);
  bezel.castShadow = true;
  bezel.receiveShadow = true;
  fallbackGroup.add(bezel);

  const panelGeo = new THREE.PlaneGeometry(3.2, 1.8);
  const idleMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.32, metalness: 0.08 });
  const fallbackMesh = new THREE.Mesh(panelGeo, idleMat);
  fallbackMesh.name = "studio-three-review-theater-panel";
  fallbackMesh.position.z = 0.045;
  fallbackGroup.add(fallbackMesh);
  scene.add(fallbackGroup);

  let currentStream: MediaStream | null = null;
  let currentMesh: THREE.Mesh | null = null;
  let savedMaterial: THREE.Material | THREE.Material[] | null = null;
  let videoEl: HTMLVideoElement | null = null;
  let videoTexture: THREE.VideoTexture | null = null;
  let videoMaterial: THREE.MeshBasicMaterial | null = null;
  let disposed = false;

  const detachMesh = () => {
    if (currentMesh && savedMaterial) {
      currentMesh.material = savedMaterial;
    }
    if (currentMesh && currentMesh !== fallbackMesh && currentMesh.parent) {
      currentMesh.parent.visible = false;
    }
    currentMesh = null;
    savedMaterial = null;
    fallbackGroup.visible = false;
  };

  const releaseVideo = () => {
    detachMesh();
    if (videoMaterial) {
      videoMaterial.dispose();
      videoMaterial = null;
    }
    if (videoTexture) {
      videoTexture.dispose();
      videoTexture = null;
    }
    if (videoEl) {
      try { videoEl.pause(); } catch { /* 이미 중지된 미디어 */ }
      videoEl.srcObject = null;
      videoEl = null;
    }
    currentStream = null;
  };

  return {
    sync(stream, architecture) {
      if (disposed) return;
      const nextStream = stream ?? null;
      const targetMesh = architecture?.reviewScreenMesh ?? fallbackMesh;
      if (nextStream === currentStream && currentMesh === targetMesh) return;

      if (!nextStream) {
        releaseVideo();
        return;
      }

      if (nextStream !== currentStream) {
        releaseVideo();
        currentStream = nextStream;
        if (typeof document !== "undefined") {
          const video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.autoplay = true;
          video.srcObject = nextStream;
          void video.play?.().catch(() => undefined);
          videoEl = video;
          const tex = new THREE.VideoTexture(video);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          videoTexture = tex;
          videoMaterial = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
        }
      } else if (currentMesh !== targetMesh) {
        detachMesh();
      }

      if (videoMaterial) {
        savedMaterial = targetMesh.material;
        targetMesh.material = videoMaterial;
        currentMesh = targetMesh;
        fallbackGroup.visible = targetMesh === fallbackMesh;
        if (targetMesh !== fallbackMesh && targetMesh.parent) {
          targetMesh.parent.visible = true;
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseVideo();
      fallbackGroup.removeFromParent();
      bezelGeo.dispose();
      bezelMat.dispose();
      panelGeo.dispose();
      idleMat.dispose();
    },
  };
}

/** 근접 음성·상호작용 반경(`proximityRadiusPx`)을 로컬 아바타 발밑 링으로 시각화한다. */
export interface StudioThreeProximityRing {
  readonly mesh: THREE.Mesh;
  readonly update: (radiusPx: number | undefined) => void;
  readonly dispose: () => void;
}

export function createStudioThreeProximityRing(parent: THREE.Object3D): StudioThreeProximityRing {
  const geometry = new THREE.RingGeometry(0.95, 1.0, 48);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "self-proximity-radius-ring";
  mesh.position.y = 0.042;
  mesh.visible = false;
  parent.add(mesh);

  return {
    mesh,
    update(radiusPx) {
      if (typeof radiusPx !== "number" || !Number.isFinite(radiusPx) || radiusPx <= 0) {
        mesh.visible = false;
        return;
      }
      const radiusMeters = Math.max(0.5, radiusPx * STUDIO_THREE_SCALE);
      mesh.scale.setScalar(radiusMeters);
      mesh.visible = true;
    },
    dispose() {
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}

/** 고스트 모드 활성화 시 아바타 재질을 반투명 처리하고 해제 시 원본 불투명도를 복원한다. */
export function applyStudioThreeActorGhostVisual(node: StudioThreeActorNode, enabled: boolean): void {
  node.rigGroup.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of materials) {
      if (!mat) continue;
      if (enabled) {
        if (mat.userData.preGhostOpacity === undefined) {
          mat.userData.preGhostOpacity = mat.opacity;
          mat.userData.preGhostTransparent = mat.transparent;
        }
        mat.transparent = true;
        mat.opacity = 0.42;
        mat.needsUpdate = true;
      } else if (mat.userData.preGhostOpacity !== undefined) {
        mat.opacity = Number(mat.userData.preGhostOpacity);
        mat.transparent = Boolean(mat.userData.preGhostTransparent);
        delete mat.userData.preGhostOpacity;
        delete mat.userData.preGhostTransparent;
        mat.needsUpdate = true;
      }
    }
  });
}

/** Raycaster로 클릭된 동료 아바타(`peer:<sessionId>`)의 sessionId를 추출한다. */
export function findClickedPeerSessionId(
  raycaster: THREE.Raycaster,
  actorNodes: ReadonlyMap<string, StudioThreeActorNode>,
): string | null {
  const peerRoots: THREE.Object3D[] = [];
  for (const [id, node] of actorNodes) {
    if (id.startsWith("peer:") && node.group.visible) {
      peerRoots.push(node.group);
    }
  }
  if (peerRoots.length === 0) return null;
  const hits = raycaster.intersectObjects(peerRoots, true);
  const first = hits[0]?.object;
  if (!first) return null;
  let cursor: THREE.Object3D | null = first;
  while (cursor) {
    if (typeof cursor.userData.peerSessionId === "string" && cursor.userData.peerSessionId) {
      return cursor.userData.peerSessionId;
    }
    if (cursor.name.startsWith("actor-peer:")) {
      return cursor.name.slice("actor-peer:".length);
    }
    cursor = cursor.parent;
  }
  return null;
}

/** 이동 입력을 지속했는데 위치 변화가 없을 때 막힘(`stuck`) 상태를 판별한다. */
export function createStudioThreeStuckDetector(thresholdSeconds = 1.2) {
  let blockedSeconds = 0;
  let lastPoint: StudioVirtualSpacePoint | null = null;
  let stuck = false;

  return {
    sample(input: {
      readonly tryingToMove: boolean;
      readonly point: StudioVirtualSpacePoint;
      readonly dt: number;
      readonly ghostMode: boolean;
    }): { readonly changed: boolean; readonly stuck: boolean } {
      if (!input.tryingToMove || input.ghostMode) {
        blockedSeconds = 0;
        lastPoint = { ...input.point };
        const changed = stuck !== false;
        stuck = false;
        return { changed, stuck };
      }
      if (!lastPoint) {
        lastPoint = { ...input.point };
        return { changed: false, stuck };
      }
      const moved = Math.hypot(input.point.x - lastPoint.x, input.point.y - lastPoint.y);
      if (moved >= 3.5) {
        blockedSeconds = 0;
        lastPoint = { ...input.point };
        const changed = stuck !== false;
        stuck = false;
        return { changed, stuck };
      }
      blockedSeconds += Math.max(0, input.dt);
      const nextStuck = blockedSeconds >= thresholdSeconds;
      const changed = stuck !== nextStuck;
      stuck = nextStuck;
      return { changed, stuck };
    },
    reset(): void {
      blockedSeconds = 0;
      lastPoint = null;
      stuck = false;
    },
  };
}

/** `seatedActors`, `interactionSlots`, Hero 룸 좌석 앵커를 하나의 좌석 앵커 목록으로 병합한다. */
export function mergeStudioThreeSeatAnchors(input: {
  readonly seatedActors?: readonly StudioThreeSeatedActor[];
  readonly interactionSlots?: readonly StudioWorldInteractionSlotDefinition[];
  readonly architecture: StudioThreeWorldArchitecture | null;
}): readonly StudioSeatAnchor[] {
  const base = studioPoseSeatAnchors({
    seatedActors: input.seatedActors ?? [],
    interactionSlots: input.interactionSlots,
  });
  const heroPreset = input.architecture?.heroPreset;
  const origin = input.architecture?.heroRootOrigin;
  if (!heroPreset || !origin) return base;

  const merged: StudioSeatAnchor[] = [...base];
  for (const seat of heroPreset.seatAnchors) {
    const worldPoint = threeToWorld({
      x: origin[0] + seat.positionMeters[0],
      z: origin[2] + seat.positionMeters[2],
    });
    merged.push({
      point: worldPoint,
      facing: seat.facing,
      radius: STUDIO_POSE_SEAT_ANCHOR_RADIUS,
    });
  }
  return Object.freeze(merged);
}

/** 로컬 아바타가 근접 대화 시 자연스럽게 응시할 가장 가까운 동료/NPC 눈높이 좌표를 찾는다. */
export function findNearestLookAtWorldPosition(
  selfNode: StudioThreeActorNode,
  actorNodes: ReadonlyMap<string, StudioThreeActorNode>,
  maxDistanceMeters = 5.5,
): THREE.Vector3 | null {
  let closestPos: THREE.Vector3 | null = null;
  let closestDist = maxDistanceMeters;
  for (const [id, candidate] of actorNodes) {
    if (id === "self" || !candidate.group.visible) continue;
    const dx = candidate.group.position.x - selfNode.group.position.x;
    const dz = candidate.group.position.z - selfNode.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < closestDist && dist > 0.2) {
      closestDist = dist;
      closestPos = new THREE.Vector3(
        candidate.group.position.x,
        candidate.seated ? 1.12 : 1.52,
        candidate.group.position.z,
      );
    }
  }
  return closestPos;
}
