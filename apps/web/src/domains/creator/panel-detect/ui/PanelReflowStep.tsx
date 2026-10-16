"use no memo";
// 문구는 usePanelT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역(번역 번들 갱신)이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { ArrowLeft, Download, FileInput } from "lucide-react";
import { useMemo, type ReactElement } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import type { ImageSize } from "../panel-canvas-geometry";
import { findOversizedCuts, findOversizedPages } from "../panel-reflow-render";
import {
  PANEL_REFLOW_MAX_GAP,
  PANEL_REFLOW_STANDARD_GAP,
  PANEL_REFLOW_WIDTHS,
  reflowLossNeedsConfirmation,
  type PanelReflowPlan,
} from "../panel-reflow-plan";
import { panelStudioBackground } from "../panel-studio-document";

import { PanelJobStatus } from "./PanelJobStatus";
import { PanelNotice } from "./PanelNotice";
import { PanelReflowPreview } from "./PanelReflowPreview";
import { computeReflowOutcome, type ReflowSettings } from "./panel-reflow-outcome";
import { formatPanelNumber, lossItemText, renderErrorText } from "./panel-import-copy";
import { PANEL_FOCUS_RING, PANEL_HEADING, PANEL_HINT, PANEL_INPUT, PANEL_LABEL, PANEL_SUBSURFACE, PANEL_SURFACE, panelChipClass } from "./panel-import-styles";
import { usePanelT } from "./use-panel-t";
import { useStepHeadingFocus } from "./use-step-heading-focus";

import type { EditablePanel } from "../panel-detect-edit";
import type { PanelDetectResult } from "../panel-detect-types";
import type { PanelJob } from "./use-panel-job";

const GAP_PRESETS = [0, 40, PANEL_REFLOW_STANDARD_GAP, 160] as const;

interface PanelReflowStepProps {
  readonly imageUrl: string;
  readonly image: ImageSize;
  readonly panels: readonly EditablePanel[];
  readonly result: PanelDetectResult;
  readonly settings: ReflowSettings;
  readonly title: string;
  /** 사용자가 확인한 손실 보고의 서명. 설정이 바뀌어 보고가 달라지면 자동으로 무효가 된다. */
  readonly confirmedSignature: string | null;
  readonly insertJob: PanelJob<void>;
  readonly downloadJob: PanelJob<void>;
  readonly onSettings: (next: ReflowSettings) => void;
  readonly onTitle: (title: string) => void;
  readonly onConfirm: (signature: string | null) => void;
  readonly onInsert: (plan: PanelReflowPlan) => void;
  readonly onDownload: (plan: PanelReflowPlan) => void;
  readonly onBack: () => void;
}

/** 3단계 — 폭 규격·여백·배율을 고르고, 결과 미리보기와 손실 보고를 확인한 뒤 Studio 문서로 삽입하거나 PNG 묶음으로 받는다. */
export function PanelReflowStep(props: PanelReflowStepProps): ReactElement {
  const t = usePanelT();
  const { settings, result } = props;
  const headingRef = useStepHeadingFocus<HTMLHeadingElement>();
  const outcome = useMemo(() => computeReflowOutcome(props.panels, settings, result, props.image), [props.panels, settings, result, props.image]);
  const background = panelStudioBackground(result.gutter.color);
  const busy = props.insertJob.state.status === "running" || props.downloadJob.state.status === "running";
  const plan = outcome.ok ? outcome.plan : null;
  const needsConfirm = outcome.ok && reflowLossNeedsConfirmation(outcome.loss);
  const confirmed = !needsConfirm || (outcome.ok && props.confirmedSignature === outcome.signature);
  const oversizedCuts = plan ? findOversizedCuts(plan) : [];
  const oversizedPages = plan ? findOversizedPages(plan) : [];
  const titleValid = props.title.trim().length > 0;
  const insertReady = plan !== null && confirmed && titleValid && oversizedCuts.length === 0 && !busy;
  const downloadReady = plan !== null && confirmed && oversizedPages.length === 0 && !busy;

  const patch = (next: Partial<ReflowSettings>): void => props.onSettings({ ...settings, ...next });

  return (
    <section className={PANEL_SURFACE} aria-labelledby="panel-reflow-title">
      <h3 ref={headingRef} id="panel-reflow-title" className={PANEL_HEADING} data-panel-step-heading="reflow" tabIndex={-1}>
        {t("panelImport.reflow.title")}
      </h3>
      <p className={cn(PANEL_HINT, "mt-1")}>
        {t("panelImport.reflow.intro")}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-3">
          <fieldset className={cn(PANEL_SUBSURFACE, "grid gap-3")} disabled={busy}>
            <legend className="px-1 text-xs font-bold text-fg-2">{t("panelImport.reflow.format")}</legend>
            <div>
              <p className={PANEL_LABEL}>{t("panelImport.reflow.width")}</p>
              <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("panelImport.reflow.widthGroup")}>
                {PANEL_REFLOW_WIDTHS.map((width) => (
                  <label key={width} className={panelChipClass(settings.targetWidth === width)}>
                    <input type="radio" name="panel-reflow-width" className="sr-only" checked={settings.targetWidth === width} onChange={() => patch({ targetWidth: width })} />
                    {width}px
                  </label>
                ))}
              </div>
              <p className={cn(PANEL_HINT, "mt-1")}>
                {t("panelImport.reflow.widthHint")}
              </p>
            </div>
            <div>
              <label className="block">
                <span className={PANEL_LABEL}>{t("panelImport.reflow.gap")}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={PANEL_REFLOW_MAX_GAP}
                  step={1}
                  value={settings.gap}
                  onChange={(event) => {
                    const value = Math.round(Number(event.currentTarget.value));
                    if (Number.isFinite(value)) patch({ gap: Math.min(PANEL_REFLOW_MAX_GAP, Math.max(0, value)) });
                  }}
                  className={cn(PANEL_INPUT, "mt-1")}
                />
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {GAP_PRESETS.map((gap) => (
                  <button key={gap} type="button" aria-pressed={settings.gap === gap} onClick={() => patch({ gap })} className={panelChipClass(settings.gap === gap)}>
                    {gap === PANEL_REFLOW_STANDARD_GAP ? t("panelImport.reflow.gapStandard", { gap }) : gap}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className={PANEL_LABEL}>{t("panelImport.reflow.scale")}</p>
              <div className="mt-1 grid gap-1.5" role="radiogroup" aria-label={t("panelImport.reflow.scaleGroup")}>
                <label className={cn(panelChipClass(settings.scaleMode === "fit-width"), "justify-start text-left")}>
                  <input type="radio" name="panel-reflow-scale" className="sr-only" checked={settings.scaleMode === "fit-width"} onChange={() => patch({ scaleMode: "fit-width" })} />
                  {t("panelImport.reflow.fitWidth")}
                </label>
                <label className={cn(panelChipClass(settings.scaleMode === "keep-size"), "justify-start text-left")}>
                  <input type="radio" name="panel-reflow-scale" className="sr-only" checked={settings.scaleMode === "keep-size"} onChange={() => patch({ scaleMode: "keep-size" })} />
                  {t("panelImport.reflow.keepSize")}
                </label>
              </div>
            </div>
            <label className="block">
              <span className={PANEL_LABEL}>{t("panelImport.reflow.docTitle")}</span>
              <input type="text" value={props.title} maxLength={200} onChange={(event) => props.onTitle(event.currentTarget.value)} aria-invalid={!titleValid} className={cn(PANEL_INPUT, "mt-1")} />
            </label>
          </fieldset>

          {outcome.ok ? (
            <div className={cn(PANEL_SUBSURFACE, "grid gap-2")}>
              <p className="text-sm font-black text-fg" role="status">
                {t("panelImport.reflow.summary", {
                  pages: outcome.plan.pages.length,
                  panels: outcome.plan.placements.length,
                  height: formatPanelNumber(outcome.plan.totalHeight),
                })}
              </p>
              <h4 className="text-xs font-black text-fg-2">{t("panelImport.reflow.changesTitle")}</h4>
              <ul className="grid gap-1.5">
                {outcome.loss.map((item) => (
                  <li key={item.code}>
                    <PanelNotice tone={item.severity === "warning" ? "warn" : "info"} live="off">{lossItemText(t, item)}</PanelNotice>
                  </li>
                ))}
              </ul>
              {needsConfirm ? (
                <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm font-semibold text-fg">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={busy}
                    onChange={(event) => props.onConfirm(event.currentTarget.checked ? outcome.signature : null)}
                    className={cn("mt-0.5 size-5 shrink-0 accent-accent", PANEL_FOCUS_RING)}
                  />
                  <span>{t("panelImport.reflow.confirm")}</span>
                </label>
              ) : null}
            </div>
          ) : (
            <PanelNotice tone="bad">{renderErrorText(t, outcome.error)}</PanelNotice>
          )}
        </div>

        <div className="min-w-0">
          {plan ? (
            <PanelReflowPreview plan={plan} imageUrl={props.imageUrl} image={props.image} background={background} />
          ) : (
            <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-line px-4 text-center text-sm text-fg-3">
              {t("panelImport.reflow.previewEmpty")}
            </div>
          )}
        </div>
      </div>

      {oversizedCuts.length > 0 ? (
        <PanelNotice tone="bad" className="mt-3">
          {t("panelImport.reflow.oversized", { cuts: oversizedCuts.join(", ") })}
        </PanelNotice>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={props.onBack} disabled={busy} className={buttonClass({ variant: "outline", size: "lg" })}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t("panelImport.reflow.back")}
        </button>
        <button type="button" disabled={!insertReady || plan === null} onClick={() => { if (plan) props.onInsert(plan); }} className={buttonClass({ size: "lg" })}>
          <FileInput size={16} aria-hidden="true" />
          {t("panelImport.reflow.insert")}
        </button>
        <button type="button" disabled={!downloadReady || plan === null || oversizedPages.length > 0} onClick={() => { if (plan) props.onDownload(plan); }} className={buttonClass({ variant: "outline", size: "lg" })}>
          <Download size={16} aria-hidden="true" />
          {t("panelImport.reflow.download")}
        </button>
      </div>
      {!confirmed && needsConfirm ? <p className={cn(PANEL_HINT, "mt-2")}>{t("panelImport.reflow.confirmHint")}</p> : null}
      {oversizedPages.length > 0 && plan ? <p className={cn(PANEL_HINT, "mt-2")}>{t("panelImport.reflow.pageTooLong")}</p> : null}

      <div className="mt-3 grid gap-2">
        <PanelJobStatus
          state={props.insertJob.state}
          runningLabel={t("panelImport.reflow.inserting")}
          cancelledLabel={t("panelImport.reflow.insertCancelled")}
          errorText={(error) => renderErrorText(t, error)}
          onCancel={props.insertJob.cancel}
          onRetry={() => { if (plan) props.onInsert(plan); }}
          success={t("panelImport.reflow.inserted")}
        />
        <PanelJobStatus
          state={props.downloadJob.state}
          runningLabel={t("panelImport.reflow.downloading")}
          cancelledLabel={t("panelImport.reflow.downloadCancelled")}
          errorText={(error) => renderErrorText(t, error)}
          onCancel={props.downloadJob.cancel}
          onRetry={() => { if (plan) props.onDownload(plan); }}
          success={t("panelImport.reflow.downloaded")}
        />
      </div>
    </section>
  );
}
