import "../styles/brush-lab.css";

import { useEffect, useMemo, useState } from "react";

import { LAB_SCHEMA_VERSION, SUMI_ENGINE_VERSION } from "../../engine/core/version";
import { LANE_REGISTRY } from "../../lanes/registry";
import { createBrowserLaneEnvironment } from "../../platform/browser-environment";
import { createBenchRunner } from "../state/bench-runner";
import { createDrawActions, drawStore as globalDrawStore } from "../state/draw-store";
import { createLabActions, labStore, useLabState } from "../state/lab-store";
import { messageOf, probeAllLanes } from "../state/run-compare";
import { CapabilityBanner } from "../ui/CapabilityBanner";
import { CompareView } from "../views/CompareView";
import { DrawView } from "../views/DrawView";
import { GalleryView } from "../views/GalleryView";
import { ReportView } from "../views/ReportView";
import { createGalleryWorkerClient } from "../workers/create-gallery-worker";

import { LabContext } from "./lab-context";

import type { LabContextValue } from "./lab-context";
import type { LaneDescriptor, LaneEnvironment } from "../../lanes/lane";
import type { GalleryRenderer } from "../../platform/worker-client";
import type { BenchRunner } from "../state/bench-runner";
import type { DrawStore } from "../state/draw-store";
import type { LabStore, LabTab } from "../state/lab-store";
import type { KeyboardEvent } from "react";

export interface BrushLabAppProps {
  /** 기본 LANE_REGISTRY. 테스트는 모의 레지스트리를 넣는다. */
  registry?: readonly LaneDescriptor[];
  env?: LaneEnvironment;
  runner?: BenchRunner;
  store?: LabStore;
  /** "그리기" 탭 저장소(기본 전역). 테스트는 독립 인스턴스를 넣는다. */
  drawStore?: DrawStore;
  /** 갤러리 렌더러. 생략하면 Worker 클라이언트를 만들고, 실패하면 사유를 갤러리 탭에 보여준다. */
  gallery?: GalleryRenderer | null;
  galleryError?: string | null;
  /** 마운트 시 모든 레인을 probe한다(기본 true). */
  autoProbe?: boolean;
}

const TABS: readonly { id: LabTab; label: string }[] = [
  { id: "draw", label: "그리기" },
  { id: "gallery", label: "갤러리" },
  { id: "compare", label: "A/B 비교" },
  { id: "report", label: "리포트" },
];

interface GallerySlot {
  renderer: GalleryRenderer | null;
  error: string | null;
}

/** 탭 셸(그리기 | 갤러리 | A/B 비교 | 리포트). 상태는 `labStore`, 런타임 의존성은 `LabContext`로 공유한다. */
export function BrushLabApp(props: BrushLabAppProps) {
  const [store] = useState<LabStore>(() => props.store ?? labStore);
  const [actions] = useState(() => createLabActions(store));
  const [drawStore] = useState<DrawStore>(() => props.drawStore ?? globalDrawStore);
  const [drawActions] = useState(() => createDrawActions(drawStore));
  const [registry] = useState<readonly LaneDescriptor[]>(() => props.registry ?? LANE_REGISTRY);
  const [env] = useState<LaneEnvironment>(() => props.env ?? createBrowserLaneEnvironment());
  const [runner] = useState<BenchRunner>(() => props.runner ?? createBenchRunner());
  const [gallery, setGallery] = useState<GallerySlot>(() =>
    props.gallery !== undefined
      ? { renderer: props.gallery, error: props.galleryError ?? null }
      : { renderer: null, error: props.galleryError ?? "갤러리 Worker 준비 중" },
  );
  const tab = useLabTab(store);
  // "그리기" 탭은 처음 열린 뒤에는 계속 마운트해 둔다: 다른 탭을 보고 와도 레인 안의 문서(그림)가 사라지지 않는다.
  const [drawMounted, setDrawMounted] = useState(tab === "draw");
  useEffect(() => {
    if (tab === "draw") setDrawMounted(true);
  }, [tab]);

  // Worker는 effect에서 만들어 StrictMode 이중 초기화와 언마운트 누수를 막는다.
  useEffect(() => {
    if (props.gallery !== undefined) return;
    try {
      const client = createGalleryWorkerClient();
      setGallery({ renderer: client, error: null });
      return () => client.dispose();
    } catch (error) {
      setGallery({ renderer: null, error: messageOf(error) });
      return undefined;
    }
  }, [props.gallery]);

  useEffect(() => {
    if (props.autoProbe === false) return;
    probeAllLanes({ registry, env, actions }).catch((error: unknown) => {
      actions.pushError({ laneId: null, code: "probe-failed", message: `레인 probe 실패: ${messageOf(error)}` });
    });
  }, [props.autoProbe, registry, env, actions]);

  const value = useMemo<LabContextValue>(
    () => ({
      store,
      actions,
      registry,
      env,
      runner,
      gallery: gallery.renderer,
      galleryError: gallery.error,
      drawStore,
      drawActions,
    }),
    [store, actions, registry, env, runner, gallery, drawStore, drawActions],
  );

  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const idx = TABS.findIndex((t) => t.id === tab);
    let next: number;
    if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    const target = TABS[next];
    if (!target) return;
    actions.setTab(target.id);
    const el = document.getElementById(`lab-tab-${target.id}`);
    if (el) el.focus();
  };

  return (
    <LabContext.Provider value={value}>
      <main className="lab-shell">
        <header className="lab-brand" aria-label="ToonStudio Brush Lab">
          <p className="lab-eyebrow">실험 앱 · 배포 대상 아님</p>
          <h1>ToonStudio Brush Lab</h1>
          <p className="lab-status">
            Sumi 엔진 {SUMI_ENGINE_VERSION} · 랩 스키마 {LAB_SCHEMA_VERSION} · 브러시 테스트 전용(손맛 시험용 샌드박스 — undo·레이어·문서 저장 없음, PNG 스냅샷만)
          </p>
        </header>
        <CapabilityBanner />
        <div role="tablist" aria-label="브러시 랩 화면" className="lab-tabs" onKeyDown={onTabKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`lab-tab-${t.id}`}
              className="lab-tab"
              aria-selected={tab === t.id}
              aria-controls={`lab-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => actions.setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {drawMounted ? (
          <div role="tabpanel" id="lab-panel-draw" aria-labelledby="lab-tab-draw" tabIndex={0} hidden={tab !== "draw"}>
            <DrawView />
          </div>
        ) : null}
        {tab !== "draw" ? (
          <div role="tabpanel" id={`lab-panel-${tab}`} aria-labelledby={`lab-tab-${tab}`} tabIndex={0}>
            {tab === "gallery" ? <GalleryView /> : tab === "compare" ? <CompareView /> : <ReportView />}
          </div>
        ) : null}
      </main>
    </LabContext.Provider>
  );
}

/** 저장소의 현재 탭 구독(셸은 아직 컨텍스트 밖이므로 저장소를 직접 넘긴다). */
function useLabTab(store: LabStore): LabTab {
  return useLabState((s) => s.tab, store);
}
