/**
 * 헤어 카드 썸네일 렌더러(A-07) — 실제 헤어 생성기로 머리만 크롭해 그린다.
 *
 * 카드의 선화 도해는 실제 렌더와 어긋났다(도해는 머리가 있는데 3D 는 민머리). 이 렌더러는 셰이퍼
 * 뷰포트와 **같은 함수**(`addAvatarForgeHairParts`)로 헤어 메시를 만들고, 마지막으로 잰 두상
 * (`studio-vrm-hair-preview-source`)에 씌워 머리 부분만 찍는다. 두상은 실측 타원체를 피부색 구로
 * 단순화한다 — 카드가 보여 주는 것은 "이 모델에 이 스타일을 씌우면 생기는 헤어 실루엣·색" 이다.
 *
 * WebGL 컨텍스트는 화면 밖 캔버스 하나를 공유하고, 요청은 한 줄로 세워 차례로 그린다.
 * 같은 요청(헤어 + 두상)은 캐시에서 바로 돌려준다.
 */
import * as THREE from "three";

import {
  AVATAR_FORGE_VERSION,
  sanitizeAvatarForgeState,
  type AvatarForgeHairParams,
  type AvatarForgeState,
} from "../vrm/studio-vrm-avatar-forge";
import { addAvatarForgeHairParts, disposeAvatarForgeObject } from "../vrm/studio-vrm-avatar-forge-hair-object";

import { characterHairThumbnailKey } from "./character-hair-thumbnail-source";

import type { StudioVrmHeadFit } from "../vrm/studio-vrm-head-fit";

export const CHARACTER_HAIR_THUMBNAIL_SIZE = Object.freeze({ width: 192, height: 240 });

/** 모델을 아직 재지 않았을 때의 표준 두상(루미 실측 근사, 얼굴 +z). */
const STANDARD_HEAD: StudioVrmHeadFit = {
  source: "mesh",
  center: [0, 0.086, -0.003],
  eyeCenter: [0, 0.0626, 0.0214],
  radiusX: 0.103,
  radiusY: 0.134,
  radiusZ: 0.119,
  faceFront: 0.104,
  frontSign: 1,
};

const SKIN = "#f1d3c2";
const SHIRT = "#d9d6d0";
const CACHE_LIMIT = 96;

let renderer: THREE.WebGLRenderer | null = null;
let rendererFailed = false;
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Promise<string | null>>();

/** 얼굴이 −z 인 VRM0 두상도 카드에서는 같은 방향(+z)으로 돌려 찍는다. */
function facingFront(head: StudioVrmHeadFit): StudioVrmHeadFit {
  if (head.frontSign > 0) return head;
  return {
    ...head,
    center: [-head.center[0], head.center[1], -head.center[2]],
    eyeCenter: [-head.eyeCenter[0], head.eyeCenter[1], -head.eyeCenter[2]],
    frontSign: 1,
  };
}

function acquireRenderer(): THREE.WebGLRenderer | null {
  if (renderer || rendererFailed) return renderer;
  if (typeof document === "undefined") {
    rendererFailed = true;
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = CHARACTER_HAIR_THUMBNAIL_SIZE.width;
    canvas.height = CHARACTER_HAIR_THUMBNAIL_SIZE.height;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(CHARACTER_HAIR_THUMBNAIL_SIZE.width, CHARACTER_HAIR_THUMBNAIL_SIZE.height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    return renderer;
  } catch (error) {
    // WebGL 이 없는 환경(헤드리스 소프트웨어 미지원 등)에서는 선화 도해를 그대로 쓴다.
    rendererFailed = true;
    console.warn("[character-shaper] 헤어 썸네일 렌더러를 만들 수 없어 도해를 표시합니다.", error);
    return null;
  }
}

function buildScene(state: AvatarForgeState, head: StudioVrmHeadFit) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8178, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-0.6, 1.2, 1.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(0.9, 0.4, -1.2);
  scene.add(rim);

  const owned = new THREE.Group();
  const skin = new THREE.MeshToonMaterial({ color: SKIN });
  // 실측 타원체는 두개골을 감싸는 껍질이라 살짝 줄여 피부로 쓴다. 앞면은 실측 얼굴 앞면을 넘지 않게
  // 맞춘다 — 앞머리는 그 앞면을 따라 굽으므로, 구가 더 앞으로 나오면 앞머리가 구 속에 묻힌다.
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), skin);
  skull.scale.set(
    head.radiusX * 0.97,
    head.radiusY * 0.99,
    Math.min(head.radiusZ * 0.96, Math.max(head.radiusZ * 0.6, head.faceFront - head.center[2])),
  );
  skull.position.set(head.center[0], head.center[1] - head.radiusY * 0.12, head.center[2]);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(head.radiusX * 0.42, head.radiusX * 0.48, head.radiusY * 1.4, 24), skin);
  neck.position.set(head.center[0], head.center[1] - head.radiusY * 1.25, head.center[2] - head.radiusZ * 0.15);
  const shoulders = new THREE.Mesh(
    new THREE.CapsuleGeometry(head.radiusY * 0.55, head.radiusX * 2.6, 8, 24),
    new THREE.MeshToonMaterial({ color: SHIRT }),
  );
  shoulders.rotation.z = Math.PI / 2;
  shoulders.scale.set(1, 1, 0.75);
  shoulders.position.set(head.center[0], head.center[1] - head.radiusY * 2.05, head.center[2] - head.radiusZ * 0.2);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: "#2b2223" });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), eyeMaterial);
    eye.scale.set(head.radiusX * 0.1, head.radiusY * 0.13, head.radiusZ * 0.05);
    eye.position.set(
      head.center[0] + side * head.radiusX * 0.36,
      head.eyeCenter[1],
      head.center[2] + head.radiusZ * 0.9,
    );
    owned.add(eye);
  }
  owned.add(skull, neck, shoulders);
  scene.add(owned);

  const hair = new THREE.Group();
  addAvatarForgeHairParts(hair, state, head);
  scene.add(hair);
  return { scene, owned, hair };
}

function frameCamera(head: StudioVrmHeadFit, hair: THREE.Object3D): THREE.PerspectiveCamera {
  const box = new THREE.Box3().setFromObject(hair);
  const headBox = new THREE.Box3(
    new THREE.Vector3(head.center[0] - head.radiusX, head.center[1] - head.radiusY * 1.6, head.center[2] - head.radiusZ),
    new THREE.Vector3(head.center[0] + head.radiusX, head.center[1] + head.radiusY, head.center[2] + head.radiusZ),
  );
  if (box.isEmpty()) box.copy(headBox);
  else box.union(headBox);
  // 긴 머리는 어깨 아래까지 내려간다. 카드는 머리 슬롯이므로 위에서부터 두상 높이 3배까지만 담는다.
  box.min.y = Math.max(box.min.y, head.center[1] - head.radiusY * 3.2);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const aspect = CHARACTER_HAIR_THUMBNAIL_SIZE.width / CHARACTER_HAIR_THUMBNAIL_SIZE.height;
  const fov = 24;
  const halfHeight = Math.max(size.y / 2, size.x / 2 / aspect) * 1.12;
  const distance = halfHeight / Math.tan(THREE.MathUtils.degToRad(fov / 2)) + size.z / 2;
  const camera = new THREE.PerspectiveCamera(fov, aspect, distance * 0.05, distance * 4);
  const azimuth = THREE.MathUtils.degToRad(24);
  camera.position.set(
    center.x + Math.sin(azimuth) * distance,
    center.y + distance * 0.08,
    center.z + Math.cos(azimuth) * distance,
  );
  camera.lookAt(center);
  return camera;
}

async function encode(canvas: HTMLCanvasElement): Promise<string | null> {
  if (typeof canvas.toBlob === "function" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? URL.createObjectURL(blob) : null;
  }
  return typeof canvas.toDataURL === "function" ? canvas.toDataURL("image/png") : null;
}

function renderNow(hair: AvatarForgeHairParams, headInput: StudioVrmHeadFit | null): Promise<string | null> {
  const target = acquireRenderer();
  if (!target) return Promise.resolve(null);
  const head = facingFront(headInput ?? STANDARD_HEAD);
  const state = sanitizeAvatarForgeState({ version: AVATAR_FORGE_VERSION, hair: { ...hair, replaceOriginal: false } });
  const { scene, owned, hair: hairGroup } = buildScene(state, head);
  try {
    const camera = frameCamera(head, hairGroup);
    target.render(scene, camera);
    return encode(target.domElement);
  } finally {
    disposeAvatarForgeObject(hairGroup);
    owned.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    });
  }
}

/**
 * 헤어 썸네일 URL. WebGL 이 없으면 null(호출자는 도해를 유지). 같은 헤어·두상은 캐시를 돌려준다.
 */
export function renderCharacterHairThumbnail(
  hair: AvatarForgeHairParams,
  head: StudioVrmHeadFit | null,
): Promise<string | null> {
  const key = characterHairThumbnailKey(hair, head);
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const job = queue.then(
    () => new Promise<void>((resolve) => {
      // 카드 여러 장이 한 프레임에 몰려도 편집기 입력을 막지 않게 한 장씩 양보한다.
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    }),
  ).then(() => renderNow(hair, head));
  queue = job.catch(() => null);
  cache.set(key, job);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    const stale = cache.get(oldest);
    cache.delete(oldest);
    void stale?.then((url) => {
      if (url && url.startsWith("blob:") && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
    });
  }
  return job;
}
