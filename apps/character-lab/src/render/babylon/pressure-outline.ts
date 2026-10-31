/**
 * 비등방 역방향 hull의 수명 관리자. 원본 geometry·skeleton·morph를 공유하고 버퍼를 복제하지 않는다.
 * 자체 material/mesh만 소유한다. 원본 파츠 목록에 끼우지 않아 picking·paint·ID·그림자 입력과 구분한다.
 */
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore.js";
import { Material } from "@babylonjs/core/Materials/material.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Matrix, Vector2, Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh.js";

import { hullOutlineAllowed, hullOutlineWidthScale, resolveOutlinePressureAspect } from "../outline-policy";
import { PRESSURE_OUTLINE_FRAGMENT_GLSL, PRESSURE_OUTLINE_FRAGMENT_WGSL, PRESSURE_OUTLINE_SHADER, PRESSURE_OUTLINE_VERTEX_GLSL, PRESSURE_OUTLINE_VERTEX_WGSL } from "../pressure-outline-shaders";
import { markPressureOutline } from "../pressure-outline-tag";

import { kitBodyOutlineRanges } from "./kit-region-mask";
import { shaderLanguageFor } from "./materials/toon-shader";
import { PRESSURE_GARMENT_STENCIL_BIT, PressureGarmentStencilController } from "./pressure-garment-stencil";
import { isPressureOcclusionRenderPass } from "./pressure-occlusion-pass";

import type { CharacterRig, RigPart } from "./character-rig";
import type { IndexRun } from "../kit-region-mask";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

interface OutlineVisual {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
}

interface OutlineEntry extends OutlineVisual {
  readonly rig: CharacterRig;
  readonly part: RigPart;
  readonly source: Mesh;
  readonly width: number;
  torso: OutlineVisual | null;
}

function registerShaders(): void {
  ShaderStore.ShadersStore[`${PRESSURE_OUTLINE_SHADER}VertexShader`] = PRESSURE_OUTLINE_VERTEX_GLSL;
  ShaderStore.ShadersStore[`${PRESSURE_OUTLINE_SHADER}FragmentShader`] = PRESSURE_OUTLINE_FRAGMENT_GLSL;
  ShaderStore.ShadersStoreWGSL[`${PRESSURE_OUTLINE_SHADER}VertexShader`] = PRESSURE_OUTLINE_VERTEX_WGSL;
  ShaderStore.ShadersStoreWGSL[`${PRESSURE_OUTLINE_SHADER}FragmentShader`] = PRESSURE_OUTLINE_FRAGMENT_WGSL;
}

/** 엔진 하나당 하나. 임시 썸네일 리그도 release(rig)로 별도 해제한다. */
export class PressureOutlineController {
  private readonly entries = new Map<Mesh, OutlineEntry>();
  private readonly observer;
  private readonly garmentStencil: PressureGarmentStencilController;

  constructor(private readonly scene: Scene, private readonly white: BaseTexture) {
    registerShaders();
    this.garmentStencil = new PressureGarmentStencilController(scene);
    this.observer = scene.onBeforeActiveMeshesEvaluationObservable.add(() => this.syncTransforms());
  }

  sync(rig: CharacterRig, enabled: boolean, baseWidth: number): void {
    if (!enabled) { this.release(rig); return; }
    this.garmentStencil.sync(rig, true);
    const eligible = new Set<Mesh>();
    for (const part of rig.parts) {
      if (!hullOutlineAllowed(rig.kind, part.role) || part.forceHidden) continue;
      for (const source of part.meshes) {
        if (!source.geometry || source.isDisposed()) continue;
        eligible.add(source);
        if (!this.entries.has(source)) this.entries.set(source, this.create(rig, part, source, baseWidth));
      }
    }
    for (const [source, entry] of this.entries) {
      if (entry.rig === rig && !eligible.has(source)) this.remove(source, entry);
    }
    this.syncTransforms();
  }

  /** RTT의 lit 목록에만 쓴다. 비동기 컴파일 뒤 원본 가시성·변환을 다시 읽는다. */
  meshesFor(rig: CharacterRig): Mesh[] {
    this.syncTransforms();
    return [...this.entries.values()].filter((entry) => entry.rig === rig)
      .flatMap((entry) => entry.torso ? [entry.mesh, entry.torso.mesh] : [entry.mesh])
      .filter((mesh) => mesh.isVisible && mesh.isEnabled());
  }

  release(rig: CharacterRig): void {
    this.garmentStencil.release(rig);
    for (const [source, entry] of this.entries) if (entry.rig === rig) this.remove(source, entry);
  }

  dispose(): void {
    this.garmentStencil.dispose();
    this.scene.onBeforeActiveMeshesEvaluationObservable.remove(this.observer);
    for (const [source, entry] of this.entries) this.remove(source, entry);
  }

  /** 상위 scene/RTT의 finally에서 준비 실패·draw 예외의 일시 stencil도 복원한다. */
  restorePending(): void { this.garmentStencil.restorePending(); }

  private create(rig: CharacterRig, part: RigPart, source: Mesh, baseWidth: number): OutlineEntry {
    return { ...this.createVisual(source, part, false), rig, part, source,
      width: baseWidth * hullOutlineWidthScale(rig.kind, part.role), torso: null };
  }

  private createVisual(source: Mesh, part: RigPart, torso: boolean): OutlineVisual {
    const language = shaderLanguageFor(this.scene.getEngine());
    const name = `pressure-outline:${source.name}${torso ? ":torso" : ""}`;
    const material = new ShaderMaterial(name, this.scene,
      { vertex: PRESSURE_OUTLINE_SHADER, fragment: PRESSURE_OUTLINE_SHADER }, {
        attributes: ["position", "normal", "uv"],
        uniforms: ["world", "view", "projection", "viewProjection", "outlineSize", "outlineDepthOffset", "outlineColor", "diffuseMatrix", "alphaSettings"],
        uniformBuffers: language === ShaderLanguage.WGSL ? ["Scene", "Mesh"] : [],
        needAlphaBlending: part.pbr.needAlphaBlending(),
        samplers: ["albedoSampler"], defines: ["#define NORMAL", "#define UV1"], shaderLanguage: language,
      });
    material.backFaceCulling = true;
    material.cullBackFaces = false;
    const mesh = new Mesh(name, this.scene);
    source.geometry?.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.renderOutline = false;
    mesh.renderOverlay = false;
    mesh.receiveShadows = false;
    mesh.material = material;
    mesh.overrideMaterialSideOrientation = source.overrideMaterialSideOrientation;
    markPressureOutline(mesh, source);
    if (torso) {
      // 공개 transparent queue의 맨 앞: 모든 opaque/cutout 뒤·기존 헤어 앞에 둔다.
      mesh.alphaIndex = -1;
      material.disableDepthWrite = true;
      material.forceDepthWrite = false;
      material.needDepthPrePass = false;
      material.stencil.mask = 0;
      material.stencil.funcRef = 0;
      material.stencil.funcMask = PRESSURE_GARMENT_STENCIL_BIT;
      material.stencil.func = material.stencil.backFunc = Constants.EQUAL;
      material.stencil.opStencilFail = material.stencil.backOpStencilFail = Constants.KEEP;
      material.stencil.opDepthFail = material.stencil.backOpDepthFail = Constants.KEEP;
      material.stencil.opStencilDepthPass = material.stencil.backOpStencilDepthPass = Constants.KEEP;
      mesh.onBeforeRenderObservable.add(() => {
        const engine = this.scene.getEngine();
        material.stencil.enabled = isPressureOcclusionRenderPass(this.scene) && !engine.getStencilBuffer() && !engine.stencilStateComposer.useStencilGlobalOnly;
      });
    }
    return { mesh, material };
  }

  private syncTransforms(): void {
    for (const [source, entry] of this.entries) {
      if (source.isDisposed()) { this.remove(source, entry); continue; }
      const { part } = entry;
      const ranges = entry.rig.kind === "kit" && part.role === "skin" ? kitBodyOutlineRanges(source) : null;
      if (ranges && ranges.torso.length > 0 && !entry.torso) entry.torso = this.createVisual(source, part, true);
      if ((!ranges || ranges.torso.length === 0) && entry.torso) {
        this.disposeVisual(entry.torso);
        entry.torso = null;
      }
      const visuals = [{ visual: entry, runs: ranges?.other ?? [{ indexStart: 0, indexCount: source.getTotalIndices() }] },
        ...(entry.torso && ranges ? [{ visual: entry.torso, runs: ranges.torso }] : [])];
      for (const { visual, runs } of visuals) this.syncVisual(entry, visual, runs);
    }
  }

  private syncVisual(entry: OutlineEntry, visual: OutlineVisual, runs: readonly IndexRun[]): void {
    const { source, part } = entry;
    const { mesh, material } = visual;
    if (source.geometry && mesh.geometry !== source.geometry) source.geometry.applyToMesh(mesh);
    this.syncRanges(mesh, source, runs);
    mesh.parent = source.parent;
    mesh.position.copyFrom(source.position);
    mesh.scaling.copyFrom(source.scaling);
    mesh.rotation.copyFrom(source.rotation);
    mesh.rotationQuaternion = source.rotationQuaternion?.clone() ?? null;
    mesh.setPivotMatrix(source.getPivotMatrix(), source.isUsingPostMultiplyPivotMatrix());
    mesh.layerMask = source.layerMask;
    mesh.alwaysSelectAsActiveMesh = source.alwaysSelectAsActiveMesh;
    mesh.renderingGroupId = source.renderingGroupId;
    mesh.isVisible = runs.length > 0 && part.visible && !part.forceHidden && source.isVisible;
    mesh.visibility = source.visibility;
    mesh.setEnabled(source.isEnabled());
    mesh.skeleton = source.skeleton;
    mesh.numBoneInfluencers = source.numBoneInfluencers;
    mesh.computeBonesUsingShaders = source.computeBonesUsingShaders;
    mesh.morphTargetManager = source.morphTargetManager;
    mesh.computeWorldMatrix(true);
    const aspect = resolveOutlinePressureAspect(true);
    material.setVector3("outlineSize", new Vector3(entry.width * aspect.widthScale, entry.width * aspect.heightScale, entry.width));
    // 기존 후보의 clip-Z만 유지하고 이번 가림 정책에서 선의 폭·위치는 바꾸지 않는다.
    const depthOffset = entry.rig.kind === "kit" && part.role === "skin" ? entry.width * aspect.widthScale * (this.scene.useRightHandedSystem ? -1 : 1) : 0;
    material.setFloat("outlineDepthOffset", depthOffset);
    material.setVector4("outlineColor", new Vector4(0.05, 0.04, 0.06, part.pbr.alpha));
    material.alpha = part.pbr.alpha;
    const torso = visual === entry.torso;
    material.options.needAlphaBlending = torso || part.pbr.needAlphaBlending();
    if (torso) {
      // 불투명 fragment만 blending OFF. 텍스처·표면의 실제 부분 alpha는 기존 결합을 유지한다.
      material.alphaMode = part.pbr.alpha === 1 && source.visibility === 1 && !part.pbr.useAlphaFromAlbedoTexture
        ? Constants.ALPHA_DISABLE : Constants.ALPHA_COMBINE;
    }
    const albedo = part.pbr.albedoTexture;
    material.setTexture("albedoSampler", albedo ?? this.white);
    material.setMatrix("diffuseMatrix", albedo?.getTextureMatrix() ?? Matrix.Identity());
    material.setVector2("alphaSettings", new Vector2(part.pbr.transparencyMode === Material.MATERIAL_ALPHATEST ? part.pbr.alphaCutOff : 0, part.pbr.useAlphaFromAlbedoTexture ? 1 : 0));
  }

  private syncRanges(mesh: Mesh, source: Mesh, ranges: readonly IndexRun[]): void {
    if (mesh.subMeshes.length === ranges.length && mesh.subMeshes.every((sub, index) => {
      const run = ranges[index];
      return run && sub.indexStart === run.indexStart && sub.indexCount === run.indexCount;
    })) return;
    // geometry.setIndices가 공유 메시의 global SubMesh를 재생성해도 다음 동기화 때 다시 분할한다.
    mesh.releaseSubMeshes();
    for (const run of ranges) {
      const sub = new SubMesh(0, 0, source.getTotalVertices(), run.indexStart, run.indexCount, mesh, mesh, false);
      sub.setBoundingInfo(mesh.getBoundingInfo());
    }
  }

  private disposeVisual(visual: OutlineVisual): void {
    // morph setter와 Mesh.dispose가 공유 geometry의 정점 버퍼를 지우기 전에 proxy만 분리한다.
    visual.mesh.geometry?.releaseForMesh(visual.mesh, false);
    visual.mesh.morphTargetManager = null;
    visual.mesh.skeleton = null;
    visual.mesh.dispose(true, false);
    visual.material.dispose(true, false);
  }

  private remove(source: Mesh, entry: OutlineEntry): void {
    // 공유 morph·skeleton·geometry·텍스처는 소스가 소유한다.
    if (entry.torso) this.disposeVisual(entry.torso);
    this.disposeVisual(entry);
    this.entries.delete(source);
  }
}
