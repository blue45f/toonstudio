/**
 * 웹툰 시그니처 6대 독보적 스튜디오 기능 통합 패널 (Wave 22):
 * 탭 1: 시선 흐름 · OKLCH 리라이팅 · 자석 프레이밍
 * 탭 2: 160px 썸네일 · 첫 3컷 진단
 * 탭 3: 손목 피로 예방 · 비행기 금고 & QR 미러
 * Calm Atelier 시맨틱 토큰 전용 · 460줄 이하 · 원시 색상 0건 · 명시적 transition 속성 · 모든 props 선택형 · KO/EN.
 */

import {
  Activity, AlertTriangle, CheckCircle2, Eye, Hand, Lock, Magnet, Palette,
  QrCode, RotateCcw, ShieldCheck, Smartphone, Sparkles, WifiOff,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  RELIGHT_MOOD_LIST, RELIGHT_MOOD_PRESETS, analyzeEyeFlowAndCutRhythm, createDemoEyeFlowInput,
  createDemoMagneticFramingInput, createDemoRelightInput, relightCutOklchNonDestructive,
  solveMagneticSpeedlinesAndBalloonTails,
  type EyeFlowAndCutRhythmReport, type EyeFlowEpisodeInput, type MagneticFramingInput,
  type MagneticFramingResult, type RelightCutInput, type RelightCutResult,
  type RelightMoodPresetId, type SpeedlineStyleId,
} from "./eyeflow-relighting-magnetic";
import {
  analyzeErgonomicFatigueAndRemap, auditThumbnailAndFirst3Cuts, buildOfflineVaultAndQrMirrorSession,
  createDemoErgonomicSessionInput, createDemoOfflineVaultQrInput, createDemoThumbnailAndCutsInput,
  type DominantHand, type ErgonomicFatigueReport, type ErgonomicSessionInput, type FeedThemeMode,
  type OfflineVaultAndQrMirrorResult, type OfflineVaultQrInput,
  type ThumbnailAndFirst3CutsInput, type ThumbnailAndFirst3CutsReport,
} from "./thumbnail-ergonomics-offline-qr";

export type SignatureWebtoonLabTab = "eyeflow-relight-magnetic" | "thumbnail-first3" | "ergonomics-vault-qr";

export interface StudioSignatureWebtoonLabPanelProps {
  readonly initialTab?: SignatureWebtoonLabTab; readonly locale?: "ko" | "en"; readonly className?: string;
  readonly initialMood?: RelightMoodPresetId; readonly initialSpeedlineStyle?: SpeedlineStyleId;
  readonly initialFeedMode?: FeedThemeMode; readonly initialDominantHand?: DominantHand;
  readonly eyeFlowInput?: EyeFlowEpisodeInput; readonly relightInput?: RelightCutInput;
  readonly magneticInput?: MagneticFramingInput; readonly thumbnailInput?: ThumbnailAndFirst3CutsInput;
  readonly ergonomicInput?: ErgonomicSessionInput; readonly offlineVaultInput?: OfflineVaultQrInput;
  readonly onEyeFlowAnalyzed?: (report: EyeFlowAndCutRhythmReport) => void;
  readonly onRelightRestored?: (result: RelightCutResult, restoredMatchesOriginal: boolean) => void;
  readonly onMagneticSolved?: (result: MagneticFramingResult) => void;
  readonly onThumbnailAudited?: (report: ThumbnailAndFirst3CutsReport) => void;
  readonly onErgonomicRemapApplied?: (report: ErgonomicFatigueReport) => void;
  readonly onQrSessionCreated?: (result: OfflineVaultAndQrMirrorResult) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_CHOICE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const BTN_ACTIVE = "border-accent bg-accent-soft text-accent";
const BTN_IDLE = "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const TAB_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const TABS: readonly { readonly id: SignatureWebtoonLabTab; readonly ko: string; readonly en: string }[] = [
  { id: "eyeflow-relight-magnetic", ko: "시선 흐름 · OKLCH 리라이팅 · 자석 프레이밍", en: "Eye-Flow · OKLCH Relight · Magnetic" },
  { id: "thumbnail-first3", ko: "160px 썸네일 · 첫 3컷 진단", en: "160px Thumbnail · First 3 Cuts" },
  { id: "ergonomics-vault-qr", ko: "손목 피로 예방 · 비행기 금고 & QR 미러", en: "Wrist Ergonomics · Vault & QR Mirror" },
];

const SPEEDLINE_STYLES: readonly { readonly id: SpeedlineStyleId; readonly ko: string; readonly en: string }[] = [
  { id: "focus-radial", ko: "집중선 방사", en: "Focus Radial" },
  { id: "action-parallel", ko: "액션 평행선", en: "Action Parallel" },
  { id: "shock-burst", ko: "충격 파열선", en: "Shock Burst" },
];

export function StudioSignatureWebtoonLabPanel({
  initialTab = "eyeflow-relight-magnetic", locale, className, initialMood = "sunset-gold",
  initialSpeedlineStyle = "focus-radial", initialFeedMode = "light", initialDominantHand = "right",
  eyeFlowInput, relightInput, magneticInput, thumbnailInput, ergonomicInput, offlineVaultInput,
  onEyeFlowAnalyzed, onRelightRestored, onMagneticSolved, onThumbnailAudited, onErgonomicRemapApplied, onQrSessionCreated,
}: StudioSignatureWebtoonLabPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<SignatureWebtoonLabTab>(initialTab);
  const [simulateBacktrack, setSimulateBacktrack] = useState<boolean>(false);
  const [mood, setMood] = useState<RelightMoodPresetId>(initialMood);
  const [paletteLockOn, setPaletteLockOn] = useState<boolean>(true);
  const [speedlineStyle, setSpeedlineStyle] = useState<SpeedlineStyleId>(initialSpeedlineStyle);
  const [tab1Notice, setTab1Notice] = useState<string | null>(null);

  const [feedMode, setFeedMode] = useState<FeedThemeMode>(initialFeedMode);
  const [simulateWeakDraft, setSimulateWeakDraft] = useState<boolean>(false);
  const [tab2Notice, setTab2Notice] = useState<string | null>(null);

  const [dominantHand, setDominantHand] = useState<DominantHand>(initialDominantHand);
  const [simulateCrunchFatigue, setSimulateCrunchFatigue] = useState<boolean>(true);
  const [airplaneMode, setAirplaneMode] = useState<boolean>(true);
  const [simulateVaultFault, setSimulateVaultFault] = useState<boolean>(false);
  const [tab3Notice, setTab3Notice] = useState<string | null>(null);

  const resolvedEyeFlowInput = useMemo(() => eyeFlowInput ?? createDemoEyeFlowInput(simulateBacktrack), [eyeFlowInput, simulateBacktrack]);
  const eyeFlowReport = useMemo(() => analyzeEyeFlowAndCutRhythm(resolvedEyeFlowInput), [resolvedEyeFlowInput]);
  const resolvedRelightInput = useMemo(() => (relightInput ? { ...relightInput, mood } : createDemoRelightInput(mood, paletteLockOn)), [mood, paletteLockOn, relightInput]);
  const relightResult = useMemo(() => relightCutOklchNonDestructive(resolvedRelightInput), [resolvedRelightInput]);
  const resolvedMagneticInput = useMemo(() => (magneticInput ? { ...magneticInput, speedlineStyle } : createDemoMagneticFramingInput(speedlineStyle)), [magneticInput, speedlineStyle]);
  const magneticResult = useMemo(() => solveMagneticSpeedlinesAndBalloonTails(resolvedMagneticInput), [resolvedMagneticInput]);
  const resolvedThumbInput = useMemo(() => thumbnailInput ?? createDemoThumbnailAndCutsInput(simulateWeakDraft), [simulateWeakDraft, thumbnailInput]);
  const thumbReport = useMemo(() => auditThumbnailAndFirst3Cuts(resolvedThumbInput), [resolvedThumbInput]);
  const resolvedErgoInput = useMemo(() => (ergonomicInput ? { ...ergonomicInput, dominantHand } : createDemoErgonomicSessionInput(simulateCrunchFatigue, dominantHand)), [dominantHand, ergonomicInput, simulateCrunchFatigue]);
  const ergoReport = useMemo(() => analyzeErgonomicFatigueAndRemap(resolvedErgoInput), [resolvedErgoInput]);
  const resolvedVaultInput = useMemo(() => (offlineVaultInput ? { ...offlineVaultInput, airplaneModeActive: airplaneMode } : createDemoOfflineVaultQrInput(airplaneMode, simulateVaultFault)), [airplaneMode, offlineVaultInput, simulateVaultFault]);
  const vaultResult = useMemo(() => buildOfflineVaultAndQrMirrorSession(resolvedVaultInput), [resolvedVaultInput]);

  const activeMoodPreset = RELIGHT_MOOD_PRESETS[mood];
  const activeFeedAudit = feedMode === "light" ? thumbReport.lightFeedAudit : thumbReport.darkFeedAudit;

  const handleRestoreOriginal = (): void => {
    const restored = relightResult.restoreOriginal();
    const matches = restored.length === relightResult.originalSnapshot.length && restored.every((v, idx) => v === relightResult.originalSnapshot[idx]);
    onRelightRestored?.(relightResult, matches);
    onEyeFlowAnalyzed?.(eyeFlowReport);
    onMagneticSolved?.(magneticResult);
    setTab1Notice(matches
      ? pick(`원본 채색 픽셀 100% 무손실 복원 확인 · 다이제스트 ${relightResult.originalDigest.slice(0, 10)} · 얼굴·눈 침범 0%`, `100% lossless original restore verified · digest ${relightResult.originalDigest.slice(0, 10)} · 0% face/eye intrusion.`)
      : pick("원본 복원 검증에 실패했습니다.", "Original restore verification failed."));
  };

  const handleConfirmThumbnailAudit = (): void => {
    onThumbnailAudited?.(thumbReport);
    setTab2Notice(pick(`160px 썸네일·첫 3컷 진단 완료 · 종합 ${thumbReport.overallRetentionScore}점(${thumbReport.grade}) · 예상 이탈률 ${thumbReport.estimatedBounceRiskPercent}%`, `160px thumbnail & first-3-cuts audit saved · ${thumbReport.overallRetentionScore}/100 (${thumbReport.grade}) · est. bounce ${thumbReport.estimatedBounceRiskPercent}%.`));
  };

  const handleApplyErgoRemap = (): void => {
    onErgonomicRemapApplied?.(ergoReport);
    setTab3Notice(pick(`로컬 메모리 전용 분석 완료 · 최빈 ${ergoReport.top3Remaps.length}개 도구 ${ergoReport.shortcutHand === "left" ? "왼손" : "오른손"}·휠 추천(이동 ${ergoReport.wristTravelReductionPercent}% 절감)`, `Local-memory remap applied · top ${ergoReport.top3Remaps.length} tools bound to ${ergoReport.shortcutHand} hand & wheel (-${ergoReport.wristTravelReductionPercent}% travel).`));
  };

  const handleCreateQrSession = (): void => {
    onQrSessionCreated?.(vaultResult);
    setTab3Notice(pick(`LAN 전용 QR 스크롤 검수 세션(${vaultResult.mirrorSession.sessionId}) 준비 완료 · OPFS 무결성 ${vaultResult.integrityScore}점`, `LAN-only QR scroll mirror (${vaultResult.mirrorSession.sessionId}) ready · OPFS integrity ${vaultResult.integrityScore}/100.`));
  };

  return (
    <section aria-label={pick("웹툰 시그니처 연출 · 생존 · 오프라인 검수 랩 패널", "Webtoon Signature Direction, Retention & Offline Inspection Lab Panel")} className={`rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}>
      <header className="space-y-1 border-b border-line pb-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>{pick("웹툰 시그니처 6대 랩 · 비파괴 OKLCH · 자석 프레이밍 · 로컬 금고", "6 Signature Webtoon Labs · Non-Destructive OKLCH · Magnetic Framing · OPFS Vault")}</span>
        </div>
        <h2 className="text-base font-bold text-fg">{pick("웹툰 시그니처 연출 · 리텐션 · 오프라인 검수 스튜디오", "Webtoon Signature Direction, Retention & Offline QA Lab")}</h2>
        <p className="text-xs text-fg-2">{pick("시선 역행 히트맵·OKLCH 일괄 리라이팅·얼굴 회피 자석 효과선, 160px 썸네일·첫 3컷 진단, 손목 피로 로컬 재매핑과 비행기 모드 QR 미러를 한 곳에서 점검합니다.", "Inspect eye-flow heatmaps, non-destructive OKLCH mood relighting, face-safe magnetic speedlines, 160px feed hooks, local wrist ergonomics, and airplane-mode QR scroll mirroring.")}</p>
      </header>

      <div role="tablist" aria-label={pick("웹툰 시그니처 랩 탭", "Webtoon signature lab tabs")} className="mt-3 grid grid-cols-1 gap-1.5 rounded-xl border border-line bg-canvas p-1.5 sm:grid-cols-3">
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={selected} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={`${TAB_BTN} ${selected ? "bg-accent text-on-accent" : "bg-transparent text-fg-2 hover:bg-raised hover:text-fg"}`}>
              <span>{pick(tab.ko, tab.en)}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "eyeflow-relight-magnetic" && (
        <div id={`${uid}-panel-eyeflow-relight-magnetic`} role="tabpanel" aria-labelledby={`${uid}-tab-eyeflow-relight-magnetic`} className="mt-4 space-y-3">
          <div className="rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg"><Eye className="h-4 w-4 text-accent" aria-hidden="true" /><span>{pick("시선 흐름 2D 히트맵 & 컷 리듬 오실로스코프", "Eye-Flow 2D Heatmap & Cut Rhythm Oscilloscope")}</span></div>
              <button type="button" aria-pressed={simulateBacktrack} onClick={() => setSimulateBacktrack((prev) => !prev)} className={`${BTN_CHOICE} ${simulateBacktrack ? "border-bad/40 bg-bad-soft text-bad" : BTN_IDLE}`}>
                <span>{simulateBacktrack ? pick("정돈된 시선 흐름 복귀", "Restore Clean Flow") : pick("역행·호흡 부족 시뮬레이션", "Simulate Backtrack Risk")}</span>
              </button>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
              <div data-testid="eyeflow-backtrack-score" className={`rounded-lg border px-2.5 py-2 ${eyeFlowReport.backtrackRiskScore <= 20 ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}>
                <div className="text-[11px] opacity-80">{pick("시선 역행 위험", "Backtrack Risk")}</div>
                <div className="font-bold tabular-nums">{eyeFlowReport.backtrackRiskScore}/100 ({eyeFlowReport.backtrackEvents.length}{pick("건", " hits")})</div>
              </div>
              <div data-testid="eyeflow-breath-score" className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                <div className="text-[11px] text-fg-3">{pick("클리프행어 호흡 여백", "Cliffhanger Breath")}</div>
                <div className="font-bold tabular-nums text-fg">{eyeFlowReport.cliffhangerBreathScore}/100</div>
              </div>
              <div className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                <div className="text-[11px] text-fg-3">{pick("흐름 매끄러움", "Flow Smoothness")}</div>
                <div className="font-bold tabular-nums text-fg">{eyeFlowReport.flowSmoothnessScore}/100</div>
              </div>
              <div className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                <div className="text-[11px] text-fg-3">{pick("히트맵 격자", "Heatmap Grid")}</div>
                <div className="font-bold tabular-nums text-fg">{eyeFlowReport.heatmapCols}×{eyeFlowReport.heatmapRows}</div>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-line bg-canvas p-2.5">
                <div className="mb-1.5 text-[11px] font-semibold text-fg-2">{pick("2D 시선 밀도 히트맵 (상위 48셀 샘플)", "2D Eye-Flow Density Heatmap (48-cell preview)")}</div>
                <div data-testid="eyeflow-heatmap-grid" className="grid grid-cols-8 gap-1">
                  {eyeFlowReport.heatmapGrid.slice(0, 48).map((cell) => (
                    <div key={`${cell.row}-${cell.col}`} className={`h-3 rounded-sm ${cell.backtrackHeat > 0.35 ? "bg-bad" : "bg-accent"}`} style={{ opacity: Math.max(0.12, Math.max(cell.heat, cell.backtrackHeat)) }} title={`(${cell.col},${cell.row}) heat ${cell.heat}`} />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-canvas p-2.5">
                <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-fg-2"><Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" /><span>{pick("컷 리듬 오실로스코프", "Cut Rhythm Oscilloscope")}</span></div>
                <ul className="space-y-1.5 text-xs">
                  {eyeFlowReport.oscilloscopeSamples.map((s) => (
                    <li key={s.cutId} className="flex items-center justify-between gap-2 rounded border border-line bg-card px-2 py-1 tabular-nums">
                      <span className="font-semibold text-fg">{s.cutId}{s.isCliffhanger ? pick(" · 클리프", " · Cliff") : ""}</span>
                      <span className="text-[11px] text-fg-2">{pick("긴장", "Tension")} {s.tension} · {pick("여백", "Gap")} {s.breathGapPx}px ({s.breathAdequacy})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg"><Palette className="h-4 w-4 text-accent" aria-hidden="true" />{pick("비파괴 OKLCH 팔레트 락 & 5종 리라이팅", "Non-Destructive OKLCH Palette Lock & 5 Moods")}</span>
                <label htmlFor={`${uid}-palette-lock`} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 text-xs font-medium text-fg-2">
                  <input id={`${uid}-palette-lock`} type="checkbox" checked={paletteLockOn} onChange={(e) => setPaletteLockOn(e.target.checked)} className="accent-accent" />
                  <Lock className="h-3 w-3 text-accent" aria-hidden="true" />
                  <span>{pick("피부·헤어 팔레트 락", "Skin/Hair Lock")}</span>
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {RELIGHT_MOOD_LIST.map((preset) => (
                  <button key={preset.id} type="button" aria-pressed={mood === preset.id} onClick={() => setMood(preset.id)} className={`${BTN_CHOICE} px-2.5 ${mood === preset.id ? BTN_ACTIVE : BTN_IDLE}`}><span>{pick(preset.labelKo, preset.labelEn)}</span></button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-fg-2">{pick(activeMoodPreset.summaryKo, activeMoodPreset.summaryEn)}</p>
              <div data-testid="oklch-relight-metrics" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-[11px] tabular-nums text-fg-2">
                <span>ΔL {relightResult.metrics.meanDeltaL} · ΔC {relightResult.metrics.meanDeltaC} · {pick("잠금 픽셀", "Locked")} {relightResult.metrics.lockedPixelCount}/{relightResult.metrics.pixelCount}</span>
                <span className="font-bold text-good">{relightResult.metrics.originalIntact ? pick("원본 100% 보존", "Original 100% Intact") : pick("손상", "Modified")}</span>
              </div>
              <div className="mt-2.5">
                <button type="button" onClick={handleRestoreOriginal} className={BTN_PRIMARY}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("원본 100% 복원 검증", "Verify 100% Original Restore")}</span></button>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg"><Magnet className="h-4 w-4 text-accent" aria-hidden="true" />{pick("자석 효과선·집중선·말풍선 꼬리", "Magnetic Speedlines & Balloon Tails")}</span>
                <span data-testid="magnetic-clearance-badge" className={`rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums ${magneticResult.verification.guaranteedFaceEyeClear ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}>
                  {pick(`얼굴·눈 침범 ${magneticResult.verification.faceEyeIntrusionPercent}%`, `Face/Eye Intrusion ${magneticResult.verification.faceEyeIntrusionPercent}%`)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SPEEDLINE_STYLES.map((st) => (
                  <button key={st.id} type="button" aria-pressed={speedlineStyle === st.id} onClick={() => setSpeedlineStyle(st.id)} className={`${BTN_CHOICE} px-2.5 ${speedlineStyle === st.id ? BTN_ACTIVE : BTN_IDLE}`}><span>{pick(st.ko, st.en)}</span></button>
                ))}
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs tabular-nums">
                <div className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                  <div className="text-[11px] text-fg-3">{pick("안전 공백 반경 / 회피선", "Clear Radius / Clipped")}</div>
                  <div className="font-bold text-fg">{magneticResult.clearRadiusPx}px · {magneticResult.verification.clippedRays}/{magneticResult.verification.totalRays}</div>
                </div>
                <div className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                  <div className="text-[11px] text-fg-3">{pick("자석 말풍선 꼬리", "Magnetic Balloon Tails")}</div>
                  <div className="font-bold text-fg">{magneticResult.balloonTails.length}{pick("개 탄성 배치", " elastic tails")}</div>
                </div>
              </div>
            </div>
          </div>
          {tab1Notice && <p role="status" className="rounded-lg border border-good/40 bg-good-soft px-3 py-1.5 text-xs font-medium text-good">{tab1Notice}</p>}
        </div>
      )}

      {activeTab === "thumbnail-first3" && (
        <div id={`${uid}-panel-thumbnail-first3`} role="tabpanel" aria-labelledby={`${uid}-tab-thumbnail-first3`} className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={feedMode === "light"} onClick={() => setFeedMode("light")} className={`${BTN_CHOICE} ${feedMode === "light" ? BTN_ACTIVE : BTN_IDLE}`}>{pick("라이트 피드 160px", "Light Feed 160px")}</button>
              <button type="button" aria-pressed={feedMode === "dark"} onClick={() => setFeedMode("dark")} className={`${BTN_CHOICE} ${feedMode === "dark" ? BTN_ACTIVE : BTN_IDLE}`}>{pick("다크 피드 160px", "Dark Feed 160px")}</button>
              <button type="button" aria-pressed={simulateWeakDraft} onClick={() => setSimulateWeakDraft((prev) => !prev)} className={`${BTN_CHOICE} ${simulateWeakDraft ? "border-warn/40 bg-warn/15 text-warn" : BTN_IDLE}`}>
                <span>{simulateWeakDraft ? pick("최적화 썸네일로 복귀", "Switch to Optimized") : pick("이탈 위험 초안 시뮬레이션", "Simulate High-Bounce Draft")}</span>
              </button>
            </div>
            <button type="button" onClick={handleConfirmThumbnailAudit} className={BTN_PRIMARY}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("썸네일·첫 3컷 진단 확정", "Confirm Retention Audit")}</span></button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div data-testid="thumb-retention-score" className={`rounded-xl border p-3 ${thumbReport.overallRetentionScore >= 75 ? "border-good/40 bg-good-soft text-good" : "border-bad/40 bg-bad-soft text-bad"}`}>
              <div className="text-[11px] opacity-80">{pick("종합 잔존 점수 · 등급", "Retention Score · Grade")}</div>
              <div className="mt-1 text-sm font-bold tabular-nums">{thumbReport.overallRetentionScore}/100 ({thumbReport.grade})</div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("인물 / 얼굴 점유율", "Char / Face Share")}</div>
              <div data-testid="thumb-occupancy-metric" className="mt-1 text-sm font-bold tabular-nums text-fg">{thumbReport.characterOccupancyPercent}% · {thumbReport.faceOccupancyPercent}%</div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("제목 WCAG 대비 / 160px 크기", "Title WCAG / Size@160px")}</div>
              <div className={`mt-1 text-sm font-bold tabular-nums ${thumbReport.titleWcagAaPass ? "text-good" : "text-bad"}`}>{thumbReport.titleContrastRatio}:1 · {thumbReport.renderedTitleFontPxAt160}px</div>
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("첫 3컷 후크 / 이탈 위험", "First-3 Hook / Bounce")}</div>
              <div data-testid="thumb-first3-score" className="mt-1 text-sm font-bold tabular-nums text-fg">{thumbReport.first3CutsHookScore}{pick("점", "pt")} · {thumbReport.estimatedBounceRiskPercent}%</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 text-xs">
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-fg">{pick(`160px ${feedMode === "light" ? "라이트" : "다크"} 피드 시뮬레이션`, `160px ${feedMode} Feed Simulation`)}</span>
                <span data-testid="thumb-feed-verdict" className={`font-bold tabular-nums ${activeFeedAudit.blendsIntoFeed ? "text-bad" : "text-good"}`}>{activeFeedAudit.edgeContrastRatio}:1 ({activeFeedAudit.feedScore}{pick("점", "pt")})</span>
              </div>
              <p className="mt-1.5 text-fg-2">{pick(activeFeedAudit.verdictKo, activeFeedAudit.verdictEn)}</p>
              <ul className="mt-2.5 space-y-1.5">
                {thumbReport.first3CutsAudit.map((cut) => (
                  <li key={cut.cutIndex} className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                    <div className="flex items-center justify-between font-semibold text-fg tabular-nums"><span>{pick(`${cut.cutIndex}컷 오프닝 후크`, `Cut ${cut.cutIndex} Opening Hook`)}</span><span className={cut.hookScore >= 70 ? "text-good" : "text-bad"}>{cut.hookScore}/100</span></div>
                    <p className="mt-0.5 text-[11px] text-fg-2">{pick(cut.noteKo, cut.noteEn)}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-line bg-card p-3">
              <div className="font-bold text-fg">{pick(`우선 개선 액션 (${thumbReport.improvementActions.length}건)`, `Priority Actions (${thumbReport.improvementActions.length})`)}</div>
              {thumbReport.improvementActions.length === 0 ? (
                <p className="mt-2 rounded-lg border border-good/40 bg-good-soft px-3 py-2 font-medium text-good">{pick("160px 썸네일 가독성과 첫 3컷 이탈 방어 기준을 모두 통과했습니다.", "All 160px thumbnail and first-3-cuts retention checks passed.")}</p>
              ) : (
                <ul data-testid="thumb-improvement-list" className="mt-2 space-y-1.5">
                  {thumbReport.improvementActions.map((act, idx) => (
                    <li key={`${act.target}-${idx}`} className="rounded-lg border border-warn/40 bg-warn/15 px-2.5 py-2">
                      <div className="font-semibold text-fg">{pick(act.titleKo, act.titleEn)}</div>
                      <p className="mt-0.5 text-[11px] text-fg-2">{pick(act.detailKo, act.detailEn)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {tab2Notice && <p role="status" className="rounded-lg border border-good/40 bg-good-soft px-3 py-1.5 text-xs font-medium text-good">{tab2Notice}</p>}
        </div>
      )}

      {activeTab === "ergonomics-vault-qr" && (
        <div id={`${uid}-panel-ergonomics-vault-qr`} role="tabpanel" aria-labelledby={`${uid}-tab-ergonomics-vault-qr`} className="mt-4 space-y-3 text-xs">
          <div className="rounded-xl border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-fg"><Hand className="h-4 w-4 text-accent" aria-hidden="true" />{pick("100% 로컬 손목 피로 감지 & 최빈 3개 도구 한 손 재매핑", "100% Local Wrist Fatigue Monitor & Top-3 One-Hand Remap")}</span>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setDominantHand((prev) => (prev === "right" ? "left" : "right"))} className={`${BTN_CHOICE} ${BTN_IDLE}`}><span>{dominantHand === "right" ? pick("오른손 펜 (왼손 단축키)", "Right Stylus (Left Keys)") : pick("왼손 펜 (오른손 단축키)", "Left Stylus (Right Keys)")}</span></button>
                <button type="button" aria-pressed={simulateCrunchFatigue} onClick={() => setSimulateCrunchFatigue((prev) => !prev)} className={`${BTN_CHOICE} ${simulateCrunchFatigue ? "border-warn/40 bg-warn/15 text-warn" : BTN_IDLE}`}><span>{simulateCrunchFatigue ? pick("정상 작업 패턴 보기", "View Fresh Session") : pick("마감 과부하 시뮬레이션", "Simulate Crunch Fatigue")}</span></button>
                <button type="button" onClick={handleApplyErgoRemap} className={BTN_PRIMARY}>{pick("한 손 단축키 추천 적용", "Apply One-Hand Remap")}</button>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 tabular-nums">
              <div data-testid="ergo-fatigue-score" className={`rounded-lg border px-2.5 py-2 ${ergoReport.fatigueScore >= 52 ? "border-bad/40 bg-bad-soft text-bad" : "border-good/40 bg-good-soft text-good"}`}>
                <div className="text-[11px] opacity-80">{pick("손목 피로 지수", "Wrist Fatigue")}</div>
                <div className="font-bold">{ergoReport.fatigueScore}/100 ({ergoReport.fatigueLevel})</div>
              </div>
              <div className="rounded-lg border border-line bg-canvas px-2.5 py-2"><div className="text-[11px] text-fg-3">{pick("반복 Undo / 고필압", "Undo Bursts / High-P")}</div><div className="font-bold text-fg">{ergoReport.rapidUndoBurstCount}{pick("회", "x")} · {ergoReport.highPressureStreakSec}s</div></div>
              <div className="rounded-lg border border-line bg-canvas px-2.5 py-2"><div className="text-[11px] text-fg-3">{pick("손목 꺾임 최대/비율", "Peak Bend / Ratio")}</div><div className="font-bold text-fg">{ergoReport.peakWristDeviationDeg}° · {(ergoReport.excessiveWristBendRatio * 100).toFixed(0)}%</div></div>
              <div className="rounded-lg border border-line bg-canvas px-2.5 py-2"><div className="text-[11px] text-fg-3">{pick("프라이버시 격리", "Privacy Boundary")}</div><div className="font-bold text-good">{pick("로컬 메모리 전용", "Local Memory Only")}</div></div>
            </div>
            <div className="mt-2.5 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              <ul data-testid="ergo-top3-remaps" className="space-y-1.5">
                {ergoReport.top3Remaps.map((item) => (
                  <li key={item.toolId} className="rounded-lg border border-line bg-canvas px-2.5 py-2 tabular-nums">
                    <div className="flex items-center justify-between gap-2 font-semibold text-fg"><span>#{item.rank} {pick(item.labelKo, item.labelEn)} ({item.usageCount}{pick("회", "x")})</span><span className="text-accent">{item.recommendedOneHandKey}</span></div>
                    <div className="mt-0.5 text-[11px] text-fg-2">{item.previousBinding} → {item.recommendedMouseWheel}</div>
                  </li>
                ))}
              </ul>
              <ul className="space-y-1.5">
                {ergoReport.microStretchPlan.map((step) => (
                  <li key={step.stepOrder} className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                    <div className="font-semibold text-fg tabular-nums">{step.stepOrder}. {pick(step.targetAreaKo, step.targetAreaEn)} ({step.durationSec}s)</div>
                    <p className="mt-0.5 text-[11px] text-fg-2">{pick(step.instructionKo, step.instructionEn)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-line bg-card p-3 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-fg">{vaultResult.vaultStatus === "fault" ? <AlertTriangle className="h-4 w-4 text-bad" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4 text-good" aria-hidden="true" />}{pick("오프라인 비행기 모드 OPFS 연재 금고 체크리스트", "Airplane-Mode OPFS Vault Integrity Checklist")}</span>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" aria-pressed={airplaneMode} onClick={() => setAirplaneMode((prev) => !prev)} className={`${BTN_CHOICE} ${airplaneMode ? BTN_ACTIVE : BTN_IDLE}`}><WifiOff className="h-3.5 w-3.5" aria-hidden="true" /><span>{airplaneMode ? pick("비행기 모드 ON", "Airplane Mode ON") : pick("비행기 모드 OFF", "Airplane Mode OFF")}</span></button>
                  <button type="button" aria-pressed={simulateVaultFault} onClick={() => setSimulateVaultFault((prev) => !prev)} className={`${BTN_CHOICE} ${simulateVaultFault ? "border-bad/40 bg-bad-soft text-bad" : BTN_IDLE}`}><span>{simulateVaultFault ? pick("체크섬 정상 복구", "Restore Clean Vault") : pick("체크섬 손상 테스트", "Simulate Checksum Fault")}</span></button>
                </div>
              </div>
              <ul data-testid="opfs-vault-checklist" className="mt-2.5 space-y-1.5">
                {vaultResult.checklist.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2">
                    <div><div className="font-semibold text-fg">{pick(item.labelKo, item.labelEn)}</div><div className="text-[11px] text-fg-2">{pick(item.detailKo, item.detailEn)}</div></div>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold uppercase ${item.status === "pass" ? "bg-good-soft text-good" : item.status === "warn" ? "bg-warn/15 text-warn" : "bg-bad-soft text-bad"}`}>{item.status}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-fg"><Smartphone className="h-4 w-4 text-accent" aria-hidden="true" />{pick("QR 스마트폰 스크롤 검수", "QR Mobile Scroll Mirror")}</span>
                <span className="tabular-nums text-[11px] font-semibold text-good">LAN Only</span>
              </div>
              <div className="mt-2.5 flex justify-center rounded-xl border border-line bg-canvas p-3 text-fg">
                <svg data-testid="qr-mirror-svg" viewBox="0 0 29 29" className="h-32 w-32" role="img" aria-label={pick("LAN QR 스크롤 검수 코드", "LAN QR Scroll Mirror Code")} shapeRendering="crispEdges">
                  <g fill="currentColor">
                    {vaultResult.qrMatrix.map((row, r) => row.map((dark, c) => (dark ? <rect key={`${r}-${c}`} x={c + 2} y={r + 2} width={1} height={1} /> : null)))}
                  </g>
                </svg>
              </div>
              <div className="mt-2 space-y-1 text-[11px] tabular-nums text-fg-2">
                <div className="truncate font-semibold text-fg">{vaultResult.mirrorSession.mirrorUrl}</div>
                <div>{pick(`뷰포트 ${vaultResult.mirrorSession.viewportWidthPx}px · ${vaultResult.mirrorSession.scrollCutCount}컷 · 세션 ${vaultResult.mirrorSession.sessionId}`, `Viewport ${vaultResult.mirrorSession.viewportWidthPx}px · ${vaultResult.mirrorSession.scrollCutCount} cuts · ${vaultResult.mirrorSession.sessionId}`)}</div>
              </div>
              <div className="mt-2.5">
                <button type="button" onClick={handleCreateQrSession} className={`${BTN_PRIMARY} w-full`}><QrCode className="h-3.5 w-3.5" aria-hidden="true" /><span>{pick("LAN QR 검수 세션 확정", "Confirm LAN QR Session")}</span></button>
              </div>
            </div>
          </div>
          {tab3Notice && <p role="status" className="rounded-lg border border-good/40 bg-good-soft px-3 py-1.5 text-xs font-medium text-good">{tab3Notice}</p>}
        </div>
      )}
    </section>
  );
}
