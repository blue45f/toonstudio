/**
 * 한국어 어절 광학 말풍선 자동 조판 · 세로쓰기(`vertical-rl`) · 5종 감정 의성어(SFX) 벡터 타이포 2탭 워크벤치 (Wave 41B).
 * Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건) · Props 없이 단독 렌더링 지원 · 100% 온디바이스 결정론 연산.
 */

import {
  AlignCenter, CheckCircle2, Clock3, Columns2, Eye, MessageSquareText,
  ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Type, Wand2,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  BALLOON_SHAPE_IDS, BALLOON_SHAPE_SPECS, DEFAULT_BALLOON_PRESETS,
  type BalloonDialoguePreset, type BalloonShapeId, type BalloonWritingMode,
  type KoreanBalloonTypesetResult, type ReadingDensityGrade,
} from "./korean-balloon-typesetter";
import {
  DEFAULT_SFX_PRESETS, SFX_ENVELOPE_IDS, SFX_ENVELOPE_SPECS,
  type SfxEnvelopeId, type SfxTextPreset, type SfxVectorEnvelopeResult,
} from "./sfx-vector-path-generator";

import { calculateBalloonPreview, calculateSfxPreview } from "./lettering-preview";
import { useExampleNotification } from "./use-example-notification";

export type KoreanLetteringSfxTabId = "balloon-typeset" | "sfx-vector";

export interface StudioKoreanLetteringSfxPanelProps {
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialTab?: KoreanLetteringSfxTabId;
  readonly initialBalloonShape?: BalloonShapeId;
  readonly initialWritingMode?: BalloonWritingMode;
  readonly initialDialogue?: string;
  readonly initialSfxEnvelope?: SfxEnvelopeId;
  readonly initialSfxText?: string;
  readonly onBalloonTypeset?: (result: KoreanBalloonTypesetResult) => void | Promise<void>;
  readonly onSfxGenerated?: (result: SfxVectorEnvelopeResult) => void | Promise<void>;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BTN = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const PILL_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const ACTIVE_TONE = "border-accent bg-accent-soft text-accent";
const SOLID_ACTIVE = "border-accent bg-accent text-on-accent";
const IDLE_TONE = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const DEFAULT_DIALOGUE_TEXT = DEFAULT_BALLOON_PRESETS[0]?.text ?? "비 그치기 전에 옥상에서 꼭 끝내야 해, 이번엔 절대 물러서지 않을 거야.";

function densityTone(grade: ReadingDensityGrade): string {
  if (grade === "crisp" || grade === "balanced") return "border-good bg-good-soft text-good";
  return grade === "dense" ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";
}

function densityLabel(grade: ReadingDensityGrade, isKo: boolean): string {
  if (grade === "crisp") return isKo ? "쾌적·즉독" : "Crisp";
  if (grade === "balanced") return isKo ? "표준 호흡" : "Balanced";
  return grade === "dense" ? (isKo ? "다소 밀집" : "Dense") : (isKo ? "과밀 주의" : "Overcrowded");
}

function scriptBadgeLabel(script: SfxVectorEnvelopeResult["script"], isKo: boolean): string {
  if (script === "ko") return isKo ? "한국어(KO)" : "Korean (KO)";
  if (script === "ja") return isKo ? "일본어(JA)" : "Japanese (JA)";
  return script === "en" ? (isKo ? "영문(EN)" : "English (EN)") : (isKo ? "다국어 혼합" : "Mixed Script");
}

/** 한국어 어절 광학 말풍선 자동 조판 · 세로쓰기 · 5종 감정 의성어(SFX) 벡터 타이포 워크벤치. */
export function StudioKoreanLetteringSfxPanel(props: StudioKoreanLetteringSfxPanelProps): ReactElement {
  const {
    locale, className, initialTab = "balloon-typeset", initialBalloonShape = "oval",
    initialWritingMode = "horizontal-tb", initialDialogue = DEFAULT_DIALOGUE_TEXT,
    initialSfxEnvelope = "impact-burst", initialSfxText = "콰광!", onBalloonTypeset, onSfxGenerated,
  } = props;

  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const notification = useExampleNotification();
  const recipients = useRef({ onBalloonTypeset, onSfxGenerated });
  useEffect(() => { recipients.current = { onBalloonTypeset, onSfxGenerated }; }, [onBalloonTypeset, onSfxGenerated]);
  const [activeTab, setActiveTab] = useState<KoreanLetteringSfxTabId>(initialTab);
  const [dialogueText, setDialogueText] = useState<string>(initialDialogue);
  const [balloonShape, setBalloonShape] = useState<BalloonShapeId>(initialBalloonShape);
  const [writingMode, setWritingMode] = useState<BalloonWritingMode>(initialWritingMode);
  const [balloonWidthPx, setBalloonWidthPx] = useState<number>(264);
  const [fontSizePx, setFontSizePx] = useState<number>(16);
  const [showOpticalGuides, setShowOpticalGuides] = useState<boolean>(true);
  const [lastBalloonStatus, setLastBalloonStatus] = useState<string | null>(null);

  const initEnvSpec = SFX_ENVELOPE_SPECS[initialSfxEnvelope];
  const [sfxText, setSfxText] = useState<string>(initialSfxText);
  const [sfxEnvelopeId, setSfxEnvelopeId] = useState<SfxEnvelopeId>(initialSfxEnvelope);
  const [arcPct, setArcPct] = useState<number>(Math.round(initEnvSpec.defaultArcIntensity * 100));
  const [shearPct, setShearPct] = useState<number>(100);
  const [taperPct, setTaperPct] = useState<number>(Math.round(initEnvSpec.defaultTaperAmount * 100));
  const [outerStrokePx, setOuterStrokePx] = useState<number>(initEnvSpec.defaultOuterStrokePx);
  const [showQuadGuides, setShowQuadGuides] = useState<boolean>(false);
  const [lastSfxStatus, setLastSfxStatus] = useState<string | null>(null);

  const balloonCalculation = useMemo(
    () => calculateBalloonPreview(dialogueText, {
      shape: balloonShape, writingMode, balloonWidthPx, fontSizePx, preventOrphans: true,
    }),
    [dialogueText, balloonShape, writingMode, balloonWidthPx, fontSizePx],
  );

  const sfxCalculation = useMemo(
    () => calculateSfxPreview(sfxText, {
      envelopeId: sfxEnvelopeId, arcIntensity: arcPct / 100, shearMultiplier: shearPct / 100,
      taperAmount: taperPct / 100, outerStrokeWidthPx: outerStrokePx,
      innerStrokeWidthPx: Math.max(1, Math.round(outerStrokePx * 0.36 * 10) / 10),
    }),
    [sfxText, sfxEnvelopeId, arcPct, shearPct, taperPct, outerStrokePx],
  );

  const balloonResult = balloonCalculation.result;
  const sfxResult = sfxCalculation.result;
  const notifyBalloon = (calculation: ReturnType<typeof calculateBalloonPreview>): void => {
    if (calculation.result && !calculation.result.hasLayoutOverflow && calculation.result.text.trim()) {
      const result = calculation.result;
      notification.notify(() => {
        const recipient = recipients.current.onBalloonTypeset;
        return recipient ? () => recipient(result) : undefined;
      });
    }
  };
  const notifySfx = (calculation: ReturnType<typeof calculateSfxPreview>): void => {
    if (calculation.result && calculation.result.glyphs.length > 0) {
      const result = calculation.result;
      notification.notify(() => {
        const recipient = recipients.current.onSfxGenerated;
        return recipient ? () => recipient(result) : undefined;
      });
    }
  };

  const handleApplyBalloonPreset = (preset: BalloonDialoguePreset): void => {
    if (notification.isPending()) return;
    setDialogueText(preset.text);
    setBalloonShape(preset.shape);
    setWritingMode(preset.writingMode);
    setBalloonWidthPx(preset.balloonWidthPx);
    setFontSizePx(preset.fontSizePx);
    notifyBalloon(calculateBalloonPreview(preset.text, {
      shape: preset.shape, writingMode: preset.writingMode,
      balloonWidthPx: preset.balloonWidthPx, fontSizePx: preset.fontSizePx, preventOrphans: true,
    }));
  };

  const handleSelectBalloonShape = (nextShape: BalloonShapeId): void => {
    if (notification.isPending()) return;
    setBalloonShape(nextShape);
    notifyBalloon(calculateBalloonPreview(dialogueText, {
      shape: nextShape, writingMode, balloonWidthPx, fontSizePx, preventOrphans: true,
    }));
  };

  const handleSelectWritingMode = (nextMode: BalloonWritingMode): void => {
    if (notification.isPending()) return;
    setWritingMode(nextMode);
    notifyBalloon(calculateBalloonPreview(dialogueText, {
      shape: balloonShape, writingMode: nextMode, balloonWidthPx, fontSizePx, preventOrphans: true,
    }));
  };

  const handleCommitBalloon = (): void => {
    if (notification.isPending() || !balloonResult || balloonResult.hasLayoutOverflow || !dialogueText.trim()) return;
    notifyBalloon(balloonCalculation);
    setLastBalloonStatus(pick("말풍선 예제 구성 확인. 현재 원고·저장 상태는 바뀌지 않습니다.", "Balloon example inspected. Manuscript and persistence are unchanged."));
  };

  const handleSelectSfxEnvelope = (nextEnvelope: SfxEnvelopeId): void => {
    if (notification.isPending()) return;
    const spec = SFX_ENVELOPE_SPECS[nextEnvelope];
    const nextArc = Math.round(spec.defaultArcIntensity * 100);
    const nextTaper = Math.round(spec.defaultTaperAmount * 100);
    setSfxEnvelopeId(nextEnvelope);
    setArcPct(nextArc);
    setShearPct(100);
    setTaperPct(nextTaper);
    setOuterStrokePx(spec.defaultOuterStrokePx);
    notifySfx(calculateSfxPreview(sfxText, {
      envelopeId: nextEnvelope, arcIntensity: nextArc / 100, shearMultiplier: 1,
      taperAmount: nextTaper / 100, outerStrokeWidthPx: spec.defaultOuterStrokePx,
    }));
  };

  const handleSelectSfxPreset = (preset: SfxTextPreset): void => {
    if (notification.isPending()) return;
    const spec = SFX_ENVELOPE_SPECS[preset.envelopeId];
    const nextArc = Math.round(spec.defaultArcIntensity * 100);
    const nextTaper = Math.round(spec.defaultTaperAmount * 100);
    setSfxText(preset.text);
    setSfxEnvelopeId(preset.envelopeId);
    setArcPct(nextArc);
    setShearPct(100);
    setTaperPct(nextTaper);
    setOuterStrokePx(spec.defaultOuterStrokePx);
    notifySfx(calculateSfxPreview(preset.text, {
      envelopeId: preset.envelopeId, arcIntensity: nextArc / 100, shearMultiplier: 1,
      taperAmount: nextTaper / 100, outerStrokeWidthPx: spec.defaultOuterStrokePx,
    }));
  };

  const handleCommitSfx = (): void => {
    if (notification.isPending() || !sfxResult || sfxResult.glyphs.length === 0) return;
    notifySfx(sfxCalculation);
    setLastSfxStatus(pick("폰트 의존 SVG 텍스트 예제 구성 확인. 실제 레이어 생성·저장은 연결되지 않았습니다.", "Font-dependent SVG text example inspected. No layer creation or persistence is connected."));
  };

  const tabs: readonly { readonly id: KoreanLetteringSfxTabId; readonly label: string; readonly icon: ReactElement }[] = [
    { id: "balloon-typeset", label: pick("한국어 광학 말풍선 조판 · 세로쓰기", "Korean Optical Balloon & Vertical-RL"), icon: <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" /> },
    { id: "sfx-vector", label: pick("5종 감정 의성어(SFX) 벡터 타이포", "5-Envelope Emotion SFX Vector"), icon: <Wand2 className="h-3.5 w-3.5" aria-hidden="true" /> },
  ];

  const svgPadX = 16;
  const svgPadY = 22;
  const balloonViewW = (balloonResult?.balloonWidthPx ?? 0) + svgPadX * 2;
  const balloonViewH = (balloonResult?.balloonHeightPx ?? 0) + svgPadY * 2;

  return (
    <section
      data-testid="korean-lettering-sfx-panel"
      aria-label={pick("한국어 웹툰 어절 단위 광학 말풍선 조판 · 세로쓰기 · 감정 의성어 벡터 타이포 워크벤치", "Korean Webtoon Optical Balloon Typesetting, Vertical-RL & Emotion SFX Vector Workbench")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("한국어 어절 광학 말풍선 자동 조판 · 세로쓰기 · 감정 SFX 벡터 타이포", "Korean Eojeol Optical Balloon Typesetter · Vertical-RL · SFX Vector Engine")}
            </h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick("CPU·메모리의 조판 좌표와 폰트 의존 SVG 텍스트 미리보기 예제입니다. 글자 폭·읽기 시간은 가정값이며 실제 글꼴 계측·글리프 외곽선·원근 워프·현재 원고 적용·저장·내보내기는 연결되지 않았습니다. 대사 1024자·128어절, SFX 128자까지 계산하며 한도 초과 시 원문을 유지합니다.", "CPU/in-memory layout coordinates and font-dependent SVG text examples. Widths and reading times are estimates. No font measurement, glyph outlining, perspective glyph warp, manuscript apply, persistence, or export is connected. Limits: 1024 dialogue units/128 words, 128 SFX units; source is preserved on overflow.")}
          </p>
        </div>
        <span data-testid="badge-lettering-engine-ready" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-good bg-good-soft px-2.5 py-1 text-xs font-semibold text-good tabular-nums">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {pick("keep-all · sqrt(1-y²) · 5종 SFX", "keep-all · sqrt(1-y²) · 5 SFX")}
        </span>
      </header>

      {notification.status !== "idle" && <div role={notification.status === "failed" ? "alert" : "status"} data-testid="example-notification-status" className="text-xs text-fg-2">
        {notification.pending ? pick("예제 결과 알림 처리 중", "Example notification pending") : notification.status === "failed" ? pick(`예제 결과 알림 실패: ${notification.error}`, `Example notification failed: ${notification.error}`) : pick("핸들러 응답 확인. 실제 적용·저장 완료를 뜻하지 않습니다.", "Handler responded. No apply or save is confirmed.")}
        {notification.status === "failed" && <button type="button" className={PILL_BTN} onClick={notification.retry}>{pick("결과 알림 다시 시도", "Retry notification")}</button>}
      </div>}
      <div role="tablist" aria-label={pick("한국어 식자 및 의성어 작업 탭", "Korean lettering and SFX tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id} type="button" role="tab" id={`${uid}-tab-${tab.id}`}
            aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`}
            data-testid={`tab-${tab.id}`} onClick={() => setActiveTab(tab.id)}
            className={`${TAB_BTN} ${activeTab === tab.id ? SOLID_ACTIVE : IDLE_TONE}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "balloon-typeset" && (
        <fieldset disabled={notification.pending} role="tabpanel" id={`${uid}-panel-balloon-typeset`} aria-labelledby={`${uid}-tab-balloon-typeset`} data-testid="panel-balloon-typeset" className="min-w-0 space-y-4">
          <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Type className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("현장 대사 프리셋", "Webtoon Dialogue Presets")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(["horizontal-tb", "vertical-rl"] as const).map((mode) => (
                  <button
                    key={mode} type="button" data-testid={`writing-mode-${mode}`} aria-pressed={writingMode === mode}
                    onClick={() => handleSelectWritingMode(mode)}
                    className={`${PILL_BTN} ${writingMode === mode ? ACTIVE_TONE : IDLE_TONE}`}
                  >
                    {mode === "horizontal-tb" ? <AlignCenter className="h-3.5 w-3.5" aria-hidden="true" /> : <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />}
                    <span>{mode === "horizontal-tb" ? pick("가로쓰기", "Horizontal") : pick("세로쓰기 (vertical-rl)", "Vertical-RL")}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_BALLOON_PRESETS.map((preset) => (
                <button key={preset.id} type="button" data-testid={`balloon-preset-${preset.id}`} onClick={() => handleApplyBalloonPreset(preset)} className={`${PILL_BTN} ${IDLE_TONE}`}>
                  {isKo ? preset.labelKo : preset.labelEn}
                </button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-12">
              <div className="space-y-1.5 md:col-span-7">
                <label htmlFor={`${uid}-dialogue-input`} className="block text-xs font-semibold text-fg">
                  {pick("대사 입력 (어절 단위 자동 줄바꿈)", "Dialogue Script (Eojeol-Safe Optical Wrap)")}
                </label>
                <textarea
                  id={`${uid}-dialogue-input`} data-testid="balloon-dialogue-input" rows={3}
                  value={dialogueText} onChange={(e) => setDialogueText(e.target.value)}
                  className={`w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs leading-relaxed text-fg ${FOCUS_RING}`}
                />
              </div>

              <div className="space-y-2.5 md:col-span-5">
                <div>
                  <label htmlFor={`${uid}-balloon-width`} className="flex items-center justify-between text-xs text-fg-2">
                    <span>{pick("말풍선 너비", "Balloon Width")}</span>
                    <span data-testid="balloon-width-readout" className="font-semibold text-fg tabular-nums">{balloonWidthPx}px</span>
                  </label>
                  <input id={`${uid}-balloon-width`} data-testid="balloon-width-slider" type="range" min={160} max={360} step={4} value={balloonWidthPx} onChange={(e) => setBalloonWidthPx(Number(e.target.value))} className="mt-1 w-full accent-accent" />
                </div>
                <div>
                  <label htmlFor={`${uid}-balloon-fontsize`} className="flex items-center justify-between text-xs text-fg-2">
                    <span>{pick("기본 글자 크기", "Base Font Size")}</span>
                    <span data-testid="balloon-fontsize-readout" className="font-semibold text-fg tabular-nums">{fontSizePx}px</span>
                  </label>
                  <input id={`${uid}-balloon-fontsize`} data-testid="balloon-fontsize-slider" type="range" min={12} max={24} step={1} value={fontSizePx} onChange={(e) => setFontSizePx(Number(e.target.value))} className="mt-1 w-full accent-accent" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-line/60 pt-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-fg">{pick("말풍선 5종 내접 곡선 프로파일", "5 Balloon Inscribed-Curve Profiles")}</span>
                <span className="text-[11px] text-fg-2">{isKo ? BALLOON_SHAPE_SPECS[balloonShape].summaryKo : BALLOON_SHAPE_SPECS[balloonShape].summaryEn}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BALLOON_SHAPE_IDS.map((shapeId) => (
                  <button
                    key={shapeId} type="button" data-testid={`balloon-shape-${shapeId}`} aria-pressed={balloonShape === shapeId}
                    onClick={() => handleSelectBalloonShape(shapeId)}
                    className={`${PILL_BTN} ${balloonShape === shapeId ? ACTIVE_TONE : IDLE_TONE}`}
                  >
                    {isKo ? BALLOON_SHAPE_SPECS[shapeId].labelKo : BALLOON_SHAPE_SPECS[shapeId].labelEn}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {balloonCalculation.error && <p role="alert" data-testid="balloon-typeset-input-error" className="text-xs text-bad">{balloonCalculation.error}</p>}
          {balloonResult && <>
          {balloonResult.hasLayoutOverflow && <p role="alert" data-testid="balloon-layout-overflow" className="text-xs text-bad">{pick(`예제 경계 넘침: 세로 열 높이 ${balloonResult.verticalOverflowPx}px · ${writingMode === "vertical-rl" ? "좌우/열 간격" : "가로 행 높이"} ${balloonResult.horizontalOverflowPx}px / 폭 비율 ${balloonResult.maxOverflowRatio}. 원문은 유지되며 결과 알림은 중단됩니다.`, "Example layout overflows. Source is preserved and result notification is blocked.")}</p>}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("다이아몬드 광학 균형", "Diamond Balance")}</div>
              <div data-testid="kpi-diamond-balance" className="mt-1 text-base font-bold text-accent tabular-nums">{balloonResult.diamondBalanceScore} / 100</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("가로 행 기준 외톨이 검사", "Horizontal-Line Orphan Check")}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <span data-testid="kpi-orphan-status" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${balloonResult.orphanLineCount === 0 ? "border-good bg-good-soft text-good" : "border-warn bg-warning-soft text-warn"}`}>
                  {balloonResult.orphanLineCount === 0 ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                  {balloonResult.orphanLineCount === 0 ? pick("0행 · 검출 없음", "0 horizontal orphans detected") : pick(`${balloonResult.orphanLineCount}행 주의`, `${balloonResult.orphanLineCount} warning`)}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("가정 속도 기반 읽기 시간 추정", "Reading Time Estimate")}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span data-testid="kpi-reading-time" className="inline-flex items-center gap-1 text-base font-bold text-fg tabular-nums">
                  <Clock3 className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
                  {balloonResult.readingTime.readingTimeSec.toFixed(2)}s
                </span>
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${densityTone(balloonResult.readingTime.densityGrade)}`}>
                  {densityLabel(balloonResult.readingTime.densityGrade, isKo)}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("행·열 / 광학 중심", "Lines · Optical Center")}</div>
              <div data-testid="kpi-line-summary" className="mt-1 text-sm font-bold text-fg tabular-nums">
                {writingMode === "vertical-rl"
                  ? pick(`${balloonResult.verticalColumns.length}열 세로`, `${balloonResult.verticalColumns.length} cols`)
                  : pick(`${balloonResult.lines.length}줄 어절`, `${balloonResult.lines.length} lines`)}
                {" · "}{Math.round(balloonResult.opticalCenterOffsetRatio * 100)}%
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-12">
            <div className="space-y-2.5 rounded-lg border border-line bg-card p-3 lg:col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-fg">{pick("실시간 말풍선 광학 조판 SVG 프리뷰", "Live Optical Balloon SVG Preview")}</h3>
                <button type="button" data-testid="btn-toggle-optical-guides" aria-pressed={showOpticalGuides} onClick={() => setShowOpticalGuides((prev) => !prev)} className={`${PILL_BTN} ${showOpticalGuides ? ACTIVE_TONE : IDLE_TONE}`}>
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("내접 곡선 가이드", "Curve Guides")}</span>
                </button>
              </div>

              <svg data-testid="balloon-svg-preview" viewBox={`0 0 ${balloonViewW} ${balloonViewH}`} role="img" aria-label={pick("한국어 말풍선 광학 조판 벡터 미리보기", "Korean optical balloon typesetting SVG preview")} className="h-64 w-full rounded-lg border border-line bg-canvas">
                <g transform={`translate(${svgPadX} ${svgPadY})`}>
                  {balloonResult.tailPath && <path d={balloonResult.tailPath} className="fill-card stroke-fg" strokeWidth={2} strokeLinejoin="round" />}
                  <path d={balloonResult.balloonOutlinePath} className="fill-card stroke-fg" strokeWidth={2} strokeLinejoin="round" strokeDasharray={balloonResult.shapeSpec.dashedOutline ? "6 4" : undefined} />
                  {balloonResult.thoughtDots.map((dot, idx) => (
                    <circle key={`thought-dot-${idx}`} cx={dot.cx} cy={dot.cy} r={dot.r} className="fill-card stroke-fg" strokeWidth={1.6} />
                  ))}
                  {showOpticalGuides && (
                    <g data-testid="balloon-optical-guides">
                      {balloonResult.inscribedCurveGuides.map((guide, idx) => (
                        <line key={`guide-${idx}`} x1={guide.x1Px} y1={guide.y1Px} x2={guide.x2Px} y2={guide.y2Px} className="stroke-cool/60" strokeWidth={1} strokeDasharray="3 3" />
                      ))}
                      <circle cx={balloonResult.opticalCenterXPx} cy={balloonResult.opticalCenterYPx} r={2.5} className="fill-accent" />
                    </g>
                  )}
                  {writingMode === "horizontal-tb" ? (
                    <g data-testid="balloon-horizontal-lines">
                      {balloonResult.lines.map((line) => (
                        <text key={`line-${line.index}`} x={line.xPx} y={line.yPx} textAnchor="middle" dominantBaseline="central" fontSize={balloonResult.fontSizePx} className="fill-fg font-semibold">
                          {line.text}
                        </text>
                      ))}
                    </g>
                  ) : (
                    <g data-testid="balloon-vertical-columns">
                      {balloonResult.verticalColumns.map((col) => (
                        <g key={`vcol-${col.columnIndex}`}>
                          {col.glyphs.map((glyph) => (
                            <text
                              key={`vglyph-${col.columnIndex}-${glyph.index}`} x={glyph.xPx} y={glyph.yPx}
                              textAnchor="middle" dominantBaseline="central"
                              fontSize={glyph.tateChuYoko ? Math.max(10, balloonResult.fontSizePx * 0.78) : balloonResult.fontSizePx}
                              transform={glyph.rotateDeg !== 0 ? `rotate(${glyph.rotateDeg} ${glyph.xPx} ${glyph.yPx})` : undefined}
                              className="fill-fg font-semibold"
                            >
                              {glyph.displayChar}
                            </text>
                          ))}
                        </g>
                      ))}
                    </g>
                  )}
                </g>
              </svg>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" data-testid="btn-apply-balloon-layout" onClick={handleCommitBalloon} disabled={balloonResult.hasLayoutOverflow || !dialogueText.trim()} className={`${PILL_BTN} ${SOLID_ACTIVE}`}>
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("말풍선 예제 구성 확인", "Inspect Balloon Example")}</span>
                </button>
                {lastBalloonStatus && <span data-testid="balloon-apply-status" className="text-xs font-medium text-good tabular-nums">{lastBalloonStatus}</span>}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-line bg-card p-3 lg:col-span-6">
              <div className="flex items-center justify-between text-xs">
                <h3 className="font-semibold text-fg">
                  {writingMode === "vertical-rl" ? pick("세로쓰기(vertical-rl) 열별 배치 명세", "Vertical-RL Column Placement") : pick("어절 행별 내접 폭 곡선(`sqrt(1-y²)`) 명세", "Per-Line Inscribed Width Breakdown")}
                </h3>
                <span className="text-[11px] text-fg-3 tabular-nums">
                  {pick(`패딩 ${Math.round(balloonResult.innerPaddingRatio * 100)}% · 권장 체류 ${balloonResult.readingTime.recommendedCutHoldSec.toFixed(2)}s`, `Pad ${Math.round(balloonResult.innerPaddingRatio * 100)}% · Hold ${balloonResult.readingTime.recommendedCutHoldSec.toFixed(2)}s`)}
                </span>
              </div>

              {writingMode === "horizontal-tb" ? (
                <ul data-testid="balloon-lines-breakdown" className="space-y-1.5">
                  {balloonResult.lines.map((line) => (
                    <li key={`row-${line.index}`} className="rounded-md border border-line bg-canvas px-2.5 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-fg">L{line.index + 1}. {line.text}</span>
                        <span className="shrink-0 text-[11px] text-fg-2 tabular-nums">
                          {line.opticalWidthEm.toFixed(1)} / {line.maxAllowedWidthEm.toFixed(1)}em · 곡선 {Math.round(line.inscribedWidthFactor * 100)}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-raised">
                        <div className={`h-full rounded-full ${line.fillRatio > 1 ? "bg-bad" : "bg-accent"}`} style={{ width: `${Math.min(100, Math.round(line.fillRatio * 100))}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul data-testid="balloon-columns-breakdown" className="space-y-1.5">
                  {balloonResult.verticalColumns.map((col) => (
                    <li key={`col-item-${col.columnIndex}`} className="flex items-center justify-between gap-2 rounded-md border border-line bg-canvas px-2.5 py-2 text-xs">
                      <span className="font-semibold text-fg">{pick(`${col.columnIndex + 1}열(우→좌)`, `Col ${col.columnIndex + 1} (R→L)`)}: {col.text}</span>
                      <span className="shrink-0 text-[11px] text-fg-2 tabular-nums">x={col.xPx}px · {col.glyphCount}{pick("자", "ch")} · {Math.round(col.inscribedHeightFactor * 100)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          </>}
        </fieldset>
      )}

      {activeTab === "sfx-vector" && (
        <fieldset disabled={notification.pending} role="tabpanel" id={`${uid}-panel-sfx-vector`} aria-labelledby={`${uid}-tab-sfx-vector`} data-testid="panel-sfx-vector" className="min-w-0 space-y-4">
          <div className="space-y-2.5 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("다국어 의성어·의태어 빠른 프리셋", "Multi-Script SFX Quick Presets")}
              </span>
              <span data-testid="sfx-script-badge" className="rounded-full border border-line bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-cool">
                {sfxResult ? scriptBadgeLabel(sfxResult.script, isKo) : pick("미계산", "Not calculated")}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_SFX_PRESETS.map((preset) => (
                <button key={preset.id} type="button" data-testid={`sfx-preset-${preset.id}`} onClick={() => handleSelectSfxPreset(preset)} className={`${PILL_BTN} ${IDLE_TONE}`}>
                  {isKo ? preset.labelKo : preset.labelEn}
                </button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-12">
              <div className="space-y-1.5 md:col-span-5">
                <label htmlFor={`${uid}-sfx-text-input`} className="block text-xs font-semibold text-fg">
                  {pick("의성어 텍스트 (한국어 · 영어 · 일본어)", "SFX Text (KO · EN · JA)")}
                </label>
                <input id={`${uid}-sfx-text-input`} data-testid="sfx-text-input" type="text" value={sfxText} onChange={(e) => setSfxText(e.target.value)} className={`min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm font-bold text-fg ${FOCUS_RING}`} />
                <p className="text-[11px] text-fg-2">{isKo ? SFX_ENVELOPE_SPECS[sfxEnvelopeId].summaryKo : SFX_ENVELOPE_SPECS[sfxEnvelopeId].summaryEn}</p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 md:col-span-7">
                <div>
                  <label htmlFor={`${uid}-sfx-arc`} className="flex items-center justify-between text-xs text-fg-2">
                    <span>{pick("아크 곡률", "Arc Curve")}</span>
                    <span data-testid="sfx-arc-readout" className="font-semibold text-fg tabular-nums">{arcPct}%</span>
                  </label>
                  <input id={`${uid}-sfx-arc`} data-testid="sfx-arc-slider" type="range" min={-100} max={100} value={arcPct} onChange={(e) => setArcPct(Number(e.target.value))} className="mt-1 w-full accent-accent" />
                </div>
                <div>
                  <label htmlFor={`${uid}-sfx-shear`} className="flex items-center justify-between text-xs text-fg-2">
                    <span>{pick("기울기(Shear)", "Shear Scale")}</span>
                    <span data-testid="sfx-shear-readout" className="font-semibold text-fg tabular-nums">{shearPct}%</span>
                  </label>
                  <input id={`${uid}-sfx-shear`} data-testid="sfx-shear-slider" type="range" min={0} max={180} value={shearPct} onChange={(e) => setShearPct(Number(e.target.value))} className="mt-1 w-full accent-accent" />
                </div>
                <div>
                  <label htmlFor={`${uid}-sfx-taper`} className="flex items-center justify-between text-xs text-fg-2">
                    <span>{pick("원근 테이퍼", "Perspective Taper")}</span>
                    <span data-testid="sfx-taper-readout" className="font-semibold text-fg tabular-nums">{taperPct}%</span>
                  </label>
                  <input id={`${uid}-sfx-taper`} data-testid="sfx-taper-slider" type="range" min={-70} max={70} value={taperPct} onChange={(e) => setTaperPct(Number(e.target.value))} className="mt-1 w-full accent-accent" />
                </div>
                <div>
                  <label htmlFor={`${uid}-sfx-stroke`} className="flex items-center justify-between text-xs text-fg-2">
                    <span>{pick("이중 외곽선 두께", "Double-Stroke Width")}</span>
                    <span data-testid="sfx-stroke-readout" className="font-semibold text-fg tabular-nums">{outerStrokePx}px</span>
                  </label>
                  <input id={`${uid}-sfx-stroke`} data-testid="sfx-stroke-slider" type="range" min={2} max={14} step={0.5} value={outerStrokePx} onChange={(e) => setOuterStrokePx(Number(e.target.value))} className="mt-1 w-full accent-accent" />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 border-t border-line/60 pt-2.5">
              {SFX_ENVELOPE_IDS.map((envId) => (
                <button key={envId} type="button" data-testid={`sfx-envelope-${envId}`} aria-pressed={sfxEnvelopeId === envId} onClick={() => handleSelectSfxEnvelope(envId)} className={`${PILL_BTN} ${sfxEnvelopeId === envId ? ACTIVE_TONE : IDLE_TONE}`}>
                  {isKo ? SFX_ENVELOPE_SPECS[envId].labelKo : SFX_ENVELOPE_SPECS[envId].labelEn}
                </button>
              ))}
            </div>
          </div>

          {sfxCalculation.error && <p role="alert" data-testid="sfx-vector-input-error" className="text-xs text-bad">{sfxCalculation.error}</p>}
          {sfxResult && <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("원근 배율 범위", "Perspective Scale")}</div>
              <div data-testid="kpi-sfx-scale" className="mt-1 text-base font-bold text-accent tabular-nums">×{sfxResult.minScale.toFixed(2)} → ×{sfxResult.maxScale.toFixed(2)}</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("최대 전단 기울기", "Peak Shear Angle")}</div>
              <div data-testid="kpi-sfx-shear" className="mt-1 text-base font-bold text-fg tabular-nums">{sfxResult.maxAbsShearDeg.toFixed(1)}°</div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("이중 외곽선 구성", "Double-Stroke Spec")}</div>
              <div data-testid="kpi-sfx-stroke" className="mt-1 text-sm font-bold text-cool tabular-nums">
                {pick(`외곽 ${sfxResult.outerStrokeWidthPx}px · 내곽 ${sfxResult.innerStrokeWidthPx}px`, `Out ${sfxResult.outerStrokeWidthPx}px · In ${sfxResult.innerStrokeWidthPx}px`)}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-card p-3">
              <div className="text-[11px] text-fg-3">{pick("장식 SVG 경로 수 (글리프 제외)", "Decorative SVG Paths (No Glyph Outlines)")}</div>
              <div data-testid="kpi-sfx-paths" className="mt-1 text-base font-bold text-fg tabular-nums">{sfxResult.totalVectorPathCount} {pick("개", "paths")}</div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-12">
            <div className="space-y-2.5 rounded-lg border border-line bg-card p-3 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-fg">{pick("이중 외곽선 · 파라메트릭 SFX 벡터 프리뷰", "Double-Stroke Parametric SFX Vector Preview")}</h3>
                <button type="button" data-testid="btn-toggle-quad-guides" aria-pressed={showQuadGuides} onClick={() => setShowQuadGuides((prev) => !prev)} className={`${PILL_BTN} ${showQuadGuides ? ACTIVE_TONE : IDLE_TONE}`}>
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("사각 경계 가이드", "Quad Bounds Guides")}</span>
                </button>
              </div>

              <svg data-testid="sfx-svg-preview" viewBox={`0 0 ${sfxResult.viewBoxWidth} ${sfxResult.viewBoxHeight}`} role="img" aria-label={pick("감정 의성어 파라메트릭 이중 외곽선 벡터 미리보기", "Parametric double-stroke SFX vector preview")} className="h-56 w-full rounded-lg border border-line bg-canvas">
                <path d={sfxResult.envelopeClosedPath} className="fill-accent/10 stroke-line" strokeWidth={1} strokeDasharray="4 3" />
                {sfxResult.accentPaths.map((d, idx) => (
                  <path key={`accent-${idx}`} d={d} className="fill-none stroke-cool/70" strokeWidth={1.6} strokeLinecap="round" />
                ))}
                {showQuadGuides &&
                  sfxResult.glyphs.map((g) => (
                    <g key={`quad-guide-${g.index}`} data-testid={`sfx-quad-${g.index}`}>
                      <path d={g.doubleStroke.outerPath} className="fill-none stroke-warn/70" strokeWidth={1} strokeDasharray="3 2" />
                      <path d={g.glyphBoxPath} className="fill-none stroke-cool/80" strokeWidth={1} />
                    </g>
                  ))}
                {sfxResult.glyphs.map((g) => (
                  <g key={`sfx-glyph-${g.index}`} transform={g.svgTransform}>
                    <text x={g.doubleStroke.shadowOffsetX} y={g.doubleStroke.shadowOffsetY} textAnchor="middle" dominantBaseline="central" fontSize={sfxResult.baseFontSizePx} fontWeight={sfxResult.spec.fontWeight} className="fill-fg-3/45">{g.char}</text>
                    <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={sfxResult.baseFontSizePx} fontWeight={sfxResult.spec.fontWeight} strokeWidth={g.doubleStroke.outerStrokeWidthPx} strokeLinejoin="round" paintOrder="stroke fill" className="fill-none stroke-fg">{g.char}</text>
                    <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={sfxResult.baseFontSizePx} fontWeight={sfxResult.spec.fontWeight} strokeWidth={g.doubleStroke.innerStrokeWidthPx} strokeLinejoin="round" paintOrder="stroke fill" className="fill-accent stroke-canvas">{g.char}</text>
                  </g>
                ))}
              </svg>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" data-testid="btn-generate-sfx-layer" onClick={handleCommitSfx} disabled={sfxResult.glyphs.length === 0} className={`${PILL_BTN} ${SOLID_ACTIVE}`}>
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("SFX 텍스트 예제 구성 확인", "Inspect SFX Text Example")}</span>
                </button>
                {lastSfxStatus && <span data-testid="sfx-commit-status" className="text-xs font-medium text-good tabular-nums">{lastSfxStatus}</span>}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-line bg-card p-3 lg:col-span-5">
              <h3 className="text-xs font-semibold text-fg">{pick("글자별 아크 좌표 · 기울기 · 테이퍼 명세", "Per-Glyph Arc · Shear · Taper Specs")}</h3>
              <ul data-testid="sfx-glyph-telemetry" className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {sfxResult.glyphs.map((g) => (
                  <li key={`glyph-row-${g.index}`} className="rounded-md border border-line bg-canvas px-2.5 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-accent">#{g.index + 1} “{g.char}”</span>
                      <span className="text-[11px] text-fg-2 tabular-nums">({g.x}, {g.y}) · {g.arcAngleDeg}°</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[11px] text-fg-3 tabular-nums">
                      <span>shear {g.shearXDeg}°</span>
                      <span>scale ×{g.scaleX.toFixed(2)}/{g.scaleY.toFixed(2)}</span>
                      <span>taper {g.taperRatio.toFixed(2)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          </>}
        </fieldset>
      )}
    </section>
  );
}
