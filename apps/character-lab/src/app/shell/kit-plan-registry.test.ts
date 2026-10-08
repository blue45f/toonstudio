import { describe, expect, it } from "vitest";

import { KIT_ASSET_ROOT, createDefaultRecipe, createKitDefaultRecipe, failVisible, isLabFailure } from "../../contracts";
import { loadKitManifestFlow } from "../../domains/authored/kit-load-flow";
import { buildKitPlanDetailed } from "../../domains/authored/kit-plan";
import { kitManifestFixture, kitManifestJson } from "../../testing/kit-fixtures";

import { createKitPlanRegistry } from "./kit-plan-registry";

import type { KitPlanRegistryDeps } from "./kit-plan-registry";
import type { CharacterRecipe, LabFailure } from "../../contracts";
import type { KitFetchPort } from "../../domains/authored/kit-load-flow";

const MANIFEST_URL = `${KIT_ASSET_ROOT}/kit.json`;

interface FakeKit {
  readonly deps: KitPlanRegistryDeps;
  readonly fetches: string[];
  /** 다음 fetch부터 켜고 끈다 */
  readonly control: { failFetch: boolean };
}

/** 실제 로드 흐름(`loadKitManifestFlow`: zod 검증 + 능력 선언 대조)과 실제 계획 빌더를 가짜 fetch 포트로 묶는다. */
function fakeKit(json: Record<string, unknown> = kitManifestJson()): FakeKit {
  const fetches: string[] = [];
  const control = { failFetch: false };
  const port: KitFetchPort = {
    fetchJson: async (url) => {
      fetches.push(url);
      if (control.failFetch || url !== MANIFEST_URL) return { ok: false, status: 404, message: "404 Not Found" };
      return { ok: true, json };
    },
    fetchBytes: async (url) => {
      fetches.push(url);
      return { ok: false, status: 404, message: "404 Not Found" };
    },
  };
  return {
    fetches,
    control,
    deps: {
      loadManifest: (request) => loadKitManifestFlow(port, request, { sha256: async () => "0".repeat(64), now: 1 }),
      buildPlan: buildKitPlanDetailed,
      now: () => 1,
    },
  };
}

async function failureOf(promise: Promise<unknown>): Promise<LabFailure> {
  try {
    await promise;
  } catch (error) {
    if (isLabFailure(error)) return error;
    throw error;
  }
  throw new Error("LabFailure가 던져져야 합니다.");
}

describe("app/shell/kit-plan-registry", () => {
  it("합성 키트 fixture가 실제 로드 흐름(zod + 능력 선언 대조)을 통과하고 계획을 만든다", async () => {
    const { deps } = fakeKit();
    const registry = createKitPlanRegistry(deps);
    const plan = await registry.plan(createKitDefaultRecipe());
    expect(plan.baseId).toBe("female");
    expect(plan.parts.map((part) => part.id)).toEqual(["base/female", "hair/soft-bob", "top/tee", "bottom/jeans", "shoes/sneakers", "irises/round-large"]);
    expect(plan.parts[0]?.url).toBe(`${KIT_ASSET_ROOT}/bases/female.glb`);
    expect(plan.hairLodPolicy.preferredLod).toBe(0);
    // 여성은 어휘 전부를 제공하므로 15슬롯이 모두 available
    expect(Object.values(plan.capabilities).every((capability) => capability.status === "available")).toBe(true);
  });

  it("남성 베이스는 필수 파츠만 제공하고 미제공 프리셋을 능력 맵의 unavailablePresets로 선언한다", async () => {
    const { deps } = fakeKit();
    const registry = createKitPlanRegistry(deps);
    const recipe: CharacterRecipe = { ...createKitDefaultRecipe("male") };
    const plan = await registry.plan(recipe);
    expect(plan.baseId).toBe("male");
    expect(plan.capabilities.hair.status).toBe("partial");
    expect(plan.capabilities.hair.unavailablePresets?.["hair/twin-tail"]).toBe("남성 핏 미제작");
    expect(plan.capabilities.hair.unavailablePresets?.["hair/soft-bob"]).toBeUndefined();
  });

  it("같은 요청은 kit.json을 한 번만 받는다(동시 호출 합침 + 캐시)", async () => {
    const { deps, fetches } = fakeKit();
    const registry = createKitPlanRegistry(deps);
    const recipe = createKitDefaultRecipe();
    await Promise.all([registry.plan(recipe), registry.plan(recipe), registry.ensure({ kind: "kit", kitId: "toonstudio-kit-v1", baseId: "female", kitVersion: 1 })]);
    await registry.plan({ ...recipe, slots: { ...recipe.slots, hair: "hair/hime-cut" } });
    expect(fetches).toEqual([MANIFEST_URL]);
  });

  it("실패한 로드는 캐시하지 않는다 — 다시 시도하면 새로 받는다", async () => {
    const { deps, fetches, control } = fakeKit();
    const registry = createKitPlanRegistry(deps);
    control.failFetch = true;
    const failure = await failureOf(registry.plan(createKitDefaultRecipe()));
    expect(failure.code).toBe("kit-manifest-fetch-failed");
    expect(registry.loaded()).toEqual([]);
    control.failFetch = false;
    const plan = await registry.plan(createKitDefaultRecipe());
    expect(plan.kitId).toBe("toonstudio-kit-v1");
    expect(fetches).toEqual([MANIFEST_URL, MANIFEST_URL]);
  });

  it("로더가 LabFailure가 아닌 예외를 던져도 한글 사유의 kit-manifest-fetch-failed로 바꿔 던진다", async () => {
    const { deps } = fakeKit();
    const registry = createKitPlanRegistry({
      ...deps,
      loadManifest: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const failure = await failureOf(registry.plan(createKitDefaultRecipe()));
    expect(failure.code).toBe("kit-manifest-fetch-failed");
    expect(failure.reasonKo).toContain("예기치 않은 오류");
  });

  it("clear()는 캐시를 비워 다음 요청에서 다시 받고, 구독자에게 알린다", async () => {
    const { deps, fetches } = fakeKit();
    const registry = createKitPlanRegistry(deps);
    let notified = 0;
    registry.subscribe(() => {
      notified += 1;
    });
    const source = createKitDefaultRecipe().source;
    if (source.kind !== "kit") throw new Error("키트 소스여야 합니다.");
    expect(registry.peek(source)).toBeUndefined();
    await registry.ensure(source);
    expect(registry.peek(source)?.kitId).toBe("toonstudio-kit-v1");
    expect(registry.loaded()).toHaveLength(1);
    expect(notified).toBe(1);
    registry.clear();
    expect(registry.peek(source)).toBeUndefined();
    expect(notified).toBe(2);
    await registry.ensure(source);
    expect(fetches).toHaveLength(2);
  });

  it("clear() 뒤 늦게 끝난 요청은 캐시를 되살리지 않는다", async () => {
    const gate: { release: (() => void) | null } = { release: null };
    const { deps } = fakeKit();
    const registry = createKitPlanRegistry({
      ...deps,
      loadManifest: () =>
        new Promise((resolve) => {
          gate.release = () => resolve({ ok: true, manifest: kitManifestFixture() });
        }),
    });
    const source = createKitDefaultRecipe().source;
    if (source.kind !== "kit") throw new Error("키트 소스여야 합니다.");
    const pending = registry.ensure(source);
    registry.clear();
    gate.release?.();
    await pending;
    await Promise.resolve();
    expect(registry.peek(source)).toBeUndefined();
  });

  it("레시피의 manifestSha256을 로더 요청에 그대로 넘기고, 해시가 다르면 캐시를 따로 쓴다", async () => {
    const requests: Array<{ kitId: string; kitVersion: number; manifestSha256?: string }> = [];
    const registry = createKitPlanRegistry({
      loadManifest: async (request) => {
        requests.push(request);
        return { ok: true, manifest: kitManifestFixture() };
      },
      buildPlan: buildKitPlanDetailed,
    });
    const base = createKitDefaultRecipe();
    const withHash = (hash: string): CharacterRecipe => ({ ...base, source: { kind: "kit", kitId: "toonstudio-kit-v1", baseId: "female", kitVersion: 1, manifestSha256: hash } });
    await registry.plan(base);
    await registry.plan(withHash("a".repeat(64)));
    await registry.plan(withHash("a".repeat(64)));
    await registry.plan(withHash("b".repeat(64)));
    expect(requests).toEqual([
      { kitId: "toonstudio-kit-v1", kitVersion: 1 },
      { kitId: "toonstudio-kit-v1", kitVersion: 1, manifestSha256: "a".repeat(64) },
      { kitId: "toonstudio-kit-v1", kitVersion: 1, manifestSha256: "b".repeat(64) },
    ]);
  });

  it("레시피 kitVersion이 kit.json과 다르면 kit-version-mismatch로 실패하고 다른 버전으로 대체하지 않는다", async () => {
    const { deps } = fakeKit(kitManifestJson({ kitVersion: 2 }));
    const registry = createKitPlanRegistry(deps);
    const failure = await failureOf(registry.plan(createKitDefaultRecipe()));
    expect(failure.code).toBe("kit-version-mismatch");
    expect(failure.reasonKo).toContain("키트 버전");
  });

  it("선택한 프리셋이 베이스에 없으면 kit-part-missing으로 실패하고 다른 프리셋으로 바꾸지 않는다", async () => {
    const { deps } = fakeKit();
    const registry = createKitPlanRegistry(deps);
    const male = createKitDefaultRecipe("male");
    const failure = await failureOf(registry.plan({ ...male, slots: { ...male.slots, hair: "hair/twin-tail" } }));
    expect(failure.code).toBe("kit-part-missing");
    expect(failure.reasonKo).toContain("hair/twin-tail");
    expect(failure.reasonKo).toContain("남성 핏 미제작");
  });

  it("썸네일 임시 리그는 헤어 LOD1을 요청할 수 있다", async () => {
    const { deps } = fakeKit();
    const registry = createKitPlanRegistry(deps);
    const plan = await registry.plan(createKitDefaultRecipe(), { preferredHairLod: 1 });
    expect(plan.hairLodPolicy.preferredLod).toBe(1);
  });

  it("키트 소스가 아닌 레시피는 kit-source-kind로 실패한다(절차 소스로 대체하지 않는다)", async () => {
    const { deps, fetches } = fakeKit();
    const registry = createKitPlanRegistry(deps);
    const failure = await failureOf(registry.plan(createDefaultRecipe()));
    expect(failure.code).toBe("kit-source-kind");
    expect(fetches).toEqual([]);
  });

  it("로더가 조립되지 않았으면 kit-loader-unavailable로 실패한다(무음 대체 없음)", async () => {
    const registry = createKitPlanRegistry();
    const failure = await failureOf(registry.plan(createKitDefaultRecipe()));
    expect(failure.code).toBe("kit-loader-unavailable");
    expect(failure.reasonKo).toContain("절차 소스로 대체하지 않습니다");
    const source = createKitDefaultRecipe().source;
    if (source.kind !== "kit") throw new Error("키트 소스여야 합니다.");
    expect((await failureOf(registry.ensure(source))).code).toBe("kit-loader-unavailable");
  });

  it("로더가 돌려준 LabFailure는 그대로 던진다", async () => {
    const original = failVisible("kit-manifest-invalid", "kit.json 검증 실패", undefined, 1);
    const registry = createKitPlanRegistry({ loadManifest: async () => ({ ok: false, failure: original }), buildPlan: buildKitPlanDetailed });
    expect(await failureOf(registry.plan(createKitDefaultRecipe()))).toBe(original);
  });
});
