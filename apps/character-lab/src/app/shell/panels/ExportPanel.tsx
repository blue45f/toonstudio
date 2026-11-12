/**
 * ExportPanel: 투명 PNG(단일 컷 + 4방향 설정시트 + 2×2 4컷 종합 설정시트) ·
 * 레시피 저장/불러오기(6단 페인트 서브레이어 보존)/로컬 클립보드 공유 · GLB · 레이어 PSD · 진행/실패 안내 · 키보드 조작.
 */
import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";

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
  FRAMING_LABELS_KO,
  applyImportedRecipeText,
  clampExportInt,
  defaultReadClipboard,
  defaultWriteClipboard,
  describeExportPoseKo,
  describeExportSourceKo,
  describeReceipt,
  readTextFile,
} from "./export-panel-helpers";

import type { CameraFramingMode, EngineStatus, LabFailure } from "../../../contracts";
import type { ExportKind, ExportReceipt } from "../../../export/export-session";
import type { SaveBytesFn } from "../../../export/save-bytes";
import type { PaintSession } from "../../../paint/paint-session";
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

type ExportBusyKind = ExportKind | "turnaround" | "quad-sheet" | "import" | "clipboard-copy" | "clipboard-paste";

const RESOLUTION_PRESETS = [
  { id: "webtoon-cut", label: "웹툰 컷 (800×1200)", w: 800, h: 1200 },
  { id: "square-1k", label: "정방형 기본 (1024×1024)", w: 1024, h: 1024 },
  { id: "manuscript-2k", label: "고해상도 원고 (2048×2048)", w: 2048, h: 2048 },
] as const;

const VRM_FRAMING_PRESETS = [
  { id: "vrm-full", label: "VRM 전신 턴어라운드 (1024×1536)", w: 1024, h: 1536, mode: "full-body" as const },
  { id: "vrm-bust", label: "VRM 상반신 소개컷 (1024×1024)", w: 1024, h: 1024, mode: "bust" as const },
  { id: "vrm-face", label: "VRM 표정 시트 클로즈업 (1024×1024)", w: 1024, h: 1024, mode: "face" as const },
] as const;

function useEngineStatus(): EngineStatus {
  const engineSession = useEngineSession();
  return useSyncExternalStore(
    (listener) => engineSession.subscribe(() => listener()),
    () => engineSession.status(),
    () => engineSession.status(),
  );
}

function handleChipGroupKeyDown(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  index: number,
  refs: ReadonlyArray<HTMLButtonElement | null>,
  onActivateIndex: (nextIndex: number) => void,
): void {
  const len = refs.length;
  if (len === 0) return;
  let nextIndex: number | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (index + 1) % len;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (index + len - 1) % len;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = len - 1;
  }
  if (nextIndex === null) return;
  event.preventDefault();
  onActivateIndex(nextIndex);
  refs[nextIndex]?.focus();
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

  const resChipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const vrmChipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const failureAlertRef = useRef<HTMLParagraphElement | null>(null);

  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [framing, setFraming] = useState<CameraFramingMode>("full-body");
  const [settleSteps, setSettleSteps] = useState(0);
  const [includeIdMasks, setIncludeIdMasks] = useState(true);
  const [includeReferencePasses, setIncludeReferencePasses] = useState(false);
  const [splitHairLayers, setSplitHairLayers] = useState(false);
  const [useLuminanceToAlpha, setUseLuminanceToAlpha] = useState(false);
  const [busy, setBusy] = useState<ExportBusyKind | null>(null);
  const [receipt, setReceipt] = useState<ExportReceipt | null>(null);
  const [failure, setFailure] = useState<LabFailure | null>(null);
  const [notices, setNotices] = useState<readonly string[]>([]);

  const engineReady = engineStatus.phase === "ready";
  const hairSupport = engineSession.engine()?.psdHairLayers?.();
  const hairSplitReason = hairSupport?.status === "available" ? null : hairSupport?.reasonKo ?? "현재 엔진은 기하학적 헤어 분리를 지원하지 않습니다. 헤어 분리를 끄고 일반 PSD로 저장할 수 있습니다.";
  const framingValue = { ...DEFAULT_FRAMING, mode: framing };
  const activeDigest8 = recipeDigest(labState.recipe).slice(0, 8);

  const reportFailure = useCallback((nextFailure: LabFailure): void => {
    setReceipt(null);
    setFailure(nextFailure);
    queueMicrotask(() => {
      failureAlertRef.current?.focus();
    });
  }, []);

  const finish = useCallback(
    (
      outcome: { ok: true; bytes: Uint8Array; receipt: ExportReceipt } | { ok: false; failure: LabFailure },
      extraNotices: readonly string[] = [],
    ): void => {
      if (!outcome.ok) {
        reportFailure(outcome.failure);
        return;
      }
      const saved = save(outcome.receipt.fileName, outcome.bytes, outcome.receipt.mime);
      if (!saved.ok) {
        reportFailure(saved.failure);
        return;
      }
      setFailure(null);
      if (extraNotices.length > 0) setNotices(extraNotices);
      setReceipt(outcome.receipt);
    },
    [reportFailure, save],
  );

  const requireEngine = useCallback(() => {
    const engine = engineSession.engine();
    if (!engine) {
      reportFailure(failVisible("export-no-engine", "엔진이 준비되지 않아 내보낼 수 없습니다. 먼저 렌더 backend를 선택하세요.", undefined, now()));
    }
    return engine;
  }, [engineSession, now, reportFailure]);

  const run = useCallback(
    async (kind: ExportBusyKind, task: () => Promise<void>): Promise<void> => {
      if (busy) return;
      setNotices([]);
      setReceipt(null);
      setFailure(null);
      setBusy(kind);
      try {
        await task();
      } finally {
        setBusy(null);
      }
    },
    [busy],
  );

  const onPng = (): void => {
    void run("png", async () => {
      const engine = requireEngine();
      if (!engine) return;
      finish(await exportTransparentPng(engine, { width, height, framing: framingValue, settleSteps }, { now }));
    });
  };

  const onTurnaroundPng = (): void => {
    void run("turnaround", async () => {
      const engine = requireEngine();
      if (!engine) return;
      const { panelWidth, panelHeight } = clampTurnaroundPanelSize(width, height);
      finish(await exportTurnaroundSheetPng(engine, { panelWidth, panelHeight, framingMode: framing, settleSteps }, { now }));
    });
  };

  const onQuadSheetPng = (): void => {
    void run("quad-sheet", async () => {
      const engine = requireEngine();
      if (!engine) return;
      const { cellWidth, cellHeight, wasScaledDown } = clampQuadSheetCellSize(width, height);
      const scaleNotices = wasScaledDown
        ? [
            `요청 셀 크기(${width}×${height}px)가 PNG 최대 규격(${MAX_PNG_EXPORT_DIMENSION}×${MAX_PNG_EXPORT_DIMENSION}px)을 넘어 종횡비를 유지한 채 셀당 ${cellWidth}×${cellHeight}px(전체 ${cellWidth * 2}×${cellHeight * 2}px)로 자동 조정해 저장했습니다.`,
          ]
        : [];
      finish(await exportQuadReferenceSheetPng(engine, { cellWidth, cellHeight, settleSteps }, { now }), scaleNotices);
    });
  };

  const onPsd = (): void => {
    void run("psd", async () => {
      const engine = requireEngine();
      if (!engine) return;
      try {
        preparePsd();
      } catch (error) {
        reportFailure(failVisible("export-psd-canvas", "PSD 캔버스 팩토리를 등록할 수 없어 PSD를 만들 수 없습니다.", error, now()));
        return;
      }
      finish(
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
      const engine = requireEngine();
      if (!engine) return;
      finish(await exportGlb(engine, labState.recipe, { now }));
    });
  };

  const onRecipeSave = (): void => {
    void run("recipe", async () => {
      finish(
        await exportRecipe(labState.recipe, session.layersForExport(), {
          now,
          sublayers: session.sublayersForExport(),
        }),
      );
    });
  };

  const onShaperPresetSave = (): void => {
    void run("shaper-preset", async () => {
      finish(exportShaperStylePreset(labState.recipe, { now }));
    });
  };

  const onCopyRecipeClipboard = (): void => {
    void run("clipboard-copy", async () => {
      const exported = await exportRecipe(labState.recipe, session.layersForExport(), {
        now,
        sublayers: session.sublayersForExport(),
      });
      if (!exported.ok) {
        reportFailure(exported.failure);
        return;
      }
      const jsonText = new TextDecoder().decode(exported.bytes);
      try {
        await writeClipboard(jsonText);
      } catch (error) {
        reportFailure(
          isLabFailure(error)
            ? error
            : failVisible("clipboard-write-failed", "레시피 JSON을 로컬 클립보드에 복사하지 못했습니다.", error, now()),
        );
        return;
      }
      setFailure(null);
      setNotices(["현재 캐릭터 레시피(다중 페인트 서브레이어 포함)를 클립보드에 복사했습니다. 팀원이나 다른 탭에서 바로 붙여넣을 수 있습니다."]);
      setReceipt({ ...exported.receipt, fileName: `clipboard:${exported.receipt.fileName}` });
    });
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
        );
        return;
      }
      if (text.replace(/^\ufeff/u, "").trim().length === 0) {
        reportFailure(
          failVisible(
            "recipe-clipboard-empty",
            "클립보드가 비어 있습니다. 먼저 레시피 JSON(.character.json) 또는 SHAPER 프리셋(.preset) 텍스트를 복사하세요.",
            undefined,
            now(),
          ),
        );
        return;
      }
      const outcome = await applyImportedRecipeText({
        text,
        sourceLabel: "clipboard.character.json",
        currentRecipe: labState.recipe,
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
        reportFailure(outcome.failure);
        return;
      }
      setNotices(outcome.notices);
      setFailure(null);
      setReceipt(outcome.receipt);
    });
  };

  const onRecipeFile = (file: File | undefined): void => {
    if (!file) return;
    void run("import", async () => {
      let text: string;
      try {
        text = await readFile(file);
      } catch (error) {
        reportFailure(failVisible("recipe-file-read", `${file.name}: 파일을 읽을 수 없습니다.`, error, now()));
        return;
      }
      if (text.replace(/^\ufeff/u, "").trim().length === 0) {
        reportFailure(
          failVisible(
            "recipe-file-empty",
            `${file.name}: 파일이 비어 있습니다(0 B). 올바른 레시피(.character.json) 또는 프리셋(.preset) 파일을 선택하세요.`,
            undefined,
            now(),
          ),
        );
        return;
      }
      const outcome = await applyImportedRecipeText({
        text,
        sourceLabel: file.name,
        forceShaperPreset: file.name.toLowerCase().endsWith(".preset"),
        currentRecipe: labState.recipe,
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
        reportFailure(outcome.failure);
        return;
      }
      setNotices(outcome.notices);
      setFailure(null);
      setReceipt(outcome.receipt);
    });
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
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === "q") {
      if (engineReady && !busy) {
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
      <div className="cl-export-row" role="group" aria-label="빠른 해상도 프리셋" data-testid="export-resolution-presets">
        {RESOLUTION_PRESETS.map((preset, idx) => (
          <button
            key={preset.id}
            ref={(el) => {
              resChipRefs.current[idx] = el;
            }}
            type="button"
            className="cl-preset-chip"
            aria-pressed={width === preset.w && height === preset.h && framing === "full-body"}
            onClick={() => {
              setWidth(preset.w);
              setHeight(preset.h);
              setFraming("full-body");
            }}
            onKeyDown={(event) =>
              handleChipGroupKeyDown(event, idx, resChipRefs.current, (nextIdx) => {
                const target = RESOLUTION_PRESETS[nextIdx];
                if (!target) return;
                setWidth(target.w);
                setHeight(target.h);
                setFraming("full-body");
              })
            }
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="cl-export-row" role="group" aria-label="VRM 4-View 턴어라운드 및 프레이밍 프리셋" data-testid="export-vrm-framing-presets">
        {VRM_FRAMING_PRESETS.map((preset, idx) => (
          <button
            key={preset.id}
            ref={(el) => {
              vrmChipRefs.current[idx] = el;
            }}
            type="button"
            className="cl-preset-chip"
            data-testid={`export-preset-${preset.id}`}
            aria-pressed={width === preset.w && height === preset.h && framing === preset.mode}
            onClick={() => {
              setWidth(preset.w);
              setHeight(preset.h);
              setFraming(preset.mode);
            }}
            onKeyDown={(event) =>
              handleChipGroupKeyDown(event, idx, vrmChipRefs.current, (nextIdx) => {
                const target = VRM_FRAMING_PRESETS[nextIdx];
                if (!target) return;
                setWidth(target.w);
                setHeight(target.h);
                setFraming(target.mode);
              })
            }
          >
            {preset.label}
          </button>
        ))}
      </div>
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
              if ((event.key === "Enter" || event.key === " ") && busy === null) {
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
      {busy ? (
        <p className="cl-export-progress" role="status" aria-live="polite">
          {busy === "import"
            ? "레시피 불러오는 중…"
            : busy === "turnaround"
              ? "4방향 설정시트 내보내는 중…"
              : busy === "quad-sheet"
                ? "2×2 종합 설정시트 내보내는 중…"
                : busy === "clipboard-copy"
                  ? "클립보드로 레시피 복사 중…"
                  : busy === "clipboard-paste"
                    ? "클립보드 레시피 붙여넣는 중…"
                    : `${busy.toUpperCase()} 내보내는 중…`}
        </p>
      ) : null}
      {receipt ? (
        <p className="cl-export-receipt" role="status" data-testid="export-receipt">
          저장됨: {describeReceipt(receipt)}
        </p>
      ) : null}
      {notices.length > 0 ? (
        <div className="cl-export-notices" role="status">
          <ul aria-label="레시피 불러오기 안내">
            {notices.map((notice) => (
              <li key={notice} className="cl-export-notice">
                {notice}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {failure ? (
        <p
          ref={failureAlertRef}
          className="cl-export-failure"
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          data-testid="export-failure-alert"
        >
          실패({failure.code}): {failure.reasonKo}
        </p>
      ) : null}
    </section>
  );
}
