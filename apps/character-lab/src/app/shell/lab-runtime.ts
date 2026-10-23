/**
 * 셸 런타임 조립기. 영역 모듈(스토어 팩토리·플래너·프리셋·엔진 팩토리·물리·휴머노이드 빌더·키트 로더·패널)을 DI로 받아
 * 카탈로그 → 스토어 → 엔진 세션 → 적용 루프 → 썸네일 스케줄러/드라이버 → 패키지·키트 플랜 레지스트리를 묶는다.
 * 실제 모듈은 app/composition.ts가 넣고, 테스트는 testing/mock-*로 같은 조립을 돌린다.
 */
import {
  ALL_AVAILABLE_CAPABILITIES,
  ALL_UNAVAILABLE_CAPABILITIES,
  DEFAULT_FRAMING,
  createDefaultRecipe,
  createInitialLabState,
  failVisible,
  isKitPartSlot,
} from "../../contracts";

import { createApplyLoop } from "./apply-loop";
import { tryCreateCatalog } from "./catalog-registry";
import { createEngineSession } from "./engine-session";
import { createKitPlanRegistry } from "./kit-plan-registry";
import { createPackagePlanRegistry } from "./package-plan-registry";
import { createThumbnailDriver, fallbackThumbnailCacheKey, presetRecipe } from "./thumbnail-driver";
import { createThumbnailScheduler, defaultThumbnailPacing } from "./thumbnail-scheduler";
import { createUiStateStore } from "./ui-state";
import { createViewportRegistry } from "./viewport-registry";

import type { ApplyLoop } from "./apply-loop";
import type { CatalogSources } from "./catalog-registry";
import type { KitPlanRegistry, KitPlanRegistryDeps } from "./kit-plan-registry";
import type { PackagePlanRegistry } from "./package-plan-registry";
import type { ThumbnailPacing, ThumbnailScheduler } from "./thumbnail-scheduler";
import type { UiStateStore } from "./ui-state";
import type { ViewportRegistry } from "./viewport-registry";
import type {
  ApplyPlanner,
  BackendDecision,
  CharacterEngine,
  CharacterEngineFactory,
  CharacterRecipe,
  CharacterSource,
  EngineBackend,
  EngineSession,
  HumanoidModelData,
  LabFailure,
  LabState,
  LabStore,
  PhysicsProviderFactory,
  PresetCatalog,
  PresetId,
  ShadingMode,
  SlotCapability,
  SlotKind,
} from "../../contracts";
import type { ComponentType } from "react";

/** 영역 작업자가 만드는 패널(스펙 §6). 없는 패널은 InspectorTabs/WorkbenchLayout이 '미조립' 안내로 표시한다. */
export interface LabPanels {
  readonly SlotPanel?: ComponentType;
  readonly ParamPanel?: ComponentType;
  readonly PhysicsPanel?: ComponentType;
  readonly PosePanel?: ComponentType;
  readonly ExpressionPanel?: ComponentType;
  readonly ViewportPane?: ComponentType;
  readonly RenderPanel?: ComponentType;
  readonly PaintPanel?: ComponentType;
  readonly ExportPanel?: ComponentType;
  readonly VisionPanel?: ComponentType;
  readonly PackagePanel?: ComponentType;
}

export interface LabRuntimeDeps {
  /** state/lab-store.ts createLabStore */
  readonly createStore: (args: { catalog: PresetCatalog; planner: ApplyPlanner; initial: LabState }) => LabStore;
  /** state/apply-plan.ts planApply */
  readonly planner: ApplyPlanner;
  /** presets/APPEARANCE_PRESETS + animation/presets/PERFORMANCE_PRESETS */
  readonly catalogSources: CatalogSources;
  /** 단 하나의 `import("../render/babylon-character-engine")` (app/composition.ts) */
  readonly loadFactory: () => Promise<CharacterEngineFactory>;
  /** render/capability probeGpu + selectBackend — 요청 backend만 판정 */
  readonly decideBackend: (backend: EngineBackend) => Promise<BackendDecision>;
  /** physics/provider-factory */
  readonly physicsProviders: PhysicsProviderFactory;
  /** humanoid/humanoid-model.buildHumanoidModel(+ outfit 포트) */
  readonly buildProceduralSource: (recipe: CharacterRecipe) => Promise<HumanoidModelData> | HumanoidModelData;
  /**
   * humanoid/humanoid-model.geometryKeyOf — 절차 소스 재생성 키(헤어·의상·눈 스타일 슬롯 변경 = 소스 재생성).
   * 없으면 절차 소스는 엔진당 한 번만 만든다.
   */
  readonly proceduralGeometryKey?: (recipe: CharacterRecipe) => string;
  /**
   * 지오메트리 슬롯 프리셋(헤어·의상·눈 스타일 등) 카드 썸네일용 임시 소스. `recipe`는 그 프리셋을 현재 레시피에 적용한 것이다.
   * 지오메트리와 무관한 슬롯이면 null(현재 소스로 그린다). `engine.thumbnailSources`가 true인 엔진에서만 호출되고
   * 현재 소스가 절차 소스일 때만 쓴다(제작 패키지는 변형 소스를 만들 수 없다).
   */
  readonly buildThumbnailSource?: (recipe: CharacterRecipe, slot: SlotKind) => CharacterSource | null | Promise<CharacterSource | null>;
  /**
   * 모듈식 키트 소스 포트: `kit.json` 로더(domains/authored/kit-loader.browser `loadKitManifest`)와 계획 빌더(`buildKitPlanDetailed`).
   * 레시피 소스가 키트일 때 적용 루프가 `KitPlanRegistry`로 플랜을 만든다. 없으면 키트 소스는 `kit-loader-unavailable`로 실패한다
   * (절차 소스로 대체하지 않는다). 키트 지오메트리 슬롯 카드의 임시 소스도 이 포트로 만든다.
   */
  readonly kit?: KitPlanRegistryDeps;
  /**
   * state/apply-plan `presetUnavailableReasonKo` — 슬롯 능력의 프리셋 단위 미제공(`unavailablePresets`) 판정.
   * 미제공 프리셋 카드는 썸네일을 요청하지 않는다(요청하면 현재 캐릭터와 같은 그림이 캐시에 들어간다). 없으면 프리셋 단위로는 판정하지 않는다.
   * 슬롯 전체가 `unavailable`인 카드는 이 포트와 무관하게 요청하지 않는다.
   */
  readonly presetUnavailableReasonKo?: (capability: SlotCapability, presetId: PresetId) => string | null;
  /**
   * state/thumbnail-cache.thumbnailCacheKey. 없으면 셸 참조 구현.
   * 네 번째 인자로 카탈로그를 넘기면 해당 프리셋 patch가 덮어쓰는 필드를 키에서 빼 슬라이더 드래그 중 재생성이 줄어든다.
   */
  readonly thumbnailCacheKey?: (presetId: PresetId, recipe: CharacterRecipe, shadingMode: ShadingMode, catalog: PresetCatalog) => string;
  /**
   * 엔진에 소스가 (재)로드된 직후 호출(적용 루프·PackagePanel reloadSource 양쪽).
   * composition은 여기서 페인트 세션의 레이어를 새 엔진 텍스처로 다시 올린다(device lost 뒤 복원 포함).
   */
  readonly onSourceLoaded?: (engine: CharacterEngine, source: CharacterSource) => void;
  /**
   * 썸네일 스케줄러·적용 루프의 메인 스레드 양보 정책(조용해질 때까지 대기·작업 사이 양보·보이지 않는 카드는 유휴 시간). 생략하면
   * `defaultThumbnailPacing()`(실브라우저면 켜고 Node·jsdom이면 끈다), null이면 양보 없이 바로 이어서 그린다(P-01 이전 동작).
   */
  readonly thumbnailPacing?: ThumbnailPacing | null;
  readonly panels: LabPanels;
  readonly initialRecipe?: CharacterRecipe;
  readonly initTimeoutMs?: number;
  readonly now?: () => number;
}

export interface LabRuntime {
  readonly store: LabStore;
  readonly catalog: PresetCatalog;
  /** 카탈로그 불변식 위반(비어 있으면 통과). 위반은 failure 이벤트로도 노출된다. */
  readonly catalogFailures: readonly LabFailure[];
  readonly engineSession: EngineSession;
  readonly viewport: ViewportRegistry;
  readonly ui: UiStateStore;
  readonly thumbnails: ThumbnailScheduler;
  readonly applyLoop: ApplyLoop;
  readonly packagePlans: PackagePlanRegistry;
  /** 모듈식 키트 `kit.json`·플랜 등록소(출처·라이선스 표시, 다시 불러오기) */
  readonly kitPlans: KitPlanRegistry;
  readonly panels: LabPanels;
  /** 적용 루프·썸네일 드라이버 구독 시작. 반환 함수로 중지. */
  start(): () => void;
  /** 구독 중지 + 큐 비움 + 엔진 해제 */
  dispose(): void;
}

/** 키트 지오메트리 카드 썸네일의 임시 리그가 받는 헤어 LOD(카드 128px라 LOD1이면 충분하다) */
const KIT_THUMBNAIL_HAIR_LOD = 1;

/**
 * 절차 지오메트리 카드 임시 소스 캐시 크기. 소스는 지오메트리 키(`proceduralGeometryKey`)로만 달라지므로(파라미터·색·포즈는 플랜이 적용한다 — 적용 루프와 같은 규약)
 * 슬라이더·색·포즈를 바꿔도 같은 키의 모델을 다시 만들지 않는다. 실측(2026-10-23, Node): 세분 0단계 모델 1개 빌드 약 130 ms·2.3 MiB(헤어·의상 없음) —
 * 한 슬롯 카드 수(최대 10)를 넘지 않게 8개만 둔다(최근 사용 우선).
 */
export const THUMBNAIL_SOURCE_CACHE_LIMIT = 8;

export function createLabRuntime(deps: LabRuntimeDeps): LabRuntime {
  const now = deps.now ?? (() => Date.now());
  const catalogResult = tryCreateCatalog(deps.catalogSources, now());
  const catalog = catalogResult.catalog;
  const catalogFailures = catalogResult.ok ? [] : catalogResult.failures;

  const initialRecipe = deps.initialRecipe ?? createDefaultRecipe();
  // 능력 맵의 초기값은 소스 종류에서 정한다: 절차 휴머노이드는 15슬롯 전부 지원, 제작 패키지·키트는 로드(PackagePanel `source/set` 또는
  // 적용 루프의 `source/capabilities` 보고) 전까지 미지원. 키트의 능력은 `kit.json`을 받아야 규칙(`deriveKitCapabilities`)으로 계산되므로
  // 부팅 시점에는 알 수 없고, 엔진이 키트 플랜을 올리면 그 플랜의 능력 맵으로 맞춘다(계약 6절 2항).
  const initialCapabilities = initialRecipe.source.kind === "procedural" ? ALL_AVAILABLE_CAPABILITIES : ALL_UNAVAILABLE_CAPABILITIES;
  const store = deps.createStore({ catalog, planner: deps.planner, initial: createInitialLabState(initialRecipe, initialCapabilities) });
  for (const failure of catalogFailures) store.applyEvent({ type: "failure", failure });

  const innerSession = createEngineSession({
    loadFactory: deps.loadFactory,
    decideBackend: deps.decideBackend,
    physicsProviders: deps.physicsProviders,
    store,
    ...(deps.initTimeoutMs !== undefined ? { initTimeoutMs: deps.initTimeoutMs } : {}),
    now,
  });
  const packagePlans = createPackagePlanRegistry();
  const kitPlans = createKitPlanRegistry(deps.kit);
  const viewport = createViewportRegistry();
  const ui = createUiStateStore();
  // 메인 스레드 양보 정책: 썸네일 스케줄러와 적용 루프(지오메트리 빌드 ↔ 엔진 바인딩 사이)가 함께 쓴다.
  const pacing = deps.thumbnailPacing === undefined ? defaultThumbnailPacing() : deps.thumbnailPacing;

  const buildSource = async (recipe: CharacterRecipe): Promise<CharacterSource> => {
    if (recipe.source.kind === "package") {
      return { kind: "package", plan: packagePlans.resolve(recipe.source, now()) };
    }
    // 키트 소스: kit.json을 받아 검증한 뒤 베이스 + 선택 파츠 계획을 만든다. 실패(fetch·검증·버전·파츠 없음)는 LabFailure로 던져
    // 적용 루프가 failure 이벤트로 노출하며, 절차 소스로 대체하지 않는다.
    if (recipe.source.kind === "kit") {
      return { kind: "kit", plan: await kitPlans.plan(recipe) };
    }
    return { kind: "procedural", model: await deps.buildProceduralSource(recipe) };
  };

  const applyLoop = createApplyLoop({
    store,
    catalog,
    planner: deps.planner,
    engineSession: innerSession,
    buildSource,
    now,
    ...(deps.onSourceLoaded ? { onSourceLoaded: deps.onSourceLoaded } : {}),
    ...(deps.proceduralGeometryKey ? { proceduralGeometryKey: deps.proceduralGeometryKey } : {}),
    // "키트 다시 불러오기": kit.json 캐시를 비워 새로 받는다(실패한 로드는 캐시하지 않지만 성공한 로드는 남아 있다).
    beforeRetrySource: () => kitPlans.clear(),
    ...(pacing ? { yieldBeforeLoad: pacing.yieldToMain } : {}),
  });

  /** 패널이 reloadSource로 올린 패키지 플랜은 레지스트리에 등록하고 루프가 중복 로드하지 않도록 표시한다. */
  const engineSession: EngineSession = {
    select: (backend, canvas) => innerSession.select(backend, canvas),
    status: () => innerSession.status(),
    engine: () => innerSession.engine(),
    async reloadSource(source) {
      const capabilities = await innerSession.reloadSource(source);
      if (capabilities) {
        if (source.kind === "package") packagePlans.register(source.plan);
        const engine = innerSession.engine();
        if (engine) {
          applyLoop.markSourceLoaded(engine, source);
          deps.onSourceLoaded?.(engine, source);
        }
      }
      return capabilities;
    },
    subscribe: (listener) => innerSession.subscribe(listener),
    dispose: () => innerSession.dispose(),
  };

  const cacheKey = deps.thumbnailCacheKey ?? fallbackThumbnailCacheKey;

  /**
   * 지오메트리 키 → 임시 소스(만든 것만, 최근 사용 우선). 진행 중 빌드는 따로 두어 같은 키 요청이 한 빌드를 기다리게 한다.
   * null(지오메트리와 무관한 슬롯)·실패는 캐시하지 않는다 — null 항목이 캐시를 밀어내 실제 모델이 빠지지 않게.
   */
  const thumbnailSourceCache = new Map<string, CharacterSource>();
  const thumbnailSourceBuilds = new Map<string, Promise<CharacterSource | null>>();
  const proceduralThumbnailSource = (recipe: CharacterRecipe, slot: SlotKind): CharacterSource | null | Promise<CharacterSource | null> | undefined => {
    const build = deps.buildThumbnailSource;
    if (!build) return undefined;
    const geometryKey = deps.proceduralGeometryKey?.(recipe);
    if (geometryKey === undefined) return build(recipe, slot);
    const key = `${slot}|${geometryKey}`;
    const cached = thumbnailSourceCache.get(key);
    if (cached) {
      thumbnailSourceCache.delete(key);
      thumbnailSourceCache.set(key, cached);
      return cached;
    }
    const building = thumbnailSourceBuilds.get(key);
    if (building) return building;
    const pending = Promise.resolve(build(recipe, slot)).then(
      (source) => {
        thumbnailSourceBuilds.delete(key);
        if (!source) return source;
        thumbnailSourceCache.set(key, source);
        for (const oldest of thumbnailSourceCache.keys()) {
          if (thumbnailSourceCache.size <= THUMBNAIL_SOURCE_CACHE_LIMIT) break;
          thumbnailSourceCache.delete(oldest);
        }
        return source;
      },
      (error: unknown) => {
        thumbnailSourceBuilds.delete(key);
        throw error;
      },
    );
    thumbnailSourceBuilds.set(key, pending);
    return pending;
  };
  const scheduler = createThumbnailScheduler({
    ...(pacing ? { pacing } : {}),
    engine: () => innerSession.engine(),
    planForPreset(presetId) {
      const entry = catalog.get(presetId);
      if (!entry) throw failVisible("thumbnail-unknown-preset", `카탈로그에 없는 프리셋입니다: ${presetId}`, undefined, now());
      const state = store.getState();
      return deps.planner(presetRecipe(state.recipe, entry), state.capabilities, catalog);
    },
    cacheKeyFor(presetId) {
      const recipe = store.getState().recipe;
      return cacheKey(presetId, recipe, recipe.shading.mode, catalog);
    },
    framingFor(presetId) {
      const entry = catalog.get(presetId);
      return entry ? entry.thumbnailFraming : DEFAULT_FRAMING;
    },
    async sourceFor(presetId: PresetId) {
      const entry = catalog.get(presetId);
      if (!entry) return undefined;
      const state = store.getState();
      const source = state.recipe.source;
      if (source.kind === "kit") {
        // 키트: 파츠 슬롯(헤어·의상·신발·액세서리·홍채) 카드만 그 프리셋을 입힌 임시 키트 소스로 그린다. 얼굴·체형·표정·포즈 같은
        // 파라미터 슬롯은 현재 리그에 플랜을 일시 적용하는 기존 경로(소스 없음)를 쓴다. 헤어는 LOD1로 가볍게 받는다(계약 4.7·4.11).
        if (!isKitPartSlot(entry.slot)) return undefined;
        const plan = await kitPlans.plan(presetRecipe(state.recipe, entry), { preferredHairLod: KIT_THUMBNAIL_HAIR_LOD });
        return { kind: "kit", plan };
      }
      if (source.kind !== "procedural") return undefined;
      return proceduralThumbnailSource(presetRecipe(state.recipe, entry), entry.slot);
    },
    currentEntry: (presetId) => store.getState().thumbnails[presetId],
    onUpdate: (presetId, entry) => store.applyEvent({ type: "thumbnail/update", presetId, entry }),
  });
  // 소스가 제공하지 못하는 카드는 썸네일을 요청하지 않는다. 요청해도 플래너가 그 슬롯을 unsupported로 계획하거나(프리셋 단위 미제공) 키트가 임시
  // 소스를 만들지 못해(`kit-part-missing`) 카드가 failed로 끝나거나 현재 캐릭터와 같은 그림이 캐시에 들어가기 때문이다. 판정은 능력 맵 하나로 한다:
  //  1) 슬롯 전체 미제공(`status === "unavailable"`, 예: 남성 베이스 액세서리 0/6) — 슬롯의 모든 프리셋 카드
  //  2) 프리셋 단위 미제공(`unavailablePresets`, 예: 남성 베이스의 미제작 헤어) — 그 카드만
  // 대기 중인 요청도 취소한다(드라이버·패널 어느 쪽 요청이든 여기서 걸러진다). `judgePartSlot`은 0/N 슬롯에 `unavailablePresets`를 채우지 않으므로
  // 슬롯 단위 판정이 이 가드의 책임이다(능력 선언 `compareKitCapabilities`는 그대로).
  const isPresetUnavailable = (presetId: PresetId): boolean => {
    const entry = catalog.get(presetId);
    if (!entry) return false;
    const capability = store.getState().capabilities[entry.slot];
    if (capability.status === "unavailable") return true;
    if (!deps.presetUnavailableReasonKo) return false;
    return deps.presetUnavailableReasonKo(capability, presetId) !== null;
  };
  const thumbnails: ThumbnailScheduler = {
    ...scheduler,
    request(presetId, options) {
      if (isPresetUnavailable(presetId)) {
        scheduler.cancel(presetId);
        return;
      }
      scheduler.request(presetId, options);
    },
  };
  const driver = createThumbnailDriver({ store, catalog, engineSession: innerSession, scheduler: thumbnails, ui, applyLoop });

  let stop: (() => void) | null = null;
  return {
    store,
    catalog,
    catalogFailures,
    engineSession,
    viewport,
    ui,
    thumbnails,
    applyLoop,
    packagePlans,
    kitPlans,
    panels: deps.panels,
    start() {
      stop?.();
      const stopLoop = applyLoop.start();
      const stopDriver = driver.start();
      const stopAll = (): void => {
        stopLoop();
        stopDriver();
        if (stop === stopAll) stop = null;
      };
      stop = stopAll;
      return stopAll;
    },
    dispose() {
      stop?.();
      thumbnails.clear();
      thumbnailSourceCache.clear();
      thumbnailSourceBuilds.clear();
      innerSession.dispose();
    },
  };
}
