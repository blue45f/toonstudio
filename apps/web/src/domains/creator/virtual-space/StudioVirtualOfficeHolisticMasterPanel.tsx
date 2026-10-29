"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Languages,
  Layers,
  Lock,
  Mic,
  PictureInPicture2,
  Search,
  Sparkles,
  Unlock,
} from "lucide-react";

import {
  VIRTUAL_OFFICE_WAVE5_REA_EVIDENCE_LEDGER,
  advancePresentationSlideDeck,
  createInitialHolisticMasterState,
  evaluateCalendarAutoPresenceAtMinute,
  filterHolistic40Platforms,
  getActiveIllustratedCharacterFrame,
  selectIllustratedCharacterFrame,
  setCreatorPresentationMode,
  setKrispTranslationLocale,
  toggleFloatingPipAlwaysOnTop,
  toggleKrispBvcNoiseCancellation,
  toggleIllustratedDecorPropPlacement,
  type CreatorPresentationOverlayMode,
  type IllustratedCharacterDirection,
  type IllustratedCharacterPose,
  type TranslationLocaleCode,
} from "./studio-virtual-office-holistic-master-model";
import { StudioVirtualOfficeNextGenEnginePanel } from "./StudioVirtualOfficeNextGenEnginePanel";

const PRESENTATION_MODES: readonly {
  readonly id: CreatorPresentationOverlayMode;
  readonly labelKo: string;
}[] = [
  { id: "over-the-shoulder-tablet", labelKo: "오버더숄더 콘티 슬라이드" },
  { id: "floating-pip-bubble", labelKo: "플로팅 PiP 카메라 버블" },
  { id: "transparent-silhouette-cutout", labelKo: "투명 실루엣 컷아웃 브리핑" },
  { id: "split-storyboard-stage", labelKo: "듀얼 펜 태블릿 분할 스테이지" },
];

const LOCALE_BUTTONS: readonly {
  readonly code: TranslationLocaleCode;
  readonly label: string;
}[] = [
  { code: "ko", label: "한국어 (KO)" },
  { code: "ja", label: "日本語 (JA)" },
  { code: "en", label: "English (EN)" },
  { code: "zh", label: "中文 (ZH)" },
];

function formatMinuteOfDay(minute: number): string {
  const hh = String(Math.floor(minute / 60)).padStart(2, "0");
  const mm = String(minute % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export interface StudioVirtualOfficeHolisticMasterPanelProps {
  readonly onBannerChange?: (banner: string) => void;
}

export function StudioVirtualOfficeHolisticMasterPanel({
  onBannerChange,
}: StudioVirtualOfficeHolisticMasterPanelProps) {
  const [state, setState] = useState(createInitialHolisticMasterState);
  const [platformQuery, setPlatformQuery] = useState("");
  const [waveFilter, setWaveFilter] = useState<"all" | 1 | 2 | 3 | 4 | 5>("all");
  const [density, setDensity] = useState<"compact" | "spacious">("compact");
  const [sectionView, setSectionView] = useState<"all" | "ai-collab" | "theme-cast" | "engine">("all");

  const activeSlide =
    state.presentation.slides[state.presentation.activeSlideIndex] ??
    state.presentation.slides[0];

  const filteredPlatforms = useMemo(
    () => filterHolistic40Platforms(platformQuery, waveFilter),
    [platformQuery, waveFilter],
  );

  return (
    <div
      className="space-y-4"
      data-testid="virtual-office-holistic-master-panel"
      data-density={density}
      data-section-view={sectionView}
    >
      {/* 1. Smart AI Studio Command & View Separation Header */}
      <section className="rounded-xl border border-line bg-card/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
              <Sparkles className="h-4 w-4 text-accent" />
              스마트 AI 스튜디오 통합 커맨드 (플로팅 PiP · AI 보이스/자막 · 일정 자동 동기화 · 데일리 다이제스트)
            </h3>
            <p className="mt-0.5 text-xs text-fg-2">
              플로팅 PiP 오버더숄더 발표 · 스마트 AI 펜소음 제거(BVC) 및 4개국어 실시간 자막 보조 · 캘린더 자동 상태 전환 · 일일 스탠드업 다이제스트 보조
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              ✦ 스마트 AI 협업 보조 내재화
            </span>
            <button
              type="button"
              onClick={() => {
                const next = density === "compact" ? "spacious" : "compact";
                setDensity(next);
                onBannerChange?.(
                  `[UI 밀도 전환] ${next === "compact" ? "컴팩트(Compact)" : "여유(Spacious)"} 레이아웃 적용`,
                );
              }}
              className="rounded-lg border border-line bg-raised px-2.5 py-1 text-[11px] font-medium text-fg-2 hover:text-fg"
            >
              밀도: {density === "compact" ? "컴팩트" : "여유"}
            </button>
          </div>
        </div>
        <div
          role="tablist"
          aria-label="스마트 AI 스튜디오 영역 분리 보기"
          className="mt-3 flex flex-wrap gap-1.5 border-t border-line/70 pt-2.5"
        >
          {(
            [
              { id: "all", label: "전체 통합 보기" },
              { id: "ai-collab", label: "스마트 AI 음성·발표·일정 보조" },
              { id: "theme-cast", label: "2.5D 스튜디오 테마·캐릭터·프롭" },
              { id: "engine", label: "차세대 물리·사운드·마감 워크벤치" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={sectionView === tab.id}
              onClick={() => setSectionView(tab.id)}
              className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${
                sectionView === tab.id
                  ? "border-accent bg-accent text-canvas shadow-sm"
                  : "border-line bg-panel text-fg-2 hover:border-accent/45 hover:text-fg"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {VIRTUAL_OFFICE_WAVE5_REA_EVIDENCE_LEDGER.map((ev) => (
            <article
              key={ev.id}
              className="rounded-lg border border-line bg-panel/80 p-2.5 text-xs"
            >
              <div className="flex items-center justify-between gap-1">
                <strong className="font-semibold text-fg">{ev.name}</strong>
                <span className="font-mono text-[10px] text-cool">
                  AST {ev.visitedAstNodes.toLocaleString()}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] text-fg-2">
                {ev.toonStudioInternalizationKo}
              </p>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-fg-3">
                <span>JS {ev.parsedJsFiles}개</span>
                <span>Findings {ev.findings}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {(sectionView === "all" || sectionView === "ai-collab") && (
      <>
      {/* 2. Over-the-Shoulder & Floating PiP Stage + Smart AI Voice/Translation */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-card/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <PictureInPicture2 className="h-4 w-4 text-accent" />
              플로팅 PiP &amp; 오버더숄더 콘티 브리핑 스테이지
            </h4>
            <button
              type="button"
              onClick={() => {
                setState((prev) => toggleFloatingPipAlwaysOnTop(prev));
                onBannerChange?.(
                  `[플로팅 PiP] 드로잉 창 위 항상 위(Always-on-Top) 버블 ${!state.presentation.alwaysOnTopPip ? "활성화" : "해제"}`,
                );
              }}
              data-testid="holistic-toggle-pip-btn"
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                state.presentation.alwaysOnTopPip
                  ? "border-good bg-good-soft text-good"
                  : "border-line bg-raised text-fg-2"
              }`}
            >
              PiP 항상 위: {state.presentation.alwaysOnTopPip ? "ON" : "OFF"}
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {PRESENTATION_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setState((prev) => setCreatorPresentationMode(prev, m.id));
                  onBannerChange?.(`[브리핑 스테이지] 발표 레이아웃 전환: ${m.labelKo}`);
                }}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                  state.presentation.mode === m.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-2 hover:text-fg"
                }`}
              >
                {m.labelKo}
              </button>
            ))}
          </div>

          {activeSlide ? (
            <div className="mt-3 rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center justify-between text-[11px] text-fg-3">
                <span className="font-mono font-semibold text-cool">
                  {activeSlide.cutRangeLabel}
                </span>
                <span>
                  슬라이드 {state.presentation.activeSlideIndex + 1} /{" "}
                  {state.presentation.slides.length} · 에코 감쇠{" "}
                  {state.presentation.acousticEchoDuckingDb}dB
                </span>
              </div>
              <p className="mt-1 text-xs font-bold text-fg">{activeSlide.titleKo}</p>
              <p className="mt-0.5 text-[11px] text-fg-2">{activeSlide.directorNoteKo}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setState((prev) => advancePresentationSlideDeck(prev, "prev"))
                  }
                  className="rounded border border-line bg-raised px-2.5 py-1 text-[11px] text-fg-2 hover:text-fg"
                >
                  이전 컷 슬라이드
                </button>
                <button
                  type="button"
                  data-testid="holistic-next-slide-btn"
                  onClick={() => {
                    setState((prev) => advancePresentationSlideDeck(prev, "next"));
                    onBannerChange?.("[오버더숄더 브리핑] 다음 에피소드 컷 브리핑 슬라이드로 전환");
                  }}
                  className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent"
                >
                  다음 컷 슬라이드
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {/* Smart AI Voice Clarity & Multilingual Translation */}
        <section className="rounded-xl border border-line bg-card/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Languages className="h-4 w-4 text-cool" />
              스마트 AI 펜소음 제거(BVC) &amp; 4개국어 실시간 자막 보조
            </h4>
            <button
              type="button"
              data-testid="holistic-toggle-krisp-btn"
              onClick={() => {
                setState((prev) => toggleKrispBvcNoiseCancellation(prev));
                onBannerChange?.(
                  `[스마트 AI BVC] 펜 태블릿·배경 소음 제거 ${!state.voiceClarity.bvcNoiseCancellationEnabled ? "활성화" : "해제"}`,
                );
              }}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${
                state.voiceClarity.bvcNoiseCancellationEnabled
                  ? "border-good bg-good-soft text-good"
                  : "border-line bg-raised text-fg-2"
              }`}
            >
              <Mic className="h-3 w-3" />
              BVC 소음차단: {state.voiceClarity.bvcNoiseCancellationEnabled ? "ON" : "OFF"}
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {LOCALE_BUTTONS.map((loc) => (
              <button
                key={loc.code}
                type="button"
                data-testid={`holistic-locale-${loc.code}-btn`}
                onClick={() => {
                  setState((prev) => setKrispTranslationLocale(prev, loc.code));
                  onBannerChange?.(
                    `[스마트 AI 실시간 번역] 글로벌 검수 자막 언어 전환: ${loc.label}`,
                  );
                }}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                  state.voiceClarity.targetTranslationLocale === loc.code
                    ? "border-cool bg-raised text-cool"
                    : "border-line bg-panel text-fg-2 hover:text-fg"
                }`}
              >
                {loc.label}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {state.voiceClarity.liveTranscripts.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-line bg-panel p-2.5 text-xs"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <strong className="text-fg">{item.speakerName}</strong>
                  <span className="text-fg-3">
                    {item.suppressedNoiseTypes.join(" · ")}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-fg-2">{item.originalText}</p>
                <p className="mt-1 font-medium text-accent">{item.translatedText}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 3. Schedule Auto-Presence Sync + Daily Standup Digest Assistant */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-card/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <CalendarClock className="h-4 w-4 text-accent" />
              일정 연동 자동 상태·모자 전환 &amp; T-5분 룸 잠금 해제
            </h4>
            <span className="rounded-md border border-accent bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
              현재 {formatMinuteOfDay(state.calendarSync.currentMinuteOfDay)} · 상태:{" "}
              {state.calendarSync.activeSyncedStatus} ({state.calendarSync.activeSyncedHat})
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {[
              { label: "09:56 (스탠드업 4분 전)", minute: 9 * 60 + 56 },
              { label: "10:10 (스탠드업 중)", minute: 10 * 60 + 10 },
              { label: "14:00 (딥포커스 작화)", minute: 14 * 60 },
              { label: "16:45 (글로벌 검수)", minute: 16 * 60 + 45 },
            ].map((preset) => (
              <button
                key={preset.minute}
                type="button"
                data-testid={`holistic-cal-time-${preset.minute}-btn`}
                onClick={() => {
                  const next = evaluateCalendarAutoPresenceAtMinute(state, preset.minute);
                  setState(next);
                  onBannerChange?.(
                    `[일정 자동 동기화] ${preset.label} → 상태 ${next.calendarSync.activeSyncedStatus} (${next.calendarSync.activeSyncedHat})`,
                  );
                }}
                className="rounded-lg border border-line bg-raised px-2.5 py-1 text-[11px] text-fg-2 hover:text-fg"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {state.calendarSync.scheduledBlocks.map((b) => (
              <div
                key={b.bookingId}
                className="flex items-center justify-between gap-2 rounded-lg border border-line bg-panel p-2.5 text-xs"
              >
                <div>
                  <strong className="text-fg">{b.titleKo}</strong>
                  <p className="text-[11px] text-fg-2">
                    {formatMinuteOfDay(b.startMinuteOfDay)}–
                    {formatMinuteOfDay(b.endMinuteOfDay)} · 자동 상태:{" "}
                    <span className="font-mono text-fg">{b.autoMappedStatus}</span> ·{" "}
                    {b.autoMappedHat}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    b.roomUnlocked
                      ? "border-good bg-good-soft text-good"
                      : "border-line bg-raised text-fg-3"
                  }`}
                >
                  {b.roomUnlocked ? (
                    <>
                      <Unlock className="h-3 w-3" /> 룸 열림
                    </>
                  ) : (
                    <>
                      <Lock className="h-3 w-3" /> 잠김
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Smart AI Daily Episode Standup Digest Assistant */}
        <section className="rounded-xl border border-line bg-card/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <CheckCircle2 className="h-4 w-4 text-good" />
              스마트 AI 데일리 에피소드 비동기 스탠드업 다이제스트 보조
            </h4>
            <span className="text-[11px] text-fg-3">
              응답 {state.standupDigest.length}명 · 블로커{" "}
              {state.standupDigest.filter((d) => d.blockerKo !== null).length}건
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {state.standupDigest.map((entry) => (
              <article
                key={entry.creatorId}
                className="rounded-lg border border-line bg-panel p-2.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-fg">
                    {entry.creatorName} ·{" "}
                    <span className="font-normal text-fg-2">{entry.roleKo}</span>
                  </strong>
                  <span className="font-mono text-[10px] text-fg-3">
                    {entry.submittedAtLabel}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-good">완료: {entry.completedCutsKo}</p>
                <p className="text-[11px] text-fg-2">진행: {entry.inProgressCutsKo}</p>
                {entry.blockerKo ? (
                  <p className="mt-0.5 text-[11px] font-semibold text-warn">
                    블로커: {entry.blockerKo}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
      </>
      )}

      {/* 4. 40-Platform Unified REA Master Catalog & Filter */}
      <section className="rounded-xl border border-line bg-card/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Layers className="h-4 w-4 text-accent" />
            전수 역공학 40대 가상 오피스 플랫폼 통합 카탈로그 (Waves 1–5)
          </h4>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", 1, 2, 3, 4, 5] as const).map((w) => (
              <button
                key={String(w)}
                type="button"
                onClick={() => setWaveFilter(w)}
                className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                  waveFilter === w
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-2"
                }`}
              >
                {w === "all" ? "전체 (40)" : `Wave ${w}`}
              </button>
            ))}
            <label className="flex items-center gap-1 rounded-md border border-line bg-panel px-2 py-0.5 text-xs text-fg-2">
              <Search className="h-3 w-3 text-fg-3" />
              <input
                type="search"
                value={platformQuery}
                onChange={(e) => setPlatformQuery(e.target.value)}
                placeholder="플랫폼·기능 검색..."
                aria-label="40대 플랫폼 검색"
                className="w-32 bg-transparent text-[11px] text-fg focus:outline-none"
              />
            </label>
          </div>
        </div>

        <div className="mt-3 grid max-h-64 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-4">
          {filteredPlatforms.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-line bg-panel/90 p-2 text-[11px]"
            >
              <div className="flex items-center justify-between gap-1">
                <strong className="text-fg">
                  #{item.index} {item.name}
                </strong>
                <span className="rounded border border-line bg-raised px-1.5 py-0.2 font-mono text-[10px] text-cool">
                  W{item.wave}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-fg-2">{item.signatureFeatureKo}</p>
            </div>
          ))}
        </div>
      </section>

      {(sectionView === "all" || sectionView === "theme-cast") && (
      <section
        className="rounded-xl border border-line bg-card/70 p-4"
        data-testid="illustrated-studio-pack-section"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Sparkles className="h-4 w-4 text-accent" />
              고해상도 스튜디오 테마 · 5종 장식 프롭 · 8프레임 치비 캐릭터 스프라이트
            </h4>
            <p className="mt-0.5 text-[11px] text-fg-2">
              2.5D 아이소메트릭 파노라마 테마(1280×720) · 신티크/홀로그램/로파이/ON-AIR/바이오필릭 프롭(384×384) · 4방향×2포즈 투명 RGBA 캐릭터 시트(1024×512)
            </p>
          </div>
          <span className="rounded-md border border-accent bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
            장착 프롭 {state.illustratedStudioPack.equippedDecorPropIds.length}/
            {state.illustratedStudioPack.props.length}종 · 활성 프레임{" "}
            {getActiveIllustratedCharacterFrame(state).id}
          </span>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {/* Left: Character 8-Frame RGBA Sprite Customizer & Preview */}
          <div className="rounded-lg border border-line bg-panel p-3">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <strong className="text-xs text-fg">
                치비 웹툰 크리에이터 4방향×2포즈 RGBA 스프라이트 인스펙터
              </strong>
              <div className="flex gap-1">
                {(["idle", "drawing"] as const).map((poseKey: IllustratedCharacterPose) => (
                  <button
                    key={poseKey}
                    type="button"
                    data-testid={`illustrated-pose-${poseKey}-btn`}
                    onClick={() => {
                      const next = selectIllustratedCharacterFrame(
                        state,
                        state.illustratedStudioPack.activeCharacterDirection,
                        poseKey,
                      );
                      setState(next);
                      onBannerChange?.(
                        `캐릭터 포즈 전환: ${poseKey === "drawing" ? "태블릿 작화(Drawing)" : "스튜디오 대기(Idle)"}`,
                      );
                    }}
                    className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                      state.illustratedStudioPack.activeCharacterPose === poseKey
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-fg-2"
                    }`}
                  >
                    {poseKey === "idle" ? "대기 (Idle)" : "태블릿 작화 (Drawing)"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  { dir: "down", label: "정면 (Down)" },
                  { dir: "left", label: "좌측 (Left)" },
                  { dir: "right", label: "우측 (Right)" },
                  { dir: "up", label: "후면 (Up)" },
                ] as const
              ).map(({ dir, label }: { readonly dir: IllustratedCharacterDirection; readonly label: string }) => (
                <button
                  key={dir}
                  type="button"
                  data-testid={`illustrated-dir-${dir}-btn`}
                  onClick={() => {
                    const next = selectIllustratedCharacterFrame(
                      state,
                      dir,
                      state.illustratedStudioPack.activeCharacterPose,
                    );
                    setState(next);
                    onBannerChange?.(`캐릭터 방향 전환: ${label}`);
                  }}
                  className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                    state.illustratedStudioPack.activeCharacterDirection === dir
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <figure className="flex flex-col items-center justify-center rounded-lg border border-line bg-card p-2">
                <img
                  src={getActiveIllustratedCharacterFrame(state).assetUrl}
                  alt={getActiveIllustratedCharacterFrame(state).labelKo}
                  data-testid="illustrated-active-character-img"
                  className="h-28 w-28 object-contain"
                  loading="lazy"
                />
                <figcaption className="mt-1 text-center text-[11px] font-medium text-fg">
                  {getActiveIllustratedCharacterFrame(state).labelKo}
                </figcaption>
              </figure>
              <figure className="flex flex-col items-center justify-center rounded-lg border border-line bg-card p-2">
                <img
                  src={state.illustratedStudioPack.characterCleanAtlasUrl}
                  alt="4x2 투명 RGBA 캐릭터 아틀라스"
                  className="h-28 w-full object-contain"
                  loading="lazy"
                />
                <figcaption className="mt-1 text-center text-[10px] text-fg-2">
                  4×2 투명 RGBA 런타임 시트 (1024×512)
                </figcaption>
              </figure>
            </div>
          </div>

          {/* Right: 2.5D Studio Floor Panorama & 5 Isometric Decor Props */}
          <div className="rounded-lg border border-line bg-panel p-3">
            <div className="flex items-center justify-between">
              <strong className="text-xs text-fg">
                2.5D 웹툰 스튜디오 파노라마 테마 & 5대 장식 프롭 배치
              </strong>
              <span className="font-mono text-[10px] text-fg-3">
                2.5D 아이소메트릭 테마 팩
              </span>
            </div>

            <div className="mt-2 overflow-hidden rounded-lg border border-line bg-card">
              <img
                src={state.illustratedStudioPack.panoramaAssetUrl}
                alt="2.5D 가상 웹툰 스튜디오 플로어 파노라마 테마"
                className="h-28 w-full object-cover"
                loading="lazy"
              />
            </div>

            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {state.illustratedStudioPack.props.map((prop) => {
                const equipped =
                  state.illustratedStudioPack.equippedDecorPropIds.includes(prop.id);
                return (
                  <button
                    key={prop.id}
                    type="button"
                    data-testid={`illustrated-prop-${prop.id}-btn`}
                    onClick={() => {
                      const next = toggleIllustratedDecorPropPlacement(state, prop.id);
                      setState(next);
                      onBannerChange?.(
                        `스튜디오 프롭 ${equipped ? "해제" : "배치"}: ${prop.labelKo}`,
                      );
                    }}
                    className={`flex items-center gap-2 rounded-lg border p-1.5 text-left text-[11px] transition ${
                      equipped
                        ? "border-accent bg-accent-soft text-fg"
                        : "border-line bg-card text-fg-2"
                    }`}
                  >
                    <img
                      src={prop.assetUrl}
                      alt={prop.labelKo}
                      className="h-10 w-10 shrink-0 rounded border border-line object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-fg">{prop.labelKo}</div>
                      <div className="truncate text-[10px] text-fg-3">
                        {prop.zoneKo} · {prop.reaInspiration}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      )}

      {/* 7. Next-Gen Multi-Theme, Diverse Creator Cast, 60fps Physics & HRTF Soundscape Engine */}
      {(sectionView === "all" || sectionView === "engine") && (
        <StudioVirtualOfficeNextGenEnginePanel onBannerChange={onBannerChange} />
      )}
    </div>
  );
}
