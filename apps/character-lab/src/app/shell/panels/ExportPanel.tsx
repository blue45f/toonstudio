/**
 * ExportPanel: 투명 PNG(단일 컷 + 4방향 설정시트) · 레시피 저장/불러오기 · GLB · 레이어 PSD · 진행/실패 표시.
 */
import { useCallback, useId, useState, useSyncExternalStore } from "react";

import { POSE_PRESETS } from "../../../animation/presets";
import {
  ALL_AVAILABLE_CAPABILITIES,
  ALL_UNAVAILABLE_CAPABILITIES,
  CAMERA_FRAMING_MODES,
  DEFAULT_FRAMING,
  PART_ROLE_LABELS_KO,
  failVisible,
  recipeDigest,
} from "../../../contracts";
import { deriveKitCapabilities } from "../../../domains/authored/kit-capability";
import { saveBytes } from "../../../export/download.browser";
import { MAX_PNG_EXPORT_DIMENSION, MAX_PSD_EXPORT_DIMENSION, MAX_SETTLE_STEPS, MIN_EXPORT_DIMENSION, exportGlb, exportLayeredPsd, exportRecipe, exportShaperStylePreset, exportTransparentPng } from "../../../export/export-session";
import { installPsdBrowserCanvas } from "../../../export/psd-canvas.browser";
import { RECIPE_FILE_SUFFIX, extractPaintLayers, parseRecipeFile, parseShaperPresetTextToRecipe } from "../../../export/recipe-file";
import { clampTurnaroundPanelSize, exportTurnaroundSheetPng } from "../../../export/turnaround-sheet";
import { uploadReplacedLayers } from "../../../paint/paint-bridge";
import { kitPaintWarningsForLayers } from "../../../paint/paint-kit-warning";
import { getDefaultPaintSession } from "../../../paint/paint-session";
import { recipeMigrationNoticeKo } from "../../../state/recipe-io";
import { useDispatch, useEngineSession, useKitPlans, useLabContext, useLabState, useUiActions } from "../lab-store-context";

import type { CameraFramingMode, CharacterRecipe, EngineStatus, LabFailure, RecipeSource } from "../../../contracts";
import type { ExportKind, ExportReceipt } from "../../../export/export-session";
import type { SaveBytesFn } from "../../../export/save-bytes";
import type { PaintSession } from "../../../paint/paint-session";

export interface ExportPanelDeps {
  readonly save?: SaveBytesFn;
  readonly now?: () => number;
  readonly readFile?: (file: File) => Promise<string>;
  readonly preparePsd?: () => void;
}

export interface ExportPanelProps {
  readonly session?: PaintSession;
  readonly deps?: ExportPanelDeps;
}

const FRAMING_LABELS_KO: Record<CameraFramingMode, string> = { "full-body": "전신", bust: "상반신", face: "얼굴", custom: "현재 카메라" };

function describeExportSourceKo(source: RecipeSource, isPackageRegistered: boolean): string {
  switch (source.kind) {
    case "kit":
      return `모듈식 키트 (${source.kitId} · ${source.baseId === "female" ? "여성 베이스" : "남성 베이스"})`;
    case "package":
      return `제작 패키지 (${source.characterId} · ${isPackageRegistered ? "등록됨" : "미로드"})`;
    case "procedural":
      return "절차적 휴머노이드";
    default: {
      const exhaustive: never = source;
      return String((exhaustive as { kind?: unknown }).kind);
    }
  }
}

function describeExportPoseKo(recipe: CharacterRecipe): string {
  const boneCount = Object.keys(recipe.pose).length;
  const preset = POSE_PRESETS.find((item) => item.id === recipe.slots.pose);
  const handPresetId = recipe.slots["hand-pose"];
  const handSuffix = handPresetId ? ` · 손 ${handPresetId.replace("hand-pose/", "")}` : "";
  if (boneCount === 0) {
    return `기본 자세(Rest · 프리셋: ${preset?.labelKo ?? "없음"}${handSuffix})`;
  }
  if (preset) {
    return `${preset.labelKo} (본 ${boneCount}개${handSuffix})`;
  }
  return `사용자 편집 포즈 (본 ${boneCount}개${handSuffix})`;
}

export function readTextFile(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽을 수 없습니다."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsText(file);
  });
}

function useEngineStatus(): EngineStatus {
  const engineSession = useEngineSession();
  return useSyncExternalStore(
    (listener) => engineSession.subscribe(() => listener()),
    () => engineSession.status(),
    () => engineSession.status(),
  );
}

function describeReceipt(receipt: ExportReceipt): string {
  const size = receipt.width && receipt.height ? ` · ${receipt.width}×${receipt.height}` : "";
  const psd = receipt.psd ? ` · 레이어 ${receipt.psd.layerCount}(그룹 ${receipt.psd.groupCount}) · 재합성 MAE ${receipt.psd.recomposeMae.toFixed(2)}` : "";
  return `${receipt.fileName} (${receipt.bytes.toLocaleString("ko-KR")} B${size}${psd} · ${receipt.durationMs} ms)`;
}

export function ExportPanel({ session = getDefaultPaintSession(), deps = {} }: ExportPanelProps) {
  const save = deps.save ?? saveBytes;
  const now = deps.now ?? (() => Date.now());
  const readFile = deps.readFile ?? readTextFile;
  const preparePsd = deps.preparePsd ?? installPsdBrowserCanvas;
  const ids = useId();
  const labState = useLabState();
  const dispatch = useDispatch();
  const { setInspectorTab } = useUiActions();
  const { store, packagePlans } = useLabContext();
  const kitPlans = useKitPlans();
  const engineSession = useEngineSession();
  const engineStatus = useEngineStatus();
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [framing, setFraming] = useState<CameraFramingMode>("full-body");
  const [settleSteps, setSettleSteps] = useState(0);
  const [includeIdMasks, setIncludeIdMasks] = useState(true);
  const [includeReferencePasses, setIncludeReferencePasses] = useState(false);
  const [splitHairLayers, setSplitHairLayers] = useState(false);
  const [useLuminanceToAlpha, setUseLuminanceToAlpha] = useState(false);
  const [busy, setBusy] = useState<ExportKind | "turnaround" | "import" | null>(null);
  const [receipt, setReceipt] = useState<ExportReceipt | null>(null);
  const [failure, setFailure] = useState<LabFailure | null>(null);
  const [notices, setNotices] = useState<readonly string[]>([]);

  const engineReady = engineStatus.phase === "ready";
  const hairSupport = engineSession.engine()?.psdHairLayers?.();
  const hairSplitReason = hairSupport?.status === "available" ? null : hairSupport?.reasonKo ?? "현재 엔진은 기하학적 헤어 분리를 지원하지 않습니다. 헤어 분리를 끄고 일반 PSD로 저장할 수 있습니다.";
  const framingValue = { ...DEFAULT_FRAMING, mode: framing };
  const activeDigest8 = recipeDigest(labState.recipe).slice(0, 8);

  const finish = useCallback(
    (outcome: { ok: true; bytes: Uint8Array; receipt: ExportReceipt } | { ok: false; failure: LabFailure }): void => {
      if (!outcome.ok) {
        setReceipt(null);
        setFailure(outcome.failure);
        return;
      }
      const saved = save(outcome.receipt.fileName, outcome.bytes, outcome.receipt.mime);
      if (!saved.ok) {
        setReceipt(null);
        setFailure(saved.failure);
        return;
      }
      setFailure(null);
      setReceipt(outcome.receipt);
    },
    [save],
  );

  const requireEngine = useCallback(() => {
    const engine = engineSession.engine();
    if (!engine) {
      setReceipt(null);
      setFailure(failVisible("export-no-engine", "엔진이 준비되지 않아 내보낼 수 없습니다. 먼저 렌더 backend를 선택하세요.", undefined, now()));
    }
    return engine;
  }, [engineSession, now]);

  const run = useCallback(
    async (kind: ExportKind | "turnaround" | "import", task: () => Promise<void>): Promise<void> => {
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

  const onPsd = (): void => {
    void run("psd", async () => {
      const engine = requireEngine();
      if (!engine) return;
      try {
        preparePsd();
      } catch (error) {
        setFailure(failVisible("export-psd-canvas", "PSD 캔버스 팩토리를 등록할 수 없어 PSD를 만들 수 없습니다.", error, now()));
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
      finish(await exportRecipe(labState.recipe, session.layersForExport(), { now }));
    });
  };

  const onShaperPresetSave = (): void => {
    void run("shaper-preset", async () => {
      finish(exportShaperStylePreset(labState.recipe, { now }));
    });
  };

  const onRecipeFile = (file: File | undefined): void => {
    if (!file) return;
    void run("import", async () => {
      let text: string;
      try {
        text = await readFile(file);
      } catch (error) {
        setFailure(failVisible("recipe-file-read", `${file.name}: 파일을 읽을 수 없습니다.`, error, now()));
        return;
      }
      if (text.trim().length === 0) {
        setFailure(
          failVisible(
            "recipe-file-empty",
            `${file.name}: 파일이 비어 있습니다(0 B). 올바른 레시피(.character.json) 또는 프리셋(.preset) 파일을 선택하세요.`,
            undefined,
            now(),
          ),
        );
        return;
      }
      const isShaperPreset = file.name.toLowerCase().endsWith(".preset");
      const parsed = isShaperPreset
        ? parseShaperPresetTextToRecipe(text, labState.recipe, now())
        : parseRecipeFile(text, now());
      if (!parsed.ok) {
        setFailure(parsed.failure);
        return;
      }
      const paint = await extractPaintLayers(parsed.recipe, now());
      const firstFailure = paint.failures[0];
      if (firstFailure) {
        setFailure(firstFailure);
        return;
      }
      const importNotices: string[] = [];
      if (isShaperPreset) {
        importNotices.push("SHAPER 프리셋 파일을 현재 형식(v3)으로 변환해 열었습니다.");
      }
      const migrationNotice = recipeMigrationNoticeKo(parsed);
      if (migrationNotice !== null) importNotices.push(migrationNotice);
      dispatch({ type: "recipe/load", recipe: parsed.recipe });
      const nextSource = parsed.recipe.source;
      if (nextSource.kind === "procedural") {
        if (!engineSession.engine()) {
          store.applyEvent({ type: "source/capabilities", capabilities: ALL_AVAILABLE_CAPABILITIES });
        }
      } else if (nextSource.kind === "package") {
        const registered = packagePlans.get(nextSource.characterId);
        if (!registered) {
          if (!engineSession.engine()) {
            store.applyEvent({ type: "source/capabilities", capabilities: ALL_UNAVAILABLE_CAPABILITIES });
          }
          importNotices.push(
            `제작 패키지 '${nextSource.characterId}'가 아직 로드되지 않았습니다. 제작 패키지 탭에서 해당 패키지를 불러오면 스켈레톤·슬롯 능력이 활성화됩니다.`,
          );
        } else if (registered.glbSha256 !== nextSource.sha256) {
          if (!engineSession.engine()) {
            store.applyEvent({ type: "source/capabilities", capabilities: ALL_UNAVAILABLE_CAPABILITIES });
          }
          importNotices.push(
            `제작 패키지 '${nextSource.characterId}'의 GLB SHA-256이 현재 등록된 패키지와 다릅니다. 제작 패키지 탭에서 다시 불러오세요.`,
          );
        } else if (!engineSession.engine()) {
          store.applyEvent({ type: "source/capabilities", capabilities: registered.capabilities });
        }
      } else if (nextSource.kind === "kit" && !engineSession.engine()) {
        const manifest = kitPlans?.peek(nextSource);
        if (manifest && manifest.bases[nextSource.baseId]) {
          store.applyEvent({ type: "source/capabilities", capabilities: deriveKitCapabilities(manifest, nextSource.baseId) });
        }
      }
      if (!isShaperPreset || paint.layers.length > 0) {
        const previousLayers = session.layersForExport();
        session.replaceLayers(paint.layers);
        const engine = engineSession.engine();
        if (engine) uploadReplacedLayers(previousLayers, session.layersForExport(), (layer) => engine.updatePaintTexture(layer));
      }
      for (const warning of kitPaintWarningsForLayers(parsed.recipe.source.kind, paint.layers)) {
        importNotices.push(`이미 칠한 ${PART_ROLE_LABELS_KO[warning.part]} 레이어: ${warning.messageKo}`);
      }
      setNotices(importNotices);
      setFailure(null);
      setReceipt({ kind: "recipe", fileName: file.name, mime: "application/json", bytes: text.length, durationMs: 0 });
    });
  };

  const clampInt = (value: string, min: number, max: number, fallback: number): number => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };

  const isPackageRegistered =
    labState.recipe.source.kind === "package" &&
    Boolean(packagePlans.get(labState.recipe.source.characterId));

  const switchInspectorTabWithFocus = (targetTab: "package" | "pose"): void => {
    setInspectorTab(targetTab);
    document.getElementById(`cl-tab-${targetTab}`)?.focus();
    requestAnimationFrame(() => document.getElementById(`cl-tab-${targetTab}`)?.focus());
  };

  return (
    <section className="cl-export-panel" aria-labelledby={`${ids}-title`}>
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
          <button
            type="button"
            className="cl-button cl-export-nav-btn"
            data-testid="export-switch-to-package-tab"
            onClick={() => switchInspectorTabWithFocus("package")}
          >
            패키지 선택 탭으로
          </button>
          <button
            type="button"
            className="cl-button cl-export-nav-btn"
            data-testid="export-switch-to-pose-tab"
            onClick={() => switchInspectorTabWithFocus("pose")}
          >
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
        {(
          [
            { id: "webtoon-cut", label: "웹툰 컷 (800×1200)", w: 800, h: 1200 },
            { id: "square-1k", label: "정방형 기본 (1024×1024)", w: 1024, h: 1024 },
            { id: "manuscript-2k", label: "고해상도 원고 (2048×2048)", w: 2048, h: 2048 },
          ] as const
        ).map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="cl-preset-chip"
            aria-pressed={width === preset.w && height === preset.h && framing === "full-body"}
            onClick={() => {
              setWidth(preset.w);
              setHeight(preset.h);
              setFraming("full-body");
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="cl-export-row" role="group" aria-label="VRM 4-View 턴어라운드 및 프레이밍 프리셋" data-testid="export-vrm-framing-presets">
        {(
          [
            { id: "vrm-full", label: "VRM 전신 턴어라운드 (1024×1536)", w: 1024, h: 1536, mode: "full-body" as const },
            { id: "vrm-bust", label: "VRM 상반신 소개컷 (1024×1024)", w: 1024, h: 1024, mode: "bust" as const },
            { id: "vrm-face", label: "VRM 표정 시트 클로즈업 (1024×1024)", w: 1024, h: 1024, mode: "face" as const },
          ] as const
        ).map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="cl-preset-chip"
            data-testid={`export-preset-${preset.id}`}
            aria-pressed={width === preset.w && height === preset.h && framing === preset.mode}
            onClick={() => {
              setWidth(preset.w);
              setHeight(preset.h);
              setFraming(preset.mode);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="cl-export-row">
        <label htmlFor={`${ids}-width`}>너비(px)</label>
        <input id={`${ids}-width`} type="number" min={MIN_EXPORT_DIMENSION} max={MAX_PNG_EXPORT_DIMENSION} value={width} onChange={(event) => setWidth(clampInt(event.target.value, 1, MAX_PNG_EXPORT_DIMENSION, width))} />
        <label htmlFor={`${ids}-height`}>높이(px)</label>
        <input id={`${ids}-height`} type="number" min={MIN_EXPORT_DIMENSION} max={MAX_PNG_EXPORT_DIMENSION} value={height} onChange={(event) => setHeight(clampInt(event.target.value, 1, MAX_PNG_EXPORT_DIMENSION, height))} />
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
        <input id={`${ids}-settle`} type="number" min={0} max={MAX_SETTLE_STEPS} value={settleSteps} onChange={(event) => setSettleSteps(clampInt(event.target.value, 0, MAX_SETTLE_STEPS, 0))} />
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
        <button type="button" onClick={onGlb} disabled={!engineReady || busy !== null}>
          GLB 저장
        </button>
        <button type="button" onClick={onRecipeSave} disabled={busy !== null}>
          레시피 저장
        </button>
        <button type="button" onClick={onShaperPresetSave} disabled={busy !== null}>
          SHAPER 프리셋 저장
        </button>
        <label className="cl-export-file" htmlFor={`${ids}-file`}>
          레시피 불러오기
          <input
            id={`${ids}-file`}
            data-testid="export-recipe-file-input"
            type="file"
            accept={`${RECIPE_FILE_SUFFIX},.json,.preset,application/json,text/plain`}
            disabled={busy !== null}
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
          {busy === "import" ? "레시피 불러오는 중…" : busy === "turnaround" ? "4방향 설정시트 내보내는 중…" : `${busy.toUpperCase()} 내보내는 중…`}
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
        <p className="cl-export-failure" role="alert" data-testid="export-failure-alert">
          실패({failure.code}): {failure.reasonKo}
        </p>
      ) : null}
    </section>
  );
}
