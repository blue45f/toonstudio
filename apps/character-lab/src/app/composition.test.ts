import { describe, expect, it } from "vitest";

import {
  ALL_AVAILABLE_CAPABILITIES,
  ALL_UNAVAILABLE_CAPABILITIES,
  APPEARANCE_SLOT_KINDS,
  CHARACTER_SLOT_KINDS,
  HUMANOID_BONE_NAMES,
  KIT_PART_SLOTS,
  MIN_PRESETS_PER_SLOT,
  validateMeshPartData,
} from "../contracts";
import { buildKitPlanDetailed } from "../domains/authored/kit-plan";
import { createPaintSession } from "../paint/paint-session";
import { kitManifestFixture } from "../testing/kit-fixtures";
import { createMockEngine, createMockEngineFactory } from "../testing/mock-engine";

import { COMPOSED_PANELS, DEFAULT_BOOT_SOURCE, composeCharacterLab, uploadPaintLayers } from "./composition";

import type { CompositionOverrides } from "./composition";
import type { ThumbnailRequest } from "../contracts";

/** 합성 키트를 돌려주는 가짜 로더(실제 계획 빌더·실제 영역 모듈 조립) */
function kitOverrides(): NonNullable<CompositionOverrides["kit"]> & { readonly loads: () => number } {
  let loads = 0;
  return {
    loads: () => loads,
    loadManifest: async () => {
      loads += 1;
      return { ok: true, manifest: kitManifestFixture() };
    },
    buildPlan: buildKitPlanDetailed,
  };
}

function canvasStub(): HTMLCanvasElement {
  return {} as HTMLCanvasElement;
}

describe("app/composition", () => {
  it("실제 영역 모듈로 조립하면 카탈로그 94개(외형 64 + 연기 30)가 불변식을 통과하고 failure가 없다", () => {
    const runtime = composeCharacterLab({ defaultSource: "procedural" });
    expect(runtime.catalogFailures).toEqual([]);
    expect(runtime.store.getState().failures).toEqual([]);
    expect(runtime.catalog.entries).toHaveLength(94);
    for (const slot of CHARACTER_SLOT_KINDS) {
      expect(runtime.catalog.bySlot(slot).length).toBeGreaterThanOrEqual(MIN_PRESETS_PER_SLOT[slot]);
    }
    expect(APPEARANCE_SLOT_KINDS.reduce((sum, slot) => sum + runtime.catalog.bySlot(slot).length, 0)).toBe(64);
    expect(runtime.panels).toBe(COMPOSED_PANELS);
    expect(Object.keys(COMPOSED_PANELS).sort()).toEqual([
      "ExportPanel",
      "ExpressionPanel",
      "PackagePanel",
      "PaintPanel",
      "ParamPanel",
      "PhysicsPanel",
      "PosePanel",
      "RenderPanel",
      "SlotPanel",
      "ViewportPane",
      "VisionPanel",
    ]);
    runtime.dispose();
  });

  it("기본 절차 소스의 능력 맵은 처음부터 15슬롯 전부 지원이다(엔진 선택 전에도 슬롯 패널이 쓸 수 있다)", () => {
    const runtime = composeCharacterLab({ defaultSource: "procedural" });
    expect(runtime.store.getState().capabilities).toBe(ALL_AVAILABLE_CAPABILITIES);
    runtime.dispose();
  });

  it("GPU가 없는 환경에서 WebGPU/WebGL2 명시 선택은 capability 차단 사유로 failed가 되고 엔진을 만들지 않는다", async () => {
    const runtime = composeCharacterLab({ defaultSource: "procedural" });
    await runtime.engineSession.select("webgpu", canvasStub());
    expect(runtime.engineSession.status()).toMatchObject({ phase: "failed", backend: "webgpu", failure: { code: "webgpu-unsupported" } });
    await runtime.engineSession.select("webgl2", canvasStub());
    expect(runtime.engineSession.status()).toMatchObject({ phase: "failed", backend: "webgl2", failure: { code: "webgl2-unsupported" } });
    expect(runtime.engineSession.engine()).toBeNull();
    runtime.dispose();
  });

  it("실제 휴머노이드·플래너로 조립한 파이프라인이 모의 엔진에 절차 소스를 올리고, 지오메트리 슬롯을 바꿀 때만 소스를 다시 만든다", async () => {
    const engine = createMockEngine();
    const factory = createMockEngineFactory({ engine });
    const runtime = composeCharacterLab({ defaultSource: "procedural", loadFactory: async () => factory, decideBackend: async (backend) => ({ ok: true, backend }), subdivisionLevels: 0 });
    const stop = runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();

    expect(runtime.store.getState().failures).toEqual([]);
    expect(engine.loadedSources).toHaveLength(1);
    const first = engine.loadedSources[0];
    if (first?.kind !== "procedural") throw new Error("절차 소스가 올라가야 합니다.");
    expect(first.model.parts.length).toBeGreaterThan(0);
    for (const part of first.model.parts) expect(validateMeshPartData(part)).toBeNull();
    expect(first.model.skeleton.bones.slice(0, HUMANOID_BONE_NAMES.length).map((bone) => bone.name)).toEqual([...HUMANOID_BONE_NAMES]);
    expect(engine.appliedPlans).toHaveLength(1);
    // 모든 슬롯이 지원이라 플랜에 미지원 사유가 없다
    expect(engine.appliedPlans[0]?.unsupported).toEqual([]);

    // 색 변경은 플랜만 다시 적용한다
    runtime.store.dispatch({ type: "color/set", key: "skin", value: "#c8a080" });
    await runtime.applyLoop.flush();
    expect(engine.loadedSources).toHaveLength(1);
    expect(engine.appliedPlans).toHaveLength(2);

    // 헤어 슬롯 변경은 지오메트리가 바뀌므로 소스를 다시 올리고 플랜도 다시 적용한다
    const currentHair = runtime.store.getState().recipe.slots.hair;
    const otherHair = runtime.catalog.bySlot("hair").find((entry) => entry.id !== currentHair);
    if (!otherHair) throw new Error("다른 헤어 프리셋이 필요합니다.");
    runtime.store.dispatch({ type: "slot/apply", slot: "hair", presetId: otherHair.id });
    await runtime.applyLoop.flush();
    expect(runtime.store.getState().failures).toEqual([]);
    expect(engine.loadedSources).toHaveLength(2);
    expect(engine.appliedPlans).toHaveLength(3);
    stop();
    runtime.dispose();
  }, 60_000);

  it("엔진이 thumbnailSources를 지원하면 지오메트리 슬롯 카드만 그 프리셋을 입힌 임시 소스로 요청한다", async () => {
    const engine = createMockEngine({ thumbnailSources: true });
    const factory = createMockEngineFactory({ engine });
    const runtime = composeCharacterLab({ defaultSource: "procedural", loadFactory: async () => factory, decideBackend: async (backend) => ({ ok: true, backend }), subdivisionLevels: 0 });
    const stop = runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    await runtime.thumbnails.idle();

    const requests = engine.calls.filter((call) => call.method === "renderThumbnail").map((call) => call.args[0] as ThumbnailRequest);
    const geometrySlots = new Set<string>(["eyes", "irises", "hair", "top", "bottom", "shoes", "accessory"]);
    const slotOf = (request: ThumbnailRequest): string => request.presetId.slice(0, request.presetId.indexOf("/"));
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      if (geometrySlots.has(slotOf(request))) expect(request.source?.kind).toBe("procedural");
      else expect("source" in request).toBe(false);
    }
    // 헤어 카드는 프리셋마다 지오메트리가 다르다(모두 현재 헤어로 그려지는 것을 막는다)
    const hairShapes = requests
      .filter((request) => slotOf(request) === "hair" && request.source?.kind === "procedural")
      .map((request) => {
        const hair = request.source?.kind === "procedural" ? request.source.model.parts.find((part) => part.role === "hair") : undefined;
        return hair ? `${hair.positions.length}:${hair.positions[0] ?? 0}:${hair.positions[hair.positions.length - 1] ?? 0}` : "none";
      });
    expect(hairShapes).toHaveLength(runtime.catalog.bySlot("hair").length);
    expect(new Set(hairShapes).size).toBeGreaterThan(1);
    expect(runtime.store.getState().failures).toEqual([]);
    stop();
    runtime.dispose();
  }, 60_000);

  it("defaultSource를 생략하면 DEFAULT_BOOT_SOURCE가 부팅 소스를 정한다(상수를 바꿔도 같은 관계가 유지된다)", () => {
    const runtime = composeCharacterLab();
    expect(runtime.store.getState().recipe.source.kind).toBe(DEFAULT_BOOT_SOURCE);
    // 절차 소스는 능력 전부 지원, 키트는 kit.json을 받기 전까지 미지원. 어느 쪽이든 부팅만으로 failure·kit.json 요청은 없다
    expect(runtime.store.getState().capabilities).toBe(DEFAULT_BOOT_SOURCE === "procedural" ? ALL_AVAILABLE_CAPABILITIES : ALL_UNAVAILABLE_CAPABILITIES);
    expect(runtime.store.getState().failures).toEqual([]);
    expect(runtime.kitPlans.loaded()).toEqual([]);
    runtime.dispose();
  });

  it("defaultSource를 주면 DEFAULT_BOOT_SOURCE보다 우선한다(procedural/kit 양쪽)", () => {
    const procedural = composeCharacterLab({ defaultSource: "procedural" });
    expect(procedural.store.getState().recipe.source).toEqual({ kind: "procedural" });
    procedural.dispose();
    const kit = composeCharacterLab({ defaultSource: "kit" });
    expect(kit.store.getState().recipe.source).toEqual({ kind: "kit", kitId: "toonstudio-kit-v1", baseId: "female", kitVersion: 1 });
    kit.dispose();
  });

  it("키트 부팅: 키트 능력은 kit.json을 받기 전까지 미지원이고(절차 소스로 시작하지 않는다) 툰 셰이딩은 램프 2단·림 끔이다", () => {
    const runtime = composeCharacterLab({ defaultSource: "kit" });
    expect(runtime.store.getState().recipe.source).toEqual({ kind: "kit", kitId: "toonstudio-kit-v1", baseId: "female", kitVersion: 1 });
    expect(runtime.store.getState().capabilities).toBe(ALL_UNAVAILABLE_CAPABILITIES);
    expect(runtime.store.getState().failures).toEqual([]);
    expect(runtime.kitPlans.loaded()).toEqual([]);
    expect(runtime.store.getState().recipe.shading.toon).toMatchObject({ rampSteps: 2, rim: false });
    runtime.dispose();
  });

  it("절차 부팅의 셰이딩 기본값은 그대로다(램프 3단·림 켬)", () => {
    const runtime = composeCharacterLab({ defaultSource: "procedural" });
    expect(runtime.store.getState().recipe.shading.toon).toMatchObject({ rampSteps: 3, rim: true });
    runtime.dispose();
  });

  it("키트 기본 소스: 실제 플래너·카탈로그로 조립하면 엔진 선택 뒤에 키트가 올라가고, 파츠 슬롯 변경만 키트를 다시 올린다", async () => {
    const engine = createMockEngine();
    const factory = createMockEngineFactory({ engine });
    const kit = kitOverrides();
    const runtime = composeCharacterLab({ defaultSource: "kit", loadFactory: async () => factory, decideBackend: async (backend) => ({ ok: true, backend }), kit });
    const stop = runtime.start();
    // 엔진을 고르기 전에는 kit.json을 받지 않는다(첫 화면은 빈 뷰포트 + 안내)
    await runtime.applyLoop.flush();
    expect(kit.loads()).toBe(0);
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();

    expect(runtime.store.getState().failures).toEqual([]);
    expect(kit.loads()).toBe(1);
    expect(engine.loadedSources.map((source) => source.kind)).toEqual(["kit"]);
    const first = engine.loadedSources[0];
    if (first?.kind !== "kit") throw new Error("키트 소스가 올라가야 합니다.");
    expect(first.plan.parts.map((part) => part.id)).toEqual(["base/female", "hair/soft-bob", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"]);
    // 여성 키트는 15슬롯 전부 지원이라 플랜에 미지원 사유가 없다
    expect(engine.appliedPlans).toHaveLength(1);
    expect(engine.appliedPlans[0]?.unsupported).toEqual([]);

    // 색 변경은 플랜만 다시 적용한다
    runtime.store.dispatch({ type: "color/set", key: "skin", value: "#c8a080" });
    await runtime.applyLoop.flush();
    expect(engine.loadedSources).toHaveLength(1);
    expect(engine.appliedPlans).toHaveLength(2);

    // 헤어 슬롯 변경은 키트 파츠를 바꾸므로 키트 소스를 다시 올린다(kit.json은 다시 받지 않는다)
    const currentHair = runtime.store.getState().recipe.slots.hair;
    const otherHair = runtime.catalog.bySlot("hair").find((entry) => entry.id !== currentHair);
    if (!otherHair) throw new Error("다른 헤어 프리셋이 필요합니다.");
    runtime.store.dispatch({ type: "slot/apply", slot: "hair", presetId: otherHair.id });
    await runtime.applyLoop.flush();
    expect(runtime.store.getState().failures).toEqual([]);
    expect(engine.loadedSources).toHaveLength(2);
    const second = engine.loadedSources[1];
    if (second?.kind !== "kit") throw new Error("키트 소스가 올라가야 합니다.");
    expect(second.plan.parts.map((part) => part.id)).toContain(otherHair.id);
    expect(kit.loads()).toBe(1);
    stop();
    runtime.dispose();
  }, 60_000);

  it("키트 기본 소스: 남성 베이스에서 미제공 헤어를 레시피가 가리키면 kit-part-missing으로 실패하고 다른 헤어로 바꾸지 않는다", async () => {
    const engine = createMockEngine();
    const factory = createMockEngineFactory({ engine });
    const runtime = composeCharacterLab({ defaultSource: "kit", loadFactory: async () => factory, decideBackend: async (backend) => ({ ok: true, backend }), kit: kitOverrides() });
    const stop = runtime.start();
    runtime.store.dispatch({ type: "source/set", source: { kind: "kit", kitId: "toonstudio-kit-v1", baseId: "male", kitVersion: 1 }, capabilities: ALL_UNAVAILABLE_CAPABILITIES });
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    expect(runtime.store.getState().failures).toEqual([]);
    const male = engine.loadedSources.at(-1);
    if (male?.kind !== "kit") throw new Error("키트 소스가 올라가야 합니다.");
    expect(male.plan.baseId).toBe("male");
    expect(runtime.store.getState().capabilities.hair.unavailablePresets?.["hair/twin-tail"]).toBe("남성 핏 미제작");
    const loadsBefore = engine.loadedSources.length;
    runtime.store.dispatch({ type: "slot/apply", slot: "hair", presetId: "hair/twin-tail" });
    await runtime.applyLoop.flush();
    expect(runtime.store.getState().failures.map((failure) => failure.code)).toEqual(["kit-part-missing"]);
    expect(runtime.store.getState().failures[0]?.reasonKo).toContain("남성 핏 미제작");
    expect(engine.loadedSources).toHaveLength(loadsBefore);
    stop();
    runtime.dispose();
  }, 60_000);

  it("키트 기본 소스: 엔진이 thumbnailSources를 지원하면 파츠 슬롯 카드는 임시 키트 소스로, 미제공 카드는 요청하지 않는다", async () => {
    const engine = createMockEngine({ thumbnailSources: true });
    const factory = createMockEngineFactory({ engine });
    const runtime = composeCharacterLab({ defaultSource: "kit", loadFactory: async () => factory, decideBackend: async (backend) => ({ ok: true, backend }), kit: kitOverrides() });
    const stop = runtime.start();
    runtime.store.dispatch({ type: "source/set", source: { kind: "kit", kitId: "toonstudio-kit-v1", baseId: "male", kitVersion: 1 }, capabilities: ALL_UNAVAILABLE_CAPABILITIES });
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    await runtime.thumbnails.idle();

    const requests = engine.calls.filter((call) => call.method === "renderThumbnail").map((call) => call.args[0] as ThumbnailRequest);
    const partSlots: readonly string[] = KIT_PART_SLOTS;
    const slotOf = (request: ThumbnailRequest): string => request.presetId.slice(0, request.presetId.indexOf("/"));
    const unavailable = APPEARANCE_SLOT_KINDS.flatMap((slot) => Object.keys(runtime.store.getState().capabilities[slot].unavailablePresets ?? {}));
    expect(unavailable).toContain("hair/twin-tail");
    expect(unavailable).toContain("top/hoodie");
    for (const request of requests) {
      expect(unavailable).not.toContain(request.presetId);
      if (partSlots.includes(slotOf(request))) expect(request.source?.kind).toBe("kit");
      else expect("source" in request).toBe(false);
    }
    // 프리셋 단위 미제공(헤어 등)은 요청 자체가 없고 캐시 항목도 만들지 않는다
    const capabilities = runtime.store.getState().capabilities;
    for (const presetId of unavailable) expect(runtime.store.getState().thumbnails[presetId as ThumbnailRequest["presetId"]]).toBeUndefined();
    // 슬롯 전체가 미제공(남성 액세서리 0/6)이면 슬롯 단위 능력 가드로 요청 자체를 하지 않는다(임시 키트 소스를 만들다 kit-part-missing으로 failed가 되지 않는다)
    expect(capabilities.accessory.status).toBe("unavailable");
    expect(requests.some((request) => slotOf(request) === "accessory")).toBe(false);
    for (const entry of runtime.catalog.bySlot("accessory")) expect(runtime.store.getState().thumbnails[entry.id]).toBeUndefined();
    // 나머지 카드는 전부 그려진다
    const drawn = APPEARANCE_SLOT_KINDS.flatMap((slot) => runtime.catalog.bySlot(slot).map((entry) => entry.id)).filter(
      (id) => !unavailable.includes(id) && !id.startsWith("accessory/"),
    );
    expect(requests.map((request) => request.presetId).sort()).toEqual([...drawn].sort());
    expect(runtime.store.getState().failures).toEqual([]);
    stop();
    runtime.dispose();
  }, 60_000);

  it("uploadPaintLayers는 비어 있지 않은 레이어만 엔진에 올린다", () => {
    const session = createPaintSession({ layerSize: 64 });
    const engine = createMockEngine();
    expect(uploadPaintLayers(session, engine)).toBe(0);
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "skin");
    session.endStroke();
    expect(uploadPaintLayers(session, engine)).toBe(1);
    expect(engine.calls.filter((call) => call.method === "updatePaintTexture")).toHaveLength(1);
  });
});
