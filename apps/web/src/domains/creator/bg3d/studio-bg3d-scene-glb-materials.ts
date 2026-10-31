/** 화면과 같은 PBR·표면 페인트를 독립 재질에 적용하고 cache texture는 소유하지 않는다. */
import * as THREE from "three";
import { resolveStudioBg3dPrimitiveCc0PbrSpread } from "./studio-bg3d-cc0-pbr-texture-loader";
import { collectStudioBg3dGlbTexturePaintTargets, applyStudioBg3dGlbTexturePaint } from "./studio-bg3d-glb-texture-paint-three";
import { StudioBg3dTexturePaintSurface } from "./studio-bg3d-texture-paint";
import { resolveStudioBg3dSurfaceMaterialProps, spreadStudioBg3dSurfaceMaterialProps } from "./studio-bg3d-surface-presets";
import { assertSceneGlbActive, StudioBg3dSceneGlbGraphError } from "./studio-bg3d-scene-glb-errors";
import type { StudioBg3dGlbPaintCanvas, StudioBg3dGlbPaintCanvas2d } from "./studio-bg3d-glb-texture-paint";
import type { StudioBg3dModelNode, StudioBg3dPrimitiveNode } from "./studio-bg3d-scene-document-types";

export type StudioBg3dSceneGlbCanvas = HTMLCanvasElement | OffscreenCanvas;
export type StudioBg3dSceneGlbCanvasFactory = (width: number, height: number) => StudioBg3dSceneGlbCanvas;
export interface SceneGlbMaterials {
  primitive(node: StudioBg3dPrimitiveNode): THREE.MeshStandardMaterial;
  paintModel(root: THREE.Object3D, node: StudioBg3dModelNode): void;
  ready(root: THREE.Object3D, nodeId: string, signal?: AbortSignal): Promise<void>;
  dispose(): void;
}
function defaultCanvas(width: number, height: number): StudioBg3dSceneGlbCanvas {
  if (typeof document === "undefined") throw new StudioBg3dSceneGlbGraphError("paint-unavailable");
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; return canvas;
}
function drawable(input: unknown): input is CanvasImageSource {
  return (typeof HTMLCanvasElement !== "undefined" && input instanceof HTMLCanvasElement)
    || (typeof OffscreenCanvas !== "undefined" && input instanceof OffscreenCanvas)
    || (typeof HTMLImageElement !== "undefined" && input instanceof HTMLImageElement)
    || (typeof ImageBitmap !== "undefined" && input instanceof ImageBitmap)
    || (typeof HTMLVideoElement !== "undefined" && input instanceof HTMLVideoElement)
    || (typeof SVGImageElement !== "undefined" && input instanceof SVGImageElement);
}
function positiveImageSize(input: unknown): boolean {
  if (!input || typeof input !== "object" || !("width" in input) || !("height" in input)) return false;
  return typeof input.width === "number" && input.width > 0 && typeof input.height === "number" && input.height > 0
    && (!("complete" in input) || input.complete !== false)
    && (!("naturalWidth" in input) || (typeof input.naturalWidth === "number" && input.naturalWidth > 0));
}
/** runtime cache의 pending texture가 빈 이미지로 저장되지 않도록 제한된 시간 동안 실제 이미지를 기다린다. */
async function textureReady(texture: THREE.Texture, nodeId: string, signal?: AbortSignal): Promise<void> {
  if (texture instanceof THREE.CubeTexture || texture instanceof THREE.DepthTexture) throw new StudioBg3dSceneGlbGraphError("unsupported-feature", [nodeId], "non-portable-texture");
  // stock exporter는 DataTexture를 RGBA8로만 읽는다. float/다차원 데이터를 바이트로 오해해 저장하지 않는다.
  if (texture instanceof THREE.Data3DTexture || texture instanceof THREE.DataArrayTexture
    || (texture instanceof THREE.DataTexture && (texture.format !== THREE.RGBAFormat || texture.type !== THREE.UnsignedByteType))) {
    throw new StudioBg3dSceneGlbGraphError("unsupported-feature", [nodeId], "data-texture-storage-not-exported");
  }
  const start = Date.now();
  while (!positiveImageSize(texture.image)) {
    assertSceneGlbActive(signal);
    if (Date.now() - start > 10_000) throw new StudioBg3dSceneGlbGraphError("texture-unavailable", [nodeId], "texture-image-not-ready");
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
  assertSceneGlbActive(signal);
}
function materials(root: THREE.Object3D): THREE.Material[] {
  const result = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) result.add(material);
    }
  });
  return [...result];
}
export function createStudioBg3dSceneGlbMaterials(createCanvas: StudioBg3dSceneGlbCanvasFactory = defaultCanvas): SceneGlbMaterials {
  const canvases = new WeakMap<object, StudioBg3dSceneGlbCanvas>(), disposals: (() => void)[] = [];
  const adapt = (width: number, height: number): StudioBg3dGlbPaintCanvas => {
    const canvas = createCanvas(width, height); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context || !("fillRect" in context)) throw new StudioBg3dSceneGlbGraphError("paint-unavailable");
    const native = context;
    const adapter: StudioBg3dGlbPaintCanvas2d = {
      get fillStyle() { return typeof native.fillStyle === "string" ? native.fillStyle : ""; }, set fillStyle(value) { native.fillStyle = value; },
      get strokeStyle() { return typeof native.strokeStyle === "string" ? native.strokeStyle : ""; }, set strokeStyle(value) { native.strokeStyle = value; },
      get globalAlpha() { return native.globalAlpha; }, set globalAlpha(value) { native.globalAlpha = value; },
      get lineWidth() { return native.lineWidth; }, set lineWidth(value) { native.lineWidth = value; },
      get lineCap() { return native.lineCap; }, set lineCap(value) {
        if (value !== "butt" && value !== "round" && value !== "square") throw new StudioBg3dSceneGlbGraphError("paint-unavailable"); native.lineCap = value;
      },
      get lineJoin() { return native.lineJoin; }, set lineJoin(value) {
        if (value !== "miter" && value !== "bevel" && value !== "round") throw new StudioBg3dSceneGlbGraphError("paint-unavailable"); native.lineJoin = value;
      },
      fillRect: (x, y, w, h) => native.fillRect(x, y, w, h), clearRect: (x, y, w, h) => native.clearRect(x, y, w, h),
      beginPath: () => native.beginPath(), moveTo: (x, y) => native.moveTo(x, y), lineTo: (x, y) => native.lineTo(x, y),
      stroke: () => native.stroke(), arc: (x, y, r, a, b) => native.arc(x, y, r, a, b), fill: () => native.fill(),
      drawImage: (image, x, y, w, h) => {
        const actual = image && typeof image === "object" ? canvases.get(image) ?? image : image;
        if (!drawable(actual)) throw new StudioBg3dSceneGlbGraphError("paint-unavailable", [], "paint-image-not-readable");
        native.drawImage(actual, x, y, w, h);
      },
      getImageData: (x, y, w, h) => native.getImageData(x, y, w, h),
      putImageData: (data, x, y) => {
        const image = native.createImageData(data.width, data.height); image.data.set(data.data); native.putImageData(image, x, y);
      },
    };
    const wrapped: StudioBg3dGlbPaintCanvas = { width, height, getContext: () => adapter };
    canvases.set(wrapped, canvas); return wrapped;
  };
  return {
    primitive(node) {
      let paint: THREE.CanvasTexture<StudioBg3dSceneGlbCanvas> | null = null;
      if (node.texturePaint) {
        const surface = new StudioBg3dTexturePaintSurface({ createCanvas: adapt, baseColor: node.color, paint: node.texturePaint });
        const canvas = canvases.get(surface.canvas);
        if (!canvas) throw new StudioBg3dSceneGlbGraphError("paint-unavailable", [node.id]);
        const painted = new THREE.CanvasTexture(canvas); painted.colorSpace = THREE.SRGBColorSpace; painted.anisotropy = 4;
        paint = painted; disposals.push(() => painted.dispose());
      }
      const maps = resolveStudioBg3dPrimitiveCc0PbrSpread(node.materialOverride, paint, node.color);
      const material = new THREE.MeshStandardMaterial({ color: paint ? "#ffffff" : node.color, ...maps,
        ...spreadStudioBg3dSurfaceMaterialProps(resolveStudioBg3dSurfaceMaterialProps(node.materialOverride)),
        side: node.materialOverride?.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      disposals.push(() => material.dispose()); return material;
    },
    paintModel(root, node) {
      if (!node.modelTexturePaint) return;
      const targets = collectStudioBg3dGlbTexturePaintTargets(root), keys = new Set(targets.targets.map(({ targetKey }) => targetKey));
      if (node.modelTexturePaint.targets.some(({ targetKey }) => !keys.has(targetKey))) throw new StudioBg3dSceneGlbGraphError("paint-unavailable", [node.id], "paint-target-missing");
      const applied = applyStudioBg3dGlbTexturePaint(targets.targets, node.modelTexturePaint, { createCanvas: adapt });
      disposals.push(() => applied.dispose());
      if (node.modelTexturePaint.targets.some(({ targetKey }) => !applied.appliedTargetKeys.includes(targetKey))) throw new StudioBg3dSceneGlbGraphError("paint-unavailable", [node.id]);
      for (const { material } of targets.targets) {
        if (material.map && material.map.image && typeof material.map.image === "object") {
          const canvas = canvases.get(material.map.image); if (canvas) material.map.image = canvas;
        }
      }
    },
    async ready(root, nodeId, signal) {
      const textures = new Set<THREE.Texture>();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const binding: THREE.Material | THREE.Material[] = object.material;
        if ((Array.isArray(binding) ? binding : [binding]).some((material) => "wireframe" in material && material.wireframe === true)) {
          throw new StudioBg3dSceneGlbGraphError("unsupported-feature", [nodeId], "wireframe-mesh-requires-edge-indices");
        }
      });
      for (const material of materials(root)) {
        if (material instanceof THREE.ShaderMaterial || material instanceof THREE.RawShaderMaterial) throw new StudioBg3dSceneGlbGraphError("unsupported-feature", [nodeId], "shader-material");
        // glTF alphaMode는 BLEND와 MASK를 동시에 표현하지 않는다. stock exporter는 이 cutoff를 버린다.
        if (material.transparent && material.alphaTest > 0) throw new StudioBg3dSceneGlbGraphError("unsupported-feature", [nodeId], "blend-with-alpha-cutoff-requires-bake");
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
      await Promise.all([...textures].map((texture) => textureReady(texture, nodeId, signal)));
    },
    dispose() { for (const dispose of disposals.splice(0).reverse()) dispose(); },
  };
}
