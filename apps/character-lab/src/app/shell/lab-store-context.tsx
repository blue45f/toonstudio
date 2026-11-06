/**
 * LabState/dispatch/engine React 컨텍스트.
 * Babylon 객체는 React state에 넣지 않는다 — 엔진은 `useEngineSession().engine()`으로 ref 접근한다.
 * 패널 단위 테스트는 testing/mock-store.tsx의 MockLabProvider로 같은 컨텍스트를 채운다.
 *
 * 필수 값은 store·catalog·engineSession 세 가지다. 뷰포트 레지스트리·UI 상태·썸네일 스케줄러·
 * 패키지 플랜 레지스트리·키트 플랜 등록소·적용 루프는 셸이 주입하며, 주지 않으면 독립 인스턴스(또는 null)를 쓴다.
 * 키트 플랜 등록소는 로더·계획 빌더 포트가 있어야 의미가 있으므로 기본 인스턴스를 만들지 않고 null이다(`useKitPlans()`).
 */
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { shallowEqual, useLabStoreSelector, type EqualityFn } from "../../state/useLabStore";

import { createPackagePlanRegistry } from "./package-plan-registry";
import { createUiStateStore } from "./ui-state";
import { createViewportRegistry } from "./viewport-registry";

import type { ApplyLoop, ApplyLoopSnapshot } from "./apply-loop";
import type { KitPlanRegistry } from "./kit-plan-registry";
import type { PackagePlanRegistry } from "./package-plan-registry";
import type { ThumbnailScheduler } from "./thumbnail-scheduler";
import type { UiState, UiStateStore } from "./ui-state";
import type { ViewportRegistry } from "./viewport-registry";
import type { ApplyPlan, EngineSession, LabCommand, LabState, LabStore, PresetCatalog } from "../../contracts";

export { shallowEqual, type EqualityFn };

export interface LabContextValue {
  readonly store: LabStore;
  readonly catalog: PresetCatalog;
  readonly engineSession: EngineSession;
  readonly viewport: ViewportRegistry;
  readonly ui: UiStateStore;
  /** 셸이 구동하는 썸네일 스케줄러. 없으면 null(패널은 LabState.thumbnails만 읽어도 된다). */
  readonly thumbnails: ThumbnailScheduler | null;
  readonly packagePlans: PackagePlanRegistry;
  /** 모듈식 키트 등록소(kit.json 캐시·계획). 조립되지 않았으면 null. */
  readonly kitPlans: KitPlanRegistry | null;
  /** 적용 루프(마지막 플랜·영수증 구독). 없으면 null. */
  readonly applyLoop: ApplyLoop | null;
}

const LabStoreContext = createContext<LabContextValue | null>(null);

export interface LabStoreProviderProps {
  readonly store: LabStore;
  readonly catalog: PresetCatalog;
  readonly engineSession: EngineSession;
  readonly viewport?: ViewportRegistry;
  readonly ui?: UiStateStore;
  readonly thumbnails?: ThumbnailScheduler | null;
  readonly packagePlans?: PackagePlanRegistry;
  readonly kitPlans?: KitPlanRegistry | null;
  readonly applyLoop?: ApplyLoop | null;
  readonly children?: ReactNode;
}

export function LabStoreProvider({ store, catalog, engineSession, viewport, ui, thumbnails, packagePlans, kitPlans, applyLoop, children }: LabStoreProviderProps) {
  const fallbackViewport = useMemo(() => viewport ?? createViewportRegistry(), [viewport]);
  const fallbackUi = useMemo(() => ui ?? createUiStateStore(), [ui]);
  const fallbackPlans = useMemo(() => packagePlans ?? createPackagePlanRegistry(), [packagePlans]);
  const value = useMemo<LabContextValue>(
    () => ({
      store,
      catalog,
      engineSession,
      viewport: fallbackViewport,
      ui: fallbackUi,
      thumbnails: thumbnails ?? null,
      packagePlans: fallbackPlans,
      kitPlans: kitPlans ?? null,
      applyLoop: applyLoop ?? null,
    }),
    [store, catalog, engineSession, fallbackViewport, fallbackUi, thumbnails, fallbackPlans, kitPlans, applyLoop],
  );
  return <LabStoreContext.Provider value={value}>{children}</LabStoreContext.Provider>;
}

/** Provider 밖에서 쓰면 즉시 throw(무음 기본값 금지). */
export function useLabContext(): LabContextValue {
  const value = useContext(LabStoreContext);
  if (!value) {
    throw new Error("LabStoreProvider 밖에서 lab 컨텍스트 훅을 호출했습니다.");
  }
  return value;
}

export function useLabStore(): LabStore {
  return useLabContext().store;
}

const identityState = (state: LabState): LabState => state;

function isSameCoreLabState(a: LabState, b: LabState): boolean {
  return (
    a.recipe === b.recipe &&
    a.capabilities === b.capabilities &&
    a.history === b.history &&
    a.engine === b.engine &&
    a.physics === b.physics &&
    a.vision === b.vision &&
    a.failures === b.failures
  );
}

/**
 * 전체 상태 구독.
 * 기본적으로 백그라운드 썸네일(`thumbnails`)만 갱신될 때는 리렌더를 건너뛰어 64개 프리셋 썸네일 일괄 갱신 시
 * 썸네일을 읽지 않는 패널·상단 바·뷰포트가 128회 불필요하게 리렌더되는 현상을 막는다.
 * 썸네일 전체 맵 변경까지 구독하려면 `{ includeThumbnails: true }` 또는 `useLabSelector`를 쓴다.
 */
export function useLabState(options?: { readonly includeThumbnails?: boolean }): LabState {
  const store = useLabStore();
  const isEqual = options?.includeThumbnails ? Object.is : isSameCoreLabState;
  return useLabStoreSelector(store, identityState, isEqual);
}

/** 선택자 구독. `isEqual`(기본 `Object.is`, 배열·객체는 `shallowEqual` 전달 가능)이 참이면 이전 스냅샷을 유지해 리렌더를 막는다. */
export function useLabSelector<T>(selector: (state: LabState) => T, isEqual: EqualityFn<T> = Object.is): T {
  const store = useLabStore();
  return useLabStoreSelector(store, selector, isEqual);
}

export function useDispatch(): (command: LabCommand) => void {
  const store = useLabStore();
  return useCallback((command: LabCommand) => store.dispatch(command), [store]);
}

export function useEngineSession(): EngineSession {
  return useLabContext().engineSession;
}

export function useCatalog(): PresetCatalog {
  return useLabContext().catalog;
}

export function useViewportRegistry(): ViewportRegistry {
  return useLabContext().viewport;
}

export function useThumbnailScheduler(): ThumbnailScheduler | null {
  return useLabContext().thumbnails;
}

export function usePackagePlans(): PackagePlanRegistry {
  return useLabContext().packagePlans;
}

/** 키트 플랜 등록소(패널의 출처·라이선스·제공 파츠 조회용). 키트 로더가 조립되지 않았으면 null. */
export function useKitPlans(): KitPlanRegistry | null {
  return useLabContext().kitPlans;
}

export function useApplyLoop(): ApplyLoop | null {
  return useLabContext().applyLoop;
}

/** UI 상태(활성 슬롯·인스펙터 탭·드로잉 모드) 구독 */
export function useUiState(): UiState {
  const ui = useLabContext().ui;
  return useSyncExternalStore(ui.subscribe, ui.getState, ui.getState);
}

export function useUiActions(): Pick<UiStateStore, "setActiveSlot" | "setInspectorTab" | "setDrawingMode"> {
  const ui = useLabContext().ui;
  return useMemo(
    () => ({ setActiveSlot: ui.setActiveSlot, setInspectorTab: ui.setInspectorTab, setDrawingMode: ui.setDrawingMode }),
    [ui],
  );
}

const EMPTY_SNAPSHOT: ApplyLoopSnapshot = Object.freeze({ plan: null, receipt: null, sequence: 0 });
const noopSubscribe = (): (() => void) => () => undefined;

/** 마지막으로 엔진에 적용된 플랜(미지원 슬롯 사유 표시용). 루프가 없으면 null. */
export function useApplyPlan(): ApplyPlan | null {
  const loop = useLabContext().applyLoop;
  const subscribe = useCallback((listener: () => void) => (loop ? loop.subscribe(() => listener()) : noopSubscribe()), [loop]);
  const getSnapshot = useCallback(() => (loop ? loop.snapshot() : EMPTY_SNAPSHOT), [loop]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot).plan;
}
