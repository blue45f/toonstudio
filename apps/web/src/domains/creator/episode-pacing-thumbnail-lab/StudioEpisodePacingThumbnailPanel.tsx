/**
 * Wave 44F — 독자 이탈 휴리스틱 · 대사 벽 감지 · 썸네일 A/B 주목도 스튜디오 패널.
 *
 * - 2탭 구성: (1) 초반 3컷·대사 벽 진단 (2) 썸네일 A/B 안전영역 비교
 * - Calm Atelier 시맨틱 토큰 전용(원시 색 · 광범위 트랜지션 · 기본 빈 객체 props · 브라우저 스토리지 · BigInt 리터럴 미사용)
 * - 모든 점수는 규칙 기반 휴리스틱 추정(`규칙 기반 추정` 배지 명시)이며 Props 없이 단독 렌더링 가능
 */

import {
  Activity, AlertTriangle, Award, CheckCircle2, Copy, Crop, Eye, EyeOff,
  Layers, MessageSquareWarning, Plus, RotateCcw, Scissors, SlidersHorizontal, Trash2,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import {
  BALLOON_MAX_CHARS, CUT_BALLOON_WARNING_MIN, DEFAULT_THUMBNAIL_CANDIDATE_A, DEFAULT_THUMBNAIL_CANDIDATE_B,
  EPISODE_HOOK_PRESETS, THUMBNAIL_BADGE_KINDS, THUMBNAIL_PLATFORM_SPECS,
  analyzeEpisodeHookAndDensity, applySplitSuggestionToCuts, buildLabDiagnosticReportMarkdown, compareThumbnailCandidates,
  getEpisodeHookPreset, getThumbnailTonePreset,
  type CutActionShift, type CutEmotionState, type DialogueSplitSuggestion, type EndingHookKind,
  type EpisodeCutInput, type EpisodeHookDensityAnalysis, type EpisodePresetId,
  type ThumbnailAbComparisonResult, type ThumbnailBadgeKind, type ThumbnailCandidateInput,
  type ThumbnailPlatformId, type ThumbnailTonePresetId, type WarningSeverity,
} from "./episode-pacing-thumbnail-engine";

import { CandidateControlCard } from "./ThumbnailControls";
import { OperationStatus } from "./OperationStatus";
import { MAX_EPISODE_CUTS, MAX_CUT_BALLOONS, MAX_BALLOON_TEXT, MAX_EPISODE_TEXT, uniqueEpisodeId } from "./episode-dialogue-contract";
import { useExampleNotification } from "./use-example-notification";
import { useClipboardOutput } from "./use-clipboard-output";

export type EpisodePacingThumbnailTabId = "pacing-hook" | "thumbnail-ab";

export interface StudioEpisodePacingThumbnailPanelProps {
  readonly initialTab?: EpisodePacingThumbnailTabId;
  readonly initialPreset?: EpisodePresetId;
  readonly initialPlatform?: ThumbnailPlatformId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPacingAnalysisChange?: (analysis: EpisodeHookDensityAnalysis) => void | Promise<void>;
  readonly onThumbnailComparisonChange?: (comparison: ThumbnailAbComparisonResult) => void | Promise<void>;
  readonly onCopyReport?: (markdown: string) => void | Promise<void>;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const EMOTION_OPTIONS: readonly { readonly id: CutEmotionState; readonly ko: string; readonly en: string }[] = [
  { id: "neutral", ko: "평온·중립", en: "Neutral" }, { id: "curious", ko: "호기심", en: "Curious" },
  { id: "tense", ko: "긴장", en: "Tense" }, { id: "shock", ko: "충격·반전", en: "Shock" },
  { id: "anger", ko: "분노", en: "Anger" }, { id: "warmth", ko: "설렘·온기", en: "Warmth" },
  { id: "sorrow", ko: "슬픔", en: "Sorrow" }, { id: "resolve", ko: "결의", en: "Resolve" },
];
const ACTION_OPTIONS: readonly { readonly id: CutActionShift; readonly ko: string; readonly en: string }[] = [
  { id: "none", ko: "정적(변화 없음)", en: "Static (None)" }, { id: "subtle", ko: "미세 움직임", en: "Subtle Shift" },
  { id: "clear", ko: "명확한 행동", en: "Clear Action" }, { id: "impact", ko: "강렬한 사건", en: "High Impact" },
];
const ENDING_HOOK_OPTIONS: readonly { readonly id: EndingHookKind; readonly ko: string; readonly en: string }[] = [
  { id: "none", ko: "없음(평탄 종료)", en: "None" }, { id: "question", ko: "미결 질문", en: "Unresolved Question" },
  { id: "reveal", ko: "정체·반전 공개", en: "Reveal Twist" }, { id: "threat", ko: "위기·위협 돌입", en: "Imminent Threat" },
  { id: "emotional-turn", ko: "감정 급전환", en: "Emotional Turn" },
];

const scoreTone = (score: number): string => (score >= 78 ? "text-good" : score >= 56 ? "text-warn" : "text-bad");
const severityTone = (severity: WarningSeverity): string =>
  severity === "critical" ? "border-bad bg-bad-soft text-bad" : severity === "warn" ? "border-warn bg-warning-soft text-warn" : "border-cool bg-info-soft text-cool";

function MetricCard(props: { readonly label: string; readonly value: string; readonly sub: string; readonly testId: string; readonly tone?: string }): ReactElement {
  const { label, value, sub, testId, tone = "text-fg" } = props;
  return (
    <div className="rounded-xl border border-line bg-raised px-3.5 py-2.5">
      <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{label}</div>
      <div data-testid={testId} className={`mt-0.5 text-base font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">{sub}</div>
    </div>
  );
}

function RetentionCurveSvg(props: { readonly analysis: EpisodeHookDensityAnalysis; readonly isEn: boolean }): ReactElement {
  const { analysis, isEn } = props;
  const width = 460; const height = 152; const padL = 36; const padR = 20; const padT = 16; const padB = 26;
  const innerW = width - padL - padR; const innerH = height - padT - padB;
  const count = analysis.cuts.length;
  const pts = analysis.cuts.map((cut, idx) => ({
    x: Math.round((count <= 1 ? padL + innerW * 0.5 : padL + (idx / (count - 1)) * innerW) * 10) / 10,
    y: Math.round((padT + (1 - cut.estimatedRetentionPct / 100) * innerH) * 10) / 10,
    cut,
  }));
  const openingZoneW = count <= 1 ? innerW : Math.min(innerW, (Math.min(2, count - 1) / Math.max(1, count - 1)) * innerW + 18);
  const lineStr = pts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      data-testid="pacing-retention-curve-svg"
      data-cut-count={count}
      data-data-source={analysis.dataSourceKind}
      viewBox={`0 0 ${width} ${height}`}
      className="h-40 w-full text-fg"
      role="img"
      aria-label={isEn ? "Heuristic cut-by-cut reader retention curve" : "컷별 규칙 기반 추정 잔존율 곡선"}
    >
      <rect x={padL - 4} y={padT} width={openingZoneW} height={innerH} rx="6" className="text-accent" fill="currentColor" fillOpacity={0.08} />
      {[25, 50, 75, 100].map((tick) => {
        const ty = padT + (1 - tick / 100) * innerH;
        return (
          <g key={tick} className="text-fg-3">
            <line x1={padL} y1={ty} x2={width - padR} y2={ty} stroke="currentColor" strokeOpacity={tick === 50 ? 0.32 : 0.16} strokeDasharray={tick === 50 ? "4 4" : undefined} strokeWidth="1" />
            <text x={padL - 6} y={ty + 3} textAnchor="end" fill="currentColor" fontSize="9">{`${tick}%`}</text>
          </g>
        );
      })}
      {pts.length >= 2 ? <polyline points={lineStr} className="text-accent" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {pts.map(({ x, y, cut }) => (
        <g key={cut.cutId}>
          <circle cx={x} cy={y} r={cut.hasDialogueWall ? 5.5 : 4} className={cut.hasDialogueWall ? "text-bad" : cut.isOpeningCut ? "text-accent" : "text-good"} fill="currentColor" />
          <text x={x} y={y - 8} textAnchor="middle" fill="currentColor" fontSize="9" fontWeight="600">{`${Math.round(cut.estimatedRetentionPct)}%`}</text>
          <text x={x} y={height - 7} textAnchor="middle" className="text-fg-3" fill="currentColor" fontSize="9">{isEn ? `C${cut.index + 1}` : `${cut.index + 1}컷`}</text>
        </g>
      ))}
    </svg>
  );
}

/** 독자 이탈 휴리스틱 · 대사 벽 감지 · 썸네일 A/B 주목도 스튜디오 패널. */
export function StudioEpisodePacingThumbnailPanel(props: StudioEpisodePacingThumbnailPanelProps): ReactElement {
  const {
    initialTab = "pacing-hook",
    initialPreset = "overloaded-opening",
    initialPlatform = "naver-list-202x120",
    locale = "ko",
    className,
    onPacingAnalysisChange,
    onThumbnailComparisonChange,
    onCopyReport,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activeTab, setActiveTab] = useState<EpisodePacingThumbnailTabId>(initialTab);
  const [presetId, setPresetId] = useState<EpisodePresetId>(initialPreset);
  const [cuts, setCuts] = useState<readonly EpisodeCutInput[]>(() => getEpisodeHookPreset(initialPreset).cuts);
  const [episodeTitle, setEpisodeTitle] = useState<string>(() => getEpisodeHookPreset(initialPreset).episodeTitle);

  const [focusedPlatform, setFocusedPlatform] = useState<ThumbnailPlatformId>(initialPlatform);
  const [activeBadges, setActiveBadges] = useState<readonly ThumbnailBadgeKind[]>(THUMBNAIL_BADGE_KINDS);
  const [showOverlays, setShowOverlays] = useState<boolean>(true);
  const [candidateA, setCandidateA] = useState<ThumbnailCandidateInput>(DEFAULT_THUMBNAIL_CANDIDATE_A);
  const [candidateB, setCandidateB] = useState<ThumbnailCandidateInput>(DEFAULT_THUMBNAIL_CANDIDATE_B);

  const [statusMessage, setStatusMessage] = useState<string>("");
  const [showReportPreview, setShowReportPreview] = useState<boolean>(false);

  const pacingAnalysis = useMemo<EpisodeHookDensityAnalysis>(
    () => analyzeEpisodeHookAndDensity({ episodeTitle, cuts }),
    [cuts, episodeTitle],
  );
  const thumbComparison = useMemo<ThumbnailAbComparisonResult>(
    () => compareThumbnailCandidates({ candidateA, candidateB, activeBadges }),
    [activeBadges, candidateA, candidateB],
  );
  const reportMarkdown = useMemo<string>(
    () => buildLabDiagnosticReportMarkdown(pacingAnalysis, thumbComparison, locale),
    [locale, pacingAnalysis, thumbComparison],
  );

  const pacingNotification = useExampleNotification(onPacingAnalysisChange);
  const thumbnailNotification = useExampleNotification(onThumbnailComparisonChange);
  const reportNotification = useExampleNotification(onCopyReport);
  const clipboard = useClipboardOutput();
  const channels = [pacingNotification, thumbnailNotification, reportNotification, clipboard];
  const busy = channels.some((channel) => channel.status === "pending");
  const lastPacing = useRef<EpisodeHookDensityAnalysis | null>(null);
  const lastThumbnail = useRef<ThumbnailAbComparisonResult | null>(null);
  const { notify: notifyPacing } = pacingNotification;
  const { notify: notifyThumbnail } = thumbnailNotification;
  useEffect(() => { if (lastPacing.current !== pacingAnalysis) { lastPacing.current = pacingAnalysis; notifyPacing(pacingAnalysis); } }, [pacingAnalysis, notifyPacing]);
  useEffect(() => { if (lastThumbnail.current !== thumbComparison) { lastThumbnail.current = thumbComparison; notifyThumbnail(thumbComparison); } }, [thumbComparison, notifyThumbnail]);

  const focusedRow = thumbComparison.platforms.find((p) => p.platform.id === focusedPlatform) ?? thumbComparison.platforms[0];

  const handleLoadPreset = (nextId: EpisodePresetId): void => {
    const preset = getEpisodeHookPreset(nextId);
    setPresetId(preset.id); setCuts(preset.cuts); setEpisodeTitle(preset.episodeTitle);
    setStatusMessage(pick(`'${preset.labelKo}' 프리셋을 불러왔습니다.`, `Loaded '${preset.labelEn}' preset.`));
  };

  const handleUpdateCut = (cutIndex: number, patch: Partial<EpisodeCutInput>): void => {
    setCuts((prev) => prev.map((cut, idx) => (idx === cutIndex ? { ...cut, ...patch } : cut)));
  };

  const totalText = cuts.reduce((sum, cut) => sum + cut.balloons.reduce((length, balloon) => length + balloon.text.length, 0), 0);
  const handleUpdateBalloonText = (cutIndex: number, balloonId: string, text: string): void => {
    const original = cuts[cutIndex]?.balloons.find((balloon) => balloon.id === balloonId);
    if (!original) return;
    if (text.length > MAX_BALLOON_TEXT || totalText - original.text.length + text.length > MAX_EPISODE_TEXT) { setStatusMessage(pick("대사 입력 상한을 넘었습니다. 기존 원문은 유지됩니다.", "Dialogue input exceeds the limit. The existing text is preserved.")); return; }
    setCuts((prev) => prev.map((cut, idx) => (idx !== cutIndex ? cut : {
      ...cut, balloons: cut.balloons.map((b) => (b.id === balloonId ? { ...b, text } : b)),
    })));
  };

  const handleAddBalloon = (cutIndex: number): void => {
    const text = pick("새 대사를 입력하세요.", "New dialogue line.");
    if (totalText + text.length > MAX_EPISODE_TEXT) { setStatusMessage(pick("회차 대사 상한에 도달했습니다.", "The episode dialogue limit has been reached.")); return; }
    setCuts((prev) => prev.map((cut, index) => {
      if (index !== cutIndex || cut.balloons.length >= MAX_CUT_BALLOONS) return cut;
      const id = uniqueEpisodeId("b-add", new Set(prev.flatMap((item) => item.balloons.map((balloon) => balloon.id))));
      return { ...cut, balloons: [...cut.balloons, { id, speaker: pick("인물", "Speaker"), kind: "speech", text }] };
    }));
  };

  const handleRemoveBalloon = (cutIndex: number, balloonId: string): void => {
    setCuts((prev) => prev.map((cut, idx) => (idx !== cutIndex ? cut : { ...cut, balloons: cut.balloons.filter((b) => b.id !== balloonId) })));
  };

  const handleAddCut = (): void => {
    const text = pick("잠깐, 이 흔적은 뭐지?", "Wait, what is this trace?");
    if (cuts.length >= MAX_EPISODE_CUTS || totalText + text.length > MAX_EPISODE_TEXT) { setStatusMessage(pick("회차 예제 상한에 도달했습니다.", "The episode example limit has been reached.")); return; }
    setCuts((prev) => {
      if (prev.length >= MAX_EPISODE_CUTS) return prev;
      const id = uniqueEpisodeId("cut-add", new Set(prev.map((cut) => cut.id)));
      return [...prev, { id, labelKo: `${prev.length + 1}컷 · 추가 컷`, labelEn: `Cut ${prev.length + 1} · Added`, role: "reaction", emotion: "tense", actionShift: "clear", tensionLevel: 68, endingHookKind: "question", balloons: [{ id: `${id}-b`, speaker: pick("주인공", "Lead"), kind: "speech", text }] }];
    });
    setStatusMessage(pick("메모리 예제 끝에 새 컷을 추가했습니다.", "Appended a cut to the in-memory example."));
  };

  const handleRemoveCut = (cutIndex: number): void => {
    if (cuts.length <= 1) return;
    setCuts((prev) => prev.filter((_, idx) => idx !== cutIndex));
    setStatusMessage(pick(`${cutIndex + 1}번 컷을 제거했습니다.`, `Removed cut ${cutIndex + 1}.`));
  };

  const handleApplySplit = (suggestion: DialogueSplitSuggestion): void => {
    try {
      const next = applySplitSuggestionToCuts(cuts, suggestion);
      setCuts(next);
      setStatusMessage(next === cuts ? pick("원문이 바뀌어 오래된 분할 제안을 적용하지 않았습니다.", "The source changed; the stale split was not applied.") : pick("분할 제안 초안을 메모리 예제에 적용했습니다. 실제 원고는 바꾸지 않습니다.", "Applied a split draft to the in-memory example. Actual artwork is unchanged."));
    } catch {
      setStatusMessage(pick("예제 상한으로 분할할 수 없습니다. 원문은 유지됩니다.", "The split exceeds example limits. The original text is preserved."));
    }
  };

  const handleToggleBadge = (badge: ThumbnailBadgeKind): void => {
    setActiveBadges((prev) => (prev.includes(badge) ? prev.filter((item) => item !== badge) : [...prev, badge]));
  };

  const handleUpdateCandidateTone = (id: "A" | "B", toneId: ThumbnailTonePresetId): void => {
    const tone = getThumbnailTonePreset(toneId);
    const patch: Partial<ThumbnailCandidateInput> = {
      tonePresetId: tone.id, backdropOklch: tone.backdropOklch, titleOklch: tone.titleOklch, subjectOklch: tone.subjectOklch,
    };
    if (id === "A") setCandidateA((prev) => ({ ...prev, ...patch }));
    else setCandidateB((prev) => ({ ...prev, ...patch }));
  };

  const handleResetThumbnails = (): void => {
    setCandidateA(DEFAULT_THUMBNAIL_CANDIDATE_A); setCandidateB(DEFAULT_THUMBNAIL_CANDIDATE_B);
    setActiveBadges(THUMBNAIL_BADGE_KINDS); setShowOverlays(true);
    setStatusMessage(pick("썸네일 A/B 후보를 기본 비교안으로 복원했습니다.", "Restored default A/B thumbnail candidates."));
  };

  const handleCopyReport = (): void => {
    if (channels.some((channel) => channel.isPending())) return;
    reportNotification.notify(reportMarkdown);
    clipboard.notify(reportMarkdown);
    setShowReportPreview(true);
  };

  const pacingTabId = `${uid}-tab-pacing`;
  const thumbTabId = `${uid}-tab-thumb`;
  const pacingPanelId = `${uid}-panel-pacing`;
  const thumbPanelId = `${uid}-panel-thumb`;

  return (
    <section
      data-testid="studio-episode-pacing-thumbnail-panel"
      aria-label={pick("독자 이탈 휴리스틱 · 대사 벽 · 썸네일 A/B 스튜디오 랩", "Episode Pacing & Thumbnail A/B Studio Lab")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${className ?? ""}`}
    >
      <OperationStatus channel="analysis" {...pacingNotification} pending={busy} isEn={isEn} />
      <OperationStatus channel="thumbnail" {...thumbnailNotification} pending={busy} isEn={isEn} />
      <OperationStatus channel="report" {...reportNotification} pending={busy} isEn={isEn} />
      <OperationStatus channel="clipboard" {...clipboard} pending={busy} isEn={isEn} />
      <fieldset disabled={busy} className="contents">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("이탈 휴리스틱 · 썸네일 A/B 랩", "Pacing & Thumbnail A/B Lab")}
            </span>
            <span data-testid="lab-heuristic-badge" className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2 [word-break:keep-all]">
              <Activity className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("규칙 기반 추정", "Rule-Based Heuristic")}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("초반 3컷 흡인력 · 대사 벽 감지 · 썸네일 A/B 안전영역 스튜디오", "Opening 3-Cut Hook, Dialogue Wall & Thumbnail A/B Lab")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {isEn ? pacingAnalysis.heuristicDisclaimerEn : pacingAnalysis.heuristicDisclaimerKo} {pick("CPU·합성 예제이며 실제 독자 분석·이미지 인식·원고 반영·저장·저작권 확인은 하지 않습니다. 닫으면 입력이 사라집니다.", "CPU and synthetic example only: no actual reader telemetry, image recognition, artwork apply, storage or rights verification. Inputs disappear when closed.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="lab-copy-report-btn" onClick={handleCopyReport} className={BTN_SOLID}>
            <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("리포트 복사", "Copy Report")}
          </button>
          <button type="button" data-testid="lab-toggle-report-btn" aria-pressed={showReportPreview} onClick={() => setShowReportPreview((v) => !v)} className={BTN_OUTLINE}>
            {showReportPreview ? pick("리포트 접기", "Hide Report") : pick("리포트 보기", "View Report")}
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div data-testid="lab-status-banner" role="status" aria-live="polite" className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]">
          {statusMessage}
        </div>
      ) : null}

      <div role="tablist" aria-label={pick("진단 작업 모드", "Diagnostic workspace tabs")} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button id={pacingTabId} type="button" role="tab" data-testid="lab-tab-pacing-hook" aria-selected={activeTab === "pacing-hook"} aria-controls={pacingPanelId} onClick={() => setActiveTab("pacing-hook")} className={activeTab === "pacing-hook" ? BTN_ACTIVE : BTN_OUTLINE}>
          <MessageSquareWarning className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{pick("초반 3컷·대사 벽 진단", "Opening 3-Cut & Dialogue Wall")}</span>
        </button>
        <button id={thumbTabId} type="button" role="tab" data-testid="lab-tab-thumbnail-ab" aria-selected={activeTab === "thumbnail-ab"} aria-controls={thumbPanelId} onClick={() => setActiveTab("thumbnail-ab")} className={activeTab === "thumbnail-ab" ? BTN_ACTIVE : BTN_OUTLINE}>
          <Crop className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{pick("썸네일 A/B 안전영역 비교", "Thumbnail A/B Safe-Zone Compare")}</span>
        </button>
      </div>

      {activeTab === "pacing-hook" ? (
        <div id={pacingPanelId} role="tabpanel" aria-labelledby={pacingTabId} data-testid="lab-panel-pacing-hook" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas p-3">
            <div className="flex flex-wrap items-center gap-2">
              {EPISODE_HOOK_PRESETS.map((preset) => (
                <button key={preset.id} type="button" data-testid={`pacing-preset-${preset.id}`} aria-pressed={presetId === preset.id} onClick={() => handleLoadPreset(preset.id)} className={presetId === preset.id ? BTN_ACTIVE : BTN_OUTLINE}>
                  {isEn ? preset.labelEn : preset.labelKo}
                </button>
              ))}
            </div>
            <button type="button" data-testid="pacing-add-cut-btn" disabled={cuts.length >= MAX_EPISODE_CUTS} onClick={handleAddCut} className={BTN_OUTLINE}>
              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("컷 추가", "Add Cut")}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard testId="pacing-overall-score" label={pick("종합 흡인력 (추정)", "Overall Pacing (Est.)")} value={`${pacingAnalysis.summary.overallPacingScore} / 100`} sub={pick(`이탈 위험 ${pacingAnalysis.summary.dropOffRiskScore} · ${pacingAnalysis.summary.dropOffRiskLevel}`, `Drop-off ${pacingAnalysis.summary.dropOffRiskScore} · ${pacingAnalysis.summary.dropOffRiskLevel}`)} tone={scoreTone(pacingAnalysis.summary.overallPacingScore)} />
            <MetricCard testId="pacing-opening-score" label={pick("초반 3컷 훅 점수", "Opening 3-Cut Hook")} value={`${pacingAnalysis.summary.openingHookScore} / 100`} sub={pick(`감정 ${pacingAnalysis.openingThreeCuts.uniqueEmotions.length}종 · 행동 ${pacingAnalysis.openingThreeCuts.actionBeatCount}컷`, `${pacingAnalysis.openingThreeCuts.uniqueEmotions.length} emotions · ${pacingAnalysis.openingThreeCuts.actionBeatCount} action beats`)} tone={scoreTone(pacingAnalysis.summary.openingHookScore)} />
            <MetricCard testId="pacing-wall-count" label={pick("대사 벽 경고 컷", "Dialogue Wall Cuts")} value={pick(`${pacingAnalysis.summary.dialogueWallCutCount}건`, `${pacingAnalysis.summary.dialogueWallCutCount}`)} sub={pick(`42자↑ ${pacingAnalysis.summary.overlongBalloonCount}개 · 4개↑ ${pacingAnalysis.summary.overcrowdedCutCount}컷`, `>42ch: ${pacingAnalysis.summary.overlongBalloonCount} · >=4: ${pacingAnalysis.summary.overcrowdedCutCount}`)} tone={pacingAnalysis.summary.dialogueWallCutCount === 0 ? "text-good" : "text-bad"} />
            <MetricCard testId="pacing-cliffhanger-score" label={pick("클리프행어 긴장도", "Cliffhanger Tension")} value={`${pacingAnalysis.summary.cliffhangerTensionScore} / 100`} sub={pick(`판정: ${pacingAnalysis.cliffhanger.verdict} · 말미 ${pacingAnalysis.cliffhanger.closingTension}점`, `Verdict: ${pacingAnalysis.cliffhanger.verdict} · End ${pacingAnalysis.cliffhanger.closingTension}`)} tone={scoreTone(pacingAnalysis.summary.cliffhangerTensionScore)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="space-y-2 rounded-xl border border-line bg-canvas p-3.5">
              <div className="flex items-center justify-between text-xs font-bold text-fg">
                <span>{pick("컷별 규칙 기반 잔존율 곡선 (추정)", "Heuristic Cut Retention Curve")}</span>
                <span className="text-[11px] font-medium text-fg-3 tabular-nums">{pick(`말미 추정 잔존 ${pacingAnalysis.summary.estimatedCompletionPct}%`, `Est. end ${pacingAnalysis.summary.estimatedCompletionPct}%`)}</span>
              </div>
              <RetentionCurveSvg analysis={pacingAnalysis} isEn={isEn} />
            </div>

            <div data-testid="pacing-warnings-box" className="space-y-2 rounded-xl border border-line bg-canvas p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                {pacingAnalysis.warnings.length === 0 ? <CheckCircle2 className="h-4 w-4 text-good" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 text-warn" aria-hidden="true" />}
                <span className="[word-break:keep-all]">{pacingAnalysis.warnings.length === 0 ? pick("경고 0건 · 초반 흡인력 및 대사 밀도 안정", "0 Warnings · Healthy Pacing") : pick(`감지된 경고 ${pacingAnalysis.warnings.length}건`, `${pacingAnalysis.warnings.length} Heuristic Warnings`)}</span>
              </div>
              {pacingAnalysis.warnings.length > 0 ? (
                <ul className="space-y-1.5">
                  {pacingAnalysis.warnings.map((w) => (
                    <li key={w.code} data-testid={`pacing-warning-${w.code}`} className={`rounded-lg border px-3 py-2 text-xs [word-break:keep-all] ${severityTone(w.severity)}`}>
                      <div className="font-bold">{isEn ? w.titleEn : w.titleKo}</div>
                      <div className="mt-0.5 opacity-90">{isEn ? w.prescriptionEn : w.prescriptionKo}</div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {pacingAnalysis.splitSuggestions.length > 0 ? (
            <div data-testid="pacing-split-suggestions" className="space-y-2 rounded-xl border border-warn bg-warning-soft p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-warn [word-break:keep-all]">
                <Scissors className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{pick(`대사 벽 자동 분할 제안 (${pacingAnalysis.splitSuggestions.length}건)`, `Dialogue Wall Split Proposals (${pacingAnalysis.splitSuggestions.length})`)}</span>
              </div>
              <div className="space-y-2">
                {pacingAnalysis.splitSuggestions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-card p-3">
                    <div className="space-y-1 text-xs text-fg [word-break:keep-all]">
                      <div className="font-semibold">{isEn ? s.adviceEn : s.adviceKo}</div>
                      {s.suggestedChunks.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {s.suggestedChunks.map((chunk, cIdx) => (
                            <span key={`${s.id}-${cIdx}`} className="rounded border border-line bg-raised px-2 py-0.5 text-[11px] text-fg-2 tabular-nums">
                              {`${cIdx + 1}) ${chunk} (${chunk.length}${isEn ? "ch" : "자"})`}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button type="button" data-testid={`apply-split-${s.id}`} onClick={() => handleApplySplit(s)} className={BTN_SOLID}>
                      <Scissors className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {pick("분할 제안 적용", "Apply Split")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
              <span>{pick("컷별 대사 · 감정 · 행동 · 긴장도 실시간 편집", "Interactive Cut & Dialogue Editor")}</span>
            </div>
            {pacingAnalysis.cuts.map((cut) => {
              const emotionId = `${uid}-emo-${cut.cutId}`;
              const actionId = `${uid}-act-${cut.cutId}`;
              const tensionId = `${uid}-ten-${cut.cutId}`;
              const hookId = `${uid}-hook-${cut.cutId}`;
              const rawCut = cuts[cut.index];
              return (
                <div key={cut.cutId} data-testid={`pacing-cut-card-${cut.index}`} className={`space-y-3 rounded-xl border p-3.5 ${cut.hasDialogueWall ? "border-bad bg-bad-soft" : "border-line bg-canvas"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-raised px-2 py-0.5 text-xs font-bold tabular-nums">{isEn ? `Cut ${cut.index + 1}` : `${cut.index + 1}컷`}</span>
                      <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? cut.labelEn : cut.labelKo}</span>
                      {cut.isOpeningCut ? <span className="rounded border border-accent bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">{pick("초반 3컷", "Opening 3")}</span> : null}
                      {cut.isClosingCut ? <span className="rounded border border-cool bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-cool">{pick("말미 컷", "Ending Cut")}</span> : null}
                      {cut.hasDialogueWall ? <span data-testid={`cut-wall-badge-${cut.index}`} className="rounded border border-bad bg-card px-1.5 py-0.5 text-[10px] font-bold text-bad">{pick("대사 벽 경고", "Dialogue Wall")}</span> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-semibold tabular-nums ${cut.balloonCount >= CUT_BALLOON_WARNING_MIN ? "text-bad" : "text-fg-2"}`}>
                        {pick(`말풍선 ${cut.balloonCount}개 · ${cut.totalCharCount}자`, `${cut.balloonCount} bubbles · ${cut.totalCharCount}ch`)}
                      </span>
                      <button type="button" data-testid={`cut-add-balloon-${cut.index}`} disabled={cut.balloonCount >= MAX_CUT_BALLOONS} onClick={() => handleAddBalloon(cut.index)} className={BTN_OUTLINE}>
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />{pick("말풍선", "Bubble")}
                      </button>
                      <button type="button" data-testid={`cut-remove-${cut.index}`} disabled={cuts.length <= 1} aria-label={pick(`${cut.index + 1}컷 삭제`, `Delete cut ${cut.index + 1}`)} onClick={() => handleRemoveCut(cut.index)} className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-card text-fg-3 transition-colors motion-reduce:transition-none hover:border-bad hover:text-bad disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-3">
                    <div className="space-y-1">
                      <label htmlFor={emotionId} className="block text-[11px] font-medium text-fg-2">{pick("감정 상태", "Emotion")}</label>
                      <select id={emotionId} data-testid={`cut-emotion-${cut.index}`} value={cut.emotion} onChange={(e) => handleUpdateCut(cut.index, { emotion: e.target.value as CutEmotionState })} className={`min-h-11 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg ${FOCUS_RING}`}>
                        {EMOTION_OPTIONS.map((opt) => <option key={opt.id} value={opt.id}>{isEn ? opt.en : opt.ko}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={actionId} className="block text-[11px] font-medium text-fg-2">{pick("행동·사건 변화", "Action Shift")}</label>
                      <select id={actionId} data-testid={`cut-action-${cut.index}`} value={cut.actionShift} onChange={(e) => handleUpdateCut(cut.index, { actionShift: e.target.value as CutActionShift })} className={`min-h-11 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg ${FOCUS_RING}`}>
                        {ACTION_OPTIONS.map((opt) => <option key={opt.id} value={opt.id}>{isEn ? opt.en : opt.ko}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]"><label htmlFor={tensionId} className="font-medium text-fg-2">{pick("컷 긴장도", "Tension")}</label><span className="font-bold tabular-nums text-accent">{cut.tensionLevel}</span></div>
                      <input id={tensionId} data-testid={`cut-tension-${cut.index}`} type="range" min={0} max={100} step={2} value={cut.tensionLevel} onChange={(e) => handleUpdateCut(cut.index, { tensionLevel: Number(e.target.value) })} className={`mt-2 h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`} />
                    </div>
                  </div>

                  {cut.isClosingCut ? (
                    <div className="space-y-1">
                      <label htmlFor={hookId} className="block text-[11px] font-medium text-fg-2">{pick("말미 클리프행어 훅 유형", "Ending Cliffhanger Hook")}</label>
                      <select id={hookId} data-testid="closing-hook-select" value={rawCut?.endingHookKind ?? "none"} onChange={(e) => handleUpdateCut(cut.index, { endingHookKind: e.target.value as EndingHookKind, role: e.target.value === "none" ? "dialogue" : "cliffhanger" })} className={`min-h-11 w-full rounded-lg border border-line bg-card px-2.5 text-xs text-fg ${FOCUS_RING}`}>
                        {ENDING_HOOK_OPTIONS.map((opt) => <option key={opt.id} value={opt.id}>{isEn ? opt.en : opt.ko}</option>)}
                      </select>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {cut.balloons.map((balloon, bIdx) => {
                      const bInputId = `${uid}-b-${cut.cutId}-${balloon.id}`;
                      return (
                        <div key={balloon.id} className="rounded-lg border border-line bg-card p-2.5">
                          <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                            <label htmlFor={bInputId} className="font-semibold text-fg-2">{`${bIdx + 1}. ${balloon.speaker}`}</label>
                            <div className="flex items-center gap-2">
                              <span data-testid={`balloon-char-count-${cut.index}-${bIdx}`} className={`font-bold tabular-nums ${balloon.exceedsCharLimit ? "text-bad" : "text-fg-3"}`}>
                                {`${balloon.charCount} / ${BALLOON_MAX_CHARS}${isEn ? "ch" : "자"}`}
                              </span>
                              <button type="button" data-testid={`balloon-remove-${cut.index}-${bIdx}`} aria-label={pick(`${cut.index + 1}컷 ${bIdx + 1}번 말풍선 삭제`, `Remove balloon ${bIdx + 1}`)} onClick={() => handleRemoveBalloon(cut.index, balloon.id)} className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border border-line bg-canvas text-fg-3 transition-colors motion-reduce:transition-none hover:border-bad hover:text-bad ${FOCUS_RING}`}>
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                          <textarea id={bInputId} data-testid={`balloon-text-${cut.index}-${bIdx}`} rows={2} maxLength={MAX_BALLOON_TEXT} value={balloon.text} onChange={(e) => handleUpdateBalloonText(cut.index, balloon.id, e.target.value)} className={`w-full rounded-lg border bg-canvas px-2.5 py-2 text-xs text-fg [word-break:keep-all] ${balloon.exceedsCharLimit ? "border-bad" : "border-line"} ${FOCUS_RING}`} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div id={thumbPanelId} role="tabpanel" aria-labelledby={thumbTabId} data-testid="lab-panel-thumbnail-ab" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas p-3">
            <div className="flex flex-wrap items-center gap-2">
              {THUMBNAIL_PLATFORM_SPECS.map((spec) => (
                <button key={spec.id} type="button" data-testid={`thumb-platform-${spec.id}`} aria-pressed={focusedPlatform === spec.id} onClick={() => setFocusedPlatform(spec.id)} className={focusedPlatform === spec.id ? BTN_ACTIVE : BTN_OUTLINE}>
                  <span className="tabular-nums">{isEn ? spec.shortLabelEn : spec.shortLabelKo}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {THUMBNAIL_BADGE_KINDS.map((badge) => {
                const enabled = activeBadges.includes(badge);
                return (
                  <button key={badge} type="button" data-testid={`thumb-badge-toggle-${badge}`} aria-pressed={enabled} onClick={() => handleToggleBadge(badge)} className={enabled ? BTN_ACTIVE : BTN_OUTLINE}>
                    {`${badge} (${badge === "UP" ? pick("좌상단", "TL") : pick("우상단", "TR")})`}
                  </button>
                );
              })}
              <button type="button" data-testid="thumb-overlay-toggle" aria-pressed={showOverlays} onClick={() => setShowOverlays((v) => !v)} className={showOverlays ? BTN_ACTIVE : BTN_OUTLINE}>
                {showOverlays ? <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {pick("배지·안전영역", "Overlays")}
              </button>
              <button type="button" data-testid="thumb-reset-btn" onClick={handleResetThumbnails} className={BTN_OUTLINE}>
                <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {pick("초기화", "Reset")}
              </button>
            </div>
          </div>

          <div data-testid="thumb-winner-banner" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent bg-accent-soft px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-bold text-accent [word-break:keep-all]">
              <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{isEn ? thumbComparison.winnerSummaryEn : thumbComparison.winnerSummaryKo}</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold tabular-nums text-fg">
              <span data-testid="thumb-agg-score-A">{`A ${thumbComparison.aggregateScoreA}`}</span>
              <span className="text-fg-3">vs</span>
              <span data-testid="thumb-agg-score-B">{`B ${thumbComparison.aggregateScoreB}`}</span>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            {thumbComparison.platforms.map((row) => (
              <div key={row.platform.id} data-testid={`thumb-matrix-${row.platform.id}`} className={`rounded-xl border p-3 text-xs tabular-nums ${row.platform.id === focusedPlatform ? "border-accent bg-raised" : "border-line bg-canvas"}`}>
                <div className="flex items-center justify-between font-bold text-fg">
                  <span>{isEn ? row.platform.shortLabelEn : row.platform.shortLabelKo}</span>
                  <span className="text-accent">{row.winner === "tie" ? pick("동점", "Tie") : pick(`${row.winner} 우세`, `${row.winner} Wins`)}</span>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-fg-2">
                  <span>{`A: ${row.candidateA.totalScore} (${row.candidateA.scaledTitleFontPx}px)`}</span>
                  <span>{`B: ${row.candidateB.totalScore} (${row.candidateB.scaledTitleFontPx}px)`}</span>
                </div>
              </div>
            ))}
          </div>

          {focusedRow ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <CandidateControlCard
                candidate={candidateA} audit={focusedRow.candidateA} allPrescriptionsCount={thumbComparison.prescriptionsA.length}
                showOverlays={showOverlays} isWinner={thumbComparison.winner === "A"} isEn={isEn} uid={uid}
                onChange={(patch) => setCandidateA((prev) => ({ ...prev, ...patch }))}
                onSelectTone={(toneId) => handleUpdateCandidateTone("A", toneId)}
              />
              <CandidateControlCard
                candidate={candidateB} audit={focusedRow.candidateB} allPrescriptionsCount={thumbComparison.prescriptionsB.length}
                showOverlays={showOverlays} isWinner={thumbComparison.winner === "B"} isEn={isEn} uid={uid}
                onChange={(patch) => setCandidateB((prev) => ({ ...prev, ...patch }))}
                onSelectTone={(toneId) => handleUpdateCandidateTone("B", toneId)}
              />
            </div>
          ) : null}
        </div>
      )}

      {showReportPreview ? (
        <div className="space-y-1.5 rounded-xl border border-line bg-canvas p-3.5">
          <div className="text-xs font-bold text-fg [word-break:keep-all]">{pick("복사 리포트 미리보기 (Markdown)", "Diagnostic Report Preview (Markdown)")}</div>
          <pre data-testid="lab-report-preview" className="max-h-56 overflow-auto rounded-lg border border-line bg-raised p-3 font-mono text-[11px] leading-relaxed text-fg-2">
            {reportMarkdown}
          </pre>
        </div>
      ) : null}
      </fieldset>
    </section>
  );
}
