import "../styles/character-lab.css";
import "../styles/shaper-studio-theme.css";

/**
 * 조립 루트. LabRuntime(app/composition.ts 또는 테스트의 모의 조립)을 받아 Provider·TopBar·FailureBanner·워크벤치를 그린다.
 * 마운트 시 적용 루프·썸네일 드라이버를 시작하고 언마운트 시 중지한다. 엔진은 사용자가 TopBar에서 명시 선택할 때만 만든다.
 */
import { useEffect } from "react";

import { getDefaultPaintSession } from "../../paint/paint-session";

import { FailureBanner } from "./FailureBanner";
import { LabStoreProvider } from "./lab-store-context";
import { TopBar } from "./TopBar";
import { parseLabRouteSearchParams, serializeLabRouteSearchParams } from "./ui-state";
import { hasUnsavedCharacterWork } from "./unsaved-work";
import { WorkbenchLayout } from "./WorkbenchLayout";

import type { LabRuntime } from "./lab-runtime";

export interface CharacterLabAppProps {
  readonly runtime: LabRuntime;
}

export function CharacterLabApp({ runtime }: CharacterLabAppProps) {
  useEffect(() => runtime.start(), [runtime]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const paintSession = getDefaultPaintSession();
    // 초기 부팅 상태를 기준 체크포인트로 기록해 두고, 이후 미저장 편집·페인트가 있을 때 탭 닫기/새로고침을 경고한다.
    hasUnsavedCharacterWork(runtime.store, runtime.store.getState(), paintSession);
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!hasUnsavedCharacterWork(runtime.store, runtime.store.getState(), paintSession)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [runtime]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const applyFromLocation = () => {
      const patch = parseLabRouteSearchParams(window.location.search);
      if (patch.activeSlot) runtime.ui.setActiveSlot(patch.activeSlot);
      if (patch.inspectorTab) runtime.ui.setInspectorTab(patch.inspectorTab);
      if (typeof patch.drawingMode === "boolean") runtime.ui.setDrawingMode(patch.drawingMode);
    };
    applyFromLocation();
    window.addEventListener("popstate", applyFromLocation);
    const unsubscribe = runtime.ui.subscribe(() => {
      const nextSearch = serializeLabRouteSearchParams(runtime.ui.getState());
      if (window.location.search !== nextSearch && typeof window.history?.replaceState === "function") {
        window.history.replaceState(null, "", `${window.location.pathname}${nextSearch}${window.location.hash}`);
      }
    });
    return () => {
      window.removeEventListener("popstate", applyFromLocation);
      unsubscribe();
    };
  }, [runtime]);

  return (
    <LabStoreProvider
      store={runtime.store}
      catalog={runtime.catalog}
      engineSession={runtime.engineSession}
      viewport={runtime.viewport}
      ui={runtime.ui}
      thumbnails={runtime.thumbnails}
      packagePlans={runtime.packagePlans}
      kitPlans={runtime.kitPlans}
      applyLoop={runtime.applyLoop}
    >
      <div className="cl-app">
        <TopBar />
        <FailureBanner />
        <WorkbenchLayout panels={runtime.panels} />
      </div>
    </LabStoreProvider>
  );
}
