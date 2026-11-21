/**
 * `@unslop` 9-Pass Studio Fresh Ideas v2.2 Workbench Card (100-Capability + Streaming + Export + Cross-Labs).
 * Zero decorative emojis, zero raw HEX colors, 4px spacing grid, tabular-nums index tags,
 * 44px touch targets, concentric radii, and explicit property motion transitions.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Database,
  ExternalLink,
  Layers,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import {
  FRESH_IDEAS_100_CAPABILITIES,
  loadFreshIdeasUserConfig,
  loadPreferredSessionLensId,
  recordSessionLensAffinity,
  saveFreshIdeasUserConfig,
  type CoreLensId,
  type ExtendedLensId,
  type FreshIdeasMode,
  type KoreanSpeechRegister,
  type TargetChannelId,
} from "./fresh-ideas-contracts";
import {
  deconstructFreshIdeasThesis,
  ingestFreshIdeasSources,
  type FreshIdeasSourceItem,
} from "./fresh-ideas-ingest-deconstruct";
import {
  applyExtendedLensSwap,
  buildExtendedLensCardById,
  CONTRARIAN_MODE_OPTIONS,
  EXTENDED_LENS_PACK,
  generateFiveOrthogonalLenses,
  recommendExtendedLensSwap,
  scanFiveBlindSpotAxes,
  type BlindSpotAxisId,
  type ContrarianIntensityMode,
} from "./fresh-ideas-lenses-engine";
import { expandLensToChannelDraft } from "./fresh-ideas-channels-localization";
import {
  auditFreshIdeasQualityAndSafety,
  runFreshIdeasModeCWorkflow,
  type IdeaBankSpreadsheetRow,
} from "./fresh-ideas-quality-ecosystem";
import { streamFreshIdeasRemixDraft } from "./fresh-ideas-streaming-cloud-bridge";
import {
  appendIdeaBankRows,
  buildStructuredGoogleDocMarkdown,
  loadIdeaBankSnapshot,
  serializeIdeaBankCsv,
  updateIdeaBankRecordStatus,
  type StoredIdeaBankRecord,
} from "./fresh-ideas-workspace-export-bridge";
import {
  parseCrossLabFreshIdeasEnvelope,
  synthesizeCrossLabsUnifiedRemix,
  type CrossLabFreshIdeasEnvelopeV2,
} from "./fresh-ideas-cross-labs-adapter";
import {
  buildFreshIdeasStorySeedPayload,
  type FreshIdeasStorySeedPayload,
} from "./fresh-ideas-story-seed-bridge";
import { FreshIdeasModeBChannelPanel } from "./StudioFreshIdeasV2ModeBPanel";
import {
  FreshIdeasModeCEcosystemPanel,
  FreshIdeasSourceAndDeconstructDrawer,
  type CustomSourceDraftState,
} from "./StudioFreshIdeasV2Subpanels";

const MOTION_BTN =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";

const CORE_LENS_ID_SET = new Set<string>([
  "contrarian-take",
  "personal-story-hook",
  "data-evidence-angle",
  "practical-playbook",
  "what-they-missed",
]);

export interface StudioFreshIdeasV2WorkbenchCardProps {
  readonly sourceTitle: string;
  readonly sourceSummaryKo: string;
  readonly sourceMetricsSummaryKo?: string;
  readonly disabled?: boolean;
  readonly crossLabsEnvelope?: CrossLabFreshIdeasEnvelopeV2;
  readonly onExportStorySeed?: (payload: FreshIdeasStorySeedPayload) => void;
  readonly onStatusChange?: (summaryKo: string) => void;
}

export function StudioFreshIdeasV2WorkbenchCard({
  sourceTitle,
  sourceSummaryKo,
  sourceMetricsSummaryKo,
  disabled = false,
  crossLabsEnvelope,
  onExportStorySeed,
  onStatusChange,
}: StudioFreshIdeasV2WorkbenchCardProps) {
  const [userConfig, setUserConfig] = useState(() => loadFreshIdeasUserConfig());
  const [preferredCoreLensId, setPreferredCoreLensId] = useState<CoreLensId>(
    () => loadPreferredSessionLensId() ?? "contrarian-take",
  );
  const [activeMode, setActiveMode] = useState<FreshIdeasMode>("mode-a-5-lens");
  const [selectedLensIndex, setSelectedLensIndex] = useState<number>(0);
  const [selectedChannelId, setSelectedChannelId] = useState<TargetChannelId>(
    () => userConfig.preferredChannels[0] ?? "linkedin-kr",
  );
  const [selectedRegister, setSelectedRegister] = useState<KoreanSpeechRegister>(
    () => userConfig.defaultKoreanRegister,
  );
  const [bridgeForeignToKorea, setBridgeForeignToKorea] = useState<boolean>(false);
  const [contrarianMode, setContrarianMode] = useState<ContrarianIntensityMode>("root-cause-flip");
  const [selectedBlindSpotAxis, setSelectedBlindSpotAxis] = useState<BlindSpotAxisId | undefined>(
    undefined,
  );
  const [includeExtendedLens, setIncludeExtendedLens] = useState<boolean>(false);
  const [swapCoreWithExtended, setSwapCoreWithExtended] = useState<boolean>(false);
  const [selectedExtendedLensId, setSelectedExtendedLensId] = useState<ExtendedLensId | null>(null);
  const [crossLabsUnified, setCrossLabsUnified] = useState<boolean>(false);
  const [customDraft, setCustomDraft] = useState<CustomSourceDraftState>(() => ({
    enabled: false,
    promptOrGoalKo: "",
    kind: sourceMetricsSummaryKo ? "sheet-csv" : "article",
    titleKo: sourceTitle,
    contentKo: [sourceSummaryKo, sourceMetricsSummaryKo].filter(Boolean).join("\n"),
    url: "",
    secondDocTitleKo: "",
    secondDocContentKo: "",
  }));

  const [streamedText, setStreamedText] = useState<string>("");
  const [streamProgressPct, setStreamProgressPct] = useState<number>(0);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [savedRecords, setSavedRecords] = useState<readonly StoredIdeaBankRecord[]>(() =>
    loadIdeaBankSnapshot(),
  );
  const [exportNoticeKo, setExportNoticeKo] = useState<string>("");
  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  const pipeline = useMemo(() => {
    const effectiveTitle =
      (customDraft.enabled ? customDraft.titleKo.trim() : "") || sourceTitle || "핵심 원문";

    const sources: FreshIdeasSourceItem[] = customDraft.enabled
      ? [
          {
            id: "custom-primary",
            title: effectiveTitle,
            kind: customDraft.kind,
            content:
              customDraft.contentKo.trim() ||
              [sourceSummaryKo, sourceMetricsSummaryKo].filter(Boolean).join("\n"),
            url: customDraft.url.trim() || undefined,
          },
          ...(customDraft.secondDocContentKo.trim()
            ? [
                {
                  id: "custom-secondary",
                  title: customDraft.secondDocTitleKo.trim() || "교차 비교 보조 원문",
                  kind: "multi-doc" as const,
                  content: customDraft.secondDocContentKo.trim(),
                },
              ]
            : []),
        ]
      : [
          {
            id: "studio-bg3d-live",
            title: effectiveTitle,
            kind: sourceMetricsSummaryKo ? "sheet-csv" : "article",
            content: [sourceSummaryKo, sourceMetricsSummaryKo].filter(Boolean).join("\n"),
          },
        ];

    const bundle = ingestFreshIdeasSources(sources);
    const deconstruction = deconstructFreshIdeasThesis(bundle);
    const blindSpotAxes = scanFiveBlindSpotAxes(bundle, deconstruction);
    const validatedCrossLabsEnvelope = crossLabsEnvelope
      ? parseCrossLabFreshIdeasEnvelope(crossLabsEnvelope)
      : null;

    if (crossLabsUnified && validatedCrossLabsEnvelope) {
      const unified = synthesizeCrossLabsUnifiedRemix(validatedCrossLabsEnvelope);
      const activeLens = unified.lenses[selectedLensIndex] ?? unified.lenses[0]!;
      return {
        effectiveTitle,
        bundle,
        deconstruction,
        blindSpotAxes,
        targetPersonaKo: "3대 랩스 통합 스튜디오 제작팀",
        activeLenses: unified.lenses,
        activeLens,
        swapRecommendation: recommendExtendedLensSwap(bundle),
        swapLabel: "unit-economics" as ExtendedLensId,
        modeBDraft: expandLensToChannelDraft(activeLens, selectedChannelId, {
          registerOverride: selectedRegister,
          bridgeForeignSourceToKorea: bridgeForeignToKorea,
        }),
        modeC: unified.modeC,
        audit: unified.audit,
        crossLabsBadgeKo: unified.summaryBadgeKo,
        crossLabsTelemetryState: "live" as const,
      };
    }

    const rawCoreLenses = generateFiveOrthogonalLenses(bundle, deconstruction, {
      contrarianMode,
      preferredLensId: preferredCoreLensId,
      blindSpotAxisOverride: selectedBlindSpotAxis,
    });
    const swapRecommendation = recommendExtendedLensSwap(bundle);
    const effectiveExtendedId = selectedExtendedLensId ?? swapRecommendation.withExtendedLensId;

    const swappedBaseLenses = swapCoreWithExtended
      ? applyExtendedLensSwap(
          rawCoreLenses,
          { ...swapRecommendation, withExtendedLensId: effectiveExtendedId },
          bundle,
          deconstruction,
        )
      : rawCoreLenses;

    const activeLenses =
      includeExtendedLens && !swapCoreWithExtended
        ? [...swappedBaseLenses, buildExtendedLensCardById(effectiveExtendedId, bundle, deconstruction)]
        : swappedBaseLenses;

    const activeLens = activeLenses[selectedLensIndex] ?? activeLenses[0]!;
    const modeBDraft = expandLensToChannelDraft(activeLens, selectedChannelId, {
      registerOverride: selectedRegister,
      bridgeForeignSourceToKorea: bridgeForeignToKorea || bundle.isForeignContext,
    });
    const modeC = runFreshIdeasModeCWorkflow({
      sourceTitle: effectiveTitle,
      sourceUrl: bundle.preservedUrls[0],
      targetPersonaKo: bundle.targetPersonaKo,
      lenses: rawCoreLenses,
      primaryLensIndex: Math.min(selectedLensIndex, rawCoreLenses.length - 1),
      secondaryLensIndex: selectedLensIndex === 2 ? 0 : 2,
      preferredChannel: selectedChannelId,
    });
    const audit = auditFreshIdeasQualityAndSafety(
      activeLenses,
      modeBDraft.bodySectionsKo.join("\n"),
      bundle.preservedUrls,
      {
        sourceCorpus: bundle.normalizedBodyText,
        extraBannedPhrases: userConfig.extraBannedPhrases,
      },
    );

    return {
      effectiveTitle,
      bundle,
      deconstruction,
      blindSpotAxes,
      targetPersonaKo: bundle.targetPersonaKo,
      activeLenses,
      activeLens,
      swapRecommendation,
      swapLabel: effectiveExtendedId,
      modeBDraft,
      modeC,
      audit,
      crossLabsBadgeKo: crossLabsUnified ? "3대 랩스 통합 리믹스 · [측정 필요]" : "",
      crossLabsTelemetryState: crossLabsUnified ? ("missing" as const) : ("off" as const),
    };
  }, [
    sourceTitle,
    sourceSummaryKo,
    sourceMetricsSummaryKo,
    customDraft,
    contrarianMode,
    preferredCoreLensId,
    selectedBlindSpotAxis,
    includeExtendedLens,
    swapCoreWithExtended,
    selectedExtendedLensId,
    crossLabsUnified,
    crossLabsEnvelope,
    selectedLensIndex,
    selectedChannelId,
    selectedRegister,
    bridgeForeignToKorea,
    userConfig.extraBannedPhrases,
  ]);

  const handleChangeRegister = (nextRegister: KoreanSpeechRegister) => {
    setSelectedRegister(nextRegister);
    const updated = saveFreshIdeasUserConfig({
      ...userConfig,
      defaultKoreanRegister: nextRegister,
    });
    setUserConfig(updated);
    onStatusChange?.(`한국어 종결어미 잠금 전환: ${nextRegister}`);
  };

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
        registerOverride: selectedRegister,
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
    setSavedRecords(saved);
    const msg = `로컬 아이디어 뱅크 저장 완료 (누적 ${saved.length}건)`;
    setExportNoticeKo(msg);
    onStatusChange?.(msg);
  };

  const handleChangeBankStatus = (
    recordId: string,
    status: IdeaBankSpreadsheetRow["draftStatus"],
  ) => {
    const updated = updateIdeaBankRecordStatus(recordId, status);
    setSavedRecords(updated);
    onStatusChange?.(`아이디어 뱅크 상태 변경: ${status}`);
  };

  const handleCopyDocsMarkdown = async () => {
    const md = buildStructuredGoogleDocMarkdown(pipeline.modeC);
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(md);
        copied = true;
      }
    } catch {
      copied = false;
    }
    const msg = `Google Docs 마크다운+4시드 부록 준비 (${md.length}자${copied ? " · 클립보드 복사됨" : ""})`;
    setExportNoticeKo(msg);
    onStatusChange?.(msg);
  };

  const handleExportSheetsCsv = async () => {
    const csv = serializeIdeaBankCsv(pipeline.modeC.ideaBankRows);
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(csv);
        copied = true;
      }
    } catch {
      copied = false;
    }
    const msg = `Google Sheets 7열 CSV 직렬화 완료 (${pipeline.modeC.ideaBankRows.length}행${copied ? " · 클립보드 복사됨" : ""})`;
    setExportNoticeKo(msg);
    onStatusChange?.(msg);
  };

  const handleExportStorySeed = async () => {
    const payload = buildFreshIdeasStorySeedPayload({
      sourceTitle: pipeline.effectiveTitle,
      lens: pipeline.activeLens,
      modeC: pipeline.modeC,
      lenses: pipeline.activeLenses,
      targetPersonaKo: pipeline.targetPersonaKo,
      register: selectedRegister,
      preservedUrls: pipeline.bundle.preservedUrls,
    });
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload.clipboardTextKo);
        copied = true;
      }
    } catch {
      copied = false;
    }
    onExportStorySeed?.(payload);
    const msg = `${payload.summaryKo}${copied ? " · 클립보드 복사됨" : ""}`;
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
            <ShieldCheck size={14} strokeWidth={1.5} className="shrink-0 text-good" aria-hidden />
            {FRESH_IDEAS_100_CAPABILITIES.length}/100 규격 · Unslop {pipeline.audit.score100}점
          </span>
          <span
            data-testid="fresh-ideas-bank-count"
            className="inline-flex items-center gap-1 rounded border border-line bg-panel px-2 py-1 font-mono text-xs tabular-nums text-fg-3"
          >
            <Database size={12} strokeWidth={1.5} className="shrink-0" aria-hidden />
            뱅크 {savedRecords.length}건
          </span>
        </div>
      </div>

      <FreshIdeasSourceAndDeconstructDrawer
        disabled={disabled}
        draft={customDraft}
        bundle={pipeline.bundle}
        deconstruction={pipeline.deconstruction}
        blindSpotAxes={pipeline.blindSpotAxes}
        selectedBlindSpotAxis={selectedBlindSpotAxis}
        onChangeDraft={setCustomDraft}
        onSelectBlindSpotAxis={(axis) => {
          setSelectedBlindSpotAxis(axis);
          onStatusChange?.(`5축 사각지대 전환: ${axis}`);
        }}
      />

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
              className={`min-h-11 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                activeMode === modeId
                  ? "border-accent bg-raised text-fg"
                  : "border-line bg-panel text-fg-3 hover:bg-raised"
              } ${MOTION_BTN}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={disabled}
            data-testid="fresh-ideas-toggle-cross-labs"
            onClick={() => setCrossLabsUnified((prev) => !prev)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
              crossLabsUnified
                ? "border-accent bg-raised text-fg"
                : "border-line bg-panel text-fg-3 hover:bg-raised"
            } ${MOTION_BTN}`}
          >
            <Layers size={14} strokeWidth={1.5} className="shrink-0" aria-hidden />
            <span>3대 랩스 통합 리믹스</span>
            {pipeline.crossLabsTelemetryState === "missing" && (
              <span
                data-testid="fresh-ideas-cross-labs-status-badge"
                className="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[11px] text-warn"
              >
                [측정 필요]
              </span>
            )}
          </button>

          <select
            aria-label="확장 렌즈 팩 선택 (06~14)"
            disabled={disabled || pipeline.crossLabsTelemetryState === "live"}
            data-testid="fresh-ideas-extended-lens-select"
            value={pipeline.swapLabel}
            onChange={(e) => setSelectedExtendedLensId(e.target.value as ExtendedLensId)}
            className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg-2"
          >
            {EXTENDED_LENS_PACK.map((ext) => (
              <option key={ext.id} value={ext.id}>
                {ext.indexTag} · {ext.labelKo}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={disabled || pipeline.crossLabsTelemetryState === "live"}
            data-testid="fresh-ideas-toggle-extended-lens"
            onClick={() => {
              setSwapCoreWithExtended(false);
              setIncludeExtendedLens((prev) => !prev);
            }}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
              includeExtendedLens
                ? "border-accent bg-raised text-fg"
                : "border-line bg-panel text-fg-3 hover:bg-raised"
            } ${MOTION_BTN}`}
          >
            <SlidersHorizontal size={14} strokeWidth={1.5} className="shrink-0" aria-hidden />
            <span>확장 렌즈 추가 ({pipeline.swapLabel})</span>
          </button>

          <button
            type="button"
            disabled={disabled || pipeline.crossLabsTelemetryState === "live"}
            data-testid="fresh-ideas-swap-extended-btn"
            onClick={() => {
              setIncludeExtendedLens(false);
              setSwapCoreWithExtended((prev) => !prev);
            }}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
              swapCoreWithExtended
                ? "border-accent bg-raised text-fg"
                : "border-line bg-panel text-fg-3 hover:bg-raised"
            } ${MOTION_BTN}`}
          >
            <span>추천 스왑</span>
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
                if (CORE_LENS_ID_SET.has(lens.id)) {
                  setPreferredCoreLensId(recordSessionLensAffinity(lens.id as CoreLensId));
                }
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
                  {lens.recommendedForUser ? `선호 · ${lens.effortTagKo}` : lens.effortTagKo}
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
              {pipeline.crossLabsBadgeKo || `Target: ${pipeline.targetPersonaKo}`}
            </span>
          </div>

          {pipeline.crossLabsTelemetryState === "missing" && (
            <div
              data-testid="fresh-ideas-cross-labs-measurement-needed"
              className="flex flex-wrap items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2 [word-break:keep-all]"
            >
              <span className="font-mono font-medium text-warn">[측정 필요]</span>
              <span className="min-w-0 flex-1">
                배경 3D·브러시·캐릭터 작업실 실측 수치가 아직 연결되지 않아 임의 점수를 생성하지 않았습니다. 현재 원문 기준 5대 렌즈를 그대로 유지하며, 각 작업실 측정을 연결하면 통합 합성이 활성화됩니다.
              </span>
            </div>
          )}

          {pipeline.activeLens.id === "contrarian-take" &&
            pipeline.crossLabsTelemetryState !== "live" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] text-fg-3">반론 강도:</span>
              {CONTRARIAN_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`fresh-ideas-contrarian-${opt.id}`}
                  onClick={() => setContrarianMode(opt.id)}
                  className={`min-h-9 rounded border px-2.5 py-1 text-[11px] ${
                    pipeline.activeLens.contrarianMode === opt.id
                      ? "border-accent bg-raised font-medium text-fg"
                      : "border-line bg-card text-fg-3 hover:bg-raised"
                  } ${MOTION_BTN}`}
                >
                  {opt.labelKo}
                </button>
              ))}
            </div>
          )}

          <p className="text-sm font-medium text-fg">{pipeline.activeLens.headlineKo}</p>
          <p className="leading-5 text-fg-2">{pipeline.activeLens.angleKo}</p>

          {pipeline.activeLens.lowDensitySkipNoteKo && (
            <p
              data-testid="fresh-ideas-low-density-note"
              className="rounded border border-line bg-card px-2.5 py-1.5 font-mono text-[11px] text-fg-3"
            >
              {pipeline.activeLens.lowDensitySkipNoteKo}
            </p>
          )}

          {pipeline.activeLens.experienceSlotPromptKo && (
            <div className="space-y-1.5 rounded border border-line bg-card p-2.5">
              <p className="font-mono text-xs text-fg-2">
                {pipeline.activeLens.experienceSlotPromptKo}
              </p>
              {pipeline.activeLens.fourBeatArcKo && (
                <ol className="list-inside list-decimal space-y-0.5 text-[11px] text-fg-3">
                  {pipeline.activeLens.fourBeatArcKo.map((beat, i) => (
                    <li key={i}>{beat}</li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {pipeline.activeLens.retrievalPlaceholdersKo &&
            pipeline.activeLens.retrievalPlaceholdersKo.length > 0 && (
              <div className="rounded border border-line bg-card px-2.5 py-2 font-mono text-[11px] text-fg-3">
                {pipeline.activeLens.retrievalPlaceholdersKo.join(" · ")}
              </div>
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

          {pipeline.activeLens.preservedUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {pipeline.activeLens.preservedUrls.map((url, idx) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[11px] text-accent underline"
                >
                  <span>출처 {idx + 1}</span>
                  <ExternalLink size={11} strokeWidth={1.5} aria-hidden />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {activeMode === "mode-b-channel-draft" && (
        <FreshIdeasModeBChannelPanel
          disabled={disabled}
          selectedChannelId={selectedChannelId}
          selectedRegister={selectedRegister}
          bridgeForeignToKorea={bridgeForeignToKorea}
          isStreaming={isStreaming}
          streamedText={streamedText}
          streamProgressPct={streamProgressPct}
          modeBDraft={pipeline.modeBDraft}
          onSelectChannelId={setSelectedChannelId}
          onChangeRegister={handleChangeRegister}
          onToggleKoreaBridge={() => setBridgeForeignToKorea((prev) => !prev)}
          onRunStream={() => void handleRunStream()}
          onStopStream={handleStopStream}
        />
      )}

      {activeMode === "mode-c-ecosystem" && (
        <FreshIdeasModeCEcosystemPanel
          disabled={disabled}
          lenses={pipeline.activeLenses}
          modeC={pipeline.modeC}
          exportNoticeKo={exportNoticeKo}
          savedRecords={savedRecords}
          onSaveToIdeaBank={handleSaveToIdeaBank}
          onCopyDocsMarkdown={() => void handleCopyDocsMarkdown()}
          onExportSheetsCsv={() => void handleExportSheetsCsv()}
          onExportStorySeed={() => void handleExportStorySeed()}
          onChangeRecordStatus={handleChangeBankStatus}
        />
      )}
    </section>
  );
}
