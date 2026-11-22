import { BookOpen, Cpu, Film, Globe } from "lucide-react";
import { useMemo, useState } from "react";
import { useT } from "@/shared/lib/i18n";

import {
  DEFAULT_COMFYUI_HTTP_URL,
  createCharacterDnaLock,
  executeComfyUiBridgeJob,
  getSampleWebNovelScript,
  parseWebNovelTo3dBlockingSheet,
  type ByokProviderId,
  type ComfyUiBridgeResult,
  type ComfyUiControlNetMode,
} from "./comfyui-manyfast-bridge";
import {
  LOCALIZATION_LANGUAGE_SPECS,
  PRINT_TRIM_PRESETS,
  buildPdfX1aPrintPackage,
  composeJapaneseTategaki,
  convertRgbToCmykWithTac,
  createSampleGlossaryEntries,
  createSampleLocalizationPanels,
  runMantraLetrLocalizationPipeline,
  type GlossaryTermEntry,
  type PrintIccProfileId,
  type PrintTrimPresetId,
  type RawBalloonPanelInput,
  type ReadingFlowMode,
  type SupportedLocalizationLang,
} from "./mantra-letr-localization-engine";
import {
  addReviewCommentPin,
  createInitialProximityReviewTable,
  createInitialScreenShareSignalState,
  createOfflineFirstSyncBridge,
  evaluateProximityChannels,
  moveProximityParticipant,
  toggleReviewCommentPinResolved,
  transitionScreenShareState,
  type OfflineSyncSnapshotDocument,
  type ProximityReviewTableState,
  type ScreenShareSignalState,
  type SyncCycleResult,
  type SyncNetworkStatus,
  type SyncStudioSurface,
} from "./studio-offline-first-sync-bridge";
import {
  JapanPrintExportTab,
  LocalAiCollabSyncTab,
  LocalizationSixStageTab,
  NovelTo3dBlockingTab,
} from "./StudioLocalizationAiSyncTabs";
import { StudioOfflineSyncLegacyExport } from "./StudioOfflineSyncLegacyExport";
import { OFFLINE_SYNC_COPY } from "./studio-offline-sync-storage-copy";
import { StudioOpfsSelfHealPanel } from "../storage/StudioOpfsSelfHealPanel";

import { cn } from "@/shared/lib/utils";

type ProTabId = "localization" | "japan-print" | "novel-3d" | "local-ai-sync";

export interface StudioLocalizationAiSyncPanelProps {
  readonly projectId: string;
  readonly sourceLines?: readonly { readonly id: string; readonly sourceText: string }[];
}

const DEFAULT_JP_SAMPLE = "｜黒曜石《こくようせき》ダンジョン24階!? AI監視を突破して今夜(こんや)突入する…";

const TAB_ITEMS: readonly { readonly id: ProTabId; readonly labelKo: string; readonly icon: typeof Globe }[] = [
  { id: "localization", labelKo: "글로벌 식자·현지화", icon: Globe },
  { id: "japan-print", labelKo: "일본 세로·단행본 인쇄", icon: BookOpen },
  { id: "novel-3d", labelKo: "소설→3D 자동 콘티", icon: Film },
  { id: "local-ai-sync", labelKo: "로컬 AI·협업 동기화", icon: Cpu },
];

export function StudioLocalizationAiSyncPanel({
  projectId,
  sourceLines,
}: StudioLocalizationAiSyncPanelProps) {
  const t = useT();
  const [activeTab, setActiveTab] = useState<ProTabId>("localization");
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // 탭 1: Mantra · LETR 6단계 다국어 현지화
  const [targetLang, setTargetLang] = useState<SupportedLocalizationLang>("ja");
  const [readingFlow, setReadingFlow] = useState<ReadingFlowMode>("manga-rtl");
  const [glossary, setGlossary] = useState<readonly GlossaryTermEntry[]>(() => createSampleGlossaryEntries());
  const [newSourceTerm, setNewSourceTerm] = useState("");
  const [newTargetTerm, setNewTargetTerm] = useState("");

  const panelsInput = useMemo<readonly RawBalloonPanelInput[]>(() => {
    if (sourceLines && sourceLines.length > 0) {
      return sourceLines.map((line, idx) => ({
        id: line.id,
        cutNumber: idx + 1,
        x: 60 + (idx % 2) * 220,
        y: 60 + idx * 140,
        width: 260,
        height: 135,
        sourceText: line.sourceText,
      }));
    }
    return createSampleLocalizationPanels();
  }, [sourceLines]);

  const pipelineResult = useMemo(
    () =>
      runMantraLetrLocalizationPipeline({
        panels: panelsInput,
        sourceLang: "ko",
        targetLang,
        readingFlow,
        glossary,
      }),
    [panelsInput, targetLang, readingFlow, glossary],
  );

  // 탭 2: 일본 세로쓰기 + 단행본 CMYK PDF/X-1a
  const [jpInput, setJpInput] = useState(DEFAULT_JP_SAMPLE);
  const [autoTcy, setAutoTcy] = useState(true);
  const [trimPresetId, setTrimPresetId] = useState<PrintTrimPresetId>("jp-b6-tankobon");
  const [iccProfileId, setIccProfileId] = useState<PrintIccProfileId>("JapanColor2001Coated");
  const [bleedMm, setBleedMm] = useState(3);
  const [dpi, setDpi] = useState(300);

  const tategaki = useMemo(() => composeJapaneseTategaki(jpInput, { autoTcy }), [jpInput, autoTcy]);
  const sampleCmyk = useMemo(() => convertRgbToCmykWithTac(38, 44, 72), []);
  const printPkg = useMemo(
    () =>
      buildPdfX1aPrintPackage({
        documentTitle: `${projectId} 단행본 원고`,
        trimPresetId,
        iccProfileId,
        bleedMm,
        dpi,
        maxSampledTacPercent: Math.max(265, sampleCmyk.tacPercent),
      }),
    [projectId, trimPresetId, iccProfileId, bleedMm, dpi, sampleCmyk.tacPercent],
  );

  // 탭 3: ManyFast 웹소설 → 3D 자동 콘티
  const [novelScript, setNovelScript] = useState<string>(() => getSampleWebNovelScript());
  const blockingSheet = useMemo(
    () => parseWebNovelTo3dBlockingSheet(novelScript, { title: `${projectId} 자동 3D 콘티` }),
    [novelScript, projectId],
  );

  // 탭 4: 로컬 ComfyUI/BYOK + 오프라인 우선 동기화 + 근접 합평 테이블
  const [comfyMode, setComfyMode] = useState<ComfyUiControlNetMode>("lineart");
  const [byokProvider, setByokProvider] = useState<ByokProviderId>("local-comfyui");
  const [comfyPrompt, setComfyPrompt] = useState("노을 지는 학교 옥상, 선화 유지, 깨끗한 웹툰 셀 채색");
  const [comfyBusy, setComfyBusy] = useState(false);
  const [comfyResult, setComfyResult] = useState<ComfyUiBridgeResult | null>(null);

  const activeDna = useMemo(
    () =>
      blockingSheet.cast[0] ??
      createCharacterDnaLock({
        name: "서연",
        appearanceTokens: ["dark ponytail", "school blazer", "clean webtoon lineart"],
      }),
    [blockingSheet.cast],
  );

  const [syncBridge] = useState(() =>
    createOfflineFirstSyncBridge(projectId, {
      initialNetwork: "online",
      seedDemoRecords: true,
    }),
  );
  const [syncSnapshot, setSyncSnapshot] = useState<OfflineSyncSnapshotDocument>(() => syncBridge.getState());
  const [lastSyncCycle, setLastSyncCycle] = useState<SyncCycleResult | null>(null);

  const [reviewTable, setReviewTable] = useState<ProximityReviewTableState>(() =>
    createInitialProximityReviewTable(projectId),
  );
  const proximityEval = useMemo(() => evaluateProximityChannels(reviewTable), [reviewTable]);
  const [screenShare, setScreenShare] = useState<ScreenShareSignalState>(() =>
    createInitialScreenShareSignalState(),
  );

  const handleChangeTargetLang = (lang: SupportedLocalizationLang) => {
    setTargetLang(lang);
    setReadingFlow(LOCALIZATION_LANGUAGE_SPECS[lang].defaultReadingFlow);
  };

  const handleChangeTrimPreset = (id: PrintTrimPresetId) => {
    setTrimPresetId(id);
    setIccProfileId(PRINT_TRIM_PRESETS[id].recommendedIcc);
  };

  const handleAddGlossaryTerm = () => {
    const src = newSourceTerm.trim();
    const dst = newTargetTerm.trim();
    if (!src || !dst) return;
    const entry: GlossaryTermEntry = {
      id: `gloss-custom-${glossary.length + 1}`,
      sourceTerm: src,
      category: "item",
      locked: true,
      translations: {
        ko: src,
        en: targetLang === "en" ? dst : src,
        ja: targetLang === "ja" ? dst : src,
        zh: targetLang === "zh" ? dst : src,
        es: targetLang === "es" ? dst : src,
        th: targetLang === "th" ? dst : src,
        id: targetLang === "id" ? dst : src,
      },
    };
    setGlossary((prev) => [...prev, entry]);
    setNewSourceTerm("");
    setNewTargetTerm("");
    setStatusNotice(`고유명사 '${src}' → '${dst}' 용어집 잠금을 추가했습니다.`);
  };

  const handleRunComfyDryRun = () => {
    setComfyBusy(true);
    void executeComfyUiBridgeJob(
      {
        positivePrompt: comfyPrompt,
        controlNetMode: comfyMode,
        characterDna: activeDna,
      },
      {
        httpUrl: DEFAULT_COMFYUI_HTTP_URL,
        forceDryRun: byokProvider === "local-comfyui",
        byokConfig: {
          provider: byokProvider,
          endpointUrl: DEFAULT_COMFYUI_HTTP_URL,
          autoPaidCallsAllowed: false,
          requireExplicitUserTrigger: true,
        },
      },
    ).then((result) => {
      setComfyResult(result);
      setComfyBusy(false);
      setStatusNotice(result.summaryKo);
    });
  };

  const handleToggleNetwork = (next: SyncNetworkStatus) => {
    setSyncSnapshot(syncBridge.setNetworkStatus(next));
    setStatusNotice(t(OFFLINE_SYNC_COPY.session));
  };

  const handleRecordDemoEdit = (surface: SyncStudioSurface) => {
    const seq = syncBridge.getState().lamportClock + 1;
    syncBridge.enqueueLocalMutation({
      surface,
      entityId: `${surface}-draft-${seq}`,
      patch: { revision: seq, updatedBy: "local-studio", ready: true },
    });
    setSyncSnapshot(syncBridge.getState());
    setStatusNotice(t(OFFLINE_SYNC_COPY.session));
  };

  const handleRunOptimisticSync = () => {
    void syncBridge
      .syncNow({
        pushOperations: async (ops) => ({ acceptedOpIds: ops.map((op) => op.opId) }),
      })
      .then((cycle) => {
        setLastSyncCycle(cycle);
        setSyncSnapshot(syncBridge.getState());
        setStatusNotice(cycle.summaryKo);
      });
  };

  const handleMoveParticipantCloser = (participantId: string) => {
    setReviewTable((prev) => moveProximityParticipant(prev, participantId, 0.4, -0.8));
    setStatusNotice("아바타를 합평 테이블 반경 안으로 이동해 음성·합평 채널에 자동 결합했습니다.");
  };

  const handleAddPinNote = () => {
    setReviewTable((prev) =>
      addReviewCommentPin(prev, {
        cutId: "cut-01",
        normX: 0.52,
        normY: 0.44,
        authorId: "p-line",
        authorName: "박서윤 작가",
        category: "composition",
        body: `합평 메모 #${prev.commentPins.length + 1}: 컷 여백과 시선 유도 확인`,
        createdAtIso: new Date().toISOString(),
      }),
    );
  };

  const handleAdvanceScreenShare = () => {
    setScreenShare((prev) => {
      const event =
        prev.status === "idle" || prev.status === "ended" || prev.status === "error"
          ? ({ type: "request-share", presenterId: "p-pd", presenterName: "김도윤 PD" } as const)
          : prev.status === "requesting"
            ? ({ type: "offer-created", offerSdpHash: "sdp-offer-local-v1" } as const)
            : prev.status === "awaiting-answer"
              ? ({ type: "answer-received", answerSdpHash: "sdp-answer-peer-v1" } as const)
              : prev.status === "streaming"
                ? ({ type: "pause" } as const)
                : ({ type: "resume" } as const);
      const result = transitionScreenShareState(prev, event);
      setStatusNotice(result.messageKo);
      return result.state;
    });
  };

  const handleStopScreenShare = () => {
    const result = transitionScreenShareState(screenShare, { type: "stop" });
    setScreenShare(result.state);
    setStatusNotice(result.messageKo);
  };

  return (
    <div
      data-testid="studio-localization-ai-sync-panel"
      className="space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg"
      style={{ borderTopWidth: "3px", borderTopColor: "var(--color-accent, oklch(0.62 0.18 272))" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-black tracking-tight text-fg [word-break:keep-all]">
            글로벌 현지화 · 일본 인쇄 · 로컬 AI · 협업 동기화 프로
          </h3>
          <p className="mt-0.5 text-xs text-fg-2 [word-break:keep-all]">
            과금 0원 로컬 우선 설계로 다국어 식자, 일본 세로쓰기·PDF/X-1a 출고, 웹소설 3D 콘티, 오프라인 합평을 한곳에서 처리합니다.
          </p>
        </div>
        {statusNotice ? (
          <p role="status" className="rounded-xl border border-accent/35 bg-accent-soft/15 px-3 py-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            {statusNotice}
          </p>
        ) : null}
      </div>

      {/* 4분할 탭 바 */}
      <div role="tablist" aria-label="현지화 및 로컬 AI 작업 탭" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {TAB_ITEMS.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`loc-pro-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`loc-pro-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all] motion-reduce:transition-none",
                selected
                  ? "border-accent bg-accent-soft/25 text-fg"
                  : "border-line bg-card text-fg-2 hover:border-accent/45",
              )}
            >
              <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
              <span>{tab.labelKo}</span>
            </button>
          );
        })}
      </div>

      {/* 탭 패널 본문 */}
      <div role="tabpanel" id={`loc-pro-panel-${activeTab}`} aria-labelledby={`loc-pro-tab-${activeTab}`}>
        {activeTab === "localization" ? (
          <LocalizationSixStageTab
            targetLang={targetLang}
            onChangeTargetLang={handleChangeTargetLang}
            readingFlow={readingFlow}
            onChangeReadingFlow={setReadingFlow}
            glossary={glossary}
            newSourceTerm={newSourceTerm}
            newTargetTerm={newTargetTerm}
            onChangeNewSourceTerm={setNewSourceTerm}
            onChangeNewTargetTerm={setNewTargetTerm}
            onAddGlossaryTerm={handleAddGlossaryTerm}
            pipelineResult={pipelineResult}
          />
        ) : null}

        {activeTab === "japan-print" ? (
          <JapanPrintExportTab
            jpInput={jpInput}
            onChangeJpInput={setJpInput}
            autoTcy={autoTcy}
            onToggleAutoTcy={setAutoTcy}
            tategaki={tategaki}
            trimPresetId={trimPresetId}
            onChangeTrimPresetId={handleChangeTrimPreset}
            iccProfileId={iccProfileId}
            onChangeIccProfileId={setIccProfileId}
            bleedMm={bleedMm}
            onChangeBleedMm={setBleedMm}
            dpi={dpi}
            onChangeDpi={setDpi}
            printPkg={printPkg}
            sampleCmyk={sampleCmyk}
          />
        ) : null}

        {activeTab === "novel-3d" ? (
          <NovelTo3dBlockingTab
            novelScript={novelScript}
            onChangeNovelScript={setNovelScript}
            onResetSampleScript={() => setNovelScript(getSampleWebNovelScript())}
            blockingSheet={blockingSheet}
          />
        ) : null}

        {activeTab === "local-ai-sync" ? (
          <>
          <LocalAiCollabSyncTab
            comfyMode={comfyMode}
            onChangeComfyMode={setComfyMode}
            byokProvider={byokProvider}
            onChangeByokProvider={setByokProvider}
            comfyPrompt={comfyPrompt}
            onChangeComfyPrompt={setComfyPrompt}
            activeDna={activeDna}
            comfyBusy={comfyBusy}
            comfyResult={comfyResult}
            onRunComfyDryRun={handleRunComfyDryRun}
            syncSnapshot={syncSnapshot}
            lastSyncCycle={lastSyncCycle}
            onToggleNetwork={handleToggleNetwork}
            onRecordDemoEdit={handleRecordDemoEdit}
            onRunOptimisticSync={handleRunOptimisticSync}
            reviewTable={reviewTable}
            proximityEval={proximityEval}
            onMoveParticipantCloser={handleMoveParticipantCloser}
            onAddPinNote={handleAddPinNote}
            onTogglePinResolved={(pinId) => setReviewTable((prev) => toggleReviewCommentPinResolved(prev, pinId))}
            screenShare={screenShare}
            onAdvanceScreenShare={handleAdvanceScreenShare}
            onStopScreenShare={handleStopScreenShare}
          />
          <StudioOfflineSyncLegacyExport key={projectId} projectId={projectId} />
          <StudioOpfsSelfHealPanel key={`self-heal-${projectId}`} projectId={projectId} />
          </>
        ) : null}
      </div>
    </div>
  );
}

export default StudioLocalizationAiSyncPanel;
