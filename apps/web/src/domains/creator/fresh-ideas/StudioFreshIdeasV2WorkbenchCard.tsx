/**
 * `@unslop` 9-Pass Studio Fresh Ideas v2.2 Workbench Card (100-Capability + Streaming + Export + Cross-Labs).
 * Zero decorative emojis, zero purple gradients, 4px spacing grid, tabular-nums index tags,
 * concentric radii, and explicit property motion transitions.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Copy,
  Database,
  Download,
  GitMerge,
  Layers,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Square,
} from "lucide-react";

import {
  FRESH_IDEAS_100_CAPABILITIES,
  type FreshIdeasMode,
  type TargetChannelId,
} from "./fresh-ideas-contracts";
import {
  deconstructFreshIdeasThesis,
  ingestFreshIdeasSources,
} from "./fresh-ideas-ingest-deconstruct";
import {
  EXTENDED_LENS_PACK,
  generateFiveOrthogonalLenses,
  recommendExtendedLensSwap,
} from "./fresh-ideas-lenses-engine";
import {
  expandLensToChannelDraft,
  SUPPORTED_CHANNEL_OPTIONS,
} from "./fresh-ideas-channels-localization";
import {
  auditFreshIdeasQualityAndSafety,
  runFreshIdeasModeCWorkflow,
} from "./fresh-ideas-quality-ecosystem";
import { streamFreshIdeasRemixDraft } from "./fresh-ideas-streaming-cloud-bridge";
import {
  appendIdeaBankRows,
  buildStructuredGoogleDocMarkdown,
  loadIdeaBankSnapshot,
  serializeIdeaBankCsv,
} from "./fresh-ideas-workspace-export-bridge";
import { synthesizeCrossLabsUnifiedRemix } from "./fresh-ideas-cross-labs-adapter";

const MOTION_BTN =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

export interface StudioFreshIdeasV2WorkbenchCardProps {
  readonly sourceTitle: string;
  readonly sourceSummaryKo: string;
  readonly sourceMetricsSummaryKo?: string;
  readonly disabled?: boolean;
  readonly onStatusChange?: (summaryKo: string) => void;
}

export function StudioFreshIdeasV2WorkbenchCard({
  sourceTitle,
  sourceSummaryKo,
  sourceMetricsSummaryKo,
  disabled = false,
  onStatusChange,
}: StudioFreshIdeasV2WorkbenchCardProps) {
  const [activeMode, setActiveMode] = useState<FreshIdeasMode>("mode-a-5-lens");
  const [selectedLensIndex, setSelectedLensIndex] = useState<number>(0);
  const [selectedChannelId, setSelectedChannelId] = useState<TargetChannelId>("linkedin-kr");
  const [includeExtendedLens, setIncludeExtendedLens] = useState<boolean>(false);
  const [crossLabsUnified, setCrossLabsUnified] = useState<boolean>(false);
  const [streamedText, setStreamedText] = useState<string>("");
  const [streamProgressPct, setStreamProgressPct] = useState<number>(0);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [bankCount, setBankCount] = useState<number>(() => loadIdeaBankSnapshot().length);
  const [exportNoticeKo, setExportNoticeKo] = useState<string>("");
  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  const pipeline = useMemo(() => {
    if (crossLabsUnified) {
      const unified = synthesizeCrossLabsUnifiedRemix({
        schemaVersion: 2,
        episodeTitleKo: sourceTitle,
        bg3d: { overallScore100: 94.2, weeklyHoursSaved: 24.5, contrastRatio: 2.45, lineThicknessPx: 1.35 },
        brushLab: { overallScore100: 97.3, taperSharpness100: 97.4, averageStrokePx: 4.48, presetNameKo: "칼선 G펜" },
        characterLab: { overallScore100: 96.9, turnaroundScore100: 96.4, faceSdfScore100: 99.5, outlineWidthMm: 3.5 },
      });
      const activeLens = unified.lenses[selectedLensIndex] ?? unified.lenses[0]!;
      return {
        targetPersonaKo: "3대 랩스 통합 스튜디오 제작팀",
        activeLenses: unified.lenses,
        activeLens,
        swapLabel: "unit-economics",
        modeBDraft: expandLensToChannelDraft(activeLens, selectedChannelId),
        modeC: unified.modeC,
        audit: unified.audit,
        crossLabsBadgeKo: unified.summaryBadgeKo,
      };
    }

    const bundle = ingestFreshIdeasSources([
      {
        id: "studio-bg3d-live",
        title: sourceTitle,
        kind: sourceMetricsSummaryKo ? "sheet-csv" : "article",
        content: [sourceSummaryKo, sourceMetricsSummaryKo].filter(Boolean).join("\n"),
      },
    ]);
    const deconstruction = deconstructFreshIdeasThesis(bundle);
    const coreLenses = generateFiveOrthogonalLenses(bundle, deconstruction, {
      preferredLensId: "contrarian-take",
    });
    const swapRecommendation = recommendExtendedLensSwap(bundle);
    const extendedDef =
      EXTENDED_LENS_PACK.find((item) => item.id === swapRecommendation.withExtendedLensId) ??
      EXTENDED_LENS_PACK[0]!;
    const activeLenses = includeExtendedLens
      ? [...coreLenses, extendedDef.buildCard(bundle, deconstruction)]
      : coreLenses;
    const activeLens = activeLenses[selectedLensIndex] ?? activeLenses[0]!;
    const modeBDraft = expandLensToChannelDraft(activeLens, selectedChannelId);
    const modeC = runFreshIdeasModeCWorkflow({
      sourceTitle,
      targetPersonaKo: bundle.targetPersonaKo,
      lenses: coreLenses,
      primaryLensIndex: Math.min(selectedLensIndex, coreLenses.length - 1),
      secondaryLensIndex: selectedLensIndex === 2 ? 0 : 2,
      preferredChannel: selectedChannelId,
    });
    const audit = auditFreshIdeasQualityAndSafety(
      activeLenses,
      modeBDraft.bodySectionsKo.join("\n"),
      bundle.preservedUrls,
    );

    return {
      targetPersonaKo: bundle.targetPersonaKo,
      activeLenses,
      activeLens,
      swapLabel: swapRecommendation.withExtendedLensId,
      modeBDraft,
      modeC,
      audit,
      crossLabsBadgeKo: "",
    };
  }, [
    sourceTitle,
    sourceSummaryKo,
    sourceMetricsSummaryKo,
    includeExtendedLens,
    crossLabsUnified,
    selectedLensIndex,
    selectedChannelId,
  ]);

  const handleRunStream = async () => {
    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setIsStreaming(true);
    setStreamedText("");
    setStreamProgressPct(0);

    try {
      const gen = streamFreshIdeasRemixDraft({
        lens: pipeline.activeLens,
        channelId: selectedChannelId,
        signal: controller.signal,
        chunkDelayMs: 0,
      });
      for await (const chunk of gen) {
        if (controller.signal.aborted) break;
        setStreamedText(chunk.accumulatedText);
        setStreamProgressPct(chunk.progressPct);
      }
      onStatusChange?.(`Fresh Ideas v2.2 스트리밍 초안 완료 (${pipeline.modeBDraft.channelLabelKo})`);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleStopStream = () => {
    streamAbortRef.current?.abort();
    setIsStreaming(false);
  };

  const handleSaveToIdeaBank = () => {
    const saved = appendIdeaBankRows(pipeline.modeC.ideaBankRows);
    setBankCount(saved.length);
    const msg = `로컬 아이디어 뱅크 저장 완료 (누적 ${saved.length}건)`;
    setExportNoticeKo(msg);
    onStatusChange?.(msg);
  };

  const handleCopyDocsMarkdown = async () => {
    const md = buildStructuredGoogleDocMarkdown(pipeline.modeC);
    try {
      await navigator.clipboard?.writeText(md);
    } catch {
      // Clipboard unavailable in headless environments
    }
    const msg = `Google Docs 마크다운+4시드 부록 준비 (${md.length}자)`;
    setExportNoticeKo(msg);
    onStatusChange?.(msg);
  };

  const handleExportSheetsCsv = async () => {
    const csv = serializeIdeaBankCsv(pipeline.modeC.ideaBankRows);
    try {
      await navigator.clipboard?.writeText(csv);
    } catch {
      // Clipboard unavailable in headless environments
    }
    const msg = `Google Sheets 7열 CSV 직렬화 완료 (${pipeline.modeC.ideaBankRows.length}행)`;
    setExportNoticeKo(msg);
    onStatusChange?.(msg);
  };

  return (
    <section
      data-testid="studio-fresh-ideas-v2-workbench"
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4 text-xs text-fg [word-break:keep-all]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span className="text-sm font-medium text-fg">
            Fresh Ideas v2.2 에디토리얼 리믹스 워크벤치
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="fresh-ideas-v2-capability-badge"
            className="inline-flex items-center gap-1.5 rounded border border-line bg-raised px-2 py-1 font-mono text-xs tabular-nums text-fg-2"
          >
            <ShieldCheck size={14} strokeWidth={1.5} className="shrink-0 text-[#4cc38a]" aria-hidden />
            {FRESH_IDEAS_100_CAPABILITIES.length}/100 규격 · Unslop {pipeline.audit.score100}점
          </span>
          <span
            data-testid="fresh-ideas-bank-count"
            className="inline-flex items-center gap-1 rounded border border-line bg-panel px-2 py-1 font-mono text-xs tabular-nums text-fg-3"
          >
            <Database size={12} strokeWidth={1.5} className="shrink-0" aria-hidden />
            뱅크 {bankCount}건
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Fresh Ideas 실행 모드">
          {(
            [
              ["mode-a-5-lens", "Mode A · 5대 렌즈"],
              ["mode-b-channel-draft", "Mode B · 10종 채널·스트리밍"],
              ["mode-c-ecosystem", "Mode C · 결합·OSMU·내보내기"],
            ] as const
          ).map(([modeId, label]) => (
            <button
              key={modeId}
              type="button"
              role="tab"
              aria-selected={activeMode === modeId}
              disabled={disabled}
              data-testid={`fresh-ideas-mode-${modeId}`}
              onClick={() => {
                setActiveMode(modeId);
                onStatusChange?.(`Fresh Ideas v2.2 모드 전환: ${label}`);
              }}
              className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                activeMode === modeId
                  ? "border-accent bg-raised text-fg"
                  : "border-line bg-panel text-fg-3 hover:bg-raised"
              } ${MOTION_BTN}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={disabled}
            data-testid="fresh-ideas-toggle-cross-labs"
            onClick={() => setCrossLabsUnified((prev) => !prev)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
              crossLabsUnified
                ? "border-accent bg-raised text-fg"
                : "border-line bg-panel text-fg-3 hover:bg-raised"
            } ${MOTION_BTN}`}
          >
            <Layers size={14} strokeWidth={1.5} className="shrink-0" aria-hidden />
            <span>3대 랩스 통합 리믹스</span>
          </button>
          <button
            type="button"
            disabled={disabled || crossLabsUnified}
            data-testid="fresh-ideas-toggle-extended-lens"
            onClick={() => setIncludeExtendedLens((prev) => !prev)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
              includeExtendedLens
                ? "border-accent bg-raised text-fg"
                : "border-line bg-panel text-fg-3 hover:bg-raised"
            } ${MOTION_BTN}`}
          >
            <SlidersHorizontal size={14} strokeWidth={1.5} className="shrink-0" aria-hidden />
            <span>확장 렌즈 ({pipeline.swapLabel})</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {pipeline.activeLenses.map((lens, idx) => {
          const active = idx === selectedLensIndex;
          return (
            <button
              key={lens.id}
              type="button"
              disabled={disabled}
              data-testid={`fresh-ideas-v2-lens-${lens.indexTag}`}
              onClick={() => {
                setSelectedLensIndex(idx);
                onStatusChange?.(`${lens.indexTag} · ${lens.labelKo}: ${lens.headlineKo}`);
              }}
              className={`flex min-h-11 flex-col items-start justify-between gap-1 rounded-lg border p-2.5 text-left ${
                active
                  ? "border-accent bg-raised text-fg"
                  : "border-line bg-panel text-fg-2 hover:bg-raised"
              } ${MOTION_BTN}`}
            >
              <div className="flex w-full items-center justify-between gap-1">
                <span className="rounded bg-card px-1.5 py-0.5 font-mono text-xs tabular-nums text-fg-2">
                  {lens.indexTag}
                </span>
                <span className="truncate font-mono text-[11px] tabular-nums text-fg-3">
                  {lens.effortTagKo}
                </span>
              </div>
              <span className="text-xs font-medium text-fg">{lens.labelKo}</span>
              <span className="line-clamp-1 text-xs text-fg-3">{lens.headlineKo}</span>
            </button>
          );
        })}
      </div>

      {activeMode === "mode-a-5-lens" && (
        <div
          data-testid="fresh-ideas-mode-a-panel"
          className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-fg">
              {pipeline.activeLens.indexTag} · {pipeline.activeLens.labelKo} ({pipeline.activeLens.labelEn})
            </span>
            <span className="font-mono text-xs tabular-nums text-fg-3">
              {pipeline.crossLabsBadgeKo || `타겟: ${pipeline.targetPersonaKo}`}
            </span>
          </div>
          <p className="text-sm font-medium text-fg">{pipeline.activeLens.headlineKo}</p>
          <p className="leading-5 text-fg-2">{pipeline.activeLens.angleKo}</p>
          {pipeline.activeLens.experienceSlotPromptKo && (
            <p className="rounded border border-line bg-card px-2.5 py-2 font-mono text-xs text-fg-2">
              {pipeline.activeLens.experienceSlotPromptKo}
            </p>
          )}
          {pipeline.activeLens.playbookStepsKo && (
            <ol className="list-inside list-decimal space-y-1 text-fg-2">
              {pipeline.activeLens.playbookStepsKo.map((step, i) => (
                <li key={i}>
                  {step.actionKo}{" "}
                  <span className="font-mono text-fg-3">({step.doneCriteriaKo})</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {activeMode === "mode-b-channel-draft" && (
        <div
          data-testid="fresh-ideas-mode-b-panel"
          className="flex flex-col gap-2.5 rounded-lg border border-line bg-panel p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {SUPPORTED_CHANNEL_OPTIONS.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`fresh-ideas-channel-${ch.id}`}
                  onClick={() => setSelectedChannelId(ch.id)}
                  className={`min-h-8 rounded border px-2 py-1 text-xs ${
                    selectedChannelId === ch.id
                      ? "border-accent bg-raised font-medium text-fg"
                      : "border-line bg-card text-fg-3 hover:bg-raised"
                  } ${MOTION_BTN}`}
                >
                  {ch.labelKo}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={disabled || isStreaming}
                data-testid="fresh-ideas-stream-btn"
                onClick={() => void handleRunStream()}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded border border-accent bg-raised px-2.5 py-1 text-xs font-medium text-fg ${MOTION_BTN}`}
              >
                <Play size={12} strokeWidth={1.5} className="shrink-0" aria-hidden />
                <span>실시간 스트리밍 생성</span>
              </button>
              {isStreaming && (
                <button
                  type="button"
                  onClick={handleStopStream}
                  className={`inline-flex min-h-8 items-center gap-1 rounded border border-line bg-card px-2 py-1 text-xs text-fg-2 ${MOTION_BTN}`}
                >
                  <Square size={12} strokeWidth={1.5} className="shrink-0" aria-hidden />
                  <span>중지</span>
                </button>
              )}
            </div>
          </div>

          {streamedText && (
            <div
              data-testid="fresh-ideas-stream-output"
              className="rounded border border-accent/60 bg-card p-2.5"
            >
              <span className="block font-mono text-[11px] tabular-nums text-fg-3">
                스트리밍 출력 ({streamProgressPct}%) · Unslop 실시간 정제 적용
              </span>
              <p className="mt-1 whitespace-pre-line leading-5 text-fg-2">{streamedText}</p>
            </div>
          )}

          <div className="rounded border border-line bg-card p-2.5">
            <span className="block font-mono text-[11px] text-fg-3">제목 3종 변주 (직설 · 질문 · 장면)</span>
            <p className="mt-1 font-medium text-fg">{pipeline.modeBDraft.headlineVariants.directThesisKo}</p>
            <p className="text-fg-2">{pipeline.modeBDraft.headlineVariants.tensionQuestionKo}</p>
            <p className="text-fg-3">{pipeline.modeBDraft.headlineVariants.metricOrSceneKo}</p>
          </div>
          <div className="space-y-1.5 leading-5 text-fg-2">
            {pipeline.modeBDraft.bodySectionsKo.map((sec, idx) => (
              <p key={idx} className="whitespace-pre-line">
                {sec}
              </p>
            ))}
            <p className="rounded border border-line bg-card px-2.5 py-2 text-fg-2">
              예상 반박 선제 대응: {pipeline.modeBDraft.preemptiveObjectionKo}
            </p>
          </div>
        </div>
      )}

      {activeMode === "mode-c-ecosystem" && (
        <div
          data-testid="fresh-ideas-mode-c-panel"
          className="flex flex-col gap-2.5 rounded-lg border border-line bg-panel p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={disabled}
                data-testid="fresh-ideas-save-bank-btn"
                onClick={handleSaveToIdeaBank}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded border border-accent bg-raised px-2.5 py-1 text-xs font-medium text-fg ${MOTION_BTN}`}
              >
                <Database size={12} strokeWidth={1.5} className="shrink-0" aria-hidden />
                <span>아이디어 뱅크 5행 저장</span>
              </button>
              <button
                type="button"
                disabled={disabled}
                data-testid="fresh-ideas-copy-docs-btn"
                onClick={() => void handleCopyDocsMarkdown()}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded border border-line bg-card px-2.5 py-1 text-xs text-fg-2 hover:bg-raised ${MOTION_BTN}`}
              >
                <Copy size={12} strokeWidth={1.5} className="shrink-0" aria-hidden />
                <span>Docs 마크다운+4시드 복사</span>
              </button>
              <button
                type="button"
                disabled={disabled}
                data-testid="fresh-ideas-export-csv-btn"
                onClick={() => void handleExportSheetsCsv()}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded border border-line bg-card px-2.5 py-1 text-xs text-fg-2 hover:bg-raised ${MOTION_BTN}`}
              >
                <Download size={12} strokeWidth={1.5} className="shrink-0" aria-hidden />
                <span>Sheets 7열 CSV 복사</span>
              </button>
            </div>
            {exportNoticeKo && (
              <span data-testid="fresh-ideas-export-notice" className="font-mono text-xs text-fg-2">
                {exportNoticeKo}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded border border-line bg-card p-2.5">
              <span className="inline-flex items-center gap-1.5 font-medium text-fg">
                <GitMerge size={14} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
                <span>40/60 하이브리드 결합 ({pipeline.modeC.hybridFusion.combinedLabelKo})</span>
              </span>
              <p className="mt-1.5 leading-5 text-fg-2">{pipeline.modeC.hybridFusion.top40HookFrameKo}</p>
              <p className="mt-1 leading-5 text-fg-3">{pipeline.modeC.hybridFusion.bottom60ProofResolutionKo}</p>
            </div>
            <div className="rounded border border-line bg-card p-2.5">
              <span className="inline-flex items-center gap-1.5 font-medium text-fg">
                <Layers size={14} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
                <span>5부작 연재 시리즈 · 아이디어 뱅크 ({pipeline.modeC.ideaBankRows.length}행)</span>
              </span>
              <ul className="mt-1.5 space-y-1 text-fg-2">
                {pipeline.modeC.serializedSeries.slice(0, 3).map((ep) => (
                  <li key={ep.partNumber} className="truncate">
                    {ep.episodeTitleKo}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] text-fg-3">
                <CheckCircle2 size={12} strokeWidth={1.5} className="shrink-0 text-[#4cc38a]" aria-hidden />
                {pipeline.modeC.voiceChainingHintKo}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
