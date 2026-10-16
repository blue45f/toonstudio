"use no memo";
// 문구는 usePanelT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역(번역 번들 갱신)이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { useEffect, useEffectEvent, useReducer, useRef, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { buildStudioDocumentFromReflow } from "../panel-reflow-output";
import { createManualDetectResult, createPanelEditState, setPanelRect, type PanelEditState } from "../panel-detect-edit";
import { tightenRectToContent } from "../panel-detect-tighten";
import { estimateGutter } from "../panel-detect-raster";
import { PANEL_DETECT_LIMITS, type PanelDetectResult, type PanelDetectSensitivity, type PanelReadingOrder } from "../panel-detect-types";
import { createPanelEditorState, panelEditorReducer } from "../panel-editor-state";
import { panelStudioBackground, panelStudioTitleFromFileName } from "../panel-studio-document";
import { registerPanelStudioHandoff } from "../panel-studio-handoff";

import { PanelJobStatus } from "./PanelJobStatus";
import { PanelNotice } from "./PanelNotice";
import { PanelReflowStep } from "./PanelReflowStep";
import { DEFAULT_REFLOW_SETTINGS, type ReflowSettings } from "./panel-reflow-outcome";
import { PanelReviewStep } from "./PanelReviewStep";
import { detectErrorText } from "./panel-import-copy";
import { usePanelImportEnvironment } from "./panel-import-env";
import { PANEL_HEADING, PANEL_SKELETON, PANEL_SURFACE } from "./panel-import-styles";
import { usePanelJob, type JobState } from "./use-panel-job";
import { usePanelT } from "./use-panel-t";
import { useStepHeadingFocus } from "./use-step-heading-focus";

import type { PanelReflowPlan } from "../panel-reflow-plan";
import type { PanelSourceReady } from "./PanelSourceStep";

interface PanelReflowFlowProps {
  readonly ready: PanelSourceReady;
  readonly previewUrl: string;
}

interface DetectRun {
  readonly id: number;
  readonly readingOrder: PanelReadingOrder;
  readonly sensitivity: PanelDetectSensitivity;
}

/**
 * 컷 감지 → 확인·수정 → 재배열 → 삽입의 흐름. 감지는 Worker 에서 실행하며(취소·시간 상한·재시도),
 * 실패하거나 컷을 못 찾아도 직접 그리기로 이어갈 수 있다.
 */
export function PanelReflowFlow({ ready, previewUrl }: PanelReflowFlowProps): ReactElement {
  const env = usePanelImportEnvironment();
  const detectJob = usePanelJob<PanelDetectResult>();
  const [run, setRun] = useState<DetectRun>({ id: 1, readingOrder: "webtoon", sensitivity: "normal" });
  const [manual, setManual] = useState<PanelDetectResult | null>(null);

  const start = (next: DetectRun): void => {
    setManual(null);
    setRun(next);
    void detectJob.run(async ({ signal }) => {
      const raster = await ready.source.readRaster(signal);
      return env.detect(raster, { readingOrder: next.readingOrder, sensitivity: next.sensitivity, signal });
    });
  };

  // 화면이 나타나면 기본 설정으로 한 번 찾는다(Worker 와의 동기화). 다시 찾기·재시도는 start 를 직접 부른다.
  const startFirstRun = useEffectEvent(() => { start(run); });
  useEffect(() => {
    startFirstRun();
  }, []);

  const rerun = (readingOrder: PanelReadingOrder, sensitivity: PanelDetectSensitivity): void =>
    start({ id: run.id + 1, readingOrder, sensitivity });

  const state = detectJob.state;
  const result = manual ?? (state.status === "success" ? state.value : null);

  if (result) {
    return (
      <PanelReflowWorkspace
        key={`${run.id}:${manual ? "manual" : "auto"}`}
        ready={ready}
        previewUrl={previewUrl}
        result={result}
        sensitivity={run.sensitivity}
        detectBusy={state.status === "running"}
        onRerun={(readingOrder, sensitivity) => rerun(readingOrder, sensitivity)}
      />
    );
  }

  return (
    <PanelDetectStep
      state={state}
      onCancel={detectJob.cancel}
      onRetry={() => rerun(run.readingOrder, run.sensitivity)}
      onDrawManually={() => setManual(createManualDetectResult(ready.source.width, ready.source.height, run.readingOrder))}
    />
  );
}

interface PanelDetectStepProps {
  readonly state: JobState<PanelDetectResult>;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
  readonly onDrawManually: () => void;
}

/** 2단계 앞부분 — 컷을 찾는 중 / 취소·실패 뒤 다시 시도하거나 직접 그리기. 나타날 때마다 제목으로 포커스를 옮긴다. */
function PanelDetectStep({ state, onCancel, onRetry, onDrawManually }: PanelDetectStepProps): ReactElement {
  const t = usePanelT();
  const headingRef = useStepHeadingFocus<HTMLHeadingElement>();
  return (
    <section className={PANEL_SURFACE} aria-labelledby="panel-detect-title">
      <h3 ref={headingRef} id="panel-detect-title" className={PANEL_HEADING} data-panel-step-heading="detect" tabIndex={-1}>
        {t("panelImport.detect.title")}
      </h3>
      {state.status === "running" || state.status === "idle" ? (
        <div className="mt-3 grid gap-3">
          <PanelJobStatus
            state={state.status === "idle" ? { status: "running", progress: null } : state}
            runningLabel={t("panelImport.detect.running")}
            cancelledLabel=""
            errorText={(error) => detectErrorText(t, error)}
            onCancel={onCancel}
            onRetry={onRetry}
          />
          <div className="grid gap-2" aria-hidden="true">
            <div className={cn(PANEL_SKELETON, "h-64 w-full")} />
            <div className={cn(PANEL_SKELETON, "h-4 w-1/2")} />
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <PanelJobStatus
            state={state}
            runningLabel=""
            cancelledLabel={t("panelImport.detect.cancelled")}
            errorText={(error) => detectErrorText(t, error)}
            onCancel={onCancel}
            onRetry={onRetry}
          />
          <PanelNotice tone="info" live="off" actions={
            <button type="button" onClick={onDrawManually} className={buttonClass({ variant: "outline", size: "sm" })}>
              {t("panelImport.detect.drawManually")}
            </button>
          }>
            {t("panelImport.detect.drawManuallyHint")}
          </PanelNotice>
        </div>
      )}
    </section>
  );
}

interface PanelReflowWorkspaceProps {
  readonly ready: PanelSourceReady;
  readonly previewUrl: string;
  readonly result: PanelDetectResult;
  readonly sensitivity: PanelDetectSensitivity;
  readonly detectBusy: boolean;
  readonly onRerun: (readingOrder: PanelReadingOrder, sensitivity: PanelDetectSensitivity) => void;
}

function PanelReflowWorkspace({ ready, previewUrl, result, sensitivity, detectBusy, onRerun }: PanelReflowWorkspaceProps): ReactElement {
  const t = usePanelT();
  const env = usePanelImportEnvironment();
  const navigate = useNavigate();
  const [editor, dispatch] = useReducer(panelEditorReducer, result, (initial) => createPanelEditorState(createPanelEditState(initial)));
  const [view, setView] = useState<"review" | "reflow">("review");
  const [settings, setSettings] = useState<ReflowSettings>(DEFAULT_REFLOW_SETTINGS);
  const fallbackTitle = t("panelImport.doc.defaultTitle");
  const [title, setTitle] = useState(() => panelStudioTitleFromFileName(ready.source.fileName, fallbackTitle));
  const [confirmedSignature, setConfirmedSignature] = useState<string | null>(null);
  const [pendingSensitivity, setPendingSensitivity] = useState(sensitivity);
  const insertJob = usePanelJob<void>();
  const downloadJob = usePanelJob<void>();
  const tightenJob = usePanelJob<void>();
  const state = editor.history.present;
  const background = panelStudioBackground(result.gutter.color);
  const source = ready.source;

  // 확인·수정 ↔ 재배열 설정을 오갈 때의 포커스는 각 단계 컴포넌트가 나타나면서 자기 제목으로 옮긴다(use-step-heading-focus.ts).
  const changeView = (next: "review" | "reflow"): void => { setView(next); };

  // 이미지를 읽는 동안(비동기) 사용자가 컷을 옮기거나 지울 수 있다. 누른 시점의 사각형으로 계산해 두었다가 적용하면 그 사이의
  // 편집을 옛 값으로 덮어쓰므로, 읽기가 끝난 시점의 컷을 다시 찾아 그 위치에서 맞춘다(DOM 이 아닌 최신 상태 읽기용 참조).
  const panelsRef = useRef(state.panels);
  useEffect(() => {
    panelsRef.current = state.panels;
  }, [state.panels]);

  const tighten = (id: string): void => {
    if (!state.panels.some((candidate) => candidate.id === id)) return;
    void tightenJob.run(async ({ signal }) => {
      const raster = await source.readRaster(signal);
      if (signal.aborted) return;
      const panel = panelsRef.current.find((candidate) => candidate.id === id);
      if (!panel) return;
      const gutter = result.gutter.kind === "none" ? estimateGutter(raster, PANEL_DETECT_LIMITS.defaultGutterTolerance) : result.gutter;
      const tight = tightenRectToContent(raster, gutter, panel);
      if (!tight) {
        dispatch({ type: "edit", apply: (current) => current, announce: t("panelImport.review.announce.tightenNone") });
        return;
      }
      // 계산한 사각형 그대로인 컷에만 적용한다. 그 사이 한 번 더 바뀌었다면 덮어쓰지 않는다.
      const unchanged = (current: PanelEditState): boolean => current.panels.some((candidate) =>
        candidate.id === id && candidate.x === panel.x && candidate.y === panel.y && candidate.width === panel.width && candidate.height === panel.height);
      dispatch({ type: "edit", apply: (current) => (unchanged(current) ? setPanelRect(current, id, tight) : current), announce: t("panelImport.review.announce.tightened") });
    });
  };

  const labels = {
    cut: (order: number) => t("panelImport.doc.cutName", { order }),
    frame: (order: number) => t("panelImport.doc.frameName", { order }),
  };

  const insert = (plan: PanelReflowPlan): void => {
    void insertJob.run(async ({ signal, report }) => {
      const output = await buildStudioDocumentFromReflow({
        plan,
        source: source.drawable,
        deps: env.canvasDeps,
        rights: ready.rights,
        title: title.trim(),
        background,
        signal,
        onProgress: report,
        makeId: env.makeId,
        now: env.now,
        labels,
      });
      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
      navigate(registerPanelStudioHandoff(output.file).href);
    });
  };

  const download = (plan: PanelReflowPlan): void => {
    void downloadJob.run(async ({ signal, report }) => {
      const bundle = await env.buildReflowBundle({
        plan,
        source: source.drawable,
        deps: env.canvasDeps,
        rights: ready.rights,
        title: title.trim() || panelStudioTitleFromFileName(source.fileName, fallbackTitle),
        background,
        signal,
        onProgress: report,
        now: env.now,
      });
      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
      env.download(bundle.blob, bundle.fileName);
    });
  };

  return (
    <div className="grid gap-4">
      {view === "review" ? (
        <PanelReviewStep
          imageUrl={previewUrl}
          result={result}
          editor={editor}
          dispatch={dispatch}
          sensitivity={pendingSensitivity}
          detectBusy={detectBusy}
          tightenBusy={tightenJob.state.status === "running"}
          onSensitivity={setPendingSensitivity}
          onRerun={() => onRerun(state.readingOrder, pendingSensitivity)}
          onTighten={tighten}
          onNext={() => changeView("reflow")}
        />
      ) : (
        <PanelReflowStep
          imageUrl={previewUrl}
          image={{ width: state.imageWidth, height: state.imageHeight }}
          panels={state.panels}
          result={result}
          settings={settings}
          title={title}
          confirmedSignature={confirmedSignature}
          insertJob={insertJob}
          downloadJob={downloadJob}
          onSettings={setSettings}
          onTitle={setTitle}
          onConfirm={setConfirmedSignature}
          onInsert={insert}
          onDownload={download}
          onBack={() => changeView("review")}
        />
      )}
      {tightenJob.state.status === "error" ? (
        <PanelNotice tone="bad">{detectErrorText(t, tightenJob.state.error)}</PanelNotice>
      ) : null}
    </div>
  );
}
