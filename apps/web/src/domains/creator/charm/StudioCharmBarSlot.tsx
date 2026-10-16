/**
 * 참 바가 편집기 작업공간에 놓이는 자리(슬롯).
 *
 * 이 파일은 작업공간이 정적으로 가져오지 않는다 — `StudioCharmBarSlotLazy` 가 슬롯째 지연 로드한다(정적으로 가져오면
 * 슬롯과 순수 모듈이 Studio 첫 청크 그래프에 묶여 번들 래칫을 깬다). 여기서는 상태 저장소(순수 모델)와 도킹 영역만
 * 가져오고, 칩·선택기·카탈로그가 든 본체(`StudioCharmBar`)는 바가 펼쳐졌을 때만 한 번 더 지연 로드한다. 본체 로드가
 * 실패해도 편집기는 그대로 두고 그 자리에서 오류와 다시 시도를 보여 준다(원고와 도구 구성은 유지된다).
 *
 * 도킹: `StudioWorkspaceRegion` 을 그대로 써서 도구 레일처럼 붙여 두거나 떼어 떠 있는 창으로 옮기고
 * 왼쪽·오른쪽·위·아래 가장자리에 도킹할 수 있다(1024px 이상). 좁은 화면에서는 작업공간 위쪽 가로 띠로 붙는다.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";

import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { STUDIO_CANVAS_WIDTH } from "../canvas/studio-canvas-constants";
import { STUDIO_FLOATING_SURFACE_LAYOUT_VERSION } from "../studio-floating-surface";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { StudioWorkspaceRegion } from "../StudioWorkspaceRegion";
import { getStudioCharmBarStore, type StudioCharmBarStore } from "./studio-charm-bar-store";
import { loadStudioCharmBar } from "./studio-charm-bar-loader";
import { bi } from "./studio-charm-copy";
import {
  createStudioCharmContextReader,
  studioCharmLock,
  type StudioCharmHostSession,
  type StudioCharmLock,
} from "./studio-charm-host-bridge";

import type { StudioCharmLibraryAsset } from "./studio-charm-descriptor";
import type { StudioCharmBarProps } from "./StudioCharmBar";

/** 세션 백에서 슬롯이 읽는 값. 호스트 백의 필드 이름을 그대로 따른다. */
export interface StudioCharmSlotSession extends StudioCharmHostSession {
  readonly isMobile: boolean;
  readonly canvasOnlyMode: boolean;
  readonly mobileImmersive: boolean;
  readonly presentationPanelsHidden?: boolean;
  readonly assets?: readonly StudioCharmLibraryAsset[];
  /** 호스트가 보관함 읽기를 끝냈는지. "내 에셋" 메뉴를 열어야 읽으므로 처음에는 false 다. */
  readonly assetsLoaded?: boolean;
  readonly assetsLoading?: boolean;
  readonly assetFavoriteState?: { readonly ids: readonly string[] };
}

export interface StudioCharmBarSlotProps {
  readonly session: StudioCharmSlotSession;
  /** 시험용 주입점: 기본은 편집기 한 탭이 공유하는 제품 스토어. */
  readonly store?: StudioCharmBarStore;
  readonly loadBar?: () => Promise<{ readonly StudioCharmBar: ComponentType<StudioCharmBarProps> }>;
}

const CHARM_BAR_LAYOUT = {
  version: STUDIO_FLOATING_SURFACE_LAYOUT_VERSION,
  xRatio: 0.012,
  yRatio: 0.2,
  width: 96,
  height: 460,
  dock: "free",
  positionLocked: false,
  sizeLocked: false,
} as const;

const EMPTY_LIBRARY: readonly StudioCharmLibraryAsset[] = Object.freeze([]);
const EMPTY_IDS: readonly string[] = Object.freeze([]);

export function StudioCharmBarSlot({
  session,
  store = getStudioCharmBarStore(),
  loadBar = loadStudioCharmBar,
}: StudioCharmBarSlotProps) {
  useBilingualI18nRevision();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const open = snapshot.state.open;
  const [Bar, setBar] = useState<ComponentType<StudioCharmBarProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sessionRef = useRef(session);
  const contextReader = useMemo(() => createStudioCharmContextReader(STUDIO_CANVAS_WIDTH), []);

  useLayoutEffect(() => {
    sessionRef.current = session;
  });

  useEffect(() => {
    void store.hydrate();
  }, [store]);

  useEffect(() => {
    if (!open || Bar) return;
    let active = true;
    loadBar().then(
      (module) => {
        if (active) setBar(() => module.StudioCharmBar);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [open, Bar, attempt, loadBar]);

  const readContext = useCallback(() => contextReader.read(sessionRef.current), [contextReader]);

  // 본체로 넘기는 값은 내용이 같으면 같은 참조를 유지해, 호스트가 다시 그릴 때마다 본체가 따라 그려지지 않게 한다.
  const { assets, assetsLoaded, assetsLoading, canvasH } = session;
  const hostLibrary = useMemo(
    () => ({ assets: assets ?? EMPTY_LIBRARY, loaded: assetsLoaded === true, loading: assetsLoading === true }),
    [assets, assetsLoaded, assetsLoading],
  );
  const canvas = useMemo(() => ({ width: STUDIO_CANVAS_WIDTH, height: canvasH }), [canvasH]);
  const currentLock = studioCharmLock(session);
  const lockKind = currentLock?.kind ?? null;
  const lockMessage = currentLock?.message ?? null;
  const lock = useMemo<StudioCharmLock | null>(
    () => (lockKind ? { kind: lockKind, message: lockMessage } : null),
    [lockKind, lockMessage],
  );

  const hidden = session.canvasOnlyMode || session.mobileImmersive || session.presentationPanelsHidden === true;
  if (!open || hidden) return null;

  const retry = () => {
    setFailed(false);
    setAttempt((value) => value + 1);
  };

  return (
    <StudioWorkspaceRegion
      surfaceId="charm-bar"
      label={bi("참 바", "Charm bar")}
      defaultLayout={CHARM_BAR_LAYOUT}
      disabled={session.isMobile}
      minWidth={72}
      minHeight={96}
      maxWidth={640}
      maxHeight={900}
      allowedDockEdges={["left", "right", "top", "bottom"]}
    >
      {Bar ? (
        <Bar
          store={store}
          commands={session.studioToolBeltContentHandlers}
          readContext={readContext}
          canvas={canvas}
          hostLibrary={hostLibrary}
          assetFavoriteIds={session.assetFavoriteState?.ids ?? EMPTY_IDS}
          lock={lock}
        />
      ) : failed ? (
        <div
          role="alert"
          data-studio-charm-bar-failed=""
          data-studio-shortcut-boundary="true"
          className="studio-charm-bar grid min-h-0 shrink-0 gap-1 bg-panel p-1 text-xs text-fg-2"
        >
          <p>{bi("참 바를 불러오지 못했어요. 원고와 도구 구성은 그대로예요.", "Could not load the charm bar. Your work and tools are unchanged.")}</p>
          <button
            type="button"
            onClick={retry}
            className={cn("min-h-11 rounded-lg border border-line bg-card px-3 font-semibold text-fg hover:bg-raised", STUDIO_FOCUS_RING)}
          >
            {bi("다시 불러오기", "Retry")}
          </button>
        </div>
      ) : (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          data-studio-charm-bar-loading=""
          data-studio-shortcut-boundary="true"
          className="studio-charm-bar min-h-0 shrink-0 bg-panel p-1"
        >
          <span className="sr-only">{bi("참 바를 여는 중…", "Opening the charm bar…")}</span>
          {Array.from({ length: 3 }, (_, index) => (
            <span key={index} aria-hidden="true" className="skeleton size-10 shrink-0 rounded-lg pointer-coarse:size-11 max-lg:size-11" />
          ))}
        </div>
      )}
    </StudioWorkspaceRegion>
  );
}
