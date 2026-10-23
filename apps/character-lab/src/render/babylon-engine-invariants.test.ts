/**
 * 엔진 본체 불변식(NullEngine 하네스): 툰 룩(파츠 ShaderMaterial uniform 값·hull/엣지 외곽선 폭과 색·공유 텍스처 규격), 패스 재질 캐시
 * (partId별 밑색·ID, 공용 법선·깊이)와 색·페인트 반영·해제, 장면 기능 보고, 키트 기본 로더(fetch), 셰이딩 프로파일 보관.
 *
 * 2026-10-23 R-0에서 `render/babylon/character-engine.ts`의 툰·재질·캡처 의존성·썸네일·기능 보고·보조 함수를 별도 모듈로 떼어 냈다.
 * 다른 시험이 값까지 보지 않던 거동을 여기서 고정해 그 추출이 동작을 바꾸지 않았음을 확인한다(추출 전 코드에서 먼저 녹색을 확인했다).
 * 셰이더 컴파일·픽셀·실제 GPU readback은 검증하지 못한다(브라우저 미검증, docs/parity/render.md).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FRAMING, DEFAULT_SHADING, LOOK_V2_IDENTITY, RENDER_PASS_IDS } from "../contracts";
import { hexToSrgb01 } from "../shared/color";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { FACE_SDF_SIZE } from "./babylon-character-engine";
import { faceSdfUniforms } from "./face-sdf";
import { toonShadeTint } from "./material-presets";
import { MOUTH_MASK_SIZE } from "./mouth-shade";
import { DEFAULT_SKY } from "./procedural-sky";
import { buildKitFixture } from "./testing/kit-glb-fixture";
import { createFakeIbl, createNullEngineHarness } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";
import { normalizeToonLighting } from "./toon-reference";

import type { ApplyPlan, CaptureRequest, LabFailure, PaintLayer, PartRole, PresetId, ShadingProfile, ThumbnailRequest } from "../contracts";
import type { NullEngineHarness, NullHarnessOptions } from "./testing/null-engine-harness";
import type { Scene } from "@babylonjs/core/scene.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  vi.unstubAllGlobals();
  while (cleanups.length > 0) cleanups.pop()?.();
});

interface Booted {
  readonly h: NullEngineHarness;
  readonly scene: Scene;
}

async function harnessWith(options: NullHarnessOptions = {}): Promise<Booted> {
  const h = await createNullEngineHarness({ now: () => 7_000, ...options });
  cleanups.push(() => h.dispose());
  const scene = h.nullEngine.scenes[0];
  if (!scene) throw new Error("장면이 없습니다.");
  return { h, scene };
}

async function bootProcedural(options: NullHarnessOptions = {}): Promise<Booted> {
  const booted = await harnessWith(options);
  await booted.h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
  return booted;
}

/** 엔진 통합 시험(babylon-kit-engine)과 같은 키트 파츠 구성 */
const KIT_PARTS: readonly PresetId[] = ["hair/soft-bob", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"];

function toonProfile(overrides: Partial<ShadingProfile["toon"]> = {}): ShadingProfile {
  return { ...DEFAULT_SHADING, mode: "toon", toon: { ...DEFAULT_SHADING.toon, ...overrides } };
}

function captureRequest(): CaptureRequest {
  return { width: 16, height: 16, passes: [...RENDER_PASS_IDS], transparentBackground: true, settleSteps: 0 };
}

function thumbnailRequest(overrides: Partial<ThumbnailRequest> = {}): ThumbnailRequest {
  return { presetId: "top/tee", plan: applyPlanFixture({ parts: [] }), size: 96, framing: DEFAULT_FRAMING, ...overrides };
}

function paintLayer(part: PartRole, revision: number): PaintLayer {
  return { part, width: 4, height: 4, rgba: new Uint8ClampedArray(4 * 4 * 4).fill(200), revision };
}

/** 지금 리그의 모든 파츠를 보이게 두고 레시피 색 하나만 바꾼 플랜(색은 플랜 파츠에만 적용된다) */
function planWithColor(h: NullEngineHarness, key: "top" | "hair", hex: string): ApplyPlan {
  const parts = partsOf(h).map((part) => ({ partId: part.partId, visible: true, materialPreset: part.materialPreset }));
  return applyPlanFixture({ parts, colors: { ...applyPlanFixture().colors, [key]: hex } });
}

function partsOf(h: NullEngineHarness) {
  const rig = h.engine.inspectRig();
  if (!rig) throw new Error("리그가 없습니다.");
  return rig.parts;
}

function partOf(h: NullEngineHarness, role: PartRole) {
  const part = partsOf(h).find((candidate) => candidate.role === role);
  if (!part) throw new Error(`역할 ${role} 파츠가 없습니다.`);
  return part;
}

function srgbOf(hex: string): readonly [number, number, number] {
  const rgb = hexToSrgb01(hex);
  if (!rgb) throw new Error(`hex가 아닙니다: ${hex}`);
  return rgb;
}

/** Babylon ShaderMaterial이 setColor3/setVector3/setVector4/setTexture로 받은 값(9.31.0 내부 필드, 시험 점검용) */
interface ShaderMaterialStore {
  readonly _colors3: Readonly<Record<string, { readonly r: number; readonly g: number; readonly b: number } | undefined>>;
  readonly _vectors3: Readonly<Record<string, { readonly x: number; readonly y: number; readonly z: number } | undefined>>;
  readonly _vectors4: Readonly<Record<string, { readonly x: number; readonly y: number; readonly z: number; readonly w: number } | undefined>>;
  readonly _textures: Readonly<Record<string, { readonly name: string } | undefined>>;
}

interface ShaderValues {
  color(key: string): readonly number[];
  vec3(key: string): readonly number[];
  vec4(key: string): readonly number[];
  texture(key: string): string | null;
  readonly vertexColor: boolean | undefined;
}

function materialNamed(scene: Scene, name: string) {
  return scene.materials.find((candidate) => candidate.name === name) ?? null;
}

function shaderValues(scene: Scene, name: string): ShaderValues {
  const material = materialNamed(scene, name);
  if (!material) throw new Error(`재질이 없습니다: ${name}`);
  const store = material as unknown as ShaderMaterialStore;
  const metadata = material.metadata as { readonly vertexColor?: boolean } | null;
  const required = <T>(value: T | undefined, key: string): T => {
    if (value === undefined) throw new Error(`${name}에 ${key} 값이 없습니다.`);
    return value;
  };
  return {
    color: (key) => {
      const value = required(store._colors3[key], key);
      return [value.r, value.g, value.b];
    },
    vec3: (key) => {
      const value = required(store._vectors3[key], key);
      return [value.x, value.y, value.z];
    },
    vec4: (key) => {
      const value = required(store._vectors4[key], key);
      return [value.x, value.y, value.z, value.w];
    },
    texture: (key) => store._textures[key]?.name ?? null,
    vertexColor: metadata?.vertexColor,
  };
}

function expectClose(actual: readonly number[], expected: readonly number[], label: string): void {
  expect(actual.length, label).toBe(expected.length);
  for (let index = 0; index < expected.length; index += 1) expect(actual[index], `${label}[${index}]`).toBeCloseTo(expected[index] ?? Number.NaN, 9);
}

/** 패스 재질(밑색·ID·법선·깊이) 이름, 정렬 */
function passMaterialNames(scene: Scene): string[] {
  return scene.materials
    .map((material) => material.name)
    .filter((name) => name.startsWith("flat:") || name.startsWith("id:") || name.startsWith("pass:"))
    .sort();
}

async function failureOf(promise: Promise<unknown>): Promise<LabFailure> {
  try {
    await promise;
  } catch (error) {
    const failure = error as Partial<LabFailure>;
    if (typeof failure.code === "string") return failure as LabFailure;
    throw error;
  }
  throw new Error("실패해야 하는 호출이 성공했습니다.");
}

describe("툰 룩: 파츠 재질 값(v2 항등)", () => {
  it("툰 ShaderMaterial uniform = 파츠 색·역할 그림자 틴트·림 색(LOOK_V2_IDENTITY)·정규화한 광원/환경·태양 방향·램프/림/얼굴 SDF/페인트·알베도 플래그", async () => {
    const { h, scene } = await bootProcedural({ createIbl: createFakeIbl });
    h.engine.setShading(toonProfile());
    // key 광원 강도 2.4(lightScale 1)·색 (1, 0.97, 0.92), fill 0.35, 가짜 IBL 평균색 0.2, 기본 IBL 켜짐·강도 1
    const ambientScale = (DEFAULT_SHADING.ibl.enabled ? DEFAULT_SHADING.ibl.intensity : 0) * 0.5 + 0.35 * 0.5;
    const lighting = normalizeToonLighting([1, 0.97, 0.92], [0.2 * ambientScale, 0.2 * ambientScale, 0.2 * ambientScale]);
    // rest 포즈의 머리 축은 forward +Z, right +X
    const face = faceSdfUniforms([0, 0, 1], [1, 0, 0], DEFAULT_SKY.sunDirection);
    const parts = partsOf(h);
    expect(parts.map((part) => part.role)).toEqual(["head", "skin", "hair", "top"]);
    for (const part of parts) {
      const values = shaderValues(scene, `toon:${part.id}`);
      const head = part.role === "head";
      expectClose(values.color("baseColor"), srgbOf(part.colorHex), `${part.id} baseColor`);
      expectClose(values.color("shadeTint"), toonShadeTint(part.role), `${part.id} shadeTint`);
      expectClose(values.color("rimColor"), LOOK_V2_IDENTITY.rim.color, `${part.id} rimColor`);
      expectClose(values.color("lightColor"), lighting.light, `${part.id} lightColor`);
      expectClose(values.color("ambientColor"), lighting.ambient, `${part.id} ambientColor`);
      expectClose(values.vec3("toLight"), DEFAULT_SKY.sunDirection, `${part.id} toLight`);
      // (램프 단계, 림, 얼굴 SDF = 절차 머리만, 페인트 없음)
      expectClose(values.vec4("toonParams"), [DEFAULT_SHADING.toon.rampSteps, 1, head ? 1 : 0, 0], `${part.id} toonParams`);
      // (얼굴 임계, U 뒤집기, SDF 오프셋 0, 알베도 = 입 안 마스크를 쓰는 머리만)
      expectClose(values.vec4("faceParams"), [face.threshold, face.flipU, 0, head ? 1 : 0], `${part.id} faceParams`);
      expect(values.texture("albedoSampler"), part.id).toBe(head ? "default:mouth-mask" : "default:white");
      expect(values.texture("paintSampler"), part.id).toBe("default:clear");
      expect(values.texture("sdfSampler"), part.id).toBe("default:face-sdf");
      expect(values.vec4("alphaParams")[0], part.id).toBe(0);
    }
  });

  it("램프·림·얼굴 SDF 토글과 플랜 색 변경이 같은 툰 재질의 uniform에 반영된다(재질 교체 없음)", async () => {
    const { h, scene } = await bootProcedural();
    h.engine.setShading(toonProfile({ rampSteps: 2, rim: false, faceSdfShadow: false }));
    const before = materialNamed(scene, "toon:top");
    expectClose(shaderValues(scene, "toon:head").vec4("toonParams"), [2, 0, 0, 0], "head toonParams");
    h.engine.applyPlan(planWithColor(h, "top", "#123456"));
    expect(materialNamed(scene, "toon:top")).toBe(before);
    expectClose(shaderValues(scene, "toon:top").color("baseColor"), srgbOf("#123456"), "top baseColor");
  });

  it("툰 hull 외곽선은 모든 절차 파츠 메시에 폭 4 mm·색 (0.05, 0.04, 0.06)(v2 항등), 엣지는 폭 1.5·cos 0.95·같은 색, PBR로 돌아가면 둘 다 끈다", async () => {
    const { h, scene } = await bootProcedural();
    const meshes = partsOf(h).flatMap((part) => part.meshNames.map((name) => scene.getMeshByName(name)));
    expect(meshes.length).toBeGreaterThan(0);
    h.engine.setShading(toonProfile());
    for (const mesh of meshes) {
      expect(mesh?.renderOutline, mesh?.name).toBe(true);
      expect(mesh?.outlineWidth, mesh?.name).toBeCloseTo(LOOK_V2_IDENTITY.line.widthMm / 1000, 12);
      expect(mesh ? [mesh.outlineColor.r, mesh.outlineColor.g, mesh.outlineColor.b] : null, mesh?.name).toEqual(LOOK_V2_IDENTITY.line.color.mode === "fixed" ? [...LOOK_V2_IDENTITY.line.color.rgb] : null);
      expect(mesh?.edgesRenderer ?? null, mesh?.name).toBeNull();
    }
    h.engine.setShading(toonProfile({ outline: "edge" }));
    for (const mesh of meshes) {
      expect(mesh?.renderOutline, mesh?.name).toBe(false);
      const edges = mesh?.edgesRenderer as unknown as { readonly _epsilon: number } | null | undefined;
      expect(edges?._epsilon, mesh?.name).toBe(0.95);
      expect(mesh?.edgesWidth, mesh?.name).toBe(1.5);
      expect(mesh ? [mesh.edgesColor.r, mesh.edgesColor.g, mesh.edgesColor.b, mesh.edgesColor.a] : null, mesh?.name).toEqual([0.05, 0.04, 0.06, 1]);
    }
    h.engine.setShading(DEFAULT_SHADING);
    for (const mesh of meshes) {
      expect(mesh?.renderOutline, mesh?.name).toBe(false);
      expect(mesh?.edgesRenderer ?? null, mesh?.name).toBeNull();
      expect(mesh?.material?.getClassName(), mesh?.name).toBe("PBRMaterial");
    }
  });

  it("공유 텍스처(white·clear 1×1 nearest, 얼굴 SDF·입 안 마스크 bilinear·clamp)는 엔진마다 한 벌이고 소스를 바꿔도 그대로다", async () => {
    const { h, scene } = await bootProcedural();
    const spec = (name: string) => {
      const found = scene.textures.filter((texture) => texture.name === name);
      expect(found, name).toHaveLength(1);
      const texture = found[0];
      return texture ? { size: texture.getSize(), sampling: texture.samplingMode, wrap: [texture.wrapU, texture.wrapV] } : null;
    };
    const before = { white: spec("default:white"), clear: spec("default:clear"), sdf: spec("default:face-sdf"), mouth: spec("default:mouth-mask") };
    expect(before.white?.size).toEqual({ width: 1, height: 1 });
    expect(before.clear?.size).toEqual({ width: 1, height: 1 });
    expect(before.sdf?.size).toEqual({ width: FACE_SDF_SIZE, height: FACE_SDF_SIZE });
    expect(before.mouth?.size).toEqual({ width: MOUTH_MASK_SIZE, height: MOUTH_MASK_SIZE });
    // Babylon 상수: NEAREST_SAMPLINGMODE = 1, BILINEAR_SAMPLINGMODE = 2, CLAMP_ADDRESSMODE = 0
    expect([before.white?.sampling, before.clear?.sampling, before.sdf?.sampling, before.mouth?.sampling]).toEqual([1, 1, 2, 2]);
    expect(before.sdf?.wrap).toEqual([0, 0]);
    expect(before.mouth?.wrap).toEqual([0, 0]);
    h.engine.setShading(toonProfile());
    await h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    expect({ white: spec("default:white"), clear: spec("default:clear"), sdf: spec("default:face-sdf"), mouth: spec("default:mouth-mask") }).toEqual(before);
  });

  it("setShading으로 넘긴 프로파일 객체를 그대로 보관하고(currentShading) HUD가 같은 모드를 읽는다", async () => {
    const { h } = await bootProcedural();
    expect(h.engine.currentShading()).toBe(DEFAULT_SHADING);
    const profile = toonProfile({ outline: "none" });
    h.engine.setShading(profile);
    expect(h.engine.currentShading()).toBe(profile);
    expect(h.engine.readHud().shadingMode).toBe("toon");
  });
});

describe("패스 재질 캐시(캡처)", () => {
  it("밑색·ID 재질은 파츠마다 한 번 만들어 다시 쓰고 법선·깊이는 공용 하나다 — 값은 파츠 색·partId·materialId·캡처 카메라 near/far", async () => {
    const { h, scene } = await bootProcedural();
    expect(passMaterialNames(scene)).toEqual([]);
    await h.engine.renderPasses(captureRequest());
    const parts = partsOf(h);
    expect(passMaterialNames(scene)).toEqual([...parts.map((part) => `flat:${part.id}`), ...parts.map((part) => `id:${part.id}`), "pass:depth", "pass:normal"].sort());
    const count = scene.materials.length;
    const flatTop = materialNamed(scene, "flat:top");
    await h.engine.renderPasses(captureRequest());
    expect(scene.materials.length).toBe(count);
    expect(materialNamed(scene, "flat:top")).toBe(flatTop);
    for (const part of parts) {
      const flat = shaderValues(scene, `flat:${part.id}`);
      const head = part.role === "head";
      expectClose(flat.color("baseColor"), srgbOf(part.colorHex), `flat:${part.id} baseColor`);
      expectClose(flat.vec4("toonParams"), [3, 0, 0, 0], `flat:${part.id} toonParams`);
      expectClose(flat.vec4("faceParams"), [0, 0, 0, head ? 1 : 0], `flat:${part.id} faceParams`);
      expect(flat.vec4("alphaParams")[0], part.id).toBe(0);
      expect(flat.texture("albedoSampler"), part.id).toBe(head ? "default:mouth-mask" : "default:white");
      expect(flat.texture("paintSampler"), part.id).toBe("default:clear");
      expect(flat.vertexColor, part.id).toBe(false);
      expectClose(shaderValues(scene, `id:${part.id}`).vec4("idColor"), [(part.partId & 255) / 255, ((part.partId >> 8) & 255) / 255, (part.materialId & 255) / 255, 1], `id:${part.id}`);
    }
    // 캡처 카메라 near 0.05 · far 50(scene-builder CAMERA_NEAR·CAMERA_FAR)
    expectClose(shaderValues(scene, "pass:depth").vec4("depthRange"), [0.05, 50, 0, 0], "pass:depth");
  });

  it("주 리그의 색·페인트 변경은 캐시된 밑색 재질에 반영되고, 페인트 플래그는 다음 캡처에서 다시 채운다", async () => {
    const { h, scene } = await bootProcedural();
    await h.engine.renderPasses(captureRequest());
    h.engine.applyPlan(planWithColor(h, "top", "#123456"));
    expectClose(shaderValues(scene, "flat:top").color("baseColor"), srgbOf("#123456"), "flat:top baseColor");
    h.engine.updatePaintTexture(paintLayer("top", 1));
    expect(shaderValues(scene, "flat:top").texture("paintSampler")).toBe("paint:top");
    expect(shaderValues(scene, "flat:top").texture("albedoSampler")).toBe("default:white");
    expect(shaderValues(scene, "flat:top").vec4("toonParams")[3]).toBe(0);
    await h.engine.renderPasses(captureRequest());
    expect(shaderValues(scene, "flat:top").vec4("toonParams")[3]).toBe(1);
    expect(shaderValues(scene, "flat:hair").texture("paintSampler")).toBe("default:clear");
  });

  it("툰 모드의 페인트 업로드는 툰 재질의 페인트 텍스처·플래그도 바꾼다", async () => {
    const { h, scene } = await bootProcedural();
    h.engine.setShading(toonProfile());
    h.engine.updatePaintTexture(paintLayer("top", 1));
    const top = shaderValues(scene, "toon:top");
    expect(top.texture("paintSampler")).toBe("paint:top");
    expect(top.vec4("toonParams")[3]).toBe(1);
    expect(shaderValues(scene, "toon:hair").vec4("toonParams")[3]).toBe(0);
  });

  it("현재 리그 썸네일은 캐시된 밑색 색을 일시 적용 뒤 되돌리고, 임시 리그 썸네일(같은 partId)은 주 리그 캐시를 건드리지 않는다", async () => {
    const { h, scene } = await bootProcedural();
    h.engine.applyPlan(planWithColor(h, "top", "#123456"));
    await h.engine.renderPasses(captureRequest());
    const names = passMaterialNames(scene);
    await h.engine.renderThumbnail(thumbnailRequest({ plan: planWithColor(h, "top", "#abcdef") }));
    expectClose(shaderValues(scene, "flat:top").color("baseColor"), srgbOf("#123456"), "현재 리그 썸네일 뒤");
    await h.engine.renderThumbnail(thumbnailRequest({ plan: planWithColor(h, "top", "#abcdef"), source: { kind: "procedural", model: createProceduralFixture() } }));
    expectClose(shaderValues(scene, "flat:top").color("baseColor"), srgbOf("#123456"), "임시 리그 썸네일 뒤");
    expect(passMaterialNames(scene)).toEqual(names);
  });

  it("리그를 내리면(소스 재로드) 파츠별 밑색·ID 재질을 해제하고 공용 법선·깊이는 남기며, 다음 캡처가 다시 만든다", async () => {
    const { h, scene } = await bootProcedural();
    await h.engine.renderPasses(captureRequest());
    const normal = materialNamed(scene, "pass:normal");
    await h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    expect(passMaterialNames(scene)).toEqual(["pass:depth", "pass:normal"]);
    expect(materialNamed(scene, "pass:normal")).toBe(normal);
    await h.engine.renderPasses(captureRequest());
    expect(passMaterialNames(scene)).toHaveLength(partsOf(h).length * 2 + 2);
  });

  it("키트 증분 교체는 바뀐 파츠의 패스 재질만 버리고 다음 캡처에서 새 파츠(정점 색 define)에 맞게 다시 만든다", async () => {
    const store = new Map<string, Uint8Array>();
    const { h, scene } = await harnessWith({
      now: () => 9_000,
      fetchBytes: async (url) => {
        const bytes = store.get(url);
        if (!bytes) throw new Error(`fixture에 없는 URL: ${url}`);
        return bytes;
      },
    });
    const first = await buildKitFixture({ partIds: KIT_PARTS });
    const next = await buildKitFixture({
      partIds: ["hair/short-layered", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"],
      tweaks: {
        "hair/short-layered": (spec) => ({ ...spec, meshes: spec.meshes.map((mesh) => ({ ...mesh, primitives: mesh.primitives.map(({ vertexColor: _removed, ...rest }) => rest) })) }),
      },
    });
    for (const fixture of [first, next]) for (const [url, bytes] of fixture.files) if (!store.has(url)) store.set(url, bytes);
    await h.engine.loadSource({ kind: "kit", plan: first.plan });
    await h.engine.renderPasses(captureRequest());
    const hair = partOf(h, "hair");
    const top = partOf(h, "top");
    // 키트 파츠 id는 역할 이름이라 교체 전후 재질 이름이 같다 — 인스턴스로 구분한다.
    const oldHairFlat = materialNamed(scene, `flat:${hair.id}`);
    expect(shaderValues(scene, `flat:${hair.id}`).vertexColor).toBe(true);
    const topFlat = materialNamed(scene, `flat:${top.id}`);
    const topId = materialNamed(scene, `id:${top.id}`);
    expect(topFlat).not.toBeNull();
    await h.engine.loadSource({ kind: "kit", plan: next.plan });
    expect(partOf(h, "hair").meshNames).toEqual(["TS_AuthoredHair_short-layered_LOD0"]);
    expect(partOf(h, "hair").partId).toBe(hair.partId);
    expect(materialNamed(scene, `flat:${hair.id}`)).toBeNull();
    expect(materialNamed(scene, `id:${hair.id}`)).toBeNull();
    expect(oldHairFlat !== null && scene.materials.includes(oldHairFlat)).toBe(false);
    expect(materialNamed(scene, `flat:${top.id}`)).toBe(topFlat);
    expect(materialNamed(scene, `id:${top.id}`)).toBe(topId);
    await h.engine.renderPasses(captureRequest());
    expect(materialNamed(scene, `flat:${hair.id}`)).not.toBe(oldHairFlat);
    expect(shaderValues(scene, `flat:${hair.id}`).vertexColor).toBe(false);
    expect(passMaterialNames(scene)).toHaveLength(partsOf(h).length * 2 + 2);
  });
});

describe("장면 기능 보고", () => {
  it("보고 키 집합·IBL 끔 사유·GLB sparse 정리 보고(내보내기 전·후)", async () => {
    const { h } = await bootProcedural();
    const features = h.engine.sceneFeatures();
    expect(Object.keys(features).sort()).toEqual(
      [
        "boneTextureMode",
        "cascadedShadows",
        "glbMorphSparse",
        "gpuTimer",
        "iblShadows",
        "imageBasedLighting",
        "jointOffsets",
        "morphTextureMode",
        "msaa",
        "nodeMaterialToon",
        "openPbr",
        "ssao",
        "subsurfaceScattering",
        "taa",
        "uvProjectionPaint",
      ].sort(),
    );
    expect(features.glbMorphSparse).toEqual({ status: "active", detail: "내보낼 때마다 변경량 0 정점의 morph를 sparse accessor로 정리합니다(아직 내보내지 않음)." });
    expect(features.jointOffsets).toEqual({ status: "off", reasonKo: "이 소스는 관절 오프셋을 주지 않아 morph만 정점에 반영됩니다." });
    h.engine.setShading({ ...DEFAULT_SHADING, ibl: { enabled: false, intensity: 1 } });
    expect(h.engine.sceneFeatures().imageBasedLighting).toEqual({ status: "off", reasonKo: "프로파일에서 IBL을 껐습니다." });
    await h.engine.exportGlb();
    const after = h.engine.sceneFeatures().glbMorphSparse;
    expect(after.detail ?? after.reasonKo).toMatch(/^마지막 내보내기: /u);
  });

  it("소스가 없으면 리그 의존 항목은 꺼짐과 사유다", async () => {
    const { h } = await harnessWith();
    const features = h.engine.sceneFeatures();
    expect(features.boneTextureMode).toEqual({ status: "off", reasonKo: "소스가 없습니다." });
    expect(features.jointOffsets).toEqual({ status: "off", reasonKo: "소스가 없습니다." });
  });
});

describe("키트 기본 로더(fetch)", () => {
  it("HTTP 오류는 키트 로더가 kit-file-fetch-failed로 감싸고 상태 코드를 원인으로 남긴다", async () => {
    vi.stubGlobal("fetch", async () => new Response("없음", { status: 404 }));
    const fixture = await buildKitFixture({ partIds: KIT_PARTS });
    const { h } = await harnessWith({ now: () => 9_000 });
    const failure = await failureOf(h.engine.loadSource({ kind: "kit", plan: fixture.plan }));
    expect(failure.code).toBe("kit-file-fetch-failed");
    expect(failure.detail).toContain("HTTP 404");
  });

  it("주입 로더가 없으면 fetch로 받은 바이트로 키트를 올린다", async () => {
    const fixture = await buildKitFixture({ partIds: KIT_PARTS });
    const requested: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      requested.push(url);
      const bytes = fixture.files.get(url);
      return bytes ? new Response(new Uint8Array(bytes)) : new Response("없음", { status: 404 });
    });
    const { h } = await harnessWith({ now: () => 9_000 });
    await h.engine.loadSource({ kind: "kit", plan: fixture.plan });
    expect(h.engine.inspectRig()?.kind).toBe("kit");
    expect([...requested].sort()).toEqual([...fixture.files.keys()].sort());
  });
});
