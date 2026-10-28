/** PSD 전용 보조 RTT. 가시 기하·native hull·필압 hull의 소유권을 기록하고 원래 패스·재질은 보존한다. */
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";

import { failVisible } from "../../contracts";
import { toCapturedRaster } from "../../export/raster-convert";
import { HAIR_OWNERSHIP_FRAGMENT_GLSL, HAIR_OWNERSHIP_FRAGMENT_WGSL, HAIR_OWNERSHIP_SHADER } from "../hair-ownership-shaders";
import { pressureOutlineSource } from "../pressure-outline-tag";
import { RTT_READBACK_FLIP_Y, RTT_READBACK_PREMULTIPLIED } from "../readback";
import { CHARACTER_VERTEX_SHADER_NAME, TOON_FRAGMENT_SHADER_NAME } from "../shader-sources";

import { acquireCaptureTarget, readCaptureTarget } from "./capture-targets";
import { rigVisibleMeshes } from "./character-rig";

import type { CaptureDeps } from "./capture";
import type { CharacterRig, RigPart } from "./character-rig";
import type { HairLayerSupport, HairOwnership } from "../../contracts";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";

const hairPart = (part: RigPart): boolean => part.role === "hair" || part.role === "hair-accessory";
function classicToon(material: Material): material is ShaderMaterial {
  if (!(material instanceof ShaderMaterial) || typeof material.shaderPath !== "object") return false;
  return material.shaderPath.vertex === CHARACTER_VERTEX_SHADER_NAME && material.shaderPath.fragment === TOON_FRAGMENT_SHADER_NAME;
}
function sources(rig: CharacterRig) {
  return rig.parts.flatMap((part) => part.visible && !part.forceHidden ? [...part.meshes, ...part.outlineMeshes].filter((mesh) => mesh.isVisible && mesh.isEnabled()).map((mesh) => ({ part, mesh })) : []);
}
function opaqueVertexAlpha(mesh: Mesh): boolean {
  if (!mesh.hasVertexAlpha || !mesh.isVerticesDataPresent("color")) return true;
  const stride = mesh.getVertexBuffer("color")?.getSize() ?? 4;
  if (stride < 4) return true;
  const colors = mesh.getVerticesData("color");
  if (!colors) return false;
  // 프리플라이트마다 실제 데이터를 검사한다. 같은 geometry의 정점 데이터가 교체돼도 캐시가 남지 않는다.
  for (let i = 3; i < colors.length; i += stride) if (colors[i] !== 1) return false;
  return true;
}
export function hairLayerSupport(rig: CharacterRig | null): HairLayerSupport {
  if (!rig) return { status: "unavailable", reasonKo: "캐릭터가 준비된 뒤 헤어 분리를 사용할 수 있습니다." };
  for (const { part, mesh } of sources(rig)) {
    const material = mesh.material;
    if (!material) return { status: "unavailable", reasonKo: "재질이 없는 표면은 헤어 소유권을 확인할 수 없습니다." };
    const vertexOpaque = opaqueVertexAlpha(mesh);
    const implicitOpaqueBlend = mesh.hasVertexAlpha && vertexOpaque && mesh.visibility === 1 && material.alpha === 1 && !material.needAlphaBlending();
    if (material.transparencyMode === PBRMaterial.MATERIAL_ALPHABLEND || material.transparencyMode === PBRMaterial.MATERIAL_ALPHATESTANDBLEND || material.needAlphaBlendingForMesh(mesh) && !implicitOpaqueBlend || part.pbr.needAlphaBlending()) return { status: "unavailable", reasonKo: "겹친 반투명(BLEND) 표면의 헤어 분리는 지원하지 않습니다. 불투명·컷아웃 재질을 사용하거나 헤어 분리를 끄고 일반 PSD로 저장하세요." };
    if (part.pbr.alpha < 1) return { status: "unavailable", reasonKo: "재질 알파가 1 미만인 컷아웃의 헤어 분리는 아직 지원하지 않습니다. 일반 PSD로 저장할 수 있습니다." };
    if (!(material instanceof PBRMaterial) && !classicToon(material)) return { status: "unavailable", reasonKo: "헤어 분리는 기본 PBR·툰 재질에서 지원합니다. 베타 재질을 끄거나 일반 PSD로 저장하세요." };
    if (!vertexOpaque || mesh.bakedVertexAnimationManager?.isEnabled) return { status: "unavailable", reasonKo: "실제 반투명 정점 알파·베이크 정점 애니메이션의 헤어 분리는 아직 지원하지 않습니다. 일반 PSD를 사용할 수 있습니다." };
    if (material instanceof PBRMaterial && (material.opacityTexture || material.albedoTexture && material.albedoTexture.coordinatesIndex !== 0)) return { status: "unavailable", reasonKo: "별도 불투명도 맵·UV2 기반 컷아웃의 헤어 분리는 아직 지원하지 않습니다. 일반 PSD를 사용할 수 있습니다." };
    const scene = mesh.getScene();
    if (material.clipPlane || material.clipPlane2 || material.clipPlane3 || material.clipPlane4 || material.clipPlane5 || material.clipPlane6 || scene.clipPlane || scene.clipPlane2 || scene.clipPlane3 || scene.clipPlane4 || scene.clipPlane5 || scene.clipPlane6) return { status: "unavailable", reasonKo: "사용자 클리핑 평면의 헤어 분리는 아직 지원하지 않습니다. 일반 PSD를 사용할 수 있습니다." };
  }
  return { status: "available" };
}

function ownerMaterial(deps: CaptureDeps, part: RigPart, mesh: Mesh): ShaderMaterial {
  const original = mesh.material;
  if (!original) throw failVisible("capture-hair-material", "헤어 소유권을 기록할 원래 재질이 없습니다.", undefined, deps.now);
  const material = deps.passMaterials.flat(part).clone(`hair-owner:${mesh.name}`);
  material.shaderPath = { vertex: CHARACTER_VERTEX_SHADER_NAME, fragment: HAIR_OWNERSHIP_SHADER };
  material.options.uniforms.push("ownershipColor", "ownershipUVMatrix");
  material.setColor3("ownershipColor", hairPart(part) ? Color3.White() : Color3.Black());
  material.setMatrix("ownershipUVMatrix", original instanceof PBRMaterial && original.albedoTexture ? original.albedoTexture.getTextureMatrix() : Matrix.Identity());
  if (original instanceof PBRMaterial) {
    material.setVector4("alphaParams", new Vector4(original.needAlphaTestingForMesh(mesh) ? original.alphaCutOff : 0, 0, 0, 0));
    if (original.albedoTexture) material.setTexture("albedoSampler", original.albedoTexture);
  }
  // native hull은 원본과 같은 OutlineRenderer·알파 테스트 프로토콜을 사용한다(그 셰이더의 cutoff 0.4도 그대로다).
  material.options.needAlphaTesting = original.needAlphaTestingForMesh(mesh);
  material.options.needAlphaBlending = original.needAlphaBlendingForMesh(mesh);
  material.transparencyMode = original.transparencyMode;
  material.alphaMode = original.alphaMode;
  material.getAlphaTestTexture = () => original.getAlphaTestTexture();
  material.backFaceCulling = original.backFaceCulling;
  material.cullBackFaces = original.cullBackFaces;
  material.sideOrientation = original.sideOrientation;
  material.fillMode = original.fillMode;
  material.zOffset = original.zOffset;
  material.zOffsetUnits = original.zOffsetUnits;
  material.disableDepthWrite = original.disableDepthWrite;
  material.forceDepthWrite = original.forceDepthWrite;
  material.needDepthPrePass = original.needDepthPrePass;
  material.separateCullingPass = original.separateCullingPass;
  material.depthFunction = original.depthFunction;
  return material;
}

export interface PreparedHairOwnership { submit(): Promise<HairOwnership>; dispose(): void }
export async function prepareHairOwnership(deps: CaptureDeps, width: number, height: number, prepare: (rtt: RenderTargetTexture, pairs: ReadonlyArray<readonly [Mesh, Material]>) => Promise<void>): Promise<PreparedHairOwnership> {
  const support = hairLayerSupport(deps.rig);
  if (support.status === "unavailable") return { submit: () => Promise.resolve(support), dispose() {} };
  ShaderStore.ShadersStore[`${HAIR_OWNERSHIP_SHADER}FragmentShader`] = HAIR_OWNERSHIP_FRAGMENT_GLSL;
  ShaderStore.ShadersStoreWGSL[`${HAIR_OWNERSHIP_SHADER}FragmentShader`] = HAIR_OWNERSHIP_FRAGMENT_WGSL;
  const engine = deps.scene.getEngine();
  if (engine.isWebGPU) engine.flushFramebuffer();
  const samples = Math.max(1, Math.min(4, engine.getCaps().maxMSAASamples || 1));
  // lit 타깃과 동시에 보유해도 임시 타깃·renderPassId가 계속 늘지 않도록 별도 풀 슬롯을 쓴다.
  const lease = acquireCaptureTarget(deps.scene, "hair-ownership", width, height, samples, "ownership");
  const rtt = lease.rtt;
  const pairs: Array<readonly [Mesh, ShaderMaterial]> = [];
  const originals = new Map<Mesh, Material | null>();
  const restore: Array<() => void> = [];
  let disposed = false, submitted = false;
  const restoreColors = (): void => { while (restore.length) restore.pop()?.(); };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    restoreColors();
    for (const [mesh, material] of pairs) { rtt.setMaterialForRendering(mesh, undefined); material.dispose(false, false); }
    lease.release();
  };
  try {
    for (const { part, mesh } of sources(deps.rig)) {
      if (!deps.includeOutlines && part.outlineMeshes.includes(mesh)) continue;
      pairs.push([mesh, ownerMaterial(deps, part, mesh)]);
    }
    for (const mesh of deps.pressureOutlines?.() ?? []) {
      const originalSource = pressureOutlineSource(mesh);
      const part = deps.rig.parts.find((candidate) => candidate.meshes.some((source) => source === originalSource));
      if (!part || !(mesh.material instanceof ShaderMaterial)) throw failVisible("capture-hair-outline", "필압 외곽선의 원본 파츠를 확인할 수 없습니다.", undefined, deps.now);
      const material = mesh.material.clone(`hair-owner:${mesh.name}`);
      const color = hairPart(part) ? 1 : 0;
      material.setVector4("outlineColor", new Vector4(color, color, color, 1));
      pairs.push([mesh, material]);
    }
    for (const [mesh, material] of pairs) { originals.set(mesh, mesh.material); rtt.setMaterialForRendering(mesh, material); }
    rtt.activeCamera = deps.character.captureCamera;
    rtt.ignoreCameraViewport = true;
    rtt.clearColor = new Color4(0, 0, 0, 0);
    await prepare(rtt, pairs);
    return { dispose, async submit() {
      if (disposed || submitted) throw failVisible("capture-hair-submit", "헤어 소유권은 준비된 요청에서 한 번만 제출할 수 있습니다.", undefined, deps.now);
      submitted = true;
      try {
        let pending: ReturnType<typeof readCaptureTarget> = null;
        try {
          // 호출자는 lit readPixels로 실제 제출을 마친 직후, 같은 동기 구간에서 호출한다.
          for (const [mesh] of pairs) {
            if (mesh.isDisposed() || mesh.material !== originals.get(mesh)) throw failVisible("capture-hair-source-changed", "헤어 소유권 준비 중 소스·재질이 바뀌었습니다. 현재 상태에서 다시 저장하세요.", undefined, deps.now);
            const outline = mesh.outlineColor.clone(), overlay = mesh.overlayColor.clone(), edges = mesh.edgesColor.clone();
            const owner = deps.rig.parts.find((part) => part.meshes.includes(mesh) || part.outlineMeshes.includes(mesh));
            const color = owner && hairPart(owner) ? 1 : 0;
            restore.push(() => { mesh.outlineColor.copyFrom(outline); mesh.overlayColor.copyFrom(overlay); mesh.edgesColor.copyFrom(edges); });
            mesh.outlineColor.set(color, color, color); mesh.overlayColor.set(color, color, color); mesh.edgesColor.set(color, color, color, edges.a);
          }
          rtt.renderList = [...rigVisibleMeshes(deps.rig, { includeOutlines: deps.includeOutlines }), ...(deps.pressureOutlines?.() ?? [])];
          if (rtt.renderList.some((mesh) => !(mesh instanceof Mesh) || !originals.has(mesh))) throw failVisible("capture-hair-source-changed", "헤어 소유권 준비 중 가시 파츠가 바뀌었습니다. 현재 상태에서 다시 저장하세요.", undefined, deps.now);
          rtt.render(false, false);
          pending = readCaptureTarget(engine, rtt, width, height);
        } finally { restoreColors(); }
        const bytes = pending ? await pending : null;
        if (!(bytes instanceof Uint8Array || bytes instanceof Uint8ClampedArray)) return { status: "unavailable", reasonKo: "현재 엔진에서 실제 기하학적 소유권 readback을 얻지 못했습니다. 일반 PSD를 사용할 수 있습니다." };
        return { status: "available", raster: toCapturedRaster(bytes, width, height, { flipY: RTT_READBACK_FLIP_Y[deps.lane], premultiplied: RTT_READBACK_PREMULTIPLIED[deps.lane] }), samples, classification: "majority-visible-samples", limitationsKo: ["MSAA 공유 경계 픽셀은 가시 샘플의 과반 소유로 나누고 동률은 헤어에 귀속합니다. 혼합된 경계 색을 파츠별 원색으로 복원하지 않습니다."] };
      } finally { dispose(); }
    } };
  } catch (error) { dispose(); throw error; }
}
