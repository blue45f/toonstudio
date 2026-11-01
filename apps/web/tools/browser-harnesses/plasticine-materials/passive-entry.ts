/** 같은 Vite 그래프의 실제 제품 Canvas를 읽는다. 상태·geometry·renderer·GPU를 바꾸지 않는다. */
import { _roots, getRootState } from "@react-three/fiber";
import * as THREE from "three";

function textureInfo(texture: THREE.Texture | null | undefined, renderer: THREE.WebGLRenderer, gl: WebGL2RenderingContext) {
  if (!texture) return null;
  const image: unknown = texture.source?.data ?? texture.image;
  const value = image && typeof image === "object"
    ? image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number; complete?: boolean }
    : null;
  const width = value?.naturalWidth ?? value?.width ?? 0;
  const height = value?.naturalHeight ?? value?.height ?? 0;
  // get만 호출하면 없는 WeakMap 항목을 만들므로 실제 renderer 항목이 있는 경우에만 읽는다.
  const properties: unknown = renderer.properties.has(texture) ? renderer.properties.get(texture) : null;
  const record = properties && typeof properties === "object" ? properties as Record<string, unknown> : null;
  const handle = record?.__webglTexture;
  const sourceUrl: unknown = texture.userData.studioBg3dSurfaceSourceUrl;
  return {
    uuid: texture.uuid,
    sourceUrl: typeof sourceUrl === "string" ? sourceUrl : null,
    width, height,
    decoded: width > 0 && height > 0 && value?.complete !== false,
    colorSpace: texture.colorSpace,
    repeat: texture.repeat.toArray(),
    version: texture.version,
    sourceDataReady: texture.source.dataReady,
    uploadedVersion: typeof record?.__version === "number" ? record.__version : null,
    gpuObjectAlive: handle instanceof WebGLTexture && gl.isTexture(handle),
  };
}

function materialProgram(material: THREE.MeshStandardMaterial, renderer: THREE.WebGLRenderer, gl: WebGL2RenderingContext) {
  const properties: unknown = renderer.properties.has(material) ? renderer.properties.get(material) : null;
  const record = properties && typeof properties === "object" ? properties as Record<string, unknown> : null;
  const current = record?.currentProgram;
  const program = current && typeof current === "object" ? (current as Record<string, unknown>).program : null;
  const linked = program instanceof WebGLProgram && gl.isProgram(program) && gl.getProgramParameter(program, gl.LINK_STATUS) === true;
  const sampler = (name: string) => linked && program instanceof WebGLProgram && gl.getUniformLocation(program, name) !== null;
  return { linked, samplers: { baseColor: sampler("map"), normal: sampler("normalMap"),
    roughness: sampler("roughnessMap"), metalness: sampler("metalnessMap") } };
}

/** 원본 buffer·실제 포털 카메라와 투영 footprint만 읽는다. 행렬 갱신이나 렌더 요청은 하지 않는다. */
function appearance(mesh: THREE.Mesh, renderer: THREE.WebGLRenderer, canvas: HTMLCanvasElement) {
  const state = getRootState(mesh);
  if (!state || state.gl !== renderer) throw new Error("실제 mesh를 그리는 같은 renderer의 포털 state가 없습니다.");
  const { camera } = state, rect = canvas.getBoundingClientRect();
  const view = { left: state.size.left - rect.left, top: state.size.top - rect.top, width: state.size.width, height: state.size.height };
  const geometry = mesh.geometry, position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal"), uv = geometry.getAttribute("uv"), index = geometry.getIndex();
  if (!position || !normal || !uv || position.itemSize !== 3 || normal.itemSize !== 3 || uv.itemSize !== 2) throw new Error("대표 도형의 실제 position/normal/UV stream이 없습니다.");
  const stream = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, dimensions: 2 | 3) => {
    const values: number[] = [];
    for (let offset = 0; offset < attribute.count; offset++) {
      values.push(attribute.getX(offset), attribute.getY(offset));
      if (dimensions === 3) values.push(attribute.getZ(offset));
    }
    return values;
  };
  const indices = index ? Array.from({ length: index.count }, (_, offset) => index.getX(offset)) : Array.from({ length: position.count }, (_, offset) => offset);
  if (indices.length % 3 !== 0) throw new Error("표시 삼각형의 index stream이 다릅니다.");
  const projected = indices.map((id) => {
    const point = new THREE.Vector3(position.getX(id), position.getY(id), position.getZ(id)).applyMatrix4(mesh.matrixWorld).project(camera);
    return { x: view.left + (point.x + 1) * view.width / 2, y: view.top + (1 - point.y) * view.height / 2, z: point.z };
  });
  const triangles: Array<readonly (typeof projected[number])[]> = [];
  const determinant = Math.sign(mesh.matrixWorld.determinant());
  if (determinant === 0) throw new Error("대표 도형의 실제 변환이 특이행렬입니다.");
  for (let offset = 0; offset < projected.length; offset += 3) {
    const a = projected[offset], b = projected[offset + 1], c = projected[offset + 2];
    if (!a || !b || !c) throw new Error("실제 표시 삼각형의 코너가 없습니다.");
    const area = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * determinant;
    if (area < 0 && [a, b, c].every((point) => point.z >= -1 && point.z <= 1)) triangles.push([a, b, c]);
  }
  if (triangles.length === 0) return null;
  // 표면 위에 그려지는 축·기즈모는 실제 표시 geometry의 경계로 제외한다. 픽셀 색으로 영역을 고르지 않는다.
  const overlayBounds: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  state.scene.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some((material) => material.visible && material.opacity > 0 && !material.depthTest)) return;
    const attribute = object.geometry.getAttribute("position");
    if (!attribute) return;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (let offset = 0; offset < attribute.count; offset++) {
      const point = new THREE.Vector3(attribute.getX(offset), attribute.getY(offset), attribute.getZ(offset)).applyMatrix4(object.matrixWorld).project(camera);
      if (![point.x, point.y, point.z].every(Number.isFinite) || point.z < -1 || point.z > 1) continue;
      const x = view.left + (point.x + 1) * view.width / 2, y = view.top + (1 - point.y) * view.height / 2;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    if ([left, top, right, bottom].every(Number.isFinite)) overlayBounds.push({ left, top, right, bottom });
  });
  return { meshMatrixWorld: mesh.matrixWorld.toArray(),
    geometry: { positions: stream(position, 3), normals: stream(normal, 3), uvs: stream(uv, 2), indices },
    camera: { type: camera.type, matrixWorld: camera.matrixWorld.toArray(), matrixWorldInverse: camera.matrixWorldInverse.toArray(),
      projection: camera.projectionMatrix.toArray() }, view, projectedTriangles: triangles, overlayBounds,
    renderer: { outputColorSpace: renderer.outputColorSpace, toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure,
      pixelRatio: renderer.getPixelRatio() } };
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
    opacity: number; transparent: boolean; emissive: number[]; emissiveIntensity: number; wireframe: boolean;
    normalScale: number[]; channels: Record<string, ReturnType<typeof textureInfo>>;
    program: ReturnType<typeof materialProgram>; appearance: ReturnType<typeof appearance>;
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
      opacity: material.opacity, transparent: material.transparent, emissive: material.emissive.toArray(),
      emissiveIntensity: material.emissiveIntensity, wireframe: material.wireframe,
      metalness: material.metalness, normalMapType: material.normalMapType,
      normalScale: material.normalScale.toArray(),
      channels: { baseColor: textureInfo(material.map, renderer, gl), normal: textureInfo(material.normalMap, renderer, gl),
        roughness: textureInfo(material.roughnessMap, renderer, gl), metalness: textureInfo(material.metalnessMap, renderer, gl) },
      program: materialProgram(material, renderer, gl), appearance: appearance(object, renderer, canvas),
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
