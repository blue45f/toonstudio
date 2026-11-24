import { CheckCircle2, Clapperboard, GitBranch, Globe2, LayoutList, Palette, ScanSearch, Sparkles } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

const LazyAutoQaPixelScannerPanel = lazy(() =>
  import("../auto-qa-pixel-engine/AutoQaPixelScannerPanel").then((m) => ({
    default: m.AutoQaPixelScannerPanel,
  })),
);
const LazyAutoQaLayoutSpecPanel = lazy(() =>
  import("../auto-qa-layout-spec/AutoQaLayoutSpecPanel").then((m) => ({
    default: m.AutoQaLayoutSpecPanel,
  })),
);
const LazyAutoQaContinuityPanel = lazy(() =>
  import("../auto-qa-continuity/AutoQaContinuityPanel").then((m) => ({
    default: m.AutoQaContinuityPanel,
  })),
);
const LazyCollabSignoffHubPanel = lazy(() =>
  import("../collab-signoff-hub/CollabSignoffHubPanel").then((m) => ({
    default: m.CollabSignoffHubPanel,
  })),
);
const LazyStorySimulpubPanel = lazy(async () => {
  await import("../story-simulpub-provenance");
  const m = await import("../story-simulpub-provenance/StudioStorySimulpubPanel");
  return { default: m.StudioStorySimulpubPanel };
});
const LazyVirtualSpaceLivingPanel = lazy(async () => {
  await import("../virtual-space-living");
  const m = await import("../virtual-space-living/StudioVirtualSpaceLivingPanel");
  return { default: m.StudioVirtualSpaceLivingPanel };
});
const LazyRenderFarmVcsPanel = lazy(async () => {
  await import("../distributed-render-semantic-vcs");
  const m = await import("../distributed-render-semantic-vcs/StudioRenderFarmVcsPanel");
  return { default: m.StudioRenderFarmVcsPanel };
});
const LazyMovingtoonReelsPanel = lazy(async () => {
  await import("../movingtoon-reels-studio");
  const m = await import("../movingtoon-reels-studio/StudioMovingtoonReelsPanel");
  return { default: m.StudioMovingtoonReelsPanel };
});

type QaHubTabId =
  | "pixel"
  | "layout"
  | "continuity"
  | "signoff"
  | "storySimulpub"
  | "virtualLiving"
  | "renderFarmVcs"
  | "movingtoonReels";

const QA_HUB_TABS: readonly {
  readonly id: QaHubTabId;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "pixel", labelKo: "픽셀 구멍·붉은펜 재검수·2D↔3D", labelEn: "Pixel Scan · Redline Reverify · 2D/3D" },
  { id: "layout", labelKo: "스마트 안전분할·360px·다국어·0-Defect", labelEn: "Safe-Slice · 360px · i18n · 0-Defect" },
  { id: "continuity", labelKo: "컬러 스크립트·설정집 대조", labelEn: "Color Script · Bible Checker" },
  { id: "signoff", labelKo: "7단계 결재선·부분승인·블라인드·SLA", labelEn: "7-Stage Signoff · Blind Link · SLA" },
  { id: "storySimulpub", labelKo: "인과·리플로우·무결성 예제", labelEn: "Causality · Reflow · Integrity Examples" },
  { id: "virtualLiving", labelKo: "방·아바타·분위기 물리 예제", labelEn: "Room · Avatar · Atmosphere Examples" },
  { id: "renderFarmVcs", labelKo: "렌더 일정·컷 병합 메모리 예제", labelEn: "Render Scheduling · Cut Merge Memory Examples" },
  { id: "movingtoonReels", labelKo: "무빙툰 좌표·비트·자막 문자열 예제", labelEn: "Moving-Toon Coordinates · Beats · Subtitle Examples" },
];

function QaHubIcon({ id }: { readonly id: QaHubTabId }) {
  switch (id) {
    case "pixel":
      return <ScanSearch size={15} aria-hidden="true" />;
    case "layout":
      return <LayoutList size={15} aria-hidden="true" />;
    case "continuity":
      return <Palette size={15} aria-hidden="true" />;
    case "signoff":
      return <CheckCircle2 size={15} aria-hidden="true" />;
    case "storySimulpub":
      return <Globe2 size={15} aria-hidden="true" />;
    case "virtualLiving":
      return <Sparkles size={15} aria-hidden="true" />;
    case "renderFarmVcs":
      return <GitBranch size={15} aria-hidden="true" />;
    case "movingtoonReels":
      return <Clapperboard size={15} aria-hidden="true" />;
  }
}

export function AutoQaCollabHubPanel() {
  const lang = useI18n((state) => state.lang);
  const isEn = lang === "en";
  const baseId = useId();
  const [active, setActive] = useState<QaHubTabId>("pixel");

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-3"
      aria-label={isEn ? "Automated QA and Collaborative Signoff Hub" : "자동 검수 10종 및 사람 협업 결재 허브"}
      data-testid="auto-qa-collab-hub-panel"
    >
      <div role="tablist" aria-label={isEn ? "QA and review engines" : "자동·협업 검수 엔진 선택"} className="flex flex-wrap gap-2">
        {QA_HUB_TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] transition-[background-color,border-color,color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none ${
                selected
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg"
              }`}
            >
              <QaHubIcon id={tab.id} />
              <span>{isEn ? tab.labelEn : tab.labelKo}</span>
            </button>
          );
        })}
      </div>

      <div id={`${baseId}-panel-${active}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`}>
        <Suspense
          fallback={
            <p className="p-4 text-xs text-fg-2">
              {isEn ? "Loading QA & collaborative review engine..." : "자동·협업 검수 엔진을 불러오는 중입니다…"}
            </p>
          }
        >
          {active === "pixel" ? <LazyAutoQaPixelScannerPanel /> : null}
          {active === "layout" ? <LazyAutoQaLayoutSpecPanel /> : null}
          {active === "continuity" ? <LazyAutoQaContinuityPanel /> : null}
          {active === "signoff" ? <LazyCollabSignoffHubPanel /> : null}
          {active === "storySimulpub" ? <LazyStorySimulpubPanel /> : null}
          {active === "virtualLiving" ? <LazyVirtualSpaceLivingPanel /> : null}
          {active === "renderFarmVcs" ? <LazyRenderFarmVcsPanel /> : null}
          {active === "movingtoonReels" ? <LazyMovingtoonReelsPanel /> : null}
        </Suspense>
      </div>
    </section>
  );
}
