/**
 * Wave 50A — 화풍 스펙트럼 어드바이저 · 3D→2D 안료/셀 변환 & 화풍 고정 AI 가디언 스튜디오 패널.
 *
 * - 원고/콘티 6대 장르 + 분위기 입력 기반 비파괴 화풍 Top-3 추천
 * - 순수 시맨틱 SVG 3D→2D 안료/셀 변환 & 외부 에셋 이질감 보정 전/후 비교 도해(oklch·currentColor 전용, 바이올렛 0%)
 * - 6대 대표 화풍 스펙트럼 카드 + 3D PBR 소스 4종 + 외부 에셋 드리프트 진단 & 원클릭 화풍 통일 보정
 * - 선 굵기·셀 밴드·채도·종이 그레인·그림자 색온도 슬라이더 + 비파괴 적용/원복 + 화풍 DNA JSON 내보내기
 */

import {
  AlertTriangle, BookOpen, Boxes, Check, CheckCircle2, Code2, Compass, Eye,
  GitCompare, Layers, Palette, RotateCcw, ScanSearch, ShieldCheck, SlidersHorizontal, Undo2,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  EXTERNAL_ASSET_PRESETS, STORY_GENRE_PRESETS, STYLE_SPECTRUM_PRESETS, THREE_D_SOURCE_PRESETS,
  applyStyleSpectrum, applyStyleUnificationCorrection, auditExternalAssetStyleDrift,
  computeCrossMediaTransferPlan, createStyleGuardianSession, exportStyleGuardianJson, formatOklch,
  getExternalAssetPreset, getStoryGenreMeta, getStyleSpectrumPreset, getThreeDSourcePreset,
  previewStyleSpectrum, proposeStyleSpectrumTop3, revertStyleGuardianSession,
  sanitizeNonVioletHue, tweakStyleGuardianConfig,
  type CrossMediaTransferPlan, type ExternalAssetDriftAudit, type ExternalAssetPresetId,
  type StoryGenreId, type StyleDriftSeverity, type StyleGuardianSession, type StyleSpectrumId,
  type StyleTuningConfig, type StyleTuningTweakPatch, type ThreeDSourceMaterialPresetId,
} from "./style-spectrum-guardian-engine";

export interface StudioStyleSpectrumGuardianPanelProps {
  readonly initialStyleId?: StyleSpectrumId;
  readonly initialGenre?: StoryGenreId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onApply?: (config: StyleTuningConfig, session: StyleGuardianSession) => void;
  readonly onRevert?: (session: StyleGuardianSession) => void;
  readonly onExportJson?: (json: string, session: StyleGuardianSession) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const SVG_HUD_BG = formatOklch({ l: 0.16, c: 0.012, h: 238 }, 0.8);
const SVG_HUD_TEXT = formatOklch({ l: 0.97, c: 0.006, h: 90 });
const SVG_RAW_SPECULAR = formatOklch({ l: 0.94, c: 0.02, h: 210 }, 0.85);
const SVG_DRIFT_WARN = formatOklch({ l: 0.62, c: 0.2, h: 28 });
const SVG_HARMONY_OK = formatOklch({ l: 0.58, c: 0.14, h: 156 });
const SVG_NOTICE = formatOklch({ l: 0.68, c: 0.15, h: 74 });

function driftBadgeClass(severity: StyleDriftSeverity): string {
  if (severity === "high-drift") return "border-bad bg-bad-soft text-bad";
  return severity === "notice" ? "border-warn bg-warning-soft text-warn" : "border-good bg-good-soft text-good";
}

function driftSvgColor(score: number): string {
  return score >= 55 ? SVG_DRIFT_WARN : score >= 25 ? SVG_NOTICE : SVG_HARMONY_OK;
}

function StyleTransferComparisonSvg(props: {
  readonly activeConfig: StyleTuningConfig; readonly transferPlan: CrossMediaTransferPlan;
  readonly driftAudit: ExternalAssetDriftAudit; readonly effectiveDriftScore: number; readonly isEn: boolean;
}): ReactElement {
  const { activeConfig, transferPlan, driftAudit, effectiveDriftScore, isEn } = props;
  const uid = useId();
  const pbrSphereGradId = `${uid}-pbr-sphere`;
  const pbrWallGradId = `${uid}-pbr-wall`;
  const tonePatternId = `${uid}-tone-dots`;

  const preset = getStyleSpectrumPreset(activeConfig.styleId);
  const rawHue = sanitizeNonVioletHue(driftAudit.asset.dominantHueDeg);
  const rawBase = formatOklch({ l: 0.62, c: Math.min(0.26, driftAudit.asset.chromaOklch), h: rawHue });
  const rawShadow = formatOklch({ l: 0.24, c: Math.min(0.16, driftAudit.asset.chromaOklch * 0.7), h: rawHue });
  const rawBgTop = formatOklch({ l: 0.84, c: 0.04, h: rawHue });
  const rawBgBottom = formatOklch({ l: 0.68, c: 0.06, h: rawHue });

  const paperCss = formatOklch(preset.paletteSwatches[0]);
  const hiCss = formatOklch(transferPlan.pigmentPalette.highlightOklch);
  const midCss = formatOklch(transferPlan.pigmentPalette.midtoneOklch);
  const shdCss = formatOklch(transferPlan.pigmentPalette.shadowOklch);
  const inkCss = formatOklch(transferPlan.pigmentPalette.lineInkOklch);

  const celBands = transferPlan.celBands;
  const strokeW = Math.max(0.8, Math.min(3.6, activeConfig.lineWidthPx));
  const toneSpacing = activeConfig.screentoneLpi >= 60 ? 5 : 7;

  return (
    <svg
      data-testid="style-transfer-compare-svg" data-style-id={activeConfig.styleId}
      data-shading-steps={celBands} data-line-width-px={activeConfig.lineWidthPx.toFixed(1)}
      data-screentone-lpi={activeConfig.screentoneLpi} data-drift-before={driftAudit.driftScore}
      data-drift-after={effectiveDriftScore} data-violet-free="true" viewBox="0 0 480 220" role="img"
      className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn ? "Before and after 3D to 2D cel pigment transfer and style unification comparison" : "3D-2D 안료 셀 변환 및 화풍 이질감 보정 전후 비교 도해"}
    >
      <defs>
        <radialGradient id={pbrSphereGradId} cx="35%" cy="32%" r="65%">
          <stop offset="0%" stopColor={SVG_RAW_SPECULAR} />
          <stop offset="48%" stopColor={rawBase} />
          <stop offset="100%" stopColor={rawShadow} />
        </radialGradient>
        <linearGradient id={pbrWallGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={rawBgTop} />
          <stop offset="100%" stopColor={rawBgBottom} />
        </linearGradient>
        <pattern id={tonePatternId} width={toneSpacing} height={toneSpacing} patternUnits="userSpaceOnUse">
          <circle cx={toneSpacing / 2} cy={toneSpacing / 2} r={activeConfig.screentoneLpi >= 60 ? 1.15 : 1.45} fill={inkCss} fillOpacity={0.28} />
        </pattern>
      </defs>

      <g>
        <rect x="10" y="10" width="222" height="200" rx="10" fill={`url(#${pbrWallGradId})`} stroke="currentColor" strokeOpacity={0.2} />
        <polygon points="10,152 232,152 232,210 10,210" fill={rawShadow} fillOpacity={0.35} />
        <rect x="28" y="64" width="66" height="92" fill={rawBase} fillOpacity={0.62} stroke={rawShadow} strokeWidth={Math.max(0.4, driftAudit.asset.lineWidthPx * 0.6)} />
        <circle cx="152" cy="116" r="42" fill={`url(#${pbrSphereGradId})`} />
        <ellipse cx="138" cy="100" rx="13" ry="8" fill={SVG_RAW_SPECULAR} fillOpacity={0.78} />
        <rect x="18" y="18" width="136" height="22" rx="6" fill={SVG_HUD_BG} />
        <text x="26" y="32" fill={SVG_HUD_TEXT} fontSize="9.5" fontWeight="700">{isEn ? "BEFORE · Raw 3D / Asset" : "보정 전 · 3D PBR / 외부 에셋"}</text>
        <rect x="18" y="176" width="206" height="26" rx="6" fill={SVG_HUD_BG} />
        <circle cx="30" cy="189" r="4.5" fill={driftSvgColor(driftAudit.driftScore)} />
        <text x="40" y="192" fill={SVG_HUD_TEXT} fontSize="9" fontFamily="monospace">
          {`DRIFT ${driftAudit.driftScore}/100 · SEAM ${transferPlan.beforeSeamRiskScore} · ${driftAudit.asset.lineWidthPx.toFixed(1)}px`}
        </text>
      </g>

      <g stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="236" y1="110" x2="244" y2="110" />
        <polyline points="241,105 245,110 241,115" />
      </g>

      <g>
        <rect x="248" y="10" width="222" height="200" rx="10" fill={paperCss} stroke={inkCss} strokeWidth={Math.min(2.2, strokeW)} />
        <rect x="266" y="64" width="66" height="92" fill={midCss} stroke={inkCss} strokeWidth={strokeW} />
        <polygon points="266,118 332,102 332,156 266,156" fill={shdCss} fillOpacity={0.84} />
        {activeConfig.screentoneLpi > 0 ? <rect x="266" y="104" width="66" height="52" fill={`url(#${tonePatternId})`} /> : null}
        <line x1="266" y1="90" x2="332" y2="90" stroke={inkCss} strokeWidth={Math.max(0.7, strokeW * 0.7)} />
        <line x1="299" y1="64" x2="299" y2="156" stroke={inkCss} strokeWidth={Math.max(0.7, strokeW * 0.65)} />

        <circle cx="390" cy="116" r="42" fill={shdCss} stroke={inkCss} strokeWidth={strokeW} />
        <circle cx="384" cy="111" r="34" fill={midCss} />
        {celBands >= 3 ? <circle cx="378" cy="105" r="24" fill={hiCss} /> : null}
        {celBands >= 4 ? <circle cx="381" cy="108" r="29" fill={midCss} fillOpacity={0.35} /> : null}
        {celBands >= 5 ? <circle cx="374" cy="100" r="14" fill={paperCss} fillOpacity={0.55} /> : null}
        {celBands >= 6 ? <path d="M 366 96 Q 376 86 392 92" fill="none" stroke={paperCss} strokeWidth="2.4" strokeLinecap="round" /> : null}
        {activeConfig.screentoneLpi > 0 ? <path d="M 392 74 A 42 42 0 0 1 392 158 A 34 42 0 0 0 392 74 Z" fill={`url(#${tonePatternId})`} /> : null}
        {activeConfig.paperGrainStrength >= 0.25 ? (
          <g stroke={inkCss} strokeOpacity={Math.min(0.28, activeConfig.paperGrainStrength * 0.45)} strokeWidth="0.7">
            <line x1="258" y1="48" x2="462" y2="48" strokeDasharray="2 7" />
            <line x1="258" y1="164" x2="462" y2="164" strokeDasharray="3 8" />
          </g>
        ) : null}
        <circle cx="390" cy="116" r="42" fill="none" stroke={inkCss} strokeWidth={strokeW} />

        <rect x="256" y="18" width="166" height="22" rx="6" fill={SVG_HUD_BG} />
        <text x="264" y="32" fill={SVG_HUD_TEXT} fontSize="9.5" fontWeight="700">{isEn ? `AFTER · ${preset.nameEn}` : `변환 후 · ${preset.nameKo}`}</text>
        <rect x="256" y="176" width="206" height="26" rx="6" fill={SVG_HUD_BG} />
        <circle cx="268" cy="189" r="4.5" fill={driftSvgColor(effectiveDriftScore)} />
        <text x="278" y="192" fill={SVG_HUD_TEXT} fontSize="9" fontFamily="monospace">
          {`DRIFT ${effectiveDriftScore}/100 · ${celBands}CEL · ${activeConfig.lineWidthPx.toFixed(1)}px`}
        </text>
      </g>
    </svg>
  );
}

function StyleSliderRow(props: {
  readonly id: string; readonly testId: string; readonly label: string; readonly readout: string;
  readonly min: number; readonly max: number; readonly step: number; readonly value: number;
  readonly onChange: (value: number) => void;
}): ReactElement {
  const { id, testId, label, readout, min, max, step, value, onChange } = props;
  return (
    <div className="space-y-0.5">
      <label htmlFor={id} className="flex items-center justify-between gap-2 text-xs font-medium text-fg-2 [word-break:keep-all]">
        <span>{label}</span>
        <span data-testid={`${testId}-readout`} className="font-mono font-bold text-fg tabular-nums">{readout}</span>
      </label>
      <input
        id={id} data-testid={testId} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 w-full cursor-pointer accent-accent"
      />
    </div>
  );
}

/** 화풍 스펙트럼 어드바이저 · 3D→2D 안료/셀 변환 & 화풍 고정 AI 가디언 스튜디오 패널. */
export function StudioStyleSpectrumGuardianPanel(props: StudioStyleSpectrumGuardianPanelProps): ReactElement {
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const initialStyleId: StyleSpectrumId = props.initialStyleId ?? "k-webtoon-cel";
  const initialGenreMeta = getStoryGenreMeta(props.initialGenre ?? "romance");
  const defaultMoodPrompt = isEn ? initialGenreMeta.defaultMoodPromptEn : initialGenreMeta.defaultMoodPromptKo;

  const uid = useId();
  const [genre, setGenre] = useState<StoryGenreId>(initialGenreMeta.id);
  const [moodPrompt, setMoodPrompt] = useState<string>(defaultMoodPrompt);
  const [source3dId, setSource3dId] = useState<ThreeDSourceMaterialPresetId>("pbr-glass-cafe");
  const [assetId, setAssetId] = useState<ExternalAssetPresetId>("photo-bashed-street");
  const [session, setSession] = useState<StyleGuardianSession>(() => createStyleGuardianSession(initialStyleId));
  const [showJson, setShowJson] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const activeConfig = session.previewConfig ?? session.currentConfig;
  const activePreset = getStyleSpectrumPreset(activeConfig.styleId);
  const activeSource3d = getThreeDSourcePreset(source3dId);
  const activeAsset = getExternalAssetPreset(assetId);

  const proposalBundle = useMemo(() => proposeStyleSpectrumTop3({ genre, moodPrompt }), [genre, moodPrompt]);
  const transferPlan = useMemo(() => computeCrossMediaTransferPlan(activeSource3d, activeConfig), [activeSource3d, activeConfig]);
  const driftAudit = useMemo(() => auditExternalAssetStyleDrift(activeConfig, activeAsset), [activeConfig, activeAsset]);

  const isCurrentAssetUnified = activeConfig.unificationApplied && activeConfig.unificationSourceAssetId === activeAsset.assetId;
  const effectiveDriftScore = isCurrentAssetUnified ? driftAudit.unificationCorrection.projectedDriftScore : driftAudit.driftScore;
  const effectiveSeverity: StyleDriftSeverity = effectiveDriftScore < 25 ? "harmonized" : effectiveDriftScore < 55 ? "notice" : "high-drift";
  const jsonText = useMemo(() => exportStyleGuardianJson(session, proposalBundle, transferPlan, driftAudit), [session, proposalBundle, transferPlan, driftAudit]);

  const handleSelectGenre = (nextGenre: StoryGenreId): void => {
    const meta = getStoryGenreMeta(nextGenre);
    setGenre(meta.id);
    setMoodPrompt(isEn ? meta.defaultMoodPromptEn : meta.defaultMoodPromptKo);
    setStatusMessage(pick(`'${meta.labelKo}' 원고 기준으로 추천 화풍 Top-3를 갱신했습니다.`, `Updated Top-3 style suggestions for '${meta.labelEn}' manuscripts.`));
  };

  const handlePreviewStyle = (styleId: StyleSpectrumId): void => {
    const preset = getStyleSpectrumPreset(styleId);
    const next = previewStyleSpectrum(session, styleId);
    setSession(next);
    setStatusMessage(
      next.previewStyleId
        ? pick(`'${preset.nameKo}' 화풍을 비파괴 미리보기 중입니다. 적용 전까지 원본 기준은 유지됩니다.`, `Previewing '${preset.nameEn}' non-destructively. Baseline stays intact.`)
        : pick("화풍 미리보기를 종료했습니다.", "Closed style preview."),
    );
  };

  const handleApplyStyle = (styleId: StyleSpectrumId, labelKo?: string): void => {
    const preset = getStyleSpectrumPreset(styleId);
    const next = applyStyleSpectrum(session, styleId, labelKo);
    setSession(next);
    props.onApply?.(next.currentConfig, next);
    setStatusMessage(pick(`작가 승인으로 '${preset.nameKo}' 화풍을 비파괴 적용했습니다.`, `Applied '${preset.nameEn}' non-destructively.`));
  };

  const handleApplyUnification = (): void => {
    const next = applyStyleUnificationCorrection(session, driftAudit);
    setSession(next);
    props.onApply?.(next.currentConfig, next);
    setStatusMessage(
      pick(
        `'${activeAsset.labelKo}'에 원클릭 화풍 통일 보정을 적용했습니다 (이질감 ${driftAudit.driftScore}→${driftAudit.unificationCorrection.projectedDriftScore}점).`,
        `Applied 1-click style unification to '${activeAsset.labelEn}' (drift ${driftAudit.driftScore} → ${driftAudit.unificationCorrection.projectedDriftScore}).`,
      ),
    );
  };

  const handleTweak = (patch: StyleTuningTweakPatch): void => { setSession((prev) => tweakStyleGuardianConfig(prev, patch)); };

  const handleRevert = (): void => {
    const next = revertStyleGuardianSession(session);
    setSession(next);
    props.onRevert?.(next);
    setStatusMessage(pick("작가 원본 화풍 기준으로 1클릭 되돌렸습니다.", "Reverted style guardian back to baseline."));
  };

  const handleResetAll = (): void => {
    setGenre(initialGenreMeta.id);
    setMoodPrompt(defaultMoodPrompt);
    setSource3dId("pbr-glass-cafe");
    setAssetId("photo-bashed-street");
    setSession(createStyleGuardianSession(initialStyleId));
    setStatusMessage(pick("장르·에셋 선택과 화풍 가디언 세션을 초기값으로 복원했습니다.", "Reset genre, assets, and style guardian session."));
  };

  const handleCopyJson = (): void => {
    props.onExportJson?.(jsonText, session);
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(jsonText).catch(() => undefined);
    }
    setShowJson(true);
    setStatusMessage(pick(`화풍 DNA · 3D-2D 셰이더 JSON(${jsonText.length.toLocaleString("ko-KR")}B)을 복사했습니다.`, `Copied Style DNA & 3D-to-2D shader JSON (${jsonText.length.toLocaleString("en-US")} B).`));
  };

  const sessionStateLabel =
    session.status === "applied" ? pick("비파괴 적용됨", "Applied (Revertible)")
      : session.status === "tweaked" ? pick("슬라이더 미세 보정됨", "Tweaked (Revertible)")
        : session.status === "previewing" ? pick("미리보기 중", "Previewing")
          : session.status === "reverted" ? pick("원본 되돌림 완료", "Reverted")
            : pick("원본 기준 유지 중", "Baseline Intact");

  const severityLabel =
    effectiveSeverity === "harmonized" ? pick("화풍 조화 안정", "Harmonized")
      : effectiveSeverity === "notice" ? pick("이질감 주의", "Drift Notice") : pick("이질감 보정 필요", "High Drift");

  const moodInputId = `${uid}-mood-prompt`;

  return (
    <section
      data-testid="studio-style-spectrum-guardian-panel"
      aria-label={pick("화풍 스펙트럼 어드바이저 및 화풍 고정 AI 가디언", "Style Spectrum Advisor & Consistency Guardian")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${props.className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <Palette className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("화풍 스펙트럼 가디언", "Style Spectrum Guardian")}
            </span>
            <span data-testid="style-guardian-approval-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good [word-break:keep-all]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("작가 승인 후 적용", "Author Approval Required")}
            </span>
            <span data-testid="style-guardian-status-badge" className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2 tabular-nums">
              {sessionStateLabel}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("화풍 스펙트럼 추천 · 3D→2D 안료 변환 & 화풍 고정 가디언", "Style Spectrum · 3D-to-2D Transfer & Consistency Guardian")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "6대 대표 화풍을 원고 장르와 분위기에 맞춰 제안하고, 3D PBR 배경과 외부 에셋의 선 굵기·채도·질감을 작품 화풍에 맞게 비파괴 통일합니다.",
              "Recommends Top-3 art styles from your script mood, converts 3D PBR shaders into 2D cel/pigment palettes, and harmonizes external asset drift non-destructively.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="style-guardian-revert-btn" disabled={!session.canRevert} onClick={handleRevert} className={BTN_OUTLINE}>
            <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("원래대로 되돌리기", "Revert to Baseline")}
          </button>
          <button type="button" data-testid="style-guardian-export-json-btn" onClick={handleCopyJson} className={BTN_SOLID}>
            <Code2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("화풍 DNA JSON 복사", "Copy Style DNA JSON")}
          </button>
          <button type="button" data-testid="style-guardian-reset-btn" onClick={handleResetAll} className={BTN_OUTLINE}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div data-testid="style-guardian-status-banner" role="status" aria-live="polite" className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-4 rounded-xl border border-line bg-raised p-4 xl:col-span-6">
          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("원고 장르 선택 (6대 웹툰 장르)", "Manuscript Genre (6 Webtoon Genres)")}
            </span>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={pick("장르 선택", "Select genre")}>
              {STORY_GENRE_PRESETS.map((item) => (
                <button
                  key={item.id} type="button" data-testid={`style-genre-btn-${item.id}`}
                  aria-pressed={item.id === genre} onClick={() => handleSelectGenre(item.id)}
                  className={item.id === genre ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {isEn ? item.labelEn : item.labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={moodInputId} className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
              <Compass className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("대사 · 콘티 분위기 메모", "Dialogue & Storyboard Mood Notes")}
            </label>
            <textarea
              id={moodInputId} data-testid="style-mood-prompt-input" rows={2} value={moodPrompt}
              onChange={(e) => setMoodPrompt(e.target.value)}
              placeholder={pick("예: 안개 낀 궁궐 마당, 갈필 먹선과 한지 여백", "Enter dialogue or visual mood notes...")}
              className={`min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-3 [word-break:keep-all] ${FOCUS_RING}`}
            />
          </div>

          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">
                {pick("원고 맞춤 화풍 Top-3 제안 (비파괴)", "Manuscript Top-3 Style Recommendations")}
              </h3>
              <span data-testid="style-detected-signals" className="text-[11px] text-fg-3 [word-break:keep-all]">
                {proposalBundle.detectedSignals.slice(0, 4).join(" · ")}
              </span>
            </div>

            <div className="space-y-2">
              {proposalBundle.proposals.map((proposal) => {
                const isPreviewing = session.previewStyleId === proposal.styleId;
                const isApplied = session.appliedStyleId === proposal.styleId && !session.isTweaked;
                return (
                  <article
                    key={proposal.id} data-testid={`style-top3-card-${proposal.rank}`} data-style-id={proposal.styleId}
                    className={`rounded-xl border p-3 transition-colors motion-reduce:transition-none ${isApplied ? "border-accent bg-accent-soft" : "border-line bg-card"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md border border-accent bg-raised px-2 py-0.5 text-[11px] font-bold text-accent tabular-nums">{`TOP ${proposal.rank}`}</span>
                          <h4 className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? proposal.preset.nameEn : proposal.preset.nameKo}</h4>
                        </div>
                        <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? proposal.reasonEn : proposal.reasonKo}</p>
                      </div>
                      <span className="font-mono text-xs font-bold text-accent tabular-nums">{`${proposal.matchScore}점`}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button type="button" data-testid={`style-top3-preview-${proposal.rank}`} aria-pressed={isPreviewing} onClick={() => handlePreviewStyle(proposal.styleId)} className={isPreviewing ? BTN_ACTIVE : BTN_OUTLINE}>
                        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {pick("미리보기", "Preview")}
                      </button>
                      <button type="button" data-testid={`style-top3-apply-${proposal.rank}`} aria-pressed={isApplied} onClick={() => handleApplyStyle(proposal.styleId, `Top-${proposal.rank} 추천 '${proposal.preset.nameKo}' 적용`)} className={BTN_SOLID}>
                        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {isApplied ? pick("적용 중", "Applied") : pick("화풍 적용", "Apply Style")}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]">
                <GitCompare className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("3D→2D 안료/셀 변환 & 이질감 보정 전/후 도해", "3D-to-2D Cel/Pigment & Drift Comparison")}
              </h3>
              <div data-testid="style-active-preset-label" className="text-[11px] text-fg-2 [word-break:keep-all]">
                {session.previewConfig
                  ? pick(`미리보기 중 (미적용) · ${activePreset.nameKo}`, `Previewing (Uncommitted) · ${activePreset.nameEn}`)
                  : isEn ? activePreset.nameEn : activePreset.nameKo}
              </div>
            </div>
            <span data-testid="style-drift-severity-badge" data-severity={effectiveSeverity} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${driftBadgeClass(effectiveSeverity)}`}>
              {effectiveSeverity === "harmonized" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {`${severityLabel} (${effectiveDriftScore}점)`}
            </span>
          </div>

          <StyleTransferComparisonSvg activeConfig={activeConfig} transferPlan={transferPlan} driftAudit={driftAudit} effectiveDriftScore={effectiveDriftScore} isEn={isEn} />

          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
                <Boxes className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("3D 배경·소품 PBR 변환 대상", "3D Backdrop / Prop PBR Source")}
              </span>
              <span data-testid="style-seam-risk-delta" className="font-mono text-[11px] font-semibold text-good tabular-nums">
                {`${pick("이음새 위험", "Seam Risk")} ${transferPlan.beforeSeamRiskScore} → ${transferPlan.afterSeamRiskScore}`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={pick("3D PBR 소스 선택", "Select 3D PBR source")}>
              {THREE_D_SOURCE_PRESETS.map((src) => (
                <button key={src.id} type="button" data-testid={`style-3d-source-${src.id}`} aria-pressed={src.id === source3dId} onClick={() => setSource3dId(src.id)} className={src.id === source3dId ? BTN_ACTIVE : BTN_OUTLINE}>
                  {isEn ? src.labelEn : src.labelKo}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] sm:grid-cols-4 tabular-nums">
              <div className="rounded-md border border-line bg-raised px-2 py-1.5">
                <div className="text-[10px] text-fg-3">{pick("셀 밴드", "Cel Bands")}</div>
                <div data-testid="style-transfer-cel-bands" className="font-mono font-bold text-fg">{`${transferPlan.celBands}단`}</div>
              </div>
              <div className="rounded-md border border-line bg-raised px-2 py-1.5">
                <div className="text-[10px] text-fg-3">{pick("LT 노멀 임계", "LT Normal")}</div>
                <div className="font-mono font-bold text-fg">{transferPlan.ltExtraction.normalEdgeThreshold.toFixed(2)}</div>
              </div>
              <div className="rounded-md border border-line bg-raised px-2 py-1.5">
                <div className="text-[10px] text-fg-3">{pick("금속 반사 억제", "Metal Clamp")}</div>
                <div className="font-mono font-bold text-fg">{`${Math.round(transferPlan.specularConversion.metallicClamp * 100)}%`}</div>
              </div>
              <div className="rounded-md border border-line bg-raised px-2 py-1.5">
                <div className="text-[10px] text-fg-3">{pick("스크린톤 LPI", "Screentone")}</div>
                <div className="font-mono font-bold text-fg">{transferPlan.screentoneLpi > 0 ? `${transferPlan.screentoneLpi} LPI` : pick("무망점", "None")}</div>
              </div>
            </div>

            <p data-testid="style-transfer-summary" className="text-[11px] text-fg-2 [word-break:keep-all]">
              {isEn ? transferPlan.summaryEn : transferPlan.summaryKo}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]">
            <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("6대 대표 화풍 스펙트럼 프리셋", "6 Signature Style Spectrum Presets")}
          </h3>
          <span className="text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">
            {pick("바이올렛 휴(270~320°) 0% · OKLCH 안료 검증됨", "0% Violet Hue (270-320°) · Verified OKLCH Pigments")}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {STYLE_SPECTRUM_PRESETS.map((preset) => {
            const isPreviewing = session.previewStyleId === preset.id;
            const isActive = activeConfig.styleId === preset.id;
            const isApplied = session.appliedStyleId === preset.id && !session.isTweaked;
            return (
              <article
                key={preset.id} data-testid={`style-preset-card-${preset.id}`}
                className={`flex flex-col justify-between space-y-3 rounded-xl border p-4 transition-colors motion-reduce:transition-none ${isActive ? "border-accent bg-accent-soft" : "border-line bg-raised"}`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-fg [word-break:keep-all]">{isEn ? preset.nameEn : preset.nameKo}</h4>
                      <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? preset.taglineEn : preset.taglineKo}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1" aria-label={pick("화풍 안료 팔레트", "Style pigment swatches")}>
                      {preset.paletteSwatches.map((swatch, idx) => (
                        <span key={`${preset.id}-sw-${idx}`} className="h-4 w-4 rounded-full border border-line-strong" style={{ backgroundColor: formatOklch(swatch) }} />
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-line bg-card px-2.5 py-2 text-center text-[11px] tabular-nums">
                    <div>
                      <div className="text-[10px] text-fg-3">{pick("선 굵기", "Line")}</div>
                      <div className="font-mono font-semibold text-fg">{`${preset.lineWidthRangePx.min.toFixed(1)}~${preset.lineWidthRangePx.max.toFixed(1)}px`}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-fg-3">{pick("음영·톤", "Bands/LPI")}</div>
                      <div className="font-mono font-semibold text-fg">{preset.screentoneLpi > 0 ? `${preset.shadingSteps}단·${preset.screentoneLpi}` : `${preset.shadingSteps}단`}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-fg-3">{pick("채도·이동", "C / Shift")}</div>
                      <div className="font-mono font-semibold text-fg">{`${preset.maxChromaOklch.toFixed(2)} · ${preset.shadowHueShiftDeg >= 0 ? "+" : ""}${preset.shadowHueShiftDeg}°`}</div>
                    </div>
                  </div>

                  <p className="text-[11px] text-fg-2 [word-break:keep-all]">
                    {isEn ? `${preset.brushRecipe.lineBrushEn} · ${preset.brushRecipe.textureOverlayEn}` : `${preset.brushRecipe.lineBrushKo} · ${preset.brushRecipe.textureOverlayKo}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
                  <button type="button" data-testid={`style-preset-preview-${preset.id}`} aria-pressed={isPreviewing} onClick={() => handlePreviewStyle(preset.id)} className={isPreviewing ? BTN_ACTIVE : BTN_OUTLINE}>
                    <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {pick("미리보기", "Preview")}
                  </button>
                  <button type="button" data-testid={`style-preset-apply-${preset.id}`} aria-pressed={isApplied} onClick={() => handleApplyStyle(preset.id)} className={BTN_SOLID}>
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {isApplied ? pick("적용 중", "Applied") : pick("화풍 적용", "Apply")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]">
              <ScanSearch className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("화풍 편향 방지 가디언 (외부 에셋 이질감 진단)", "Style Drift Guardian (External Asset Audit)")}
            </h3>
            <span data-testid="style-drift-score-readout" className="font-mono text-xs font-bold text-fg tabular-nums">
              {`${pick("이질감", "Drift")} ${effectiveDriftScore}/100`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={pick("외부 에셋 선택", "Select external asset")}>
            {EXTERNAL_ASSET_PRESETS.map((asset) => (
              <button key={asset.assetId} type="button" data-testid={`style-external-asset-${asset.assetId}`} aria-pressed={asset.assetId === assetId} onClick={() => setAssetId(asset.assetId)} className={asset.assetId === assetId ? BTN_ACTIVE : BTN_OUTLINE}>
                {isEn ? asset.labelEn : asset.labelKo}
              </button>
            ))}
          </div>

          <div className="space-y-2 rounded-lg border border-line bg-card p-3">
            <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4 tabular-nums">
              <div><div className="text-[10px] text-fg-3">{pick("에셋 선화", "Asset Line")}</div><div className="font-mono font-semibold text-fg">{`${activeAsset.lineWidthPx.toFixed(2)}px`}</div></div>
              <div><div className="text-[10px] text-fg-3">{pick("선화 리샘플", "Resample")}</div><div className="font-mono font-semibold text-accent">{`${driftAudit.unificationCorrection.lineResampleScale.toFixed(2)}x`}</div></div>
              <div><div className="text-[10px] text-fg-3">{pick("채도 매칭", "Chroma Gain")}</div><div className="font-mono font-semibold text-accent">{`${Math.round(driftAudit.unificationCorrection.chromaMatchGain * 100)}%`}</div></div>
              <div><div className="text-[10px] text-fg-3">{pick("보정 예상", "Projected")}</div><div className="font-mono font-semibold text-good">{`${driftAudit.unificationCorrection.projectedDriftScore}점`}</div></div>
            </div>

            <p data-testid="style-drift-summary" className="text-xs text-fg-2 [word-break:keep-all]">{isEn ? driftAudit.summaryEn : driftAudit.summaryKo}</p>

            {(isEn ? driftAudit.warningsEn : driftAudit.warningsKo).slice(0, 3).map((warn) => (
              <div key={warn} className="rounded-md border border-warn bg-warning-soft px-2.5 py-1.5 text-[11px] font-medium text-warn [word-break:keep-all]">{warn}</div>
            ))}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" data-testid="style-unify-apply-btn" onClick={handleApplyUnification} className={BTN_SOLID}>
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                {isCurrentAssetUnified ? pick("화풍 통일 적용됨", "Unification Applied") : pick("원클릭 화풍 통일 적용", "Apply 1-Click Unification")}
              </button>
              <button type="button" data-testid="style-unify-revert-btn" disabled={!session.canRevert} onClick={handleRevert} className={BTN_OUTLINE}>
                <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                {pick("되돌리기", "Revert")}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-raised p-4 xl:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg [word-break:keep-all]">
              <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("선 굵기 · 셀 밴드 · 채도 미세 보정", "Line Width · Cel Bands · Chroma Tuning")}
            </h3>
            <span className="text-[11px] text-fg-3 [word-break:keep-all]">{pick("조정 즉시 SVG 도해와 3D→2D 셰이더에 반영", "Updates SVG preview and 3D-to-2D uniforms live")}</span>
          </div>

          <div className="grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-2">
            <StyleSliderRow id={`${uid}-line-width`} testId="style-slider-line-width" label={pick("선 굵기 (px)", "Line Width (px)")} readout={`${activeConfig.lineWidthPx.toFixed(1)}px`} min={0.5} max={4.2} step={0.1} value={activeConfig.lineWidthPx} onChange={(v) => handleTweak({ lineWidthPx: v })} />
            <StyleSliderRow id={`${uid}-shading-steps`} testId="style-slider-shading-steps" label={pick("셀 음영 단계", "Cel Shading Bands")} readout={`${activeConfig.shadingSteps}단`} min={2} max={6} step={1} value={activeConfig.shadingSteps} onChange={(v) => handleTweak({ shadingSteps: v })} />
            <StyleSliderRow id={`${uid}-max-chroma`} testId="style-slider-max-chroma" label={pick("채도 상한 (OKLCH C)", "Max Chroma (OKLCH C)")} readout={activeConfig.maxChromaOklch.toFixed(2)} min={0.01} max={0.26} step={0.01} value={activeConfig.maxChromaOklch} onChange={(v) => handleTweak({ maxChromaOklch: v })} />
            <StyleSliderRow id={`${uid}-paper-grain`} testId="style-slider-paper-grain" label={pick("종이 그레인 오버레이", "Paper Grain Overlay")} readout={`${Math.round(activeConfig.paperGrainStrength * 100)}%`} min={0} max={1} step={0.02} value={activeConfig.paperGrainStrength} onChange={(v) => handleTweak({ paperGrainStrength: v })} />
            <div className="sm:col-span-2">
              <StyleSliderRow id={`${uid}-shadow-hue`} testId="style-slider-shadow-hue-shift" label={pick("그림자 색온도 이동 (° · 바이올렛 구간 자동 회피)", "Shadow Hue Shift (° · Auto Violet-Free)")} readout={`${activeConfig.shadowHueShiftDeg >= 0 ? "+" : ""}${activeConfig.shadowHueShiftDeg}°`} min={-40} max={40} step={2} value={activeConfig.shadowHueShiftDeg} onChange={(v) => handleTweak({ shadowHueShiftDeg: v })} />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg [word-break:keep-all]">{pick("화풍 DNA · 3D→2D NPR 셰이더 JSON 내보내기", "Style DNA & 3D-to-2D NPR Shader JSON")}</span>
          <button type="button" data-testid="style-toggle-json-btn" aria-expanded={showJson} onClick={() => setShowJson((prev) => !prev)} className={BTN_OUTLINE}>
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {showJson ? pick("JSON 닫기", "Hide JSON") : pick("JSON 미리보기", "Show JSON")}
          </button>
        </div>
        {showJson ? (
          <pre data-testid="style-json-preview" className="max-h-60 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2 tabular-nums">
            {jsonText}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
