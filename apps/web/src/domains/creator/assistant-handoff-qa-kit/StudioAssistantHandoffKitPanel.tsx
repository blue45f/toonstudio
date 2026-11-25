/**
 * Wave 44E — 어시스턴트·외주 분업 인수인계 패키지 & 선화·채색·식자 검수 킷 패널.
 *
 * - 5대 공정 선택 · 한국 스튜디오 7대 표준 레이어(`01_LINE`~`07_TEXT`) 실시간 감사 · 원클릭 표준명 자동 보정 미리보기
 * - 차단(blocker) 이슈 집계 · 공정 QA 체크리스트 · 컷당 단가 × 담당 컷 수 정산 시뮬레이터(추정 · 3.3% 원천징수 참고)
 * - 원클릭 인수인계 브리프(Markdown / JSON) 미리보기 및 복사
 * - Calm Atelier 시맨틱 토큰 전용 (원시 색 · 광범위 트랜지션 · 기본 빈 객체 props · Web Storage 미사용)
 */

import {
  AlertTriangle, ArrowRight, Calculator, CheckCircle2, ClipboardCheck, Code2, Copy,
  Eye, EyeOff, FileText, Layers, Lock, Plus, RotateCcw, ShieldAlert, Trash2, Unlock, Wand2,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactElement } from "react";

import {
  HANDOFF_STAGE_SPECS, STANDARD_LAYER_SLOTS, STANDARD_STUDIO_DPIS,
  applyLayerAutoFix, buildHandoffBriefMarkdown, createDefaultPayoutAllocations,
  createSampleHandoffDocument, estimateAssistantPayout, evaluateHandoffReadiness,
  exportHandoffPackageJson, formatKrwAmount, getHandoffStageSpec,
  type AssistantPayoutEstimate, type DeliverableFileFormat, type DocumentColorSpace,
  type HandoffReadinessReport, type HandoffStageId, type LayerAuditDocumentInput,
  type ReadinessVerdict, type StagePayoutAllocationInput, type StandardStudioDpi,
  type StudioLayerInput,
} from "./assistant-handoff-engine";

export interface StudioAssistantHandoffKitPanelProps {
  readonly initialStageId?: HandoffStageId;
  readonly initialDpi?: number;
  readonly initialExpectedDpi?: StandardStudioDpi;
  readonly initialColorSpace?: DocumentColorSpace;
  readonly initialLayers?: readonly StudioLayerInput[];
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onReadinessChange?: (report: HandoffReadinessReport) => void;
  readonly onExportBrief?: (markdown: string, report: HandoffReadinessReport) => void;
  readonly onExportJson?: (json: string, report: HandoffReadinessReport) => void;
}

type ExportPreviewTab = "markdown" | "json" | "hidden";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const ICON_BTN = `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;
const INPUT_CLS = `min-h-11 w-full rounded-lg border border-line bg-canvas px-2.5 py-2 text-xs font-medium text-fg transition-colors motion-reduce:transition-none hover:border-line-strong ${FOCUS_RING}`;

const DPI_CHOICES: readonly number[] = [72, 150, 300, 350];
const COLOR_SPACE_CHOICES: readonly DocumentColorSpace[] = ["sRGB", "Display-P3", "CMYK", "Grayscale"];
const FORMAT_CHOICES: readonly DeliverableFileFormat[] = ["CLIP", "PSD", "TOONSTUDIO"];
const RUSH_CHOICES: readonly { readonly pct: number; readonly ko: string; readonly en: string }[] = [
  { pct: 100, ko: "기본 100%", en: "Standard 100%" },
  { pct: 120, ko: "긴급 +20%", en: "Rush +20%" },
  { pct: 150, ko: "당일 +50%", en: "Same-day +50%" },
];

function verdictMeta(verdict: ReadinessVerdict, isEn: boolean): { readonly label: string; readonly tone: string } {
  if (verdict === "ready") return { label: isEn ? "Ready" : "출고 가능", tone: "text-good" };
  return verdict === "ready-with-warnings"
    ? { label: isEn ? "Check Warnings" : "경고 확인", tone: "text-warn" }
    : { label: isEn ? "Blocked" : "출고 차단", tone: "text-bad" };
}

function parseNonNegInt(raw: string, fallback: number): number {
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : fallback;
}

function KpiCard(props: {
  readonly label: string; readonly value: string; readonly subtext: string;
  readonly testId: string; readonly valueTone?: string;
}): ReactElement {
  const { label, value, subtext, testId, valueTone = "text-fg" } = props;
  return (
    <div className="rounded-xl border border-line bg-raised px-3.5 py-3">
      <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{label}</div>
      <div data-testid={testId} className={`mt-1 text-base font-bold tabular-nums [word-break:keep-all] ${valueTone}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-fg-3 tabular-nums [word-break:keep-all]">{subtext}</div>
    </div>
  );
}

/** 어시스턴트·외주 분업 인수인계 패키지 & 선화·채색·식자 검수 킷 단독 패널. */
export function StudioAssistantHandoffKitPanel(props: StudioAssistantHandoffKitPanelProps): ReactElement {
  const {
    initialStageId = "shading", initialDpi, initialExpectedDpi = 300, initialColorSpace,
    initialLayers, locale = "ko", className, onReadinessChange, onExportBrief, onExportJson,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [document, setDocument] = useState<LayerAuditDocumentInput>(() => {
    const sample = createSampleHandoffDocument(initialStageId, "with-issues");
    return {
      ...sample,
      dpi: initialDpi ?? sample.dpi,
      expectedDpi: initialExpectedDpi,
      colorSpace: initialColorSpace ?? sample.colorSpace,
      layers: initialLayers ? [...initialLayers] : sample.layers,
    };
  });
  const [checkedByStage, setCheckedByStage] = useState<Readonly<Record<HandoffStageId, readonly string[]>>>(() => ({
    lineart: [], "flat-color": [], shading: ["shade-highlight-clipping"], "background-3d": [], lettering: [],
  }));
  const [allocations, setAllocations] = useState<readonly StagePayoutAllocationInput[]>(() => createDefaultPayoutAllocations());
  const [includeWithholdingTax, setIncludeWithholdingTax] = useState<boolean>(true);
  const [rushMultiplierPct, setRushMultiplierPct] = useState<number>(100);
  const [projectTitle, setProjectTitle] = useState<string>("별빛 아틀리에");
  const [episodeLabel, setEpisodeLabel] = useState<string>("제14화");
  const [senderName, setSenderName] = useState<string>("메인 작가");
  const [receiverName, setReceiverName] = useState<string>("명암 어시스턴트");
  const [dueDateIso, setDueDateIso] = useState<string>("2026-11-28");
  const [deliverableFormat, setDeliverableFormat] = useState<DeliverableFileFormat>("CLIP");
  const [directorNotes, setDirectorNotes] = useState<string>("저녁 노을 역광 컷(12~16컷)은 04_LIGHT 채도를 유지해 주세요.");
  const [previewTab, setPreviewTab] = useState<ExportPreviewTab>("markdown");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [customLayerSeq, setCustomLayerSeq] = useState<number>(2);

  const readiness = useMemo<HandoffReadinessReport>(
    () => evaluateHandoffReadiness({ document, checkedChecklistIds: checkedByStage[document.stageId] ?? [] }),
    [document, checkedByStage],
  );
  const payout = useMemo<AssistantPayoutEstimate>(
    () => estimateAssistantPayout({ allocations: allocations.map((item) => ({ ...item, rushMultiplierPct })), includeWithholdingTax }),
    [allocations, rushMultiplierPct, includeWithholdingTax],
  );
  const briefContext = useMemo(() => ({
    projectTitle, episodeLabel, senderName, receiverName, dueDateIso, deliverableFormat,
    notes: directorNotes, readiness, payout, locale,
  }), [projectTitle, episodeLabel, senderName, receiverName, dueDateIso, deliverableFormat, directorNotes, readiness, payout, locale]);

  const briefMarkdown = useMemo<string>(() => buildHandoffBriefMarkdown(briefContext), [briefContext]);
  const packageJson = useMemo<string>(() => exportHandoffPackageJson(briefContext), [briefContext]);
  const changedRenames = useMemo(() => readiness.layerAudit.renamePreview.filter((item) => item.changed), [readiness.layerAudit.renamePreview]);

  useEffect(() => { onReadinessChange?.(readiness); }, [readiness, onReadinessChange]);

  const copySafely = (text: string): void => {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
  };

  const handleSelectStage = (nextStageId: HandoffStageId): void => {
    const spec = getHandoffStageSpec(nextStageId);
    setDocument((prev) => ({ ...prev, stageId: nextStageId }));
    setReceiverName(`${spec.shortLabelKo} 어시스턴트`);
    setStatusMessage(pick(`${spec.labelKo} 검수 기준으로 전환했습니다.`, `Switched QA criteria to ${spec.labelEn}.`));
  };

  const handleLoadPreset = (variant: "with-issues" | "clean"): void => {
    const nextDoc = createSampleHandoffDocument(document.stageId, variant);
    setDocument({ ...nextDoc, expectedDpi: document.expectedDpi });
    const nextChecked = variant === "clean" ? getHandoffStageSpec(document.stageId).checklist.map((i) => i.id) : [];
    setCheckedByStage((prev) => ({ ...prev, [document.stageId]: nextChecked }));
    setStatusMessage(variant === "clean"
      ? pick("규약 준수 모범 원고와 완료 체크리스트를 불러왔습니다.", "Loaded compliant sample document and checklist.")
      : pick("실무 실수 포함 샘플 원고로 초기화했습니다.", "Loaded realistic sample document with handoff issues."));
  };

  const handleUpdateLayer = (layerId: string, patch: Partial<StudioLayerInput>): void => {
    setDocument((prev) => ({ ...prev, layers: prev.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) }));
  };

  const handleAddMessyLayer = (): void => {
    const seq = customLayerSeq;
    setCustomLayerSeq((n) => n + 1);
    setDocument((prev) => ({
      ...prev,
      layers: [{ id: `custom-${seq}`, name: `레이어 ${seq} 복사본`, visible: true, locked: false, kind: "raster", opacityPct: 100, blendMode: "normal" }, ...prev.layers],
    }));
    setStatusMessage(pick(`"레이어 ${seq} 복사본"을 추가했습니다. 실시간 감사 결과를 확인하세요.`, `Added "레이어 ${seq} 복사본" for live audit.`));
  };

  const handleApplyRenameOnly = (): void => {
    const res = applyLayerAutoFix(document, { normalizeStatesAndSpec: false });
    setDocument(res.nextDocument);
    setStatusMessage(res.renamedCount > 0
      ? pick(`${res.renamedCount}개 레이어를 한국 스튜디오 표준명으로 보정했습니다.`, `Standardized ${res.renamedCount} layer names.`)
      : pick("모든 레이어가 이미 표준 명명 규약을 충족합니다.", "All layers already follow standard naming."));
  };

  const handleAutoFixAll = (): void => {
    const res = applyLayerAutoFix(document, { normalizeStatesAndSpec: true });
    setDocument(res.nextDocument);
    setStatusMessage(res.totalFixCount > 0
      ? pick(`총 ${res.totalFixCount}건 일괄 보정 완료 (표준명 ${res.renamedCount} · 누락추가 ${res.addedMissingCount} · 상태 ${res.stateFixCount} · 규격 ${res.specFixCount}).`, `Applied ${res.totalFixCount} fixes.`)
      : pick("레이어 명명·상태·문서 규격이 이미 모두 기준에 맞습니다.", "Layers and spec already meet all standards."));
  };

  const handleToggleChecklist = (itemId: string): void => {
    setCheckedByStage((prev) => {
      const cur = prev[document.stageId] ?? [];
      return { ...prev, [document.stageId]: cur.includes(itemId) ? cur.filter((id) => id !== itemId) : [...cur, itemId] };
    });
  };

  const handleCheckAllStageItems = (): void => {
    const allIds = readiness.stage.checklist.map((item) => item.id);
    setCheckedByStage((prev) => ({ ...prev, [document.stageId]: allIds }));
    setStatusMessage(pick(`${readiness.stage.labelKo} 체크리스트 ${allIds.length}건을 모두 확인 처리했습니다.`, `Checked all ${allIds.length} stage QA items.`));
  };

  const handleUpdateAllocation = (stageId: HandoffStageId, patch: Partial<Pick<StagePayoutAllocationInput, "cutCount" | "ratePerCutKrw">>): void => {
    setAllocations((prev) => prev.map((row) => (row.stageId === stageId ? { ...row, ...patch } : row)));
  };

  const handleCopyMarkdown = (): void => {
    onExportBrief?.(briefMarkdown, readiness);
    copySafely(briefMarkdown);
    setPreviewTab("markdown");
    setStatusMessage(pick(`인수인계 Markdown 브리프(${briefMarkdown.length.toLocaleString("ko-KR")}자)를 복사했습니다.`, `Copied Markdown brief (${briefMarkdown.length.toLocaleString("en-US")} chars).`));
  };

  const handleCopyJson = (): void => {
    onExportJson?.(packageJson, readiness);
    copySafely(packageJson);
    setPreviewTab("json");
    setStatusMessage(pick(`인수인계 패키지 JSON(${packageJson.length.toLocaleString("ko-KR")}B)을 복사했습니다.`, `Copied handoff package JSON (${packageJson.length.toLocaleString("en-US")} B).`));
  };

  const verdict = verdictMeta(readiness.verdict, isEn);
  const metaFields: readonly { readonly testId: string; readonly label: string; readonly value: string; readonly onChange: (v: string) => void; readonly tabular?: boolean }[] = [
    { testId: "handoff-meta-project", label: pick("작품명", "Project"), value: projectTitle, onChange: setProjectTitle },
    { testId: "handoff-meta-episode", label: pick("회차", "Episode"), value: episodeLabel, onChange: setEpisodeLabel },
    { testId: "handoff-meta-sender", label: pick("발신", "From"), value: senderName, onChange: setSenderName },
    { testId: "handoff-meta-receiver", label: pick("수신", "To"), value: receiverName, onChange: setReceiverName },
    { testId: "handoff-meta-due", label: pick("마감일", "Due Date"), value: dueDateIso, onChange: setDueDateIso, tabular: true },
  ];

  return (
    <section
      data-testid="studio-assistant-handoff-kit-panel"
      aria-label={pick("어시스턴트·외주 분업 인수인계 및 검수 킷", "Assistant Handoff & QA Kit")}
      className={`space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("분업 인수인계 표준 킷", "Studio Handoff QA Kit")}
            </span>
            <span data-testid="handoff-estimate-badge" className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
              <Calculator className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pick("정산 추정치 포함", "Includes Payout Estimate")}
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("어시스턴트·외주 분업 인수인계 & 선화·채색·식자 검수 킷", "Assistant Handoff & Stage QA Kit")}
          </h2>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick("7대 표준 레이어 명명 규약·잠금/비표시·300/350 DPI·색공간을 자동 검증하고 공정 체크리스트·3.3% 정산 프리뷰(추정)·브리프를 묶습니다.", "Audit 7-slot layer naming, locks/visibility, 300/350 DPI & color space, stage checklists, estimated 3.3% payouts, and handoff briefs.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="handoff-auto-fix-all-btn" onClick={handleAutoFixAll} className={BTN_SOLID}>
            <Wand2 className="h-4 w-4 shrink-0" aria-hidden="true" />{pick("전체 자동 정리", "Auto-Fix All")}
          </button>
          <button type="button" data-testid="handoff-copy-md-btn" onClick={handleCopyMarkdown} className={BTN_OUTLINE}>
            <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />{pick("브리프 복사", "Copy Brief")}
          </button>
          <button type="button" data-testid="handoff-copy-json-btn" onClick={handleCopyJson} className={BTN_OUTLINE}>
            <Code2 className="h-4 w-4 shrink-0" aria-hidden="true" />{pick("JSON 복사", "Copy JSON")}
          </button>
          <button type="button" data-testid="handoff-reset-btn" onClick={() => handleLoadPreset("with-issues")} className={BTN_OUTLINE}>
            <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />{pick("샘플 복원", "Reset Sample")}
          </button>
        </div>
      </header>

      {statusMessage ? (
        <div data-testid="handoff-status-banner" role="status" aria-live="polite" className="rounded-lg border border-accent bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent [word-break:keep-all]">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard testId="handoff-verdict-value" valueTone={verdict.tone} label={pick("인수인계 출고 판정", "Handoff Verdict")} value={verdict.label} subtext={pick(`준비도 ${readiness.readinessScore}/100 · ${readiness.stage.shortLabelKo}`, `Readiness ${readiness.readinessScore}/100 · ${readiness.stage.shortLabelEn}`)} />
        <KpiCard testId="handoff-blocker-count" valueTone={readiness.blockerCount > 0 ? "text-bad" : "text-good"} label={pick("차단(Blocker) · 경고", "Blockers & Warnings")} value={pick(`차단 ${readiness.blockerCount}건`, `${readiness.blockerCount} Blockers`)} subtext={pick(`주의 경고 ${readiness.warningCount}건 · 체크 ${readiness.checkedCount}/${readiness.totalChecklistCount}`, `${readiness.warningCount} warnings · QA ${readiness.checkedCount}/${readiness.totalChecklistCount}`)} />
        <KpiCard testId="handoff-compliance-pct" valueTone={readiness.layerAudit.standardCompliancePct === 100 && readiness.layerAudit.dpiValid && readiness.layerAudit.colorSpaceValid ? "text-good" : "text-warn"} label={pick("레이어 규약 준수율", "Naming Compliance")} value={`${readiness.layerAudit.standardCompliancePct}%`} subtext={`${readiness.layerAudit.dpi} DPI · ${readiness.layerAudit.colorSpace}`} />
        <KpiCard testId="handoff-payout-net-kpi" valueTone="text-accent" label={pick("예상 실지급 합계 (추정)", "Est. Net Payout (Estimate)")} value={formatKrwAmount(payout.totalNetPayoutKrw, locale)} subtext={pick(`총 ${payout.totalCuts}컷 · 세전 ${formatKrwAmount(payout.totalGrossAmountKrw)}`, `${payout.totalCuts} cuts · Gross ${formatKrwAmount(payout.totalGrossAmountKrw, "en")}`)} />
      </div>

      {/* 1. 5대 공정 선택 & 원고 규격 */}
      <div className="space-y-3 rounded-xl border border-line bg-canvas p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("1. 인계 대상 공정 선택 & 원고 해상도·색공간 규격", "1. Handoff Stage & Document Spec")}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-testid="handoff-preset-issues" onClick={() => handleLoadPreset("with-issues")} className={BTN_OUTLINE}>{pick("실수 포함 샘플", "Issue Sample")}</button>
            <button type="button" data-testid="handoff-preset-clean" onClick={() => handleLoadPreset("clean")} className={BTN_OUTLINE}>{pick("모범 원고 샘플", "Clean Sample")}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {HANDOFF_STAGE_SPECS.map((stage) => {
            const active = stage.id === document.stageId;
            return (
              <button
                key={stage.id} type="button" data-testid={`handoff-stage-${stage.id}`} aria-pressed={active} onClick={() => handleSelectStage(stage.id)}
                className={`flex min-h-11 cursor-pointer flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"}`}
              >
                <span className="text-xs font-bold text-fg">{isEn ? stage.shortLabelEn : stage.shortLabelKo}</span>
                <span className="text-[10px] text-fg-3 tabular-nums">{pick(`필수 ${stage.requiredLayers.length}슬롯`, `${stage.requiredLayers.length} req layers`)}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-fg-2 [word-break:keep-all]">{isEn ? readiness.stage.deliverableSummaryEn : readiness.stage.deliverableSummaryKo}</p>
        <div className="grid gap-3 pt-1 md:grid-cols-3">
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-fg-2">{pick("현재 파일 해상도 (DPI)", "Current File DPI")}</span>
            <div className="flex flex-wrap gap-1.5">
              {DPI_CHOICES.map((dpi) => (
                <button key={dpi} type="button" data-testid={`handoff-dpi-${dpi}`} aria-pressed={document.dpi === dpi} onClick={() => setDocument((p) => ({ ...p, dpi }))} className={document.dpi === dpi ? BTN_ACTIVE : BTN_OUTLINE}>
                  <span className="tabular-nums">{dpi}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-fg-2">{pick("스튜디오 목표 DPI", "Studio Target DPI")}</span>
            <div className="flex flex-wrap gap-1.5">
              {STANDARD_STUDIO_DPIS.map((target) => (
                <button key={target} type="button" data-testid={`handoff-expected-dpi-${target}`} aria-pressed={document.expectedDpi === target} onClick={() => setDocument((p) => ({ ...p, expectedDpi: target }))} className={document.expectedDpi === target ? BTN_ACTIVE : BTN_OUTLINE}>
                  <span className="tabular-nums">{`${target} DPI`}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-fg-2">{pick("현재 파일 색공간 (기준: sRGB)", "Color Space (Target: sRGB)")}</span>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_SPACE_CHOICES.map((cs) => (
                <button key={cs} type="button" data-testid={`handoff-colorspace-${cs}`} aria-pressed={document.colorSpace === cs} onClick={() => setDocument((p) => ({ ...p, colorSpace: cs }))} className={document.colorSpace === cs ? BTN_ACTIVE : BTN_OUTLINE}>
                  {cs}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2. 차단(Blocker) 이슈 & 공정 QA 체크리스트 */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div data-testid="handoff-blockers-panel" className="space-y-2.5 rounded-xl border border-line bg-canvas p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
              {readiness.blockerCount === 0 ? <CheckCircle2 className="h-4 w-4 text-good" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4 text-bad" aria-hidden="true" />}
              <span className="[word-break:keep-all]">{readiness.blockerCount === 0 ? pick("차단 이슈 0건 · 즉시 인계 가능", "0 Blocking Issues · Ready to Ship") : pick(`출고 차단 이슈 ${readiness.blockerCount}건`, `${readiness.blockerCount} Blocking Issues`)}</span>
            </div>
            <span data-testid="handoff-readiness-score" className="text-[11px] font-semibold text-fg-3 tabular-nums">{pick(`준비도 ${readiness.readinessScore}점`, `Score ${readiness.readinessScore}`)}</span>
          </div>
          {readiness.blockers.length > 0 ? (
            <ul className="space-y-1.5">
              {readiness.blockers.map((blocker, idx) => (
                <li key={blocker.id} data-testid={`handoff-blocker-item-${idx}`} className="rounded-lg border border-bad bg-bad-soft px-3 py-2 text-xs text-bad [word-break:keep-all]">
                  <div className="flex flex-wrap items-center justify-between gap-1 font-bold">
                    <span>{isEn ? blocker.titleEn : blocker.titleKo}</span>
                    <span className="rounded border border-bad px-1.5 py-0.5 text-[10px]">{blocker.source === "layer-audit" ? pick("레이어·규격", "Layer/Spec") : pick("체크리스트", "Checklist")}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] opacity-90">{isEn ? blocker.actionEn : blocker.actionKo}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-lg border border-good bg-good-soft px-3 py-2.5 text-xs font-medium text-good [word-break:keep-all]">
              {pick("모든 필수 레이어 규약·해상도·색공간 및 차단 검수 항목을 통과했습니다.", "Passed all mandatory layer naming, spec, and blocker QA gates.")}
            </div>
          )}
          {readiness.warnings.length > 0 ? (
            <div data-testid="handoff-warnings-list" className="space-y-1.5 pt-1">
              <div className="flex items-center gap-1 text-[11px] font-bold text-warn"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{pick(`주의 경고 ${readiness.warnings.length}건`, `${readiness.warnings.length} Warnings`)}</div>
              {readiness.warnings.map((warn) => (
                <div key={warn.id} className="rounded-lg border border-warn bg-warning-soft px-3 py-1.5 text-[11px] text-warn [word-break:keep-all]">
                  <span className="font-bold">{isEn ? warn.titleEn : warn.titleKo}</span><span>{` — ${isEn ? warn.fixHintEn : warn.fixHintKo}`}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div data-testid="handoff-checklist-panel" className="space-y-2.5 rounded-xl border border-line bg-canvas p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <ClipboardCheck className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="[word-break:keep-all]">{pick(`2. ${readiness.stage.labelKo} QA 체크리스트 (${readiness.checkedCount}/${readiness.totalChecklistCount})`, `2. ${readiness.stage.labelEn} QA Checklist (${readiness.checkedCount}/${readiness.totalChecklistCount})`)}</span>
            </div>
            <button type="button" data-testid="handoff-check-all-btn" onClick={handleCheckAllStageItems} className={BTN_OUTLINE}>{pick("전체 확인", "Check All")}</button>
          </div>
          <div className="space-y-1.5">
            {readiness.checklistItems.map((item) => {
              const checkId = `${uid}-chk-${item.id}`;
              const labelText = isEn ? item.titleEn : item.titleKo;
              return (
                <div key={item.id} className={`flex min-h-11 items-start gap-2.5 rounded-lg border px-3 py-2 text-xs transition-colors motion-reduce:transition-none [word-break:keep-all] ${item.checked ? "border-good bg-good-soft text-fg" : item.isBlocker ? "border-line-strong bg-card text-fg" : "border-line bg-card text-fg-2"}`}>
                  <input id={checkId} type="checkbox" data-testid={`handoff-check-${item.id}`} checked={item.checked} onChange={() => handleToggleChecklist(item.id)} className={`mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent ${FOCUS_RING}`} />
                  <label htmlFor={checkId} className="min-w-0 flex-1 cursor-pointer space-y-0.5">
                    <span className="flex flex-wrap items-center gap-1.5 font-semibold text-fg">
                      <span>{labelText}</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${item.isBlocker ? "border-bad bg-bad-soft text-bad" : "border-line bg-raised text-fg-3"}`}>{item.isBlocker ? pick("필수 차단", "Blocker") : pick("권장", "Recommended")}</span>
                    </span>
                    <span className="block text-[11px] text-fg-2">{isEn ? item.detailEn : item.detailKo}</span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. 7대 표준 레이어 실시간 감사 & 원클릭 표준명 자동 보정 미리보기 */}
      <div className="space-y-3 rounded-xl border border-line bg-canvas p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("3. 7대 표준 레이어 실시간 감사 & 원클릭 표준명 자동 보정 미리보기", "3. 7-Slot Layer Audit & One-Click Auto-Rename Preview")}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-testid="handoff-add-layer-btn" onClick={handleAddMessyLayer} className={BTN_OUTLINE}><Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick("임의 레이어 추가", "Add Messy Layer")}</button>
            <button type="button" data-testid="handoff-apply-rename-btn" onClick={handleApplyRenameOnly} disabled={changedRenames.length === 0} className={BTN_ACTIVE}><Wand2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick(`표준명 보정 적용 (${changedRenames.length})`, `Apply Renames (${changedRenames.length})`)}</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STANDARD_LAYER_SLOTS.map((slot) => {
            const present = readiness.layerAudit.presentStandardCodes.includes(slot.code);
            const missingReq = readiness.layerAudit.missingRequiredCodes.includes(slot.code);
            const req = readiness.stage.requiredLayers.includes(slot.code);
            const tone = missingReq ? "border-bad bg-bad-soft text-bad" : present ? "border-good bg-good-soft text-good" : "border-line bg-raised text-fg-3";
            return (
              <span key={slot.code} data-testid={`handoff-slot-${slot.code}`} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold [word-break:keep-all] ${tone}`}>
                <span className="font-mono">{slot.code}</span><span>{isEn ? slot.labelEn : slot.labelKo}</span>
                {req ? <span className="text-[10px] opacity-80">{missingReq ? pick("누락", "Missing") : pick("필수", "Req")}</span> : null}
              </span>
            );
          })}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
          <div className="space-y-2">
            {readiness.layerAudit.auditedLayers.map((entry, idx) => {
              const hasBlocker = entry.issues.some((i) => i.severity === "blocker");
              const hasWarn = entry.issues.some((i) => i.severity === "warning");
              const nameId = `${uid}-layer-${entry.layer.id}`;
              return (
                <div key={entry.layer.id} data-testid={`handoff-layer-row-${idx}`} className={`flex flex-wrap items-center gap-2 rounded-xl border p-2.5 ${hasBlocker ? "border-bad bg-bad-soft" : hasWarn ? "border-warn bg-warning-soft" : "border-line bg-card"}`}>
                  <label htmlFor={nameId} className="sr-only">{pick(`레이어 ${idx + 1} 이름`, `Layer ${idx + 1} name`)}</label>
                  <input id={nameId} type="text" data-testid={`handoff-layer-name-${idx}`} value={entry.layer.name} onChange={(e) => handleUpdateLayer(entry.layer.id, { name: e.target.value })} className={`min-h-11 min-w-[140px] flex-1 rounded-lg border border-line bg-canvas px-2.5 py-1.5 font-mono text-xs font-semibold text-fg ${FOCUS_RING}`} />
                  <span className={`rounded border px-2 py-1 text-[10px] font-bold [word-break:keep-all] ${hasBlocker ? "border-bad bg-card text-bad" : hasWarn ? "border-warn bg-card text-warn" : "border-good bg-good-soft text-good"}`}>
                    {entry.isArbitraryName ? pick("임의명 차단", "Arbitrary") : entry.isStandardName && !hasBlocker && !hasWarn ? pick("표준 통과", "OK") : hasBlocker ? pick("차단 이슈", "Blocker") : pick("주의", "Warn")}
                  </span>
                  <button type="button" data-testid={`handoff-layer-vis-${idx}`} aria-pressed={entry.layer.visible} aria-label={pick(`${entry.layer.name} 표시 전환`, `Toggle visibility for ${entry.layer.name}`)} onClick={() => handleUpdateLayer(entry.layer.id, { visible: !entry.layer.visible })} className={`${ICON_BTN} ${entry.layer.visible ? "border-line bg-card text-fg" : "border-bad bg-card text-bad"}`}>
                    {entry.layer.visible ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  <button type="button" data-testid={`handoff-layer-lock-${idx}`} aria-pressed={entry.layer.locked} aria-label={pick(`${entry.layer.name} 잠금 전환`, `Toggle lock for ${entry.layer.name}`)} onClick={() => handleUpdateLayer(entry.layer.id, { locked: !entry.layer.locked })} className={`${ICON_BTN} ${entry.layer.locked ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2"}`}>
                    {entry.layer.locked ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Unlock className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  <button type="button" data-testid={`handoff-layer-remove-${idx}`} disabled={document.layers.length <= 1} aria-label={pick(`${entry.layer.name} 삭제`, `Remove ${entry.layer.name}`)} onClick={() => setDocument((p) => ({ ...p, layers: p.layers.filter((l) => l.id !== entry.layer.id) }))} className={`${ICON_BTN} border-line bg-card text-fg-3 hover:border-bad hover:text-bad`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
          <div data-testid="handoff-rename-preview-panel" className="space-y-2 rounded-xl border border-line bg-raised p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-fg [word-break:keep-all]">{pick("원클릭 표준명 자동 보정 미리보기", "Auto-Rename Preview")}</span>
              <span className="text-[11px] font-semibold text-fg-3 tabular-nums">{pick(`${changedRenames.length}건 변경 예정`, `${changedRenames.length} renames`)}</span>
            </div>
            {changedRenames.length === 0 ? (
              <p className="rounded-lg border border-good bg-good-soft px-3 py-2 text-xs text-good [word-break:keep-all]">{pick("변경 대상이 없습니다. 모든 레이어명이 01_LINE~07_TEXT 규약을 준수합니다.", "No renames needed. All layer names match 01_LINE..07_TEXT.")}</p>
            ) : (
              <ul className="space-y-1.5">
                {changedRenames.map((item) => (
                  <li key={item.layerId} data-testid={`handoff-rename-row-${item.layerId}`} className="rounded-lg border border-line bg-card px-3 py-2 text-xs [word-break:keep-all]">
                    <div className="flex flex-wrap items-center gap-1.5 font-mono font-bold">
                      <span className="text-bad line-through">{item.beforeName || "(빈 이름)"}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-fg-3" aria-hidden="true" />
                      <span className="text-good">{item.afterName}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-fg-3">{isEn ? item.reasonEn : item.reasonKo}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* 4. 어시스턴트 정산 시뮬레이터 (추정 · 3.3% 원천징수 참고) */}
      <div className="space-y-3 rounded-xl border border-line bg-canvas p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("4. 공정별 어시스턴트 정산 시뮬레이터", "4. Assistant Payout Simulator")}</h3>
            <span data-testid="handoff-payout-estimate-badge" className="rounded-full border border-warn bg-warning-soft px-2 py-0.5 text-[10px] font-bold text-warn">{isEn ? payout.badgeLabelEn : payout.badgeLabelKo}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-testid="handoff-tax-toggle" aria-pressed={includeWithholdingTax} onClick={() => setIncludeWithholdingTax((v) => !v)} className={includeWithholdingTax ? BTN_ACTIVE : BTN_OUTLINE}>{pick("한국 3.3% 원천징수 적용", "Apply 3.3% KR Withholding")}</button>
            {RUSH_CHOICES.map((opt) => (
              <button key={opt.pct} type="button" data-testid={`handoff-rush-${opt.pct}`} aria-pressed={rushMultiplierPct === opt.pct} onClick={() => setRushMultiplierPct(opt.pct)} className={rushMultiplierPct === opt.pct ? BTN_ACTIVE : BTN_OUTLINE}>
                {isEn ? opt.en : opt.ko}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {payout.lines.map((line) => {
            const cutsId = `${uid}-cuts-${line.stageId}`;
            const rateId = `${uid}-rate-${line.stageId}`;
            return (
              <div key={line.stageId} data-testid={`handoff-payout-row-${line.stageId}`} className="grid items-center gap-2.5 rounded-xl border border-line bg-card p-3 md:grid-cols-[minmax(120px,1fr)_110px_135px_minmax(190px,1.2fr)]">
                <div>
                  <div className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? line.labelEn : line.labelKo}</div>
                  <div className="text-[11px] text-fg-3 [word-break:keep-all]">{line.assigneeName}</div>
                </div>
                <div className="space-y-1">
                  <label htmlFor={cutsId} className="block text-[10px] font-medium text-fg-3">{pick("담당 컷 수", "Assigned Cuts")}</label>
                  <input id={cutsId} type="number" min={0} max={500} step={1} data-testid={`handoff-payout-cuts-${line.stageId}`} value={line.cutCount} onChange={(e) => handleUpdateAllocation(line.stageId, { cutCount: parseNonNegInt(e.target.value, line.cutCount) })} className={`${INPUT_CLS} tabular-nums`} />
                </div>
                <div className="space-y-1">
                  <label htmlFor={rateId} className="block text-[10px] font-medium text-fg-3">{pick("컷당 단가 (원)", "Rate / Cut (KRW)")}</label>
                  <input id={rateId} type="number" min={0} max={500000} step={500} data-testid={`handoff-payout-rate-${line.stageId}`} value={line.ratePerCutKrw} onChange={(e) => handleUpdateAllocation(line.stageId, { ratePerCutKrw: parseNonNegInt(e.target.value, line.ratePerCutKrw) })} className={`${INPUT_CLS} tabular-nums`} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-xs tabular-nums">
                  <div>
                    <div className="text-[10px] text-fg-3">{pick("세전 · 3.3% 세액", "Gross · 3.3% Tax")}</div>
                    <div className="font-semibold text-fg-2">{`${formatKrwAmount(line.grossAmountKrw, locale)} · -${formatKrwAmount(line.withholdingTaxKrw, locale)}`}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-fg-3">{pick("실지급(추정)", "Net (Est.)")}</div>
                    <div data-testid={`handoff-payout-net-${line.stageId}`} className="font-bold text-accent">{formatKrwAmount(line.netPayoutKrw, locale)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div data-testid="handoff-payout-summary" className="rounded-xl border border-line-strong bg-raised p-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><div className="text-[11px] text-fg-3">{pick("총 담당 컷 수", "Total Cuts")}</div><div className="font-bold text-fg tabular-nums">{isEn ? `${payout.totalCuts} cuts` : `${payout.totalCuts}컷`}</div></div>
            <div><div className="text-[11px] text-fg-3">{pick("총 세전 지급액 (추정)", "Total Gross (Est.)")}</div><div data-testid="handoff-payout-gross-total" className="font-bold text-fg tabular-nums">{formatKrwAmount(payout.totalGrossAmountKrw, locale)}</div></div>
            <div><div className="text-[11px] text-fg-3">{pick(`원천징수 (${payout.withholdingRatePct}%)`, `Withholding (${payout.withholdingRatePct}%)`)}</div><div data-testid="handoff-payout-tax-total" className="font-bold text-warn tabular-nums">{`${formatKrwAmount(payout.totalWithholdingTaxKrw, locale)} (${formatKrwAmount(payout.totalNationalIncomeTaxKrw, locale)} + ${formatKrwAmount(payout.totalLocalIncomeTaxKrw, locale)})`}</div></div>
            <div><div className="text-[11px] text-fg-3">{pick("예상 실지급 합계 (추정)", "Estimated Net Total")}</div><div data-testid="handoff-payout-net-total" className="font-bold text-accent tabular-nums">{formatKrwAmount(payout.totalNetPayoutKrw, locale)}</div></div>
          </div>
          <p className="mt-2 text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? payout.taxDisclaimerEn : payout.taxDisclaimerKo}</p>
        </div>
      </div>

      {/* 5. 원클릭 인수인계 브리프 (Markdown / JSON) */}
      <div className="space-y-3 rounded-xl border border-line bg-canvas p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-fg [word-break:keep-all]">{pick("5. 원클릭 인수인계 브리프 & 패키지 내보내기", "5. One-Click Handoff Brief & Package Export")}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" data-testid="handoff-tab-markdown" aria-pressed={previewTab === "markdown"} onClick={() => setPreviewTab("markdown")} className={previewTab === "markdown" ? BTN_ACTIVE : BTN_OUTLINE}><Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Markdown</button>
            <button type="button" data-testid="handoff-tab-json" aria-pressed={previewTab === "json"} onClick={() => setPreviewTab("json")} className={previewTab === "json" ? BTN_ACTIVE : BTN_OUTLINE}><Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />JSON</button>
            <button type="button" data-testid="handoff-tab-hidden" aria-pressed={previewTab === "hidden"} onClick={() => setPreviewTab("hidden")} className={previewTab === "hidden" ? BTN_ACTIVE : BTN_OUTLINE}>{pick("접기", "Hide")}</button>
          </div>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {metaFields.map((field) => (
            <label key={field.testId} className="space-y-1 text-[11px] text-fg-3">
              <span>{field.label}</span>
              <input type="text" data-testid={field.testId} value={field.value} onChange={(e) => field.onChange(e.target.value)} className={field.tabular ? `${INPUT_CLS} tabular-nums` : INPUT_CLS} />
            </label>
          ))}
          <div className="space-y-1 text-[11px] text-fg-3">
            <span>{pick("전달 포맷", "Format")}</span>
            <div className="flex gap-1">
              {FORMAT_CHOICES.map((fmt) => (
                <button key={fmt} type="button" data-testid={`handoff-format-${fmt}`} aria-pressed={deliverableFormat === fmt} onClick={() => setDeliverableFormat(fmt)} className={`flex-1 ${deliverableFormat === fmt ? BTN_ACTIVE : BTN_OUTLINE}`}>{fmt}</button>
              ))}
            </div>
          </div>
        </div>
        <label className="block space-y-1 text-[11px] text-fg-3">
          <span>{pick("메인 작가 전달 메모", "Director Notes")}</span>
          <input type="text" data-testid="handoff-meta-notes" value={directorNotes} onChange={(e) => setDirectorNotes(e.target.value)} className={INPUT_CLS} />
        </label>
        {previewTab !== "hidden" ? (
          <pre data-testid="handoff-export-preview" className="max-h-60 overflow-auto rounded-lg border border-line bg-raised p-3 font-mono text-[11px] leading-relaxed text-fg-2">
            {previewTab === "markdown" ? briefMarkdown : packageJson}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
