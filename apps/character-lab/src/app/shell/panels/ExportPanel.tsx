/**
 * ExportPanel: 투명 PNG(단일 컷 + 4방향 설정시트 + 2×2 4컷 종합 설정시트) ·
 * 레시피 저장/불러오기(6단 페인트 서브레이어 보존 · 미저장 덮어쓰기 스냅샷 복구)/로컬 클립보드 공유 ·
 * GLB · 레이어 PSD · 동기 중복 실행 차단 · 컷별 진행/실패 후 재시도 안내 · 키보드 조작.
 */
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { CAMERA_FRAMING_MODES, DEFAULT_FRAMING, failVisible, isLabFailure, recipeDigest } from "../../../contracts";
import { saveBytes } from "../../../export/download.browser";
import {
  MAX_PNG_EXPORT_DIMENSION,
  MAX_PSD_EXPORT_DIMENSION,
  MAX_SETTLE_STEPS,
  MIN_EXPORT_DIMENSION,
  exportGlb,
  exportLayeredPsd,
  exportRecipe,
  exportShaperStylePreset,
  exportTransparentPng,
} from "../../../export/export-session";
import { installPsdBrowserCanvas } from "../../../export/psd-canvas.browser";
import { clampQuadSheetCellSize, exportQuadReferenceSheetPng } from "../../../export/quad-reference-sheet";
import { RECIPE_FILE_SUFFIX } from "../../../export/recipe-file";
import { clampTurnaroundPanelSize, exportTurnaroundSheetPng } from "../../../export/turnaround-sheet";
import { getDefaultPaintSession } from "../../../paint/paint-session";
import { useDispatch, useEngineSession, useKitPlans, useLabContext, useLabState, useUiActions } from "../lab-store-context";
import {
  captureCharacterWorkBackup,
  hasUnsavedCharacterWork,
  markCharacterWorkSaved,
  restoreCharacterWorkBackup,
} from "../unsaved-work";

import { BUSY_ACTION_LABELS_KO, ExportPresetRows, ExportStatusSection } from "./export-panel/ExportStatusSection";
import {
  FRAMING_LABELS_KO,
  applyImportedRecipeText,
  clampExportInt,
  defaultReadClipboard,
  defaultWriteClipboard,
  describeExportPoseKo,
  describeExportSourceKo,
  readTextFile,
} from "./export-panel-helpers";

import type { ExportBusyKind } from "./export-panel/ExportStatusSection";
import type { CameraFramingMode, EngineStatus, LabFailure } from "../../../contracts";
import type { ExportReceipt } from "../../../export/export-session";
import type { SaveBytesFn } from "../../../export/save-bytes";
import type { PaintSession } from "../../../paint/paint-session";
import type { CharacterWorkBackup } from "../unsaved-work";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export { readTextFile };

export interface ExportPanelDeps {
  readonly save?: SaveBytesFn;
  readonly now?: () => number;
  readonly readFile?: (file: File) => Promise<string>;
  readonly preparePsd?: () => void;
  readonly writeClipboard?: (text: string) => Promise<void>;
  readonly readClipboard?: () => Promise<string>;
}

export interface ExportPanelProps {
  readonly session?: PaintSession;
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

export function ExportPanel({ session = getDefaultPaintSession(), deps = {} }: ExportPanelProps) {
  const save = deps.save ?? saveBytes;
  const now = deps.now ?? (() => Date.now());
  const readFile = deps.readFile ?? readTextFile;
  const preparePsd = deps.preparePsd ?? installPsdBrowserCanvas;
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
  const latestRetryActionsRef = useRef<Partial<Record<ExportBusyKind, () => void>>>({});
  const failureAlertRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      busyRef.current = null;
    };
  }, []);

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

  const engineReady = engineStatus.phase === "ready";
  const hairSupport = engineSession.engine()?.psdHairLayers?.();
  const hairSplitReason =
    hairSupport?.status === "available"
      ? null
      : hairSupport?.reasonKo ?? "현재 엔진은 기하학적 헤어 분리를 지원하지 않습니다. 헤어 분리를 끄고 일반 PSD로 저장할 수 있습니다.";
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
          {
            width,
            height,
            framing: framingValue,
            settleSteps,
            includeIdMasks,
            includeReferencePasses,
            splitHairLayers,
            ...(useLuminanceToAlpha ? { lineArt: { useLuminanceToAlpha: true } } : {}),
          },
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
    psd: onPsd,
    glb: onGlb,
    recipe: onRecipeSave,
    "shaper-preset": onShaperPresetSave,
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
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "q") {
      if (engineReady && busyRef.current === null) {
        event.preventDefault();
        onQuadSheetPng();
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
      <div className="cl-export-experiment-summary" role="region" aria-label="현재 실험 상태 및 빠른 이동" data-testid="export-experiment-summary">
        <div className="cl-export-experiment-meta">
          <span className="cl-export-experiment-source" data-testid="export-active-source">
            활성 소스: {describeExportSourceKo(labState.recipe.source, isPackageRegistered)}
          </span>
          <span className="cl-export-experiment-pose" data-testid="export-active-pose">
            실험 포즈: {describeExportPoseKo(labState.recipe)} · 레시피 #{activeDigest8}
          </span>
        </div>
        <div className="cl-export-nav-actions" role="group" aria-label="실험 단계 이동">
          <button type="button" className="cl-button cl-export-nav-btn" data-testid="export-switch-to-package-tab" onClick={() => switchInspectorTabWithFocus("package")}>
            패키지 선택 탭으로
          </button>
          <button type="button" className="cl-button cl-export-nav-btn" data-testid="export-switch-to-pose-tab" onClick={() => switchInspectorTabWithFocus("pose")}>
            포즈 실험 탭으로
          </button>
        </div>
      </div>
      {!engineReady ? (
        <p className="cl-export-hint" role="status">
          엔진 상태: {engineStatus.phase} — PNG·PSD·GLB는 엔진이 준비된 뒤 사용할 수 있습니다. 레시피 저장/불러오기는 가능합니다.
        </p>
      ) : null}
      <ExportPresetRows
        width={width}
        height={height}
        framing={framing}
        onSelectPreset={(w, h, mode) => {
          setWidth(w);
          setHeight(h);
          setFraming(mode);
        }}
      />
      <div className="cl-export-row">
        <label htmlFor={`${ids}-width`}>너비(px)</label>
        <input id={`${ids}-width`} type="number" min={MIN_EXPORT_DIMENSION} max={MAX_PNG_EXPORT_DIMENSION} value={width} onChange={(event) => setWidth(clampExportInt(event.target.value, 1, MAX_PNG_EXPORT_DIMENSION, width))} />
        <label htmlFor={`${ids}-height`}>높이(px)</label>
        <input id={`${ids}-height`} type="number" min={MIN_EXPORT_DIMENSION} max={MAX_PNG_EXPORT_DIMENSION} value={height} onChange={(event) => setHeight(clampExportInt(event.target.value, 1, MAX_PNG_EXPORT_DIMENSION, height))} />
      </div>
      <div className="cl-export-row">
        <label htmlFor={`${ids}-framing`}>프레이밍</label>
        <select id={`${ids}-framing`} value={framing} onChange={(event) => setFraming(event.target.value as CameraFramingMode)}>
          {CAMERA_FRAMING_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {FRAMING_LABELS_KO[mode]}
            </option>
          ))}
        </select>
        <label htmlFor={`${ids}-settle`}>물리 settle 스텝</label>
        <input id={`${ids}-settle`} type="number" min={0} max={MAX_SETTLE_STEPS} value={settleSteps} onChange={(event) => setSettleSteps(clampExportInt(event.target.value, 0, MAX_SETTLE_STEPS, 0))} />
      </div>
      <div className="cl-export-actions">
        <button type="button" onClick={onPng} disabled={!engineReady || busy !== null}>
          투명 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-turnaround-sheet-png"
          title="0° 정면 · 35° 반측면 · 90° 측면 · 180° 후면을 가로 한 장으로 이어 붙인 투명 캐릭터 설정시트 PNG를 저장합니다"
          onClick={onTurnaroundPng}
          disabled={!engineReady || busy !== null}
        >
          4방향 설정시트 PNG 저장
        </button>
        <button
          type="button"
          data-testid="export-quad-sheet-png"
          aria-keyshortcuts="Control+Shift+Q Meta+Shift+Q"
          title="전신 정면 · 전신 35° 반측면 · 상반신 바스트컷 · 얼굴 클로즈업을 종횡비 유지·잘림 방지 마진이 적용된 2×2 투명 PNG로 저장합니다 (단축키 Ctrl/Cmd+Shift+Q)"
          onClick={onQuadSheetPng}
          disabled={!engineReady || busy !== null}
        >
          2×2 종합 설정시트 PNG 저장
        </button>
        <button type="button" onClick={onGlb} disabled={!engineReady || busy !== null}>
          GLB 저장
        </button>
        <button type="button" onClick={onRecipeSave} disabled={busy !== null}>
          레시피 저장
        </button>
        <button type="button" onClick={onShaperPresetSave} disabled={busy !== null}>
          SHAPER 프리셋 저장
        </button>
        <button
          type="button"
          data-testid="export-copy-recipe-clipboard"
          title="외부 서버 전송 없이 로컬 클립보드로 현재 캐릭터 레시피 JSON(다중 페인트 서브레이어 포함)을 즉시 복사합니다"
          onClick={onCopyRecipeClipboard}
          disabled={busy !== null}
        >
          레시피 클립보드 복사
        </button>
        <button
          type="button"
          data-testid="export-paste-recipe-clipboard"
          title="클립보드에 복사된 레시피(.character.json) 또는 SHAPER 프리셋(.preset) 텍스트를 즉시 불러옵니다"
          onClick={onPasteRecipeClipboard}
          disabled={busy !== null}
        >
          클립보드 레시피 붙여넣기
        </button>
        <label className="cl-export-file" htmlFor={`${ids}-file`}>
          레시피 불러오기
          <input
            id={`${ids}-file`}
            data-testid="export-recipe-file-input"
            type="file"
            accept={`${RECIPE_FILE_SUFFIX},.json,.preset,application/json,text/plain`}
            disabled={busy !== null}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && busyRef.current === null) {
                event.preventDefault();
                event.currentTarget.click();
              }
            }}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              onRecipeFile(file);
            }}
          />
        </label>
      </div>
      <fieldset className="cl-export-psd">
        <legend>레이어 PSD (최대 {MAX_PSD_EXPORT_DIMENSION}px)</legend>
        <label htmlFor={`${ids}-idmask`}>
          <input id={`${ids}-idmask`} type="checkbox" checked={includeIdMasks} onChange={(event) => setIncludeIdMasks(event.target.checked)} /> 부위 ID 마스크 포함
        </label>
        <label htmlFor={`${ids}-ref`}>
          <input id={`${ids}-ref`} type="checkbox" checked={includeReferencePasses} onChange={(event) => setIncludeReferencePasses(event.target.checked)} /> 참조 패스(깊이·법선) 포함
        </label>
        <label htmlFor={`${ids}-hairsplit`}>
          <input id={`${ids}-hairsplit`} type="checkbox" checked={splitHairLayers} onChange={(event) => setSplitHairLayers(event.target.checked)} /> 헤어 3-레이어 분리(Hair Base·Shadow·Line)
        </label>
        <label htmlFor={`${ids}-lumalpha`}>
          <input id={`${ids}-lumalpha`} type="checkbox" checked={useLuminanceToAlpha} onChange={(event) => setUseLuminanceToAlpha(event.target.checked)} /> SHAPER 휘도 반전 선화 추출(a = 1 - r)
        </label>
        {splitHairLayers && hairSplitReason ? <p role="status">{hairSplitReason}</p> : null}
        <p>기본 PBR·툰의 불투명·컷아웃 헤어를 분리합니다. MSAA 공유 경계는 가시 샘플 과반 소유로 나누며 동률은 헤어에 귀속합니다. 추가 추출 주선은 기본 숨김이며, 켜면 원본 렌더 위에 선 효과가 더해집니다.</p>
        <button type="button" onClick={onPsd} disabled={!engineReady || busy !== null || (splitHairLayers && hairSplitReason !== null)}>
          레이어 PSD 저장
        </button>
      </fieldset>
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
        retryDisabled={busy !== null || (failedKind === "import" && !lastImportFileRef.current)}
        onRetryLastFailed={() => {
          if (failedKind && busyRef.current === null) latestRetryActionsRef.current[failedKind]?.();
        }}
        failureAlertRef={failureAlertRef}
      />
    </section>
  );
}
