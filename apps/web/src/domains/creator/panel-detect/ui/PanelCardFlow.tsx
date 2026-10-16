"use no memo";
// 문구가 전역 언어를 읽는 bi() 로 만들어져서, 언어를 바꾸면 열려 있는 화면도 바로 다시 그려야 한다.
// React Compiler 가 상수 인자의 bi() 결과를 캐시하면 이전 언어가 남으므로 이 파일은 메모이제이션에서 뺀다(panel-import-bi.ts 참고).

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
import { bi, cardErrorText, cardWarningText } from "./panel-import-copy";
import { usePanelImportEnvironment } from "./panel-import-env";
import { PANEL_HEADING, PANEL_HINT, PANEL_INPUT, PANEL_LABEL, PANEL_SKELETON, PANEL_SMALL_BUTTON, PANEL_SUBSURFACE, PANEL_SURFACE, panelChipClass } from "./panel-import-styles";
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
  const env = usePanelImportEnvironment();
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
      <h3 id="panel-card-analyze-title" className={PANEL_HEADING} data-panel-step-heading="cards-analyze" tabIndex={-1}>
        {bi("2. 카드로 나눌 자리를 찾는 중", "2. Finding where to cut the cards")}
      </h3>
      <div className="mt-3 grid gap-3">
        <PanelJobStatus
          state={state.status === "idle" ? { status: "running", progress: null } : state}
          runningLabel={bi("여백이 있는 줄을 찾아 카드 자리를 계산하는 중이에요…", "Looking for blank rows to place the card cuts…")}
          cancelledLabel={bi("카드 나누기를 취소했어요.", "Slicing was cancelled.")}
          errorText={cardErrorText}
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
  const env = usePanelImportEnvironment();
  const [analysis, setAnalysis] = useState(initial);
  const [alignment, setAlignment] = useState<CardAlignment>("center");
  const fallbackTitle = bi("ToonStudio 카드뉴스", "ToonStudio card news");
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
      <h3 id="panel-card-title" className={PANEL_HEADING} data-panel-step-heading="cards" tabIndex={-1}>
        {bi("2. 카드 미리보기와 조정", "2. Preview and adjust cards")}
      </h3>
      <p className="mt-1 text-sm text-fg-2" role="status">
        {bi(
          `카드 ${plan.cards.length}장 · ${CARD_NEWS_PRESET.ratio} (${plan.cardWidth}×${plan.cardHeight}) · 원본 ${plan.sourceWidth}×${plan.sourceHeight}px`,
          `${plan.cards.length} card(s) · ${CARD_NEWS_PRESET.ratio} (${plan.cardWidth}×${plan.cardHeight}) · source ${plan.sourceWidth}×${plan.sourceHeight} px`,
        )}
      </p>
      {plan.warnings.length > 0 ? (
        <ul className="mt-2 grid gap-1.5">
          {plan.warnings.map((warning) => (
            <li key={warning}><PanelNotice tone={warning === "content-cuts" || warning === "over-carousel-limit" ? "warn" : "info"} live="off">{cardWarningText(warning, plan.geometry.scale)}</PanelNotice></li>
          ))}
        </ul>
      ) : null}

      <div className={cn(PANEL_SUBSURFACE, "mt-3 flex flex-wrap items-end gap-x-6 gap-y-3")}>
        <div>
          <p className={PANEL_LABEL}>{bi("카드 수", "Number of cards")}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <button type="button" disabled={busy || plan.cards.length <= range.min} onClick={() => replan(plan.cards.length - 1)} aria-label={bi("카드 수 줄이기", "Fewer cards")} className={PANEL_SMALL_BUTTON}>
              <Minus size={14} aria-hidden="true" />
            </button>
            <output className="min-w-10 text-center text-sm font-black tabular-nums text-fg" aria-live="polite">{plan.cards.length}</output>
            <button type="button" disabled={busy || plan.cards.length >= range.max} onClick={() => replan(plan.cards.length + 1)} aria-label={bi("카드 수 늘리기", "More cards")} className={PANEL_SMALL_BUTTON}>
              <Plus size={14} aria-hidden="true" />
            </button>
            <button type="button" disabled={busy} onClick={() => replan(null)} className={PANEL_SMALL_BUTTON}>
              <RotateCcw size={13} aria-hidden="true" />
              {bi("자동으로 다시 나누기", "Re-slice automatically")}
            </button>
          </div>
          <p className={cn(PANEL_HINT, "mt-1")}>{bi(`가능한 범위 ${range.min}~${range.max}장. 다시 나누면 직접 옮긴 절단선은 사라져요.`, `Allowed: ${range.min}–${range.max}. Re-slicing discards cuts you moved.`)}</p>
        </div>
        <fieldset>
          <legend className={PANEL_LABEL}>{bi("카드 안 위치", "Position inside the card")}</legend>
          <div className="mt-1 flex gap-1.5">
            {(["center", "top"] as const).map((value) => (
              <label key={value} className={panelChipClass(alignment === value)}>
                <input type="radio" name="panel-card-alignment" className="sr-only" checked={alignment === value} onChange={() => setAlignment(value)} />
                {value === "center" ? bi("가운데", "Centre") : bi("위쪽", "Top")}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <PanelJobStatus
        state={replanJob.state}
        runningLabel={bi("카드를 다시 나누는 중…", "Re-slicing…")}
        cancelledLabel={bi("다시 나누기를 취소했어요. 이전 카드가 그대로예요.", "Re-slicing cancelled. Your previous cards are unchanged.")}
        errorText={cardErrorText}
        onCancel={replanJob.cancel}
        onRetry={() => replan(plan.cards.length)}
        className="mt-3"
      />

      <ol className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={bi("카드 목록", "Cards")}>
        {plan.cards.map((card) => (
          <li key={card.index} className="grid content-start gap-2">
            <p className="text-sm font-black text-fg">
              {bi(`카드 ${card.index + 1}`, `Card ${card.index + 1}`)}
              <span className="ml-2 text-xs font-normal text-fg-3">{bi(`채움 ${Math.round(card.fill * 100)}% · 원본 ${card.y0}~${card.y1}행`, `${Math.round(card.fill * 100)}% filled · rows ${card.y0}–${card.y1}`)}</span>
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
          <span className={PANEL_LABEL}>{bi("ZIP 파일 이름(제목)", "ZIP file name (title)")}</span>
          <input type="text" value={title} maxLength={200} disabled={busy} onChange={(event) => setTitle(event.currentTarget.value)} className={cn(PANEL_INPUT, "mt-1")} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy || title.trim() === ""} onClick={exportCards} className={buttonClass({ size: "lg" })}>
            <Download size={16} aria-hidden="true" />
            {bi("ZIP(PNG) 내보내기", "Export ZIP (PNG)")}
          </button>
          <p className={cn(PANEL_HINT, "min-w-0 flex-1")}>
            {bi("카드는 card-01.png 처럼 순서대로 이름이 붙고, 원본 정보와 권리 확인 기록이 함께 들어가요.", "Cards are named card-01.png, card-02.png … in order, with the source details and your rights confirmation included.")}
          </p>
        </div>
        <PanelJobStatus
          state={exportJob.state}
          runningLabel={bi("카드를 PNG 로 만들어 ZIP 에 담는 중…", "Rendering cards and packing the ZIP…")}
          cancelledLabel={bi("내보내기를 취소했어요. 카드 설정은 그대로예요.", "Export cancelled. Your card settings are unchanged.")}
          errorText={cardErrorText}
          onCancel={exportJob.cancel}
          onRetry={exportCards}
          success={exportJob.state.status === "success" ? (
            <span className="flex flex-wrap items-center gap-2">
              {bi(`${exportJob.state.value.fileName} (${exportJob.state.value.cards}장)을 내려받았어요.`, `${exportJob.state.value.fileName} (${exportJob.state.value.cards} cards) was downloaded.`)}
              <button
                type="button"
                className={buttonClass({ variant: "outline", size: "sm" })}
                onClick={() => {
                  if (exportJob.state.status === "success") env.download(exportJob.state.value.blob, exportJob.state.value.fileName);
                }}
              >
                {bi("다시 내려받기", "Download again")}
              </button>
            </span>
          ) : null}
        />
      </div>
    </section>
  );
}
