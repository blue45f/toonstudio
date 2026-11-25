import { Accessibility, CheckCircle2, Clapperboard, Eye, GitBranch, Globe2, LayoutList, MapPin, MessageCircle, MessageSquareText, Music, Palette, Rows3, Ruler, ScanSearch, Smartphone, Sparkles } from "lucide-react";
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
const LazyKoreanLetteringSfxPanel = lazy(async () => {
  await import("../korean-lettering-sfx-engine");
  const m = await import("../korean-lettering-sfx-engine/StudioKoreanLetteringSfxPanel");
  return { default: m.StudioKoreanLetteringSfxPanel };
});
const LazyColorScriptLabPanel = lazy(async () => {
  await import("../color-script-accessibility-lab");
  const m = await import("../color-script-accessibility-lab/StudioColorScriptLabPanel");
  return { default: m.StudioColorScriptLabPanel };
});
const LazyErgonomicsMasterPanel = lazy(async () => {
  await import("../ergonomics-shortcut-master");
  const m = await import("../ergonomics-shortcut-master/StudioErgonomicsMasterPanel");
  return { default: m.StudioErgonomicsMasterPanel };
});
const LazyWebtoonPanelRhythmPanel = lazy(async () => {
  await import("../webtoon-panel-rhythm-studio");
  const m = await import("../webtoon-panel-rhythm-studio/StudioWebtoonPanelRhythmPanel");
  return { default: m.StudioWebtoonPanelRhythmPanel };
});
const LazyMobileReaderPreviewPanel = lazy(async () => {
  await import("../mobile-reader-preview-sim");
  const m = await import("../mobile-reader-preview-sim/StudioMobileReaderPreviewPanel");
  return { default: m.StudioMobileReaderPreviewPanel };
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
  | "koreanLettering"
  | "colorScriptA11y"
  | "ergonomicsMaster"
  | "panelRhythm"
  | "mobileReaderSim"
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
  { id: "storySimulpub", labelKo: "복선 인과 감사·5개국 리플로우·C2PA·스크롤 히트맵", labelEn: "Causality · 5-Lang Reflow · C2PA · Scroll Heatmap" },
  { id: "virtualLiving", labelKo: "가상 스튜디오 2.5D 스프링·날씨 VFX·아바타·6테마 방", labelEn: "Virtual Studio 2.5D · VFX · Avatar · 6 Rooms" },
  { id: "renderFarmVcs", labelKo: "6패스 분산 렌더팜·시맨틱 컷 VCS", labelEn: "6-Pass Render Farm · Semantic Cut VCS" },
  { id: "movingtoonReels", labelKo: "무빙툰 릴스 2.5D·BPM 비트싱크·자막", labelEn: "Moving-Toon Reels · Beat Sync · Subtitles" },
  { id: "koreanLettering", labelKo: "한국어 광학 말풍선·세로쓰기·감정 SFX 벡터", labelEn: "Korean Optical Balloons · Vertical · SFX Vector" },
  { id: "colorScriptA11y", labelKo: "4막 컬러 스크립트·LMS 색각이상·다크라이트", labelEn: "4-Act Color Script · LMS CVD · Dark/Light" },
  { id: "ergonomicsMaster", labelKo: "4대 도구 단축키·왼손 미러·WCAG 2.2 AAA", labelEn: "4-Tool Shortcuts · Left-Hand · WCAG 2.2 AAA" },
  { id: "panelRhythm", labelKo: "세로 컷 분할·여백 리듬·대사 호흡", labelEn: "Vertical Scroll Gutter & Beat Rhythm" },
  { id: "mobileReaderSim", labelKo: "9:16 모바일 독자 뷰어·4기종 가독성 점검", labelEn: "9:16 Mobile Reader Preview · 4-Device Audit" },
  { id: "visualPinReview", labelKo: "캔버스 핀 검수·6단계 바통터치·외부 툴 브리지", labelEn: "Canvas Pin Review · Baton Pass · Open Bridges" },
  { id: "audioCueDirector", labelKo: "한국어 립싱크 비젬·BGM·SFX 큐 디렉터", labelEn: "Korean Lip-Sync Viseme · BGM · SFX Cue Director" },
  { id: "balloonSfxProposer", labelKo: "얼굴 회피 말풍선 꼬리·효과음(SFX) 자동 배치", labelEn: "Face-Safe Balloon Tail & SFX Auto-Placement" },
  { id: "modelSheetDrift", labelKo: "1~60컷 설정집 비율·의상 붉은펜 드리프트 코치", labelEn: "1-60 Cut Model Sheet Drift Redline Coach" },
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
    case "koreanLettering":
      return <MessageSquareText size={15} aria-hidden="true" />;
    case "colorScriptA11y":
      return <Eye size={15} aria-hidden="true" />;
    case "ergonomicsMaster":
      return <Accessibility size={15} aria-hidden="true" />;
    case "panelRhythm":
      return <Rows3 size={15} aria-hidden="true" />;
    case "mobileReaderSim":
      return <Smartphone size={15} aria-hidden="true" />;
    case "visualPinReview":
      return <MapPin size={15} aria-hidden="true" />;
    case "audioCueDirector":
      return <Music size={15} aria-hidden="true" />;
    case "balloonSfxProposer":
      return <MessageCircle size={15} aria-hidden="true" />;
    case "modelSheetDrift":
      return <Ruler size={15} aria-hidden="true" />;
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
          {active === "koreanLettering" ? <LazyKoreanLetteringSfxPanel /> : null}
          {active === "colorScriptA11y" ? <LazyColorScriptLabPanel /> : null}
          {active === "ergonomicsMaster" ? <LazyErgonomicsMasterPanel /> : null}
          {active === "panelRhythm" ? <LazyWebtoonPanelRhythmPanel /> : null}
          {active === "mobileReaderSim" ? <LazyMobileReaderPreviewPanel /> : null}
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
