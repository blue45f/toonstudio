/**
 * Wave 39C — 상업 연재 프로 웹툰 스튜디오 8대 전문 엔진 통합 워크벤치 패널.
 *
 * - 탭 1: 비파괴 3층 채색 리라이트(정오·노을·네온·달빛·실내등) + 컷 밖 돌파 마스킹
 * - 탭 2: 작품 전역 말풍선·식자 스타일시트 토큰 일괄 전파 + 라이브 컷 잠금 어시스턴트 핸드오프
 * - 탭 3: 굿즈 칼선/CMYK TAC<=300% + 무드보드→화각/3D LUT + .tsmacro 매크로 + 공모전·출판사 투고팩
 * - Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건 · Web Storage 0건 · props = {} 미사용).
 */

import {
  AlertTriangle, Camera, CheckCircle2, FileArchive, Layers, Lock, Play, Plus, Scissors, Send, Sparkles, Sun, Type, Users,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import {
  SUBMISSION_TARGET_SPECS, buildGoodsDieCutPackage, buildSubmissionPackage, createDefaultProTsMacro,
  createDemoMoodboardSample, createGoodsInkSampleBuffer, createMacroRecorder, createPresetSubmissionInput,
  extractMoodboardCameraLut, finalizeTsMacro, parseAndValidateTsMacro, recordMacroStep, replayTsMacro,
  serializeTsMacro, type GoodsTemplateKind, type MacroReplayReport, type MoodboardPresetId,
  type SubmissionEpisodeInput, type SubmissionPackageManifest, type SubmissionTargetId, type TsMacroDocument,
} from "./goods-macro-submission-engine";
import {
  DEFAULT_BREAKOUT_LAYERS_FIXTURE, DEFAULT_PANEL_FRAME_FIXTURE, RELIGHT_PRESETS,
  compositeThreeLayerRelight, computePanelBreakoutMasks, createDemoThreeLayerScene,
  getRelightPresetById, toggleLayerBreakoutFlag, type PanelBreakoutLayerInput,
  type RelightCompositeResult, type RelightPresetId,
} from "./relight-breakout-engine";
import {
  CUT_PIPELINE_STAGES, DEFAULT_HANDOFF_CUT_IDS, LETTERING_FONT_CATALOG, STUDIO_ASSISTANT_ROSTER,
  acquireCutStageLock, auditEpisodeTypographyConsistency, createDefaultEpisodeBalloons,
  createDefaultLetteringTokens, createInitialCutHandoffState, getStageLabelKo, handoffCutStage,
  summarizeCutHandoffBoard, updateTokenAndPropagate, type CutHandoffBoardState, type CutPipelineStage,
  type EpisodeBalloonNode, type LetteringStyleToken, type TokenPropagationReport,
} from "./typography-handoff-engine";

export type ProCommercialTabId = "relight-breakout" | "typography-handoff" | "goods-macro-submission";

export interface StudioProCommercialPanelProps {
  readonly initialTab?: ProCommercialTabId;
  readonly className?: string;
  readonly onRelightApplied?: (result: RelightCompositeResult) => void;
  readonly onTokenPropagated?: (report: TokenPropagationReport) => void;
  readonly onSubmissionBuilt?: (manifest: SubmissionPackageManifest) => void;
}

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_SOLID = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const INPUT_CLS = `min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`;
const SELECT_CLS = `min-h-11 w-full rounded-lg border border-line bg-raised px-2.5 py-2 text-xs text-fg ${FOCUS_RING}`;

const PREVIEW_W = 160;
const PREVIEW_H = 104;
const BASE_HANDOFF_CLOCK_MS = 1764000000000;

const TABS: readonly { readonly id: ProCommercialTabId; readonly label: string }[] = [
  { id: "relight-breakout", label: "3층 리라이트 · 컷 돌파" },
  { id: "typography-handoff", label: "식자 토큰 · 어시 핸드오프" },
  { id: "goods-macro-submission", label: "굿즈 칼선 · 매크로 · 투고팩" },
];
const MOODBOARD_OPTIONS: readonly { readonly id: MoodboardPresetId; readonly label: string }[] = [
  { id: "neon-chase", label: "네온 도심 추격전" },
  { id: "sunset-romance", label: "황혼 교실 로맨스" },
  { id: "thriller-alley", label: "우천 골목 서스펜스" },
];
const SUBMISSION_TARGETS: readonly SubmissionTargetId[] = ["naver-webtoon", "kakao-page", "lezhin", "print-tankobon"];

interface SliderFieldProps {
  readonly id: string;
  readonly label: string;
  readonly valueText: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly onChange: (next: number) => void;
}

function SliderField({ id, label, valueText, value, min, max, step = 1, onChange }: SliderFieldProps): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-xs">
        <label htmlFor={id} className="font-medium text-fg-2">{label}</label>
        <span className="font-semibold text-fg tabular-nums">{valueText}</span>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
      />
    </div>
  );
}

function MetricBox({ label, value, testId, mono = false }: {
  readonly label: string;
  readonly value: string;
  readonly testId?: string;
  readonly mono?: boolean;
}): ReactElement {
  return (
    <div className="rounded-lg border border-line bg-canvas p-2.5 text-xs tabular-nums">
      <div className="text-[11px] text-fg-3">{label}</div>
      <div data-testid={testId} className={`truncate font-bold text-fg ${mono ? "font-mono text-[11px]" : ""}`}>{value}</div>
    </div>
  );
}

function paintRgbaCanvas(canvas: HTMLCanvasElement | null, rgba: Uint8ClampedArray, width: number, height: number): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof ctx.createImageData !== "function" || typeof ctx.putImageData !== "function") return;
  const img = ctx.createImageData(width, height);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
}

export function StudioProCommercialPanel({
  initialTab = "relight-breakout",
  className,
  onRelightApplied,
  onTokenPropagated,
  onSubmissionBuilt,
}: StudioProCommercialPanelProps): ReactElement {
  const uid = useId();
  const [activeTab, setActiveTab] = useState<ProCommercialTabId>(initialTab);
  const [statusBanner, setStatusBanner] = useState<string>("");

  // 엔진 1·2 상태
  const [relightPreset, setRelightPreset] = useState<RelightPresetId>("sunset");
  const [shadowPct, setShadowPct] = useState<number>(100);
  const [keyGainPct, setKeyGainPct] = useState<number>(105);
  const [bounceGainPct, setBounceGainPct] = useState<number>(100);
  const [exposureStep, setExposureStep] = useState<number>(0);
  const [gutterBleedPx, setGutterBleedPx] = useState<number>(DEFAULT_PANEL_FRAME_FIXTURE.gutterBleedPx);
  const [breakoutLayers, setBreakoutLayers] = useState<readonly PanelBreakoutLayerInput[]>(DEFAULT_BREAKOUT_LAYERS_FIXTURE);
  const relightCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const demoScene = useMemo(() => createDemoThreeLayerScene(PREVIEW_W, PREVIEW_H), []);
  const relightResult = useMemo<RelightCompositeResult>(
    () => compositeThreeLayerRelight(demoScene, relightPreset, { shadowStrength: shadowPct / 100, keyGain: keyGainPct / 100, bounceGain: bounceGainPct / 100, exposureBias: exposureStep / 10 }),
    [bounceGainPct, demoScene, exposureStep, keyGainPct, relightPreset, shadowPct],
  );
  const activeRelightSpec = useMemo(() => getRelightPresetById(relightPreset), [relightPreset]);
  useEffect(() => {
    paintRgbaCanvas(relightCanvasRef.current, relightResult.rgba, relightResult.width, relightResult.height);
  }, [relightResult]);

  const breakoutReport = useMemo(
    () => computePanelBreakoutMasks({ ...DEFAULT_PANEL_FRAME_FIXTURE, gutterBleedPx }, breakoutLayers),
    [breakoutLayers, gutterBleedPx],
  );

  // 엔진 3·4 상태
  const [tokens, setTokens] = useState<readonly LetteringStyleToken[]>(() => createDefaultLetteringTokens());
  const [balloons, setBalloons] = useState<readonly EpisodeBalloonNode[]>(() => createDefaultEpisodeBalloons());
  const [selectedTokenId, setSelectedTokenId] = useState<string>("tok-seoyeon-shout");
  const selectedToken = useMemo(() => tokens.find((t) => t.tokenId === selectedTokenId) ?? tokens[0]!, [selectedTokenId, tokens]);
  const [draftFont, setDraftFont] = useState<string>(selectedToken.fontFamily);
  const [draftFontSize, setDraftFontSize] = useState<number>(selectedToken.fontSizePx);
  const [draftTrackingPct, setDraftTrackingPct] = useState<number>(Math.round(selectedToken.letterSpacingEm * 100));
  const [draftLineHeightPct, setDraftLineHeightPct] = useState<number>(Math.round(selectedToken.lineHeight * 100));
  const [draftStrokeTenth, setDraftStrokeTenth] = useState<number>(Math.round(selectedToken.strokeWidthPx * 10));
  const [draftTailPct, setDraftTailPct] = useState<number>(Math.round(selectedToken.tailCurvature * 100));
  const [lastPropagation, setLastPropagation] = useState<TokenPropagationReport | null>(null);
  const typographyAudit = useMemo(() => auditEpisodeTypographyConsistency(tokens, balloons), [balloons, tokens]);

  const [handoffBoard, setHandoffBoard] = useState<CutHandoffBoardState>(() => createInitialCutHandoffState(BASE_HANDOFF_CLOCK_MS));
  const [handoffClockMs, setHandoffClockMs] = useState<number>(BASE_HANDOFF_CLOCK_MS + 60000);
  const [selectedCutId, setSelectedCutId] = useState<string>("CUT-01");
  const [selectedStage, setSelectedStage] = useState<CutPipelineStage>("lineart");
  const [selectedHolderId, setSelectedHolderId] = useState<string>("member-flat");
  const handoffSummary = useMemo(() => summarizeCutHandoffBoard(handoffBoard, handoffClockMs), [handoffBoard, handoffClockMs]);

  // 엔진 5·6·7·8 상태
  const [goodsKind, setGoodsKind] = useState<GoodsTemplateKind>("acrylic-stand");
  const [goodsWhiteBorderMm, setGoodsWhiteBorderMm] = useState<number>(2.0);
  const [goodsBleedMm, setGoodsBleedMm] = useState<number>(3.0);
  const [goodsKeyringHole, setGoodsKeyringHole] = useState<boolean>(true);
  const [goodsInkMode, setGoodsInkMode] = useState<"safe" | "heavy-black">("safe");
  const goodsPackage = useMemo(
    () => buildGoodsDieCutPackage({
      kind: goodsKind, title: goodsKind === "acrylic-stand" ? "은월의 기록 · 서연 아크릴 스탠드" : "은월의 기록 · 한정 포토카드",
      dpi: 300, whiteBorderMm: goodsWhiteBorderMm, bleedMm: goodsBleedMm, cornerRadiusMm: 3.0,
      keyringHoleEnabled: goodsKeyringHole, samplePixelsRgba: createGoodsInkSampleBuffer(goodsInkMode, 96),
    }),
    [goodsBleedMm, goodsInkMode, goodsKeyringHole, goodsKind, goodsWhiteBorderMm],
  );

  const [moodPreset, setMoodPreset] = useState<MoodboardPresetId>("neon-chase");
  const moodRecipe = useMemo(() => extractMoodboardCameraLut(createDemoMoodboardSample(moodPreset)), [moodPreset]);
  const [macroDoc, setMacroDoc] = useState<TsMacroDocument>(() => createDefaultProTsMacro());
  const [macroReplay, setMacroReplay] = useState<MacroReplayReport | null>(null);
  const [submissionTarget, setSubmissionTarget] = useState<SubmissionTargetId>("naver-webtoon");
  const [submissionInput, setSubmissionInput] = useState<SubmissionEpisodeInput>(() => createPresetSubmissionInput("naver-webtoon"));
  const submissionManifest = useMemo(() => buildSubmissionPackage(submissionTarget, submissionInput), [submissionInput, submissionTarget]);

  const handleSelectRelight = (presetId: RelightPresetId): void => {
    setRelightPreset(presetId);
    const next = compositeThreeLayerRelight(demoScene, presetId, { shadowStrength: shadowPct / 100, keyGain: keyGainPct / 100, bounceGain: bounceGainPct / 100, exposureBias: exposureStep / 10 });
    onRelightApplied?.(next);
    setStatusBanner(`3층 리라이트 프리셋을 「${getRelightPresetById(presetId).labelKo}」 조명으로 전환했습니다.`);
  };

  const handleToggleBreakout = (layerId: string): void => {
    setBreakoutLayers((prev) => toggleLayerBreakoutFlag(prev, layerId));
    setStatusBanner("컷 밖 돌파 마스킹 플래그를 갱신했습니다.");
  };

  const handleSelectToken = (tokenId: string): void => {
    const found = tokens.find((t) => t.tokenId === tokenId);
    if (!found) return;
    setSelectedTokenId(tokenId);
    setDraftFont(found.fontFamily);
    setDraftFontSize(found.fontSizePx);
    setDraftTrackingPct(Math.round(found.letterSpacingEm * 100));
    setDraftLineHeightPct(Math.round(found.lineHeight * 100));
    setDraftStrokeTenth(Math.round(found.strokeWidthPx * 10));
    setDraftTailPct(Math.round(found.tailCurvature * 100));
  };

  const handlePropagateToken = (): void => {
    const report = updateTokenAndPropagate(tokens, balloons, selectedTokenId, {
      fontFamily: draftFont, fontSizePx: draftFontSize, letterSpacingEm: draftTrackingPct / 100,
      lineHeight: draftLineHeightPct / 100, strokeWidthPx: draftStrokeTenth / 10, tailCurvature: draftTailPct / 100,
    });
    setTokens(report.updatedTokens);
    setBalloons(report.updatedBalloons);
    setLastPropagation(report);
    onTokenPropagated?.(report);
    setStatusBanner(report.summaryKo);
  };

  const handleAcquireLock = (): void => {
    const member = STUDIO_ASSISTANT_ROSTER.find((m) => m.id === selectedHolderId) ?? STUDIO_ASSISTANT_ROSTER[0]!;
    const nextNow = handoffClockMs + 30000;
    const outcome = acquireCutStageLock(handoffBoard, { cutId: selectedCutId, stage: selectedStage, holderId: member.id, holderName: member.name, leaseDurationMs: 3600000, nowMs: nextNow });
    setHandoffClockMs(nextNow);
    setHandoffBoard(outcome.state);
    if (outcome.ok && outcome.lease) setStatusBanner(`${selectedCutId} [${getStageLabelKo(selectedStage)}] 잠금을 ${member.name} 님에게 임대했습니다.`);
    else if (outcome.conflict) setStatusBanner(`충돌 감지: ${outcome.conflict.reasonKo}`);
  };

  const handleHandoffStage = (): void => {
    const activeLease = handoffSummary.activeLeases.find((l) => l.cutId === selectedCutId && l.stage === selectedStage);
    const receiver = STUDIO_ASSISTANT_ROSTER.find((m) => m.id === selectedHolderId) ?? STUDIO_ASSISTANT_ROSTER[1]!;
    const nextNow = handoffClockMs + 45000;
    const outcome = handoffCutStage(handoffBoard, {
      cutId: selectedCutId, fromStage: selectedStage,
      fromMemberId: activeLease?.holderId ?? "member-main", fromMemberName: activeLease?.holderName ?? "김도현 (메인작가)",
      toMemberId: receiver.id, toMemberName: receiver.name, nowMs: nextNow, checklistPassed: true,
    });
    setHandoffClockMs(nextNow);
    setHandoffBoard(outcome.state);
    if (outcome.ok && outcome.receipt) setStatusBanner(`인수인계 영수증 ${outcome.receipt.receiptId} 발급 완료 (체크섬 ${outcome.receipt.checksum}).`);
    else if (outcome.errorKo) setStatusBanner(outcome.errorKo);
  };

  const handleAppendMacroStep = (): void => {
    let rec = createMacroRecorder(macroDoc.name);
    for (const s of macroDoc.steps) rec = recordMacroStep(rec, s.action, s.labelKo, s.params, s.enabled);
    rec = recordMacroStep(rec, "export-goods-diecut", `${goodsKind === "acrylic-stand" ? "아크릴 스탠드" : "포토카드"} 칼선 패키지 출력`, { kind: goodsKind, dpi: 300 });
    const nextDoc = finalizeTsMacro(rec, macroDoc.descriptionKo);
    setMacroDoc(nextDoc);
    setStatusBanner(`.tsmacro 단계 추가 완료 (총 ${nextDoc.steps.length}단계 · 체크섬 ${nextDoc.checksum}).`);
  };

  const handleReplayMacro = (): void => {
    const parsed = parseAndValidateTsMacro(serializeTsMacro(macroDoc));
    if (!parsed.validation.valid || !parsed.document) {
      setStatusBanner(`매크로 검증 실패: ${parsed.validation.errors.join(" ")}`);
      return;
    }
    const report = replayTsMacro(parsed.document);
    setMacroReplay(report);
    setStatusBanner(`.tsmacro 일괄 리플레이 완료: ${report.executedCount}/${report.totalSteps}단계 실행 성공.`);
  };

  const handleSelectSubmissionTarget = (targetId: SubmissionTargetId): void => {
    setSubmissionTarget(targetId);
    const preset = createPresetSubmissionInput(targetId);
    setSubmissionInput(preset);
    onSubmissionBuilt?.(buildSubmissionPackage(targetId, preset));
    setStatusBanner(`${SUBMISSION_TARGET_SPECS[targetId].labelKo} 규격 프로파일을 불러왔습니다.`);
  };

  return (
    <section
      data-testid="studio-pro-commercial-panel"
      aria-label="상업 연재 프로 웹툰 8대 전문 엔진 스튜디오"
      className={`flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-fg">상업 연재 프로 웹툰 8대 전문 엔진</h2>
          </div>
          <p className="text-xs text-fg-2">
            3층 비파괴 리라이트 · 컷 돌파 마스킹 · 전역 식자 토큰 · 어시 컷 잠금 핸드오프 · 굿즈 칼선/CMYK · 무드보드 LUT · .tsmacro · 플랫폼 투고팩을 온디바이스로 실행합니다.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-3 py-1 text-xs font-semibold text-good tabular-nums">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> 8대 상업 엔진 · 로컬 결정론
        </span>
      </header>

      <div role="tablist" aria-label="프로 상업 스튜디오 워크벤치 탭" className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id} id={`${uid}-tab-${tab.id}`} data-testid={`pro-tab-${tab.id}`} type="button" role="tab"
            aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? BTN_SOLID : BTN_OUTLINE}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {statusBanner ? (
        <div role="status" aria-live="polite" data-testid="pro-commercial-status" className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-xs font-semibold text-accent">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{statusBanner}</span>
        </div>
      ) : null}

      {activeTab === "relight-breakout" ? (
        <div id={`${uid}-panel-relight-breakout`} role="tabpanel" aria-labelledby={`${uid}-tab-relight-breakout`} className="flex flex-col gap-5">
          <article className="flex flex-col gap-4 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Sun className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">1. 비파괴 3층 채색 리라이트 (Albedo · Shadow · Bounce/Key)</h3></div>
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent tabular-nums">{activeRelightSpec.labelKo} · {activeRelightSpec.kelvin}K</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {RELIGHT_PRESETS.map((preset) => (
                <button key={preset.id} data-testid={`relight-preset-${preset.id}`} type="button" aria-pressed={relightPreset === preset.id} onClick={() => handleSelectRelight(preset.id)} className={relightPreset === preset.id ? BTN_SOLID : BTN_OUTLINE}>
                  <span className="h-3 w-3 rounded-full border border-line-strong" style={{ backgroundColor: preset.previewOklch }} aria-hidden="true" />
                  {preset.labelKo}
                </button>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-canvas p-3">
                <canvas ref={relightCanvasRef} width={PREVIEW_W} height={PREVIEW_H} data-testid="relight-preview-canvas" aria-label={`${activeRelightSpec.labelKo} 3층 리라이트 합성 프리뷰`} className="h-40 w-full rounded-lg border border-line object-contain" />
                <p className="text-xs text-fg-2">{activeRelightSpec.descriptionKo}</p>
              </div>
              <div className="flex flex-col justify-between gap-3">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <SliderField id={`${uid}-shadow`} label="그림자 밀도" valueText={`${shadowPct}%`} value={shadowPct} min={20} max={180} onChange={setShadowPct} />
                  <SliderField id={`${uid}-key`} label="키라이트 강도" valueText={`${keyGainPct}%`} value={keyGainPct} min={0} max={180} onChange={setKeyGainPct} />
                  <SliderField id={`${uid}-bounce`} label="반사광 · 림라이트" valueText={`${bounceGainPct}%`} value={bounceGainPct} min={0} max={180} onChange={setBounceGainPct} />
                  <SliderField id={`${uid}-ev`} label="노출 보정(EV)" valueText={`${(exposureStep / 10).toFixed(1)} EV`} value={exposureStep} min={-10} max={10} onChange={setExposureStep} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <MetricBox label="평균 휘도" testId="relight-mean-luma" value={`${(relightResult.metrics.meanLuminance * 100).toFixed(1)}%`} />
                  <MetricBox label="하이라이트 클립" value={`${relightResult.metrics.highlightClippedPct}%`} />
                  <MetricBox label="대표 OKLCH" value={relightResult.metrics.dominantOklch} mono />
                </div>
              </div>
            </div>
          </article>

          <article className="flex flex-col gap-4 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">2. 컷 밖 돌파 마스킹 (Out-of-Panel Breakout)</h3></div>
              <span data-testid="breakout-summary-badge" className="rounded-full bg-good-soft px-2.5 py-1 text-xs font-semibold text-good tabular-nums">활성 돌파 {breakoutReport.activeBreakoutCount}개 · 수동 지우개 {breakoutReport.manualEraserStrokesSaved}획 절감</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <SliderField id={`${uid}-gutter`} label="여백 안전 돌파 허용 폭" valueText={`${gutterBleedPx}px`} value={gutterBleedPx} min={8} max={64} onChange={setGutterBleedPx} />
                {breakoutReport.layers.map((plan) => (
                  <div key={plan.layerId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-xs">
                    <div>
                      <div className="font-semibold text-fg">{plan.layerName}</div>
                      <div className="text-[11px] text-fg-2 tabular-nums">
                        {plan.mode === "breakout-union" ? `돌파 합집합 · 오버플로 ${plan.overflowAreaPx2}px² (${(plan.overflowRatio * 100).toFixed(0)}%)` : "컷 경계 내부 클립 유지"}
                      </div>
                    </div>
                    <button type="button" data-testid={`breakout-toggle-${plan.layerId}`} aria-pressed={plan.breakoutEnabled} onClick={() => handleToggleBreakout(plan.layerId)} className={plan.breakoutEnabled ? BTN_SOLID : BTN_OUTLINE}>
                      {plan.breakoutEnabled ? "돌파 ON" : "돌파 OFF"}
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-col justify-between gap-2 rounded-xl border border-line bg-canvas p-3">
                <svg viewBox="0 0 320 240" role="img" aria-label="컷 프레임 및 돌파 안전 클립 마스크 도식" className="h-48 w-full rounded-lg border border-line bg-raised">
                  <rect x={breakoutReport.safeBreakoutEnvelope.x} y={breakoutReport.safeBreakoutEnvelope.y} width={breakoutReport.safeBreakoutEnvelope.width} height={breakoutReport.safeBreakoutEnvelope.height} fill="none" stroke="currentColor" strokeDasharray="4 4" className="text-fg-3" />
                  <rect x={breakoutReport.panelFrame.x} y={breakoutReport.panelFrame.y} width={breakoutReport.panelFrame.width} height={breakoutReport.panelFrame.height} fill="none" stroke="currentColor" strokeWidth={2} className="text-fg" />
                  {breakoutReport.layers.filter((l) => l.overflowRect !== null).map((l) => (
                    <rect key={l.layerId} x={l.overflowRect!.x} y={l.overflowRect!.y} width={l.overflowRect!.width} height={l.overflowRect!.height} fill="none" stroke="currentColor" strokeWidth={2} className="text-accent" />
                  ))}
                </svg>
                <p className="text-[11px] text-fg-2">실선 테두리는 컷 프레임, 점선은 페이지 안전 여백, 강조 박스는 수동 지우개 없이 계산된 돌파 합집합 클립 영역입니다.</p>
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === "typography-handoff" ? (
        <div id={`${uid}-panel-typography-handoff`} role="tabpanel" aria-labelledby={`${uid}-tab-typography-handoff`} className="flex flex-col gap-5">
          <article className="flex flex-col gap-4 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Type className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">3. 작품 전역 말풍선 · 식자 스타일시트 토큰</h3></div>
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent tabular-nums">일치율 {typographyAudit.compliancePct}% ({typographyAudit.syncedCount}/{typographyAudit.totalBalloons})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {tokens.map((tok) => (
                <button key={tok.tokenId} data-testid={`token-chip-${tok.tokenId}`} type="button" aria-pressed={selectedTokenId === tok.tokenId} onClick={() => handleSelectToken(tok.tokenId)} className={selectedTokenId === tok.tokenId ? BTN_SOLID : BTN_OUTLINE}>
                  {tok.labelKo} <span className="tabular-nums opacity-80">v{tok.version}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor={`${uid}-font`} className="mb-1 block text-xs font-medium text-fg-2">폰트 패밀리</label>
                <select id={`${uid}-font`} value={draftFont} onChange={(e) => setDraftFont(e.target.value)} className={SELECT_CLS}>
                  {LETTERING_FONT_CATALOG.map((f) => (<option key={f} value={f}>{f}</option>))}
                </select>
              </div>
              <div>
                <label htmlFor={`${uid}-fsize`} className="mb-1 block text-xs font-medium text-fg-2">글자 크기 (<span className="tabular-nums">{draftFontSize}px</span>)</label>
                <input id={`${uid}-fsize`} data-testid="token-fontsize-input" type="number" min={12} max={64} value={draftFontSize} onChange={(e) => setDraftFontSize(Number(e.target.value))} className={INPUT_CLS} />
              </div>
              <SliderField id={`${uid}-track`} label="자간" valueText={`${(draftTrackingPct / 100).toFixed(2)}em`} value={draftTrackingPct} min={-8} max={18} onChange={setDraftTrackingPct} />
              <SliderField id={`${uid}-lh`} label="행간" valueText={(draftLineHeightPct / 100).toFixed(2)} value={draftLineHeightPct} min={110} max={190} onChange={setDraftLineHeightPct} />
              <SliderField id={`${uid}-stroke`} label="외곽선" valueText={`${(draftStrokeTenth / 10).toFixed(1)}px`} value={draftStrokeTenth} min={0} max={60} onChange={setDraftStrokeTenth} />
              <SliderField id={`${uid}-tail`} label="꼬리 곡률" valueText={(draftTailPct / 100).toFixed(2)} value={draftTailPct} min={-100} max={100} onChange={setDraftTailPct} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" data-testid="propagate-token-btn" onClick={handlePropagateToken} className={BTN_SOLID}><Type className="h-3.5 w-3.5" aria-hidden="true" /> 회차 전체 매칭 말풍선 일괄 적용</button>
              {lastPropagation ? <span data-testid="token-diff-summary" className="text-xs font-semibold text-good tabular-nums">{lastPropagation.summaryKo} (diff {lastPropagation.diffs.length}건)</span> : null}
            </div>
            {lastPropagation && lastPropagation.diffs.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {lastPropagation.diffs.map((entry) => (
                  <div key={entry.balloonId} className="rounded-lg border border-line bg-canvas p-2.5 text-xs">
                    <div className="flex items-center justify-between font-bold text-fg tabular-nums"><span>{entry.balloonId} · CUT #{entry.cutNumber}</span><span className="text-[11px] font-medium text-accent">{entry.changedFields.length}개 변경</span></div>
                    <ul className="mt-1 space-y-0.5 text-[11px] text-fg-2 tabular-nums">
                      {entry.changedFields.slice(0, 3).map((d) => (<li key={d.field}>{d.field}: {String(d.before)} → {String(d.after)}</li>))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </article>

          <article className="flex flex-col gap-4 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">4. 라이브 컷 잠금 어시스턴트 핸드오프</h3></div>
              <span className="rounded-full bg-good-soft px-2.5 py-1 text-xs font-semibold text-good tabular-nums">활성 잠금 {handoffSummary.activeLeases.length} · 영수증 {handoffSummary.receiptCount} · 충돌 {handoffSummary.conflictCount}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor={`${uid}-cut`} className="mb-1 block text-xs font-medium text-fg-2">대상 컷</label>
                <select id={`${uid}-cut`} data-testid="handoff-cut-select" value={selectedCutId} onChange={(e) => setSelectedCutId(e.target.value)} className={SELECT_CLS}>
                  {DEFAULT_HANDOFF_CUT_IDS.map((cid) => (<option key={cid} value={cid}>{cid}</option>))}
                </select>
              </div>
              <div>
                <label htmlFor={`${uid}-stage`} className="mb-1 block text-xs font-medium text-fg-2">공정 (선화~식자)</label>
                <select id={`${uid}-stage`} data-testid="handoff-stage-select" value={selectedStage} onChange={(e) => setSelectedStage(e.target.value as CutPipelineStage)} className={SELECT_CLS}>
                  {CUT_PIPELINE_STAGES.map((st) => (<option key={st.id} value={st.id}>{st.labelKo}</option>))}
                </select>
              </div>
              <div>
                <label htmlFor={`${uid}-member`} className="mb-1 block text-xs font-medium text-fg-2">요청·인수 담당자</label>
                <select id={`${uid}-member`} data-testid="handoff-member-select" value={selectedHolderId} onChange={(e) => setSelectedHolderId(e.target.value)} className={SELECT_CLS}>
                  {STUDIO_ASSISTANT_ROSTER.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="acquire-lock-btn" onClick={handleAcquireLock} className={BTN_OUTLINE}><Lock className="h-3.5 w-3.5" aria-hidden="true" /> 잠금 임대 / 충돌 검사</button>
              <button type="button" data-testid="handoff-stage-btn" onClick={handleHandoffStage} className={BTN_SOLID}><Send className="h-3.5 w-3.5" aria-hidden="true" /> 다음 공정 인수인계 & 영수증 발급</button>
            </div>
            {handoffBoard.conflicts.length > 0 ? (
              <div data-testid="handoff-conflict-alert" className="flex items-start gap-2 rounded-lg border border-bad/40 bg-bad-soft px-3 py-2 text-xs font-semibold text-bad">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{handoffBoard.conflicts[0]!.reasonKo}</span>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 rounded-lg border border-line bg-canvas p-3">
                <h4 className="text-xs font-bold text-fg">활성 잠금 임대 ({handoffSummary.activeLeases.length})</h4>
                {handoffSummary.activeLeases.map((lease) => (
                  <div key={lease.leaseId} className="flex items-center justify-between gap-2 rounded-md bg-raised px-2.5 py-1.5 text-xs">
                    <span className="font-semibold text-fg tabular-nums">{lease.cutId} · {getStageLabelKo(lease.stage)}</span>
                    <span className="text-fg-2">{lease.holderName}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2 rounded-lg border border-line bg-canvas p-3">
                <h4 className="text-xs font-bold text-fg">인수인계 영수증 ({handoffBoard.receipts.length})</h4>
                {handoffBoard.receipts.slice(0, 4).map((rcpt) => (
                  <div key={rcpt.receiptId} data-testid={`handoff-receipt-${rcpt.receiptId}`} className="rounded-md bg-raised px-2.5 py-1.5 text-xs">
                    <div className="flex items-center justify-between font-semibold text-fg tabular-nums"><span>{rcpt.receiptId} · {rcpt.cutId}</span><span className="font-mono text-[11px] text-accent">{rcpt.checksum}</span></div>
                    <div className="text-[11px] text-fg-2">{getStageLabelKo(rcpt.fromStage)} → {getStageLabelKo(rcpt.toStage)} · {rcpt.toMemberName}</div>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === "goods-macro-submission" ? (
        <div id={`${uid}-panel-goods-macro-submission`} role="tabpanel" aria-labelledby={`${uid}-tab-goods-macro-submission`} className="flex flex-col gap-5">
          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Scissors className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">5. 굿즈·인쇄 칼선 & CMYK 프리플라이트 (TAC &lt;= 300%)</h3></div>
              <span data-testid="goods-tac-badge" className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${goodsPackage.preflight.passed ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
                최대 TAC {goodsPackage.preflight.maxTacPct}% · {goodsPackage.preflight.passed ? "인쇄 통과" : "잉크 초과"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="goods-kind-acrylic" aria-pressed={goodsKind === "acrylic-stand"} onClick={() => setGoodsKind("acrylic-stand")} className={goodsKind === "acrylic-stand" ? BTN_SOLID : BTN_OUTLINE}>아크릴 스탠드 (2mm 화이트+3mm 도련)</button>
              <button type="button" data-testid="goods-kind-photocard" aria-pressed={goodsKind === "photocard"} onClick={() => setGoodsKind("photocard")} className={goodsKind === "photocard" ? BTN_SOLID : BTN_OUTLINE}>포토카드 (55×85mm 라운드)</button>
              <button type="button" data-testid="goods-ink-toggle" aria-pressed={goodsInkMode === "heavy-black"} onClick={() => setGoodsInkMode((m) => (m === "safe" ? "heavy-black" : "safe"))} className={goodsInkMode === "heavy-black" ? BTN_SOLID : BTN_OUTLINE}>
                {goodsInkMode === "safe" ? "고잉크 리치블랙 초과 시뮬레이션" : "인쇄 안전 잉크 복원"}
              </button>
              {goodsKind === "acrylic-stand" ? (
                <button type="button" aria-pressed={goodsKeyringHole} onClick={() => setGoodsKeyringHole((v) => !v)} className={goodsKeyringHole ? BTN_SOLID : BTN_OUTLINE}>키링 타공 {goodsKeyringHole ? "ON" : "OFF"}</button>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <MetricBox label="재단 치수" value={`${goodsPackage.trimWidthMm} × ${goodsPackage.trimHeightMm}mm`} />
              <MetricBox label="도련 포함 300DPI" value={`${goodsPackage.canvasWidthPx} × ${goodsPackage.canvasHeightPx}px`} />
              <MetricBox label="화이트 보더 / 도련" value={`${goodsPackage.whiteBorderMm}mm / ${goodsPackage.bleedMm}mm`} />
              <MetricBox label="키링 타공 / 평균 TAC" value={`${goodsPackage.keyringHole ? `Ø${goodsPackage.keyringHole.diameterMm}mm` : "없음"} · ${goodsPackage.preflight.avgTacPct}%`} />
            </div>
            {goodsKind === "acrylic-stand" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <SliderField id={`${uid}-wborder`} label="화이트 보더(mm)" valueText={`${goodsWhiteBorderMm.toFixed(1)}mm`} value={goodsWhiteBorderMm} min={1} max={5} step={0.5} onChange={setGoodsWhiteBorderMm} />
                <SliderField id={`${uid}-bleed`} label="인쇄 도련(mm)" valueText={`${goodsBleedMm.toFixed(1)}mm`} value={goodsBleedMm} min={2} max={5} step={0.5} onChange={setGoodsBleedMm} />
              </div>
            ) : null}
            <p className="text-xs text-fg-2">{goodsPackage.preflight.recommendedFixKo}</p>
          </article>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Camera className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">6. 무드보드 → 카메라 화각 · 3D LUT</h3></div>
                <span data-testid="mood-focal-badge" className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent tabular-nums">{moodRecipe.focalLengthMm}mm · FOV {moodRecipe.fovHorizontalDeg}°</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {MOODBOARD_OPTIONS.map((opt) => (
                  <button key={opt.id} data-testid={`mood-preset-${opt.id}`} type="button" aria-pressed={moodPreset === opt.id} onClick={() => setMoodPreset(opt.id)} className={moodPreset === opt.id ? BTN_SOLID : BTN_OUTLINE}>{opt.label}</button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MetricBox label="콘트라스트" value={`${moodRecipe.contrastRatio}x`} />
                <MetricBox label="색온도" value={`${moodRecipe.colorTempKelvin}K`} />
                <MetricBox label="3D LUT 시드" value={moodRecipe.lutSeedId} mono />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {moodRecipe.paletteOklch.map((swatch, idx) => (
                  <div key={`${swatch}-${idx}`} className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas p-1.5">
                    <span className="h-5 w-5 shrink-0 rounded border border-line-strong" style={{ backgroundColor: swatch }} aria-hidden="true" />
                    <span className="truncate font-mono text-[10px] text-fg-2 tabular-nums">#{idx + 1}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Play className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">7. .tsmacro 액션 매크로 레코더 · 리플레이어</h3></div>
                <span className="rounded-full bg-raised px-2.5 py-1 font-mono text-[11px] font-semibold text-fg-2 tabular-nums">{macroDoc.steps.length}단계 · {macroDoc.checksum}</span>
              </div>
              <ul className="space-y-1.5 text-xs">
                {macroDoc.steps.map((step) => (
                  <li key={step.stepId} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5">
                    <span className="font-medium text-fg"><span className="mr-1.5 font-mono text-fg-3 tabular-nums">{step.stepId}</span>{step.labelKo}</span>
                    <span className="font-mono text-[11px] text-fg-3">{step.action}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" data-testid="macro-add-step-btn" onClick={handleAppendMacroStep} className={BTN_OUTLINE}><Plus className="h-3.5 w-3.5" aria-hidden="true" /> 굿즈 칼선 단계 기록</button>
                <button type="button" data-testid="macro-replay-btn" onClick={handleReplayMacro} className={BTN_SOLID}><Play className="h-3.5 w-3.5" aria-hidden="true" /> 검증 & 일괄 리플레이</button>
              </div>
              {macroReplay ? (
                <div data-testid="macro-replay-result" className="rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs font-semibold text-good tabular-nums">
                  리플레이 {macroReplay.success ? "성공" : "일부 실패"}: 실행 {macroReplay.executedCount} · 건너뜀 {macroReplay.skippedCount} · 실패 {macroReplay.failedCount}
                </div>
              ) : null}
            </article>
          </div>

          <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><FileArchive className="h-4 w-4 text-accent" aria-hidden="true" /><h3 className="text-sm font-bold text-fg">8. 공모전·출판사 원클릭 투고 패키지 빌더</h3></div>
              <span data-testid="submission-ready-badge" className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${submissionManifest.readyToSubmit ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
                {submissionManifest.readyToSubmit ? "투고 준비 완료" : `규격 위반 ${submissionManifest.failCount}건`} · {submissionManifest.packageChecksum}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUBMISSION_TARGETS.map((tid) => (
                <button key={tid} data-testid={`submission-target-${tid}`} type="button" aria-pressed={submissionTarget === tid} onClick={() => handleSelectSubmissionTarget(tid)} className={submissionTarget === tid ? BTN_SOLID : BTN_OUTLINE}>
                  {SUBMISSION_TARGET_SPECS[tid].labelKo}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor={`${uid}-sub-width`} className="mb-1 block text-xs font-medium text-fg-2">원고 가로 폭(px)</label>
                <input id={`${uid}-sub-width`} data-testid="submission-width-input" type="number" value={submissionInput.widthPx} onChange={(e) => setSubmissionInput((prev) => ({ ...prev, widthPx: Number(e.target.value) }))} className={INPUT_CLS} />
              </div>
              <div>
                <label htmlFor={`${uid}-sub-size`} className="mb-1 block text-xs font-medium text-fg-2">총 용량(MB)</label>
                <input id={`${uid}-sub-size`} type="number" step={0.5} value={submissionInput.totalSizeMb} onChange={(e) => setSubmissionInput((prev) => ({ ...prev, totalSizeMb: Number(e.target.value) }))} className={INPUT_CLS} />
              </div>
              <div>
                <label htmlFor={`${uid}-sub-ep`} className="mb-1 block text-xs font-medium text-fg-2">회차 표기</label>
                <input id={`${uid}-sub-ep`} type="text" value={submissionInput.episodeLabel} onChange={(e) => setSubmissionInput((prev) => ({ ...prev, episodeLabel: e.target.value }))} className={INPUT_CLS} />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {submissionManifest.checks.map((chk) => (
                <div key={chk.ruleId} className={`rounded-lg border px-3 py-2 text-xs tabular-nums ${chk.passed ? "border-line bg-canvas text-fg" : "border-bad/40 bg-bad-soft text-bad"}`}>
                  <div className="flex items-center justify-between font-bold"><span>{chk.labelKo}</span><span>{chk.passed ? "PASS" : "FAIL"}</span></div>
                  <div className="mt-0.5 text-[11px] opacity-85">현재 {chk.actual} / 기준 {chk.expected}</div>
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
