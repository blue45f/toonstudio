/**
 * 비등방 역방향 hull의 수명 관리자. 원본 geometry·skeleton·morph를 공유하고 버퍼를 복제하지 않는다.
 * 자체 material/mesh만 소유한다. 원본 파츠 목록에 끼우지 않아 picking·paint·ID·그림자 입력과 구분한다.
 */
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore.js";
import { Material } from "@babylonjs/core/Materials/material.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Matrix, Vector2, Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";

import { hullOutlineAllowed, hullOutlineWidthScale, resolveOutlinePressureAspect } from "../outline-policy";
import { PRESSURE_OUTLINE_FRAGMENT_GLSL, PRESSURE_OUTLINE_FRAGMENT_WGSL, PRESSURE_OUTLINE_SHADER, PRESSURE_OUTLINE_VERTEX_GLSL, PRESSURE_OUTLINE_VERTEX_WGSL } from "../pressure-outline-shaders";
import { markPressureOutline } from "../pressure-outline-tag";

import { shaderLanguageFor } from "./materials/toon-shader";

import type { CharacterRig, RigPart } from "./character-rig";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

interface OutlineEntry {
  readonly rig: CharacterRig;
  readonly part: RigPart;
  readonly source: Mesh;
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  readonly width: number;
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

  constructor(private readonly scene: Scene, private readonly white: BaseTexture) {
    registerShaders();
    this.observer = scene.onBeforeActiveMeshesEvaluationObservable.add(() => this.syncTransforms());
  }

  sync(rig: CharacterRig, enabled: boolean, baseWidth: number): void {
    if (!enabled) { this.release(rig); return; }
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
    return [...this.entries.values()].filter((entry) => entry.rig === rig && entry.mesh.isVisible && entry.mesh.isEnabled()).map((entry) => entry.mesh);
  }

  release(rig: CharacterRig): void {
    for (const [source, entry] of this.entries) if (entry.rig === rig) this.remove(source, entry);
  }

  dispose(): void {
    this.scene.onBeforeActiveMeshesEvaluationObservable.remove(this.observer);
    for (const [source, entry] of this.entries) this.remove(source, entry);
  }

  private create(rig: CharacterRig, part: RigPart, source: Mesh, baseWidth: number): OutlineEntry {
    const language = shaderLanguageFor(this.scene.getEngine());
    const material = new ShaderMaterial(`pressure-outline:${source.name}`, this.scene,
      { vertex: PRESSURE_OUTLINE_SHADER, fragment: PRESSURE_OUTLINE_SHADER }, {
        attributes: ["position", "normal", "uv"],
        uniforms: ["world", "view", "projection", "viewProjection", "outlineSize", "outlineDepthOffset", "outlineColor", "diffuseMatrix", "alphaSettings"],
        uniformBuffers: language === ShaderLanguage.WGSL ? ["Scene", "Mesh"] : [],
        needAlphaBlending: part.pbr.needAlphaBlending(),
        samplers: ["albedoSampler"], defines: ["#define NORMAL", "#define UV1"], shaderLanguage: language,
      });
    material.backFaceCulling = true;
    material.cullBackFaces = false;
    const mesh = new Mesh(`pressure-outline:${source.name}`, this.scene);
    source.geometry?.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.renderOutline = false;
    mesh.renderOverlay = false;
    mesh.receiveShadows = false;
    mesh.material = material;
    mesh.overrideMaterialSideOrientation = source.overrideMaterialSideOrientation;
    markPressureOutline(mesh, source);
    return { rig, part, source, mesh, material, width: baseWidth * hullOutlineWidthScale(rig.kind, part.role) };
  }

  private syncTransforms(): void {
    for (const [source, entry] of this.entries) {
      if (source.isDisposed()) { this.remove(source, entry); continue; }
      const { mesh, material, part } = entry;
      mesh.parent = source.parent;
      mesh.position.copyFrom(source.position);
      mesh.scaling.copyFrom(source.scaling);
      mesh.rotation.copyFrom(source.rotation);
      mesh.rotationQuaternion = source.rotationQuaternion?.clone() ?? null;
      mesh.setPivotMatrix(source.getPivotMatrix(), source.isUsingPostMultiplyPivotMatrix());
      mesh.layerMask = source.layerMask;
      mesh.alwaysSelectAsActiveMesh = source.alwaysSelectAsActiveMesh;
      mesh.renderingGroupId = source.renderingGroupId;
      mesh.isVisible = part.visible && !part.forceHidden && source.isVisible;
      mesh.visibility = source.visibility;
      mesh.setEnabled(source.isEnabled());
      mesh.skeleton = source.skeleton;
      mesh.numBoneInfluencers = source.numBoneInfluencers;
      mesh.computeBonesUsingShaders = source.computeBonesUsingShaders;
      mesh.morphTargetManager = source.morphTargetManager;
      mesh.computeWorldMatrix(true);
      const aspect = resolveOutlinePressureAspect(true);
      material.setVector3("outlineSize", new Vector3(entry.width * aspect.widthScale, entry.width * aspect.heightScale, entry.width));
      // 피부의 최대 확장 폭만큼 깊이를 뒤로 두되 화면상 선의 위치·굵기는 셰이더에서 보존한다.
      const depthOffset = entry.rig.kind === "kit" && part.role === "skin" ? entry.width * aspect.widthScale * (this.scene.useRightHandedSystem ? -1 : 1) : 0;
      material.setFloat("outlineDepthOffset", depthOffset);
      material.setVector4("outlineColor", new Vector4(0.05, 0.04, 0.06, part.pbr.alpha));
      material.alpha = part.pbr.alpha;
      material.options.needAlphaBlending = part.pbr.needAlphaBlending();
      const albedo = part.pbr.albedoTexture;
      material.setTexture("albedoSampler", albedo ?? this.white);
      material.setMatrix("diffuseMatrix", albedo?.getTextureMatrix() ?? Matrix.Identity());
      material.setVector2("alphaSettings", new Vector2(part.pbr.transparencyMode === Material.MATERIAL_ALPHATEST ? part.pbr.alphaCutOff : 0, part.pbr.useAlphaFromAlbedoTexture ? 1 : 0));
    }
  }

  private remove(source: Mesh, entry: OutlineEntry): void {
    // 공유 morph·skeleton·geometry·텍스처는 소스가 소유한다.
    entry.mesh.morphTargetManager = null;
    entry.mesh.skeleton = null;
    entry.mesh.dispose(true, false);
    entry.material.dispose(true, false);
    this.entries.delete(source);
  }
}
