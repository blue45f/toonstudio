/** 같은 Vite 그래프의 실제 제품 Canvas를 읽는다. 상태·geometry·renderer·GPU를 바꾸지 않는다. */
import { _roots } from "@react-three/fiber";
import * as THREE from "three";

function textureInfo(texture: THREE.Texture | null | undefined) {
  if (!texture) return null;
  const image: unknown = texture.source?.data ?? texture.image;
  const value = image && typeof image === "object"
    ? image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number; complete?: boolean }
    : null;
  const width = value?.naturalWidth ?? value?.width ?? 0;
  const height = value?.naturalHeight ?? value?.height ?? 0;
  return {
    uuid: texture.uuid,
    sourceUrl: texture.userData.studioBg3dSurfaceSourceUrl ?? null,
    width, height,
    decoded: width > 0 && height > 0 && value?.complete !== false,
    colorSpace: texture.colorSpace,
    repeat: texture.repeat.toArray(),
    version: texture.version,
  };
}

function observe() {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="studio-bg3d-dialog"] canvas');
  if (!canvas) throw new Error("제품 BG3D Canvas가 없습니다.");
  const state = _roots.get(canvas)?.store.getState();
  if (!state) throw new Error("같은 모듈 그래프의 제품 R3F store가 없습니다.");
  if (!(state.gl instanceof THREE.WebGLRenderer)) throw new Error("이 최소 검증은 실제 WebGLRenderer만 허용합니다.");
  const renderer = state.gl;
  const gl = renderer.getContext();
  if (!(gl instanceof WebGL2RenderingContext)) throw new Error("제품 Canvas가 WebGL2가 아닙니다.");
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const entities: Array<{
    entityId: string; meshUuid: string; visible: boolean; materialType: string;
    color: number[]; roughness: number; metalness: number; normalMapType: THREE.NormalMapTypes;
    normalScale: number[]; channels: Record<string, ReturnType<typeof textureInfo>>;
  }> = [];
  // 제품의 drei View portal은 Canvas 기본 scene 밖에 있다. 같은 root의 실제 interaction 객체도 읽는다.
  const visited = new Set<string>();
  const inspect = (object: THREE.Object3D) => {
    if (visited.has(object.uuid)) return;
    visited.add(object.uuid);
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    let owner: THREE.Object3D | null = object;
    let visible = true;
    while (owner && owner.userData.studioBg3dEntityKind !== "primitive") {
      visible = visible && owner.visible;
      owner = owner.parent;
    }
    if (!owner || typeof owner.userData.studioBg3dEntityId !== "string") return;
    visible = visible && owner.visible;
    const material = object.material;
    entities.push({
      entityId: owner.userData.studioBg3dEntityId, meshUuid: object.uuid, visible,
      materialType: material.type, color: material.color.toArray(), roughness: material.roughness,
      metalness: material.metalness, normalMapType: material.normalMapType,
      normalScale: material.normalScale.toArray(),
      channels: { baseColor: textureInfo(material.map), normal: textureInfo(material.normalMap),
        roughness: textureInfo(material.roughnessMap), metalness: textureInfo(material.metalnessMap) },
    });
  };
  state.scene.traverse(inspect);
  for (const object of state.internal.interaction) object.traverse(inspect);
  const rect = canvas.getBoundingClientRect();
  return {
    observedAt: performance.now(), frame: renderer.info.render.frame,
    renderer: debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null,
    vendor: debug ? String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : null,
    maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)), contextLost: gl.isContextLost(),
    canvas: { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height },
    entities,
  };
}

declare global {
  interface Window { __plasticineActualObserver?: { readonly observe: typeof observe } }
}
window.__plasticineActualObserver = Object.freeze({ observe });
