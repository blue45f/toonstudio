/**
 * 커스텀 ShaderMaterial(툰·밑색·법선·ID·깊이 패스). shader-sources.ts의 GLSL/WGSL 2벌을 ShaderStore에 등록하고
 * 엔진 언어(WebGPU=WGSL, 그 외=GLSL)에 맞춰 재질을 만든다. 스키닝·morph attribute는 ShaderMaterial이 자동 추가한다.
 * NodeMaterial 툰은 베타 토글(`node-toon-material.ts`)이며 기본 경로는 이 ShaderMaterial이다.
 */
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector.js";

import {
  CHARACTER_SHADER_ATTRIBUTES,
  CHARACTER_SHADER_BASE_UNIFORMS,
  CHARACTER_SHADER_DEFINES,
  CHARACTER_SHADER_SOURCES,
  CHARACTER_SHADER_UNIFORM_BUFFERS,
  CHARACTER_SHADER_VERTEX_COLOR_ATTRIBUTE,
  CHARACTER_SHADER_VERTEX_COLOR_DEFINE,
  CHARACTER_VERTEX_SHADER_NAME,
  DEPTH_UNIFORMS,
  FLAT_SAMPLERS,
  FLAT_UNIFORMS,
  FRAGMENT_SHADER_NAMES,
  ID_UNIFORMS,
  TOON_SAMPLERS,
  TOON_UNIFORMS,
} from "../../shader-sources";

import type { CharacterShaderKey } from "../../shader-sources";
import type { ToonParams } from "../../toon-reference";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

export type PassMaterialKind = Exclude<CharacterShaderKey, "vertex">;

let registered = false;

/** ShaderStore에 GLSL·WGSL 소스를 등록한다(멱등). */
export function registerCharacterShaders(): void {
  if (registered) return;
  const glsl = ShaderStore.ShadersStore;
  const wgsl = ShaderStore.ShadersStoreWGSL;
  glsl[`${CHARACTER_VERTEX_SHADER_NAME}VertexShader`] = CHARACTER_SHADER_SOURCES.vertex.glsl;
  wgsl[`${CHARACTER_VERTEX_SHADER_NAME}VertexShader`] = CHARACTER_SHADER_SOURCES.vertex.wgsl;
  for (const kind of Object.keys(FRAGMENT_SHADER_NAMES) as PassMaterialKind[]) {
    glsl[`${FRAGMENT_SHADER_NAMES[kind]}FragmentShader`] = CHARACTER_SHADER_SOURCES[kind].glsl;
    wgsl[`${FRAGMENT_SHADER_NAMES[kind]}FragmentShader`] = CHARACTER_SHADER_SOURCES[kind].wgsl;
  }
  registered = true;
}

export function shaderLanguageFor(engine: AbstractEngine): ShaderLanguage {
  return engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL;
}

export interface PassMaterialDeps {
  readonly scene: Scene;
  readonly language: ShaderLanguage;
}

function uniformsFor(kind: PassMaterialKind): string[] {
  switch (kind) {
    case "toon":
      return [...CHARACTER_SHADER_BASE_UNIFORMS, ...TOON_UNIFORMS];
    case "flat":
      return [...CHARACTER_SHADER_BASE_UNIFORMS, ...FLAT_UNIFORMS];
    case "id":
      return [...CHARACTER_SHADER_BASE_UNIFORMS, ...ID_UNIFORMS];
    case "depth":
      return [...CHARACTER_SHADER_BASE_UNIFORMS, ...DEPTH_UNIFORMS];
    case "normal":
    default:
      return [...CHARACTER_SHADER_BASE_UNIFORMS];
  }
}

function samplersFor(kind: PassMaterialKind): string[] {
  if (kind === "toon") return [...TOON_SAMPLERS];
  if (kind === "flat") return [...FLAT_SAMPLERS];
  return [];
}

export interface PassMaterialOptions {
  /**
   * 메시가 정점 색(`COLOR_0`) 버퍼를 가진다. true면 정점 셰이더가 `color` attribute를 읽어 툰·밑색 패스가 알베도에 곱한다.
   * 이 재질을 쓰는 **모든** 메시가 색 버퍼를 가질 때만 켠다(없는 메시에 attribute를 선언하면 0으로 읽혀 알베도가 검게 곱해진다).
   */
  readonly vertexColor?: boolean;
}

/** 재질 define 목록(정점 색 define은 옵션이 켰을 때만) */
export function passMaterialDefines(options: PassMaterialOptions = {}): string[] {
  return options.vertexColor === true ? [...CHARACTER_SHADER_DEFINES, CHARACTER_SHADER_VERTEX_COLOR_DEFINE] : [...CHARACTER_SHADER_DEFINES];
}

interface PassMaterialMetadata {
  readonly vertexColor: boolean;
  /** 마지막으로 넣은 알파 컷오프(점검용 사본) */
  alphaCutoff: number;
}

/** 패스 재질이 정점 색 define으로 만들어졌는지(점검·재생성 판단용) */
export function passMaterialUsesVertexColor(material: ShaderMaterial): boolean {
  const metadata = material.metadata as Partial<PassMaterialMetadata> | null;
  return metadata?.vertexColor === true;
}

/** 지금 재질에 들어 있는 알파 컷오프(0 = 끔) */
export function passMaterialAlphaCutoff(material: ShaderMaterial): number {
  const metadata = material.metadata as Partial<PassMaterialMetadata> | null;
  return metadata?.alphaCutoff ?? 0;
}

/**
 * 알베도 텍스처 알파 컷오프(glTF `alphaMode: MASK`의 `alphaCutoff`). 알파가 이 값보다 작은 텍셀은 그리지 않는다. 0이면 끈다.
 * 툰·밑색 패스 재질만 이 uniform을 가진다(법선·ID·깊이 패스는 텍스처를 읽지 않는다).
 */
export function setAlphaCutoff(material: ShaderMaterial, cutoff: number): void {
  const value = Number.isFinite(cutoff) && cutoff > 0 ? Math.min(1, cutoff) : 0;
  material.setVector4("alphaParams", new Vector4(value, 0, 0, 0));
  const metadata = material.metadata as PassMaterialMetadata | null;
  if (metadata) metadata.alphaCutoff = value;
}

/** 패스 재질을 만든다. 텍스처·uniform 값은 호출자가 채운다. */
export function createPassMaterial(deps: PassMaterialDeps, kind: PassMaterialKind, name: string, options: PassMaterialOptions = {}): ShaderMaterial {
  registerCharacterShaders();
  const material = new ShaderMaterial(
    name,
    deps.scene,
    { vertex: CHARACTER_VERTEX_SHADER_NAME, fragment: FRAGMENT_SHADER_NAMES[kind] },
    {
      attributes: options.vertexColor === true ? [...CHARACTER_SHADER_ATTRIBUTES, CHARACTER_SHADER_VERTEX_COLOR_ATTRIBUTE] : [...CHARACTER_SHADER_ATTRIBUTES],
      uniforms: uniformsFor(kind),
      uniformBuffers: deps.language === ShaderLanguage.WGSL ? [...CHARACTER_SHADER_UNIFORM_BUFFERS] : [],
      samplers: samplersFor(kind),
      defines: passMaterialDefines(options),
      needAlphaBlending: false,
      needAlphaTesting: false,
      shaderLanguage: deps.language,
    },
  );
  material.backFaceCulling = true;
  const metadata: PassMaterialMetadata = { vertexColor: options.vertexColor === true, alphaCutoff: 0 };
  material.metadata = metadata;
  return material;
}

/** 툰 uniform 값 = 순수 `ToonParams`(NodeMaterial 툰 그래프와 같은 의미를 공유한다). */
export type ToonUniformValues = ToonParams;

export function setToonUniforms(material: ShaderMaterial, values: ToonUniformValues): void {
  material.setColor3("baseColor", new Color3(...values.baseColor));
  material.setColor3("shadeTint", new Color3(...values.shadeTint));
  material.setColor3("lightColor", new Color3(...values.lightColor));
  material.setColor3("ambientColor", new Color3(...values.ambientColor));
  material.setVector3("toLight", new Vector3(...values.toLight));
  material.setColor3("rimColor", new Color3(...values.rimColor));
  material.setVector4("toonParams", new Vector4(values.rampSteps, values.rim ? 1 : 0, values.faceSdf ? 1 : 0, values.hasPaint ? 1 : 0));
  material.setVector4("faceParams", new Vector4(values.faceThreshold, values.flipU, values.sdfOffset, values.hasAlbedo ? 1 : 0));
}

export interface FlatUniformValues {
  readonly baseColor: readonly [number, number, number];
  readonly hasPaint: boolean;
  readonly hasAlbedo: boolean;
}

export function setFlatUniforms(material: ShaderMaterial, values: FlatUniformValues): void {
  material.setColor3("baseColor", new Color3(...values.baseColor));
  material.setVector4("toonParams", new Vector4(3, 0, 0, values.hasPaint ? 1 : 0));
  material.setVector4("faceParams", new Vector4(0, 0, 0, values.hasAlbedo ? 1 : 0));
}

/** ID 패스 색: contracts/passes.ts encodeIdPixel과 같은 인코딩을 0..1로 */
export function setIdUniform(material: ShaderMaterial, partId: number, materialId: number): void {
  material.setVector4("idColor", new Vector4((partId & 255) / 255, ((partId >> 8) & 255) / 255, (materialId & 255) / 255, 1));
}

export function setDepthUniform(material: ShaderMaterial, near: number, far: number): void {
  material.setVector4("depthRange", new Vector4(near, far, 0, 0));
}

export interface PassTextures {
  readonly albedo: BaseTexture;
  readonly paint: BaseTexture;
  readonly sdf: BaseTexture;
}

export function setToonTextures(material: ShaderMaterial, textures: PassTextures): void {
  material.setTexture("albedoSampler", textures.albedo);
  material.setTexture("paintSampler", textures.paint);
  material.setTexture("sdfSampler", textures.sdf);
}

export function setFlatTextures(material: ShaderMaterial, textures: Pick<PassTextures, "albedo" | "paint">): void {
  material.setTexture("albedoSampler", textures.albedo);
  material.setTexture("paintSampler", textures.paint);
}
