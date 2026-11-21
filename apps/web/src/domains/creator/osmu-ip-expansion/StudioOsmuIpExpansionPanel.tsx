import "./osmu-ip-expansion.css";

import { BookOpen, Clapperboard, Film, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { AnimationXSheetParallaxTabView } from "./OsmuAnimationTabView";
import {
  DramaOttPitchTabView,
  WebnovelBidirectionalTabView,
  type ExportPreviewFormat,
  type WebnovelDirectionMode,
} from "./OsmuWebnovelDramaTabViews";
import {
  ANIMATION_FORMAT_SPECS,
  SAMPLE_ANIMATION_CUTS,
  STANDARD_ANIMATION_FPS,
  buildAnimationProductionPacket,
  type AnimationAspectRatio,
  type AnimationFormatId,
  type AnimationKomaStyle,
} from "./osmu-animation-pipeline-engine";
import {
  SAMPLE_DRAMA_PITCH_INPUT,
  SAMPLE_WEBTOON_EPISODE,
  adaptWebnovelToWebtoonOutline,
  adaptWebtoonToWebnovel,
  buildDramaPitchPackage,
  type BudgetTierId,
  type DramaFormatId,
  type DramaPlatformId,
  type NarratorPov,
  type WebnovelPlatformId,
} from "./osmu-webnovel-drama-engine";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type OsmuTabId = "webnovel" | "drama" | "anime";

interface StudioOsmuIpExpansionPanelProps {
  readonly projectId?: string;
  readonly episodeTitle?: string;
}

/**
 * 웹툰 IP를 웹소설 · 웹드라마(OTT/숏폼) · 애니메이션(24fps X-Sheet/2.5D 패럴랙스)으로
 * 원클릭 확장하는 100% 무과금(₩0) OSMU IP 확장 관제실.
 */
export function StudioOsmuIpExpansionPanel({
  projectId,
  episodeTitle,
}: StudioOsmuIpExpansionPanelProps = {}) {
  const bt = useBilingual("StudioOsmuIpExpansionPanel");
  const [activeTab, setActiveTab] = useState<OsmuTabId>("webnovel");
  const [statusMessage, setStatusMessage] = useState<string>("");

  // 1) 웹툰 ↔ 웹소설 양방향 각색 상태
  const [novelDirection, setNovelDirection] = useState<WebnovelDirectionMode>("webtoon-to-novel");
  const [novelPlatform, setNovelPlatform] = useState<WebnovelPlatformId>("kakaopage");
  const [novelPov, setNovelPov] = useState<NarratorPov>("third-person-limited");
  const [novelExport, setNovelExport] = useState<ExportPreviewFormat>("none");

  const webtoonSource = useMemo(
    () => ({
      ...SAMPLE_WEBTOON_EPISODE,
      episodeTitle: episodeTitle?.trim() || SAMPLE_WEBTOON_EPISODE.episodeTitle,
      platform: novelPlatform,
      pov: novelPov,
    }),
    [episodeTitle, novelPlatform, novelPov],
  );

  const novelResult = useMemo(() => adaptWebtoonToWebnovel(webtoonSource), [webtoonSource]);

  const [reverseInput, setReverseInput] = useState<string>(() =>
    adaptWebtoonToWebnovel(SAMPLE_WEBTOON_EPISODE).fullProse,
  );
  const reverseOutline = useMemo(
    () => adaptWebnovelToWebtoonOutline(reverseInput),
    [reverseInput],
  );

  // 2) 웹드라마 · OTT 영상화 피칭 바이블 상태
  const [dramaPlatform, setDramaPlatform] = useState<DramaPlatformId>("netflix");
  const [dramaFormat, setDramaFormat] = useState<DramaFormatId>("ott-12ep");
  const [dramaBudgetTier, setDramaBudgetTier] = useState<BudgetTierId>("mid");
  const [dramaExport, setDramaExport] = useState<ExportPreviewFormat>("none");

  const dramaPitch = useMemo(
    () =>
      buildDramaPitchPackage({
        ...SAMPLE_DRAMA_PITCH_INPUT,
        targetPlatform: dramaPlatform,
        format: dramaFormat,
        budgetTier: dramaBudgetTier,
      }),
    [dramaPlatform, dramaFormat, dramaBudgetTier],
  );

  // 3) 애니메이션 24fps X-Sheet · 2.5D 패럴랙스 상태
  const [animeFormat, setAnimeFormat] = useState<AnimationFormatId>("tv-anime");
  const [animeAspect, setAnimeAspect] = useState<AnimationAspectRatio>("16:9");
  const [animeKoma, setAnimeKoma] = useState<AnimationKomaStyle>("2s");
  const [selectedCutId, setSelectedCutId] = useState<string>(SAMPLE_ANIMATION_CUTS[0]?.cutId ?? "C001");
  const [animeExport, setAnimeExport] = useState<ExportPreviewFormat>("none");

  const animationPacket = useMemo(
    () =>
      buildAnimationProductionPacket(SAMPLE_ANIMATION_CUTS, {
        fps: STANDARD_ANIMATION_FPS,
        format: animeFormat,
        aspectRatio: animeAspect,
        komaStyle: animeKoma,
        seriesTitle: SAMPLE_WEBTOON_EPISODE.seriesTitle,
      }),
    [animeFormat, animeAspect, animeKoma],
  );

  const handleAnimeFormatChange = (nextFormat: AnimationFormatId) => {
    setAnimeFormat(nextFormat);
    setAnimeAspect(ANIMATION_FORMAT_SPECS[nextFormat].defaultAspect);
  };

  const handleCopyText = (label: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => {
        // 클립보드 권한이 막힌 환경에서도 UI 상태 안내는 유지한다.
      });
    }
    setStatusMessage(`${label} (${text.length.toLocaleString("ko-KR")}자) 복사를 준비했습니다.`);
  };

  return (
    <section
      className="osmu-shell"
      data-testid="studio-osmu-ip-expansion-panel"
      aria-label={bt("OSMU IP 확장 관제실", "OSMU IP Expansion Control Room")}
    >
      <div className="osmu-header">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-2 text-base font-black text-fg">
              <Sparkles className="size-4 text-accent" aria-hidden="true" />
              {bt(
                "OSMU IP 확장 관제실 — 웹소설 · 웹드라마(OTT) · 애니메이션 24fps",
                "OSMU IP Expansion — Webnovel · OTT Drama · 24fps Animation",
              )}
            </h3>
            <span className="osmu-pill" data-tone="good" data-testid="osmu-zero-cost-badge">
              {bt("로컬 결정론적 엔진 · ₩0", "Deterministic Local · ₩0")}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              "한 편의 웹툰 원고를 1화 연재 웹소설, OTT/숏폼 영상화 피치 바이블, 24fps X-Sheet·2.5D 패럴랙스 애니 제작 패킷으로 손실 없이 확장합니다.",
              "Expand one webtoon source deterministically into serialized webnovel prose, OTT pitch bibles, and 24fps X-Sheet animation packets.",
            )}
            {projectId ? ` · 프로젝트 ${projectId}` : ""}
          </p>
        </div>
      </div>

      <dl className="osmu-kpi-grid">
        <div className="osmu-kpi-card">
          <dt className="text-[0.6875rem] text-fg-3">{bt("웹소설 1화 분량", "Webnovel 1-Ep Length")}</dt>
          <dd className="osmu-num mt-1 text-base font-black text-fg" data-testid="osmu-kpi-novel-chars">
            {novelResult.charCountWithSpaces.toLocaleString("ko-KR")}자
          </dd>
        </div>
        <div className="osmu-kpi-card">
          <dt className="text-[0.6875rem] text-fg-3">{bt("콘티 역추출 배분", "Reverse Conti Cuts")}</dt>
          <dd className="osmu-num mt-1 text-base font-black text-fg" data-testid="osmu-kpi-reverse-cuts">
            {reverseOutline.scenes.length}씬 · {reverseOutline.totalAllocatedCuts}컷
          </dd>
        </div>
        <div className="osmu-kpi-card">
          <dt className="text-[0.6875rem] text-fg-3">{bt("영상화 편성 · 예산", "Drama Format & Budget")}</dt>
          <dd className="osmu-num mt-1 text-base font-black text-fg" data-testid="osmu-kpi-drama-budget">
            {dramaPitch.onePageProposal.episodeCount}부작 ·{" "}
            {dramaPitch.budgetSummary.totalSeasonMillionKrw.toLocaleString("ko-KR")}백만 원
          </dd>
        </div>
        <div className="osmu-kpi-card">
          <dt className="text-[0.6875rem] text-fg-3">{bt("애니 24fps 총 러닝타임", "Animation 24fps Runtime")}</dt>
          <dd className="osmu-num mt-1 text-base font-black text-fg" data-testid="osmu-kpi-anime-runtime">
            {animationPacket.totalFrames}f ({animationPacket.formattedTimecode})
          </dd>
        </div>
      </dl>

      {statusMessage ? (
        <p className="osmu-banner mt-3 text-xs font-semibold" data-tone="good" role="status" data-testid="osmu-status-banner">
          {statusMessage}
        </p>
      ) : null}

      <div className="osmu-tablist" role="tablist" aria-label={bt("OSMU 확장 파이프라인 탭", "OSMU Pipeline Tabs")}>
        <button
          id="osmu-tab-webnovel"
          type="button"
          role="tab"
          data-domain="novel"
          data-testid="osmu-tab-webnovel"
          className="osmu-tab"
          aria-selected={activeTab === "webnovel"}
          aria-controls="osmu-tabpanel-webnovel"
          onClick={() => setActiveTab("webnovel")}
        >
          <BookOpen className="size-4" aria-hidden="true" />
          {bt("웹툰↔웹소설 각색", "Webtoon ↔ Webnovel")}
        </button>
        <button
          id="osmu-tab-drama"
          type="button"
          role="tab"
          data-domain="drama"
          data-testid="osmu-tab-drama"
          className="osmu-tab"
          aria-selected={activeTab === "drama"}
          aria-controls="osmu-tabpanel-drama"
          onClick={() => setActiveTab("drama")}
        >
          <Clapperboard className="size-4" aria-hidden="true" />
          {bt("웹드라마·OTT 피칭 바이블", "Drama · OTT Pitch Bible")}
        </button>
        <button
          id="osmu-tab-anime"
          type="button"
          role="tab"
          data-domain="anime"
          data-testid="osmu-tab-anime"
          className="osmu-tab"
          aria-selected={activeTab === "anime"}
          aria-controls="osmu-tabpanel-anime"
          onClick={() => setActiveTab("anime")}
        >
          <Film className="size-4" aria-hidden="true" />
          {bt("애니메이션 24fps X-Sheet/패럴랙스", "24fps X-Sheet & Parallax")}
        </button>
      </div>

      {activeTab === "webnovel" ? (
        <WebnovelBidirectionalTabView
          direction={novelDirection}
          platform={novelPlatform}
          pov={novelPov}
          novelResult={novelResult}
          reverseInput={reverseInput}
          reverseOutline={reverseOutline}
          exportPreview={novelExport}
          onDirectionChange={setNovelDirection}
          onPlatformChange={setNovelPlatform}
          onPovChange={setNovelPov}
          onReverseInputChange={setReverseInput}
          onSyncRoundTrip={() => {
            setReverseInput(novelResult.fullProse);
            setNovelDirection("novel-to-webtoon");
            setStatusMessage("생성한 웹소설 1화 산문을 웹툰 콘티 추출기로 동기화했습니다.");
          }}
          onToggleExport={setNovelExport}
          onCopyText={handleCopyText}
        />
      ) : activeTab === "drama" ? (
        <DramaOttPitchTabView
          platform={dramaPlatform}
          format={dramaFormat}
          budgetTier={dramaBudgetTier}
          pitch={dramaPitch}
          exportPreview={dramaExport}
          onPlatformChange={setDramaPlatform}
          onFormatChange={setDramaFormat}
          onBudgetTierChange={setDramaBudgetTier}
          onToggleExport={setDramaExport}
          onCopyText={handleCopyText}
        />
      ) : (
        <AnimationXSheetParallaxTabView
          format={animeFormat}
          aspectRatio={animeAspect}
          komaStyle={animeKoma}
          selectedCutId={selectedCutId}
          packet={animationPacket}
          exportPreview={animeExport}
          onFormatChange={handleAnimeFormatChange}
          onAspectChange={setAnimeAspect}
          onKomaChange={setAnimeKoma}
          onSelectCut={setSelectedCutId}
          onToggleExport={setAnimeExport}
          onCopyText={handleCopyText}
        />
      )}
    </section>
  );
}
