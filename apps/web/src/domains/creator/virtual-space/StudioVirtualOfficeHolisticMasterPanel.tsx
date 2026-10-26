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
  setCreatorPresentationMode,
  setKrispTranslationLocale,
  toggleFloatingPipAlwaysOnTop,
  toggleKrispBvcNoiseCancellation,
  type CreatorPresentationOverlayMode,
  type TranslationLocaleCode,
} from "./studio-virtual-office-holistic-master-model";

const PRESENTATION_MODES: readonly {
  readonly id: CreatorPresentationOverlayMode;
  readonly labelKo: string;
}[] = [
  { id: "over-the-shoulder-tablet", labelKo: "Airtime 오버더숄더 콘티 슬라이드" },
  { id: "floating-pip-bubble", labelKo: "Whereby 플로팅 PiP 카메라 버블" },
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
    >
      {/* 1. Wave 5 REA Reverse-Engineered Evidence Header */}
      <section className="rounded-xl border border-line bg-card/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
              <Sparkles className="h-4 w-4 text-accent" />
              Wave 5 올인원 커맨드 (Whereby · Pumble · Krisp · Airtime/mmhmm · Cal.com) + 40대 플랫폼 총괄 매트릭스
            </h3>
            <p className="mt-0.5 text-xs text-fg-2">
              플로팅 PiP 오버더숄더 발표 · AI 펜소음 제거(BVC) 및 4개국어 실시간 자막 · 캘린더 자동 상태 전환 · 일일 스탠드업 다이제스트 봇
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              누적 40개 플랫폼 100% 내재화
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

      {/* 2. Whereby + Airtime/mmhmm Over-the-Shoulder & Floating PiP Stage + Krisp AI Voice/Translation */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-card/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <PictureInPicture2 className="h-4 w-4 text-accent" />
              Whereby 플로팅 PiP &amp; Airtime 오버더숄더 콘티 스테이지
            </h4>
            <button
              type="button"
              onClick={() => {
                setState((prev) => toggleFloatingPipAlwaysOnTop(prev));
                onBannerChange?.(
                  `[Whereby PiP] 클립스튜디오 위 항상 위(Always-on-Top) 버블 ${!state.presentation.alwaysOnTopPip ? "활성화" : "해제"}`,
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
                  onBannerChange?.(`[Airtime/Whereby] 발표 레이아웃 전환: ${m.labelKo}`);
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
                    onBannerChange?.("[Airtime 오버더숄더] 다음 에피소드 컷 브리핑 슬라이드로 전환");
                  }}
                  className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent"
                >
                  다음 컷 슬라이드
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {/* Krisp AI Voice Clarity & Multilingual Translation */}
        <section className="rounded-xl border border-line bg-card/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Languages className="h-4 w-4 text-cool" />
              Krisp AI 펜소음 제거(BVC) &amp; 4개국어 실시간 자막 번역
            </h4>
            <button
              type="button"
              data-testid="holistic-toggle-krisp-btn"
              onClick={() => {
                setState((prev) => toggleKrispBvcNoiseCancellation(prev));
                onBannerChange?.(
                  `[Krisp BVC] 펜 태블릿·배경 소음 제거 ${!state.voiceClarity.bvcNoiseCancellationEnabled ? "활성화" : "해제"}`,
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
                    `[Krisp 실시간 번역] 글로벌 검수 자막 언어 전환: ${loc.label}`,
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

      {/* 3. Cal.com Auto-Presence Sync + Pumble Daily Standup Bot */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-card/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <CalendarClock className="h-4 w-4 text-accent" />
              Cal.com 캘린더 연동 자동 상태·모자 전환 &amp; T-5분 룸 잠금 해제
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
                    `[Cal.com 자동 동기화] ${preset.label} → 상태 ${next.calendarSync.activeSyncedStatus} (${next.calendarSync.activeSyncedHat})`,
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

        {/* Pumble Daily Episode Standup Digest Bot */}
        <section className="rounded-xl border border-line bg-card/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <CheckCircle2 className="h-4 w-4 text-good" />
              Pumble 데일리 에피소드 비동기 스탠드업 다이제스트 봇
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
    </div>
  );
}
