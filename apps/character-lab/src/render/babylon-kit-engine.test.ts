/**
 * 키트 소스 × 엔진 통합(KT-04) — NullEngine 하네스 + 합성 키트 GLB(`render/testing/kit-glb-fixture.ts`).
 * 로더 자체(재바인딩·실패 코드)는 `babylon-kit-load.test.ts`가 확인하고, 여기서는 엔진이 키트 리그를 다루는 방식을 확인한다:
 * 소스 로드와 `rig.kind: "kit"`, 틴트(recolor/fixed), 툰 hull 외곽선 정책(A-5·A-9), 얼굴 SDF 끔, 정점 색(AO) define, 증분 교체와 정리,
 * `alwaysSelectAsActiveMesh` 유지, 숨긴 삼각형의 pick, 지오메트리 썸네일(임시 리그).
 * 셰이더 컴파일·GPU 렌더·실제 텍스처 디코드는 NullEngine이 검증하지 못한다(브라우저 미검증).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_FRAMING, DEFAULT_SHADING, KIT_HIDEABLE_REGION_IDS, KIT_REQUIRED_PRESETS, rolePartId } from "../contracts";
import { hexToSrgb01 } from "../shared/color";
import { GLB_CHUNK_BIN, GLB_CHUNK_JSON, GLB_MAGIC, GLB_VERSION, parseGlb } from "../testing/minimal-glb";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { KIT_OUTLINE_EXEMPT_ROLES } from "./outline-policy";
import { buildKitFixture, fixtureUrl } from "./testing/kit-glb-fixture";
import { createNullEngineHarness } from "./testing/null-engine-harness";
import { createPackagePlanFixture } from "./testing/package-plan-fixture";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { ApplyPlan, KitBaseId, LabFailure, PartRole, PresetId, ShadingProfile, Vec3 } from "../contracts";
import type { KitFixture, KitFixtureOptions } from "./testing/kit-glb-fixture";
import type { NullEngineHarness } from "./testing/null-engine-harness";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";

const REQUIRED: readonly PresetId[] = KIT_REQUIRED_PRESETS;
/** 합성 키트의 고정색 틴트(fixture가 fixed 재질에 넣는 값) */
const FIXED_HEX = "#f2f2f4";

interface KitEnv {
  readonly h: NullEngineHarness;
  readonly scene: Scene;
  /** url → 바이트(테스트가 바꿔 손상 경로를 만든다) */
  readonly store: Map<string, Uint8Array>;
  /** `fetchBytes`가 받은 URL(호출 순서) */
  readonly requested: string[];
  /** 파일들을 저장소에 더한다(이미 있으면 유지) */
  add(fixture: KitFixture): void;
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

async function bootEnv(options: Parameters<typeof createNullEngineHarness>[0] = {}): Promise<KitEnv> {
  const store = new Map<string, Uint8Array>();
  const requested: string[] = [];
  const h = await createNullEngineHarness({
    now: () => 9_000,
    fetchBytes: async (url) => {
      requested.push(url);
      const bytes = store.get(url);
      if (!bytes) throw new Error(`fixture에 없는 URL: ${url}`);
      return bytes;
    },
    ...options,
  });
  cleanups.push(() => h.dispose());
  const scene = h.nullEngine.scenes[0];
  if (!scene) throw new Error("장면이 없습니다.");
  return {
    h,
    scene,
    store,
    requested,
    add(fixture) {
      for (const [url, bytes] of fixture.files) if (!store.has(url)) store.set(url, bytes);
    },
  };
}

async function bootKit(options: KitFixtureOptions = {}, envOptions: Parameters<typeof createNullEngineHarness>[0] = {}): Promise<KitEnv & { readonly fixture: KitFixture }> {
  const env = await bootEnv(envOptions);
  const fixture = await buildKitFixture({ partIds: REQUIRED, ...options });
  env.add(fixture);
  await env.h.engine.loadSource({ kind: "kit", plan: fixture.plan });
  return { ...env, fixture };
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

/** 지금 리그의 모든 파츠를 보이는 상태로 두는 플랜(역할 고정 partId) */
function planFor(env: KitEnv, overrides: Partial<ApplyPlan> = {}): ApplyPlan {
  const rig = env.h.engine.inspectRig();
  if (!rig) throw new Error("리그가 없습니다.");
  return applyPlanFixture({ parts: rig.parts.map((part) => ({ partId: part.partId, visible: true, materialPreset: part.materialPreset })), ...overrides });
}

function toon(overrides: Partial<ShadingProfile["toon"]> = {}): ShadingProfile {
  return { ...DEFAULT_SHADING, mode: "toon", toon: { ...DEFAULT_SHADING.toon, ...overrides } };
}

function partByRole(env: KitEnv, role: PartRole) {
  const part = env.h.engine.inspectRig()?.parts.find((candidate) => candidate.role === role);
  if (!part) throw new Error(`역할 ${role} 파츠가 없습니다.`);
  return part;
}

function sceneCounts(env: KitEnv) {
  const scene = env.h.engine.inspectScene();
  return { meshes: scene.meshCount, skeletons: scene.skeletonCount, transformNodes: scene.transformNodeCount, materials: scene.materialCount };
}

function inputValue(material: Material | null | undefined, name: string): unknown {
  const block = (material as unknown as { getBlockByName(blockName: string): { value?: unknown } | null } | null | undefined)?.getBlockByName(name);
  return block?.value;
}

/** GLB의 재질 하나의 JSON을 바꿔 다시 묶는다(바이트가 달라지므로 SHA 검증을 끈 하네스에서 쓴다). */
function withMaterialPatch(bytes: Uint8Array, materialName: string, patch: Readonly<Record<string, unknown>>): Uint8Array {
  const parsed = parseGlb(bytes);
  const json = parsed.json as { materials?: Array<Record<string, unknown>> };
  const material = json.materials?.find((candidate) => candidate.name === materialName);
  if (!material) throw new Error(`재질이 없습니다: ${materialName}`);
  Object.assign(material, patch);
  const pad4 = (length: number): number => (length + 3) & ~3;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = pad4(jsonBytes.length);
  const bin = parsed.bin ?? new Uint8Array(0);
  const binPadded = pad4(bin.length);
  const out = new Uint8Array(12 + 8 + jsonPadded + 8 + binPadded);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, jsonPadded, true);
  view.setUint32(16, GLB_CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonPadded);
  view.setUint32(20 + jsonPadded, binPadded, true);
  view.setUint32(24 + jsonPadded, GLB_CHUNK_BIN, true);
  out.set(bin, 28 + jsonPadded);
  return out;
}

function tampered(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes);
  const last = copy.length - 1;
  copy[last] = (copy[last] ?? 0) ^ 0xff;
  return copy;
}

// ---------------------------------------------------------------- 소스 로드

describe("키트 소스 로드(엔진)", () => {
  it("키트 소스는 rig.kind \"kit\"로 올라가고 역할 고정 partId·포즈 규약 model-space·68본·플랜의 능력 맵을 돌려준다", async () => {
    const env = await bootEnv();
    const fixture = await buildKitFixture({ partIds: REQUIRED });
    env.add(fixture);
    const loaded = await env.h.engine.loadSource({ kind: "kit", plan: fixture.plan });
    const rig = env.h.engine.inspectRig();
    expect(rig?.kind).toBe("kit");
    expect(rig?.poseConvention).toBe("model-space");
    expect(rig?.skeletonBoneCount).toBe(68);
    expect(rig?.humanoidBoneCount).toBe(55);
    expect(rig?.chainCount).toBe(0);
    expect(rig?.colliderCount).toBe(0);
    const roles = rig?.parts.map((part) => part.role) ?? [];
    expect(roles).toEqual(["skin", "head", "eyeball", "iris", "eye-highlight", "brow", "lash", "teeth", "tongue", "hair", "top", "bottom", "shoes", "underwear"]);
    for (const part of rig?.parts ?? []) {
      expect(part.id).toBe(part.role);
      expect(part.partId).toBe(rolePartId(part.role));
      expect(part.skinned).toBe(true);
    }
    expect(loaded.capabilities).toBe(fixture.plan.capabilities);
    expect(loaded.boneNames).toHaveLength(68);
    expect(loaded.morphNames).toEqual(rig?.morphNames);
    expect(Object.keys(loaded.partIdPalette).map(Number).sort((a, b) => a - b)).toEqual(roles.map((role) => rolePartId(role)).sort((a, b) => a - b));
    expect(env.h.engine.sourceNotes()).toEqual([]);
  });

  it("받은 파일은 바이트 캐시에 남아 소스를 다시 올려도 다시 받지 않는다(절차 소스를 거쳐 와도)", async () => {
    const env = await bootKit();
    const first = env.requested.length;
    expect(first).toBe(REQUIRED.length + 1);
    await env.h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    expect(env.h.engine.inspectRig()?.kind).toBe("procedural");
    const fixture = await buildKitFixture({ partIds: REQUIRED });
    await env.h.engine.loadSource({ kind: "kit", plan: fixture.plan });
    expect(env.h.engine.inspectRig()?.kind).toBe("kit");
    expect(env.requested).toHaveLength(first);
  });

  it("로드에 실패하면 LabFailure 코드(kit-sha-mismatch)로 reject하고 장면을 비우며 이 키트의 바이트 캐시도 비운다 — 파일을 고치면 다시 올라간다", async () => {
    const env = await bootEnv();
    const fixture = await buildKitFixture({ partIds: REQUIRED });
    env.add(fixture);
    const hairUrl = fixtureUrl("female", "hair/soft-bob");
    const good = env.store.get(hairUrl) as Uint8Array;
    env.store.set(hairUrl, tampered(good));
    const failure = await failureOf(env.h.engine.loadSource({ kind: "kit", plan: fixture.plan }));
    expect(failure.code).toBe("kit-sha-mismatch");
    expect(env.h.engine.inspectRig()).toBeNull();
    expect(sceneCounts(env)).toEqual({ meshes: 0, skeletons: 0, transformNodes: 0, materials: 0 });
    env.store.set(hairUrl, good);
    await env.h.engine.loadSource({ kind: "kit", plan: fixture.plan });
    expect(env.h.engine.inspectRig()?.kind).toBe("kit");
  });

  it("loadSource가 던진 일반 오류(재질 변환 실패 등)는 source-load-failed로 감싼다", async () => {
    const env = await bootEnv();
    const fixture = await buildKitFixture({ partIds: REQUIRED });
    env.add(fixture);
    // 베이스 파일을 GLB가 아닌 바이트로 바꾸되 SHA 검증을 끈 엔진에서는 Babylon 로더 실패(kit-glb-load-failed)가 그대로 나온다
    const lax = await bootEnv({ verifyPackageSha: false });
    lax.add(fixture);
    lax.store.set(fixtureUrl("female", "base/female"), new Uint8Array([1, 2, 3, 4]));
    const failure = await failureOf(lax.h.engine.loadSource({ kind: "kit", plan: fixture.plan }));
    expect(failure.code).toMatch(/^kit-/u);
    expect(failure.reasonKo).toMatch(/[가-힣]/u);
    expect(lax.h.engine.inspectRig()).toBeNull();
  });
});

// ---------------------------------------------------------------- 틴트

describe("키트 틴트(RigPart.tint)", () => {
  it("피부·머리·홍채·눈썹·속눈썹·헤어·의상은 recolor, 안구·하이라이트·치아·혀·속옷은 fixed다", async () => {
    const env = await bootKit();
    const rig = env.h.engine.inspectRig();
    const tint = Object.fromEntries((rig?.parts ?? []).map((part) => [part.role, part.tintMode]));
    expect(tint).toEqual({
      skin: "recolor",
      head: "recolor",
      eyeball: "fixed",
      iris: "recolor",
      "eye-highlight": "fixed",
      brow: "recolor",
      lash: "recolor",
      teeth: "fixed",
      tongue: "fixed",
      hair: "recolor",
      top: "recolor",
      bottom: "recolor",
      shoes: "recolor",
      underwear: "fixed",
    });
  });

  it("알베도 텍스처가 있는 recolor 파츠도 레시피 색을 PBR 알베도에 곱한다(텍스처 × 색). 절차·패키지의 '텍스처가 있으면 색을 건너뜀' 규칙은 키트에 적용하지 않는다", async () => {
    const env = await bootKit();
    const body = partByRole(env, "skin");
    expect(body.hasAlbedoTexture).toBe(true);
    const pbr = env.scene.getMaterialByName("ts_skin_body") as PBRMaterial | null;
    expect(pbr).not.toBeNull();
    env.h.engine.applyPlan(planFor(env, { colors: { ...applyPlanFixture().colors, skin: "#c08040" } }));
    expect(partByRole(env, "skin").colorHex).toBe("#c08040");
    // PBR 알베도는 sRGB hex를 선형으로 바꾼 값이다: 0xc0 = 192/255 → 선형 ≈ 0.527
    expect(pbr?.albedoColor.r).toBeCloseTo(0.527, 2);
    expect(pbr?.albedoColor.g).toBeCloseTo(0.216, 2);
    expect(pbr?.albedoColor.b).toBeCloseTo(0.051, 2);
  });

  it("첫 플랜 전에도 PBR이 흰색(GLB baseColorFactor)으로 남지 않는다: 로드 직후 프리셋·틴트 색이 이미 들어 있다", async () => {
    const env = await bootKit();
    const pbr = env.scene.getMaterialByName("ts_skin_body") as PBRMaterial | null;
    const skin = partByRole(env, "skin");
    const expected = hexToSrgb01(skin.colorHex) ?? [0, 0, 0];
    // 기본 피부색은 흰색이 아니다 → 선형 알베도가 1이 아니어야 한다
    expect(Math.min(...expected)).toBeLessThan(1);
    expect(pbr?.albedoColor.r).toBeLessThan(1);
  });

  it("fixed 틴트는 레시피·플랜 색을 무시한다(플랜 파츠 색 override도)", async () => {
    const env = await bootKit();
    const eye = partByRole(env, "eyeball");
    expect(eye.colorHex).toBe(FIXED_HEX);
    env.h.engine.applyPlan(
      planFor(env, {
        colors: { ...applyPlanFixture().colors, skin: "#102030" },
        parts: (env.h.engine.inspectRig()?.parts ?? []).map((part) => ({ partId: part.partId, visible: true, materialPreset: part.materialPreset, color: "#ff0000" })),
      }),
    );
    expect(partByRole(env, "eyeball").colorHex).toBe(FIXED_HEX);
    expect(partByRole(env, "underwear").colorHex).toBe(FIXED_HEX);
    // recolor는 플랜 색 override를 따른다
    expect(partByRole(env, "top").colorHex).toBe("#ff0000");
  });

  it("툰: 텍스처가 있는 recolor 파츠는 baseColor = 틴트, hasAlbedo = 1로 곱한다", async () => {
    const env = await bootKit();
    env.h.engine.setShading(toon());
    await env.h.engine.setBetaFeature("nodeMaterialToon", true);
    env.h.engine.applyPlan(planFor(env, { colors: { ...applyPlanFixture().colors, skin: "#c08040" } }));
    const body = env.scene.getMeshByName("TS_Body")?.material;
    expect(body?.getClassName()).toBe("NodeMaterial");
    expect(inputValue(body, "hasAlbedoFlag")).toBe(1);
    const base = inputValue(body, "baseColor") as { r: number; g: number; b: number };
    const expected = hexToSrgb01("#c08040") ?? [0, 0, 0];
    expect([base.r, base.g, base.b].map((value) => Number(value.toFixed(3)))).toEqual(expected.map((value) => Number(value.toFixed(3))));
  });
});

// ---------------------------------------------------------------- 외곽선 정책

describe("툰 hull 외곽선 정책(A-5·A-9)", () => {
  it("키트: 머리와 눈·입 안 계열 역할(안구·홍채·하이라이트·눈썹·속눈썹·치아·혀)은 hull을 켜지 않고 피부·헤어·의상·신발·속옷은 켠다", async () => {
    const env = await bootKit();
    env.h.engine.setShading(toon());
    const parts = env.h.engine.inspectRig()?.parts ?? [];
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) expect(part.renderOutline, part.role).toBe(!KIT_OUTLINE_EXEMPT_ROLES.has(part.role));
    // 정책 표의 모든 제외 역할이 이 합성 키트(pupil만 빼고)에 실제로 있었음을 확인한다 — 빈 검사가 되지 않게
    const present = new Set(parts.map((part) => part.role));
    for (const role of KIT_OUTLINE_EXEMPT_ROLES) if (role !== "pupil") expect(present.has(role), role).toBe(true);
    expect(parts.filter((part) => part.renderOutline).map((part) => part.role)).toEqual(["skin", "hair", "top", "bottom", "shoes", "underwear"]);
  });

  it("키트는 `_Outline` 셸을 싣지 않으므로 hull과 셸의 이중 외곽선이 생기지 않는다(셸 메시 0, 셸 가시 0)", async () => {
    const env = await bootKit();
    env.h.engine.setShading(toon());
    for (const part of env.h.engine.inspectRig()?.parts ?? []) {
      expect(part.outlineMeshNames, part.role).toEqual([]);
      expect(part.outlineShellVisible, part.role).toBe(false);
    }
  });

  it("셰이딩을 PBR로 바꿨다 툰으로 돌아와도 같은 정책이 적용된다(모드 전환이 정책을 지우지 않는다)", async () => {
    const env = await bootKit();
    env.h.engine.setShading(toon());
    env.h.engine.setShading({ ...DEFAULT_SHADING, mode: "pbr" });
    expect(env.h.engine.inspectRig()?.parts.every((part) => !part.renderOutline)).toBe(true);
    env.h.engine.setShading(toon());
    const outlined = env.h.engine.inspectRig()?.parts.filter((part) => part.renderOutline).map((part) => part.role);
    expect(outlined).toEqual(["skin", "hair", "top", "bottom", "shoes", "underwear"]);
  });

  it("엣지·없음 외곽선 모드는 정책의 대상이 아니다(엣지는 모든 파츠에, 없음은 어떤 파츠에도 켜지 않는다)", async () => {
    const env = await bootKit();
    env.h.engine.setShading(toon({ outline: "edge" }));
    expect(env.h.engine.inspectRig()?.parts.every((part) => !part.renderOutline && part.edgesRendering)).toBe(true);
    env.h.engine.setShading(toon({ outline: "none" }));
    expect(env.h.engine.inspectRig()?.parts.every((part) => !part.renderOutline && !part.edgesRendering)).toBe(true);
  });

  it("증분 교체로 새로 들어온 파츠에도 정책이 적용된다(제외 역할이 아닌 헤어는 hull, 새 홍채는 제외)", async () => {
    const env = await bootKit();
    env.h.engine.setShading(toon());
    const next = await buildKitFixture({ partIds: ["hair/short-layered", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"] });
    env.add(next);
    await env.h.engine.loadSource({ kind: "kit", plan: next.plan });
    expect(partByRole(env, "hair").renderOutline).toBe(true);
    expect(partByRole(env, "iris").renderOutline).toBe(false);
    expect(partByRole(env, "eyeball").renderOutline).toBe(false);
  });

  it("절차 소스의 기존 거동은 그대로다: 모든 파츠 메시에 hull을 켠다", async () => {
    const env = await bootEnv();
    await env.h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    env.h.engine.setShading(toon());
    expect(env.h.engine.inspectRig()?.parts.every((part) => part.renderOutline)).toBe(true);
  });
});

// ---------------------------------------------------------------- 얼굴 SDF

describe("얼굴 SDF 그림자(키트 v1에서 끈다)", () => {
  it("절차 소스의 머리는 얼굴 SDF 그림자를 쓰고 키트의 머리는 쓰지 않는다(N·L 램프)", async () => {
    const proc = await bootEnv();
    await proc.h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    proc.h.engine.setShading(toon());
    await proc.h.engine.setBetaFeature("nodeMaterialToon", true);
    expect(DEFAULT_SHADING.toon.faceSdfShadow).toBe(true);
    const procHead = proc.scene.getMeshByName("head")?.material;
    expect(procHead?.getClassName()).toBe("NodeMaterial");
    expect(inputValue(procHead, "faceSdfFlag")).toBe(1);

    const kit = await bootKit();
    kit.h.engine.setShading(toon());
    await kit.h.engine.setBetaFeature("nodeMaterialToon", true);
    const head = kit.scene.getMeshByName("TS_Head")?.material;
    expect(head?.getClassName()).toBe("NodeMaterial");
    expect(inputValue(head, "faceSdfFlag")).toBe(0);
    // 얼굴 SDF 사용자 설정이 켜져 있어도 키트는 쓰지 않는다(설정을 다시 밀어 넣어도 그대로)
    kit.h.engine.setShading(toon({ faceSdfShadow: true }));
    expect(inputValue(kit.scene.getMeshByName("TS_Head")?.material, "faceSdfFlag")).toBe(0);
  });
});

// ---------------------------------------------------------------- 정점 색(AO)

describe("툰·밑색 재질의 정점 색(COLOR_0 회색 AO) define", () => {
  it("정점 색 버퍼를 가진 파츠(합성 헤어)의 툰 재질만 define을 켜고, 없는 파츠는 끈다(빈 attribute가 0으로 읽히지 않게)", async () => {
    const env = await bootKit();
    env.h.engine.setShading(toon());
    const parts = env.h.engine.inspectRig()?.parts ?? [];
    const hair = parts.find((part) => part.role === "hair");
    expect(hair?.meshesHaveVertexColor?.every(Boolean)).toBe(true);
    expect(hair?.toonVertexColor).toBe(true);
    for (const part of parts.filter((candidate) => candidate.role !== "hair")) {
      expect(part.meshesHaveVertexColor?.some(Boolean), part.role).toBe(false);
      expect(part.toonVertexColor, part.role).toBe(false);
    }
  });

  it("제작 패키지·절차 소스는 기존 거동 그대로다: Orion 헤어에 COLOR_0이 있어도 툰은 읽지 않는다(키트 파츠만 곱한다)", async () => {
    const id = "avatar-orion-authored";
    const root = path.resolve(process.cwd().endsWith("character-lab") ? process.cwd() : path.join(process.cwd(), "apps", "character-lab"), "public", "assets", "characters");
    const bytes = new Uint8Array(readFileSync(path.join(root, id, `${id}.glb`)));
    const env = await bootEnv({ verifyPackageSha: false, fetchBytes: async () => bytes });
    await env.h.engine.loadSource({ kind: "package", plan: createPackagePlanFixture({ characterId: id, glbUrl: `/assets/characters/${id}/${id}.glb`, bytes, preferredLod: 0 }) });
    env.h.engine.setShading(toon());
    const parts = env.h.engine.inspectRig()?.parts ?? [];
    expect(parts.some((part) => part.role === "hair" && part.meshesHaveVertexColor?.some(Boolean))).toBe(true);
    expect(parts.every((part) => part.toonVertexColor === false)).toBe(true);
    // 절차 소스도 마찬가지
    const proc = await bootEnv();
    await proc.h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    proc.h.engine.setShading(toon());
    expect(proc.h.engine.inspectRig()?.parts.every((part) => part.toonVertexColor === false)).toBe(true);
  });

  it("헤어를 정점 색이 없는 헤어로 교체하면 새 툰 재질은 define 없이 만들어진다(역할 키로 옛 재질을 물려받지 않는다)", async () => {
    const env = await bootKit();
    env.h.engine.setShading(toon());
    expect(partByRole(env, "hair").toonVertexColor).toBe(true);
    const next = await buildKitFixture({
      partIds: ["hair/short-layered", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"],
      tweaks: {
        "hair/short-layered": (spec) => ({ ...spec, meshes: spec.meshes.map((mesh) => ({ ...mesh, primitives: mesh.primitives.map(({ vertexColor: _removed, ...rest }) => rest) })) }),
      },
    });
    env.add(next);
    await env.h.engine.loadSource({ kind: "kit", plan: next.plan });
    const hair = partByRole(env, "hair");
    expect(hair.meshesHaveVertexColor?.some(Boolean)).toBe(false);
    expect(hair.toonVertexColor).toBe(false);
  });
});

// ---------------------------------------------------------------- 알파 컷오프

describe("툰 알파 컷오프(glTF alphaMode MASK: 키트의 눈썹·속눈썹 컷아웃)", () => {
  async function bootMasked(patches: ReadonlyArray<{ readonly url: string; readonly material: string; readonly patch: Record<string, unknown> }>) {
    const env = await bootEnv({ verifyPackageSha: false });
    const fixture = await buildKitFixture({ partIds: REQUIRED });
    env.add(fixture);
    for (const entry of patches) env.store.set(entry.url, withMaterialPatch(env.store.get(entry.url) as Uint8Array, entry.material, entry.patch));
    await env.h.engine.loadSource({ kind: "kit", plan: fixture.plan });
    env.h.engine.setShading(toon());
    return env;
  }
  const topUrl = fixtureUrl("female", "top/tee");
  const jeansUrl = fixtureUrl("female", "bottom/jeans");

  it("알베도 텍스처가 있는 MASK 재질은 glTF alphaCutoff를 툰 재질에 넣고, 나머지 파츠는 0(끔)이다", async () => {
    const env = await bootMasked([{ url: topUrl, material: "ts_top_tee", patch: { alphaMode: "MASK", alphaCutoff: 0.35 } }]);
    const cutoffs = Object.fromEntries((env.h.engine.inspectRig()?.parts ?? []).map((part) => [part.role, part.toonAlphaCutoff]));
    expect(cutoffs.top).toBeCloseTo(0.35, 6);
    for (const [role, value] of Object.entries(cutoffs)) if (role !== "top") expect(value, role).toBe(0);
  });

  it("alphaCutoff를 생략한 MASK는 glTF 기본값 0.5를 쓴다", async () => {
    const env = await bootMasked([{ url: topUrl, material: "ts_top_tee", patch: { alphaMode: "MASK" } }]);
    expect(partByRole(env, "top").toonAlphaCutoff).toBeCloseTo(0.5, 6);
  });

  it("알베도 텍스처가 없는 MASK 재질과 OPAQUE 재질은 컷오프를 켜지 않는다(텍스처 알파가 없으면 버릴 근거가 없다)", async () => {
    const env = await bootMasked([
      { url: jeansUrl, material: "ts_bottom_jeans", patch: { alphaMode: "MASK", alphaCutoff: 0.4 } },
      { url: topUrl, material: "ts_top_tee", patch: { alphaMode: "OPAQUE" } },
    ]);
    expect(partByRole(env, "bottom").hasAlbedoTexture).toBe(false);
    expect(partByRole(env, "bottom").toonAlphaCutoff).toBe(0);
    expect(partByRole(env, "top").toonAlphaCutoff).toBe(0);
  });

  it("마스크 파츠를 증분 교체로 올려도 같다(새 툰 재질에 컷오프가 들어간다)", async () => {
    const env = await bootMasked([]);
    expect(partByRole(env, "top").toonAlphaCutoff).toBe(0);
    const next = await buildKitFixture({ partIds: ["hair/soft-bob", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"] });
    env.add(next);
    env.store.set(topUrl, withMaterialPatch(next.files.get(topUrl) as Uint8Array, "ts_top_tee", { alphaMode: "MASK", alphaCutoff: 0.6 }));
    // 상의 GLB 바이트가 달라졌으므로(SHA) 플랜의 파츠 SHA를 새 바이트에 맞춘다 — 같은 id라도 파일이 다르면 그 파츠만 교체한다
    const patched = env.store.get(topUrl) as Uint8Array;
    const { sha256Hex } = await import("../shared/hash");
    const plan = { ...next.plan, parts: await Promise.all(next.plan.parts.map(async (part) => (part.url === topUrl ? { ...part, bytes: patched.byteLength, sha256: await sha256Hex(patched) } : part))) };
    await env.h.engine.loadSource({ kind: "kit", plan });
    expect(partByRole(env, "top").toonAlphaCutoff).toBeCloseTo(0.6, 6);
  });
});

// ---------------------------------------------------------------- 증분 교체

describe("키트 증분 교체(엔진)", () => {
  const SECOND: readonly PresetId[] = ["hair/short-layered", "top/tee", "bottom/jeans", "irises/round-large", "accessory/glasses"];

  it("같은 베이스의 파츠 구성만 바뀌면 베이스를 다시 받거나 다시 파싱하지 않고 바뀐 파츠만 받는다 (헤어 교체 + 신발 제거 + 액세서리 추가)", async () => {
    const env = await bootKit();
    const next = await buildKitFixture({ partIds: SECOND });
    env.add(next);
    const before = env.requested.length;
    const baseUrl = fixtureUrl("female", "base/female");
    await env.h.engine.loadSource({ kind: "kit", plan: next.plan });
    expect(env.requested.slice(before).sort()).toEqual([fixtureUrl("female", "accessory/glasses"), fixtureUrl("female", "hair/short-layered")].sort());
    expect(env.requested.filter((url) => url === baseUrl)).toHaveLength(1);
    const roles = env.h.engine.inspectRig()?.parts.map((part) => part.role);
    expect(roles).toEqual(["skin", "head", "eyeball", "iris", "eye-highlight", "brow", "lash", "teeth", "tongue", "hair", "top", "bottom", "accessory", "underwear"]);
    expect(partByRole(env, "hair").meshNames).toEqual(["TS_AuthoredHair_short-layered_LOD0"]);
  });

  it("교체 뒤 장면은 처음부터 그 구성을 올린 것과 같다(메시·스켈레톤·노드·재질 누수 없음), 되돌려도 같다", async () => {
    const env = await bootKit();
    const next = await buildKitFixture({ partIds: SECOND });
    const first = await buildKitFixture({ partIds: REQUIRED });
    env.add(next);
    await env.h.engine.loadSource({ kind: "kit", plan: next.plan });
    const afterUpdate = sceneCounts(env);
    const fresh = await bootKit({ partIds: SECOND });
    expect(afterUpdate).toEqual(sceneCounts(fresh));
    await env.h.engine.loadSource({ kind: "kit", plan: first.plan });
    expect(sceneCounts(env)).toEqual(sceneCounts(await bootKit({ partIds: REQUIRED })));
  });

  it("툰 모드에서도 교체 뒤 재질·장면 객체 수가 처음부터 올린 것과 같다(옛 파츠의 툰 재질을 해제한다)", async () => {
    const env = await bootKit();
    env.h.engine.setShading(toon());
    const next = await buildKitFixture({ partIds: SECOND });
    env.add(next);
    await env.h.engine.loadSource({ kind: "kit", plan: next.plan });
    const fresh = await bootKit({ partIds: SECOND });
    fresh.h.engine.setShading(toon());
    expect(sceneCounts(env)).toEqual(sceneCounts(fresh));
    expect(env.h.engine.inspectRig()?.parts.every((part) => part.materialClass === "ShaderMaterial" && part.hasToonMaterial)).toBe(true);
  });

  it("엔진은 마지막 플랜을 새 파츠에 다시 적용한다: morph 영향·플랜 색이 교체된 헤어에 그대로 이어진다", async () => {
    const env = await bootKit();
    env.h.engine.applyPlan(planFor(env, { morphWeights: { "param:headSize:+": 0.5 }, colors: { ...applyPlanFixture().colors, hair: "#334455" } }));
    expect(partByRole(env, "hair").colorHex).toBe("#334455");
    const next = await buildKitFixture({ partIds: SECOND });
    env.add(next);
    await env.h.engine.loadSource({ kind: "kit", plan: next.plan });
    const hair = partByRole(env, "hair");
    expect(hair.colorHex).toBe("#334455");
    expect(hair.activeMorphTargetsByMesh).toEqual([1]);
    expect(env.h.engine.inspectRig()?.morphInfluences["param:headSize:+"]).toBe(0.5);
  });

  it("몸 가림이 새 구성에 맞게 다시 계산되고 alwaysSelectAsActiveMesh는 플랜·셰이딩·카메라 변경을 거쳐도 유지된다", async () => {
    const env = await bootKit();
    // 필수 파츠(상의·하의·신발)가 숨긴 영역: torso·upperArm.L/R, pelvis·thigh.L/R, foot.L/R → 보이는 연속 구간 3개(neck / forearm·hand / calf)
    expect(partByRole(env, "skin").subMeshCountsByMesh).toEqual([3]);
    expect(partByRole(env, "skin").alwaysSelectAsActiveByMesh).toEqual([true]);
    env.h.engine.applyPlan(planFor(env));
    env.h.engine.setShading(toon());
    env.h.engine.setShading({ ...DEFAULT_SHADING, mode: "pbr" });
    env.h.engine.setCamera({ ...DEFAULT_FRAMING, mode: "face" });
    env.h.engine.resize(80, 80);
    expect(partByRole(env, "skin").alwaysSelectAsActiveByMesh).toEqual([true]);
    expect(partByRole(env, "skin").subMeshCountsByMesh).toEqual([3]);
    // 신발을 빼면 foot.L/R가 다시 보여 calf 구간과 합쳐진다(구간 수는 같아도 구성이 바뀐다 — 아래 shoes-only가 구간 수를 줄인다)
    const next = await buildKitFixture({ partIds: SECOND });
    env.add(next);
    await env.h.engine.loadSource({ kind: "kit", plan: next.plan });
    expect(partByRole(env, "skin").subMeshCountsByMesh).toEqual([3]);
    expect(partByRole(env, "skin").alwaysSelectAsActiveByMesh).toEqual([true]);
    // 신발만 신기면 foot.L/R만 빠져 연속 구간 하나가 되고(SubMesh 하나) 항상 선택 플래그는 꺼진다
    const shoesOnly = await buildKitFixture({ partIds: ["shoes/sneakers"] });
    env.add(shoesOnly);
    await env.h.engine.loadSource({ kind: "kit", plan: shoesOnly.plan });
    expect(partByRole(env, "skin").subMeshCountsByMesh).toEqual([1]);
    expect(partByRole(env, "skin").alwaysSelectAsActiveByMesh).toEqual([false]);
    // 다시 의상을 입히면 구간이 다시 쪼개지고 플래그가 켜진다
    await env.h.engine.loadSource({ kind: "kit", plan: (await buildKitFixture({ partIds: REQUIRED })).plan });
    expect(partByRole(env, "skin").subMeshCountsByMesh).toEqual([3]);
    expect(partByRole(env, "skin").alwaysSelectAsActiveByMesh).toEqual([true]);
    // 의상이 하나도 없으면 몸은 SubMesh 하나이고 항상 선택 플래그도 꺼진다
    const bare = await buildKitFixture({ partIds: [] });
    env.add(bare);
    await env.h.engine.loadSource({ kind: "kit", plan: bare.plan });
    expect(partByRole(env, "skin").subMeshCountsByMesh).toEqual([1]);
    expect(partByRole(env, "skin").alwaysSelectAsActiveByMesh).toEqual([false]);
  });

  it("교체한 헤어의 툰·베타 재질이 새로 만들어지고 옛 파츠의 NodeMaterial은 해제된다(베타 자원 누수 없음)", async () => {
    const env = await bootKit();
    env.h.engine.setShading(toon());
    await env.h.engine.setBetaFeature("nodeMaterialToon", true);
    const baseline = env.h.engine.betaFeatures();
    expect(baseline.nodeMaterialToon.status).toBe("active");
    const nodeMaterials = (): number => env.scene.materials.filter((material) => material.getClassName() === "NodeMaterial").length;
    const parts = env.h.engine.inspectRig()?.parts.length ?? 0;
    expect(nodeMaterials()).toBe(parts);
    const next = await buildKitFixture({ partIds: SECOND });
    env.add(next);
    await env.h.engine.loadSource({ kind: "kit", plan: next.plan });
    const after = env.h.engine.inspectRig();
    expect(after?.parts.every((part) => part.materialClass === "NodeMaterial")).toBe(true);
    expect(nodeMaterials()).toBe(after?.parts.length);
  });

  it("교체 중 파일이 손상되면 반쯤 바뀐 리그를 남기지 않고 키트 전체를 해제한 뒤 reject한다 — 이후 올바른 소스는 다시 올라간다", async () => {
    const env = await bootKit();
    env.h.engine.setShading(toon());
    const next = await buildKitFixture({ partIds: SECOND });
    env.add(next);
    const url = fixtureUrl("female", "accessory/glasses");
    const good = env.store.get(url) as Uint8Array;
    env.store.set(url, tampered(good));
    const failure = await failureOf(env.h.engine.loadSource({ kind: "kit", plan: next.plan }));
    expect(failure.code).toBe("kit-sha-mismatch");
    expect(env.h.engine.inspectRig()).toBeNull();
    expect(sceneCounts(env)).toEqual({ meshes: 0, skeletons: 0, transformNodes: 0, materials: 0 });
    expect(env.scene.materials.filter((material) => material.getClassName() === "ShaderMaterial")).toHaveLength(0);
    // 손상된 바이트는 캐시에 남지 않는다
    env.store.set(url, good);
    await env.h.engine.loadSource({ kind: "kit", plan: next.plan });
    expect(env.h.engine.inspectRig()?.parts.some((part) => part.role === "accessory")).toBe(true);
  });

  it("베이스가 다르면(성별 변경) 증분이 아니라 처음부터 다시 만든다: 새 베이스 파일을 받고 스켈레톤은 하나만 남는다", async () => {
    const env = await bootKit();
    const male = await buildKitFixture({ baseId: "male" satisfies KitBaseId, partIds: REQUIRED });
    env.add(male);
    const before = env.requested.length;
    await env.h.engine.loadSource({ kind: "kit", plan: male.plan });
    expect(env.requested.slice(before)).toContain(fixtureUrl("male", "base/male"));
    expect(env.requested.slice(before)).not.toContain(fixtureUrl("female", "base/female"));
    expect(sceneCounts(env)).toEqual(sceneCounts(await bootKit({ baseId: "male", partIds: REQUIRED })));
    expect(env.h.engine.inspectScene().skeletonCount).toBe(1);
  });

  it("같은 플랜을 다시 올려도 아무것도 받지 않고 장면이 그대로다", async () => {
    const env = await bootKit();
    const counts = sceneCounts(env);
    const fetched = env.requested.length;
    const same = await buildKitFixture({ partIds: REQUIRED });
    await env.h.engine.loadSource({ kind: "kit", plan: same.plan });
    expect(env.requested).toHaveLength(fetched);
    expect(sceneCounts(env)).toEqual(counts);
  });
});

// ---------------------------------------------------------------- pick

describe("키트 pick: 숨긴 몸 삼각형", () => {
  /** 몸 삼각형 tri의 한 점(월드, 합성 GLB의 삼각형 배치: x = tri × 0.03 + 0.005, y = 0.505, z = 0) */
  function bodyPoint(tri: number): Vec3 {
    return [tri * 0.03 + 0.005, 0.505, 0];
  }

  /** 월드 점 → NDC(뷰포트 카메라 기저·시야각으로 계산) */
  function ndcOf(env: KitEnv, world: Vec3): [number, number] {
    const camera = env.h.engine.viewportCamera();
    const d: Vec3 = [world[0] - camera.position[0], world[1] - camera.position[1], world[2] - camera.position[2]];
    const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const z = dot(d, camera.forward);
    const tan = Math.tan(camera.fovY / 2);
    return [dot(d, camera.right) / (z * tan * (camera.width / camera.height)), dot(d, camera.up) / (z * tan)];
  }

  /** 합성 몸의 영역 i가 차지하는 삼각형 번호(영역당 2개) */
  function regionTriangles(region: (typeof KIT_HIDEABLE_REGION_IDS)[number]): [number, number] {
    const index = KIT_HIDEABLE_REGION_IDS.indexOf(region);
    return [index * 2, index * 2 + 1];
  }

  it("의상이 가린 영역(torso)의 삼각형은 맞지 않고 보이는 영역(forearm.L)의 삼각형은 맞는다", async () => {
    const env = await bootKit();
    const [hidden] = regionTriangles("torso");
    const [visible] = regionTriangles("forearm.L");
    expect(env.h.engine.pick(...ndcOf(env, bodyPoint(hidden)))).toBeNull();
    expect(env.h.engine.pick(...ndcOf(env, bodyPoint(visible)))).toMatchObject({ role: "skin", partId: rolePartId("skin") });
  });

  it("가림이 없는 키트에서는 같은 삼각형이 맞는다(위 결과가 가림 때문임을 대조)", async () => {
    const env = await bootKit({ partIds: [] });
    const [torso] = regionTriangles("torso");
    expect(env.h.engine.pick(...ndcOf(env, bodyPoint(torso)))).toMatchObject({ role: "skin" });
  });

  it("교체로 가림이 바뀌면 pick 후보도 바뀐다: 신발을 빼면 foot 삼각형이 다시 맞고, 신발을 다시 신기면 사라진다", async () => {
    const env = await bootKit();
    const [foot] = regionTriangles("foot.L");
    expect(env.h.engine.pick(...ndcOf(env, bodyPoint(foot)))).toBeNull();
    const noShoes = await buildKitFixture({ partIds: ["hair/soft-bob", "top/tee", "bottom/jeans", "irises/round-large"] });
    env.add(noShoes);
    await env.h.engine.loadSource({ kind: "kit", plan: noShoes.plan });
    expect(env.h.engine.pick(...ndcOf(env, bodyPoint(foot)))).toMatchObject({ role: "skin" });
    const withShoes = await buildKitFixture({ partIds: REQUIRED });
    await env.h.engine.loadSource({ kind: "kit", plan: withShoes.plan });
    expect(env.h.engine.pick(...ndcOf(env, bodyPoint(foot)))).toBeNull();
  });
});

// ---------------------------------------------------------------- 썸네일 임시 리그

describe("지오메트리 썸네일(키트 임시 리그)", () => {
  it("엔진은 thumbnailSources를 선언하고, 키트 소스를 올리면 플랜의 능력 맵을 SourceCapabilities로 보고한다(앱의 임시 소스 썸네일 경로 전제)", async () => {
    const env = await bootEnv();
    expect(env.h.engine.thumbnailSources).toBe(true);
    const fixture = await buildKitFixture({ partIds: REQUIRED });
    env.add(fixture);
    const loaded = await env.h.engine.loadSource({ kind: "kit", plan: fixture.plan });
    expect(loaded.capabilities).toBe(fixture.plan.capabilities);
  });

  it("임시 키트 소스로 그린 뒤 해제한다: 주 리그·플랜·장면 객체는 그대로이고 5번 반복해도 누수가 없다", async () => {
    const env = await bootKit();
    env.h.engine.applyPlan(planFor(env, { revision: 5, morphWeights: { "param:headSize:+": 0.3 } }));
    const rigBefore = env.h.engine.inspectRig();
    const sceneBefore = env.h.engine.inspectScene();
    const digest = env.h.engine.planDigest();
    const alt = await buildKitFixture({ partIds: ["hair/short-layered", "top/tee", "bottom/jeans", "irises/round-large"], preferredLod: 1 });
    env.add(alt);
    const fetchedBefore = env.requested.length;
    for (let i = 0; i < 5; i += 1) {
      const raster = await env.h.engine.renderThumbnail({ presetId: "hair/short-layered", plan: planFor(env, { revision: 9 }), size: 96, framing: DEFAULT_FRAMING, source: { kind: "kit", plan: alt.plan } });
      expect([raster.width, raster.height]).toEqual([96, 96]);
    }
    expect(env.h.engine.inspectRig()).toEqual(rigBefore);
    expect(env.h.engine.planDigest()).toBe(digest);
    const sceneAfter = env.h.engine.inspectScene();
    for (const key of ["meshCount", "viewportMeshCount", "skeletonCount", "materialCount", "textureCount", "transformNodeCount"] as const) expect(sceneAfter[key], key).toBe(sceneBefore[key]);
    // 베이스는 바이트 캐시에서 쓰므로 새 파츠(헤어)만 한 번 받는다
    expect(env.requested.slice(fetchedBefore)).toEqual([fixtureUrl("female", "hair/short-layered")]);
  });

  it("임시 키트 소스가 손상됐으면 LabFailure로 reject하고 주 리그와 장면은 그대로다", async () => {
    const env = await bootKit();
    const sceneBefore = env.h.engine.inspectScene();
    const alt = await buildKitFixture({ partIds: ["hair/short-layered", "top/tee", "bottom/jeans", "irises/round-large"] });
    env.add(alt);
    const url = fixtureUrl("female", "hair/short-layered");
    env.store.set(url, tampered(env.store.get(url) as Uint8Array));
    const failure = await failureOf(env.h.engine.renderThumbnail({ presetId: "hair/short-layered", plan: planFor(env), size: 96, framing: DEFAULT_FRAMING, source: { kind: "kit", plan: alt.plan } }));
    expect(failure.code).toBe("kit-sha-mismatch");
    expect(env.h.engine.inspectScene()).toEqual(sceneBefore);
    expect(env.h.engine.inspectRig()?.kind).toBe("kit");
  });
});
