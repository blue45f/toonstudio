/**
 * 연재 이탈 위험 코치 · BGM/SFX 스크롤 큐시트 · OPFS 크래시 1획 복원 · 붉은펜 첨삭 카드 통합 패널 (Wave 25).
 * Calm Atelier 시맨틱 토큰 전용 · 460줄 이하 · 순수 메모리 상태 · 명시적 transition 속성 · 모든 props 선택형 · KO/EN.
 */

import { Activity, AlertTriangle, CheckCircle2, Code2, Download, GraduationCap, Music2, ShieldCheck, Volume2 } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_REDPEN_CRITIQUE_INPUT, buildDefaultCrashRecoveryScenario, buildRedpenCritiqueReplayCard,
  evaluateRedpenReplayAtTime, reconcileWalCrashRecovery,
  type RedpenCritiqueReplayCard, type WalChecksumAlgorithm, type WalCrashRecoveryResult,
} from "./crash-forensic-and-redpen-replay";
import {
  DEFAULT_BGM_TRACK_CUES, DEFAULT_FREE_ARC_EPISODES, DEFAULT_SFX_TRIGGER_CUES,
  analyzeEpisodeHookAndRetention, analyzeFreeArcRetention, evaluateScrollBgmTriggers, exportBgmCueSheet,
  type BgmCueSheetExportResult, type BgmCueSheetPlatform, type BgmTrackPhase, type WebtoonGenreProfile,
} from "./retention-coach-and-bgm-cue";

export type RetentionBgmAcademyTabId = "retention-coach" | "bgm-cuesheet" | "crash-redpen";

export interface StudioRetentionBgmAcademyPanelProps {
  readonly initialTab?: RetentionBgmAcademyTabId;
  readonly initialEpisodeNumber?: number;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onCueSheetExported?: (result: BgmCueSheetExportResult) => void;
  readonly onRecoveryExecuted?: (result: WalCrashRecoveryResult) => void;
  readonly onRedpenCardBuilt?: (card: RedpenCritiqueReplayCard) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const BTN_PILL = `min-h-11 cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_ACTIVE = "border-accent bg-accent-soft text-accent";
const BTN_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

const GENRE_OPTIONS: readonly { readonly id: WebtoonGenreProfile; readonly ko: string; readonly en: string }[] = [
  { id: "action-fantasy", ko: "액션·판타지", en: "Action / Fantasy" },
  { id: "thriller-mystery", ko: "스릴러·미스터리", en: "Thriller / Mystery" },
  { id: "romance-drama", ko: "로맨스·드라마", en: "Romance / Drama" },
  { id: "slice-of-life", ko: "일상·코미디", en: "Slice of Life" },
];
const SCROLL_BOOKMARKS: readonly { readonly scrollY: number; readonly ko: string; readonly en: string }[] = [
  { scrollY: 1135, ko: "천둥 컷", en: "Thunder Cut" },
  { scrollY: 4535, ko: "문 열림·크로스페이드", en: "Door & Crossfade" },
  { scrollY: 7585, ko: "옥상 발소리", en: "Rooftop Footsteps" },
  { scrollY: 9785, ko: "클리프행어 심박", en: "Cliffhanger Beat" },
];
const PLATFORM_OPTIONS: readonly { readonly id: BgmCueSheetPlatform; readonly label: string }[] = [
  { id: "toonstudio-v1", label: "ToonStudio v1" },
  { id: "naver-bgm-spec", label: "Naver BGM" },
  { id: "kakao-sound-spec", label: "Kakao Sound" },
];

function triggerDownload(filename: string, content: string, mimeType: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function riskBadgeClass(level: "low" | "moderate" | "high" | "critical"): string {
  if (level === "low") return "border-good bg-good-soft text-good";
  if (level === "moderate") return "border-line bg-warning-soft text-warn";
  return "border-bad bg-bad-soft text-bad";
}

function phaseLabel(phase: BgmTrackPhase, isKo: boolean): string {
  if (phase === "fade-in") return isKo ? "페이드인" : "Fade In";
  if (phase === "sustain") return isKo ? "유지" : "Sustain";
  if (phase === "fade-out") return isKo ? "페이드아웃" : "Fade Out";
  if (phase === "crossfading") return isKo ? "크로스페이드" : "Crossfading";
  return isKo ? "대기" : "Idle";
}

/** 1~5화 이탈 위험 코치 · BGM/SFX 스크롤 큐시트 · 크래시 1획 복원 · 붉은펜 첨삭 카드 패널. */
export function StudioRetentionBgmAcademyPanel({
  initialTab = "retention-coach", initialEpisodeNumber = 2, locale, className,
  onCueSheetExported, onRecoveryExecuted, onRedpenCardBuilt,
}: StudioRetentionBgmAcademyPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<RetentionBgmAcademyTabId>(initialTab);
  const [selectedEp, setSelectedEp] = useState<number>(initialEpisodeNumber);
  const [genreOverride, setGenreOverride] = useState<WebtoonGenreProfile | null>(null);
  const [notice, setNotice] = useState<string>("");

  const [scrollY, setScrollY] = useState<number>(4535);
  const [prevScrollY, setPrevScrollY] = useState<number>(4200);
  const [cuePlatform, setCuePlatform] = useState<BgmCueSheetPlatform>("toonstudio-v1");
  const [cuePreviewMode, setCuePreviewMode] = useState<"none" | "json" | "csv">("none");

  const [checksumAlg, setChecksumAlg] = useState<WalChecksumAlgorithm>("sha256");
  const [simulateCrashTail, setSimulateCrashTail] = useState<boolean>(true);
  const [showReceiptJson, setShowReceiptJson] = useState<boolean>(false);

  const [redpenTimeMs, setRedpenTimeMs] = useState<number>(6400);
  const [redpenPreviewMode, setRedpenPreviewMode] = useState<"none" | "html" | "json">("none");

  const freeArc = useMemo(() => analyzeFreeArcRetention(DEFAULT_FREE_ARC_EPISODES), []);
  const currentEpisodeInput = useMemo(() => {
    const found = DEFAULT_FREE_ARC_EPISODES.find((ep) => ep.episodeNumber === selectedEp) ?? DEFAULT_FREE_ARC_EPISODES[0];
    return genreOverride ? { ...found, genre: genreOverride } : found;
  }, [genreOverride, selectedEp]);
  const retentionReport = useMemo(() => analyzeEpisodeHookAndRetention(currentEpisodeInput), [currentEpisodeInput]);

  const bgmEvaluation = useMemo(
    () => evaluateScrollBgmTriggers({ scrollY, previousScrollY: prevScrollY, viewportHeightPx: 900, tracks: DEFAULT_BGM_TRACK_CUES, sfxCues: DEFAULT_SFX_TRIGGER_CUES }),
    [prevScrollY, scrollY],
  );
  const cueSheet = useMemo(
    () => exportBgmCueSheet({ workTitle: "빗속의 계약", episodeCode: "EP.03", canvasHeightPx: 11400, platform: cuePlatform, tracks: DEFAULT_BGM_TRACK_CUES, sfxCues: DEFAULT_SFX_TRIGGER_CUES }),
    [cuePlatform],
  );
  const recoveryResult = useMemo(
    () => reconcileWalCrashRecovery(buildDefaultCrashRecoveryScenario(checksumAlg, simulateCrashTail)),
    [checksumAlg, simulateCrashTail],
  );
  const redpenCard = useMemo(() => buildRedpenCritiqueReplayCard(DEFAULT_REDPEN_CRITIQUE_INPUT), []);
  const redpenFrame = useMemo(() => evaluateRedpenReplayAtTime(redpenCard, redpenTimeMs), [redpenCard, redpenTimeMs]);

  const handleScrollChange = (nextY: number): void => { setPrevScrollY(scrollY); setScrollY(nextY); };
  const handleExportCue = (format: "json" | "csv"): void => {
    triggerDownload(`${cueSheet.filenameBase}.${format}`, format === "json" ? cueSheet.json : cueSheet.csv, format === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8");
    setNotice(pick(`BGM·SFX 큐시트(${format.toUpperCase()})를 내려받았습니다.`, `Exported BGM/SFX cue sheet (${format.toUpperCase()}).`));
    onCueSheetExported?.(cueSheet);
  };
  const handleDownloadReceipt = (): void => {
    triggerDownload(`${recoveryResult.receipt.receiptId}.json`, recoveryResult.receiptJson, "application/json;charset=utf-8");
    setNotice(pick(`복구 영수증(${recoveryResult.receipt.lastRecoveredStrokeId ?? "-"}) 발급 완료`, `Issued recovery receipt (${recoveryResult.receipt.lastRecoveredStrokeId ?? "-"}).`));
    onRecoveryExecuted?.(recoveryResult);
  };
  const handleDownloadRedpen = (format: "html" | "json"): void => {
    triggerDownload(`${redpenCard.sessionId}-replay.${format}`, format === "html" ? redpenCard.htmlSnippet : redpenCard.cardJson, format === "html" ? "text/html;charset=utf-8" : "application/json;charset=utf-8");
    setNotice(pick(`붉은펜 첨삭 리플레이 카드(${format.toUpperCase()})를 패키징했습니다.`, `Packaged redpen replay card (${format.toUpperCase()}).`));
    onRedpenCardBuilt?.(redpenCard);
  };

  const tabs: readonly { readonly id: RetentionBgmAcademyTabId; readonly label: string }[] = [
    { id: "retention-coach", label: pick("1~5화 이탈 위험 코치", "EP.1-5 Retention Coach") },
    { id: "bgm-cuesheet", label: pick("BGM·SFX 스크롤 큐시트", "BGM · SFX Cue Sheet") },
    { id: "crash-redpen", label: pick("크래시 1획 복원 · 붉은펜 첨삭 카드", "Crash 1-Stroke · Redpen Card") },
  ];

  return (
    <section
      aria-label={pick("연재 이탈 코치·BGM 큐시트·크래시 복원·붉은펜 첨삭 패널", "Retention Coach, BGM Cue Sheet, Crash Recovery & Redpen Panel")}
      className={`flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("연재 리텐션 · 스크롤 OST · OPFS 1획 복원 · 붉은펜 아카데미", "Retention · Scroll OST · OPFS 1-Stroke · Redpen Academy")}</span>
          </div>
          <h2 className="text-base font-bold text-fg">{pick("웹툰 연재 몰입·안정·아카데미 스튜디오", "Webtoon Retention, Sound, Durability & Academy Studio")}</h2>
          <p className="text-xs text-fg-2">{pick("무료 1~5화 리듬 병목을 진단하고, 스크롤 연동 BGM·SFX 큐시트, 크래시 마지막 1획 복원, 붉은펜 첨삭 카드를 한곳에서 다룹니다.", "Diagnose EP.1-5 pacing dips, author scroll-synced BGM/SFX cue sheets, verify OPFS last-stroke WAL recovery, and package redpen critique cards.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span data-testid="free-arc-summary-badge" className="rounded-full bg-accent-soft px-3 py-1 font-semibold text-accent">
            {pick(`1~5화 평균 ${freeArc.averageRetentionScore}점 · 병목 ${freeArc.bottleneckEpisodeNumber ?? "-"}화`, `EP.1-5 Avg ${freeArc.averageRetentionScore} · Bottleneck EP.${freeArc.bottleneckEpisodeNumber ?? "-"}`)}
          </span>
          <span className="rounded-full bg-good-soft px-3 py-1 font-semibold text-good">
            {pick(`유료 전환 준비도 ${freeArc.paidWallReadinessScore}점`, `Paywall Readiness ${freeArc.paidWallReadinessScore}`)}
          </span>
        </div>
      </header>

      <div role="tablist" aria-label={pick("연재·사운드·복원 탭", "Retention, BGM, and recovery tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? BTN_PRIMARY : BTN_OUTLINE}>
            {tab.label}
          </button>
        ))}
      </div>

      {notice ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg border border-good bg-good-soft px-3 py-2 text-xs font-semibold text-good">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{notice}</span>
        </div>
      ) : null}

      {activeTab === "retention-coach" ? (
        <div id={`${uid}-panel-retention-coach`} role="tabpanel" aria-labelledby={`${uid}-tab-retention-coach`} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_FREE_ARC_EPISODES.map((ep) => (
                <button key={ep.episodeNumber} type="button" aria-pressed={selectedEp === ep.episodeNumber} onClick={() => { setSelectedEp(ep.episodeNumber); setGenreOverride(null); }} className={`${BTN_PILL} tabular-nums ${selectedEp === ep.episodeNumber ? BTN_ACTIVE : BTN_IDLE}`}>
                  {pick(`${ep.episodeNumber}화`, `EP.${ep.episodeNumber}`)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {GENRE_OPTIONS.map((g) => (
                <button key={g.id} type="button" aria-pressed={retentionReport.genre === g.id} onClick={() => setGenreOverride(g.id)} className={`${BTN_PILL} ${retentionReport.genre === g.id ? BTN_ACTIVE : BTN_IDLE}`}>
                  {pick(g.ko, g.en)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 text-xs tabular-nums">
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("종합 리텐션", "Overall Retention")}</div>
              <div data-testid="retention-overall-score" className="mt-1 flex items-center gap-2 text-base font-bold text-fg">
                <span>{retentionReport.overallRetentionScore}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskBadgeClass(retentionReport.riskLevel)}`}>{retentionReport.riskLevel.toUpperCase()}</span>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3"><div className="text-[11px] text-fg-3">{pick("오프닝 후크", "Opening Hook")}</div><div className="mt-1 text-base font-bold text-fg">{retentionReport.openingHookScore}</div></div>
            <div className="rounded-xl border border-line bg-card p-3"><div className="text-[11px] text-fg-3">{pick("클리프행어 강도", "Cliffhanger")}</div><div className="mt-1 text-base font-bold text-accent">{retentionReport.cliffhangerScore}</div></div>
            <div className="rounded-xl border border-line bg-card p-3"><div className="text-[11px] text-fg-3">{pick("모형 추정 완독률", "Model Est. Completion")}</div><div className="mt-1 text-base font-bold text-good">{retentionReport.estimatedCompletionRatePct}%</div></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-fg">{retentionReport.title} · {pick("컷별 리듬 곡선", "Cut Rhythm Curve")}</h3>
                <span className="text-[11px] tabular-nums text-fg-3">{pick(`평균 ${retentionReport.metrics.avgWordsPerCut}어절/컷 · 전환 ${retentionReport.metrics.sceneTransitionRatePer10Cuts}/10컷`, `Avg ${retentionReport.metrics.avgWordsPerCut}w/cut · Shifts ${retentionReport.metrics.sceneTransitionRatePer10Cuts}/10`)}</span>
              </div>
              <div className="space-y-2 tabular-nums">
                {retentionReport.rhythmCurve.map((pt) => (
                  <div key={pt.cutId} className="grid grid-cols-[54px_1fr_56px] items-center gap-2">
                    <span className="font-semibold text-fg-2">CUT {pt.cutIndex}</span>
                    <div className="h-3 overflow-hidden rounded-full border border-line bg-canvas">
                      <div style={{ width: `${Math.max(8, pt.engagementScore)}%` }} className={`h-full transition-[width] motion-reduce:transition-none ${pt.isPacingDip ? "bg-bad" : "bg-accent"}`} />
                    </div>
                    <span className={`text-right font-bold ${pt.isPacingDip ? "text-bad" : "text-fg"}`}>{pt.engagementScore}</span>
                  </div>
                ))}
              </div>
              {retentionReport.pacingDipZones.length > 0 ? (
                <div data-testid="pacing-dip-zones" className="space-y-1.5 rounded-lg border border-bad bg-bad-soft p-2.5 text-bad">
                  {retentionReport.pacingDipZones.map((zone) => (
                    <div key={zone.zoneId} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span><strong className="tabular-nums">{pick(`${zone.startCutIndex}~${zone.endCutIndex}컷`, `Cuts ${zone.startCutIndex}-${zone.endCutIndex}`)}</strong>: {pick(zone.reasonKo, zone.reasonEn)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>

            <article className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3.5 text-xs">
              <h3 className="font-bold text-fg">{pick(`구체적 편집 처방 (${retentionReport.prescriptions.length}건)`, `Editing Prescriptions (${retentionReport.prescriptions.length})`)}</h3>
              <ul data-testid="retention-prescriptions" className="space-y-2">
                {retentionReport.prescriptions.map((rx) => (
                  <li key={rx.prescriptionId} className="rounded-lg border border-line bg-canvas p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-fg">{pick(rx.titleKo, rx.titleEn)}</strong>
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold tabular-nums text-accent">{pick(`이탈 완충 추정 -${rx.expectedDropReductionPct}%p`, `Est. Drop -${rx.expectedDropReductionPct}%p`)}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-fg-2">{pick(rx.actionKo, rx.actionEn)}</p>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      ) : null}

      {activeTab === "bgm-cuesheet" ? (
        <div id={`${uid}-panel-bgm-cuesheet`} role="tabpanel" aria-labelledby={`${uid}-tab-bgm-cuesheet`} className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`${uid}-scroll-slider`} className="flex items-center gap-1.5 font-bold text-fg tabular-nums">
                <Music2 className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>{pick(`세로 스크롤 좌표 scrollY: ${scrollY}px (초점 Y=${bgmEvaluation.focalY}px)`, `Scroll Y: ${scrollY}px (Focal Y=${bgmEvaluation.focalY}px)`)}</span>
              </label>
              <span data-testid="bgm-crossfade-badge" className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums ${bgmEvaluation.crossfadeActive ? "bg-accent-soft text-accent" : "bg-raised text-fg-2"}`}>
                {bgmEvaluation.crossfadeActive ? pick("크로스페이드 활성", "Crossfade Active") : pick("단일 트랙 구간", "Single Track Zone")} · {Math.round(bgmEvaluation.totalNormalizedGain * 100)}%
              </span>
            </div>
            <input id={`${uid}-scroll-slider`} type="range" min={0} max={11200} step={50} value={scrollY} onChange={(e) => handleScrollChange(Number(e.target.value))} className="w-full accent-accent" />
            <div className="flex flex-wrap gap-1.5">
              {SCROLL_BOOKMARKS.map((bm) => (
                <button key={bm.scrollY} type="button" onClick={() => handleScrollChange(bm.scrollY)} className={`${BTN_PILL} ${Math.abs(scrollY - bm.scrollY) < 120 ? BTN_ACTIVE : BTN_IDLE}`}>{pick(bm.ko, bm.en)}</button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3.5 text-xs tabular-nums">
              <h3 className="flex items-center gap-1.5 font-bold text-fg"><Volume2 className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("BGM 크로스페이드 볼륨 믹서", "BGM Crossfade Volume Mixer")}</span></h3>
              {bgmEvaluation.activeTracks.map((tr) => (
                <div key={tr.trackId} data-testid={`bgm-track-${tr.trackId}`} className="space-y-1.5 rounded-lg border border-line bg-canvas p-2.5">
                  <div className="flex items-center justify-between gap-2"><span className="font-bold text-fg">{tr.title}</span><span className="text-[11px] text-fg-2">{phaseLabel(tr.phase, isKo)} · {Math.round(tr.effectiveVolume * 100)}%</span></div>
                  <div className="h-2.5 overflow-hidden rounded-full border border-line bg-panel"><div style={{ width: `${Math.round(tr.effectiveVolume * 100)}%` }} className="h-full bg-accent transition-[width] motion-reduce:transition-none" /></div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {PLATFORM_OPTIONS.map((pl) => <button key={pl.id} type="button" aria-pressed={cuePlatform === pl.id} onClick={() => setCuePlatform(pl.id)} className={`${BTN_PILL} ${cuePlatform === pl.id ? BTN_ACTIVE : BTN_IDLE}`}>{pl.label}</button>)}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setCuePreviewMode((m) => (m === "json" ? "none" : "json"))} className={BTN_OUTLINE}><Code2 className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("JSON 미리보기", "Preview JSON")}</span></button>
                <button type="button" onClick={() => setCuePreviewMode((m) => (m === "csv" ? "none" : "csv"))} className={BTN_OUTLINE}><Code2 className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("CSV 미리보기", "Preview CSV")}</span></button>
                <button type="button" onClick={() => handleExportCue("json")} className={BTN_PRIMARY}><Download className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("큐시트 JSON 출고", "Export JSON")}</span></button>
                <button type="button" onClick={() => handleExportCue("csv")} className={BTN_OUTLINE}><Download className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("CSV 출고", "Export CSV")}</span></button>
              </div>
              {cuePreviewMode !== "none" ? <pre data-testid="bgm-cuesheet-preview" className="max-h-36 overflow-auto rounded-lg border border-line bg-panel p-2 font-mono text-[10px] text-fg-2"><code>{cuePreviewMode === "json" ? cueSheet.json : cueSheet.csv}</code></pre> : null}
            </article>

            <article className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3.5 text-xs tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-fg">{pick("컷 진입 SFX 트리거 큐", "Cut-Entry SFX Trigger Cues")}</h3>
                <span className="text-[11px] text-fg-3">{pick(`커버리지 ${cueSheet.summary.totalCoveragePct}% · 크로스페이드 ${cueSheet.summary.crossfadeOverlapCount}곳`, `Coverage ${cueSheet.summary.totalCoveragePct}% · Crossfades ${cueSheet.summary.crossfadeOverlapCount}`)}</span>
              </div>
              <ul className="space-y-2">
                {bgmEvaluation.sfxStates.map((sfx) => (
                  <li key={sfx.sfxId} data-testid={`sfx-row-${sfx.sfxId}`} className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 ${sfx.fired || sfx.inAuditionZone ? "border-accent bg-accent-soft" : "border-line bg-canvas"}`}>
                    <div>
                      <div className="font-bold text-fg">{pick(sfx.labelKo, sfx.labelEn)} ({sfx.cutId})</div>
                      <div className="text-[11px] text-fg-2">Y={sfx.distancePx >= 0 ? `+${sfx.distancePx}` : sfx.distancePx}px · Pan {sfx.pan} · Cooldown {sfx.cooldownMs}ms</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sfx.fired ? "bg-good-soft text-good" : sfx.inAuditionZone ? "bg-accent text-on-accent" : "bg-raised text-fg-3"}`}>
                      {sfx.fired ? pick("발화됨", "FIRED") : sfx.inAuditionZone ? pick("감지 구간", "ACTIVE") : pick("대기", "ARMED")}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      ) : null}

      {activeTab === "crash-redpen" ? (
        <div id={`${uid}-panel-crash-redpen`} role="tabpanel" aria-labelledby={`${uid}-tab-crash-redpen`} className="grid gap-4 lg:grid-cols-2">
          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg"><ShieldCheck className="h-4 w-4 text-good" aria-hidden="true" /><span>{pick("OPFS 크래시 마지막 1획 복원 타임머신", "OPFS Crash Last-Stroke Time Machine")}</span></h3>
              <span data-testid="wal-recovery-rate" className="rounded-full bg-good-soft px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-good">
                {pick(`정상 획 손실 0% (${recoveryResult.receipt.healthyStrokeRecoveryRatePct}%)`, `0% Healthy Loss (${recoveryResult.receipt.healthyStrokeRecoveryRatePct}%)`)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["sha256", "fnv1a"] as const).map((alg) => (
                <button key={alg} type="button" aria-pressed={checksumAlg === alg} onClick={() => setChecksumAlg(alg)} className={`${BTN_PILL} ${checksumAlg === alg ? BTN_ACTIVE : BTN_IDLE}`}>{alg.toUpperCase()}</button>
              ))}
              <button type="button" aria-pressed={simulateCrashTail} onClick={() => setSimulateCrashTail((v) => !v)} className={`${BTN_PILL} ${simulateCrashTail ? BTN_ACTIVE : BTN_IDLE}`}>
                {simulateCrashTail ? pick("손상 꼬리 격리 시뮬레이션 ON", "Corrupted Tail Sim ON") : pick("정상 WAL 시뮬레이션", "Clean WAL Sim")}
              </button>
            </div>
            <div data-testid="wal-recovery-summary" className="space-y-1 rounded-lg border border-line bg-canvas p-2.5 tabular-nums text-fg-2">
              <div className="font-bold text-fg">{pick(recoveryResult.receipt.summaryKo, recoveryResult.receipt.summaryEn)}</div>
              <div>{pick(`마지막 복원 1획: ${recoveryResult.receipt.lastRecoveredStrokeId ?? "-"} · 총 복원 획 ${recoveryResult.receipt.recoveredStrokeCount}개 · 격리 ${recoveryResult.receipt.quarantinedEntryCount}건`, `Last Stroke: ${recoveryResult.receipt.lastRecoveredStrokeId ?? "-"} · Restored ${recoveryResult.receipt.recoveredStrokeCount} · Quarantined ${recoveryResult.receipt.quarantinedEntryCount}`)}</div>
              <div className="truncate font-mono text-[10px] text-fg-3">Receipt: {recoveryResult.receipt.receiptHash}</div>
            </div>
            <div className="flex flex-wrap gap-1.5 tabular-nums">
              {recoveryResult.timelineSteps.map((step) => (
                <span key={step.seq} className={`rounded-md border px-2 py-1 text-[10px] font-bold ${step.status === "applied" ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad"}`}>
                  SEQ-{step.seq} {step.status === "applied" ? "OK" : "QUARANTINE"}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowReceiptJson((v) => !v)} className={BTN_OUTLINE}><Code2 className="h-3.5 w-3.5" aria-hidden="true" /><span>{showReceiptJson ? pick("영수증 JSON 접기", "Hide Receipt JSON") : pick("복구 영수증 보기", "Inspect Receipt JSON")}</span></button>
              <button type="button" onClick={handleDownloadReceipt} className={BTN_PRIMARY}><Download className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("복구 영수증 발급", "Download Receipt")}</span></button>
            </div>
            {showReceiptJson ? <pre data-testid="wal-receipt-preview" className="max-h-36 overflow-auto rounded-lg border border-line bg-panel p-2 font-mono text-[10px] text-fg-2"><code>{recoveryResult.receiptJson}</code></pre> : null}
          </article>

          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg"><GraduationCap className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("붉은펜 첨삭 리플레이 · Before/After 카드", "Redpen Critique Replay & Before/After Card")}</span></h3>
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-accent">+{redpenCard.improvementDelta.silhouetteClarity} / +{redpenCard.improvementDelta.eyeFlowScore}</span>
            </div>
            <div className="rounded-lg border border-line bg-canvas p-2">
              <svg viewBox="0 0 1000 580" className="h-32 w-full" role="img" aria-label={pick("붉은펜 첨삭 획 리플레이 미리보기", "Redpen critique stroke replay preview")}>
                <rect x="12" y="12" width="976" height="556" rx="18" fill="var(--color-panel)" stroke="var(--color-line)" strokeWidth="4" />
                {redpenFrame.visibleStrokes.map(({ stroke, isActive }) => (
                  <path key={stroke.strokeId} d={stroke.points.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x} ${pt.y}`).join(" ")} fill="none" stroke={isActive ? "var(--color-bad)" : "var(--color-accent)"} strokeWidth={stroke.strokeWidthPx * 2.2} strokeLinecap="round" strokeLinejoin="round" />
                ))}
              </svg>
            </div>
            <label htmlFor={`${uid}-redpen-scrubber`} className="flex items-center justify-between font-semibold text-fg-2 tabular-nums">
              <span>{pick("첨삭 리플레이 타임라인", "Critique Replay Timeline")}</span>
              <span>{(redpenTimeMs / 1000).toFixed(1)}s / {(redpenCard.durationMs / 1000).toFixed(1)}s</span>
            </label>
            <input id={`${uid}-redpen-scrubber`} type="range" min={0} max={redpenCard.durationMs} step={200} value={redpenTimeMs} onChange={(e) => setRedpenTimeMs(Number(e.target.value))} className="w-full accent-accent" />
            <div data-testid="redpen-active-subtitle" className="rounded-lg border border-line bg-canvas p-2.5 text-fg-2">
              {redpenFrame.activeSubtitle ? `[${redpenFrame.activeSubtitle.speaker}] ${redpenFrame.activeSubtitle.text}` : pick("타임라인을 움직여 멘토 음성 자막과 붉은펜 교정 획을 확인하세요.", "Scrub the timeline to inspect mentor subtitles and redpen strokes.")}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setRedpenPreviewMode((m) => (m === "html" ? "none" : "html"))} className={BTN_OUTLINE}><Code2 className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("XSS-Safe HTML 보기", "Preview HTML Card")}</span></button>
              <button type="button" onClick={() => setRedpenPreviewMode((m) => (m === "json" ? "none" : "json"))} className={BTN_OUTLINE}><Code2 className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("경량 JSON 보기", "Preview JSON")}</span></button>
              <button type="button" onClick={() => handleDownloadRedpen("html")} className={BTN_PRIMARY}><Download className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("인터랙티브 카드 저장", "Export HTML Card")}</span></button>
            </div>
            {redpenPreviewMode !== "none" ? <pre data-testid="redpen-card-preview" className="max-h-36 overflow-auto rounded-lg border border-line bg-panel p-2 font-mono text-[10px] text-fg-2"><code>{redpenPreviewMode === "html" ? redpenCard.htmlSnippet : redpenCard.cardJson}</code></pre> : null}
          </article>
        </div>
      ) : null}
    </section>
  );
}
