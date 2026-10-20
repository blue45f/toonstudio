// studio-background-3d-model.ts에서 추출한 레거시 단일-Blob 커스텀 모델 로더.
// 원본 모듈이 이 모듈을 re-export하므로 기존 호출자의 import 경로는 변하지 않는다.

import * as THREE from "three";

import {
  loadStudioBg3dModelByFormat,
  type StudioBg3dModelFormat as StudioBg3dUnifiedModelFormat,
} from "./studio-bg3d-model-loader";

import type { Bg3dModelFormat } from "./bg3d-model-library";

// PRIMITIVE_DEFS 도형들의 대략적인 크기 감각(반경 0.5~1m대)과 맞춘 오토핏 목표 치수.
// 레거시 단일-Blob .obj가 .mtl 없이 올라왔을 때 씌우는 무광 중립색 — 도형 프리셋
// 팔레트(예: box "#c9a876", cylinder "#9fb4c9")와 톤을 맞추되 특정 프리셋과 겹치지 않는
// 회색조를 고른다. 현행 다중 파일 가져오기는 OBJ와 MTL/텍스처를 함께 해석해 GLB로 정규화한다.
const BG3D_CUSTOM_MODEL_NEUTRAL_COLOR = "#b8b8c2";

/**
 * 현행 가져오기는 OBJ와 MTL/텍스처를 함께 받아 재질을 적용한 자체 포함 GLB로 정규화한다.
 * 이 함수는 그 경계 이전에 저장된 레거시 단일-Blob OBJ 또는 MTL이 없는 OBJ의 폴백이다.
 * 모든 메시에 도형 프리셋과 같은 계열의 무광 중립색 MeshStandardMaterial 하나를 공유시켜
 * "실루엣은 정확하되 색은 신경 안 써도 되는" 블록아웃 톤을 보장한다. 교체되는 원본
 * 머티리얼(들)은 즉시 dispose해 GPU 리소스가 새지 않게 한다.
 */
export function applyBg3dFallbackMaterial(root: THREE.Object3D, color: string = BG3D_CUSTOM_MODEL_NEUTRAL_COLOR): void {
  const material = new THREE.MeshStandardMaterial({ color });
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const prevMaterial = mesh.material;
    mesh.material = material;
    for (const mat of Array.isArray(prevMaterial) ? prevMaterial : [prevMaterial]) {
      mat.dispose();
    }
  });
}

/**
 * IndexedDB에서 꺼낸 blob을 통합 로더(loadStudioBg3dModelByFormat)로 파싱해 씬에 넣을 수 있는
 * Object3D 루트를 만든다. 파싱 자체는 통합 로더가 포맷별 동적 import(three/examples/jsm)로
 * 수행하므로 초기 번들을 무겁게 만들지 않는다. 지원 포맷은 기존 glb/gltf/obj에 fbx/dae가
 * 더해졌다.
 *
 * blob은 이미 로컬 메모리에 있는 데이터(방금 IndexedDB에서 꺼낸 값)라, loadVrmAsset과 달리
 * resolveAssetUrl/HEAD 프리플라이트(HTML 폴백 감지)가 필요 없다 — 그 대상은 배포 오리진이 다를 수
 * 있는 root-relative 정적 경로(/vrm/..)뿐이고, blob: 스킴은 애초에 그 대상이 아니다
 * (loadVrmAsset의 shouldPreflightVrmUrl도 blob:을 프리플라이트 대상에서 제외한다).
 */
export async function loadBg3dCustomModelFromBlob(
  blob: Blob,
  // 저장 층의 Bg3dModelFormat(glb/gltf/obj)에 통합 로더가 여는 fbx/dae를 더한 형태.
  // 시그니처·반환 형태는 기존과 동일하고, 기존 호출자는 그대로 컴파일된다.
  format: Bg3dModelFormat | "fbx" | "dae",
): Promise<THREE.Object3D> {
  // 통합 로더(bg3d/studio-bg3d-model-loader.ts) 위임으로 교체했다. 포맷별 동적 import와
  // GLTFLoader의 Meshopt 디코더 적용은 통합 로더가 맡고, 이 레거시 경로 고유의 후처리
  // (obj 폴백 재질)만 여기에 남긴다. 기존 동작과의 차이는 NOTES(web-loader) 참조:
  // blob: URL + loadAsync 대신 바이트 + parse 계열을 쓰므로 단일 Blob으로 완결되는
  // 모델에서는 결과가 같고, .gltf의 외부 상대 참조는 애초에 blob: URL로도 해석할 수
  // 없었으므로 보존 범위에 들지 않는다.
  const data = await blob.arrayBuffer();
  const root = await loadStudioBg3dModelByFormat({ data, format: format as StudioBg3dUnifiedModelFormat });
  if (format === "obj") {
    applyBg3dFallbackMaterial(root);
  }
  return root;
}
