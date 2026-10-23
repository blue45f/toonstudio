/**
 * 키트 플랜 등록소. 제작 패키지의 `package-plan-registry.ts`와 같은 자리에 놓이는 키트용 짝이다.
 *
 * 하는 일
 *  - `ensure(source)`: `kit.json`을 fetch·검증하고(KT-02 `loadKitManifestFlow`) 같은 요청은 한 번만 받도록 캐시한다(동시 호출 합침).
 *  - `plan(recipe)`: 캐시된 manifest로 레시피 슬롯 선택(+ 키트 v2는 옷장 층·추가 소품)을 `KitPlan`으로 만든다(`buildKitPlanDetailed`).
 *
 * 키트 v2(`toonstudio.character-kit/2`, 2026-10-23 A-1): 로더가 v2 manifest를 돌려주면 원본과 v1 형식 보기(`legacyView`)를 함께 둔다.
 *  - `plan`은 언제나 원본으로 만든다(v2면 `custom`이 실린 계획).
 *  - `ensure`·`peek`·`loaded`는 v1 형식만 아는 소비자(PackagePanel·ParamPanel)용이라 v2에서는 v1 보기를 돌려준다(출처·슬롯 파츠 표·베이스 키·슬롯 능력은 원본과 같다).
 *  - v2 원본이 필요한 소비자(옷장 UI 등)는 `ensureAny`·`peekAny`를 쓴다.
 *
 * 포트 주입: 셸(`app/shell`)은 영역 모듈을 직접 import하지 않으므로 `kit.json` 로더와 계획 빌더는 composition이 꽂는다.
 * 아래 `KitManifestLoader`·`KitPlanBuilder`는 `domains/authored/kit-load-flow.ts`·`kit-plan.ts`의 시그니처와 구조적으로 같은 타입이다
 * (임시 재선언 — 영역 간 교차 import를 피하기 위함).
 *
 * 실패는 전부 `LabFailure{code, reasonKo}`를 throw한다. 절차 소스로 자동 대체하지 않는다(AGENTS.md 3절 9항, 계약 6절).
 * 실패한 로드는 캐시하지 않는다 — 같은 실패를 다시 시도하는 일은 적용 루프의 `retrySource()`가 정하고, 그때 이 등록소는 다시 받는다.
 */
import { failVisible, isLabFailure } from "../../contracts";

import type { AccessoryInstance, CharacterRecipe, KitBaseId, KitManifest, KitManifestV2, KitPlan, LabFailure, RecipeSource, SlotKind, Wardrobe } from "../../contracts";

/** 레시피 `source` 중 키트 종류 */
export type KitRecipeSource = Extract<RecipeSource, { readonly kind: "kit" }>;

/** `kit.json` 로드 요청(레시피 source에서 오는 필드) */
export interface KitManifestRequest {
  readonly kitId: string;
  readonly kitVersion: number;
  /** 있으면 `kit.json` 바이트의 SHA-256과 대조한다 */
  readonly manifestSha256?: string;
}

/** 로더 결과. `version`이 없으면 v1이다(기존 로더·가짜 로더 호환). v2는 v1 형식 보기(`legacyView`)를 함께 싣는다. */
export type KitManifestOutcome =
  | { readonly ok: true; readonly version?: 1; readonly manifest: KitManifest; readonly rootUrl?: string }
  | { readonly ok: true; readonly version: 2; readonly manifest: KitManifestV2; readonly legacyView: KitManifest; readonly rootUrl?: string }
  | { readonly ok: false; readonly failure: LabFailure };

/** 받아 둔 원본 manifest(v1·v2) */
export type LoadedKitManifest = { readonly version: 1; readonly manifest: KitManifest } | { readonly version: 2; readonly manifest: KitManifestV2 };

/** domains/authored/kit-loader.browser `loadKitManifest` 와 같은 모양 */
export type KitManifestLoader = (request: KitManifestRequest) => Promise<KitManifestOutcome>;

export interface KitPlanBuildSource {
  readonly kitId: string;
  readonly kitVersion: number;
  readonly baseId: KitBaseId;
}

/** domains/authored/kit-plan-common `KitPlanWardrobe`와 같은 모양(레시피 `wardrobe`를 그대로 넘긴다) */
export type KitPlanBuildWardrobe = Readonly<Pick<Wardrobe, "inner" | "outer" | "legwear">> & {
  readonly accessories: ReadonlyArray<Pick<AccessoryInstance, "id" | "presetId">>;
};

export interface KitPlanBuildOptions {
  readonly rootUrl?: string;
  readonly preferredHairLod?: number;
  readonly now?: number;
  readonly wardrobe?: KitPlanBuildWardrobe;
}

export type KitPlanOutcome = { readonly ok: true; readonly plan: KitPlan } | { readonly ok: false; readonly failure: LabFailure };

/** domains/authored/kit-plan `buildKitPlanDetailed` 와 같은 모양 */
export type KitPlanBuilder = (
  manifest: KitManifest | KitManifestV2,
  source: KitPlanBuildSource,
  slots: Readonly<Partial<Record<SlotKind, string | null>>>,
  options?: KitPlanBuildOptions,
) => KitPlanOutcome;

export interface KitPlanRegistryDeps {
  readonly loadManifest: KitManifestLoader;
  readonly buildPlan: KitPlanBuilder;
  readonly now?: () => number;
}

export interface KitPlanRequestOptions {
  /** 헤어 LOD 선호(기본 0). 지오메트리 카드 썸네일의 임시 리그는 1을 쓴다. */
  readonly preferredHairLod?: number;
  /**
   * 레시피 옷장(층·추가 소품)을 계획에 넣을지(기본 "recipe"). 키트 v2에서만 의미가 있다 — 슬롯 카드 썸네일처럼 슬롯 파츠만 보여야 하는
   * 임시 리그는 "none"을 준다(아우터 층이 상의 카드를 가리지 않게).
   */
  readonly wardrobe?: "recipe" | "none";
}

export interface KitPlanRegistry {
  /** `kit.json`을 받아 검증한다(캐시·동시 호출 합침). 실패하면 LabFailure를 throw하고 캐시하지 않는다. v2는 v1 형식 보기를 돌려준다. */
  ensure(source: KitRecipeSource): Promise<KitManifest>;
  /** `ensure`와 같은 캐시로 원본 manifest(v1·v2)를 돌려준다. */
  ensureAny(source: KitRecipeSource): Promise<LoadedKitManifest>;
  /** 레시피의 키트 소스와 슬롯 선택(+ 옷장)으로 계획을 만든다. 키트 소스가 아니거나 파츠가 없으면 LabFailure를 throw한다. */
  plan(recipe: CharacterRecipe, options?: KitPlanRequestOptions): Promise<KitPlan>;
  /** 이미 받은 manifest(없으면 undefined, v2는 v1 형식 보기). 출처·라이선스 표시처럼 동기 조회가 필요한 패널용. */
  peek(source: KitRecipeSource): KitManifest | undefined;
  /** 이미 받은 원본 manifest(v1·v2) */
  peekAny(source: KitRecipeSource): LoadedKitManifest | undefined;
  /** 받아 둔 manifest 전부(v2는 v1 형식 보기) */
  loaded(): readonly KitManifest[];
  /** 캐시를 비운다(다시 불러오기). 진행 중인 요청의 결과는 버려진다. */
  clear(): void;
  subscribe(listener: () => void): () => void;
}

interface Loaded {
  readonly original: LoadedKitManifest;
  /** v1 형식 보기(v1은 원본 그대로) */
  readonly legacy: KitManifest;
  readonly rootUrl: string | undefined;
}

interface Entry {
  readonly promise: Promise<Loaded>;
  loaded: Loaded | null;
}

function cacheKey(source: KitRecipeSource): string {
  return `${source.kitId}@${source.kitVersion}#${source.manifestSha256 ?? "-"}`;
}

function loadedOf(outcome: Extract<KitManifestOutcome, { readonly ok: true }>): Loaded {
  if (outcome.version === 2) return { original: { version: 2, manifest: outcome.manifest }, legacy: outcome.legacyView, rootUrl: outcome.rootUrl };
  return { original: { version: 1, manifest: outcome.manifest }, legacy: outcome.manifest, rootUrl: outcome.rootUrl };
}

export function createKitPlanRegistry(deps?: KitPlanRegistryDeps): KitPlanRegistry {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const now = (): number | undefined => deps?.now?.();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const load = (source: KitRecipeSource, port: KitPlanRegistryDeps): Promise<Loaded> => {
    const key = cacheKey(source);
    const existing = entries.get(key);
    if (existing) return existing.promise;
    const request: KitManifestRequest = {
      kitId: source.kitId,
      kitVersion: source.kitVersion,
      ...(source.manifestSha256 !== undefined ? { manifestSha256: source.manifestSha256 } : {}),
    };
    const promise = (async (): Promise<Loaded> => {
      try {
        const outcome = await port.loadManifest(request);
        if (!outcome.ok) throw outcome.failure;
        return loadedOf(outcome);
      } catch (error) {
        if (isLabFailure(error)) throw error;
        throw failVisible("kit-manifest-fetch-failed", "키트 manifest(kit.json)를 불러오는 중 예기치 않은 오류가 났습니다.", error, now());
      }
    })();
    const entry: Entry = { promise, loaded: null };
    entries.set(key, entry);
    // 결과는 이 항목이 아직 캐시에 있을 때만 반영한다(clear() 뒤 늦게 끝난 요청이 캐시를 되살리지 않게). 거부는 호출자가 처리한다.
    promise.then(
      (loaded) => {
        if (entries.get(key) !== entry) return;
        entry.loaded = loaded;
        notify();
      },
      () => {
        if (entries.get(key) === entry) entries.delete(key);
      },
    );
    return promise;
  };

  const requirePort = (): KitPlanRegistryDeps => {
    if (!deps) {
      throw failVisible(
        "kit-loader-unavailable",
        "모듈식 키트 로더가 조립되지 않아 키트 소스를 불러올 수 없습니다. 절차 소스로 대체하지 않습니다.",
        undefined,
        now(),
      );
    }
    return deps;
  };

  return {
    async ensure(source) {
      const loaded = await load(source, requirePort());
      return loaded.legacy;
    },
    async ensureAny(source) {
      const loaded = await load(source, requirePort());
      return loaded.original;
    },
    async plan(recipe, options = {}) {
      const source = recipe.source;
      if (source.kind !== "kit") {
        throw failVisible("kit-source-kind", "키트 소스가 아닌 레시피입니다.", undefined, now());
      }
      const port = requirePort();
      const loaded = await load(source, port);
      const at = now();
      const built = port.buildPlan(loaded.original.manifest, { kitId: source.kitId, kitVersion: source.kitVersion, baseId: source.baseId }, recipe.slots, {
        ...(loaded.rootUrl !== undefined ? { rootUrl: loaded.rootUrl } : {}),
        ...(options.preferredHairLod !== undefined ? { preferredHairLod: options.preferredHairLod } : {}),
        ...(at !== undefined ? { now: at } : {}),
        ...(options.wardrobe === "none" ? {} : { wardrobe: recipe.wardrobe }),
      });
      if (!built.ok) throw built.failure;
      return built.plan;
    },
    peek(source) {
      return entries.get(cacheKey(source))?.loaded?.legacy;
    },
    peekAny(source) {
      return entries.get(cacheKey(source))?.loaded?.original;
    },
    loaded() {
      const result: KitManifest[] = [];
      for (const entry of entries.values()) if (entry.loaded) result.push(entry.loaded.legacy);
      return result;
    },
    clear() {
      if (entries.size === 0) return;
      entries.clear();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
