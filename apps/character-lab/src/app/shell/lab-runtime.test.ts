import { describe, expect, it } from "vitest";

import {
  ALL_AVAILABLE_CAPABILITIES,
  ALL_UNAVAILABLE_CAPABILITIES,
  APPEARANCE_SLOT_KINDS,
  KIT_PART_SLOTS,
  createDefaultRecipe,
  createKitDefaultRecipe,
  failVisible,
} from "../../contracts";
import { buildKitPlanDetailed } from "../../domains/authored/kit-plan";
import { presetUnavailableReasonKo } from "../../state/apply-plan";
import { kitManifestFixture } from "../../testing/kit-fixtures";
import { FIXTURE_GLB_SHA256, characterPackageManifestFixture } from "../../testing/manifest-fixtures";
import { createMockEngine } from "../../testing/mock-engine";
import { createMockRuntime, splitCatalogSources } from "../../testing/mock-runtime";
import { minimalHumanoidModelFixture, presetEntryFixture } from "../../testing/recipe-fixtures";

import type { KitPlanRegistryDeps } from "./kit-plan-registry";
import type { AuthoredPackagePlan, KitPlan, ThumbnailRequest } from "../../contracts";

function canvasStub(): HTMLCanvasElement {
  return {} as HTMLCanvasElement;
}

/** 합성 키트를 돌려주는 가짜 로더(실제 계획 빌더 사용). `control.fail`이면 kit.json fetch 실패를 흉내 낸다. */
function fakeKit(): { readonly kit: KitPlanRegistryDeps; readonly loads: () => number; readonly control: { fail: boolean } } {
  const control = { fail: false };
  let loads = 0;
  return {
    control,
    loads: () => loads,
    kit: {
      loadManifest: async () => {
        loads += 1;
        if (control.fail) return { ok: false, failure: failVisible("kit-manifest-fetch-failed", "키트 manifest(kit.json)를 불러오지 못했습니다(404).", undefined, 1) };
        return { ok: true, manifest: kitManifestFixture() };
      },
      buildPlan: buildKitPlanDetailed,
      now: () => 1,
    },
  };
}

function packagePlanFixture(capabilities: AuthoredPackagePlan["capabilities"]): AuthoredPackagePlan {
  const manifest = characterPackageManifestFixture();
  return {
    manifest,
    baseUrl: "/assets/characters/mina/",
    glbUrl: "/assets/characters/mina/mina.glb",
    glbSha256: FIXTURE_GLB_SHA256,
    glbBytes: 10,
    shapeKeyMap: {},
    boneMap: {},
    meshRoles: {},
    hairLodPolicy: { preferredLod: 0 },
    capabilities,
    licenseNote: "CC0",
  };
}

describe("app/shell/lab-runtime", () => {
  it("카탈로그 불변식 위반은 failure 이벤트로 노출하고 런타임은 계속 만든다", () => {
    const sources = splitCatalogSources();
    const { runtime, store } = createMockRuntime({
      overrides: { catalogSources: { ...sources, appearance: [...sources.appearance, presetEntryFixture("hair/soft-bob")] } },
    });
    expect(runtime.catalogFailures.map((failure) => failure.code)).toContain("catalog-id-duplicate");
    expect(store.getState().failures.map((failure) => failure.code)).toContain("catalog-id-duplicate");
    expect(runtime.catalog.entries.length).toBeGreaterThan(0);
  });

  it("엔진 선택 전에는 factory를 호출하지 않고, 선택 후 적용 루프와 썸네일이 돈다", async () => {
    const { runtime, store, engine, factory } = createMockRuntime();
    const stop = runtime.start();
    expect(factory.calls).toHaveLength(0);
    expect(engine.calls).toHaveLength(0);
    await runtime.engineSession.select("webgpu", canvasStub());
    expect(factory.calls).toHaveLength(1);
    expect(store.getState().engine.phase).toBe("ready");
    await runtime.applyLoop.flush();
    expect(engine.calls.map((call) => call.method).slice(0, 4)).toEqual(["loadSource", "setShading", "setPhysicsProvider", "applyPlan"]);
    await runtime.thumbnails.idle();
    const appearanceCount = APPEARANCE_SLOT_KINDS.reduce((sum, slot) => sum + runtime.catalog.bySlot(slot).length, 0);
    const thumbnails = store.getState().thumbnails;
    expect(Object.values(thumbnails).filter((entry) => entry.status === "ready")).toHaveLength(appearanceCount);
    stop();
    runtime.dispose();
    expect(engine.disposed).toBe(true);
    expect(store.getState().engine.phase).toBe("idle");
  });

  it("reloadSource로 올린 패키지 플랜은 레지스트리에 등록되고 루프가 중복 로드하지 않는다", async () => {
    const { runtime, store, engine } = createMockRuntime();
    runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    const manifest = characterPackageManifestFixture();
    const plan: AuthoredPackagePlan = {
      manifest,
      baseUrl: "/assets/characters/mina/",
      glbUrl: "/assets/characters/mina/mina.glb",
      glbSha256: FIXTURE_GLB_SHA256,
      glbBytes: 10,
      shapeKeyMap: {},
      boneMap: {},
      meshRoles: {},
      hairLodPolicy: { preferredLod: 0 },
      capabilities: store.getState().capabilities,
      licenseNote: "CC0",
    };
    const capabilities = await runtime.engineSession.reloadSource({ kind: "package", plan });
    expect(capabilities).not.toBeNull();
    expect(runtime.packagePlans.get(manifest.characterId)).toBe(plan);
    const recipe = store.getState().recipe;
    store.setState({
      recipe: { ...recipe, source: { kind: "package", characterId: manifest.characterId, sha256: FIXTURE_GLB_SHA256 } },
      history: { ...store.getState().history, revision: 1 },
    });
    await runtime.applyLoop.flush();
    expect(engine.loadedSources).toHaveLength(2);
    expect(engine.loadedSources[1]?.kind).toBe("package");
    expect(store.getState().failures).toEqual([]);
  });

  it("onSourceLoaded 훅은 루프의 소스 로드와 패널의 reloadSource 양쪽에서 엔진·소스로 호출된다", async () => {
    const seen: string[] = [];
    const { runtime, store, engine } = createMockRuntime({
      overrides: {
        onSourceLoaded(loadedEngine, source) {
          expect(loadedEngine).toBe(engine);
          seen.push(source.kind);
        },
      },
    });
    runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    expect(seen).toEqual(["procedural"]);
    await runtime.engineSession.reloadSource({ kind: "package", plan: packagePlanFixture(store.getState().capabilities) });
    expect(seen).toEqual(["procedural", "package"]);
  });

  it("로드되지 않은 패키지 소스는 failure로 노출한다", async () => {
    const { runtime, store } = createMockRuntime();
    runtime.start();
    await runtime.engineSession.select("webgl2", canvasStub());
    await runtime.applyLoop.flush();
    const recipe = store.getState().recipe;
    store.setState({
      recipe: { ...recipe, source: { kind: "package", characterId: "ghost", sha256: FIXTURE_GLB_SHA256 } },
      history: { ...store.getState().history, revision: 1 },
    });
    await runtime.applyLoop.flush();
    expect(store.getState().failures.map((failure) => failure.code)).toEqual(["package-plan-missing"]);
  });

  it("키트 소스 레시피는 kit.json을 받아 키트 플랜으로 엔진에 올리고, 절차 소스로 대체하지 않는다", async () => {
    const { kit, loads } = fakeKit();
    const { runtime, store, engine } = createMockRuntime({ overrides: { initialRecipe: createKitDefaultRecipe(), kit } });
    // 부팅 시점에는 kit.json을 모르므로 능력 맵은 미지원이고, 엔진이 키트 플랜을 올리면 플랜의 능력 맵으로 맞춘다
    expect(store.getState().capabilities).toBe(ALL_UNAVAILABLE_CAPABILITIES);
    runtime.start();
    expect(loads()).toBe(0);
    await runtime.engineSession.select("webgl2", canvasStub());
    await runtime.applyLoop.flush();
    expect(store.getState().failures).toEqual([]);
    expect(engine.loadedSources.map((source) => source.kind)).toEqual(["kit"]);
    const source = engine.loadedSources[0];
    if (source?.kind !== "kit") throw new Error("키트 소스여야 합니다.");
    expect(source.plan.parts.map((part) => part.id)).toEqual(["base/female", "hair/soft-bob", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"]);
    expect(store.getState().capabilities).toBe(source.plan.capabilities);
    expect(store.events.filter((event) => event.type === "source/capabilities")).toHaveLength(1);
    expect(runtime.applyLoop.settled()).toBe(true);
    // kit.json은 한 번만 받는다(썸네일 임시 소스·소스 재생성도 같은 manifest를 쓴다)
    expect(loads()).toBe(1);
    expect(runtime.kitPlans.loaded()).toHaveLength(1);
    runtime.dispose();
  });

  it("키트 파츠 슬롯이 바뀔 때만 키트 소스를 다시 올리고, 색·셰이딩은 플랜만 다시 적용한다", async () => {
    const { kit } = fakeKit();
    const { runtime, store, engine } = createMockRuntime({ overrides: { initialRecipe: createKitDefaultRecipe(), kit } });
    runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    expect(engine.loadedSources).toHaveLength(1);
    let recipe = store.getState().recipe;
    store.setState({ recipe: { ...recipe, colors: { ...recipe.colors, skin: "#c8a080" }, shading: { ...recipe.shading, mode: "toon" } }, history: { ...store.getState().history, revision: 1 } });
    await runtime.applyLoop.flush();
    expect(engine.loadedSources).toHaveLength(1);
    // 키트가 쓰지 않는 슬롯(눈 모양 = morph)도 소스를 다시 만들지 않는다
    recipe = store.getState().recipe;
    store.setState({ recipe: { ...recipe, slots: { ...recipe.slots, eyes: "eyes/round" } }, history: { ...store.getState().history, revision: 2 } });
    await runtime.applyLoop.flush();
    expect(engine.loadedSources).toHaveLength(1);
    recipe = store.getState().recipe;
    store.setState({ recipe: { ...recipe, slots: { ...recipe.slots, hair: "hair/hime-cut" } }, history: { ...store.getState().history, revision: 3 } });
    await runtime.applyLoop.flush();
    expect(engine.loadedSources).toHaveLength(2);
    const second = engine.loadedSources[1];
    if (second?.kind !== "kit") throw new Error("키트 소스여야 합니다.");
    expect(second.plan.parts.map((part) => part.id)).toContain("hair/hime-cut");
    expect(store.getState().failures).toEqual([]);
    runtime.dispose();
  });

  it("kit.json을 받지 못하면 failure로 노출하고 소스를 올리지 않으며, 같은 키는 retrySource() 전까지 다시 받지 않는다", async () => {
    const { kit, loads, control } = fakeKit();
    control.fail = true;
    const { runtime, store, engine } = createMockRuntime({ overrides: { initialRecipe: createKitDefaultRecipe(), kit } });
    runtime.start();
    await runtime.engineSession.select("webgl2", canvasStub());
    await runtime.applyLoop.flush();
    expect(store.getState().failures.map((failure) => failure.code)).toEqual(["kit-manifest-fetch-failed"]);
    expect(engine.calls.filter((call) => call.method === "loadSource")).toHaveLength(0);
    expect(runtime.applyLoop.settled()).toBe(false);
    // 다른 입력 변경에도 실패한 같은 키트는 다시 받지 않는다(실패가 실패를 부르지 않는다)
    const recipe = store.getState().recipe;
    store.setState({ recipe: { ...recipe, shading: { ...recipe.shading, mode: "toon" } }, history: { ...store.getState().history, revision: 1 } });
    await runtime.applyLoop.flush();
    expect(loads()).toBe(1);
    expect(store.getState().failures).toHaveLength(1);
    // 사용자가 "다시 불러오기"를 누르면 새로 받는다
    control.fail = false;
    runtime.applyLoop.retrySource();
    await runtime.applyLoop.flush();
    expect(loads()).toBe(2);
    expect(engine.loadedSources.map((source) => source.kind)).toEqual(["kit"]);
    expect(runtime.applyLoop.settled()).toBe(true);
    runtime.dispose();
  });

  it("retrySource()는 이미 올라간 키트도 kit.json 캐시를 비우고 다시 받아 올린다", async () => {
    const { kit, loads } = fakeKit();
    const { runtime, engine } = createMockRuntime({ overrides: { initialRecipe: createKitDefaultRecipe(), kit } });
    runtime.start();
    await runtime.engineSession.select("webgl2", canvasStub());
    await runtime.applyLoop.flush();
    expect(loads()).toBe(1);
    runtime.applyLoop.retrySource();
    await runtime.applyLoop.flush();
    expect(loads()).toBe(2);
    expect(engine.loadedSources).toHaveLength(2);
    runtime.dispose();
  });

  it("키트 로더가 조립되지 않았으면 kit-loader-unavailable로 실패하고 절차 소스로 대체하지 않는다", async () => {
    const { runtime, store, engine } = createMockRuntime({ overrides: { initialRecipe: createKitDefaultRecipe() } });
    runtime.start();
    await runtime.engineSession.select("webgl2", canvasStub());
    await runtime.applyLoop.flush();
    expect(store.getState().failures.map((failure) => failure.code)).toEqual(["kit-loader-unavailable"]);
    expect(store.getState().failures[0]?.reasonKo).toContain("절차 소스로 대체하지 않습니다");
    expect(engine.calls.filter((call) => call.method === "loadSource")).toHaveLength(0);
  });

  it("엔진 로드가 실패하면 failure로 노출하고, retrySource()로 다시 시도한다", async () => {
    const { kit } = fakeKit();
    let failures = 1;
    const engine = createMockEngine({
      failLoadSource: () => {
        if (failures <= 0) return null;
        failures -= 1;
        return failVisible("kit-glb-load-failed", "GLB를 열지 못했습니다.", undefined, 1);
      },
    });
    const { runtime, store } = createMockRuntime({ engine, overrides: { initialRecipe: createKitDefaultRecipe(), kit } });
    runtime.start();
    await runtime.engineSession.select("webgl2", canvasStub());
    await runtime.applyLoop.flush();
    expect(store.getState().failures.map((failure) => failure.code)).toEqual(["kit-glb-load-failed"]);
    expect(engine.loadedSources).toHaveLength(0);
    runtime.applyLoop.retrySource();
    await runtime.applyLoop.flush();
    expect(engine.loadedSources.map((source) => source.kind)).toEqual(["kit"]);
    expect(store.getState().failures).toHaveLength(1);
  });

  it("패널이 reloadSource로 올린 키트 플랜은 레시피가 따라잡으면 다시 올리지 않는다(레시피 쪽 키와 플랜 쪽 키가 같다)", async () => {
    const { kit } = fakeKit();
    const { runtime, store, engine } = createMockRuntime({ overrides: { initialRecipe: createKitDefaultRecipe(), kit } });
    runtime.start();
    await runtime.engineSession.select("webgl2", canvasStub());
    await runtime.applyLoop.flush();
    expect(engine.loadedSources).toHaveLength(1);
    const recipe = createKitDefaultRecipe();
    const plan = await runtime.kitPlans.plan({ ...recipe, slots: { ...recipe.slots, top: "top/hoodie" } });
    await runtime.engineSession.reloadSource({ kind: "kit", plan });
    await runtime.applyLoop.flush();
    expect(engine.loadedSources).toHaveLength(2);
    // 레시피(top = hoodie)가 따라잡아도 같은 소스이므로 다시 올리지 않고 플랜만 적용한다
    const current = store.getState().recipe;
    store.setState({ recipe: { ...current, slots: { ...current.slots, top: "top/hoodie" } }, history: { ...store.getState().history, revision: 1 } });
    await runtime.applyLoop.flush();
    expect(engine.loadedSources).toHaveLength(2);
    expect(engine.calls.filter((call) => call.method === "applyPlan").length).toBeGreaterThanOrEqual(2);
    expect(store.getState().failures).toEqual([]);
    runtime.dispose();
  });

  it("키트 소스에서 파츠 슬롯 카드는 그 프리셋을 입힌 임시 키트 소스(헤어 LOD1)로, 파라미터 슬롯 카드는 소스 없이 요청한다", async () => {
    const { kit } = fakeKit();
    const engine = createMockEngine({ thumbnailSources: true });
    const { runtime, store } = createMockRuntime({
      engine,
      overrides: { initialRecipe: createKitDefaultRecipe(), kit, presetUnavailableReasonKo },
    });
    runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    await runtime.thumbnails.idle();
    const requests = engine.calls.filter((call) => call.method === "renderThumbnail").map((call) => call.args[0] as ThumbnailRequest);
    const partSlots: readonly string[] = KIT_PART_SLOTS;
    const slotOf = (request: ThumbnailRequest): string => request.presetId.slice(0, request.presetId.indexOf("/"));
    expect(requests.length).toBe(APPEARANCE_SLOT_KINDS.reduce((sum, slot) => sum + runtime.catalog.bySlot(slot).length, 0));
    for (const request of requests) {
      if (partSlots.includes(slotOf(request))) {
        expect(request.source?.kind).toBe("kit");
        const plan: KitPlan | undefined = request.source?.kind === "kit" ? request.source.plan : undefined;
        // 그 카드의 프리셋이 계획에 들어 있고, 헤어는 가벼운 LOD1로 받는다
        expect(plan?.parts.map((part) => part.id)).toContain(request.presetId);
        expect(plan?.hairLodPolicy.preferredLod).toBe(1);
      } else {
        expect("source" in request).toBe(false);
      }
    }
    expect(Object.values(store.getState().thumbnails).every((entry) => entry.status === "ready")).toBe(true);
    runtime.dispose();
  });

  it("프리셋 단위로 미제공인 카드(남성 베이스의 미제작 헤어 등)는 썸네일을 요청하지 않는다", async () => {
    const { kit } = fakeKit();
    const engine = createMockEngine({ thumbnailSources: true });
    const { runtime, store } = createMockRuntime({
      engine,
      overrides: { initialRecipe: createKitDefaultRecipe("male"), kit, presetUnavailableReasonKo },
    });
    runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    await runtime.thumbnails.idle();
    const capabilities = store.getState().capabilities;
    expect(capabilities.hair.status).toBe("partial");
    const unavailable = Object.keys(capabilities.hair.unavailablePresets ?? {});
    expect(unavailable).toContain("hair/twin-tail");
    const requested = new Set(engine.calls.filter((call) => call.method === "renderThumbnail").map((call) => (call.args[0] as ThumbnailRequest).presetId));
    // 필수 파츠는 요청하고, 미제공 프리셋은 요청하지 않으며 캐시 항목도 만들지 않는다
    expect(requested.has("hair/soft-bob")).toBe(true);
    for (const presetId of unavailable) {
      expect(requested.has(presetId as ThumbnailRequest["presetId"])).toBe(false);
      expect(store.getState().thumbnails[presetId as ThumbnailRequest["presetId"]]).toBeUndefined();
    }
    // 직접 요청해도 걸러진다(드라이버·패널 어느 경로든 같은 스케줄러를 지난다)
    runtime.thumbnails.request("hair/twin-tail");
    await runtime.thumbnails.idle();
    expect(engine.calls.filter((call) => call.method === "renderThumbnail" && (call.args[0] as ThumbnailRequest).presetId === "hair/twin-tail")).toHaveLength(0);
    runtime.dispose();
  });

  it("슬롯 전체가 미제공인 카드(남성 액세서리 0/6)는 프리셋 단위 판정 포트 없이도 썸네일을 요청하지 않는다(임시 키트 소스를 만들다 failed가 되지 않는다)", async () => {
    const { kit } = fakeKit();
    const engine = createMockEngine({ thumbnailSources: true });
    const { runtime, store } = createMockRuntime({ engine, overrides: { initialRecipe: createKitDefaultRecipe("male"), kit } });
    runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    await runtime.thumbnails.idle();
    const capability = store.getState().capabilities.accessory;
    expect(capability.status).toBe("unavailable");
    // 슬롯 단위 미제공은 unavailablePresets 없이 슬롯 상태만으로 선언된다(judgePartSlot 규칙 그대로)
    expect(capability.unavailablePresets).toBeUndefined();
    const accessoryIds = runtime.catalog.bySlot("accessory").map((entry) => entry.id);
    expect(accessoryIds.length).toBeGreaterThan(0);
    const requested = engine.calls.filter((call) => call.method === "renderThumbnail").map((call) => (call.args[0] as ThumbnailRequest).presetId);
    for (const presetId of accessoryIds) {
      expect(requested).not.toContain(presetId);
      expect(store.getState().thumbnails[presetId]).toBeUndefined();
    }
    // 직접 요청해도 걸러진다
    runtime.thumbnails.request(accessoryIds[0] as ThumbnailRequest["presetId"]);
    await runtime.thumbnails.idle();
    expect(engine.calls.filter((call) => call.method === "renderThumbnail" && accessoryIds.includes((call.args[0] as ThumbnailRequest).presetId))).toHaveLength(0);
    // 제공되는 슬롯의 카드는 그대로 그려진다
    expect(requested).toContain("hair/soft-bob");
    expect(store.getState().failures).toEqual([]);
    runtime.dispose();
  });

  it("capability 차단은 factory 미호출 + failed 상태로 노출된다", async () => {
    const { runtime, store, factory } = createMockRuntime({
      decideBackend: async (backend) => ({ ok: false, backend, code: "webgpu-unsupported", reasonKo: "이 브라우저는 WebGPU를 지원하지 않습니다." }),
    });
    await runtime.engineSession.select("webgpu", canvasStub());
    expect(factory.calls).toHaveLength(0);
    expect(store.getState().engine).toMatchObject({ phase: "failed", failure: { code: "webgpu-unsupported" } });
  });

  it("능력 맵 초기값은 소스 종류에서 정한다(절차 = 전부 지원, 제작 패키지 = 로드 전까지 미지원)", () => {
    const procedural = createMockRuntime();
    expect(procedural.store.getState().capabilities).toBe(ALL_AVAILABLE_CAPABILITIES);
    const base = createDefaultRecipe();
    const pkg = createMockRuntime({
      overrides: { initialRecipe: { ...base, source: { kind: "package", characterId: "orion", sha256: FIXTURE_GLB_SHA256 } } },
    });
    expect(pkg.store.getState().capabilities).toBe(ALL_UNAVAILABLE_CAPABILITIES);
  });

  it("buildThumbnailSource는 engine.thumbnailSources가 true이고 현재 소스가 절차 소스일 때만 프리셋 레시피로 불린다", async () => {
    const seen: Array<{ slot: string; hair: string | null }> = [];
    const engine = createMockEngine({ thumbnailSources: true });
    const { runtime } = createMockRuntime({
      engine,
      overrides: {
        buildThumbnailSource(recipe, slot) {
          seen.push({ slot, hair: recipe.slots.hair });
          return slot === "hair" ? { kind: "procedural", model: minimalHumanoidModelFixture() } : null;
        },
      },
    });
    runtime.start();
    await runtime.engineSession.select("webgpu", canvasStub());
    await runtime.applyLoop.flush();
    await runtime.thumbnails.idle();
    // 헤어 카드는 그 프리셋을 현재 레시피에 적용한 레시피로 불린다
    const hairPresets = runtime.catalog.bySlot("hair").map((entry) => entry.id);
    expect(seen.filter((entry) => entry.slot === "hair").map((entry) => entry.hair).sort()).toEqual([...hairPresets].sort());
    const requests = engine.calls.filter((call) => call.method === "renderThumbnail").map((call) => call.args[0] as { presetId: string; source?: unknown });
    expect(requests.filter((request) => request.source !== undefined).every((request) => request.presetId.startsWith("hair/"))).toBe(true);
    expect(requests.some((request) => request.source !== undefined)).toBe(true);
    runtime.dispose();
  });
});
