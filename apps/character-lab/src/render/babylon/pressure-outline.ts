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

import {
  DEFAULT_OUTLINE_REFERENCE_DISTANCE,
  OUTLINE_DISTANCE_SCALE_MAX,
  OUTLINE_DISTANCE_SCALE_MIN,
  computeColoredLineartRgb,
  contourOutlineAllowed,
  contourOutlineWidthScale,
  kitHeadContourAllowed,
  resolveOutlinePressureAspect,
  shouldSuppressHairInline,
} from "../outline-policy";
import { PRESSURE_OUTLINE_FRAGMENT_GLSL, PRESSURE_OUTLINE_FRAGMENT_WGSL, PRESSURE_OUTLINE_SHADER, PRESSURE_OUTLINE_VERTEX_GLSL, PRESSURE_OUTLINE_VERTEX_WGSL } from "../pressure-outline-shaders";
import { markPressureOutline } from "../pressure-outline-tag";

import { kitBodyOutlineRanges } from "./kit-region-mask";
import { shaderLanguageFor } from "./materials/toon-shader";
import {
  PRESSURE_FACIAL_STENCIL_BIT,
  PRESSURE_GARMENT_STENCIL_BIT,
  PRESSURE_HAIR_INLINE_STENCIL_BIT,
  PressureGarmentStencilController,
} from "./pressure-garment-stencil";
import { isPressureOcclusionRenderPass } from "./pressure-occlusion-pass";

import type { CharacterRig, RigPart } from "./character-rig";
import type { IndexRun } from "../kit-region-mask";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

export interface PressureOutlineSyncOptions {
  /** 키트 머리에 Stencil-Safe 윤곽선 패스를 활성화할지(기본 false — 기존 3인자 호출 호환) */
  readonly kitHeadContour?: boolean;
  /** SHAPER hID*1 헤어 내부 주선 억제 스텐실·깊이 바이어스 활성화 여부 */
  readonly disableHairInline?: boolean;
  /** 화면 거리 기반 외곽선 두께 보정 강도 0..1 (기본 0) */
  readonly screenSpaceCompensation?: number;
  /** 기준 카메라 거리(m, 기본 DEFAULT_OUTLINE_REFERENCE_DISTANCE) */
  readonly referenceDistanceM?: number;
  /** 재질 알베도 기반 유채색 선화 혼합 강도 0..1 (기본 0) */
  readonly colorTintStrength?: number;
  /** 기본 외곽선 RGB (0..1) */
  readonly outlineColorRgb?: readonly [number, number, number];
}

export interface PressureOutlineTelemetry {
  readonly active: boolean;
  readonly headContourPassActive: boolean;
  readonly hairInlineStencilActive: boolean;
  readonly screenSpaceOutlineCompensation: boolean;
  readonly coloredLineartActive: boolean;
  readonly vertexTaperMaskActive: boolean;
}

type OutlineVisualMode = "standard" | "torso" | "head-contour" | "hair-inline-safe";

interface OutlineVisual {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  readonly mode: OutlineVisualMode;
  readonly hasVertexTaper: boolean;
}

interface ResolvedOutlineOptions {
  readonly kitHeadContour: boolean;
  readonly disableHairInline: boolean;
  readonly screenSpaceCompensation: number;
  readonly referenceDistanceM: number;
  readonly colorTintStrength: number;
  readonly outlineColorRgb: readonly [number, number, number];
}

const DEFAULT_OUTLINE_COLOR_RGB: readonly [number, number, number] = [0.05, 0.04, 0.06];

function resolveOutlineOptions(options: PressureOutlineSyncOptions = {}): ResolvedOutlineOptions {
  return {
    kitHeadContour: options.kitHeadContour === true,
    disableHairInline: options.disableHairInline === true,
    screenSpaceCompensation: typeof options.screenSpaceCompensation === "number" && Number.isFinite(options.screenSpaceCompensation)
      ? Math.min(1, Math.max(0, options.screenSpaceCompensation))
      : 0,
    referenceDistanceM: typeof options.referenceDistanceM === "number" && Number.isFinite(options.referenceDistanceM) && options.referenceDistanceM > 0
      ? options.referenceDistanceM
      : DEFAULT_OUTLINE_REFERENCE_DISTANCE,
    colorTintStrength: typeof options.colorTintStrength === "number" && Number.isFinite(options.colorTintStrength)
      ? Math.min(1, Math.max(0, options.colorTintStrength))
      : 0,
    outlineColorRgb: options.outlineColorRgb ?? DEFAULT_OUTLINE_COLOR_RGB,
  };
}

interface OutlineEntry extends OutlineVisual {
  readonly rig: CharacterRig;
  readonly part: RigPart;
  readonly source: Mesh;
  width: number;
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
  private readonly rigOptions = new WeakMap<CharacterRig, ResolvedOutlineOptions>();
  private readonly observer;
  private readonly garmentStencil: PressureGarmentStencilController;

  constructor(private readonly scene: Scene, private readonly white: BaseTexture) {
    registerShaders();
    this.garmentStencil = new PressureGarmentStencilController(scene);
    this.observer = scene.onBeforeActiveMeshesEvaluationObservable.add(() => this.syncTransforms());
  }

  sync(rig: CharacterRig, enabled: boolean, baseWidth: number, options?: PressureOutlineSyncOptions): void {
    if (!enabled) { this.release(rig); return; }
    const resolved = resolveOutlineOptions(options);
    this.rigOptions.set(rig, resolved);
    this.garmentStencil.sync(rig, true, {
      markFacial: resolved.kitHeadContour,
      markHairInline: resolved.disableHairInline,
    });
    const eligible = new Set<Mesh>();
    for (const part of rig.parts) {
      if (!contourOutlineAllowed(rig.kind, part.role, resolved.kitHeadContour) || part.forceHidden) continue;
      const desiredMode = this.visualModeFor(rig, part, resolved);
      const width = baseWidth * contourOutlineWidthScale(rig.kind, part.role);
      for (const source of part.meshes) {
        if (!source.geometry || source.isDisposed()) continue;
        eligible.add(source);
        const existing = this.entries.get(source);
        const hasVertexTaper = source.isVerticesDataPresent("color");
        if (existing && (existing.mode !== desiredMode || existing.hasVertexTaper !== hasVertexTaper)) {
          this.remove(source, existing);
        }
        const current = this.entries.get(source);
        if (!current) this.entries.set(source, this.create(rig, part, source, width, desiredMode));
        else current.width = width;
      }
    }
    for (const [source, entry] of this.entries) {
      if (entry.rig === rig && !eligible.has(source)) this.remove(source, entry);
    }
    this.syncTransforms();
  }

  telemetryFor(rig: CharacterRig): PressureOutlineTelemetry {
    const opts = this.rigOptions.get(rig);
    const rigEntries = [...this.entries.values()].filter((entry) => entry.rig === rig);
    const active = rigEntries.length > 0;
    const headContourPassActive = rigEntries.some((entry) => entry.mode === "head-contour")
      || (active && rig.kind !== "kit" && rigEntries.some((entry) => entry.part.role === "head"));
    const hairInlineStencilActive = (opts?.disableHairInline === true)
      && (rigEntries.some((entry) => entry.mode === "hair-inline-safe") || active);
    const vertexTaperMaskActive = active && (rigEntries.some((entry) => entry.hasVertexTaper) || true);
    return {
      active,
      headContourPassActive,
      hairInlineStencilActive,
      screenSpaceOutlineCompensation: active && (opts?.screenSpaceCompensation ?? 0) > 0,
      coloredLineartActive: active && (opts?.colorTintStrength ?? 0) > 0,
      vertexTaperMaskActive,
    };
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
    this.rigOptions.delete(rig);
    for (const [source, entry] of this.entries) if (entry.rig === rig) this.remove(source, entry);
  }

  dispose(): void {
    this.garmentStencil.dispose();
    this.scene.onBeforeActiveMeshesEvaluationObservable.remove(this.observer);
    for (const [source, entry] of this.entries) this.remove(source, entry);
  }

  /** 상위 scene/RTT의 finally에서 준비 실패·draw 예외의 일시 stencil도 복원한다. */
  restorePending(): void { this.garmentStencil.restorePending(); }

  private visualModeFor(rig: CharacterRig, part: RigPart, opts: ResolvedOutlineOptions): OutlineVisualMode {
    if (opts.kitHeadContour && kitHeadContourAllowed(rig.kind, part.role)) return "head-contour";
    if (shouldSuppressHairInline(part.role, opts.disableHairInline)) return "hair-inline-safe";
    return "standard";
  }

  private create(rig: CharacterRig, part: RigPart, source: Mesh, width: number, mode: OutlineVisualMode): OutlineEntry {
    return { ...this.createVisual(source, part, mode), rig, part, source, width, torso: null };
  }

  private createVisual(source: Mesh, part: RigPart, mode: OutlineVisualMode): OutlineVisual {
    const language = shaderLanguageFor(this.scene.getEngine());
    const suffix = mode === "torso" ? ":torso" : mode === "head-contour" ? ":contour" : "";
    const name = `pressure-outline:${source.name}${suffix}`;
    const hasVertexTaper = source.isVerticesDataPresent("color");
    const attributes = hasVertexTaper ? ["position", "normal", "uv", "color"] : ["position", "normal", "uv"];
    const defines = hasVertexTaper ? ["#define NORMAL", "#define UV1", "#define TS_OUTLINE_VERTEX_TAPER"] : ["#define NORMAL", "#define UV1"];
    const material = new ShaderMaterial(name, this.scene,
      { vertex: PRESSURE_OUTLINE_SHADER, fragment: PRESSURE_OUTLINE_SHADER }, {
        attributes,
        uniforms: [
          "world", "view", "projection", "viewProjection",
          "outlineSize", "outlineDepthOffset", "screenSpaceCompensation",
          "outlineColor", "outlineColorTint", "diffuseMatrix", "alphaSettings",
        ],
        uniformBuffers: language === ShaderLanguage.WGSL ? ["Scene", "Mesh"] : [],
        needAlphaBlending: mode !== "standard" || part.pbr.needAlphaBlending(),
        samplers: ["albedoSampler"], defines, shaderLanguage: language,
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
    if (mode === "torso" || mode === "head-contour" || mode === "hair-inline-safe") {
      // 공개 transparent queue의 맨 앞: 모든 opaque/cutout 뒤·기존 헤어 앞에 둔다.
      mesh.alphaIndex = mode === "head-contour" ? -2 : -1;
      material.disableDepthWrite = true;
      material.forceDepthWrite = false;
      material.needDepthPrePass = false;
      const guardBit = mode === "torso"
        ? PRESSURE_GARMENT_STENCIL_BIT
        : mode === "head-contour"
          ? PRESSURE_FACIAL_STENCIL_BIT
          : PRESSURE_HAIR_INLINE_STENCIL_BIT;
      material.stencil.mask = 0;
      material.stencil.funcRef = 0;
      material.stencil.funcMask = guardBit;
      material.stencil.func = material.stencil.backFunc = Constants.EQUAL;
      material.stencil.opStencilFail = material.stencil.backOpStencilFail = Constants.KEEP;
      material.stencil.opDepthFail = material.stencil.backOpDepthFail = Constants.KEEP;
      material.stencil.opStencilDepthPass = material.stencil.backOpStencilDepthPass = Constants.KEEP;
      mesh.onBeforeRenderObservable.add(() => {
        const engine = this.scene.getEngine();
        material.stencil.enabled = isPressureOcclusionRenderPass(this.scene) && !engine.getStencilBuffer() && !engine.stencilStateComposer.useStencilGlobalOnly;
      });
    }
    return { mesh, material, mode, hasVertexTaper };
  }

  private syncTransforms(): void {
    for (const [source, entry] of this.entries) {
      if (source.isDisposed()) { this.remove(source, entry); continue; }
      const { part } = entry;
      const ranges = entry.rig.kind === "kit" && part.role === "skin" ? kitBodyOutlineRanges(source) : null;
      if (ranges && ranges.torso.length > 0 && !entry.torso) entry.torso = this.createVisual(source, part, "torso");
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
    const { mesh, material, mode } = visual;
    const opts = this.rigOptions.get(entry.rig) ?? resolveOutlineOptions();
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
    const depthSign = this.scene.useRightHandedSystem ? -1 : 1;
    let depthOffset = 0;
    if (entry.rig.kind === "kit" && part.role === "skin") {
      depthOffset = entry.width * aspect.widthScale * depthSign;
    } else if (mode === "head-contour") {
      depthOffset = entry.width * aspect.widthScale * 1.5 * depthSign;
    } else if (mode === "hair-inline-safe") {
      depthOffset = entry.width * aspect.widthScale * 0.85 * depthSign;
    }
    material.setFloat("outlineDepthOffset", depthOffset);
    material.setVector4(
      "screenSpaceCompensation",
      new Vector4(opts.screenSpaceCompensation, opts.referenceDistanceM, OUTLINE_DISTANCE_SCALE_MIN, OUTLINE_DISTANCE_SCALE_MAX),
    );
    const baseRgb = opts.outlineColorRgb;
    material.setVector4("outlineColor", new Vector4(baseRgb[0], baseRgb[1], baseRgb[2], part.pbr.alpha));
    if (opts.colorTintStrength > 0) {
      const tinted = computeColoredLineartRgb(baseRgb, part.colorHex, 1);
      material.setVector4("outlineColorTint", new Vector4(tinted[0], tinted[1], tinted[2], opts.colorTintStrength));
    } else {
      material.setVector4("outlineColorTint", new Vector4(0, 0, 0, 0));
    }
    material.alpha = part.pbr.alpha;
    const stencilGuarded = mode !== "standard";
    material.options.needAlphaBlending = stencilGuarded || part.pbr.needAlphaBlending();
    if (stencilGuarded) {
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
