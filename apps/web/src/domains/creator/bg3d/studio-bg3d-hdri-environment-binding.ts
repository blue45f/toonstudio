/**
 * Studio BG3D 실제 HDRI 환경 마운트 바인딩.
 *
 * 절차 파노라마 바인딩(mountStudioBg3dProceduralPanorama)과 같은 소유권 규약을 따릅니다:
 * 마운트 전 scene 상태를 저장하고, 해제 시 자기 것이 남아 있을 때만 정확히 복원합니다.
 * 차이는 취급하는 텍스처뿐입니다 — 등거리 .hdr를 RGBELoader로 읽고 PMREMGenerator로
 * CubeUV 렌더 타깃으로 변환해 `scene.environment`에 연결합니다. Three 렌더러가 등거리
 * 텍스처를 직접 받을 때도 내부적으로 같은 변환을 하므로, 명시 PMREM은 품질(블러 시그마)과
 * 수명(변환 결과의 소유·해제)을 이쪽에서 통제하기 위한 선택입니다.
 *
 * 실패 규약은 에디터의 다른 경계와 같습니다: 로드/변환이 실패하면 scene을 건드리지 않고
 * `ready`가 false로 settle합니다(fail-closed). 환경광 없이도 기존 3점 리그와 절차
 * 파노라마로 편집은 계속됩니다.
 */

import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export interface StudioBg3dHdriEnvironmentMountOptions {
  /** 로컬로 서빙되는 .hdr URL (`/assets/3d/hdri/<id>_<tier>.hdr`). */
  readonly url: string;
  readonly intensity: number;
  readonly rotationDegrees: number;
  readonly useAsBackground: boolean;
  /** 마운트 성패가 확정되는 순간 한 번 호출됩니다 (뷰포트 invalidate 연결용). */
  readonly onSettled?: (applied: boolean) => void;
}

export interface StudioBg3dHdriEnvironmentBinding {
  /** true면 HDRI 환경이 scene에 실제로 걸린 상태로 settle한 것입니다. */
  readonly ready: Promise<boolean>;
  /** PMREM 변환 결과(CubeUV) 텍스처. 걸리지 않았으면 null입니다. */
  readonly texture: THREE.Texture | null;
  readonly setRotation: (rotationDegrees: number) => void;
  readonly setIntensity: (intensity: number) => void;
  readonly dispose: () => void;
}

function yawRadians(rotationDegrees: number): number {
  const wrapped = rotationDegrees % 360;
  return THREE.MathUtils.degToRad(wrapped < 0 ? wrapped + 360 : wrapped);
}

/**
 * HDRI 환경을 scene에 겁니다. 비동기 로드가 끝나기 전에는 scene을 건드리지 않으며,
 * 그 사이 dispose되면 도착한 텍스처를 즉시 해제하고 아무것도 걸지 않습니다.
 *
 * 소유권 전제: 이 바인딩이 살아 있는 동안 `scene.environment`의 소유자는 이 바인딩입니다.
 * 절차 파노라마 바인딩과의 충돌을 피하려면 파노라마 쪽 마운트에서
 * `ownsEnvironment: false`를 받아야 합니다(PATCHES.md 3항).
 *
 * 렌더러 주의: PMREMGenerator는 WebGL 렌더러 기준 API입니다. WebGPU 렌더러
 * (three/webgpu)에서의 동작은 통합 단계에서 실측 검증이 필요하고, 실패하면 이 바인딩은
 * throw 없이 미적용으로 settle하므로 절차 환경이 그대로 유지됩니다.
 */
export function mountStudioBg3dHdriEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  options: StudioBg3dHdriEnvironmentMountOptions,
): StudioBg3dHdriEnvironmentBinding {
  const previousEnvironment = scene.environment;
  const previousEnvironmentIntensity = scene.environmentIntensity;
  const previousEnvironmentRotation = scene.environmentRotation.clone();
  const previousBackground = scene.background;
  const previousBackgroundIntensity = scene.backgroundIntensity;
  const previousBackgroundRotation = scene.backgroundRotation.clone();

  let disposed = false;
  let applied = false;
  let equirectTexture: THREE.DataTexture | null = null;
  let environmentTarget: THREE.WebGLRenderTarget | null = null;
  let currentIntensity = options.intensity;
  let currentRotationDegrees = options.rotationDegrees;

  const applyRotation = () => {
    const yaw = yawRadians(currentRotationDegrees);
    if (applied && environmentTarget && scene.environment === environmentTarget.texture) {
      scene.environmentRotation.set(0, yaw, 0);
    }
    if (
      applied &&
      options.useAsBackground &&
      equirectTexture &&
      scene.background === equirectTexture
    ) {
      scene.backgroundRotation.set(0, yaw, 0);
    }
  };

  const applyIntensity = () => {
    if (!applied || !environmentTarget || scene.environment !== environmentTarget.texture) {
      return;
    }
    scene.environmentIntensity = currentIntensity;
    if (options.useAsBackground && equirectTexture && scene.background === equirectTexture) {
      scene.backgroundIntensity = currentIntensity;
    }
  };

  const releaseLoadedResources = () => {
    environmentTarget?.dispose();
    environmentTarget = null;
    equirectTexture?.dispose();
    equirectTexture = null;
  };

  const ready = (async (): Promise<boolean> => {
    let pmrem: THREE.PMREMGenerator | null = null;
    try {
      const loader = new RGBELoader();
      loader.setDataType(THREE.HalfFloatType);
      equirectTexture = await loader.loadAsync(options.url);
      if (disposed) {
        releaseLoadedResources();
        return false;
      }
      pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      environmentTarget = pmrem.fromEquirectangular(equirectTexture);
      if (disposed) {
        releaseLoadedResources();
        return false;
      }
      scene.environment = environmentTarget.texture;
      if (options.useAsBackground) {
        scene.background = equirectTexture;
      } else {
        // 배경으로 쓰지 않으면 변환이 끝난 등거리 원본은 더 필요 없습니다.
        equirectTexture.dispose();
        equirectTexture = null;
      }
      applied = true;
      applyIntensity();
      applyRotation();
      options.onSettled?.(true);
      return true;
    } catch {
      // 네트워크 실패·미지원 렌더러·손상 파일 모두 여기로 옵니다. scene은 건드리지 않았고,
      // 배경으로 걸지 않은 등거리 텍스처는 더 이상 필요 없으므로 해제합니다.
      if (equirectTexture && !applied) {
        equirectTexture.dispose();
        equirectTexture = null;
      }
      environmentTarget?.dispose();
      environmentTarget = null;
      if (!disposed) options.onSettled?.(false);
      return false;
    } finally {
      pmrem?.dispose();
    }
  })();

  return Object.freeze({
    ready,
    get texture() {
      return environmentTarget?.texture ?? null;
    },
    setRotation: (rotationDegrees: number) => {
      if (disposed) return;
      currentRotationDegrees = rotationDegrees;
      applyRotation();
    },
    setIntensity: (intensity: number) => {
      if (disposed) return;
      currentIntensity = intensity;
      applyIntensity();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (applied && environmentTarget && scene.environment === environmentTarget.texture) {
        scene.environment = previousEnvironment;
        scene.environmentIntensity = previousEnvironmentIntensity;
        scene.environmentRotation.copy(previousEnvironmentRotation);
      }
      if (
        applied &&
        options.useAsBackground &&
        equirectTexture &&
        scene.background === equirectTexture
      ) {
        scene.background = previousBackground;
        scene.backgroundIntensity = previousBackgroundIntensity;
        scene.backgroundRotation.copy(previousBackgroundRotation);
      }
      applied = false;
      releaseLoadedResources();
    },
  });
}
