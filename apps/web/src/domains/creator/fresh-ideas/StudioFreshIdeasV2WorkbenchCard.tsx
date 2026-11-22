/**
 * `@unslop` 9-Pass Studio Fresh Ideas v3 Workbench Card (100-Capability + Episode Telemetry + 3-Cut Storyboard Bridge).
 * Zero decorative emojis, zero raw HEX colors, 4px spacing grid, tabular-nums index tags,
 * 44px touch targets, concentric radii, and explicit property motion transitions.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Clapperboard, Database, ExternalLink, Layers, ShieldCheck, SlidersHorizontal } from "lucide-react";

import {
  FRESH_IDEAS_100_CAPABILITIES, loadFreshIdeasUserConfig, loadPreferredSessionLensId,
  recordSessionLensAffinity, saveFreshIdeasUserConfig,
  type CoreLensId, type ExtendedLensId, type FreshIdeasMode, type KoreanSpeechRegister, type TargetChannelId,
} from "./fresh-ideas-contracts";
import { deconstructFreshIdeasThesis, ingestFreshIdeasSources, type FreshIdeasSourceItem } from "./fresh-ideas-ingest-deconstruct";
import {
  applyExtendedLensSwap, buildExtendedLensCardById, CONTRARIAN_MODE_OPTIONS, EXTENDED_LENS_PACK,
  generateFiveOrthogonalLenses, recommendExtendedLensSwap, scanFiveBlindSpotAxes,
  type BlindSpotAxisId, type ContrarianIntensityMode,
} from "./fresh-ideas-lenses-engine";
import { expandLensToChannelDraft } from "./fresh-ideas-channels-localization";
import { auditFreshIdeasQualityAndSafety, runFreshIdeasModeCWorkflow, type IdeaBankSpreadsheetRow } from "./fresh-ideas-quality-ecosystem";
import { streamFreshIdeasRemixDraft } from "./fresh-ideas-streaming-cloud-bridge";
import { buildStructuredGoogleDocMarkdown, serializeIdeaBankCsv, type StoredIdeaBankRecord } from "./fresh-ideas-workspace-export-bridge";
import { parseCrossLabFreshIdeasEnvelope, synthesizeCrossLabsUnifiedRemix, type CrossLabFreshIdeasEnvelopeV2 } from "./fresh-ideas-cross-labs-adapter";
import { buildFreshIdeasStorySeedPayload, type FreshIdeasStorySeedPayload } from "./fresh-ideas-story-seed-bridge";
import {
  buildFreshIdeasEpisodeSourceContentKo, extractEpisodeTelemetryForFreshIdeas,
  type EpisodeTelemetrySourceInput,
} from "./fresh-ideas-episode-telemetry-adapter";
import {
  buildThreeCutStoryboardSeedPacket,
  type FreshIdeasThreeCutStoryboardPacket,
} from "./fresh-ideas-storyboard-seed-packet";
import { studioLocalDatabaseOwnershipBusyUserMessage } from "../studio-local-database-ownership";
import { freshIdeasIdeaBank } from "./fresh-ideas-idea-bank-repository";
import { FreshIdeasModeBChannelPanel } from "./StudioFreshIdeasV2ModeBPanel";
import { FreshIdeasModeCEcosystemPanel, FreshIdeasSourceAndDeconstructDrawer, type CustomSourceDraftState } from "./StudioFreshIdeasV2Subpanels";

const MOTION_BTN =
  "transition-[background-color,border-color,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none";
const IDEA_BANK_BUSY_MESSAGE =
  "다른 Studio 탭이 로컬 저장소를 사용 중입니다. 그 탭을 닫고 다시 열어 주세요.";

function ideaBankErrorMessage(cause: unknown, fallback: string): string {
  return studioLocalDatabaseOwnershipBusyUserMessage(cause, IDEA_BANK_BUSY_MESSAGE) ?? fallback;
}

const CORE_LENS_ID_SET = new Set<string>([
  "contrarian-take", "personal-story-hook", "data-evidence-angle", "practical-playbook", "what-they-missed",
]);

export interface StudioFreshIdeasV2WorkbenchCardProps {
  readonly sourceTitle: string;
  readonly sourceSummaryKo: string;
  readonly sourceMetricsSummaryKo?: string;
  readonly disabled?: boolean;
  readonly crossLabsEnvelope?: CrossLabFreshIdeasEnvelopeV2;
  /** 현재 열린 원고 페이지·컷 데이터(생략 시 0컷 오프닝 3컷 설계 모드 안전 폴백). */
  readonly episodeTelemetrySource?: EpisodeTelemetrySourceInput;
  readonly onExportStorySeed?: (payload: FreshIdeasStorySeedPayload) => void;
  /** 선택 렌즈에서 결정론 3컷 콘티 초안 패킷 생성 시 호출되는 1클릭 브리지 콜백. */
  readonly onCreateStoryboardSeedPacket?: (packet: FreshIdeasThreeCutStoryboardPacket) => void;
  readonly onStatusChange?: (summaryKo: string) => void;
}

export function StudioFreshIdeasV2WorkbenchCard({
  sourceTitle,
  sourceSummaryKo,
  sourceMetricsSummaryKo,
  disabled = false,
  crossLabsEnvelope,
  episodeTelemetrySource,
  onExportStorySeed,
  onCreateStoryboardSeedPacket,
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
  const [selectedBlindSpotAxis, setSelectedBlindSpotAxis] = useState<BlindSpotAxisId | undefined>(undefined);
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
  const [savedRecords, setSavedRecords] = useState<readonly StoredIdeaBankRecord[]>([]);
  const [bankError, setBankError] = useState("");
  const [exportNoticeKo, setExportNoticeKo] = useState<string>("");
  const [storyboardPacketState, setStoryboardPacketState] = useState<{
    readonly key: string;
    readonly packet: FreshIdeasThreeCutStoryboardPacket;
  } | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { streamAbortRef.current?.abort(); }, []);

  useEffect(() => {
    if (activeMode !== "mode-c-ecosystem") return;
    let active = true;
    void freshIdeasIdeaBank.list().then(
      (records) => {
        if (active) { setSavedRecords(records); setBankError(""); }
      },
      (cause: unknown) => {
        if (active) setBankError(ideaBankErrorMessage(cause, "아이디어 뱅크를 열지 못했습니다."));
      },
    );
    return () => { active = false; };
  }, [activeMode]);

  const episodeTelemetry = useMemo(
    () => extractEpisodeTelemetryForFreshIdeas(episodeTelemetrySource ?? { episodeTitleKo: sourceTitle, pages: [] }),
    [episodeTelemetrySource, sourceTitle],
  );

  const pipeline = useMemo(() => {
    const effectiveTitle =
      (customDraft.enabled ? customDraft.titleKo.trim() : "") || sourceTitle || "핵심 원문";
    const mergedLiveContent = buildFreshIdeasEpisodeSourceContentKo({
      sourceSummaryKo,
      sourceMetricsSummaryKo,
      telemetry: episodeTelemetry,
    });

    const sources: FreshIdeasSourceItem[] = customDraft.enabled
      ? [
          {
            id: "custom-primary",
            title: effectiveTitle,
            kind: customDraft.kind,
            content: customDraft.contentKo.trim() || mergedLiveContent,
            url: customDraft.url.trim() || undefined,
          },
          ...(customDraft.secondDocContentKo.trim()
            ? [{
                id: "custom-secondary",
                title: customDraft.secondDocTitleKo.trim() || "교차 비교 보조 원문",
                kind: "multi-doc" as const,
                content: customDraft.secondDocContentKo.trim(),
              }]
            : []),
        ]
      : [{
          id: "studio-bg3d-live",
          title: effectiveTitle,
          kind: sourceMetricsSummaryKo || !episodeTelemetry.isEmptyDocument ? "sheet-csv" : "article",
          content: mergedLiveContent,
        }];

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
        effectiveTitle, bundle, deconstruction, blindSpotAxes,
        targetPersonaKo: "3대 랩스 통합 스튜디오 제작팀",
        activeLenses: unified.lenses, activeLens,
        swapRecommendation: recommendExtendedLensSwap(bundle),
        swapLabel: "unit-economics" as ExtendedLensId,
        modeBDraft: expandLensToChannelDraft(activeLens, selectedChannelId, {
          registerOverride: selectedRegister,
          bridgeForeignSourceToKorea: bridgeForeignToKorea,
        }),
        modeC: unified.modeC, audit: unified.audit,
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
      ? applyExtendedLensSwap(rawCoreLenses, { ...swapRecommendation, withExtendedLensId: effectiveExtendedId }, bundle, deconstruction)
      : rawCoreLenses;
    const activeLenses = includeExtendedLens && !swapCoreWithExtended
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
      { sourceCorpus: bundle.normalizedBodyText, extraBannedPhrases: userConfig.extraBannedPhrases },
    );

    return {
      effectiveTitle, bundle, deconstruction, blindSpotAxes,
      targetPersonaKo: bundle.targetPersonaKo,
      activeLenses, activeLens, swapRecommendation, swapLabel: effectiveExtendedId,
      modeBDraft, modeC, audit,
      crossLabsBadgeKo: crossLabsUnified ? "3대 랩스 통합 리믹스 · [측정 필요]" : "",
      crossLabsTelemetryState: crossLabsUnified ? ("missing" as const) : ("off" as const),
    };
  }, [
    sourceTitle, sourceSummaryKo, sourceMetricsSummaryKo, episodeTelemetry, customDraft,
    contrarianMode, preferredCoreLensId, selectedBlindSpotAxis, includeExtendedLens,
    swapCoreWithExtended, selectedExtendedLensId, crossLabsUnified, crossLabsEnvelope,
    selectedLensIndex, selectedChannelId, selectedRegister, bridgeForeignToKorea, userConfig.extraBannedPhrases,
  ]);

  const currentStoryboardPacketKey = [
    pipeline.activeLens.id, pipeline.activeLens.indexTag, pipeline.effectiveTitle,
    selectedRegister, episodeTelemetry.mode, String(episodeTelemetry.cutCount),
    String(episodeTelemetry.totalDialogueChars), String(episodeTelemetry.bg3dCutCount),
  ].join("|");
  const activeStoryboardPacket =
    storyboardPacketState?.key === currentStoryboardPacketKey ? storyboardPacketState.packet : null;

  const handleChangeRegister = (nextRegister: KoreanSpeechRegister) => {
    setSelectedRegister(nextRegister);
    setUserConfig(saveFreshIdeasUserConfig({ ...userConfig, defaultKoreanRegister: nextRegister }));
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
        lens: pipeline.activeLens, channelId: selectedChannelId,
        registerOverride: selectedRegister, signal: controller.signal, chunkDelayMs: 0,
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

  const runIdeaBankTask = async (
    task: () => Promise<{ readonly records: readonly StoredIdeaBankRecord[]; readonly notice?: string; readonly emitStatus?: boolean }>,
    fallbackError: string,
    clearNotice = true,
  ) => {
    if (clearNotice) setExportNoticeKo("");
    try {
      const { records, notice, emitStatus } = await task();
      setSavedRecords(records);
      setBankError("");
      if (notice) {
        setExportNoticeKo(notice);
        if (emitStatus) onStatusChange?.(notice);
      }
    } catch (cause) {
      setBankError(ideaBankErrorMessage(cause, fallbackError));
    }
  };

  const handleSaveToIdeaBank = () =>
    runIdeaBankTask(async () => {
      const records = await freshIdeasIdeaBank.append(pipeline.modeC.ideaBankRows);
      return { records, notice: `로컬 아이디어 뱅크 저장 완료 (누적 ${records.length}건)`, emitStatus: true };
    }, "아이디어 뱅크에 저장하지 못했습니다. 필요하면 CSV로 복사하세요.");

  const handleChangeBankStatus = (recordId: string, status: IdeaBankSpreadsheetRow["draftStatus"]) =>
    runIdeaBankTask(async () => {
      const records = await freshIdeasIdeaBank.updateStatus(recordId, status);
      return { records, notice: `아이디어 뱅크 상태 변경: ${status}`, emitStatus: true };
    }, "아이디어 뱅크 상태를 변경하지 못했습니다.");

  const handleImportLegacyBank = () =>
    runIdeaBankTask(async () => {
      const { records, imported } = await freshIdeasIdeaBank.importLegacy();
      return { records, notice: imported > 0 ? `기존 아이디어 뱅크에서 ${imported}건을 가져왔습니다.` : "가져올 새 브라우저 기록이 없습니다." };
    }, "기존 기록을 가져오지 못했습니다. 브라우저 원본은 바뀌지 않았습니다.");

  const handleReopenBank = () =>
    runIdeaBankTask(async () => {
      const { retryFailedStudioLocalDatabaseOpen } = await import("../studio-local-database-runtime");
      await retryFailedStudioLocalDatabaseOpen();
      return { records: await freshIdeasIdeaBank.list() };
    }, "아이디어 뱅크를 다시 열지 못했습니다.", false);

  const publishWithClipboard = async (text: string, formatMessage: (copied: boolean) => string) => {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }
    const msg = formatMessage(copied);
    setExportNoticeKo(msg);
    onStatusChange?.(msg);
  };

  const handleCopyDocsMarkdown = async () => {
    const md = buildStructuredGoogleDocMarkdown(pipeline.modeC);
    await publishWithClipboard(
      md,
      (copied) => `Google Docs 마크다운+4시드 부록 준비 (${md.length}자${copied ? " · 클립보드 복사됨" : ""})`,
    );
  };

  const handleExportSheetsCsv = async () => {
    const csv = serializeIdeaBankCsv(pipeline.modeC.ideaBankRows);
    await publishWithClipboard(
      csv,
      (copied) => `Google Sheets 7열 CSV 직렬화 완료 (${pipeline.modeC.ideaBankRows.length}행${copied ? " · 클립보드 복사됨" : ""})`,
    );
  };

  const handleExportStorySeed = async () => {
    const payload = buildFreshIdeasStorySeedPayload({
      sourceTitle: pipeline.effectiveTitle, lens: pipeline.activeLens, modeC: pipeline.modeC,
      lenses: pipeline.activeLenses, targetPersonaKo: pipeline.targetPersonaKo,
      register: selectedRegister, preservedUrls: pipeline.bundle.preservedUrls,
    });
    onExportStorySeed?.(payload);
    await publishWithClipboard(payload.clipboardTextKo, (copied) => `${payload.summaryKo}${copied ? " · 클립보드 복사됨" : ""}`);
  };

  const handleCreateStoryboardPacket = async () => {
    const packet = buildThreeCutStoryboardSeedPacket({
      lens: pipeline.activeLens,
      telemetry: episodeTelemetry,
      sourceTitle: pipeline.effectiveTitle,
      register: selectedRegister,
      preservedUrls: pipeline.bundle.preservedUrls,
    });
    setStoryboardPacketState({ key: currentStoryboardPacketKey, packet });
    onCreateStoryboardSeedPacket?.(packet);
    await publishWithClipboard(packet.clipboardMarkdownKo, (copied) => `${packet.summaryKo}${copied ? " · 클립보드 복사됨" : ""}`);
  };

  return (
    <section
      data-testid="studio-fresh-ideas-v2-workbench"
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4 text-xs text-fg [word-break:keep-all]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen size={16} strokeWidth={1.5} className="shrink-0 text-fg-2" aria-hidden />
          <span className="text-sm font-medium text-fg">Fresh Ideas v3 에디토리얼 리믹스 워크벤치</span>
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

      <div
        data-testid="fresh-ideas-v3-episode-telemetry-badge"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="fresh-ideas-v3-telemetry-mode"
            className={`rounded border px-2 py-0.5 font-mono text-[11px] font-medium ${
              episodeTelemetry.isEmptyDocument
                ? "border-warn/40 bg-warn/10 text-warn"
                : "border-accent/40 bg-raised text-fg"
            }`}
          >
            {episodeTelemetry.modeLabelKo}
          </span>
          <span className="text-[11px] text-fg-3">{episodeTelemetry.diagnosticNoteKo}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums text-fg-2">
          <span data-testid="fresh-ideas-v3-metric-cuts" className="rounded border border-line bg-card px-2 py-0.5">
            컷 {episodeTelemetry.metricsDisplayKo.cutCountKo}
          </span>
          <span data-testid="fresh-ideas-v3-metric-dialogue" className="rounded border border-line bg-card px-2 py-0.5">
            평균 대사 {episodeTelemetry.metricsDisplayKo.averageDialogueCharsKo}
          </span>
          <span data-testid="fresh-ideas-v3-metric-bg3d" className="rounded border border-line bg-card px-2 py-0.5">
            3D 배경 {episodeTelemetry.metricsDisplayKo.bg3dCutRatioKo}
          </span>
          <span data-testid="fresh-ideas-v3-metric-silent" className="rounded border border-line bg-card px-2 py-0.5">
            무대사 액션 {episodeTelemetry.metricsDisplayKo.silentActionCutRatioKo}
          </span>
        </div>
      </div>

      <FreshIdeasSourceAndDeconstructDrawer
        disabled={disabled} draft={customDraft} bundle={pipeline.bundle}
        deconstruction={pipeline.deconstruction} blindSpotAxes={pipeline.blindSpotAxes}
        selectedBlindSpotAxis={selectedBlindSpotAxis} onChangeDraft={setCustomDraft}
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
              key={modeId} type="button" role="tab" aria-selected={activeMode === modeId}
              disabled={disabled} data-testid={`fresh-ideas-mode-${modeId}`}
              onClick={() => {
                setActiveMode(modeId);
                onStatusChange?.(`Fresh Ideas v2.2 모드 전환: ${label}`);
              }}
              className={`min-h-11 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                activeMode === modeId ? "border-accent bg-raised text-fg" : "border-line bg-panel text-fg-3 hover:bg-raised"
              } ${MOTION_BTN}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button" disabled={disabled} data-testid="fresh-ideas-toggle-cross-labs"
            onClick={() => setCrossLabsUnified((prev) => !prev)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
              crossLabsUnified ? "border-accent bg-raised text-fg" : "border-line bg-panel text-fg-3 hover:bg-raised"
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
              <option key={ext.id} value={ext.id}>{ext.indexTag} · {ext.labelKo}</option>
            ))}
          </select>

          <button
            type="button" disabled={disabled || pipeline.crossLabsTelemetryState === "live"}
            data-testid="fresh-ideas-toggle-extended-lens"
            onClick={() => { setSwapCoreWithExtended(false); setIncludeExtendedLens((prev) => !prev); }}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
              includeExtendedLens ? "border-accent bg-raised text-fg" : "border-line bg-panel text-fg-3 hover:bg-raised"
            } ${MOTION_BTN}`}
          >
            <SlidersHorizontal size={14} strokeWidth={1.5} className="shrink-0" aria-hidden />
            <span>확장 렌즈 추가 ({pipeline.swapLabel})</span>
          </button>

          <button
            type="button" disabled={disabled || pipeline.crossLabsTelemetryState === "live"}
            data-testid="fresh-ideas-swap-extended-btn"
            onClick={() => { setIncludeExtendedLens(false); setSwapCoreWithExtended((prev) => !prev); }}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
              swapCoreWithExtended ? "border-accent bg-raised text-fg" : "border-line bg-panel text-fg-3 hover:bg-raised"
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
              key={lens.id} type="button" disabled={disabled}
              data-testid={`fresh-ideas-v2-lens-${lens.indexTag}`}
              onClick={() => {
                setSelectedLensIndex(idx);
                if (CORE_LENS_ID_SET.has(lens.id)) {
                  setPreferredCoreLensId(recordSessionLensAffinity(lens.id as CoreLensId));
                }
                onStatusChange?.(`${lens.indexTag} · ${lens.labelKo}: ${lens.headlineKo}`);
              }}
              className={`flex min-h-11 flex-col items-start justify-between gap-1 rounded-lg border p-2.5 text-left ${
                active ? "border-accent bg-raised text-fg" : "border-line bg-panel text-fg-2 hover:bg-raised"
              } ${MOTION_BTN}`}
            >
              <div className="flex w-full items-center justify-between gap-1">
                <span className="rounded bg-card px-1.5 py-0.5 font-mono text-xs tabular-nums text-fg-2">{lens.indexTag}</span>
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
        <div data-testid="fresh-ideas-mode-a-panel" className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-fg">
              {pipeline.activeLens.indexTag} · {pipeline.activeLens.labelKo} ({pipeline.activeLens.labelEn})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs tabular-nums text-fg-3">
                {pipeline.crossLabsBadgeKo || `Target: ${pipeline.targetPersonaKo}`}
              </span>
              <button
                type="button" disabled={disabled}
                data-testid="fresh-ideas-v3-generate-storyboard-btn"
                onClick={() => void handleCreateStoryboardPacket()}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent bg-raised px-3 py-1.5 text-xs font-medium text-fg hover:bg-card ${MOTION_BTN}`}
              >
                <Clapperboard size={14} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden />
                <span>3컷 콘티 초안 패킷 생성</span>
              </button>
            </div>
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

          {pipeline.activeLens.id === "contrarian-take" && pipeline.crossLabsTelemetryState !== "live" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] text-fg-3">반론 강도:</span>
              {CONTRARIAN_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.id} type="button" disabled={disabled}
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
            <p data-testid="fresh-ideas-low-density-note" className="rounded border border-line bg-card px-2.5 py-1.5 font-mono text-[11px] text-fg-3">
              {pipeline.activeLens.lowDensitySkipNoteKo}
            </p>
          )}

          {pipeline.activeLens.experienceSlotPromptKo && (
            <div className="space-y-1.5 rounded border border-line bg-card p-2.5">
              <p className="font-mono text-xs text-fg-2">{pipeline.activeLens.experienceSlotPromptKo}</p>
              {pipeline.activeLens.fourBeatArcKo && (
                <ol className="list-inside list-decimal space-y-0.5 text-[11px] text-fg-3">
                  {pipeline.activeLens.fourBeatArcKo.map((beat, i) => (<li key={i}>{beat}</li>))}
                </ol>
              )}
            </div>
          )}

          {pipeline.activeLens.retrievalPlaceholdersKo && pipeline.activeLens.retrievalPlaceholdersKo.length > 0 && (
            <div className="rounded border border-line bg-card px-2.5 py-2 font-mono text-[11px] text-fg-3">
              {pipeline.activeLens.retrievalPlaceholdersKo.join(" · ")}
            </div>
          )}

          {pipeline.activeLens.playbookStepsKo && (
            <ol className="list-inside list-decimal space-y-1 text-fg-2">
              {pipeline.activeLens.playbookStepsKo.map((step, i) => (
                <li key={i}>
                  {step.actionKo} <span className="font-mono text-fg-3">({step.doneCriteriaKo})</span>
                </li>
              ))}
            </ol>
          )}

          {activeStoryboardPacket && (
            <div
              data-testid="fresh-ideas-v3-storyboard-packet-preview"
              className="mt-1 flex flex-col gap-2 rounded-lg border border-accent/50 bg-card p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                <span className="font-medium text-fg">
                  3컷 콘티 초안 패킷 · {activeStoryboardPacket.lensIndexTag} {activeStoryboardPacket.v3LensAngleKo} ({activeStoryboardPacket.generationModeLabelKo})
                </span>
                <span className="font-mono text-[11px] tabular-nums text-fg-3">
                  {activeStoryboardPacket.packetId} · {activeStoryboardPacket.telemetryBasisKo}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {activeStoryboardPacket.cuts.map((cut) => (
                  <article
                    key={cut.cutNumber}
                    data-testid={`fresh-ideas-v3-storyboard-cut-${cut.cutNumber}`}
                    className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel p-2.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[11px] font-medium tabular-nums text-fg">
                        컷 {cut.cutNumber} · {cut.beatRoleKo}
                      </span>
                      <span className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-fg-2">
                        {cut.cameraShotCode}
                      </span>
                    </div>
                    <p className="text-[11px] leading-4 text-fg-2"><strong className="text-fg">구도:</strong> {cut.compositionKo}</p>
                    <p className="text-[11px] leading-4 text-fg"><strong className="text-fg-2">대사 초안:</strong> {cut.dialogueDraftKo}</p>
                    <p className="text-[11px] leading-4 text-fg-3"><strong className="text-fg-2">조명 힌트:</strong> {cut.lightingHintKo}</p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {pipeline.activeLens.preservedUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {pipeline.activeLens.preservedUrls.map((url, idx) => (
                <a
                  key={url} href={url} target="_blank" rel="noopener noreferrer"
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
          disabled={disabled} selectedChannelId={selectedChannelId} selectedRegister={selectedRegister}
          bridgeForeignToKorea={bridgeForeignToKorea} isStreaming={isStreaming}
          streamedText={streamedText} streamProgressPct={streamProgressPct} modeBDraft={pipeline.modeBDraft}
          onSelectChannelId={setSelectedChannelId} onChangeRegister={handleChangeRegister}
          onToggleKoreaBridge={() => setBridgeForeignToKorea((prev) => !prev)}
          onRunStream={() => void handleRunStream()} onStopStream={handleStopStream}
        />
      )}

      {activeMode === "mode-c-ecosystem" && (
        <FreshIdeasModeCEcosystemPanel
          disabled={disabled} lenses={pipeline.activeLenses} modeC={pipeline.modeC}
          exportNoticeKo={exportNoticeKo} bankError={bankError}
          onImportLegacyBank={() => void handleImportLegacyBank()} onReopenBank={() => void handleReopenBank()}
          savedRecords={savedRecords} onSaveToIdeaBank={() => void handleSaveToIdeaBank()}
          onCopyDocsMarkdown={() => void handleCopyDocsMarkdown()} onExportSheetsCsv={() => void handleExportSheetsCsv()}
          onExportStorySeed={() => void handleExportStorySeed()}
          onChangeRecordStatus={(id, status) => void handleChangeBankStatus(id, status)}
        />
      )}
    </section>
  );
}
