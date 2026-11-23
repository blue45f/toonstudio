/**
 * StudioGlobalOstPremiereHub — 52개 글로벌·신생 경쟁사 핵심 내재화 6대 기능 통합 허브.
 *
 * - 탭 1 (`character-sfx`): `@캐릭터` 바이블 일관성 멘션 + 단일 렌더 영향도·좌/우 미러 + 글로벌 20개국 원클릭 SFX 리페인팅
 * - 탭 2 (`ost-premiere`): 웹 OST ↔ 컷 감정 자동 크로스페이드 + 라이브 연재 시사회 극장 + 독자 스크롤 히트맵
 * - 탭 3 (`trust-health`): 인간 작화 증명서 + 비가시적 포렌식 워터마크 + 작가 손목·마감 건강 페이스 코치
 * - 헤더 & OST 탭에서 `/studio/assets/audio`(웹 OST 제작실) 컬러 CTA 직행 링크를 제공한다.
 */

import { ExternalLink, Globe2, HeartPulse, Music2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import {
  GLOBAL_20_LOCALIZATION_LOCALES,
  GLOBAL_OST_PREMIERE_SPRITE_PATHS,
  planGlobalSfxRepaint,
  resolveCharacterBibleMentions,
  type GlobalLocaleCode,
  type LiveMirrorCompareMode,
} from "./character-mention-and-sfx-repaint";
import {
  DEFAULT_SCROLL_DWELL_SAMPLES,
  STUDIO_AUDIO_OST_WORKSHOP_PATH,
  analyzeScrollDwellHeatmap,
  buildPremiereTheaterSession,
  buildStealthWatermarkSignature,
  evaluateErgonomicBurnoutCoach,
  generateHumanCraftCertificate,
  resolveDynamicOstLayerMix,
  type CutEmotionTag,
  type WatermarkSessionPurpose,
} from "./ost-sync-premiere-and-trust";
import { CharacterSfxTabPanel } from "./CharacterSfxTabPanel";
import {
  HumanCraftHealthTabPanel,
  OstPremiereHeatmapTabPanel,
} from "./OstPremiereTrustTabPanels";

import Link from "@/shared/navigation/router-link";

import "./global-ost-premiere.css";

export type GlobalOstPremiereTabId = "character-sfx" | "ost-premiere" | "trust-health";

export interface StudioGlobalOstPremiereHubProps {
  readonly initialTab?: GlobalOstPremiereTabId;
  readonly episodeTitle?: string;
  readonly workId?: string;
}

const DEFAULT_MENTION_PROMPT =
  "비 내리는 옥상에서 @유진과 @세라가 마주 선다. 뒤편 그림자 속에서 @카이가 결계를 깨뜨린다.";

const DEFAULT_SELECTED_LOCALES: readonly GlobalLocaleCode[] = [
  "ko-KR",
  "en-US",
  "ja-JP",
  "ar-SA",
  "es-ES",
];

export function StudioGlobalOstPremiereHub({
  initialTab = "character-sfx",
  episodeTitle = "제12화 · 빗속의 결계 붕괴",
  workId = "work-rain-barrier",
}: StudioGlobalOstPremiereHubProps) {
  const [activeTab, setActiveTab] = useState<GlobalOstPremiereTabId>(initialTab);
  const [statusNoticeKo, setStatusNoticeKo] = useState<string | null>(null);

  // 탭 1: @캐릭터 일관성 + 실시간 렌더 미러 + 글로벌 20개국 SFX 리페인팅
  const [promptText, setPromptText] = useState<string>(DEFAULT_MENTION_PROMPT);
  const [renderInfluence, setRenderInfluence] = useState<number>(44);
  const [mirrorMode, setMirrorMode] = useState<LiveMirrorCompareMode>("split-side-by-side");
  const [selectedLocales, setSelectedLocales] = useState<readonly GlobalLocaleCode[]>(
    DEFAULT_SELECTED_LOCALES,
  );

  // 탭 2: 웹 OST 크로스페이드 + 라이브 시사회 극장 + 스크롤 히트맵
  const [scrollProgress, setScrollProgress] = useState<number>(0.42);
  const [emotionOverride, setEmotionOverride] = useState<CutEmotionTag | null>(null);

  // 탭 3: 인간 작화 증명서 + 포렌식 워터마크 + 건강 코치
  const [handMinutes, setHandMinutes] = useState<number>(280);
  const [scene3dMinutes, setScene3dMinutes] = useState<number>(75);
  const [aiAssistMinutes, setAiAssistMinutes] = useState<number>(45);
  const [watermarkRecipient, setWatermarkRecipient] = useState<string>("외주 채색 스튜디오 B");
  const [watermarkPurpose, setWatermarkPurpose] =
    useState<WatermarkSessionPurpose>("outsource-handoff");
  const [continuousDrawingMinutes, setContinuousDrawingMinutes] = useState<number>(62);
  const [pressureStiffness, setPressureStiffness] = useState<number>(64);
  const [leftHandShortcutActive, setLeftHandShortcutActive] = useState<boolean>(false);

  const mentionResult = useMemo(
    () =>
      resolveCharacterBibleMentions(promptText, {
        renderInfluence,
        mirrorMode,
      }),
    [promptText, renderInfluence, mirrorMode],
  );

  const sfxPlan = useMemo(
    () =>
      planGlobalSfxRepaint({
        canvasWidthPx: 800,
        targetLocales: selectedLocales,
      }),
    [selectedLocales],
  );

  const ostMix = useMemo(
    () =>
      resolveDynamicOstLayerMix(scrollProgress, {
        emotionOverride: emotionOverride ?? undefined,
      }),
    [scrollProgress, emotionOverride],
  );

  const premiereSession = useMemo(
    () =>
      buildPremiereTheaterSession({
        episodeTitle,
        concurrentViewers: 1280,
        featuredCutIndex: 47,
      }),
    [episodeTitle],
  );

  const heatmapReport = useMemo(
    () => analyzeScrollDwellHeatmap(DEFAULT_SCROLL_DWELL_SAMPLES),
    [],
  );

  const craftCertificate = useMemo(
    () =>
      generateHumanCraftCertificate({
        episodeTitle,
        creatorName: "스튜디오 대표 작가",
        handDrawnStrokeCount: 4820,
        handDrawnMinutes: handMinutes,
        scene3dMinutes,
        aiAssistMinutes,
      }),
    [episodeTitle, handMinutes, scene3dMinutes, aiAssistMinutes],
  );

  const watermark = useMemo(
    () =>
      buildStealthWatermarkSignature({
        workId,
        episodeNumber: 12,
        recipientLabel: watermarkRecipient,
        sessionId: "preview-session-2026-11",
        purpose: watermarkPurpose,
      }),
    [workId, watermarkRecipient, watermarkPurpose],
  );

  const healthCoach = useMemo(
    () =>
      evaluateErgonomicBurnoutCoach({
        continuousDrawingMinutes,
        stylusPressureStiffness: pressureStiffness,
        dailyHoursWorked: 6.5,
        leftHandShortcutActive,
        deadlineHoursRemaining: 9,
      }),
    [continuousDrawingMinutes, pressureStiffness, leftHandShortcutActive],
  );

  const handleToggleLocale = (code: GlobalLocaleCode) => {
    const exists = selectedLocales.includes(code);
    if (exists && selectedLocales.length === 1) return;
    const next = exists
      ? selectedLocales.filter((item) => item !== code)
      : [...selectedLocales, code];
    setSelectedLocales(next);
    setStatusNoticeKo(
      `글로벌 SFX 로컬라이징 대상 언어를 ${next.length}개국으로 갱신했습니다.`,
    );
  };

  const handleSelectAll20Locales = () => {
    const all20 = GLOBAL_20_LOCALIZATION_LOCALES.map((item) => item.code);
    setSelectedLocales(all20);
    setStatusNoticeKo("글로벌 20개국 전체(RTL·세로쓰기 포함) SFX 리페인팅 배치를 선택했습니다.");
  };

  const handleChangeCraftMinutes = (patch: {
    readonly handMinutes?: number;
    readonly scene3dMinutes?: number;
    readonly aiAssistMinutes?: number;
  }) => {
    if (patch.handMinutes !== undefined && Number.isFinite(patch.handMinutes)) {
      setHandMinutes(Math.max(0, Math.round(patch.handMinutes)));
    }
    if (patch.scene3dMinutes !== undefined && Number.isFinite(patch.scene3dMinutes)) {
      setScene3dMinutes(Math.max(0, Math.round(patch.scene3dMinutes)));
    }
    if (patch.aiAssistMinutes !== undefined && Number.isFinite(patch.aiAssistMinutes)) {
      setAiAssistMinutes(Math.max(0, Math.round(patch.aiAssistMinutes)));
    }
  };

  const handleToggleLeftHandShortcut = () => {
    const next = !leftHandShortcutActive;
    setLeftHandShortcutActive(next);
    setStatusNoticeKo(
      next
        ? "왼손 단축키·한손 패드 분담 모드를 활성화해 오른손 필압 부담을 낮췄습니다."
        : "기본 단축키 모드로 전환했습니다.",
    );
  };

  return (
    <section
      className="ts-gop-hub"
      aria-label="글로벌 SFX · 웹 OST 시사회 · 인간 작화 증명 통합 허브"
      data-testid="studio-global-ost-premiere-hub"
    >
      <header className="ts-gop-header">
        <div className="ts-gop-hero-id">
          <img
            src={GLOBAL_OST_PREMIERE_SPRITE_PATHS.community}
            alt=""
            aria-hidden="true"
            className="ts-gop-emblem"
            width={48}
            height={48}
          />
          <div>
            <h2 className="ts-gop-title">글로벌 20개국 SFX · 웹 OST 시사회 · 작화 신뢰 허브</h2>
            <p className="ts-gop-subtitle">
              @캐릭터 바이블 고정·20개국 SFX 리페인팅·컷 감정 OST 크로스페이드·독자 시사회/히트맵·인간 작화 증명·건강 코치를 한 화면에서 점검합니다.
            </p>
          </div>
        </div>

        <div className="ts-gop-actions">
          <span className="ts-gop-pill" data-tone="good">
            @캐릭터 {mentionResult.uniqueEntries.length}명 고정
          </span>
          <span className="ts-gop-pill" data-tone="cool">
            {sfxPlan.plans.length}/{sfxPlan.supportedCountryCount}개국 SFX
          </span>
          <Link
            href={STUDIO_AUDIO_OST_WORKSHOP_PATH}
            className="ts-gop-ost-cta"
            data-testid="gop-header-ost-workshop-cta"
          >
            <Music2 size={15} aria-hidden="true" />
            웹 OST 제작실 바로가기
            <ExternalLink size={13} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div
        className="ts-gop-tablist"
        role="tablist"
        aria-label="글로벌 SFX·OST 시사회·신뢰 건강 허브 탭"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "character-sfx"}
          className="ts-gop-tab"
          onClick={() => setActiveTab("character-sfx")}
        >
          <Globe2 size={15} aria-hidden="true" />
          @캐릭터·글로벌 SFX
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "ost-premiere"}
          className="ts-gop-tab"
          onClick={() => setActiveTab("ost-premiere")}
        >
          <Music2 size={15} aria-hidden="true" />
          웹 OST 싱크·시사회·히트맵
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "trust-health"}
          className="ts-gop-tab"
          onClick={() => setActiveTab("trust-health")}
        >
          <ShieldCheck size={15} aria-hidden="true" />
          <HeartPulse size={14} aria-hidden="true" />
          인간 작화 증명·건강 코치
        </button>
      </div>

      {activeTab === "character-sfx" ? (
        <CharacterSfxTabPanel
          promptText={promptText}
          onPromptTextChange={setPromptText}
          renderInfluence={renderInfluence}
          onRenderInfluenceChange={setRenderInfluence}
          mirrorMode={mirrorMode}
          onMirrorModeChange={setMirrorMode}
          mentionResult={mentionResult}
          selectedLocales={selectedLocales}
          onToggleLocale={handleToggleLocale}
          onSelectAll20Locales={handleSelectAll20Locales}
          sfxPlan={sfxPlan}
        />
      ) : null}

      {activeTab === "ost-premiere" ? (
        <OstPremiereHeatmapTabPanel
          scrollProgress={scrollProgress}
          onScrollProgressChange={setScrollProgress}
          emotionOverride={emotionOverride}
          onEmotionOverrideChange={setEmotionOverride}
          ostMix={ostMix}
          premiereSession={premiereSession}
          heatmapReport={heatmapReport}
        />
      ) : null}

      {activeTab === "trust-health" ? (
        <HumanCraftHealthTabPanel
          handMinutes={handMinutes}
          scene3dMinutes={scene3dMinutes}
          aiAssistMinutes={aiAssistMinutes}
          onChangeCraftMinutes={handleChangeCraftMinutes}
          craftCertificate={craftCertificate}
          watermarkRecipient={watermarkRecipient}
          onWatermarkRecipientChange={setWatermarkRecipient}
          watermarkPurpose={watermarkPurpose}
          onWatermarkPurposeChange={setWatermarkPurpose}
          watermark={watermark}
          continuousDrawingMinutes={continuousDrawingMinutes}
          onContinuousDrawingMinutesChange={setContinuousDrawingMinutes}
          pressureStiffness={pressureStiffness}
          onPressureStiffnessChange={setPressureStiffness}
          leftHandShortcutActive={leftHandShortcutActive}
          onToggleLeftHandShortcut={handleToggleLeftHandShortcut}
          healthCoach={healthCoach}
        />
      ) : null}

      {statusNoticeKo ? (
        <p role="status" className="ts-gop-notice" data-testid="gop-status-notice">
          {statusNoticeKo}
        </p>
      ) : null}
    </section>
  );
}

export default StudioGlobalOstPremiereHub;
