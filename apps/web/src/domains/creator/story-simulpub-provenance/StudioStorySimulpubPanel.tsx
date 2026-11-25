/**
 * 스토리 개연성 인과 감사관 · 5개국 동시 연재 리플로우 & 로컬 HMAC 무결성 예제 · 독자 스크롤 히트맵 3탭 패널 (Wave 39D).
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 0건) · Props 없이 단독 렌더링 지원 · 100% 온디바이스 결정론 연산.
 */

import {
  Activity, AlertTriangle, CheckCircle2, Fingerprint, GitBranch,
  Globe2, Music2, Scissors, ShieldAlert, ShieldCheck, Sparkles,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  auditNarrativeCausality, CLEAN_NARRATIVE_CAUSALITY_DATASET, DEFAULT_NARRATIVE_CAUSALITY_DATASET,
  type CausalitySeverity, type NarrativeCausalityAuditReport,
} from "./narrative-causality-engine";
import {
  DEFAULT_SCROLL_EPISODE_PRESETS, evaluateScrollBeatAtPosition, simulateScrollPacingHeatmap,
  type DropOffRiskBand, type ScrollPacingHeatmapReport,
} from "./scroll-pacing-heatmap-engine";
import {
  createLocalIntegrityManifest, createDemoCreatorIdentity, createSyntheticArtworkRgba, cropRgbaBuffer,
  DEFAULT_SIMULPUB_PANEL_INPUT, encodeCropResistantWatermark, LOCALE_EXPANSION_PROFILES,
  reflowPanelAllLocales, SIMULPUB_LOCALES, verifyLocalIntegrityManifest, verifyCropResistantWatermark,
  type SimulpubLocale, type SimulpubReflowReport,
} from "./simulpub-reflow-provenance";

export type StorySimulpubTabId = "causality" | "simulpub" | "heatmap";

export interface StudioStorySimulpubPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialTab?: StorySimulpubTabId;
  readonly initialSimulpubLocale?: SimulpubLocale;
  readonly initialCreatorHandle?: string;
  readonly onCausalityAudited?: (report: NarrativeCausalityAuditReport) => void;
  readonly onSimulpubReflowed?: (report: SimulpubReflowReport) => void;
  readonly onHeatmapSimulated?: (report: ScrollPacingHeatmapReport) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BTN = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const PILL_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const ACTIVE_TONE = "border-accent bg-accent-soft text-accent";
const IDLE_TONE = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";

function severityBadgeTone(severity: CausalitySeverity): string {
  if (severity === "critical") return "border-bad bg-bad-soft text-bad";
  return severity === "warning" ? "border-line bg-warning-soft text-warn" : "border-line bg-raised text-fg-2";
}

function riskBandTone(band: DropOffRiskBand): string {
  if (band === "critical" || band === "high") return "border-bad bg-bad-soft text-bad";
  return band === "watch" ? "border-line bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
}

function riskBarFillTone(band: DropOffRiskBand): string {
  if (band === "critical" || band === "high") return "bg-bad";
  return band === "watch" ? "bg-warn" : "bg-good";
}

function dagStatusTone(status: "resolved" | "unresolved" | "inverted" | "cyclic"): string {
  if (status === "resolved") return "border-good bg-good-soft text-good";
  return status === "unresolved" ? "border-line bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";
}

function applyBrightnessShift(
  source: ReturnType<typeof createSyntheticArtworkRgba>,
  delta: number,
): ReturnType<typeof createSyntheticArtworkRgba> {
  const shifted = new Uint8ClampedArray(source.data.length);
  for (let i = 0; i < source.data.length; i += 4) {
    shifted[i] = Math.min(255, Math.max(0, (source.data[i] ?? 0) + delta));
    shifted[i + 1] = Math.min(255, Math.max(0, (source.data[i + 1] ?? 0) + delta));
    shifted[i + 2] = Math.min(255, Math.max(0, (source.data[i + 2] ?? 0) + delta));
    shifted[i + 3] = source.data[i + 3] ?? 255;
  }
  return { width: source.width, height: source.height, data: shifted };
}

/** 스토리 개연성 인과 감사 · 5개국 동시 연재 리플로우 & 로컬 무결성 예제 · 독자 스크롤 히트맵 통합 패널. */
export function StudioStorySimulpubPanel(props: StudioStorySimulpubPanelProps): ReactElement {
  const {
    locale, className, initialTab = "causality", initialSimulpubLocale = "es",
    initialCreatorHandle = "atelier-han", onCausalityAudited, onSimulpubReflowed, onHeatmapSimulated,
  } = props;

  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [activeTab, setActiveTab] = useState<StorySimulpubTabId>(initialTab);
  const [datasetMode, setDatasetMode] = useState<"audit-issues" | "clean-fixed">("audit-issues");
  const [selectedLocale, setSelectedLocale] = useState<SimulpubLocale>(initialSimulpubLocale);
  const [creatorHandle, setCreatorHandle] = useState<string>(initialCreatorHandle);
  const [simulateTamper, setSimulateTamper] = useState<boolean>(false);
  const [watermarkMode, setWatermarkMode] = useState<"full" | "crop-odd" | "crop-bright">("crop-odd");
  const [selectedEpisodeIdx, setSelectedEpisodeIdx] = useState<number>(0);
  const [scrollY, setScrollY] = useState<number>(680);

  const causalityReport = useMemo<NarrativeCausalityAuditReport>(
    () => auditNarrativeCausality(datasetMode === "audit-issues" ? DEFAULT_NARRATIVE_CAUSALITY_DATASET : CLEAN_NARRATIVE_CAUSALITY_DATASET),
    [datasetMode],
  );
  const reflowReport = useMemo<SimulpubReflowReport>(() => reflowPanelAllLocales(DEFAULT_SIMULPUB_PANEL_INPUT), []);
  const activeLocaleSummary = reflowReport.locales[selectedLocale];
  const activeLocaleProfile = LOCALE_EXPANSION_PROFILES[selectedLocale];

  const provenanceState = useMemo(() => {
    const signingSeed = "public-synthetic-demo-key-not-a-secret";
    const did = createDemoCreatorIdentity(creatorHandle);
    const artwork = createSyntheticArtworkRgba(96, 96);
    const manifest = createLocalIntegrityManifest({
      title: DEFAULT_SIMULPUB_PANEL_INPUT.titleKo, episodeCode: "EP.12", creatorDid: did,
      artworkBytes: artwork.data, humanStrokeCount: 1482, aiAssistedRatio: 0.04,
      createdAtIso: "2026-11-24T12:00:00.000Z", doNotTrain: true, signingSeed, dataOrigin: "synthetic-example",
    });
    const verifyBytes = new Uint8ClampedArray(artwork.data);
    if (simulateTamper && verifyBytes.length > 0) verifyBytes[0] = ((verifyBytes[0] ?? 0) + 7) & 0xff;
    const integrityCheck = verifyLocalIntegrityManifest(manifest, verifyBytes, signingSeed, did);

    const encoded = encodeCropResistantWatermark(artwork, did.didWeb, manifest.claim.assetSha256, 5);
    const probeBuffer =
      watermarkMode === "crop-odd"
        ? cropRgbaBuffer(encoded.watermarked, 19, 23, 56, 56)
        : watermarkMode === "crop-bright"
          ? applyBrightnessShift(cropRgbaBuffer(encoded.watermarked, 17, 21, 56, 56), 14)
          : encoded.watermarked;
    const wmCheck = verifyCropResistantWatermark(probeBuffer, did.didWeb, manifest.claim.assetSha256);
    return { did, manifest, integrityCheck, encoded, wmCheck };
  }, [creatorHandle, simulateTamper, watermarkMode]);

  const activeEpisodePreset = DEFAULT_SCROLL_EPISODE_PRESETS[selectedEpisodeIdx] ?? DEFAULT_SCROLL_EPISODE_PRESETS[0];
  const heatmapReport = useMemo<ScrollPacingHeatmapReport>(
    () => simulateScrollPacingHeatmap(activeEpisodePreset ?? { episodeId: "fallback", episodeNumber: 1, titleKo: "빈 회차", titleEn: "Empty", panels: [] }),
    [activeEpisodePreset],
  );
  const clampedScrollY = Math.min(scrollY, Math.max(0, heatmapReport.totalScrollHeightPx));
  const beatSnapshot = useMemo(
    () => evaluateScrollBeatAtPosition(heatmapReport.cueSheet, clampedScrollY, heatmapReport.viewportHeightPx),
    [clampedScrollY, heatmapReport.cueSheet, heatmapReport.viewportHeightPx],
  );

  const tabs: readonly { readonly id: StorySimulpubTabId; readonly label: string; readonly icon: ReactElement }[] = [
    { id: "causality", label: pick("복선·모순 인과 감사", "Narrative Causality Audit"), icon: <GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "simulpub", label: pick("5개국 리플로우·로컬 무결성 예제", "5-Locale Reflow & Local Integrity"), icon: <Globe2 className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "heatmap", label: pick("스크롤 피로 규칙 예제", "Scroll Pacing Rule Example"), icon: <Activity className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];

  const handleSelectDataset = (mode: "audit-issues" | "clean-fixed"): void => {
    setDatasetMode(mode);
    onCausalityAudited?.(auditNarrativeCausality(mode === "audit-issues" ? DEFAULT_NARRATIVE_CAUSALITY_DATASET : CLEAN_NARRATIVE_CAUSALITY_DATASET));
  };
  const handleSelectLocale = (loc: SimulpubLocale): void => {
    setSelectedLocale(loc);
    onSimulpubReflowed?.(reflowReport);
  };
  const handleSelectEpisode = (idx: number): void => {
    setSelectedEpisodeIdx(idx);
    setScrollY(680);
    const next = DEFAULT_SCROLL_EPISODE_PRESETS[idx];
    if (next) onHeatmapSimulated?.(simulateScrollPacingHeatmap(next));
  };

  return (
    <section
      data-testid="story-simulpub-provenance-panel"
      aria-label={pick("스토리 개연성 인과 감사 · 5개국 동시 연재 리플로우 & 로컬 무결성 예제 · 독자 스크롤 히트맵", "Story Causality, 5-Locale Reflow & Local Integrity, Reader Scroll Heatmap")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("스토리 인과 감사관 · 5개국 리플로우 · 로컬 무결성 예제 · 스크롤 히트맵", "Story Causality · 5-Locale Reflow · Local Integrity Demo · Scroll Heatmap")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick("합성 대본·번역·96×96 이미지의 CPU 계산 예제입니다. 실제 원고 읽기·반영·영구 저장·외부 통신은 없으며 C2PA 서명·신원·저작권을 증명하지 않습니다.", "Synthetic script, translation and 96x96 image CPU examples. No manuscript access, changes, persistence or external calls; no C2PA signature, identity or copyright attestation.")}
          </p>
        </div>
        <span data-testid="badge-provenance-ready" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-good bg-good-soft px-2.5 py-1 text-xs font-semibold text-good tabular-nums">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {pick("합성 데이터 예제 · 사각형 겹침 검사", "Synthetic Examples · Rectangle Overlap Check")}
        </span>
      </header>

      <div role="tablist" aria-label={pick("감사·출고 기능 탭", "Audit and publishing tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id} type="button" role="tab" id={`${uid}-tab-${tab.id}`}
            aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`}
            data-testid={`tab-${tab.id}`} onClick={() => setActiveTab(tab.id)}
            className={`${TAB_BTN} ${activeTab === tab.id ? ACTIVE_TONE : IDLE_TONE}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "causality" && (
        <div role="tabpanel" id={`${uid}-panel-causality`} aria-labelledby={`${uid}-tab-causality`} data-testid="panel-causality" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="btn-dataset-issues" onClick={() => handleSelectDataset("audit-issues")} className={`${PILL_BTN} ${datasetMode === "audit-issues" ? ACTIVE_TONE : IDLE_TONE}`}>
                {pick("모순 검출 시나리오 (EP.12)", "Contradiction Draft (EP.12)")}
              </button>
              <button type="button" data-testid="btn-dataset-clean" onClick={() => handleSelectDataset("clean-fixed")} className={`${PILL_BTN} ${datasetMode === "clean-fixed" ? ACTIVE_TONE : IDLE_TONE}`}>
                {pick("수정 완료본 비교 (S등급)", "Fixed Manuscript (Grade S)")}
              </button>
            </div>
            <p className="text-xs text-fg-2">{isKo ? causalityReport.summaryKo : causalityReport.summaryEn}</p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("인과 정합도", "Causality Score")}</div>
              <div data-testid="causality-integrity-score" className="mt-1 text-lg font-bold text-fg tabular-nums">
                {causalityReport.integrityScore} / 100 ({causalityReport.grade})
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("체호프 복선 회수율", "Payoff Rate")}</div>
              <div className="mt-1 text-lg font-bold text-fg tabular-nums">{causalityReport.chekhovSummary.payoffRatePct}%</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("치명 모순", "Critical Issues")}</div>
              <div data-testid="causality-critical-count" className="mt-1 text-lg font-bold text-bad tabular-nums">{causalityReport.criticalCount}</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("외형·소품·계절 오류", "Continuity Errors")}</div>
              <div className="mt-1 text-lg font-bold text-warn tabular-nums">
                {causalityReport.continuitySummary.scarInjuryMismatches + causalityReport.continuitySummary.propMismatches + causalityReport.continuitySummary.seasonMismatches}
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <h3 className="text-xs font-semibold text-fg">{pick("체호프의 총 복선·회수 DAG", "Chekhov's Gun Foreshadowing DAG")}</h3>
            <ul className="space-y-1.5">
              {causalityReport.dag.nodes.map((node) => (
                <li key={node.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-raised px-2.5 py-2 text-xs">
                  <div>
                    <span className="font-semibold text-fg">{isKo ? node.titleKo : node.titleEn}</span>
                    <span className="ml-2 text-[11px] text-fg-2 tabular-nums">
                      EP.{node.plantEpisode}#{node.plantCut} → {node.payoffEpisode !== null ? `EP.${node.payoffEpisode}#${node.payoffCut ?? 1}` : pick("미회수", "Unresolved")}
                    </span>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${dagStatusTone(node.status)}`}>
                    {node.status === "resolved" ? pick("회수 완료", "Resolved") : node.status === "unresolved" ? pick(`미회수 (+${node.episodesElapsed}화)`, `Open (+${node.episodesElapsed}ep)`) : node.status === "inverted" ? pick("시간선 역전", "Inverted") : pick("순환 모순", "Cyclic")}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <h3 className="text-xs font-semibold text-fg">
              {pick(`감지된 개연성·지식 격차·연속성 경고 (${causalityReport.warnings.length}건)`, `Detected Warnings (${causalityReport.warnings.length})`)}
            </h3>
            {causalityReport.warnings.length === 0 ? (
              <p data-testid="causality-clean-banner" className="flex items-center gap-1.5 rounded-md border border-good bg-good-soft px-3 py-2 text-xs font-medium text-good">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {pick("감지된 개연성 모순이 없습니다. 바로 연재 출고할 수 있습니다.", "Zero causality contradictions detected.")}
              </p>
            ) : (
              <ul className="space-y-2">
                {causalityReport.warnings.map((w) => (
                  <li key={w.warningId} data-testid={`warning-${w.kind}`} className="space-y-1 rounded-md border border-line bg-raised p-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-fg">{isKo ? w.titleKo : w.titleEn}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${severityBadgeTone(w.severity)}`}>
                        EP.{w.episode} #{w.cut} · {w.severity}
                      </span>
                    </div>
                    <p className="text-fg-2">{isKo ? w.detailKo : w.detailEn}</p>
                    <p className="text-[11px] font-medium text-accent">{pick("수정 제안: ", "Fix: ")}{isKo ? w.suggestionKo : w.suggestionEn}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === "simulpub" && (
        <div role="tabpanel" id={`${uid}-panel-simulpub`} aria-labelledby={`${uid}-tab-simulpub`} data-testid="panel-simulpub" className="space-y-4">
          <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-fg">{pick("5개국 동시 연재 말풍선 자동 리플로우", "5-Locale Speech Balloon Reflow")}</h3>
              <span data-testid="simulpub-face-overlap-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good tabular-nums">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {pick(`얼굴·눈 겹침 ${activeLocaleSummary.maxFaceOverlapAreaPx}px (5개국 전원 0px)`, `Face Overlap ${activeLocaleSummary.maxFaceOverlapAreaPx}px (0px all 5)`)}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {SIMULPUB_LOCALES.map((loc) => {
                const prof = LOCALE_EXPANSION_PROFILES[loc];
                return (
                  <button key={loc} type="button" data-testid={`locale-btn-${loc}`} onClick={() => handleSelectLocale(loc)} className={`${PILL_BTN} ${selectedLocale === loc ? ACTIVE_TONE : IDLE_TONE}`}>
                    <span>{isKo ? prof.labelKo : prof.labelEn}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div data-testid="simulpub-canvas-preview" aria-label={pick("합성 번역 말풍선 위치도 · 실제 폰트 조판 미검증", "Synthetic Balloon Layout Diagram · Font Layout Unverified")} className="relative h-72 w-full overflow-hidden rounded-lg border border-line bg-canvas">
                {DEFAULT_SIMULPUB_PANEL_INPUT.faceSafeBoxes.map((face) => (
                  <div
                    key={face.id}
                    style={{
                      left: `${(face.x / DEFAULT_SIMULPUB_PANEL_INPUT.canvasWidth) * 100}%`,
                      top: `${(face.y / DEFAULT_SIMULPUB_PANEL_INPUT.canvasHeight) * 100}%`,
                      width: `${(face.width / DEFAULT_SIMULPUB_PANEL_INPUT.canvasWidth) * 100}%`,
                      height: `${(face.height / DEFAULT_SIMULPUB_PANEL_INPUT.canvasHeight) * 100}%`,
                    }}
                    className="absolute flex items-center justify-center rounded-md border border-dashed border-bad bg-bad-soft p-1 text-center text-[10px] font-semibold text-bad"
                  >
                    {face.characterName}
                  </div>
                ))}
                {activeLocaleSummary.balloons.map((b) => (
                  <div
                    key={b.balloonId} data-testid={`reflow-balloon-${b.balloonId}`} data-writing-mode={b.writingMode}
                    style={{
                      left: `${(b.reflowedBox.x / DEFAULT_SIMULPUB_PANEL_INPUT.canvasWidth) * 100}%`,
                      top: `${(b.reflowedBox.y / DEFAULT_SIMULPUB_PANEL_INPUT.canvasHeight) * 100}%`,
                      width: `${(b.reflowedBox.width / DEFAULT_SIMULPUB_PANEL_INPUT.canvasWidth) * 100}%`,
                      height: `${(b.reflowedBox.height / DEFAULT_SIMULPUB_PANEL_INPUT.canvasHeight) * 100}%`,
                      writingMode: b.writingMode,
                    }}
                    className="absolute overflow-hidden rounded-md border border-accent bg-panel p-1 text-[9px] leading-tight text-fg shadow-sm"
                  >
                    {b.text}
                  </div>
                ))}
              </div>

              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-line bg-raised p-2">
                    <div className="text-[11px] text-fg-3">{pick("팽창 계수", "Expansion")}</div>
                    <div data-testid="simulpub-expansion-factor" className="font-bold text-fg tabular-nums">×{activeLocaleProfile.expansionFactor.toFixed(2)}</div>
                  </div>
                  <div className="rounded-md border border-line bg-raised p-2">
                    <div className="text-[11px] text-fg-3">{pick("조판 방향", "Writing Mode")}</div>
                    <div data-testid="simulpub-writing-mode" className="font-bold text-accent">
                      {activeLocaleProfile.writingMode === "vertical-rl" ? pick("세로쓰기 (tategaki)", "Vertical (tategaki)") : pick("가로쓰기 (horizontal)", "Horizontal")}
                    </div>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {activeLocaleSummary.balloons.map((b) => (
                    <li key={b.balloonId} className="rounded-md border border-line bg-raised px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-2 font-semibold text-fg">
                        <span>{b.balloonId} · {b.speaker}</span>
                        <span className="text-[11px] text-good tabular-nums">{pick("얼굴 겹침", "Face")} {b.faceOverlapAreaPx}px</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-fg-2 tabular-nums">
                        {b.reflowedBox.width}×{b.reflowedBox.height}px · {b.effectiveFontSizePx}px · {pick("이동", "Shift")} {b.displacementPx}px
                        {b.textOverflow ? pick(" · 텍스트 넘침: 재조판 필요", " · Text overflow: reflow required") : pick(" · 추정 수용량 내", " · Within estimated capacity")}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-fg-2">{b.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Fingerprint className="h-4 w-4 text-accent" aria-hidden="true" />
                <h3 className="text-xs font-semibold text-fg">{pick("공개 예제 키의 로컬 HMAC 검사 · 워터마크 예제", "Public Demo-Key HMAC Check & Watermark Example")}</h3>
              </div>
              <span
                data-testid="integrity-verify-status"
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${provenanceState.integrityCheck.integrityMatches ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad"}`}
              >
                {provenanceState.integrityCheck.integrityMatches ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                {provenanceState.integrityCheck.integrityMatches ? pick("합성 이미지·JSON·HMAC 일치 (C2PA 미지원)", "Synthetic Image, JSON & HMAC Match (No C2PA)") : pick("합성 이미지 무결성 불일치", "Synthetic Image Integrity Mismatch")}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor={`${uid}-creator-handle`} className="block text-[11px] font-medium text-fg-2">{pick("예시 식별자 핸들", "Example Identity Handle")}</label>
                <input
                  id={`${uid}-creator-handle`} type="text" value={creatorHandle}
                  onChange={(e) => setCreatorHandle(e.target.value)}
                  className={`min-h-11 w-full rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg ${FOCUS_RING}`}
                />
                <p className="text-[11px] text-fg-3">{pick("96×96 합성 이미지, 획수 1482·AI 비율 4%·생성일은 고정 예시입니다.", "Synthetic 96x96 image; 1482 strokes, 4% AI ratio and creation date are fixed examples.")}</p>
                <div className="space-y-1 rounded-md border border-line bg-raised p-2 text-[11px] text-fg-2">
                  <div className="truncate font-mono text-fg" data-testid="creator-did-web">{provenanceState.did.didWeb}</div>
                  <div className="truncate font-mono text-fg-3">SHA-256: {provenanceState.manifest.claim.assetSha256.slice(0, 32)}...</div>
                </div>
                <button
                  type="button" data-testid="btn-toggle-tamper" onClick={() => setSimulateTamper((prev) => !prev)}
                  className={`${PILL_BTN} w-full ${simulateTamper ? "border-bad bg-bad-soft text-bad" : IDLE_TONE}`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {simulateTamper ? pick("합성 이미지 바이트 되돌리기", "Restore Synthetic Image Bytes") : pick("합성 이미지 1바이트 변경", "Change One Synthetic Image Byte")}
                </button>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-medium text-fg-2">{pick("비가시 워터마크 크롭·보정 내성 검증", "Invisible Watermark Crop & Shift Test")}</div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" data-testid="btn-wm-full" onClick={() => setWatermarkMode("full")} className={`${PILL_BTN} ${watermarkMode === "full" ? ACTIVE_TONE : IDLE_TONE}`}>
                    {pick("원본 96×96", "Full 96x96")}
                  </button>
                  <button type="button" data-testid="btn-wm-crop-odd" onClick={() => setWatermarkMode("crop-odd")} className={`${PILL_BTN} ${watermarkMode === "crop-odd" ? ACTIVE_TONE : IDLE_TONE}`}>
                    <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
                    {pick("홀수 좌표 크롭 (19,23)", "Odd Crop (19,23)")}
                  </button>
                  <button type="button" data-testid="btn-wm-crop-bright" onClick={() => setWatermarkMode("crop-bright")} className={`${PILL_BTN} ${watermarkMode === "crop-bright" ? ACTIVE_TONE : IDLE_TONE}`}>
                    {pick("크롭 + 밝기 +14", "Crop + Bright +14")}
                  </button>
                </div>

                <div data-testid="watermark-verify-summary" className="space-y-1 rounded-md border border-line bg-raised p-2.5 text-[11px] tabular-nums">
                  <div className="flex items-center justify-between">
                    <span className="text-fg-2">{pick("워터마크 복원", "Watermark Recovery")}</span>
                    <span className={provenanceState.encoded.embeddingStatus === "embedded" && provenanceState.wmCheck.detected && provenanceState.wmCheck.crcValid && provenanceState.wmCheck.creatorTagMatched === true && provenanceState.wmCheck.assetTagMatched === true ? "font-semibold text-good" : "font-semibold text-bad"}>
                      {provenanceState.encoded.embeddingStatus === "embedded" && provenanceState.wmCheck.detected && provenanceState.wmCheck.crcValid && provenanceState.wmCheck.creatorTagMatched === true && provenanceState.wmCheck.assetTagMatched === true ? pick("CRC-16·예시 태그 일치 (신원 미검증)", "CRC-16 & Example Tags Match (Identity Unverified)") : pick("미검출 또는 기록 불가 이미지", "Not Detected or Unsupported Image")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-fg-2">
                    <span>PSNR / {pick("위상", "Phase")}</span>
                    <span className="font-mono text-fg">{provenanceState.encoded.psnrDb} dB · ({provenanceState.wmCheck.detectedPhaseX}, {provenanceState.wmCheck.detectedPhaseY})</span>
                  </div>
                  <div className="flex items-center justify-between text-fg-2">
                    <span>{pick("복원 페이로드", "Recovered Payload")}</span>
                    <span className="font-mono text-fg">{provenanceState.wmCheck.recoveredPayloadHex ?? "-"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "heatmap" && (
        <div role="tabpanel" id={`${uid}-panel-heatmap`} aria-labelledby={`${uid}-tab-heatmap`} data-testid="panel-heatmap" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {DEFAULT_SCROLL_EPISODE_PRESETS.map((preset, idx) => (
                <button key={preset.episodeId} type="button" data-testid={`preset-episode-${preset.episodeId}`} onClick={() => handleSelectEpisode(idx)} className={`${PILL_BTN} ${selectedEpisodeIdx === idx ? ACTIVE_TONE : IDLE_TONE}`}>
                  {isKo ? preset.titleKo : preset.titleEn}
                </button>
              ))}
            </div>
            <span className="text-xs text-fg-2 tabular-nums">
              {heatmapReport.viewportWidthPx}×{heatmapReport.viewportHeightPx} ({heatmapReport.aspectRatioLabel}) · {heatmapReport.screenCount} {pick("화면", "screens")}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("평균 이탈 위험", "Avg Drop-Off Risk")}</div>
              <div data-testid="heatmap-avg-risk" className="mt-1 text-lg font-bold text-fg tabular-nums">{heatmapReport.averageDropOffRisk} / 100</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("대사 텍스트 벽", "Word-Wall Cuts")}</div>
              <div data-testid="heatmap-wordwall-count" className="mt-1 text-lg font-bold text-bad tabular-nums">{heatmapReport.wordWallPanelCount} {pick("컷", "cuts")}</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("클리프행어 훅", "Cliffhanger Hook")}</div>
              <div data-testid="heatmap-cliffhanger-score" className="mt-1 text-lg font-bold text-accent tabular-nums">{heatmapReport.cliffhangerHookScore} / 100</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("규칙 모델 잔존율 (실측 아님)", "Rule-Model Retention (Not Measured)")}</div>
              <div className="mt-1 text-lg font-bold text-good tabular-nums">{heatmapReport.estimatedCompletionRetentionPct}%</div>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <h3 className="text-xs font-semibold text-fg">{pick("구간별 스크롤 피로 · 이탈 위험 히트맵", "Segment Scroll Fatigue & Drop-Off Heatmap")}</h3>
            <ul className="space-y-2">
              {heatmapReport.segments.map((seg) => (
                <li key={seg.panelId} data-testid={`heatmap-seg-${seg.panelId}`} className="space-y-1 rounded-md border border-line bg-raised p-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-fg">#{seg.panelIndex} {isKo ? seg.labelKo : seg.labelEn}</span>
                    <div className="flex items-center gap-1.5 tabular-nums">
                      {seg.isWordWall && <span className="rounded-full border border-bad bg-bad-soft px-2 py-0.5 text-[10px] font-semibold text-bad">{pick("대사 벽", "Word-Wall")}</span>}
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${riskBandTone(seg.riskBand)}`}>{pick("위험", "Risk")} {seg.dropOffRisk}</span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-canvas">
                    <div style={{ width: `${seg.dropOffRisk}%` }} className={`h-full rounded-full transition-all motion-reduce:transition-none ${riskBarFillTone(seg.riskBand)}`} />
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-[11px] text-fg-2 tabular-nums">
                    <span>{pick("밀도", "Density")} {seg.panelsPerScreen} · {pick("여백 호흡", "Gutter")} {seg.gutterBreathScore}</span>
                    <span>{pick("누적 피로", "Fatigue")} {seg.cumulativeFatigue} · {pick("잔존", "Ret.")} {seg.estimatedRetentionPct}%</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Music2 className="h-4 w-4 text-accent" aria-hidden="true" />
                <h3 className="text-xs font-semibold text-fg">{pick("스크롤 비트 동기화 BGM/SFX 큐 시트", "Scroll-Beat Synchronized BGM/SFX Cue Sheet")}</h3>
              </div>
              <span className="text-[11px] text-fg-2 tabular-nums">BGM {heatmapReport.cueSheet.bgmRegions.length} · SFX {heatmapReport.cueSheet.sfxBeats.length}</span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`${uid}-scroll-scrub`} className="flex items-center justify-between text-[11px] font-medium text-fg-2 tabular-nums">
                <span>{pick("독자 스크롤 위치 시뮬레이션", "Simulated Scroll Position")}</span>
                <span data-testid="scroll-beat-position">scrollY {beatSnapshot.scrollY}px ({beatSnapshot.scrollPct}%)</span>
              </label>
              <input
                id={`${uid}-scroll-scrub`} data-testid="scroll-beat-slider" type="range" min={0}
                max={Math.max(100, heatmapReport.totalScrollHeightPx)} step={20} value={clampedScrollY}
                onChange={(e) => setScrollY(Number(e.target.value))}
                className={`min-h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
              />
            </div>

            <div data-testid="scroll-beat-readout" className="grid grid-cols-1 gap-2 rounded-md border border-line bg-raised p-2.5 text-xs sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-fg-3">{pick("활성 BGM 트랙", "Active BGM Track(s)")}</div>
                {beatSnapshot.activeBgmCues.length === 0 ? (
                  <div className="text-fg-2">{pick("대기 중", "Idle")}</div>
                ) : (
                  beatSnapshot.activeBgmCues.map((bgm) => (
                    <div key={bgm.cueId} className="text-fg tabular-nums">
                      {isKo ? bgm.trackTitleKo : bgm.trackTitleEn} · {bgm.bpm} BPM · {Math.round(bgm.effectiveGain * 100)}% ({bgm.phase})
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-fg-3">{pick("동기화 SFX 비트 · 덕킹", "Synced SFX Beats & Ducking")}</div>
                {beatSnapshot.triggeredSfxBeats.length === 0 ? (
                  <div className="text-fg-2">{pick("트리거 없음 (덕킹 0dB)", "No beat (0dB duck)")}</div>
                ) : (
                  beatSnapshot.triggeredSfxBeats.map((sfx) => (
                    <div key={sfx.cueId} className="text-accent tabular-nums">
                      #{sfx.panelIndex} {isKo ? sfx.labelKo : sfx.labelEn} ({sfx.bgmDuckingDb}dB)
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {heatmapReport.suggestions.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-line bg-card p-3">
              <h3 className="text-xs font-semibold text-fg">{pick(`자동 리듬 개선 처방 (${heatmapReport.suggestions.length}건)`, `Pacing Suggestions (${heatmapReport.suggestions.length})`)}</h3>
              <ul className="space-y-1.5">
                {heatmapReport.suggestions.slice(0, 5).map((sug) => (
                  <li key={sug.suggestionId} className="rounded-md border border-line bg-raised px-2.5 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2 font-semibold text-fg">
                      <span>{isKo ? sug.titleKo : sug.titleEn}</span>
                      <span className="text-[11px] text-good tabular-nums">-{sug.expectedRiskReduction} {pick("위험", "risk")}</span>
                    </div>
                    <p className="mt-0.5 text-fg-2">{isKo ? sug.detailKo : sug.detailEn}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
