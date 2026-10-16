"use no memo";
// 문구는 usePanelT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역(번역 번들 갱신)이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { Download, Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useEffectEvent, useState, type ReactElement } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import { renderCardNewsCards } from "../panel-card-render";
import { cardRange, moveCardCut, snapCardCut, type CardSliceAnalysis } from "../panel-card-slice";
import { CARD_NEWS_PRESET, type CardAlignment } from "../panel-card-slice-types";
import { panelStudioTitleFromFileName } from "../panel-studio-document";

import { PanelCardCutControls } from "./PanelCardCutControls";
import { PanelCardPreview } from "./PanelCardPreview";
import { PanelJobStatus } from "./PanelJobStatus";
import { PanelNotice } from "./PanelNotice";
import { cardErrorText, cardWarningText } from "./panel-import-copy";
import { usePanelImportEnvironment } from "./panel-import-env";
import { PANEL_HEADING, PANEL_HINT, PANEL_INPUT, PANEL_LABEL, PANEL_SKELETON, PANEL_SMALL_BUTTON, PANEL_SUBSURFACE, PANEL_SURFACE, panelChipClass } from "./panel-import-styles";
import { usePanelT } from "./use-panel-t";
import { useStepHeadingFocus } from "./use-step-heading-focus";
import { usePanelJob } from "./use-panel-job";

import type { PanelSourceReady } from "./PanelSourceStep";

interface PanelCardFlowProps {
  readonly ready: PanelSourceReady;
  readonly previewUrl: string;
}

interface ExportedBundle {
  readonly blob: Blob;
  readonly fileName: string;
  readonly cards: number;
}

/** 카드뉴스 흐름 — 행 측정으로 절단 위치 분석 → 카드 미리보기·수동 조정 → ZIP(PNG) 내보내기. */
export function PanelCardFlow({ ready, previewUrl }: PanelCardFlowProps): ReactElement {
  const t = usePanelT();
  const env = usePanelImportEnvironment();
  const analyzeHeadingRef = useStepHeadingFocus<HTMLHeadingElement>();
  const analyzeJob = usePanelJob<CardSliceAnalysis>();

  const analyze = (): void => {
    void analyzeJob.run(async ({ signal }) => {
      const raster = await ready.source.readRaster(signal);
      return env.sliceCards(raster, {}, signal);
    });
  };
  const analyzeOnMount = useEffectEvent(analyze);
  useEffect(() => {
    analyzeOnMount();
  }, []);

  const state = analyzeJob.state;
  if (state.status === "success") {
    return <PanelCardWorkspace key={`${state.value.plan.sourceHeight}`} ready={ready} previewUrl={previewUrl} initial={state.value} />;
  }
  return (
    <section className={PANEL_SURFACE} aria-labelledby="panel-card-analyze-title">
      <h3 ref={analyzeHeadingRef} id="panel-card-analyze-title" className={PANEL_HEADING} data-panel-step-heading="cards-analyze" tabIndex={-1}>
        {t("panelImport.cards.analyzeTitle")}
      </h3>
      <div className="mt-3 grid gap-3">
        <PanelJobStatus
          state={state.status === "idle" ? { status: "running", progress: null } : state}
          runningLabel={t("panelImport.cards.analyzing")}
          cancelledLabel={t("panelImport.cards.analyzeCancelled")}
          errorText={(error) => cardErrorText(t, error)}
          onCancel={analyzeJob.cancel}
          onRetry={analyze}
        />
        {state.status === "running" || state.status === "idle" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => <div key={index} className={cn(PANEL_SKELETON, "aspect-[4/5] w-full")} />)}
          </div>
        ) : null}
      </div>
    </section>
  );
}

interface PanelCardWorkspaceProps {
  readonly ready: PanelSourceReady;
  readonly previewUrl: string;
  readonly initial: CardSliceAnalysis;
}

function PanelCardWorkspace({ ready, previewUrl, initial }: PanelCardWorkspaceProps): ReactElement {
  const t = usePanelT();
  const env = usePanelImportEnvironment();
  const headingRef = useStepHeadingFocus<HTMLHeadingElement>();
  const [analysis, setAnalysis] = useState(initial);
  const [alignment, setAlignment] = useState<CardAlignment>("center");
  const fallbackTitle = t("panelImport.cards.defaultTitle");
  const [title, setTitle] = useState(() => panelStudioTitleFromFileName(ready.source.fileName, fallbackTitle));
  const replanJob = usePanelJob<CardSliceAnalysis>();
  const exportJob = usePanelJob<ExportedBundle>();
  const plan = analysis.plan;
  const range = cardRange(analysis);
  const busy = replanJob.state.status === "running" || exportJob.state.status === "running";

  const replan = (cardCount: number | null): void => {
    void replanJob.run(async ({ signal }) => {
      const next = await env.replanCards(analysis, cardCount, signal);
      setAnalysis(next);
      return next;
    });
  };

  const exportCards = (): void => {
    void exportJob.run(async ({ signal, report }) => {
      const total = plan.cards.length;
      const cards = await renderCardNewsCards(plan, ready.source.drawable, env.canvasDeps, {
        alignment,
        signal,
        onProgress: (done) => report(done, total * 2),
      });
      const bundle = await env.buildBundle({
        cards,
        plan,
        title: title.trim() || fallbackTitle,
        rights: ready.rights,
        alignment,
        generatedAt: env.now(),
        signal,
        onProgress: (done) => report(total + done, total * 2),
      });
      if (signal.aborted) throw new DOMException("cancelled", "AbortError");
      env.download(bundle.blob, bundle.fileName);
      return { blob: bundle.blob, fileName: bundle.fileName, cards: total };
    });
  };

  return (
    <section className={PANEL_SURFACE} aria-labelledby="panel-card-title">
      <h3 ref={headingRef} id="panel-card-title" className={PANEL_HEADING} data-panel-step-heading="cards" tabIndex={-1}>
        {t("panelImport.cards.title")}
      </h3>
      <p className="mt-1 text-sm text-fg-2" role="status">
        {t("panelImport.cards.summary", {
          count: plan.cards.length,
          ratio: CARD_NEWS_PRESET.ratio,
          cardWidth: plan.cardWidth,
          cardHeight: plan.cardHeight,
          sourceWidth: plan.sourceWidth,
          sourceHeight: plan.sourceHeight,
        })}
      </p>
      {plan.warnings.length > 0 ? (
        <ul className="mt-2 grid gap-1.5">
          {plan.warnings.map((warning) => (
            <li key={warning}><PanelNotice tone={warning === "content-cuts" || warning === "over-carousel-limit" ? "warn" : "info"} live="off">{cardWarningText(t, warning, plan.geometry.scale)}</PanelNotice></li>
          ))}
        </ul>
      ) : null}

      <div className={cn(PANEL_SUBSURFACE, "mt-3 flex flex-wrap items-end gap-x-6 gap-y-3")}>
        <div>
          <p className={PANEL_LABEL}>{t("panelImport.cards.count")}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <button type="button" disabled={busy || plan.cards.length <= range.min} onClick={() => replan(plan.cards.length - 1)} aria-label={t("panelImport.cards.fewer")} className={PANEL_SMALL_BUTTON}>
              <Minus size={14} aria-hidden="true" />
            </button>
            <output className="min-w-10 text-center text-sm font-black tabular-nums text-fg" aria-live="polite">{plan.cards.length}</output>
            <button type="button" disabled={busy || plan.cards.length >= range.max} onClick={() => replan(plan.cards.length + 1)} aria-label={t("panelImport.cards.more")} className={PANEL_SMALL_BUTTON}>
              <Plus size={14} aria-hidden="true" />
            </button>
            <button type="button" disabled={busy} onClick={() => replan(null)} className={PANEL_SMALL_BUTTON}>
              <RotateCcw size={13} aria-hidden="true" />
              {t("panelImport.cards.reslice")}
            </button>
          </div>
          <p className={cn(PANEL_HINT, "mt-1")}>{t("panelImport.cards.range", { min: range.min, max: range.max })}</p>
        </div>
        <fieldset>
          <legend className={PANEL_LABEL}>{t("panelImport.cards.alignment")}</legend>
          <div className="mt-1 flex gap-1.5">
            {(["center", "top"] as const).map((value) => (
              <label key={value} className={panelChipClass(alignment === value)}>
                <input type="radio" name="panel-card-alignment" className="sr-only" checked={alignment === value} onChange={() => setAlignment(value)} />
                {value === "center" ? t("panelImport.cards.align.center") : t("panelImport.cards.align.top")}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <PanelJobStatus
        state={replanJob.state}
        runningLabel={t("panelImport.cards.reslicing")}
        cancelledLabel={t("panelImport.cards.resliceCancelled")}
        errorText={(error) => cardErrorText(t, error)}
        onCancel={replanJob.cancel}
        onRetry={() => replan(plan.cards.length)}
        className="mt-3"
      />

      <ol className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("panelImport.cards.list")}>
        {plan.cards.map((card) => (
          <li key={card.index} className="grid content-start gap-2">
            <p className="text-sm font-black text-fg">
              {t("panelImport.cards.cardName", { number: card.index + 1 })}
              <span className="ml-2 text-xs font-normal text-fg-3">{t("panelImport.cards.fill", { percent: Math.round(card.fill * 100), from: card.y0, to: card.y1 })}</span>
            </p>
            <PanelCardPreview plan={plan} card={card} imageUrl={previewUrl} alignment={alignment} />
            {card.index < plan.cuts.length ? (
              <PanelCardCutControls
                plan={plan}
                cutIndex={card.index}
                disabled={busy}
                onMove={(index, y) => setAnalysis((current) => moveCardCut(current, index, y))}
                onSnap={(index) => setAnalysis((current) => snapCardCut(current, index))}
              />
            ) : null}
          </li>
        ))}
      </ol>

      <div className={cn(PANEL_SUBSURFACE, "mt-4 grid gap-3")}>
        <label className="block max-w-md">
          <span className={PANEL_LABEL}>{t("panelImport.cards.zipName")}</span>
          <input type="text" value={title} maxLength={200} disabled={busy} onChange={(event) => setTitle(event.currentTarget.value)} className={cn(PANEL_INPUT, "mt-1")} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy || title.trim() === ""} onClick={exportCards} className={buttonClass({ size: "lg" })}>
            <Download size={16} aria-hidden="true" />
            {t("panelImport.cards.export")}
          </button>
          <p className={cn(PANEL_HINT, "min-w-0 flex-1")}>
            {t("panelImport.cards.exportHint")}
          </p>
        </div>
        <PanelJobStatus
          state={exportJob.state}
          runningLabel={t("panelImport.cards.exporting")}
          cancelledLabel={t("panelImport.cards.exportCancelled")}
          errorText={(error) => cardErrorText(t, error)}
          onCancel={exportJob.cancel}
          onRetry={exportCards}
          success={exportJob.state.status === "success" ? (
            <span className="flex flex-wrap items-center gap-2">
              {t("panelImport.cards.exported", { name: exportJob.state.value.fileName, count: exportJob.state.value.cards })}
              <button
                type="button"
                className={buttonClass({ variant: "outline", size: "sm" })}
                onClick={() => {
                  if (exportJob.state.status === "success") env.download(exportJob.state.value.blob, exportJob.state.value.fileName);
                }}
              >
                {t("panelImport.cards.downloadAgain")}
              </button>
            </span>
          ) : null}
        />
      </div>
    </section>
  );
}
