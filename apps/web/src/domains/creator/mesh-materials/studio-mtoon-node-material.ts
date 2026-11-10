/** 승인된 WebGPU lazy entry 안에서만 사용하는 MToon TSL 보정이다. SDK 3.5.5의 MIT 구현을 따른다. */
import { MToonLightingModel, MToonNodeMaterial, type MToonNodeMaterialParameters } from "@pixiv/three-vrm/nodes";
import { Texture, WebGLCoordinateSystem, WebGPUCoordinateSystem } from "three";
import { Fn, cameraProjectionMatrix, diffuseColor, float, length, matcapUV, materialReference, mix, modelNormalMatrix, modelViewMatrix,
  materialNormal, modelViewPosition, nodeObject, normalLocal, normalMap, normalView, positionLocal, step, vec3, vec4 } from "three/tsl";
import { ConvertNode, NodeMaterial, type Node, type NodeBuilder } from "three/webgpu";

import { hasStudioMToonRuntimeFactors } from "./studio-mtoon-runtime-factors";
import { readStudioMToonRuntimeIdentity, registerStudioMToonRuntimeMaterial } from "./studio-mtoon-runtime-identity";
import { isStudioMToonAnimatedUvContractCurrent, StudioMToonAnimatedUVNode } from "./studio-mtoon-node-animated-uv";

export const STUDIO_MTOON_NODE_REVISION = "studio-mtoon-node-equal-boundary-ortho-blue-mask-clip-light-v3";
type ScalarNode = Node<"float">;
type VectorNode = Node<"vec3">;
type DirectInput = Parameters<MToonLightingModel["direct"]>[0];

// 실제 변환 노드로 참조 값의 GPU 형식을 고정한다. mutable VarNode 구현에는 의존하지 않는다.
function floatNode(value: Node): ScalarNode { return nodeObject(new ConvertNode<"float">(value, "float")); }
function vector2Node(value: Node): Node<"vec2"> { return nodeObject(new ConvertNode<"vec2">(value, "vec2")); }
function vector3Node(value: Node): VectorNode { return nodeObject(new ConvertNode<"vec3">(value, "vec3")); }
function vector4Node(value: Node): Node<"vec4"> { return nodeObject(new ConvertNode<"vec4">(value, "vec4")); }
function scalarReference(name: string): ScalarNode { return floatNode(materialReference(name, "float")); }
function colorReference(name: string): VectorNode { return vector3Node(materialReference(name, "color")); }

/** SDK 기본 GL clip bias 1e-6는 window depth 5e-7이다. 원본 본체는 이동하지 않는다. */
export function studioMToonNodeOutlineClipBias(coordinateSystem: number, reversedDepthBuffer: boolean, isOutline: boolean): number {
  if (!isOutline) return 0;
  if (coordinateSystem !== WebGLCoordinateSystem && coordinateSystem !== WebGPUCoordinateSystem) throw new Error("MToon 외곽선의 clip 좌표계를 확인하지 못했습니다.");
  const zeroToOne = coordinateSystem === WebGPUCoordinateSystem || reversedDepthBuffer;
  return (reversedDepthBuffer ? -1 : 1) * (zeroToOne ? 5e-7 : 1e-6);
}

/** select 양쪽을 계산하는 backend에서도 동일 경계의 분모가 0이 되지 않는다. */
export const studioMToonNodeShading = Fn(([dotNL, shift, toony]: readonly [ScalarNode, ScalarNode, ScalarNode]) => {
  const feather = float(1).sub(toony), equal = feather.equal(0), value = dotNL.add(shift);
  const divisor = equal.select(float(1), feather.mul(2));
  return equal.select(step(0, value), value.add(feather).div(divisor).clamp());
}).setLayout({ name: "studioMToonShading", type: "float", inputs: [
  { name: "dotNL", type: "float" }, { name: "shift", type: "float" }, { name: "toony", type: "float" },
] });

/** 원근은 SDK의 양수 view depth, 직교는 clip w=1에 맞춘 1을 사용한다. */
export const studioMToonNodeScreenScale = Fn(([clipW, viewDepth, projectionY]: readonly [ScalarNode, ScalarNode, ScalarNode]) =>
  clipW.equal(0).select(viewDepth, float(1)).div(projectionY),
).setLayout({ name: "studioMToonScreenScale", type: "float", inputs: [
  { name: "clipW", type: "float" }, { name: "viewDepth", type: "float" }, { name: "projectionY", type: "float" },
] });

function directNodes(material: MToonNodeMaterial) {
  const uv = nodeObject(new StudioMToonAnimatedUVNode(material.uvAnimationMaskTexture !== null));
  const sample = (name: string) => vector4Node(materialReference(name, "texture")).context({ getUV: () => uv });
  const scalar = scalarReference, color = colorReference;
  const shade = material.shadeMultiplyTexture ? color("shadeColorFactor").mul(sample("shadeMultiplyTexture").rgb) : color("shadeColorFactor");
  const shift = material.shadingShiftTexture ? scalar("shadingShiftFactor").add(sample("shadingShiftTexture").r.mul(scalar("shadingShiftTextureScale"))) : scalar("shadingShiftFactor");
  const rimMultiply = material.rimMultiplyTexture ? sample("rimMultiplyTexture").rgb : vec3(1);
  const matcap = material.matcapTexture
    ? vector4Node(materialReference("matcapTexture", "texture")).context({ getUV: () => vector2Node(matcapUV).mul(1, -1).add(0, 1) }).rgb.mul(color("matcapFactor")) : vec3(0);
  const dotNV = normalView.dot(modelViewPosition.normalize().negate());
  const rim = float(1).sub(dotNV).add(scalar("parametricRimLiftFactor")).clamp().pow(scalar("parametricRimFresnelPowerFactor"))
    .mul(color("parametricRimColorFactor"));
  return { shade, shift, toony: scalar("shadingToonyFactor"), rimMultiply, matcap, rim, rimLightingMix: scalar("rimLightingMixFactor") };
}

class StudioMToonLightingModel extends MToonLightingModel {
  constructor(private readonly material: MToonNodeMaterial) { super(); }
  override direct(input: DirectInput): void {
    const values = directNodes(this.material), lightColor = vector3Node(input.lightColor);
    const dotNL = normalView.dot(vector3Node(input.lightDirection)).clamp(-1, 1);
    const shading = studioMToonNodeShading(dotNL, float(values.shift), float(values.toony));
    // SDK와 같은 Lambert 계수이며 나머지 간접광·emissive·rim 처리는 SDK를 유지한다.
    const directDiffuse = input.reflectedLight.directDiffuse, directSpecular = input.reflectedLight.directSpecular;
    nodeObject(directDiffuse).assign(vector3Node(directDiffuse).add(lightColor.mul(mix(values.shade, diffuseColor.rgb, shading).mul(1 / Math.PI))));
    nodeObject(directSpecular).assign(vector3Node(directSpecular).add(values.rim.add(values.matcap).mul(values.rimMultiply)
      .mul(mix(vec3(0), lightColor.mul(1 / Math.PI), values.rimLightingMix))));
  }
}

function outlinePosition(material: MToonNodeMaterial): VectorNode {
  const uv = nodeObject(new StudioMToonAnimatedUVNode(material.uvAnimationMaskTexture !== null));
  const normal = normalLocal.normalize();
  let width: ScalarNode = scalarReference("outlineWidthFactor");
  if (material.outlineWidthMultiplyTexture) width = width.mul(vector4Node(materialReference("outlineWidthMultiplyTexture", "texture")).context({ getUV: () => uv }).g);
  let offset = normal.mul(width).mul(length(modelNormalMatrix.mul(normal)));
  if (material.outlineWidthMode === "screenCoordinates") {
    const projection = cameraProjectionMatrix;
    // 단위 벡터와 곱해 기존 column-major P[3][3]·P[1][1] 값을 그대로 읽는다.
    offset = offset.mul(studioMToonNodeScreenScale(projection.mul(vec4(0, 0, 0, 1)).w,
      float(modelViewMatrix.mul(positionLocal).z.negate()), projection.mul(vec4(0, 1, 0, 0)).y));
  }
  return positionLocal.add(offset);
}

const sdkPosition = MToonNodeMaterial.prototype.setupPosition, sdkVariants = MToonNodeMaterial.prototype.setupVariants;
const basePosition = NodeMaterial.prototype.setupPosition;
const defaultCompile = NodeMaterial.prototype.onBeforeCompile, defaultRender = NodeMaterial.prototype.onBeforeRender;
const sdkCopy = MToonNodeMaterial.prototype.copy, sdkSetup = MToonNodeMaterial.prototype.setup;
const sdkVertex = MToonNodeMaterial.prototype.setupVertex, baseVertex = NodeMaterial.prototype.setupVertex;
const sdkNormal = MToonNodeMaterial.prototype.setupNormal;
const sdkCallbacks = ["setupDiffuseColor", "setupVariants", "setupLighting", "setupOutput", "update"]
  .map((name) => { const method: unknown = Reflect.get(MToonNodeMaterial.prototype, name); return { name, method }; });
/** SDK가 먼저 공유한 Texture를 기본 NodeMaterial.copy가 self-copy하지 않게 하는 호출 한정 facade다. */
function textureReferenceCopyTarget<Target extends MToonNodeMaterial>(target: Target): Target {
  return new Proxy(target, { get(material, property) {
    const value: unknown = Reflect.get(material, property, material);
    if (!(value instanceof Texture)) return value;
    return new Proxy(value, { get(texture, method) {
      if (method !== "copy") return Reflect.get(texture, method, texture);
      return (sourceTexture: Texture): Texture => {
        if (!(sourceTexture instanceof Texture) || !Reflect.set(material, property, sourceTexture, material)) {
          throw new Error("MToon 복사의 공유 텍스처 참조를 보존하지 못했습니다.");
        }
        return sourceTexture;
      };
    } });
  } });
}
function plainNodeInputs(material: MToonNodeMaterial): boolean {
  return Object.entries(material).every(([name, value]) => name.startsWith("_") || !name.endsWith("Node") || value == null);
}
function animatedNormal(material: MToonNodeMaterial) {
  const uv = nodeObject(new StudioMToonAnimatedUVNode(true));
  const normal = material.normalMap
    ? vector3Node(normalMap(vector4Node(materialReference("normalMap", "texture")).context({ getUV: () => uv }), vector2Node(materialReference("normalScale", "vec2")))) : materialNormal;
  return material.isOutline ? normal.negate() : normal;
}
function animatedMapInputs(material: MToonNodeMaterial) {
  const uv = nodeObject(new StudioMToonAnimatedUVNode(true));
  const sample = (name: string) => vector4Node(materialReference(name, "texture")).context({ getUV: () => uv });
  const color = colorReference("color"), emissive = colorReference("emissive").mul(scalarReference("emissiveIntensity"));
  const shade = colorReference("shadeColorFactor"), shift = scalarReference("shadingShiftFactor");
  return {
    colorNode: material.map ? color.mul(sample("map")) : color,
    normalNode: animatedNormal(material),
    emissiveNode: material.emissiveMap ? emissive.mul(sample("emissiveMap")) : emissive,
    shadeColorNode: material.shadeMultiplyTexture ? shade.mul(sample("shadeMultiplyTexture")) : shade,
    shadingShiftNode: material.shadingShiftTexture ? shift.add(sample("shadingShiftTexture").r.mul(scalarReference("shadingShiftTextureScale"))) : shift,
    rimMultiplyNode: material.rimMultiplyTexture ? sample("rimMultiplyTexture").rgb : vec3(1),
  };
}
/** source를 캡처한 node graph를 copy하지 않고 현재 렌더 대상의 materialReference를 매번 만든다. */
export class StudioMToonNodeMaterial extends MToonNodeMaterial {
  /** Three builder가 실제로 소비하는 flat-shading 상태를 copy에서도 보존한다. */
  flatShading = false;
  #building = 0;
  constructor(parameters: MToonNodeMaterialParameters = {}) {
    super({ ...parameters });
    this.registerRuntime();
  }
  private registerRuntime(): void {
    registerStudioMToonRuntimeMaterial(this, { backend: "webgpu", revision: STUDIO_MTOON_NODE_REVISION, validate: () =>
      this.setup === ownedMethods.setup && this.setupLightingModel === ownedMethods.lighting
      && this.setupPosition === ownedMethods.position && this.copy === ownedMethods.copy
      && this.setupVertex === ownedMethods.vertex && MToonNodeMaterial.prototype.setupVertex === sdkVertex
      && NodeMaterial.prototype.setupVertex === baseVertex
      && this.setupNormal === ownedMethods.normal && MToonNodeMaterial.prototype.setupNormal === sdkNormal
      && this.customProgramCacheKey === ownedMethods.cacheKey
      && this.setupVariants === sdkVariants && this.onBeforeCompile === defaultCompile && this.onBeforeRender === defaultRender
      && MToonNodeMaterial.prototype.setupPosition === sdkPosition && MToonNodeMaterial.prototype.copy === sdkCopy
      && MToonNodeMaterial.prototype.setup === sdkSetup
      && sdkCallbacks.every(({ name, method }) => Reflect.get(this, name) === method && Reflect.get(MToonNodeMaterial.prototype, name) === method)
      && NodeMaterial.prototype.setupPosition === basePosition && isStudioMToonAnimatedUvContractCurrent()
      && plainNodeInputs(this) && hasStudioMToonRuntimeFactors(this) });
  }
  override setup(builder: NodeBuilder): void {
    if (!readStudioMToonRuntimeIdentity(this)) throw new Error("MToon WebGPU 빌드 전 노드 계약이 바뀌었습니다.");
    const previous = { colorNode: this.colorNode, normalNode: this.normalNode, emissiveNode: this.emissiveNode,
      shadeColorNode: this.shadeColorNode, shadingShiftNode: this.shadingShiftNode, rimMultiplyNode: this.rimMultiplyNode };
    this.#building += 1;
    try {
      // SDK private UV 노드를 바꾸지 않고 공개 입력으로 본체·alpha·normal·간접광의 B mask를 함께 맞춘다.
      if (this.uvAnimationMaskTexture) Object.assign(this, animatedMapInputs(this));
      super.setup(builder);
    } finally { Object.assign(this, previous); this.#building -= 1; }
  }
  override setupLightingModel(): MToonLightingModel {
    if (!this.#building && !readStudioMToonRuntimeIdentity(this)) throw new Error("MToon WebGPU 노드 계약이 바뀌어 재질을 구성할 수 없습니다.");
    return new StudioMToonLightingModel(this);
  }
  override setupNormal(builder?: NodeBuilder): ReturnType<MToonNodeMaterial["setupNormal"]> {
    if (!this.#building && !readStudioMToonRuntimeIdentity(this)) throw new Error("MToon WebGPU 법선 노드 계약이 바뀌었습니다.");
    // Three는 이 callback을 setup의 finally 이후에도 평가하므로 임시 normalNode에 의존하지 않는다.
    return this.uvAnimationMaskTexture ? animatedNormal(this) : sdkNormal.call(this, builder);
  }
  override setupPosition(builder: NodeBuilder) {
    if (!this.#building && !readStudioMToonRuntimeIdentity(this)) throw new Error("MToon WebGPU 위치 노드 계약이 바뀌었습니다.");
    const previous = this.positionNode;
    try {
      if (this.isOutline && this.outlineWidthMode !== "none") this.positionNode = outlinePosition(this);
      // SDK의 outline 확장을 중복 적용하지 않고 공식 NodeMaterial의 morph/skin/position 처리를 사용한다.
      return basePosition.call(this, builder);
    } finally { this.positionNode = previous; }
  }
  override setupVertex(builder: NodeBuilder): ReturnType<MToonNodeMaterial["setupVertex"]> {
    if (!this.#building && !readStudioMToonRuntimeIdentity(this)) throw new Error("MToon WebGPU clip 노드 계약이 바뀌었습니다.");
    const clip = vector4Node(sdkVertex.call(this, builder));
    const bias = studioMToonNodeOutlineClipBias(builder.renderer.coordinateSystem, builder.renderer.reversedDepthBuffer, this.isOutline);
    // setupPosition의 local vec3가 아닌 최종 clip vec4에서만 먼 쪽으로 이동한다.
    return bias === 0 ? clip : clip.add(vec4(0, 0, clip.w.mul(bias), 0));
  }
  override copy(source: MToonNodeMaterial): this {
    if (source instanceof StudioMToonNodeMaterial && !readStudioMToonRuntimeIdentity(source)) throw new Error("변조된 MToon 노드 재질을 복제할 수 없습니다.");
    super.copy.call(textureReferenceCopyTarget(this), source);
    // Three r186 NodeMaterial.copy는 상속된 alphaTest setter와 내부 _alphaTest를 모두 생략한다.
    this.alphaTest = source.alphaTest;
    this.flatShading = "flatShading" in source && source.flatShading === true;
    this.uvAnimationScrollXOffset = source.uvAnimationScrollXOffset;
    this.uvAnimationScrollYOffset = source.uvAnimationScrollYOffset;
    this.uvAnimationRotationPhase = source.uvAnimationRotationPhase;
    this.registerRuntime(); return this;
  }
  override customProgramCacheKey(): string {
    const textures = [this.shadeMultiplyTexture, this.shadingShiftTexture, this.rimMultiplyTexture,
      this.matcapTexture, this.outlineWidthMultiplyTexture, this.uvAnimationMaskTexture].map((value) => value !== null ? 1 : 0).join("");
    return `${STUDIO_MTOON_NODE_REVISION}:${this.outlineWidthMode}:${textures}:${super.customProgramCacheKey()}`;
  }
}
const ownedMethods = Object.freeze({ setup: StudioMToonNodeMaterial.prototype.setup,
  lighting: StudioMToonNodeMaterial.prototype.setupLightingModel, normal: StudioMToonNodeMaterial.prototype.setupNormal,
  position: StudioMToonNodeMaterial.prototype.setupPosition,
  vertex: StudioMToonNodeMaterial.prototype.setupVertex,
  copy: StudioMToonNodeMaterial.prototype.copy, cacheKey: StudioMToonNodeMaterial.prototype.customProgramCacheKey });
