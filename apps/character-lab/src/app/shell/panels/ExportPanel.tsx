/**
 * ExportPanel: 투명 PNG(단일 컷 + 4방향 설정시트 + 2×2 4컷 종합 설정시트 + 세로 4컷 웹툰 스트립 + 단행본 우→좌/좌→우·쪽번호·제본 여백 출판 페이지 + 모바일 스크롤·오토패닝 미리보기 + 키네틱 팝인·효과음·무드 앰비언트 BGM 9:16 WebM 모션 티저 + 다국어 WebVTT 자막) ·
 * 에피소드 다중 4컷 콘티 큐시트(.cutsheet.json · localStorage 초안 보존 · 장편 4×N컷 PNG · 연속 9:16 WebM · 통합 WebVTT · 스토리보드 .md 일괄 출고) ·
 * 레시피 저장/불러오기(6단 페인트 서브레이어 보존 · 미저장 덮어쓰기 스냅샷 복구)/로컬 클립보드 공유 · GLB · 레이어 PSD(5단 만화 연출 분리 포함) · 키보드 단축키(Ctrl/Cmd+Shift+Q/M/B).
 */
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { DEFAULT_FRAMING, failVisible, isLabFailure, recipeDigest } from "../../../contracts";
import { saveBytes } from "../../../export/download.browser";
import {
  MAX_PNG_EXPORT_DIMENSION,
  exportGlb,
  exportLayeredPsd,
  exportRecipe,
  exportShaperStylePreset,
  exportTransparentPng,
} from "../../../export/export-session";
import { installPsdBrowserCanvas } from "../../../export/psd-canvas.browser";
import { clampQuadSheetCellSize, exportQuadReferenceSheetPng } from "../../../export/quad-reference-sheet";
import { clampTurnaroundPanelSize, exportTurnaroundSheetPng } from "../../../export/turnaround-sheet";
import { getDefaultEpisodeCutsheetStore } from "../../../export/webtoon-episode-cutsheet";
import { encodeMotionTeaserWebmBrowser } from "../../../export/webtoon-motion-teaser.browser";
import { getDefaultPaintSession } from "../../../paint/paint-session";
import { useApplyPlan, useDispatch, useEngineSession, useKitPlans, useLabContext, useLabState, useUiActions } from "../lab-store-context";
import {
  captureCharacterWorkBackup,
  hasUnsavedCharacterWork,
  markCharacterWorkSaved,
  restoreCharacterWorkBackup,
} from "../unsaved-work";

import {
  buildLayeredPsdOptions,
  buildStripExportOptions,
  ensureBrowserPackageRegistered,
  resolveHairSplitReasonKo,
  revokePreviewState,
} from "./export-panel/export-cutsheet-actions";
import { createWebtoonExportActions } from "./export-panel/export-webtoon-actions";
import { ExportActionsAndPsdSection } from "./export-panel/ExportActionsAndPsdSection";
import { ExportDimensionControls } from "./export-panel/ExportDimensionControls";
import { ExportEpisodeCutsheetSection } from "./export-panel/ExportEpisodeCutsheetSection";
import { ExportExperimentSummary } from "./export-panel/ExportExperimentSummary";
import { BUSY_ACTION_LABELS_KO, ExportStatusSection } from "./export-panel/ExportStatusSection";
import { ExportStripDirectorSection } from "./export-panel/ExportStripDirectorSection";
import {
  applyImportedRecipeText,
  defaultReadClipboard,
  defaultWriteClipboard,
  describeExportPoseKo,
  describeExportSourceKo,
  readTextFile,
} from "./export-panel-helpers";
import { getDefaultStripDirectorSession } from "./viewport-scene-director";

import type { ReaderPreviewState } from "./export-panel/export-cutsheet-actions";
import type { ExportBusyKind } from "./export-panel/ExportStatusSection";
import type { StripDirectorSession } from "./viewport-scene-director";
import type { CameraFramingMode, EngineStatus, LabFailure } from "../../../contracts";
import type { ExportReceipt } from "../../../export/export-session";
import type { SaveBytesFn } from "../../../export/save-bytes";
import type { EpisodeCutsheetStore } from "../../../export/webtoon-episode-cutsheet";
import type { EncodeMotionTeaserWebmFn } from "../../../export/webtoon-motion-teaser";
import type { ExportWebtoonVerticalStripOptions } from "../../../export/webtoon-strip-composer";
import type { PaintSession } from "../../../paint/paint-session";
import type { CharacterWorkBackup } from "../unsaved-work";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export { readTextFile };

export interface ExportPanelDeps {
  readonly save?: SaveBytesFn;
  readonly now?: () => number;
  readonly readFile?: (file: File) => Promise<string>;
  readonly preparePsd?: () => void;
  readonly encodeMotionWebm?: EncodeMotionTeaserWebmFn;
  readonly writeClipboard?: (text: string) => Promise<void>;
  readonly readClipboard?: (text?: string) => Promise<string>;
}

export interface ExportPanelProps {
  readonly session?: PaintSession;
  readonly stripDirector?: StripDirectorSession;
  readonly cutsheetStore?: EpisodeCutsheetStore;
  readonly deps?: ExportPanelDeps;
}

function useEngineStatus(): EngineStatus {
  const engineSession = useEngineSession();
  return useSyncExternalStore(
    (listener) => engineSession.subscribe(() => listener()),
    () => engineSession.status(),
    () => engineSession.status(),
  );
}

export function ExportPanel({
  session = getDefaultPaintSession(),
  stripDirector = getDefaultStripDirectorSession(),
  cutsheetStore = getDefaultEpisodeCutsheetStore(),
  deps = {},
}: ExportPanelProps) {
  const save = deps.save ?? saveBytes;
  const now = deps.now ?? (() => Date.now());
  const readFile = deps.readFile ?? readTextFile;
  const preparePsd = deps.preparePsd ?? installPsdBrowserCanvas;
  const encodeMotionWebm = deps.encodeMotionWebm ?? encodeMotionTeaserWebmBrowser;
  const writeClipboard = deps.writeClipboard ?? defaultWriteClipboard;
  const readClipboard = deps.readClipboard ?? defaultReadClipboard;
  const ids = useId();
  const labState = useLabState();
  const dispatch = useDispatch();
  const { setInspectorTab } = useUiActions();
  const { store, catalog, packagePlans } = useLabContext();
  const kitPlans = useKitPlans();
  const engineSession = useEngineSession();
  const engineStatus = useEngineStatus();

  hasUnsavedCharacterWork(store, labState, session);

  const mountedRef = useRef(true);
  const busyRef = useRef<ExportBusyKind | null>(null);
  const lastImportFileRef = useRef<File | undefined>(undefined);
  const lastCutsheetFileRef = useRef<File | undefined>(undefined);
  const lastMotionSpeedRef = useRef<number>(1);
  const latestRetryActionsRef = useRef<Partial<Record<ExportBusyKind, () => void>>>({});
  const failureAlertRef = useRef<HTMLParagraphElement | null>(null);
  const readerPreviewRef = useRef<ReaderPreviewState | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      busyRef.current = null;
      revokePreviewState(readerPreviewRef.current);
      readerPreviewRef.current = null;
    };
  }, []);

  const applyPlan = useApplyPlan();
  const directorState = useSyncExternalStore(stripDirector.subscribe, stripDirector.getState, stripDirector.getState);
  const {
    manuscriptMood,
    gutterPaces,
    includePsdMangaFx,
  } = directorState;
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [framing, setFraming] = useState<CameraFramingMode>("full-body");
  const [settleSteps, setSettleSteps] = useState(0);
  const [includeIdMasks, setIncludeIdMasks] = useState(true);
  const [includeReferencePasses, setIncludeReferencePasses] = useState(false);
  const [splitHairLayers, setSplitHairLayers] = useState(false);
  const [useLuminanceToAlpha, setUseLuminanceToAlpha] = useState(false);
  const [busy, setBusy] = useState<ExportBusyKind | null>(null);
  const [progressDetail, setProgressDetail] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ExportReceipt | null>(null);
  const [failure, setFailure] = useState<LabFailure | null>(null);
  const [failedKind, setFailedKind] = useState<ExportBusyKind | null>(null);
  const [notices, setNotices] = useState<readonly string[]>([]);
  const [preImportBackup, setPreImportBackup] = useState<CharacterWorkBackup | null>(null);
  const [readerPreview, setReaderPreview] = useState<ReaderPreviewState | null>(null);

  const replaceReaderPreview = useCallback((next: ReaderPreviewState | null): void => {
    revokePreviewState(readerPreviewRef.current);
    readerPreviewRef.current = next;
    setReaderPreview(next);
  }, []);

  const engineReady = engineStatus.phase === "ready";
  const hairSplitReason = resolveHairSplitReasonKo(engineSession.engine()?.psdHairLayers?.());
  const framingValue = { ...DEFAULT_FRAMING, mode: framing };
  const activeDigest8 = recipeDigest(labState.recipe).slice(0, 8);

  const reportFailure = useCallback((nextFailure: LabFailure, actionKind: ExportBusyKind): void => {
    if (!mountedRef.current) return;
    setReceipt(null);
    setNotices([]);
    setFailedKind(actionKind);
    setFailure(nextFailure);
  }, []);

  const finish = useCallback(
    (
      actionKind: ExportBusyKind,
      outcome: { ok: true; bytes: Uint8Array; receipt: ExportReceipt } | { ok: false; failure: LabFailure },
      extraNotices: readonly string[] = [],
    ): boolean => {
      if (!outcome.ok) {
        reportFailure(outcome.failure, actionKind);
        return false;
      }
      const saved = save(outcome.receipt.fileName, outcome.bytes, outcome.receipt.mime);
      if (!saved.ok) {
        reportFailure(saved.failure, actionKind);
        return false;
      }
      if (!mountedRef.current) return false;
      setFailure(null);
      setFailedKind(null);
      setNotices(extraNotices);
      setReceipt(outcome.receipt);
      return true;
    },
    [reportFailure, save],
  );

  const requireEngine = useCallback(
    (actionKind: ExportBusyKind) => {
      const engine = engineSession.engine();
      if (!engine) {
        reportFailure(
          failVisible("export-no-engine", "엔진이 준비되지 않아 내보낼 수 없습니다. 먼저 렌더 backend를 선택하세요.", undefined, now()),
          actionKind,
        );
      }
      return engine;
    },
    [engineSession, now, reportFailure],
  );

  const run = useCallback(async (kind: ExportBusyKind, task: () => Promise<void>): Promise<void> => {
    if (busyRef.current !== null) return;
    busyRef.current = kind;
    setNotices([]);
    setReceipt(null);
    setFailure(null);
    setFailedKind(null);
    setProgressDetail(null);
    setBusy(kind);
    try {
      await task();
    } catch (error) {
      reportFailure(
        isLabFailure(error)
          ? error
          : failVisible("export-unexpected", `${BUSY_ACTION_LABELS_KO[kind]} 중 예기치 않은 오류가 발생했습니다.`, error, now()),
        kind,
      );
    } finally {
      busyRef.current = null;
      if (mountedRef.current) {
        setBusy(null);
        setProgressDetail(null);
      }
    }
  }, [now, reportFailure]);

  const buildStripOptions = (): ExportWebtoonVerticalStripOptions =>
    buildStripExportOptions({
      width,
      settleSteps,
      directorState,
      applyPlan,
      recipe: labState.recipe,
      capabilities: labState.capabilities,
      catalog,
      onProgress: (step, total, labelKo) => {
        if (mountedRef.current) setProgressDetail(`${step}/${total} · ${labelKo}`);
      },
    });

  const onPng = (): void => {
    void run("png", async () => {
      const engine = requireEngine("png");
      if (!engine) return;
      finish("png", await exportTransparentPng(engine, { width, height, framing: framingValue, settleSteps }, { now }));
    });
  };

  const onTurnaroundPng = (): void => {
    void run("turnaround", async () => {
      const engine = requireEngine("turnaround");
      if (!engine) return;
      const { panelWidth, panelHeight } = clampTurnaroundPanelSize(width, height);
      finish(
        "turnaround",
        await exportTurnaroundSheetPng(
          engine,
          {
            panelWidth,
            panelHeight,
            framingMode: framing,
            settleSteps,
            onProgress: (step, total, labelKo) => {
              if (mountedRef.current) setProgressDetail(`${step}/${total} · ${labelKo}`);
            },
          },
          { now },
        ),
      );
    });
  };

  const onQuadSheetPng = (): void => {
    void run("quad-sheet", async () => {
      const engine = requireEngine("quad-sheet");
      if (!engine) return;
      const { cellWidth, cellHeight, wasScaledDown } = clampQuadSheetCellSize(width, height);
      const scaleNotices = wasScaledDown
        ? [
            `요청 셀 크기(${width}×${height}px)가 PNG 최대 규격(${MAX_PNG_EXPORT_DIMENSION}×${MAX_PNG_EXPORT_DIMENSION}px)을 넘어 종횡비를 유지한 채 셀당 ${cellWidth}×${cellHeight}px(전체 ${cellWidth * 2}×${cellHeight * 2}px)로 자동 조정해 저장했습니다.`,
          ]
        : [];
      finish(
        "quad-sheet",
        await exportQuadReferenceSheetPng(
          engine,
          {
            cellWidth,
            cellHeight,
            settleSteps,
            onProgress: (step, total, labelKo) => {
              if (mountedRef.current) setProgressDetail(`${step}/${total} · ${labelKo}`);
            },
          },
          { now },
        ),
        scaleNotices,
      );
    });
  };

  const {
    onWebtoonStripPng,
    onWebtoonTankobonPng,
    onOpenWebtoonReaderPreview,
    onWebtoonMotionWebm,
    onWebtoonMotionVtt,
    onExportBatchLongStripPng,
    onExportBatchMotionWebm,
    onExportBatchWebVtt,
    onExportStoryboardMd,
    onSaveCutsheetJson,
    onLoadCutsheetFile,
  } = createWebtoonExportActions({
    width,
    height,
    settleSteps,
    directorState,
    stripDirector,
    cutsheetStore,
    applyPlan,
    labState,
    catalog,
    now,
    readFile,
    encodeMotionWebm,
    buildStripOptions,
    mountedRef,
    lastMotionSpeedRef,
    lastCutsheetFileRef,
    run,
    requireEngine,
    finish,
    reportFailure,
    replaceReaderPreview,
    setProgressDetail,
    setFailure,
    setFailedKind,
    setNotices,
    setReceipt,
  });

  const onPsd = (): void => {
    void run("psd", async () => {
      const engine = requireEngine("psd");
      if (!engine) return;
      try {
        preparePsd();
      } catch (error) {
        reportFailure(failVisible("export-psd-canvas", "PSD 캔버스 팩토리를 등록할 수 없어 PSD를 만들 수 없습니다.", error, now()), "psd");
        return;
      }
      finish(
        "psd",
        await exportLayeredPsd(
          engine,
          session.layersForExport(),
          buildLayeredPsdOptions({
            width,
            height,
            framing: framingValue,
            settleSteps,
            includeIdMasks,
            includeReferencePasses,
            splitHairLayers,
            useLuminanceToAlpha,
            directorState,
          }),
          { now },
        ),
      );
    });
  };

  const onGlb = (): void => {
    void run("glb", async () => {
      const engine = requireEngine("glb");
      if (!engine) return;
      finish("glb", await exportGlb(engine, labState.recipe, { now }));
    });
  };

  const onRecipeSave = (): void => {
    void run("recipe", async () => {
      const ok = finish(
        "recipe",
        await exportRecipe(labState.recipe, session.layersForExport(), {
          now,
          sublayers: session.sublayersForExport(),
        }),
      );
      if (ok) {
        markCharacterWorkSaved(store, labState.recipe, session);
        setPreImportBackup(null);
      }
    });
  };

  const onShaperPresetSave = (): void => {
    void run("shaper-preset", async () => {
      finish("shaper-preset", exportShaperStylePreset(labState.recipe, { now }));
    });
  };

  const onCopyRecipeClipboard = (): void => {
    void run("clipboard-copy", async () => {
      const exported = await exportRecipe(labState.recipe, session.layersForExport(), {
        now,
        sublayers: session.sublayersForExport(),
      });
      if (!exported.ok) {
        reportFailure(exported.failure, "clipboard-copy");
        return;
      }
      try {
        await writeClipboard(new TextDecoder().decode(exported.bytes));
      } catch (error) {
        reportFailure(
          isLabFailure(error)
            ? error
            : failVisible("clipboard-write-failed", "레시피 JSON을 로컬 클립보드에 복사하지 못했습니다.", error, now()),
          "clipboard-copy",
        );
        return;
      }
      if (!mountedRef.current) return;
      setFailure(null);
      setFailedKind(null);
      setNotices(["현재 캐릭터 레시피(다중 페인트 서브레이어 포함)를 클립보드에 복사했습니다. 팀원이나 다른 탭에서 바로 붙여넣을 수 있습니다."]);
      setReceipt({ ...exported.receipt, fileName: `clipboard:${exported.receipt.fileName}` });
    });
  };

  const applyImportWithBackup = async (text: string, sourceLabel: string, actionKind: "import" | "clipboard-paste"): Promise<void> => {
    const currentState = store.getState();
    const backupIfUnsaved = hasUnsavedCharacterWork(store, currentState, session)
      ? captureCharacterWorkBackup(currentState.recipe, currentState.capabilities, session, now())
      : null;
    const outcome = await applyImportedRecipeText({
      text,
      sourceLabel,
      forceShaperPreset: sourceLabel.toLowerCase().endsWith(".preset"),
      currentRecipe: currentState.recipe,
      now: now(),
      session,
      engine: engineSession.engine(),
      dispatch,
      applyStoreEvent: (event) => store.applyEvent(event),
      getRegisteredPackage: (characterId) => packagePlans.get(characterId),
      ensurePackageRegistered: (characterId, expectedSha256) =>
        ensureBrowserPackageRegistered({
          characterId,
          expectedSha256,
          packagePlans,
          fallbackCapabilities: currentState.capabilities,
        }),
      peekKitManifest: kitPlans ? (src) => kitPlans.peek(src) : undefined,
      catalog,
      validateKitRecipe: kitPlans ? (recipe) => kitPlans.plan(recipe) : undefined,
    });
    if (!outcome.ok) {
      reportFailure(outcome.failure, actionKind);
      return;
    }
    if (!mountedRef.current) return;
    if (backupIfUnsaved) setPreImportBackup(backupIfUnsaved);
    markCharacterWorkSaved(store, store.getState().recipe, session);
    setNotices(outcome.notices);
    setFailure(null);
    setFailedKind(null);
    setReceipt(outcome.receipt);
  };

  const onPasteRecipeClipboard = (): void => {
    void run("clipboard-paste", async () => {
      let text: string;
      try {
        text = await readClipboard();
      } catch (error) {
        reportFailure(
          isLabFailure(error)
            ? error
            : failVisible("clipboard-read-failed", "클립보드에서 레시피 텍스트를 읽지 못했습니다.", error, now()),
          "clipboard-paste",
        );
        return;
      }
      if (text.replace(/^\ufeff/u, "").trim().length === 0) {
        reportFailure(
          failVisible("recipe-clipboard-empty", "클립보드가 비어 있습니다. 먼저 레시피 JSON(.character.json) 또는 SHAPER 프리셋(.preset) 텍스트를 복사하세요.", undefined, now()),
          "clipboard-paste",
        );
        return;
      }
      await applyImportWithBackup(text, "clipboard.character.json", "clipboard-paste");
    });
  };

  const onRecipeFile = (file: File | undefined): void => {
    if (!file) return;
    lastImportFileRef.current = file;
    void run("import", async () => {
      if (mountedRef.current) setProgressDetail(file.name);
      let text: string;
      try {
        text = await readFile(file);
      } catch (error) {
        reportFailure(failVisible("recipe-file-read", `${file.name}: 파일을 읽을 수 없습니다.`, error, now()), "import");
        return;
      }
      if (text.replace(/^\ufeff/u, "").trim().length === 0) {
        reportFailure(
          failVisible("recipe-file-empty", `${file.name}: 파일이 비어 있습니다(0 B). 올바른 레시피(.character.json) 또는 프리셋(.preset) 파일을 선택하세요.`, undefined, now()),
          "import",
        );
        return;
      }
      await applyImportWithBackup(text, file.name, "import");
    });
  };

  latestRetryActionsRef.current = {
    png: onPng,
    turnaround: onTurnaroundPng,
    "quad-sheet": onQuadSheetPng,
    "webtoon-strip": onWebtoonStripPng,
    "webtoon-tankobon": onWebtoonTankobonPng,
    "webtoon-reader": onOpenWebtoonReaderPreview,
    "webtoon-motion-webm": () => onWebtoonMotionWebm(lastMotionSpeedRef.current),
    webm: () => onWebtoonMotionWebm(lastMotionSpeedRef.current),
    vtt: onWebtoonMotionVtt,
    "storyboard-md": onExportStoryboardMd,
    "cutsheet-long-strip": onExportBatchLongStripPng,
    "cutsheet-webm": onExportBatchMotionWebm,
    "cutsheet-vtt": onExportBatchWebVtt,
    psd: onPsd,
    glb: onGlb,
    recipe: onRecipeSave,
    "shaper-preset": onShaperPresetSave,
    cutsheet: onSaveCutsheetJson,
    "cutsheet-import": () => onLoadCutsheetFile(lastCutsheetFileRef.current),
    import: () => onRecipeFile(lastImportFileRef.current),
    "clipboard-copy": onCopyRecipeClipboard,
    "clipboard-paste": onPasteRecipeClipboard,
  };

  const onRestorePreImportBackup = (): void => {
    if (!preImportBackup || busyRef.current !== null) return;
    restoreCharacterWorkBackup({
      backup: preImportBackup,
      session,
      engine: engineSession.engine(),
      dispatch,
      applyStoreEvent: (event) => store.applyEvent(event),
    });
    setPreImportBackup(null);
    setReceipt(null);
    setFailure(null);
    setFailedKind(null);
    setNotices(["불러오기 직전의 미저장 캐릭터·페인트 작업을 그대로 복구했습니다."]);
  };

  const isPackageRegistered =
    labState.recipe.source.kind === "package" && Boolean(packagePlans.get(labState.recipe.source.characterId));

  const switchInspectorTabWithFocus = (targetTab: "package" | "pose"): void => {
    setInspectorTab(targetTab);
    document.getElementById(`cl-tab-${targetTab}`)?.focus();
    requestAnimationFrame(() => document.getElementById(`cl-tab-${targetTab}`)?.focus());
  };

  const onSectionKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape" && !busy && failure) {
      event.preventDefault();
      setFailure(null);
      setFailedKind(null);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey) {
      const lower = event.key.toLowerCase();
      if (lower === "q" && engineReady && busyRef.current === null) {
        event.preventDefault();
        onQuadSheetPng();
      } else if (lower === "m" && engineReady && busyRef.current === null) {
        event.preventDefault();
        onWebtoonMotionWebm(1);
      } else if (lower === "b" && engineReady && busyRef.current === null) {
        event.preventDefault();
        onWebtoonTankobonPng();
      }
    }
  };

  return (
    <section
      className="cl-export-panel"
      aria-labelledby={`${ids}-title`}
      aria-busy={busy !== null}
      onKeyDown={onSectionKeyDown}
    >
      <h2 id={`${ids}-title`}>내보내기</h2>
      <ExportExperimentSummary
        sourceLabel={describeExportSourceKo(labState.recipe.source, isPackageRegistered)}
        poseLabel={describeExportPoseKo(labState.recipe)}
        digest={activeDigest8}
        onNavigate={switchInspectorTabWithFocus}
      />
      {!engineReady ? (
        <p className="cl-export-hint" role="status">
          엔진 상태: {engineStatus.phase} — PNG·PSD·GLB·WebM은 엔진이 준비된 뒤 사용할 수 있습니다. 레시피·큐시트·자막 저장/불러오기는 가능합니다.
        </p>
      ) : null}
      <ExportDimensionControls
        idsPrefix={ids}
        width={width}
        height={height}
        framing={framing}
        settleSteps={settleSteps}
        onChangeWidth={setWidth}
        onChangeHeight={setHeight}
        onChangeFraming={setFraming}
        onChangeSettleSteps={setSettleSteps}
      />
      <ExportStripDirectorSection idsPrefix={ids} state={directorState} session={stripDirector} />
      <ExportEpisodeCutsheetSection
        idsPrefix={ids}
        engineReady={engineReady}
        busy={busy !== null}
        directorSession={stripDirector}
        cutsheetStore={cutsheetStore}
        onSaveCutsheetJson={onSaveCutsheetJson}
        onLoadCutsheetFile={onLoadCutsheetFile}
        onExportBatchLongStripPng={onExportBatchLongStripPng}
        onExportBatchMotionWebm={onExportBatchMotionWebm}
        onExportBatchWebVtt={onExportBatchWebVtt}
        onExportStoryboardMd={onExportStoryboardMd}
        onBeatAppliedNotice={(msg) => setNotices([msg])}
      />
      <ExportActionsAndPsdSection
        ids={ids}
        engineReady={engineReady}
        busy={busy !== null}
        canTriggerFileKeyDown={() => busyRef.current === null}
        onPng={onPng}
        onTurnaroundPng={onTurnaroundPng}
        onQuadSheetPng={onQuadSheetPng}
        onWebtoonStripPng={onWebtoonStripPng}
        onWebtoonTankobonPng={onWebtoonTankobonPng}
        onOpenWebtoonReaderPreview={onOpenWebtoonReaderPreview}
        onWebtoonMotionWebm={onWebtoonMotionWebm}
        onWebtoonMotionVtt={onWebtoonMotionVtt}
        onGlb={onGlb}
        onRecipeSave={onRecipeSave}
        onShaperPresetSave={onShaperPresetSave}
        onCopyRecipeClipboard={onCopyRecipeClipboard}
        onPasteRecipeClipboard={onPasteRecipeClipboard}
        onRecipeFile={onRecipeFile}
        readerPreview={readerPreview}
        manuscriptMood={manuscriptMood}
        gutterPaces={gutterPaces}
        onCloseReaderPreview={() => replaceReaderPreview(null)}
        includeIdMasks={includeIdMasks}
        onChangeIncludeIdMasks={setIncludeIdMasks}
        includeReferencePasses={includeReferencePasses}
        onChangeIncludeReferencePasses={setIncludeReferencePasses}
        splitHairLayers={splitHairLayers}
        onChangeSplitHairLayers={setSplitHairLayers}
        useLuminanceToAlpha={useLuminanceToAlpha}
        onChangeUseLuminanceToAlpha={setUseLuminanceToAlpha}
        includePsdMangaFx={includePsdMangaFx}
        onChangeIncludePsdMangaFx={(checked) => stripDirector.update({ includePsdMangaFx: checked })}
        hairSplitReason={hairSplitReason}
        onPsd={onPsd}
      />
      <ExportStatusSection
        busy={busy}
        progressDetail={progressDetail}
        hasPreImportBackup={preImportBackup !== null}
        onRestorePreImportBackup={onRestorePreImportBackup}
        onDismissPreImportBackup={() => setPreImportBackup(null)}
        receipt={receipt}
        notices={notices}
        failure={failure}
        failedKind={failedKind}
        retryDisabled={
          busy !== null ||
          (failedKind === "import" && !lastImportFileRef.current) ||
          (failedKind === "cutsheet-import" && !lastCutsheetFileRef.current)
        }
        onRetryLastFailed={() => {
          if (failedKind && busyRef.current === null) latestRetryActionsRef.current[failedKind]?.();
        }}
        failureAlertRef={failureAlertRef}
      />
    </section>
  );
}
