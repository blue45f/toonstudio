import * as THREE from "three";

import type { StudioBg3dCaptureRequest } from "./studio-bg3d-capture-adapter";

type AlbedoMaterial = THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
  | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial | THREE.MeshToonMaterial;

export interface StudioBg3dThreeSixPassPlanes {
  readonly flatColorRgba: Uint8ClampedArray;
  readonly shadowRgba: Uint8ClampedArray;
}

function supportedMaterial(material: THREE.Material): material is AlbedoMaterial {
  return material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial
    || material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshPhongMaterial
    || material instanceof THREE.MeshToonMaterial;
}

/** 실제 그림자 맵으로 분리할 수 없는 재질을 조용히 단순화하지 않는다. */
export function assertStudioBg3dThreeSixPassScene(scene: THREE.Scene): void {
  if (scene.overrideMaterial) throw new Error("6패스 LT는 장면 override 재질을 지원하지 않습니다.");
  scene.traverseVisible((object) => {
    if (object instanceof THREE.Line || object instanceof THREE.Points || object instanceof THREE.Sprite) {
      throw new Error("6패스 LT는 선·포인트·스프라이트 장면을 아직 지원하지 않습니다.");
    }
    if (!(object instanceof THREE.Mesh)) return;
    if (object.customDepthMaterial || object.customDistanceMaterial) {
      throw new Error("6패스 LT는 사용자 정의 그림자 재질을 지원하지 않습니다.");
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material.visible) continue;
      if (!supportedMaterial(material) || material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
        || material.transparent || material.opacity !== 1 || material.alphaTest !== 0 || material.alphaMap
        || ("displacementMap" in material && material.displacementMap)
        || (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0)) {
        throw new Error("6패스 LT는 현재 불투명 표준 재질만 지원합니다. 사용자 셰이더·반투명·알파 컷·변위·투과 재질은 지원하지 않습니다.");
      }
    }
  });
}

/** 기존 장치 깊이를 건드리지 않고, 실제 near/far에 따른 선형 거리를 별도로 만든다. */
export function linearizeStudioBg3dSixPassDepth(
  depth: Float32Array,
  camera: THREE.Camera,
): { readonly linearDepth: Float32Array; readonly linearDepthNearMeters: number; readonly linearDepthFarMeters: number } {
  if (!(camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera)
    || !Number.isFinite(camera.near) || camera.near < 0 || !Number.isFinite(camera.far) || camera.far <= camera.near
    || (camera instanceof THREE.PerspectiveCamera && camera.near === 0)) {
    throw new Error("6패스 LT에는 유효한 near/far를 가진 원근·평행 카메라가 필요합니다.");
  }
  const { near, far } = camera;
  const linearDepth = new Float32Array(depth.length);
  for (let index = 0; index < depth.length; index += 1) {
    const value = depth[index];
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("6패스 깊이 값이 유효하지 않습니다.");
    const distance = camera instanceof THREE.PerspectiveCamera
      ? near * far / (far - value * (far - near))
      : near + value * (far - near);
    linearDepth[index] = Math.max(0, Math.min(1, (distance - near) / (far - near)));
  }
  return { linearDepth, linearDepthNearMeters: near, linearDepthFarMeters: far };
}

/**
 * 밑색은 MeshBasicMaterial, 그림자는 Three ShadowMaterial의 실제 getShadowMask로 렌더한다.
 * 각 제출 함수는 첫 await 전에 원본 재질·fog·tone mapping을 복원한다. GPU 복사가 끝난 뒤에만
 * 임시 재질을 폐기하므로 라이브 프레임과 비동기 readback이 같은 장면을 훼손하지 않는다.
 */
export async function captureStudioBg3dThreeSixPassPlanes(input: {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly request: StudioBg3dCaptureRequest;
  readonly submit?: (submitSync: () => Promise<Uint8ClampedArray>) => Promise<Uint8ClampedArray>;
  readonly captureColor: (request: StudioBg3dCaptureRequest) => Promise<Uint8ClampedArray>;
}): Promise<StudioBg3dThreeSixPassPlanes> {
  const { scene, renderer, request } = input;
  assertStudioBg3dThreeSixPassScene(scene);
  const allocated: THREE.Material[] = [];
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const originalFog = scene.fog;
  const originalToneMapping = renderer.toneMapping;
  const originalExposure = renderer.toneMappingExposure;
  const originalBackground = scene.background;
  const originalEnvironment = scene.environment;
  const originalShadowAutoUpdate = renderer.shadowMap.autoUpdate;
  const originalShadowNeedsUpdate = renderer.shadowMap.needsUpdate;
  const originalOverride = scene.overrideMaterial;
  const createMaterial = (source: THREE.Material, shadow: boolean): THREE.Material => {
    // visible=false 재질은 그리지 않지만 지원 여부와 무관하게 원래 비표시 상태를 보존한다.
    if (!source.visible) {
      const hidden = new THREE.MeshBasicMaterial({ visible: false });
      allocated.push(hidden);
      return hidden;
    }
    if (!supportedMaterial(source)) throw new Error("6패스 LT 재질 지원 범위를 벗어났습니다.");
    const material = shadow
      ? new THREE.ShadowMaterial({ color: 0x000000, opacity: 1, side: source.side })
      : new THREE.MeshBasicMaterial({ color: source.color, map: source.map,
        vertexColors: source.vertexColors, side: source.side, opacity: 1 });
    material.visible = source.visible;
    material.depthTest = source.depthTest;
    material.depthWrite = source.depthWrite;
    material.polygonOffset = source.polygonOffset;
    material.polygonOffsetFactor = source.polygonOffsetFactor;
    material.polygonOffsetUnits = source.polygonOffsetUnits;
    material.clippingPlanes = source.clippingPlanes;
    material.clipIntersection = source.clipIntersection;
    material.clipShadows = source.clipShadows;
    material.toneMapped = false;
    material.fog = false;
    if (shadow) {
      // alpha=0인 앞쪽 표면도 뒤의 수신면 픽셀을 지워야 한다. 투명 블렌딩으로 그리면
      // 앞 물체를 관통한 바닥 그림자가 남으므로, 불투명 깊이 검사와 RGBA 직접 기록을 쓴다.
      material.transparent = false;
      material.blending = THREE.NoBlending;
    }
    allocated.push(material);
    return material;
  };
  const restore = () => {
    for (const [mesh, material] of originals) mesh.material = material;
    scene.fog = originalFog;
    scene.background = originalBackground;
    scene.environment = originalEnvironment;
    scene.overrideMaterial = originalOverride;
    renderer.toneMapping = originalToneMapping;
    renderer.toneMappingExposure = originalExposure;
    renderer.shadowMap.autoUpdate = originalShadowAutoUpdate;
    renderer.shadowMap.needsUpdate = originalShadowNeedsUpdate;
  };
  const submit = (shadow: boolean): Promise<Uint8ClampedArray> => {
    try {
      scene.traverseVisible((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const source = originals.get(object) ?? object.material;
        originals.set(object, source);
        object.material = Array.isArray(source)
          ? source.map((material) => createMaterial(material, shadow)) : createMaterial(source, shadow);
      });
      scene.fog = null;
      scene.environment = null;
      scene.background = shadow ? null : originalBackground;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 1;
      // 두 패스는 같은 정본 shadow caster를 사용한다. 새 그림자 맵도 이 제출 안에서 갱신한다.
      renderer.shadowMap.autoUpdate = true;
      renderer.shadowMap.needsUpdate = true;
      return input.captureColor({ ...request, background: shadow
        ? { color: "#000000", alpha: 0 } : request.background });
    } finally { restore(); }
  };
  try {
    const next = (shadow: boolean) => input.submit ? input.submit(() => submit(shadow)) : submit(shadow);
    const flatColorRgba = await next(false);
    const shadowRgba = await next(true);
    return { flatColorRgba, shadowRgba };
  } finally {
    for (const material of allocated) material.dispose();
  }
}
