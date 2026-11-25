/**
 * Wave 45B — 탈-바이올렛 8대 에디토리얼 무드보드 · 5안료 스펙트럼 팔레트 디렉터 패널.
 *
 * - 8대 탈-바이올렛(hue 270~320도 완전 배제) 에디토리얼 아틀리에 프리셋 카드
 * - 85/10/5 색채 비율 연동 슬라이더 및 5안료(바탕·표면·먹·도메인·강조) 미세 조율
 * - 바이올렛 0% · WCAG 2.1(4.5:1+) · APCA(Lc) 실시간 배지 및 원클릭 대비·탈바이올렛 보정
 * - 순수 시맨틱 SVG 매거진 포스터 프리뷰(oklch 및 currentColor 전용) + CSS/JSON/CSP Swatch/SVG 복사
 * - Calm Atelier 시맨틱 토큰 전용(원시 색·광범위 트랜지션·기본 빈 객체 props·스토리지·BigInt·반짝이 장식 아이콘 0건)
 */

import {
  AlertTriangle, CheckCircle2, Code2, Copy, Layers, Palette,
  RotateCcw, ShieldAlert, ShieldCheck, SlidersHorizontal, Wand2,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import {
  SPECTRUM_CHROMATIC_DISCIPLINE, SPECTRUM_DOMAIN_IDS, SPECTRUM_DOMAIN_PIGMENTS,
} from "@/shared/lib/spectrum-editorial-tokens";

import {
  EDITORIAL_MOODBOARD_PRESETS, PIGMENT_ROLE_IDS, PIGMENT_ROLE_LABELS, TARGET_CHROMATIC_RATIO,
  auditChromaticBalance, autoRepairPaletteContrast, buildEditorialPosterSvg,
  exportPaletteCspSwatch, exportPaletteCssVariables, exportPaletteOklchJson,
  formatOklch, formatOklchCompact, getEditorialMoodboardPreset, isVioletSlopColor, rebalanceRatioTriple,
  type AutoRepairPaletteResult, type ChromaticAuditWarningSeverity, type ChromaticBalanceAuditReport,
  type ChromaticRatioSpec, type EditorialMoodboardPresetId, type OklchColor, type PigmentRoleId,
} from "./editorial-moodboard-engine";

import { OperationStatus } from "./OperationStatus";
import { useExampleNotification } from "./use-example-notification";
import { useClipboardOutput } from "./use-clipboard-output";

export interface StudioEditorialMoodboardPanelProps {
  readonly initialPresetId?: EditorialMoodboardPresetId;
  readonly initialRatio?: Partial<ChromaticRatioSpec>;
  readonly initialPosterHeadline?: string;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onAuditChange?: (audit: ChromaticBalanceAuditReport) => void;
  readonly onExportCss?: (css: string, audit: ChromaticBalanceAuditReport) => void;
  readonly onExportJson?: (json: string, audit: ChromaticBalanceAuditReport) => void;
  readonly onExportCsp?: (cspJson: string, audit: ChromaticBalanceAuditReport) => void;
  readonly onExportSvg?: (svg: string, audit: ChromaticBalanceAuditReport) => void;
}

type ExportPreviewTab = "css" | "json" | "csp" | "svg" | "hidden";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const scoreToneClass = (score: number): string => (score >= 85 ? "text-good" : score >= 65 ? "text-warn" : "text-bad");
const warningToneClass = (severity: ChromaticAuditWarningSeverity): string =>
  severity === "critical" ? "border-bad bg-bad-soft text-bad" : severity === "warn" ? "border-warn bg-warning-soft text-warn" : "border-cool bg-info-soft text-cool";

function MoodboardKpiCell(props: {
  readonly label: string; readonly value: string; readonly subtext: string;
  readonly testId: string; readonly valueTone?: string;
}): ReactElement {
  const { label, value, subtext, testId, valueTone = "text-fg" } = props;
  return (
    <div className="rounded-xl bg-raised px-3.5 py-3">
      <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{label}</div>
      <div data-testid={testId} className={`mt-0.5 text-base font-bold tabular-nums ${valueTone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">{subtext}</div>
    </div>
  );
}

function RangeSliderRow(props: {
  readonly id: string; readonly testId: string; readonly label: string; readonly readout: string;
  readonly readoutTestId?: string; readonly readoutTone?: string;
  readonly min: number; readonly max: number; readonly step: number; readonly value: number;
  readonly onChange: (value: number) => void;
}): ReactElement {
  const { id, testId, label, readout, readoutTestId, readoutTone = "text-fg", min, max, step, value, onChange } = props;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-center justify-between text-xs font-medium text-fg-2 [word-break:keep-all]">
        <span>{label}</span>
        <span data-testid={readoutTestId} className={`font-bold tabular-nums ${readoutTone}`}>{readout}</span>
      </label>
      <input
        id={id} data-testid={testId} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 w-full cursor-pointer accent-accent"
      />
    </div>
  );
}

function EditorialPosterPreviewSvg(props: {
  readonly audit: ChromaticBalanceAuditReport; readonly headline: string; readonly isEn: boolean;
}): ReactElement {
  const { audit, headline, isEn } = props;
  const p = audit.resolvedPigments;
  const groundCss = formatOklch(p.ground.color);
  const surfaceCss = formatOklch(p.surface.color);
  const inkCss = formatOklch(p.ink.color);
  const domainCss = formatOklch(p.domain.color);
  const accentCss = formatOklch(p.accent.color);
  const onAccentCss = formatOklch(audit.resolvedOnAccent);

  const safeHeadline = headline;
  const subtitle = isEn ? audit.preset.posterTaglineEn : audit.preset.posterTaglineKo;
  const ratioBarW = 364;
  const neutralW = Math.max(12, Math.round((ratioBarW * audit.ratio.normalized.neutralPct) / 100));
  const domainW = Math.max(6, Math.round((ratioBarW * audit.ratio.normalized.domainPct) / 100));
  const accentW = Math.max(6, ratioBarW - neutralW - domainW);
  const violetBadge = audit.isVioletFree
    ? (isEn ? "VIOLET 0%" : "바이올렛 0%")
    : (isEn ? `VIOLET ${audit.violetSlopPct}%` : `슬롭 ${audit.violetSlopPct}%`);

  return (
    <svg
      data-testid="moodboard-poster-svg" data-preset={audit.preset.id}
      data-ratio={`${audit.ratio.normalized.neutralPct}/${audit.ratio.normalized.domainPct}/${audit.ratio.normalized.accentPct}`}
      data-violet-free={String(audit.isVioletFree)} data-min-wcag={audit.minWcagRatio.toFixed(2)}
      viewBox="0 0 420 560" className="mx-auto w-full max-w-[336px] rounded-xl border border-line-strong"
      style={{ color: inkCss }} role="img"
      aria-label={isEn ? `${safeHeadline} editorial poster preview` : `${safeHeadline} 에디토리얼 매거진 포스터 프리뷰`}
    >
      <rect x="0" y="0" width="420" height="560" rx="14" fill={groundCss} />
      <rect x="14" y="14" width="392" height="532" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.22} strokeWidth="1" />
      <line x1="28" y1="54" x2="392" y2="54" stroke="currentColor" strokeOpacity={0.2} strokeWidth="1" />
      <text x="28" y="40" fill="currentColor" fontSize="10" fontWeight="700" letterSpacing="1.4" fontFamily="monospace">
        {`${audit.preset.code} · 85/10/5 ATELIER`}
      </text>
      <rect x="298" y="24" width="94" height="22" rx="11" fill={accentCss} />
      <text x="345" y="38.5" textAnchor="middle" fill={onAccentCss} fontSize="9" fontWeight="700">{violetBadge}</text>

      <rect x="28" y="72" width="364" height="236" rx="10" fill={surfaceCss} stroke="currentColor" strokeOpacity={0.16} strokeWidth="1" />
      <path d="M28 242 L252 130 L392 184 L392 308 L28 308 Z" fill={domainCss} fillOpacity={0.88} />
      <rect x="46" y="92" width="128" height="96" rx="6" fill={groundCss} fillOpacity={0.92} stroke="currentColor" strokeOpacity={0.24} strokeWidth="1" />
      <line x1="60" y1="118" x2="154" y2="118" stroke="currentColor" strokeOpacity={0.35} strokeWidth="1.2" />
      <line x1="60" y1="136" x2="136" y2="136" stroke="currentColor" strokeOpacity={0.22} strokeWidth="1" />
      <text x="60" y="168" fill={domainCss} fontSize="11" fontWeight="700" fontFamily="monospace">
        {`${Math.round(audit.ratio.normalized.neutralPct)}·${Math.round(audit.ratio.normalized.domainPct)}·${Math.round(audit.ratio.normalized.accentPct)}`}
      </text>

      <circle cx="324" cy="148" r="36" fill={accentCss} />
      <text x="324" y="145" textAnchor="middle" fill={onAccentCss} fontSize="11" fontWeight="800" fontFamily="monospace">
        {`${Math.round(audit.ratio.normalized.accentPct)}%`}
      </text>
      <text x="324" y="160" textAnchor="middle" fill={onAccentCss} fontSize="8.5" fontWeight="600">{isEn ? "SEAL" : "낙관"}</text>

      <text x="28" y="356" fill="currentColor" fontSize="30" fontWeight="800">{safeHeadline}</text>
      <text x="28" y="382" fill="currentColor" fillOpacity={0.78} fontSize="12" fontWeight="500">{subtitle}</text>

      <rect x="28" y="398" width="156" height="22" rx="4" fill={surfaceCss} stroke="currentColor" strokeOpacity={0.2} strokeWidth="1" />
      <text x="38" y="413" fill="currentColor" fontSize="9.5" fontWeight="700" fontFamily="monospace">
        {`WCAG ${audit.minWcagRatio.toFixed(1)}:1 · Lc ${Math.round(audit.minApcaAbsLc)}`}
      </text>
      <text x="392" y="413" textAnchor="end" fill={domainCss} fontSize="9.5" fontWeight="700">
        {isEn ? audit.preset.nameEn : audit.preset.nameKo}
      </text>

      <g data-testid="moodboard-poster-ratio-bar">
        <rect x="28" y="438" width={neutralW} height="16" rx="4" fill={surfaceCss} stroke="currentColor" strokeOpacity={0.3} strokeWidth="1" />
        <rect x={28 + neutralW} y="438" width={domainW} height="16" fill={domainCss} />
        <rect x={28 + neutralW + domainW} y="438" width={accentW} height="16" rx="3" fill={accentCss} />
        <text x="28" y="466" fill="currentColor" fillOpacity={0.72} fontSize="8.5" fontFamily="monospace">
          {`85/10/5 → ${audit.ratio.normalized.neutralPct}% / ${audit.ratio.normalized.domainPct}% / ${audit.ratio.normalized.accentPct}%`}
        </text>
      </g>

      {PIGMENT_ROLE_IDS.map((role, index) => {
        const x = 28 + index * 74;
        const spec = p[role];
        return (
          <g key={role} data-pigment-swatch={role}>
            <rect x={x} y="476" width="68" height="34" rx="5" fill={formatOklch(spec.color)} stroke="currentColor" strokeOpacity={0.24} strokeWidth="1" />
            <text x={x + 4} y="523" fill="currentColor" fontSize="8.5" fontWeight="600">
              {(isEn ? PIGMENT_ROLE_LABELS[role].en : spec.nameKo).slice(0, 10)}
            </text>
            <text x={x + 4} y="535" fill="currentColor" fillOpacity={0.68} fontSize="7.5" fontFamily="monospace">
              {`H${Math.round(spec.color.h)}° L${spec.color.l.toFixed(2)}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 탈-바이올렛 8대 에디토리얼 무드보드 · 5안료 스펙트럼 팔레트 디렉터 패널. */
export function StudioEditorialMoodboardPanel(props: StudioEditorialMoodboardPanelProps): ReactElement {
  const {
    initialPresetId = "seoul-vermilion-ink", initialRatio, initialPosterHeadline,
    locale = "ko", className, onAuditChange, onExportCss, onExportJson, onExportCsp, onExportSvg,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [presetId, setPresetId] = useState<EditorialMoodboardPresetId>(initialPresetId);
  const [pigmentOverrides, setPigmentOverrides] = useState<Partial<Record<PigmentRoleId, OklchColor>>>({});
  const [onAccentOverride, setOnAccentOverride] = useState<OklchColor | undefined>(undefined);
  const [ratio, setRatio] = useState<ChromaticRatioSpec>(() => ({
    neutralPct: initialRatio?.neutralPct ?? TARGET_CHROMATIC_RATIO.neutralPct,
    domainPct: initialRatio?.domainPct ?? TARGET_CHROMATIC_RATIO.domainPct,
    accentPct: initialRatio?.accentPct ?? TARGET_CHROMATIC_RATIO.accentPct,
  }));
  const [activePigmentRole, setActivePigmentRole] = useState<PigmentRoleId>("accent");
  const [posterHeadline, setPosterHeadline] = useState<string>(() => {
    if (initialPosterHeadline !== undefined) return initialPosterHeadline;
    const basePreset = getEditorialMoodboardPreset(initialPresetId);
    return isEn ? basePreset.posterHeadlineEn : basePreset.posterHeadlineKo;
  });
  const [exportTab, setExportTab] = useState<ExportPreviewTab>("css");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [lastRepair, setLastRepair] = useState<AutoRepairPaletteResult | null>(null);

  const audit = useMemo<ChromaticBalanceAuditReport>(
    () => auditChromaticBalance({ presetId, pigmentOverrides, onAccentOverride, ratio }),
    [presetId, pigmentOverrides, onAccentOverride, ratio],
  );
  const cssExport = useMemo<string>(() => exportPaletteCssVariables(audit), [audit]);
  const jsonExport = useMemo<string>(() => exportPaletteOklchJson(audit), [audit]);
  const cspExport = useMemo<string>(() => exportPaletteCspSwatch(audit), [audit]);
  const svgExport = useMemo<string>(() => buildEditorialPosterSvg(audit, { headline: posterHeadline, locale }), [audit, posterHeadline, locale]);

  const auditNotification = useExampleNotification(onAuditChange);
  const cssNotification = useExampleNotification<{ readonly text: string; readonly audit: ChromaticBalanceAuditReport }>(onExportCss ? (value) => onExportCss(value.text, value.audit) : undefined);
  const jsonNotification = useExampleNotification<{ readonly text: string; readonly audit: ChromaticBalanceAuditReport }>(onExportJson ? (value) => onExportJson(value.text, value.audit) : undefined);
  const cspNotification = useExampleNotification<{ readonly text: string; readonly audit: ChromaticBalanceAuditReport }>(onExportCsp ? (value) => onExportCsp(value.text, value.audit) : undefined);
  const svgNotification = useExampleNotification<{ readonly text: string; readonly audit: ChromaticBalanceAuditReport }>(onExportSvg ? (value) => onExportSvg(value.text, value.audit) : undefined);
  const clipboard = useClipboardOutput();
  const channels = [auditNotification, cssNotification, jsonNotification, cspNotification, svgNotification, clipboard];
  const busy = channels.some((channel) => channel.status === "pending");
  const lastAudit = useRef<ChromaticBalanceAuditReport | null>(null);
  const { notify: notifyAudit } = auditNotification;
  useEffect(() => { if (lastAudit.current !== audit) { lastAudit.current = audit; notifyAudit(audit); } }, [audit, notifyAudit]);

  const activePigment = audit.resolvedPigments[activePigmentRole];

  const handleSelectPreset = (nextId: EditorialMoodboardPresetId): void => {
    const nextPreset = getEditorialMoodboardPreset(nextId);
    setPresetId(nextId);
    setPigmentOverrides({});
    setOnAccentOverride(undefined);
    setRatio({ ...nextPreset.recommendedRatio });
    setPosterHeadline(isEn ? nextPreset.posterHeadlineEn : nextPreset.posterHeadlineKo);
    setLastRepair(null);
    setStatusMessage(pick(`${nextPreset.nameKo} (${nextPreset.code}) 탈-바이올렛 프리셋을 적용했습니다.`, `Loaded ${nextPreset.nameEn} (${nextPreset.code}) editorial preset.`));
  };

  const handleRatioChange = (role: "neutral" | "domain" | "accent", nextValue: number): void => {
    setRatio((prev) => rebalanceRatioTriple(role, nextValue, prev));
    setLastRepair(null);
  };

  const handleUpdateActivePigment = (patch: Partial<OklchColor>): void => {
    const current = audit.resolvedPigments[activePigmentRole].color;
    setPigmentOverrides((prev) => ({ ...prev, [activePigmentRole]: { ...current, ...patch } }));
    setLastRepair(null);
  };

  const handleInjectSlopTest = (): void => {
    setPigmentOverrides((prev) => ({ ...prev, accent: { l: 0.72, c: 0.21, h: 294 } }));
    setActivePigmentRole("accent");
    setLastRepair(null);
    setStatusMessage(pick("강조 안료에 바이올렛(294°)·저대비 상태를 모의 주입했습니다. 자동 보정으로 즉시 복구할 수 있습니다.", "Injected violet 294° low-contrast Accent sample to verify audit and auto-repair."));
  };

  const handleAutoRepair = (): void => {
    const repaired = autoRepairPaletteContrast(
      { presetId, pigmentOverrides, onAccentOverride, ratio },
      { repairVioletSlop: true, rebalanceRatio: true },
    );
    setPigmentOverrides(repaired.repairedPigments);
    setOnAccentOverride(repaired.repairedOnAccent);
    setRatio(repaired.repairedRatio);
    setLastRepair(repaired);
    setStatusMessage(
      repaired.fixes.length > 0
        ? pick(`${repaired.fixes.length}건을 자동 보정했습니다 (균형 ${repaired.beforeAudit.overallScore} → ${repaired.afterAudit.overallScore}점 · 최소 대비 ${repaired.afterAudit.minWcagRatio.toFixed(2)}:1).`, `Auto-repaired ${repaired.fixes.length} items (score ${repaired.beforeAudit.overallScore} -> ${repaired.afterAudit.overallScore}).`)
        : pick("현재 팔레트는 바이올렛 0%·WCAG 4.5:1 이상·85/10/5 기준을 모두 충족합니다.", "Palette already passes 0% violet slop, WCAG 4.5:1+, and 85/10/5 balance."),
    );
  };

  const handleRestoreGoldenRatio = (): void => {
    setRatio({ ...TARGET_CHROMATIC_RATIO });
    setLastRepair(null);
    setStatusMessage(pick("색채 비율을 85/10/5 에디토리얼 황금비로 복원했습니다.", "Restored 85/10/5 editorial ratio."));
  };

  const handleReset = (): void => {
    const base = getEditorialMoodboardPreset(initialPresetId);
    setPresetId(initialPresetId);
    setPigmentOverrides({});
    setOnAccentOverride(undefined);
    setRatio({
      neutralPct: initialRatio?.neutralPct ?? TARGET_CHROMATIC_RATIO.neutralPct,
      domainPct: initialRatio?.domainPct ?? TARGET_CHROMATIC_RATIO.domainPct,
      accentPct: initialRatio?.accentPct ?? TARGET_CHROMATIC_RATIO.accentPct,
    });
    setPosterHeadline(initialPosterHeadline ?? (isEn ? base.posterHeadlineEn : base.posterHeadlineKo));
    setActivePigmentRole("accent");
    setLastRepair(null);
    setStatusMessage(pick("무드보드 프리셋과 5안료 설정을 초기 상태로 되돌렸습니다.", "Reset moodboard preset and 5 pigments to defaults."));
  };

  const handleCopy = (kind: "css" | "json" | "csp" | "svg"): void => {
    if (channels.some((channel) => channel.isPending())) return;
    const payloads = { css: cssExport, json: jsonExport, csp: cspExport, svg: svgExport };
    const notifications = { css: cssNotification, json: jsonNotification, csp: cspNotification, svg: svgNotification };
    const text = payloads[kind];
    notifications[kind].notify({ text, audit });
    clipboard.notify(text);
    setExportTab(kind);
  };

  const activeExportContent =
    exportTab === "css" ? cssExport : exportTab === "json" ? jsonExport : exportTab === "csp" ? cspExport : exportTab === "svg" ? svgExport : "";

  return (
    <section
      data-testid="studio-editorial-moodboard-panel"
      aria-label={pick("탈-바이올렛 8대 에디토리얼 무드보드 및 5안료 스펙트럼 팔레트 디렉터", "De-Violeted Editorial Moodboard & 5-Pigment Palette Director")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${className ?? ""}`}
    >
      <OperationStatus channel="audit" {...auditNotification} pending={busy} isEn={isEn} />
      <OperationStatus channel="css" {...cssNotification} pending={busy} isEn={isEn} />
      <OperationStatus channel="json" {...jsonNotification} pending={busy} isEn={isEn} />
      <OperationStatus channel="csp" {...cspNotification} pending={busy} isEn={isEn} />
      <OperationStatus channel="svg" {...svgNotification} pending={busy} isEn={isEn} />
      <OperationStatus channel="clipboard" {...clipboard} pending={busy} isEn={isEn} />
      <p className="text-xs text-fg-2">{pick("CPU 색상 계산 예제입니다. 실제 화면 접근성·CSP 호환성·원고 자동 반영·저장·저작권은 확인하지 않습니다. 닫으면 입력이 사라집니다.", "CPU color example only. Actual display accessibility, CSP compatibility, artwork apply, storage and rights are not verified. Inputs disappear when closed.")}</p>
      <fieldset disabled={busy} className="contents">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <Palette className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("5안료 스펙트럼 · 85/10/5 디렉터", "5-Pigment Spectrum · 85/10/5 Director")}
            </span>
            <span
              data-testid="moodboard-violet-badge" data-violet-free={String(audit.isVioletFree)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${audit.isVioletFree ? "border-good bg-raised text-good" : "border-bad bg-bad-soft text-bad"}`}
            >
              {audit.isVioletFree ? <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {audit.isVioletFree ? pick("바이올렛 0% · AI 티 차단", "Violet 0% · Slop-Free") : pick(`바이올렛 ${audit.violetSlopPct}% 감지 (${audit.violetViolations.length}건)`, `Violet ${audit.violetSlopPct}% Detected`)}
            </span>
            <span
              data-testid="moodboard-contrast-badge" data-wcag-pass={String(audit.allPairsPassWcagAa)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${audit.allPairsPassWcagAa ? "border-good bg-raised text-good" : "border-bad bg-bad-soft text-bad"}`}
            >
              {audit.allPairsPassWcagAa ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {audit.allPairsPassWcagAa ? pick(`대비 ${audit.minWcagRatio.toFixed(2)}:1 · WCAG 4.5:1 통과`, `Contrast ${audit.minWcagRatio.toFixed(2)}:1 · AA 4.5+`) : pick(`대비 ${audit.minWcagRatio.toFixed(2)}:1 · 4.5:1 미달`, `Contrast ${audit.minWcagRatio.toFixed(2)}:1 · Below 4.5`)}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("탈-바이올렛 8대 에디토리얼 무드보드 디렉터", "De-Violeted 8 Editorial Moodboard Director")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("색상환 270–320° 바이올렛 클리셰를 배제한 8대 화실 프리셋과 85/10/5 색채 비율, OKLCH 기반 WCAG 2.1·APCA 대비를 즉시 검증하고 내보냅니다.", "Apply 8 violet-free atelier presets (excluding 270–320°), audit 85/10/5 balance with OKLCH WCAG 2.1/APCA contrast, and export CSS, JSON, CSP, or SVG.")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="moodboard-autorepair-btn" onClick={handleAutoRepair} className={BTN_SOLID}>
            <Wand2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("대비·탈바이올렛 보정", "Auto-Repair Contrast")}
          </button>
          <button type="button" data-testid="moodboard-inject-slop-btn" onClick={handleInjectSlopTest} className={BTN_OUTLINE}>
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("슬롭 주입 테스트", "Test Violet Slop")}
          </button>
          <button type="button" data-testid="moodboard-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div data-testid="moodboard-status-banner" role="status" aria-live="polite" className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoodboardKpiCell
          testId="moodboard-kpi-score" label={pick("에디토리얼 색채 균형", "Editorial Balance Score")}
          value={`${audit.overallScore} / 100`}
          subtext={audit.warnings.length === 0 ? pick("바이올렛·대비·비율 경고 0건", "0 chromatic warnings") : pick(`개선 권장 ${audit.warnings.length}건 감지`, `${audit.warnings.length} warnings active`)}
          valueTone={scoreToneClass(audit.overallScore)}
        />
        <MoodboardKpiCell
          testId="moodboard-kpi-ratio" label={pick("현재 85 / 10 / 5 비율", "Current 85 / 10 / 5 Split")}
          value={`${audit.ratio.normalized.neutralPct} / ${audit.ratio.normalized.domainPct} / ${audit.ratio.normalized.accentPct}%`}
          subtext={pick(`기준 편차 ${audit.ratio.totalDeviationPct}% · ${audit.ratio.status === "optimal" ? "최적 균형" : audit.ratio.status === "drift" ? "소폭 편차" : "재조정 권장"}`, `Deviation ${audit.ratio.totalDeviationPct}% · ${audit.ratio.status}`)}
          valueTone={audit.ratio.status === "optimal" ? "text-good" : audit.ratio.status === "drift" ? "text-warn" : "text-bad"}
        />
        <MoodboardKpiCell
          testId="moodboard-kpi-violet" label={pick("바이올렛(270–320°) 점유", "Violet Slop (270–320°)")}
          value={`${audit.violetSlopPct}%`}
          subtext={pick(`검사 ${audit.inspectedColorCount}색 중 위반 ${audit.violetViolations.length}건`, `${audit.violetViolations.length} of ${audit.inspectedColorCount} flagged`)}
          valueTone={audit.isVioletFree ? "text-good" : "text-bad"}
        />
        <MoodboardKpiCell
          testId="moodboard-kpi-contrast" label={pick("최소 WCAG 2.1 · APCA", "Min WCAG 2.1 · APCA")}
          value={`${audit.minWcagRatio.toFixed(2)}:1 · Lc ${Math.round(audit.minApcaAbsLc)}`}
          subtext={pick(`5대 대비 쌍 중 ${audit.passingWcagPairCount}/${audit.totalContrastPairCount} 통과`, `${audit.passingWcagPairCount}/${audit.totalContrastPairCount} pass AA 4.5:1`)}
          valueTone={audit.allPairsPassWcagAa ? "text-good" : "text-bad"}
        />
      </div>

      <section aria-label={pick("8대 탈-바이올렛 프리셋 선택", "8 Violet-Free Editorial Presets")} className="space-y-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg [word-break:keep-all]">
            <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("1. 8대 탈-바이올렛 에디토리얼 아틀리에 프리셋", "1. 8 Violet-Free Editorial Atelier Presets")}
          </h3>
          <span className="text-[11px] font-medium text-fg-3 tabular-nums">
            {pick(`현재 선택: ${audit.preset.code} · ${audit.preset.nameKo}`, `Selected: ${audit.preset.code} · ${audit.preset.nameEn}`)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {EDITORIAL_MOODBOARD_PRESETS.map((preset) => {
            const isSelected = preset.id === presetId;
            return (
              <button
                key={preset.id} type="button" data-testid={`moodboard-preset-${preset.id}`} aria-pressed={isSelected}
                onClick={() => handleSelectPreset(preset.id)}
                className={`flex min-h-11 cursor-pointer flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${isSelected ? "border-accent bg-accent-soft" : "border-line bg-canvas hover:border-line-strong hover:bg-raised"}`}
              >
                <div className="flex w-full items-center justify-between gap-1.5">
                  <span className="text-[10px] font-bold tracking-wider text-fg-3 tabular-nums">{preset.code}</span>
                  <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] font-medium text-fg-2">
                    {preset.polarity === "light" ? pick("라이트 지면", "Light Paper") : pick("다크 아틀리에", "Dark Atelier")}
                  </span>
                </div>
                <div className="text-xs font-bold text-fg">{isEn ? preset.nameEn : preset.nameKo}</div>
                <div className="flex h-3 w-full overflow-hidden rounded-full border border-line-strong" aria-hidden="true">
                  {PIGMENT_ROLE_IDS.map((role) => (
                    <span key={role} className="h-full flex-1" style={{ backgroundColor: formatOklch(preset.pigments[role].color) }} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(isEn ? preset.genreTagsEn : preset.genreTagsKo).map((tag) => (
                    <span key={tag} className="rounded bg-raised px-1.5 py-0.5 text-[10px] text-fg-2">{tag}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 border-t border-line pt-4 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-7">
          <div className="space-y-3 rounded-xl bg-canvas p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg [word-break:keep-all]">
                <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("2. 85 / 10 / 5 색채 비율 시뮬레이터", "2. 85 / 10 / 5 Chromatic Ratio Controls")}
              </h3>
              <button type="button" data-testid="moodboard-restore-ratio-btn" onClick={handleRestoreGoldenRatio} className={BTN_OUTLINE}>
                {pick("85/10/5 복원", "Restore 85/10/5")}
              </button>
            </div>

            <div className="flex h-4 w-full overflow-hidden rounded-full border border-line-strong" aria-hidden="true">
              <div style={{ width: `${audit.ratio.normalized.neutralPct}%`, backgroundColor: formatOklch(audit.resolvedPigments.surface.color) }} />
              <div style={{ width: `${audit.ratio.normalized.domainPct}%`, backgroundColor: formatOklch(audit.resolvedPigments.domain.color) }} />
              <div style={{ width: `${audit.ratio.normalized.accentPct}%`, backgroundColor: formatOklch(audit.resolvedPigments.accent.color) }} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <RangeSliderRow id={`${uid}-r-n`} testId="moodboard-slider-neutral" readoutTestId="moodboard-neutral-readout" label={pick("바탕·여백 (85%)", "Neutral (85%)")} readout={`${audit.ratio.normalized.neutralPct}%`} min={45} max={96} step={1} value={Math.round(audit.ratio.normalized.neutralPct)} onChange={(v) => handleRatioChange("neutral", v)} />
              <RangeSliderRow id={`${uid}-r-d`} testId="moodboard-slider-domain" readoutTestId="moodboard-domain-readout" label={pick("도메인 (10%)", "Domain (10%)")} readout={`${audit.ratio.normalized.domainPct}%`} min={2} max={40} step={1} value={Math.round(audit.ratio.normalized.domainPct)} onChange={(v) => handleRatioChange("domain", v)} />
              <RangeSliderRow id={`${uid}-r-a`} testId="moodboard-slider-accent" readoutTestId="moodboard-accent-readout" label={pick("강조 낙관 (5%)", "Accent (5%)")} readout={`${audit.ratio.normalized.accentPct}%`} min={1} max={25} step={1} value={Math.round(audit.ratio.normalized.accentPct)} onChange={(v) => handleRatioChange("accent", v)} />
            </div>
          </div>

          <div className="space-y-3 rounded-xl bg-canvas p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick("3. 5안료 OKLCH 스펙트럼 미세 조율", "3. 5-Pigment OKLCH Spectrum Tuner")}</h3>
              <span className="text-[11px] font-medium text-fg-3 tabular-nums">{formatOklch(activePigment.color)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {PIGMENT_ROLE_IDS.map((role) => {
                const spec = audit.resolvedPigments[role];
                const isViolet = isVioletSlopColor(spec.color);
                const isActive = role === activePigmentRole;
                return (
                  <button
                    key={role} type="button" data-testid={`moodboard-pigment-tab-${role}`} aria-pressed={isActive}
                    onClick={() => setActivePigmentRole(role)}
                    className={`flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-lg border p-2 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${isActive ? "border-accent bg-accent-soft" : "border-line bg-card hover:bg-raised"}`}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span className="inline-block h-4 w-4 shrink-0 rounded-full border border-line-strong" style={{ backgroundColor: formatOklch(spec.color) }} aria-hidden="true" />
                      {isViolet ? <span className="text-[10px] font-bold text-bad">270–320°</span> : <span className="text-[10px] text-fg-3 tabular-nums">{`${Math.round(spec.color.h)}°`}</span>}
                    </div>
                    <div className="text-[11px] font-bold text-fg">{isEn ? spec.nameEn : spec.nameKo}</div>
                    <div className="text-[10px] text-fg-3 tabular-nums">{formatOklchCompact(spec.color)}</div>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-3">
              <RangeSliderRow id={`${uid}-p-l`} testId="moodboard-pigment-l-slider" label={pick("명도 (L)", "Lightness (L)")} readout={activePigment.color.l.toFixed(2)} min={0.05} max={0.99} step={0.01} value={activePigment.color.l} onChange={(l) => handleUpdateActivePigment({ l })} />
              <RangeSliderRow id={`${uid}-p-c`} testId="moodboard-pigment-c-slider" label={pick("채도 (C)", "Chroma (C)")} readout={activePigment.color.c.toFixed(3)} min={0} max={0.3} step={0.005} value={activePigment.color.c} onChange={(c) => handleUpdateActivePigment({ c })} />
              <RangeSliderRow id={`${uid}-p-h`} testId="moodboard-pigment-h-slider" label={pick("색상환 (H · 270–320° 금지)", "Hue (No 270–320°)")} readout={`${Math.round(activePigment.color.h)}°`} readoutTone={isVioletSlopColor(activePigment.color) ? "text-bad" : "text-fg"} min={0} max={359} step={1} value={Math.round(activePigment.color.h)} onChange={(h) => handleUpdateActivePigment({ h })} />
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl bg-canvas p-4">
            <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick("4. OKLCH 기반 WCAG 2.1 · APCA 지각 대비 감사", "4. OKLCH WCAG 2.1 & APCA Contrast Audit")}</h3>
            <div className="divide-y divide-line">
              {audit.contrastPairs.map((pair) => (
                <div key={pair.pairId} data-testid={`moodboard-contrast-row-${pair.pairId}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-10 items-center justify-center rounded border border-line-strong text-[10px] font-bold" style={{ backgroundColor: formatOklch(pair.bg), color: formatOklch(pair.fg) }} aria-hidden="true">Aa</span>
                    <span className="font-medium text-fg [word-break:keep-all]">{isEn ? pair.labelEn : pair.labelKo}</span>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="font-bold text-fg">{`${pair.wcagRatio.toFixed(2)}:1`}</span>
                    <span className="text-fg-3">{`Lc ${pair.apcaAbsLc}`}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${pair.passesWcagAa ? "bg-raised text-good" : "bg-bad-soft text-bad"}`}>{pair.wcagGrade}</span>
                  </div>
                </div>
              ))}
            </div>

            {audit.warnings.length > 0 ? (
              <ul data-testid="moodboard-warnings-list" className="space-y-2 border-t border-line pt-3">
                {audit.warnings.map((warn) => (
                  <li key={warn.code} data-testid={`moodboard-warning-${warn.code}`} className={`rounded-lg border px-3 py-2 text-xs ${warningToneClass(warn.severity)}`}>
                    <div className="font-bold [word-break:keep-all]">{isEn ? warn.titleEn : warn.titleKo}</div>
                    <div className="mt-0.5 opacity-90 [word-break:keep-all]">{isEn ? warn.detailEn : warn.detailKo}</div>
                  </li>
                ))}
              </ul>
            ) : null}

            {lastRepair && lastRepair.fixes.length > 0 ? (
              <div data-testid="moodboard-repair-summary" className="rounded-lg border border-good bg-raised px-3 py-2 text-xs text-good [word-break:keep-all]">
                {lastRepair.fixes.map((fix) => (isEn ? fix.noteEn : fix.noteKo)).join(" · ")}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 xl:col-span-5">
          <div className="space-y-3 rounded-xl bg-canvas p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick("5. 실시간 에디토리얼 매거진 포스터 프리뷰", "5. Live Editorial Magazine Poster Preview")}</h3>
              <span className="text-[11px] font-medium text-fg-3 tabular-nums">oklch · currentColor</span>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${uid}-headline`} className="text-xs font-medium text-fg-2">{pick("포스터 표제어 (실시간 반영)", "Poster Headline")}</label>
              <input id={`${uid}-headline`} data-testid="moodboard-headline-input" type="text" maxLength={4096} value={posterHeadline} onChange={(e) => setPosterHeadline(e.target.value)} className={`min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg ${FOCUS_RING}`} />
            </div>
            <EditorialPosterPreviewSvg audit={audit} headline={posterHeadline} isEn={isEn} />
          </div>

          <div className="space-y-3 rounded-xl bg-canvas p-4">
            <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{pick("6. 팔레트 내보내기 (CSS · JSON · CSP · SVG)", "6. Export Palette (CSS · JSON · CSP · SVG)")}</h3>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" data-testid="moodboard-copy-css-btn" disabled={busy} onClick={() => handleCopy("css")} className={BTN_OUTLINE}><Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("CSS 변수 복사", "Copy CSS")}</button>
              <button type="button" data-testid="moodboard-copy-json-btn" disabled={busy} onClick={() => handleCopy("json")} className={BTN_OUTLINE}><Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("OKLCH JSON 복사", "Copy JSON")}</button>
              <button type="button" data-testid="moodboard-copy-csp-btn" disabled={busy} onClick={() => handleCopy("csp")} className={BTN_OUTLINE}><Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("CSP 스와치 복사", "Copy CSP")}</button>
              <button type="button" data-testid="moodboard-copy-svg-btn" disabled={busy} onClick={() => handleCopy("svg")} className={BTN_OUTLINE}><Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("포스터 SVG 복사", "Copy SVG")}</button>
            </div>
            <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
              {([{ id: "css", label: "CSS" }, { id: "json", label: "JSON" }, { id: "csp", label: "CSP" }, { id: "svg", label: "SVG" }, { id: "hidden", label: pick("숨김", "Hide") }] as const).map((tab) => (
                <button key={tab.id} type="button" data-testid={`moodboard-export-tab-${tab.id}`} aria-pressed={exportTab === tab.id} onClick={() => setExportTab(tab.id)} className={exportTab === tab.id ? BTN_ACTIVE : BTN_OUTLINE}>
                  {tab.label}
                </button>
              ))}
            </div>
            {exportTab !== "hidden" ? (
              <pre data-testid="moodboard-export-preview" className="max-h-56 overflow-auto rounded-lg border border-line bg-raised p-3 font-mono text-[11px] leading-relaxed text-fg-2">
                {activeExportContent}
              </pre>
            ) : null}
          </div>
          <details data-testid="spectrum-domain-pigment-guide" className="rounded-xl border border-line bg-canvas p-3">
            <summary className="cursor-pointer select-none text-xs font-semibold text-fg [word-break:keep-all]">
              {pick(
                `5대 도메인 스펙트럼 안료 기준 (${Math.round(SPECTRUM_CHROMATIC_DISCIPLINE.neutralSurfaceRatio * 100)}/${Math.round(SPECTRUM_CHROMATIC_DISCIPLINE.domainPigmentRatio * 100)}/${Math.round(SPECTRUM_CHROMATIC_DISCIPLINE.editorialDetailRatio * 100)})`,
                `5 Domain Spectrum Pigments (${Math.round(SPECTRUM_CHROMATIC_DISCIPLINE.neutralSurfaceRatio * 100)}/${Math.round(SPECTRUM_CHROMATIC_DISCIPLINE.domainPigmentRatio * 100)}/${Math.round(SPECTRUM_CHROMATIC_DISCIPLINE.editorialDetailRatio * 100)})`,
              )}
            </summary>
            <ul className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {SPECTRUM_DOMAIN_IDS.map((domainId) => {
                const pigment = SPECTRUM_DOMAIN_PIGMENTS[domainId];
                return (
                  <li key={domainId} className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs">
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-line" style={{ backgroundColor: pigment.vivid.ink }} aria-hidden="true" />
                    <span className="font-semibold text-fg [word-break:keep-all]">{isEn ? pigment.nameEn : pigment.nameKo}</span>
                    <span className="ml-auto font-mono text-[11px] text-fg-3 tabular-nums">{pigment.hue}°</span>
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
      </div>
      </fieldset>
    </section>
  );
}
