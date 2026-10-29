/**
 * StudioAiWebtoonPlatformSuitePanel.tsx
 *
 * AI 만화·인스타툰 4대 플랫폼(젠툰 GenToon · 망고툰 Mangotoon · 라마젠 LlamaGen AI · 투닝 Tooning)
 * REA 역공학 기능을 툰스튜디오 안에서 즉시 조작·검증하는 통합 UI 워크벤치 패널.
 */
import {
  Film,
  Layers,
  MousePointerClick,
  Printer,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  buildComicGenComicV2EpisodeSequence,
  createTemplateToonContentPayload,
  estimateGenToonCreditCost,
  evaluateGenToonMerchPrintLayout,
  GENTOON_AI_MODEL_CATALOG,
  GENTOON_REEL_FILTER_PRESETS,
  TEMPLATE_TOON_CHARACTER_PRESETS,
  TEMPLATE_TOON_LIBRARY_TABS,
  recommendCreatorPlusCutFromSentence,
  synthesizeGenToonShortFormReelTimeline,
  type GenToonAiModelId,
  type GenToonCreationMode,
  type GenToonMerchLayoutMode,
  type GenToonReelFilterId,
  type GenToonReelTransitionId,
  type ComicGenLayoutModeId,
  type TemplateToonLibraryTabId,
} from "./ai-webtoon-platform-suite";
import {
  runAssistAmusementCoasterFerrisCampingSkiDirector,
  runAssistChemistryMicroscopeCentrifugeAstronomyDirector,
  runAssistDentalOphthalmologyXrayMarkerDirector,
  runAssistEquestrianFalconryHorologyGemstoneDirector,
  runAssistFilmSetClapperboardBroadcastSwitchDirector,
  runAssistHourglassCandleScaleBookGutterPaywallDirector,
  runAssistRotaryPhoneTurntableCameraInstantDirector,
  runAssistSchoolCsatOmrTcgDiceMahjongDirector,
} from "./assist/assist-alt-text";
import {
  buildDeterministicBraidPonytailAccessoryKnotLockView,
  buildDeterministicCapeCloakHemLiningFlutterLockView,
  buildDeterministicCharacterAgeFlashbackProportionLockView,
  buildDeterministicMultiPlaneParallaxBokehLockView,
  buildDeterministicPropScreenUiHologramLockView,
  buildDeterministicSwordHiltGuardScabbardLockView,
  runAssistBraidPonytailAccessoryKnotLockDirector,
  runAssistCapeCloakHemLiningFlutterLockDirector,
  runAssistCharacterAgeFlashbackProportionLockDirector,
  runAssistMultiPlaneParallaxBokehLockDirector,
  runAssistPropScreenUiHologramLockDirector,
  runAssistSwordHiltGuardScabbardLockDirector,
} from "./assist/ai-creator-domain-assist";
import { PANEL_CARD_CLASS } from "./studio-ai-super-suite-options";

import { cn } from "@/shared/lib/utils";

export interface StudioAiWebtoonPlatformSuitePanelProps {
  readonly scriptInput?: string;
  readonly onApplyScript?: (nextScript: string) => void;
}

type PlatformSubTab = "gentoon" | "mangotoon" | "llamagen" | "tooning";

export function StudioAiWebtoonPlatformSuitePanel({
  scriptInput = "",
  onApplyScript,
}: StudioAiWebtoonPlatformSuitePanelProps): ReactElement {
  const [activeTab, setActiveTab] = useState<PlatformSubTab>("gentoon");

  // 1. GenToon state
  const [genToonModelId, setGenToonModelId] = useState<GenToonAiModelId>(
    "gemini-3.1-flash-image-preview",
  );
  const [genToonMode, setGenToonMode] = useState<GenToonCreationMode>("instatoon");
  const [genToonCutCount, setGenToonCutCount] = useState<number>(4);
  const [genToonFilterId, setGenToonFilterId] = useState<GenToonReelFilterId>("vivid");
  const [genToonTransitionId, setGenToonTransitionId] =
    useState<GenToonReelTransitionId>("fade");
  const [merchLayoutMode, setMerchLayoutMode] = useState<GenToonMerchLayoutMode>("sheet");

  // 2. Mangotoon state
  const [mangotoonTab, setMangotoonTab] = useState<TemplateToonLibraryTabId>("character");
  const [selectedMgCharacterId, setSelectedMgCharacterId] = useState<string>(
    TEMPLATE_TOON_CHARACTER_PRESETS[0]!.id,
  );
  const [mgBlurRange, setMgBlurRange] = useState<number>(50);

  // 3. LlamaGen state
  const [llamaLayoutMode, setLlamaLayoutMode] =
    useState<ComicGenLayoutModeId>("vertical-golden-webtoon");

  // 4. Tooning sentence state
  const [tooningSentence, setTooningSentence] = useState<string>(
    scriptInput.trim().split("\n")[0] ||
      "학교 교실에서 개인정보 보호 수칙을 꼭 주의해서 확인하세요!",
  );
  const [wave18SummaryKo, setWave18SummaryKo] = useState<string>(() => {
    const init = buildDeterministicPropScreenUiHologramLockView(scriptInput);
    return `[UI/홀로그램 연속성 · ${init.model}] ${init.uiDeviceType} — ${init.clockAndBatteryBadgeRuleKo}`;
  });
  const [wave18Loading, setWave18Loading] = useState<boolean>(false);
  const [wave42SummaryKo, setWave42SummaryKo] = useState<string>(
    "Wave 42~44 (840개 플랫폼 REA · 148개 스마트 라우팅): 치과/X-ray·다이얼/턴테이블·화학현미경·승마/시계기어·촬영장/부조정실·수능/TCG/마작·유원지/캠핑·모래시계/쿠키전환 감독 대기",
  );
  const [wave42Loading, setWave42Loading] = useState<boolean>(false);

  async function handleRunWave42Engine(
    kind: "dental" | "retro" | "lab" | "horology" | "filmset" | "campus" | "coaster" | "paywall",
  ): Promise<void> {
    setWave42Loading(true);
    const seed = { episodeTitle: "01화", genre: "현대 판타지", scriptSummary: scriptInput.trim() || tooningSentence };
    const map: Record<typeof kind, () => Promise<string>> = {
      dental: async () => { const r = await runAssistDentalOphthalmologyXrayMarkerDirector(seed); return `[치과/X-ray/AED · ${r.model}] ${r.data.xrayLeadMarkerAndCastSlingKo} / ${r.data.ambulanceStretcherAndAedPaddleKo}`; },
      retro: async () => { const r = await runAssistRotaryPhoneTurntableCameraInstantDirector(seed); return `[다이얼/턴테이블/카메라 · ${r.model}] ${r.data.vinylTurntableTonearmAndCassetteKo} / ${r.data.slrAdvanceLeverAndPolaroidBorderKo}`; },
      lab: async () => { const r = await runAssistChemistryMicroscopeCentrifugeAstronomyDirector(seed); return `[화학/현미경/망원경 · ${r.model}] ${r.data.buretteMeniscusAndFumeHoodRuleKo} / ${r.data.microscopeObjectiveAndCentrifugeKo}`; },
      horology: async () => { const r = await runAssistEquestrianFalconryHorologyGemstoneDirector(seed); return `[승마/시계기어/보석 · ${r.model}] ${r.data.stirrupBallOfFootAndFalconryKo} / ${r.data.watchGearMeshRotationRuleKo}`; },
      filmset: async () => { const r = await runAssistFilmSetClapperboardBroadcastSwitchDirector(seed); return `[촬영슬레이트/부조정실 · ${r.model}] ${r.data.clapperboardSlateAndBoomMicRuleKo} / ${r.data.switcherPreviewProgramTallyKo}`; },
      campus: async () => { const r = await runAssistSchoolCsatOmrTcgDiceMahjongDirector(seed); return `[수능OMR/TCG/마작 · ${r.model}] ${r.data.koreanCsatOmrAndMortarboardRuleKo} / ${r.data.tcgPlaymatTapAndDiceOppositeSumKo}`; },
      coaster: async () => { const r = await runAssistAmusementCoasterFerrisCampingSkiDirector(seed); return `[롤러코스터/관람차/스키 · ${r.model}] ${r.data.rollercoasterUpstopAndFerrisGondolaKo} / ${r.data.skiSnowboardStanceAndBasketRuleKo}`; },
      paywall: async () => { const r = await runAssistHourglassCandleScaleBookGutterPaywallDirector(seed); return `[모래시계/촛불/쿠키전환 · ${r.model}] ${r.data.hourglassReposeAndCandleVerticalFlameKo} / ${r.data.bookGutterCurveAndPaywallCliffhangerKo}`; },
    };
    try {
      setWave42SummaryKo(await map[kind]());
    } finally {
      setWave42Loading(false);
    }
  }

  async function handleRunWave18Engine(
    kind: "screen" | "braid" | "cape" | "sword" | "age" | "bokeh",
  ): Promise<void> {
    setWave18Loading(true);
    const seed = scriptInput.trim() || tooningSentence;
    try {
      if (kind === "screen") {
        const res = await runAssistPropScreenUiHologramLockDirector(seed);
        setWave18SummaryKo(`[UI/홀로그램 · ${res.model}] ${res.uiDeviceType} · ${res.clockAndBatteryBadgeRuleKo}`);
      } else if (kind === "braid") {
        const res = await runAssistBraidPonytailAccessoryKnotLockDirector(seed);
        setWave18SummaryKo(`[땋은머리/리본 · ${res.model}] ${res.braidSegmentCount}마디 · ${res.accessorySideRuleKo}`);
      } else if (kind === "cape") {
        const res = await runAssistCapeCloakHemLiningFlutterLockDirector(seed);
        setWave18SummaryKo(`[망토 겉/안감 · ${res.model}] 겉감 ${res.outerFabricHex} / 안감 ${res.innerLiningHex} · ${res.windFlutterPhaseRuleKo}`);
      } else if (kind === "sword") {
        const res = await runAssistSwordHiltGuardScabbardLockDirector(seed);
        setWave18SummaryKo(`[도검 코등이/칼집 · ${res.model}] ${res.weaponNameAndClassKo} · ${res.scabbardWearingSideRuleKo}`);
      } else if (kind === "age") {
        const res = await runAssistCharacterAgeFlashbackProportionLockDirector(seed);
        setWave18SummaryKo(`[연령대/회상 비례 · ${res.model}] ${res.childhoodHeadRatio} → ${res.adultCurrentHeadRatio} · ${res.scarAndMarkTimelineRuleKo}`);
      } else {
        const res = await runAssistMultiPlaneParallaxBokehLockDirector(seed);
        setWave18SummaryKo(`[3평면 DoF/보케 · ${res.model}] 전경 ${res.foregroundBlurRadiusPx}px / 원경 ${res.backgroundBokehRadiusPx}px · ${res.virtualLensMmAndFStop}`);
      }
    } catch {
      const fb =
        kind === "screen"
          ? buildDeterministicPropScreenUiHologramLockView(seed).directorNoteKo
          : kind === "braid"
            ? buildDeterministicBraidPonytailAccessoryKnotLockView(seed).directorNoteKo
            : kind === "cape"
              ? buildDeterministicCapeCloakHemLiningFlutterLockView(seed).directorNoteKo
              : kind === "sword"
                ? buildDeterministicSwordHiltGuardScabbardLockView(seed).directorNoteKo
                : kind === "age"
                  ? buildDeterministicCharacterAgeFlashbackProportionLockView(seed).directorNoteKo
                  : buildDeterministicMultiPlaneParallaxBokehLockView(seed).directorNoteKo;
      setWave18SummaryKo(`[폴백] ${fb}`);
    } finally {
      setWave18Loading(false);
    }
  }

  const selectedGenToonModel = useMemo(
    () =>
      GENTOON_AI_MODEL_CATALOG.find((m) => m.id === genToonModelId) ??
      GENTOON_AI_MODEL_CATALOG[0]!,
    [genToonModelId],
  );

  const creditEstimate = useMemo(
    () =>
      estimateGenToonCreditCost({
        mode: genToonMode,
        cutCount: genToonCutCount,
        includeStoryScript: true,
        includeReelExport: true,
      }),
    [genToonMode, genToonCutCount],
  );

  const reelTimeline = useMemo(() => {
    const rawLines = (
      scriptInput.trim() ||
      "오늘도 평화로운 인스타툰 작업실!\n마감 10분 전인데 파일이 날아갔다?!\n다행히 자동 저장으로 4컷 모두 복구 완료!\n릴스 숏폼까지 한 번에 뽑아보자!"
    )
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, genToonCutCount);

    const cuts = Array.from({ length: genToonCutCount }, (_, idx) => ({
      cutIndex: idx + 1,
      dialogueText: rawLines[idx] ?? `${idx + 1}컷 대사 자동 배치`,
      subCutCount: 1,
    }));

    return synthesizeGenToonShortFormReelTimeline({
      cuts,
      filterId: genToonFilterId,
      transitionId: genToonTransitionId,
      overlays: [
        {
          text: "인스타툰 4컷 릴스",
          x: 0.5,
          y: 0.1,
          scale: 1.1,
          color: "#ffffff",
        },
      ],
    });
  }, [scriptInput, genToonCutCount, genToonFilterId, genToonTransitionId]);

  const merchEvaluation = useMemo(
    () =>
      evaluateGenToonMerchPrintLayout({
        layoutMode: merchLayoutMode,
        sourceImageWidthPx: 2048,
        printWidthInches: 6,
        targetDpi: 300,
        placementScale: 0.85,
        bgRemoved: true,
      }),
    [merchLayoutMode],
  );

  const activeMgCharacter = useMemo(
    () =>
      TEMPLATE_TOON_CHARACTER_PRESETS.find((c) => c.id === selectedMgCharacterId) ??
      TEMPLATE_TOON_CHARACTER_PRESETS[0]!,
    [selectedMgCharacterId],
  );

  const mgContentSample = useMemo(
    () =>
      createTemplateToonContentPayload({
        id: "mg-bg-01",
        contentCategory: "background",
        src: "https://toon.mangoboard.net/contents/bg-office.png",
        orgWidth: 1600,
        orgHeight: 1200,
        blurEdgeRange: mgBlurRange,
      }),
    [mgBlurRange],
  );

  const llamaEpisode = useMemo(() => {
    const lines = scriptInput
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return buildComicGenComicV2EpisodeSequence({
      artworkId: "llama-ep-01",
      seriesTitle: "서울 네온 시퀀스",
      episodeTitle: "제1화: 황금비 세로 스크롤 콘티",
      scriptLines: lines,
      layoutMode: llamaLayoutMode,
      canvasWidthPx: 800,
    });
  }, [scriptInput, llamaLayoutMode]);

  const tooningRec = useMemo(
    () => recommendCreatorPlusCutFromSentence(tooningSentence),
    [tooningSentence],
  );

  return (
    <div
      data-testid="studio-ai-webtoon-platform-suite-panel"
      className={cn(PANEL_CARD_CLASS, "mt-2 space-y-2.5")}
    >
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-line pb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-accent" aria-hidden="true" />
          <h4 className="text-xs font-bold text-fg">
            AI 만화·인스타툰 제작 도구 4종 (인스타툰·릴스·굿즈 · 템플릿 에셋 · 세로 웹툰 레이아웃 · 문장 연출)
          </h4>
        </div>
        <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[0.58rem] font-semibold text-accent">
          REA Clean-Room Suite
        </span>
      </div>

      {/* 플랫폼 전환 탭 */}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="AI 만화 플랫폼 선택">
        {(
          [
            { id: "gentoon", label: "인스타툰·릴스·굿즈" },
            { id: "mangotoon", label: "클릭&드래그 템플릿 에셋" },
            { id: "llamagen", label: "1.618 세로 웹툰 레이아웃" },
            { id: "tooning", label: "문장 → 표정·포즈·배경" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            data-testid={`ai-platform-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded border px-2 py-1 text-[0.62rem] font-semibold transition-all",
              activeTab === tab.id
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-raised text-fg-2 hover:text-fg",
              STUDIO_EASE,
              STUDIO_FOCUS_RING,
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. GenToon 탭 */}
      {activeTab === "gentoon" ? (
        <div data-testid="gentoon-workbench-section" className="space-y-2 text-[0.64rem]">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-0.5">
              <span className="font-semibold text-fg-2">AI 생성 모델 (9종 카탈로그)</span>
              <select
                aria-label="인스타툰 AI 모델 선택"
                value={genToonModelId}
                onChange={(e) => setGenToonModelId(e.target.value as GenToonAiModelId)}
                className="rounded border border-line bg-raised px-1.5 py-1 text-[0.62rem] text-fg"
              >
                {GENTOON_AI_MODEL_CATALOG.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} [{m.badge}] ({m.credits}cr)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="font-semibold text-fg-2">제작 모드 & 컷 수</span>
              <div className="flex items-center gap-1">
                <select
                  aria-label="인스타툰 제작 모드"
                  value={genToonMode}
                  onChange={(e) => setGenToonMode(e.target.value as GenToonCreationMode)}
                  className="rounded border border-line bg-raised px-1.5 py-1 text-[0.62rem] text-fg"
                >
                  <option value="instatoon">인스타툰 (13cr/컷)</option>
                  <option value="webtoon">웹툰 (13cr/컷)</option>
                  <option value="manga">망가 프로 (25cr/컷)</option>
                  <option value="cartoon">카툰 프로 (25cr/컷)</option>
                </select>
                <input
                  type="number"
                  aria-label="인스타툰 컷 수"
                  min={4}
                  max={12}
                  value={genToonCutCount}
                  onChange={(e) => setGenToonCutCount(Number(e.target.value) || 4)}
                  className="w-14 rounded border border-line bg-raised px-1.5 py-1 text-center font-mono text-[0.62rem] text-fg"
                />
              </div>
            </label>
            <div className="flex flex-col justify-between rounded border border-line bg-raised/50 p-1.5">
              <span className="text-[0.58rem] text-fg-3">
                권장 비율 {selectedGenToonModel.recommendedAspectRatio} · 단가 $
                {selectedGenToonModel.costUsd}
              </span>
              <span
                data-testid="gentoon-total-credits"
                className="font-mono text-[0.66rem] font-bold text-accent"
              >
                예상 총 {creditEstimate.totalCredits} 크레딧 (릴스 +{creditEstimate.reelExportCredits}cr)
              </span>
            </div>
          </div>

          {/* 1080x1920 30fps 숏폼 릴스 합성기 */}
          <div className="rounded border border-line bg-raised/30 p-2">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 font-bold text-fg">
                <Film size={12} className="text-accent" />
                숏폼 릴스 타임라인 합성기 ({reelTimeline.widthPx}×{reelTimeline.heightPx} ·{" "}
                {reelTimeline.fps}fps · 총 {reelTimeline.totalDurationSec}s / {reelTimeline.totalFrames}f)
              </span>
              <div className="flex items-center gap-1">
                <select
                  aria-label="릴스 필터 프리셋"
                  value={genToonFilterId}
                  onChange={(e) => setGenToonFilterId(e.target.value as GenToonReelFilterId)}
                  className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.6rem] text-fg"
                >
                  {GENTOON_REEL_FILTER_PRESETS.map((f) => (
                    <option key={f.id} value={f.id}>
                      필터: {f.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="릴스 트랜지션"
                  value={genToonTransitionId}
                  onChange={(e) =>
                    setGenToonTransitionId(e.target.value as GenToonReelTransitionId)
                  }
                  className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.6rem] text-fg"
                >
                  <option value="fade">전환: 페이드 (0.28s)</option>
                  <option value="slide">전환: 슬라이드 (0.28s)</option>
                  <option value="none">전환: 없음</option>
                </select>
              </div>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1 sm:grid-cols-4">
              {reelTimeline.cuts.slice(0, 4).map((cut) => (
                <div
                  key={cut.cutIndex}
                  className="rounded border border-line bg-card px-1.5 py-1 font-mono text-[0.58rem]"
                >
                  <div className="font-bold text-fg">
                    #{cut.cutIndex}컷 ({cut.scaledDurationSec}s)
                  </div>
                  <div className="text-fg-3">
                    {cut.startFrame}~{cut.endFrame}f · Zoom {cut.kenBurnsZoom}x
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 6분할 스티커 시트 & 머그컵 굿즈 DPI 검증 */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-raised/30 p-2">
            <div className="flex items-center gap-1.5">
              <Printer size={12} className="text-accent" />
              <span className="font-semibold text-fg">
                굿즈 프린트 레이아웃 ({merchEvaluation.slots.length}슬롯 · {merchEvaluation.effectiveDpi} DPI)
              </span>
              <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[0.58rem] font-bold text-accent">
                {merchEvaluation.sharpnessGrade.toUpperCase()} — {merchEvaluation.sharpnessLabel}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {(
                [
                  { id: "sheet", label: "6분할 스티커 시트" },
                  { id: "mug_twin", label: "양면 머그컵 (2슬롯)" },
                  { id: "single", label: "단품 전면 (0.85배)" },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setMerchLayoutMode(mode.id)}
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[0.58rem]",
                    merchLayoutMode === mode.id
                      ? "border-accent bg-accent text-on-accent font-bold"
                      : "border-line bg-card text-fg-2",
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* 2. Mangotoon 탭 */}
      {activeTab === "mangotoon" ? (
        <div data-testid="mangotoon-workbench-section" className="space-y-2 text-[0.64rem]">
          <div className="flex flex-wrap gap-1">
            {TEMPLATE_TOON_LIBRARY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMangotoonTab(tab.id)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[0.6rem]",
                  mangotoonTab === tab.id
                    ? "border-accent bg-accent font-bold text-on-accent"
                    : "border-line bg-raised text-fg-2",
                )}
              >
                {tab.label} ({tab.masonryColumnWidthPx}px)
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            {TEMPLATE_TOON_CHARACTER_PRESETS.map((charPreset) => (
              <button
                key={charPreset.id}
                type="button"
                onClick={() => setSelectedMgCharacterId(charPreset.id)}
                className={cn(
                  "flex flex-col items-start rounded border p-2 text-left",
                  selectedMgCharacterId === charPreset.id
                    ? "border-accent bg-accent/10 font-bold text-accent"
                    : "border-line bg-raised/40 text-fg-2",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span>{charPreset.name}</span>
                  <span className="rounded bg-card px-1 py-0.5 text-[0.56rem] text-fg-3">
                    {charPreset.gender} · {charPreset.ageGroup}
                  </span>
                </div>
                <span className="mt-0.5 font-mono text-[0.58rem] text-fg-2">
                  표정 {charPreset.headCount}종 × 동작 {charPreset.bodyCount}종 ={" "}
                  {charPreset.headCount * charPreset.bodyCount} 조합
                </span>
                <span className="mt-0.5 text-[0.56rem] font-normal text-fg-3">
                  {charPreset.recommendedUseCase}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-raised/30 p-2">
            <div className="flex items-center gap-1.5">
              <MousePointerClick size={12} className="text-accent" />
              <span className="font-semibold text-fg">
                선택 캐릭터: {activeMgCharacter.name} · 배경 리사이즈({mgContentSample.width}×
                {mgContentSample.height}) · 9방향 외곽 블러(blurEdge): {mgBlurRange}px
              </span>
            </div>
            <input
              type="range"
              aria-label="템플릿 에셋 외곽 블러 범위"
              min={0}
              max={100}
              value={mgBlurRange}
              onChange={(e) => setMgBlurRange(Number(e.target.value))}
              className="h-1.5 w-28 accent-accent"
            />
          </div>
        </div>
      ) : null}

      {/* 3. LlamaGen AI 탭 */}
      {activeTab === "llamagen" ? (
        <div data-testid="llamagen-workbench-section" className="space-y-2 text-[0.64rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Layers size={12} className="text-accent" />
              황금비({llamaEpisode.goldenRatioConstant}) 세로 웹툰 스트립 · 총 {llamaEpisode.panels.length}패널 (
              {llamaEpisode.canvasWidthPx}×{llamaEpisode.canvasHeightPx}px)
            </span>
            <select
              aria-label="세로 웹툰 레이아웃 모드"
              value={llamaLayoutMode}
              onChange={(e) => setLlamaLayoutMode(e.target.value as ComicGenLayoutModeId)}
              className="rounded border border-line bg-raised px-1.5 py-0.5 text-[0.6rem] text-fg"
            >
              <option value="vertical-golden-webtoon">황금비 세로 스크롤 웹툰 (1.618)</option>
              <option value="smart-comic-grid">Smart Comic Grid</option>
              <option value="smart-wide-panel-strip">Smart Wide-Panel Strip</option>
              <option value="four-panel">4-Panel Strip</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {llamaEpisode.panels.slice(0, 4).map((panel) => (
              <div
                key={panel.panel}
                className="rounded border border-line bg-raised/40 p-1.5 text-[0.6rem]"
              >
                <div className="flex items-center justify-between font-mono font-bold text-accent">
                  <span>Panel #{panel.panel + 1}</span>
                  <span>
                    ({panel.geometry.topLeft.x}, {panel.geometry.topLeft.y}) ·{" "}
                    {panel.geometry.width}×{panel.geometry.height}px
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-fg">{panel.caption}</p>
                <p className="text-[0.56rem] text-fg-3">{panel.instructions}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 4. Tooning 탭 */}
      {activeTab === "tooning" ? (
        <div data-testid="tooning-workbench-section" className="space-y-2 text-[0.64rem]">
          <div className="flex flex-col gap-1">
            <label htmlFor="tooning-sentence-input" className="font-semibold text-fg-2">
              교육·홍보용 문장 입력 → 표정·포즈·배경·말풍선 자동 추천
            </label>
            <div className="flex gap-1">
              <input
                id="tooning-sentence-input"
                type="text"
                value={tooningSentence}
                onChange={(e) => setTooningSentence(e.target.value)}
                className="flex-1 rounded border border-line bg-raised px-2 py-1 text-[0.64rem] text-fg"
              />
              {onApplyScript ? (
                <button
                  type="button"
                  data-testid="apply-tooning-sentence-btn"
                  onClick={() =>
                    onApplyScript(
                      `${tooningRec.sentence} (${tooningRec.recommendedEmotion} / ${tooningRec.recommendedPose} / ${tooningRec.recommendedBackground})`,
                    )
                  }
                  className="inline-flex items-center gap-1 rounded border border-accent bg-accent-soft px-2 py-1 text-[0.6rem] font-bold text-accent"
                >
                  <Wand2 size={11} />
                  대본에 반영
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <div className="rounded border border-line bg-raised/40 p-1.5">
              <span className="text-[0.56rem] text-fg-3">추천 표정</span>
              <div className="font-bold text-fg">{tooningRec.recommendedEmotion}</div>
            </div>
            <div className="rounded border border-line bg-raised/40 p-1.5">
              <span className="text-[0.56rem] text-fg-3">추천 동작 포즈</span>
              <div className="font-bold text-fg">{tooningRec.recommendedPose}</div>
            </div>
            <div className="rounded border border-line bg-raised/40 p-1.5">
              <span className="text-[0.56rem] text-fg-3">추천 배경</span>
              <div className="font-bold text-fg">{tooningRec.recommendedBackground}</div>
            </div>
            <div className="rounded border border-line bg-raised/40 p-1.5">
              <span className="text-[0.56rem] text-fg-3">말풍선 · 캠페인 목적</span>
              <div className="font-bold text-accent">
                {tooningRec.recommendedSpeechBubbleType} · {tooningRec.campaignPurpose}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 5. Wave 18~20 웹툰 일관성 & 입체 연출 6대 엔진 퀵 실행 바 */}
      <div
        data-testid="wave18-20-domain-consistency-bar"
        className="mt-2.5 space-y-1.5 rounded border border-accent/40 bg-raised/30 p-2 text-[0.62rem]"
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="font-bold text-fg">
            Wave 18~20 웹툰 작화 일관성 & 3평면 심도 6대 AI 디렉터 (360개 플랫폼 REA 내재화)
          </span>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["screen", "스마트폰·상태창 UI 고정"],
                ["braid", "땋은머리·리본 매듭 고정"],
                ["cape", "망토 겉/안감·바람 고정"],
                ["sword", "도검 코등이·칼집 고정"],
                ["age", "회상 연령대·두신비 고정"],
                ["bokeh", "3평면 DoF·보케 감독"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={wave18Loading}
                data-testid={`wave18-run-${id}`}
                onClick={() => void handleRunWave18Engine(id)}
                className="rounded border border-line bg-raised px-1.5 py-0.5 text-[0.58rem] font-semibold text-fg-2 hover:border-accent hover:text-accent"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div data-testid="wave18-summary-output" className="text-[0.6rem] text-fg-2">
          {wave18Loading ? "Claude 멀티모델 추론 중..." : wave18SummaryKo}
        </div>
      </div>

      {/* 6. Wave 42~44 치과/X-ray·레트로소품·화학현미경·승마시계·촬영장·수능TCG·유원지·모래시계/쿠키전환 8대 감독 */}
      <div
        data-testid="wave42-44-domain-consistency-bar"
        className="mt-2 space-y-1.5 rounded border border-accent/40 bg-raised/30 p-2 text-[0.62rem]"
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="font-bold text-fg">
            Wave 42~44 치과X-ray·턴테이블·현미경·승마기어·촬영장탈리·수능TCG·롤러코스터·모래시계쿠키 8대 감독 (840개 플랫폼 REA · 148개 스마트 라우팅)
          </span>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["dental", "치과·X-ray·AED"],
                ["retro", "다이얼·턴테이블·SLR"],
                ["lab", "뷰렛·현미경·망원경"],
                ["horology", "승마등자·시계기어"],
                ["filmset", "슬레이트·부조정실"],
                ["campus", "수능OMR·TCG·마작"],
                ["coaster", "롤러코스터·관람차"],
                ["paywall", "모래시계·쿠키전환"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={wave42Loading}
                data-testid={`wave42-run-${id}`}
                onClick={() => void handleRunWave42Engine(id)}
                className="rounded border border-line bg-raised px-1.5 py-0.5 text-[0.58rem] font-semibold text-fg-2 hover:border-accent hover:text-accent"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div data-testid="wave42-summary-output" className="text-[0.6rem] text-fg-2">
          {wave42Loading ? "Claude 멀티모델 추론 중..." : wave42SummaryKo}
        </div>
      </div>
    </div>
  );
}
