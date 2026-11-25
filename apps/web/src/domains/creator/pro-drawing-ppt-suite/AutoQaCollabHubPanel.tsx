import { CheckCircle2, Clapperboard, GitBranch, Globe2, LayoutList, MapPin, MessageSquareText, Music, Palette, ScanSearch, Sparkles } from "lucide-react";
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

const LazyCinematographyPanel = lazy(async () => {
  await import("../webtoon-cinematography-director");
  const m = await import("../webtoon-cinematography-director/StudioCinematographyDirectorPanel");
  return { default: m.StudioCinematographyDirectorPanel };
});
const LazyColorScriptPanel = lazy(async () => {
  await import("../color-script-accessibility-lab");
  const m = await import("../color-script-accessibility-lab/StudioColorScriptLabPanel");
  return { default: m.StudioColorScriptLabPanel };
});

const LazyPanelRhythmPanel = lazy(async () => {
  await import("../webtoon-panel-rhythm-studio");
  const m = await import("../webtoon-panel-rhythm-studio/StudioWebtoonPanelRhythmPanel");
  return { default: m.StudioWebtoonPanelRhythmPanel };
});

const LazyMobileReaderPanel = lazy(async () => {
  await import("../mobile-reader-preview-sim");
  const m = await import("../mobile-reader-preview-sim/StudioMobileReaderPreviewPanel");
  return { default: m.StudioMobileReaderPreviewPanel };
});
const LazyPacingThumbnailPanel = lazy(async () => {
  await import("../episode-pacing-thumbnail-lab");
  const m = await import("../episode-pacing-thumbnail-lab/StudioEpisodePacingThumbnailPanel");
  return { default: m.StudioEpisodePacingThumbnailPanel };
});

const LazyStudioVisualPinReviewPanel = lazy(async () => {
  await import("../visual-pin-review-studio");
  const m = await import("../visual-pin-review-studio/StudioVisualPinReviewPanel");
  return { default: m.StudioVisualPinReviewPanel };
});
const LazyStudioWebtoonAudioCuePanel = lazy(async () => {
  await import("../webtoon-audio-cue-director");
  const m = await import("../webtoon-audio-cue-director/StudioWebtoonAudioCuePanel");
  return { default: m.StudioWebtoonAudioCuePanel };
});

const LazyStudioBalloonSfxProposerPanel = lazy(async () => {
  await import("../balloon-sfx-placement-proposer");
  const m = await import("../balloon-sfx-placement-proposer/StudioBalloonSfxProposerPanel");
  return { default: m.StudioBalloonSfxProposerPanel };
});

const LazyStudioModelSheetDriftCoachPanel = lazy(async () => {
  await import("../crosscut-modelsheet-drift-coach");
  const m = await import("../crosscut-modelsheet-drift-coach/StudioModelSheetDriftCoachPanel");
  return { default: m.StudioModelSheetDriftCoachPanel };
});

type QaHubTabId =
  | "pixel"
  | "layout"
  | "continuity"
  | "signoff"
  | "storySimulpub"
  | "virtualLiving"
  | "renderFarmVcs"
  | "movingtoonReels"
  | "cinematography"
  | "colorScript"
  | "panelRhythm"
  | "mobileReader"
  | "pacingThumbnail"
  | "visualPinReview"
  | "audioCueDirector"
  | "balloonSfxProposer"
  | "modelSheetDrift";

const RHYTHM_FOLEY_VISUAL_CARDS: readonly {
  readonly id: string;
  readonly src: string;
  readonly titleKo: string;
  readonly titleEn: string;
}[] = [
  { id: "lighttableConti", src: "/assets/atelier/rhythm-foley/rhythm-lighttable-conti.webp", titleKo: "세로 콘티 라이트테이블", titleEn: "Vertical Conti Light-Table" },
  { id: "gpenScreentone", src: "/assets/atelier/rhythm-foley/rhythm-gpen-screentone.webp", titleKo: "G펜·스크린톤 컷 연출", titleEn: "G-Pen & Screentone Craft" },
  { id: "seoulShadowbox", src: "/assets/atelier/rhythm-foley/rhythm-seoul-shadowbox.webp", titleKo: "서울 야경 사선 컷 디오라마", titleEn: "Seoul Rooftop Panel Diorama" },
  { id: "colorAccordion", src: "/assets/atelier/rhythm-foley/rhythm-color-accordion.webp", titleKo: "회차 컬러 스크립트 화첩", titleEn: "Episode Color-Script Folio" },
  { id: "gpenMacro", src: "/assets/atelier/rhythm-foley/foley-gpen-paper-macro.webp", titleKo: "스틸 펜촉·켄트지 마찰음", titleEn: "Steel Nib & Kent Acoustics" },
  { id: "rainyAtelier", src: "/assets/atelier/rhythm-foley/foley-rainy-atelier-lamp.webp", titleKo: "비 오는 밤 화실 앰비언스", titleEn: "Rainy Night Atelier Ambience" },
  { id: "hanokStudy", src: "/assets/atelier/rhythm-foley/foley-hanok-inkstone-desk.webp", titleKo: "한옥 목재·먹물 서재 공간음", titleEn: "Hanok Wood & Inkstone Study" },
  { id: "brassVuConsole", src: "/assets/atelier/rhythm-foley/foley-brass-vu-console.webp", titleKo: "황동 VU 미터·집중 타이머", titleEn: "Brass VU & Focus Console" },
];

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
  { id: "cinematography", labelKo: "카메라 투영·시선 동선 예제", labelEn: "Camera Projection · Eye-Flow Examples" },
  { id: "colorScript", labelKo: "색상 대비·색각 변환 예제", labelEn: "Color Contrast · Vision Simulation Examples" },
  { id: "panelRhythm", labelKo: "컷 높이·여백·읽기 호흡 예제", labelEn: "Panel Size · Gutter · Rhythm Examples" },
  { id: "mobileReader", labelKo: "모바일 크기·독서 가독성 예제", labelEn: "Mobile Size · Reading Legibility Examples" },
  { id: "pacingThumbnail", labelKo: "컷 호흡·썸네일 수치 예제", labelEn: "Panel Rhythm · Thumbnail Metric Examples" },
  { id: "visualPinReview", labelKo: "핀·검수 메모 예제", labelEn: "Pin · Review Note Examples" },
  { id: "audioCueDirector", labelKo: "대사·배경음·효과음 큐 예제", labelEn: "Dialogue · Music · Sound Cue Examples" },
  { id: "balloonSfxProposer", labelKo: "말풍선·효과음 배치 예제", labelEn: "Balloon · Sound Effect Placement Examples" },
  { id: "modelSheetDrift", labelKo: "컷별 설정집 대조 예제", labelEn: "Cut-by-Cut Model Sheet Examples" },
];

function QaHubIcon({ id }: { readonly id: QaHubTabId }) {
  switch (id) {
    case "modelSheetDrift":
      return <ScanSearch size={15} aria-hidden="true" />;
    case "balloonSfxProposer":
      return <MessageSquareText size={15} aria-hidden="true" />;
    case "visualPinReview":
      return <MapPin size={15} aria-hidden="true" />;
    case "audioCueDirector":
      return <Music size={15} aria-hidden="true" />;
    case "mobileReader":
      return <LayoutList size={15} aria-hidden="true" />;
    case "pacingThumbnail":
      return <Clapperboard size={15} aria-hidden="true" />;
    case "panelRhythm":
      return <LayoutList size={15} aria-hidden="true" />;
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
    case "cinematography":
      return <Clapperboard size={15} aria-hidden="true" />;
    case "colorScript":
      return <Palette size={15} aria-hidden="true" />;
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
          {active === "cinematography" ? <LazyCinematographyPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "colorScript" ? <LazyColorScriptPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "panelRhythm" ? <LazyPanelRhythmPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "mobileReader" ? <LazyMobileReaderPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "pacingThumbnail" ? <LazyPacingThumbnailPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "visualPinReview" ? <LazyStudioVisualPinReviewPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "audioCueDirector" ? <LazyStudioWebtoonAudioCuePanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "balloonSfxProposer" ? <LazyStudioBalloonSfxProposerPanel locale={isEn ? "en" : "ko"} /> : null}
          {active === "modelSheetDrift" ? <LazyStudioModelSheetDriftCoachPanel locale={isEn ? "en" : "ko"} /> : null}
        </Suspense>
      </div>
      <details className="rounded-xl border border-line bg-panel p-2.5">
        <summary className="cursor-pointer select-none text-xs font-semibold text-fg [word-break:keep-all]">
          {isEn
            ? `Storyboard Rhythm & Analog Foley Atelier Cards (${RHYTHM_FOLEY_VISUAL_CARDS.length})`
            : `세로 컷 리듬·화실 사운드 아틀리에 비주얼 카드 (${RHYTHM_FOLEY_VISUAL_CARDS.length}종)`}
        </summary>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RHYTHM_FOLEY_VISUAL_CARDS.map((card) => (
            <figure
              key={card.id}
              className="overflow-hidden rounded-lg border border-line bg-card"
            >
              <img
                src={card.src}
                alt={isEn ? card.titleEn : card.titleKo}
                loading="lazy"
                decoding="async"
                className="aspect-square w-full object-cover outline-1 -outline-offset-1 outline-line"
              />
              <figcaption className="px-2 py-1.5 text-[11px] font-medium text-fg-2 [word-break:keep-all]">
                {isEn ? card.titleEn : card.titleKo}
              </figcaption>
            </figure>
          ))}
        </div>
      </details>
    </section>
  );
}
