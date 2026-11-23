import { useId, useMemo, useState } from "react";

import {
  DEFAULT_STORY_PITCH_SAMPLES,
  STORY_GENRE_LABELS,
  analyzeStoryClicheSimilarity,
  combineRandomInspirationSpark,
  type ClicheRiskLevel,
  type StoryGenreKey,
  type StoryPitchInput,
} from "./anti-cliche-divergence-engine";
import {
  DEFAULT_CHARACTER_GROWTH_PRESETS,
  PSYCHOLOGY_AXES,
  PSYCHOLOGY_AXIS_LABELS,
  SPEECH_TONE_LABELS,
  applyTimelineSuggestedFix,
  createContradictionDemoArc,
  evaluateCharacterTimelineConsistency,
  interpolateCharacterAppearanceAtEpisode,
  type CharacterGrowthArc,
  type SpeechToneTag,
  type TransitionVerdict,
} from "./character-growth-timeline";

export interface StoryGrowthInspirerPanelProps {
  readonly initialArcs?: readonly CharacterGrowthArc[];
  readonly onArcChange?: (arc: CharacterGrowthArc) => void;
  readonly initialPitch?: StoryPitchInput;
  readonly initialTab?: "timeline" | "inspirer";
}

type ActiveTab = "timeline" | "inspirer";

const BTN =
  "min-h-11 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_ACCENT =
  "min-h-11 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const INPUT_CLASS =
  "min-h-11 w-full rounded-lg border border-line bg-field px-3 py-2 text-xs text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const TAB_BASE =
  "min-h-11 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const SPEECH_TONE_OPTIONS: readonly SpeechToneTag[] = ["formal", "casual", "cynical", "warm", "terse"];
const GENRE_OPTIONS = Object.keys(STORY_GENRE_LABELS) as readonly StoryGenreKey[];

const VERDICT_META: Readonly<Record<TransitionVerdict, { readonly labelKo: string; readonly badgeClass: string }>> = {
  "intentional-growth": { labelKo: "의도된 성장", badgeClass: "border-good/40 bg-good-soft text-good" },
  contradiction: { labelKo: "모순 경고", badgeClass: "border-bad/40 bg-bad-soft text-bad" },
  "steady-continuity": { labelKo: "안정 유지", badgeClass: "border-cool/40 bg-info-soft text-cool" },
};

const RISK_BADGE_CLASS: Readonly<Record<ClicheRiskLevel, string>> = {
  high: "border-bad/40 bg-bad-soft text-bad",
  moderate: "border-warn/40 bg-warning-soft text-warn",
  low: "border-good/40 bg-good-soft text-good",
};

/**
 * 시간축 캐릭터 성장·일관성 추적기 & 유사 클리셰 진단·영감 비틀기 통합 패널.
 * Calm Atelier 시맨틱 토큰 전용 · 순수 클라이언트 로컬 실행.
 */
export function StoryGrowthInspirerPanel({
  initialArcs,
  onArcChange,
  initialPitch,
  initialTab = "timeline",
}: StoryGrowthInspirerPanelProps) {
  const baseId = useId();
  const baseArcs = initialArcs && initialArcs.length > 0 ? initialArcs : DEFAULT_CHARACTER_GROWTH_PRESETS;
  const fallbackPitch: StoryPitchInput = DEFAULT_STORY_PITCH_SAMPLES[0]?.input ?? {
    logline: "", genre: "modern-fantasy", keywords: [], protagonistTrait: "",
  };

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [arcs, setArcs] = useState<readonly CharacterGrowthArc[]>(baseArcs);
  const [selectedArcId, setSelectedArcId] = useState<string>(baseArcs[0]?.id ?? "");
  const [selectedEpisode, setSelectedEpisode] = useState<number>(
    baseArcs[0]?.snapshots[1]?.episode ?? baseArcs[0]?.snapshots[0]?.episode ?? 1,
  );
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [pitch, setPitch] = useState<StoryPitchInput>(initialPitch ?? fallbackPitch);
  const [keywordsDraft, setKeywordsDraft] = useState<string>((initialPitch ?? fallbackPitch).keywords.join(", "));
  const [sparkSeed, setSparkSeed] = useState<number>(2026);

  const activeArc = useMemo(
    () => arcs.find((item) => item.id === selectedArcId) ?? arcs[0] ?? DEFAULT_CHARACTER_GROWTH_PRESETS[0],
    [arcs, selectedArcId],
  );
  const consistencyReport = useMemo(
    () => (activeArc ? evaluateCharacterTimelineConsistency(activeArc) : null),
    [activeArc],
  );
  const interpolated = useMemo(
    () => (activeArc ? interpolateCharacterAppearanceAtEpisode(activeArc, selectedEpisode) : null),
    [activeArc, selectedEpisode],
  );
  const maxEpisode = useMemo(
    () => (activeArc && activeArc.snapshots.length > 0 ? Math.max(...activeArc.snapshots.map((s) => s.episode)) : 60),
    [activeArc],
  );
  const diagnosis = useMemo(() => analyzeStoryClicheSimilarity(pitch), [pitch]);
  const spark = useMemo(() => combineRandomInspirationSpark(sparkSeed), [sparkSeed]);

  const updateActiveArc = (nextArc: CharacterGrowthArc, noticeText: string) => {
    setArcs((prev) => prev.map((item) => (item.id === nextArc.id ? nextArc : item)));
    setStatusNotice(noticeText);
    onArcChange?.(nextArc);
  };

  const handleSelectPreset = (arcId: string) => {
    setSelectedArcId(arcId);
    const found = arcs.find((item) => item.id === arcId);
    setSelectedEpisode(found?.snapshots[1]?.episode ?? found?.snapshots[0]?.episode ?? 1);
    setStatusNotice(null);
  };

  const handleResetCurrentArc = () => {
    if (!activeArc) return;
    const original = baseArcs.find((item) => item.id === activeArc.id);
    if (original) updateActiveArc(original, `${original.characterName} 기본 프리셋을 복원했습니다.`);
  };

  const handleInjectContradictionDemo = () => {
    if (!activeArc) return;
    const demo = createContradictionDemoArc(activeArc);
    updateActiveArc(demo, "60화 구간에 흉터 누락·연령 역행·사건 누락 예시를 넣었습니다. 아래 1클릭 보정을 확인해 보세요.");
    setSelectedEpisode(demo.snapshots[demo.snapshots.length - 1]?.episode ?? selectedEpisode);
  };

  const handleKeywordsChange = (raw: string) => {
    setKeywordsDraft(raw);
    const parsed = raw.split(/[,，\n]+/).map((item) => item.trim()).filter(Boolean);
    setPitch((prev) => ({ ...prev, keywords: parsed }));
  };

  const handleApplySample = (sample: StoryPitchInput) => {
    setPitch(sample);
    setKeywordsDraft(sample.keywords.join(", "));
  };

  const timelineTabId = `${baseId}-tab-timeline`;
  const inspirerTabId = `${baseId}-tab-inspirer`;
  const timelinePanelId = `${baseId}-panel-timeline`;
  const inspirerPanelId = `${baseId}-panel-inspirer`;

  const visualMoodRows = [
    { label: "선화 대비", value: `${diagnosis.detectedVisualMood.lineContrastKo} (${diagnosis.detectedVisualMood.lineContrastScore}/100)` },
    { label: "색온도", value: `${diagnosis.detectedVisualMood.colorTemperatureKo} (${diagnosis.detectedVisualMood.colorTempKelvin}K)` },
    { label: "컷 밀도", value: diagnosis.detectedVisualMood.panelDensityKo },
  ];
  const sparkCards = [
    { key: "setting", tag: "배경", title: spark.setting.labelKo, note: spark.setting.detailKo },
    { key: "conflict", tag: "갈등", title: spark.conflict.labelKo, note: spark.conflict.detailKo },
    { key: "visual", tag: "시각장치", title: spark.visualDevice.labelKo, note: spark.visualDevice.studioTipKo },
    { key: "arc", tag: "감정곡선", title: spark.emotionalArc.labelKo, note: spark.emotionalArc.detailKo },
  ];

  return (
    <section
      aria-label="캐릭터 시간축 일관성 및 클리셰 비틀기 영감 도구"
      data-testid="story-growth-inspirer-panel"
      className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all]"
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-fg">장기 연재 캐릭터 성장 · 클리셰 비틀기</h2>
          <span className="rounded-full border border-line bg-card px-2.5 py-0.5 text-[0.7rem] text-fg-3">로컬 엔진 · 즉시 진단</span>
        </div>
        <p className="text-xs leading-relaxed text-fg-3">
          의도된 성장과 설정 모순을 자동으로 가르고, 익숙한 웹툰 공식을 3가지 직교 방향으로 비틉니다.
        </p>
      </header>

      <div role="tablist" aria-label="스토리 진화 도구 탭" className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-canvas p-1">
        <button id={timelineTabId} type="button" role="tab" aria-selected={activeTab === "timeline"} aria-controls={timelinePanelId} data-testid="tab-character-timeline" onClick={() => setActiveTab("timeline")} className={`${TAB_BASE} ${activeTab === "timeline" ? "bg-accent text-on-accent" : "bg-transparent text-fg-2 hover:bg-raised hover:text-fg"}`}>
          시간축 성장·일관성 추적기
        </button>
        <button id={inspirerTabId} type="button" role="tab" aria-selected={activeTab === "inspirer"} aria-controls={inspirerPanelId} data-testid="tab-cliche-inspirer" onClick={() => setActiveTab("inspirer")} className={`${TAB_BASE} ${activeTab === "inspirer" ? "bg-accent text-on-accent" : "bg-transparent text-fg-2 hover:bg-raised hover:text-fg"}`}>
          클리셰 진단·영감 비틀기
        </button>
      </div>

      {activeTab === "timeline" && activeArc && consistencyReport && interpolated ? (
        <div id={timelinePanelId} role="tabpanel" aria-labelledby={timelineTabId} data-testid="panel-character-timeline" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="캐릭터 프리셋">
              {arcs.map((arcItem) => (
                <button key={arcItem.id} type="button" aria-pressed={arcItem.id === activeArc.id} data-testid={`preset-${arcItem.id}`} onClick={() => handleSelectPreset(arcItem.id)} className={arcItem.id === activeArc.id ? BTN_ACCENT : BTN}>
                  {arcItem.characterName} ({arcItem.genreLabel})
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <label className="flex items-center gap-1.5 text-xs text-fg-2">
                <span>말투 잠금</span>
                <select
                  aria-label="캐릭터 말투 락킹 선택"
                  data-testid="speech-tone-lock-select"
                  value={activeArc.lockedSpeechTone ?? ""}
                  onChange={(event) => {
                    const raw = event.currentTarget.value;
                    const nextLock = raw === "" ? null : (raw as SpeechToneTag);
                    updateActiveArc(
                      { ...activeArc, lockedSpeechTone: nextLock },
                      nextLock ? `말투 잠금을 '${SPEECH_TONE_LABELS[nextLock]}'로 설정했습니다.` : "말투 고정 잠금을 해제했습니다.",
                    );
                  }}
                  className="min-h-11 rounded-lg border border-line bg-field px-2 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <option value="">잠금 해제(사건 기반 전환)</option>
                  {SPEECH_TONE_OPTIONS.map((tone) => <option key={tone} value={tone}>{SPEECH_TONE_LABELS[tone]} 고정</option>)}
                </select>
              </label>
              <button type="button" className={BTN} data-testid="simulate-contradiction-btn" onClick={handleInjectContradictionDemo}>모순 예시 시험</button>
              <button type="button" className={BTN} data-testid="reset-preset-btn" onClick={handleResetCurrentArc}>프리셋 복원</button>
            </div>
          </div>

          {statusNotice ? <p role="status" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2">{statusNotice}</p> : null}

          <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-fg">{activeArc.characterName} · {activeArc.roleSummary}</h3>
                <p className="text-xs text-fg-3 tabular-nums">
                  조회 시점: {interpolated.episode}화 ({interpolated.ageYears}세 · 경과 +{interpolated.elapsedMonths}개월 · {interpolated.interpolationMode === "exact" ? "기록 기준점" : "자동 보간"})
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" className={BTN} aria-label="이전 회차" onClick={() => setSelectedEpisode((prev) => Math.max(1, prev - 1))}>-1화</button>
                <button type="button" className={BTN} aria-label="다음 회차" onClick={() => setSelectedEpisode((prev) => Math.min(maxEpisode, prev + 1))}>+1화</button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {activeArc.snapshots.map((snap) => (
                <button key={snap.id} type="button" data-testid={`episode-pill-${snap.episode}`} onClick={() => setSelectedEpisode(snap.episode)} className={selectedEpisode === snap.episode ? BTN_ACCENT : BTN}>
                  <span className="tabular-nums">{snap.episode}화</span>
                </button>
              ))}
              <label className="flex flex-1 items-center gap-2 text-xs text-fg-2">
                <span className="shrink-0">회차 보간</span>
                <input type="range" aria-label="회차 타임라인 보간 슬라이더" data-testid="episode-interpolation-slider" min={1} max={maxEpisode} value={selectedEpisode} onChange={(event) => setSelectedEpisode(Number(event.currentTarget.value))} className="min-h-11 w-full accent-accent" />
              </label>
            </div>

            <div className="grid gap-2 sm:grid-cols-2" data-testid="psychology-bars">
              {PSYCHOLOGY_AXES.map((axis) => {
                const value = interpolated.psychology[axis];
                return (
                  <div key={axis} className="flex flex-col gap-1 rounded-md border border-line bg-panel p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-fg-2">{PSYCHOLOGY_AXIS_LABELS[axis]}</span>
                      <strong className="tabular-nums text-fg" data-testid={`psych-${axis}`}>{value}</strong>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
                      <div className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${value}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-2 rounded-md border border-line bg-panel p-2.5 text-xs sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-fg">누적 흉터 · 외형</span>
                <p className="text-fg-2" data-testid="interpolated-scars">흉터: {interpolated.activeScars.length > 0 ? interpolated.activeScars.join(", ") : "없음"}</p>
                <p className="text-fg-3">헤어: {interpolated.hair}</p>
                <p className="text-fg-3">복장: {interpolated.outfit}</p>
                <p className="text-fg-3">소품: {interpolated.props.length > 0 ? interpolated.props.join(", ") : "없음"}</p>
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-fg">말투 가이드 · {interpolated.speechToneLabelKo}</span>
                <p className="leading-relaxed text-fg-2">{interpolated.speechGuideKo}</p>
                {interpolated.nextMilestoneEpisode ? (
                  <p className="text-fg-3 tabular-nums">다음 변화점({interpolated.nextMilestoneEpisode}화): {interpolated.nextMilestonePreviewKo}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">
                시간축 일관성 판정 · <span data-testid="timeline-consistency-score" className="tabular-nums text-accent">{consistencyReport.consistencyScore}점</span>
              </h3>
              <div className="flex flex-wrap gap-1.5 text-[0.7rem] tabular-nums">
                <span className="rounded-full border border-good/40 bg-good-soft px-2 py-0.5 text-good">의도된 성장 {consistencyReport.intentionalGrowthCount}건</span>
                <span data-testid="contradiction-count-badge" className={consistencyReport.contradictionCount > 0 ? "rounded-full border border-bad/40 bg-bad-soft px-2 py-0.5 text-bad" : "rounded-full border border-line bg-panel px-2 py-0.5 text-fg-3"}>
                  모순 경고 {consistencyReport.contradictionCount}건
                </span>
              </div>
            </div>

            {consistencyReport.findings.length > 0 ? (
              <ul className="flex flex-col gap-2" data-testid="contradiction-findings-list">
                {consistencyReport.findings.map((finding) => (
                  <li key={finding.id} data-testid={`finding-${finding.code}`} className="flex flex-col gap-2 rounded-lg border border-bad/40 bg-bad-soft p-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-bad">{finding.titleKo}</strong>
                      <span className="tabular-nums text-fg-3">{finding.fromEpisode}화 → {finding.episode}화</span>
                    </div>
                    <p className="text-fg-2">{finding.detailKo}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-fg-3">{finding.suggestedFix.summaryKo}</span>
                      <button
                        type="button"
                        className={BTN_ACCENT}
                        data-testid={`apply-fix-${finding.code}`}
                        onClick={() => updateActiveArc(applyTimelineSuggestedFix(activeArc, finding.suggestedFix), `'${finding.suggestedFix.buttonLabelKo}' 보정을 적용했습니다.`)}
                      >
                        {finding.suggestedFix.buttonLabelKo}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-good" data-testid="timeline-consistent-empty">
                설정 모순이 없습니다. 모든 외형·심리 변화가 사건 근거와 맞물려 이어집니다.
              </p>
            )}

            <ul className="flex flex-col gap-1.5" data-testid="transition-verdict-list">
              {consistencyReport.transitions.map((tr) => (
                <li key={`${tr.fromEpisode}-${tr.toEpisode}`} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-line bg-panel p-2 text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold tabular-nums text-fg">{tr.fromEpisode}화 → {tr.toEpisode}화</span>
                    <p className="text-fg-2">{tr.summaryKo}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${VERDICT_META[tr.verdict].badgeClass}`}>
                    {VERDICT_META[tr.verdict].labelKo}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {activeTab === "inspirer" ? (
        <div id={inspirerPanelId} role="tabpanel" aria-labelledby={inspirerTabId} data-testid="panel-cliche-inspirer" className="flex flex-col gap-3">
          <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">스토리 초안 입력</h3>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_STORY_PITCH_SAMPLES.map((sample) => (
                  <button key={sample.id} type="button" className={BTN} data-testid={`story-sample-${sample.id}`} onClick={() => handleApplySample(sample.input)}>
                    {sample.labelKo}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1 text-xs text-fg-2">
              <span>로그라인</span>
              <textarea
                rows={2}
                data-testid="pitch-logline-input"
                value={pitch.logline}
                onChange={(event) => {
                  const nextLogline = event.currentTarget.value;
                  setPitch((prev) => ({ ...prev, logline: nextLogline }));
                }}
                placeholder="핵심 전제와 주인공 목표를 1~2문장으로 적어 주세요."
                className="w-full rounded-lg border border-line bg-field p-2.5 text-xs text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-fg-2">
                <span>장르</span>
                <select
                  data-testid="pitch-genre-select"
                  value={pitch.genre}
                  onChange={(event) => {
                    const nextGenre = event.currentTarget.value as StoryGenreKey;
                    setPitch((prev) => ({ ...prev, genre: nextGenre }));
                  }}
                  className={INPUT_CLASS}
                >
                  {GENRE_OPTIONS.map((key) => <option key={key} value={key}>{STORY_GENRE_LABELS[key]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-fg-2">
                <span>핵심 키워드 (쉼표 구분)</span>
                <input type="text" data-testid="pitch-keywords-input" value={keywordsDraft} onChange={(event) => handleKeywordsChange(event.currentTarget.value)} placeholder="회귀, 던전, 상태창" className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-fg-2">
                <span>주인공 성향</span>
                <input
                  type="text"
                  data-testid="pitch-trait-input"
                  value={pitch.protagonistTrait}
                  onChange={(event) => {
                    const nextTrait = event.currentTarget.value;
                    setPitch((prev) => ({ ...prev, protagonistTrait: nextTrait }));
                  }}
                  placeholder="냉철한 생존형 성장 주인공"
                  className={INPUT_CLASS}
                />
              </label>
            </div>
          </div>

          <div className="grid gap-2.5 rounded-lg border border-line bg-card p-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-fg">유사 클리셰 진단 Top 3</h3>
                <span data-testid="cliche-risk-badge" className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${RISK_BADGE_CLASS[diagnosis.riskLevel]}`}>
                  {diagnosis.riskLabelKo}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5" data-testid="cliche-top-matches">
                {diagnosis.topMatches.map((match) => (
                  <li key={match.patternId} className="flex flex-col gap-1 rounded-md border border-line bg-panel p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <strong className="text-fg">{match.nameKo}</strong>
                      <span className="font-semibold tabular-nums text-accent">유사도 {match.similarityPercent}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
                      <div className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none" style={{ width: `${match.similarityPercent}%` }} />
                    </div>
                    <p className="text-fg-3">{match.typicalBeatKo}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2 rounded-md border border-line bg-panel p-2.5 text-xs">
              <h3 className="font-bold text-fg">유사 작화 무드 프로파일</h3>
              <p className="text-fg-2">{diagnosis.detectedVisualMood.signatureLookKo}</p>
              <dl className="flex flex-col gap-1 text-fg-3">
                {visualMoodRows.map((row) => (
                  <div key={row.label} className="flex justify-between gap-2">
                    <dt className="font-semibold text-fg-2">{row.label}</dt>
                    <dd className="text-right tabular-nums">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="grid gap-2.5 lg:grid-cols-3" data-testid="twist-directions-grid">
            {diagnosis.twistDirections.map((twist) => (
              <article key={twist.kind} data-testid={`twist-card-${twist.kind}`} className="flex flex-col gap-2 rounded-lg border border-line bg-card p-3 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[0.68rem] font-semibold text-accent">{twist.badgeKo}</span>
                  <span className="text-[0.68rem] text-fg-3">{twist.orthogonalAxisKo}</span>
                </div>
                <h4 className="font-bold text-fg">{twist.titleKo}</h4>
                <p className="leading-relaxed text-fg-2">{twist.summaryKo}</p>
                <div className="rounded-md border border-line bg-panel p-2">
                  <p className="font-semibold text-fg">{twist.primaryProposalLabelKo}</p>
                  <p className="mt-0.5 leading-relaxed text-fg-2">{twist.primaryProposalKo}</p>
                </div>
                <div className="rounded-md border border-line bg-panel p-2">
                  <p className="font-semibold text-fg">{twist.secondaryProposalLabelKo}</p>
                  <p className="mt-0.5 leading-relaxed text-fg-2">{twist.secondaryProposalKo}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3 text-xs" data-testid="inspiration-spark-box">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-fg">
                  4축 무작위 영감 스파크 · <span className="tabular-nums text-fg-3" data-testid="spark-seed-label">시드 #{spark.seed}</span>
                </h3>
                <p className="text-fg-3">배경 × 갈등 × 시각장치 × 감정곡선 조합으로 막힌 기획을 뚫습니다.</p>
              </div>
              <button type="button" className={BTN_ACCENT} data-testid="reroll-spark-btn" onClick={() => setSparkSeed((prev) => prev + 17)}>새 영감 스파크 조합</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {sparkCards.map((card) => (
                <div key={card.key} className="rounded-md border border-line bg-panel p-2">
                  <span className="text-[0.68rem] font-semibold text-fg-3">{card.tag}</span>
                  <p className="mt-0.5 font-semibold text-fg">{card.title}</p>
                  <p className="mt-0.5 text-fg-3">{card.note}</p>
                </div>
              ))}
            </div>
            <p className="rounded-md border border-line bg-panel p-2.5 leading-relaxed text-fg" data-testid="spark-combined-prompt">{spark.combinedPromptKo}</p>
            <p className="text-fg-3">{spark.firstCutVisualKo}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
