"use no memo";
// 문구가 전역 언어를 읽는 bi() 로 만들어져서, 언어를 바꾸면 열려 있는 화면도 바로 다시 그려야 한다.
// React Compiler 가 상수 인자의 bi() 결과를 캐시하면 이전 언어가 남으므로 이 파일은 메모이제이션에서 뺀다(panel-import-bi.ts 참고).

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
import { bi, lossItemText, renderErrorText } from "./panel-import-copy";
import { PANEL_FOCUS_RING, PANEL_HEADING, PANEL_HINT, PANEL_INPUT, PANEL_LABEL, PANEL_SUBSURFACE, PANEL_SURFACE, panelChipClass } from "./panel-import-styles";

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
  const { settings, result } = props;
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
      <h3 id="panel-reflow-title" className={PANEL_HEADING} data-panel-step-heading="reflow" tabIndex={-1}>
        {bi("3. 세로 스트립으로 재배열", "3. Rearrange into a vertical strip")}
      </h3>
      <p className={cn(PANEL_HINT, "mt-1")}>
        {bi("컷을 읽기 순서대로 같은 폭의 세로 한 줄로 늘어놓아요. 컷은 원본에서 새 이미지로 다시 그려요.", "Panels are laid out in reading order as one vertical strip of equal width. Each panel is redrawn from the original as a new image.")}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-3">
          <fieldset className={cn(PANEL_SUBSURFACE, "grid gap-3")} disabled={busy}>
            <legend className="px-1 text-xs font-bold text-fg-2">{bi("규격", "Format")}</legend>
            <div>
              <p className={PANEL_LABEL}>{bi("폭", "Width")}</p>
              <div className="mt-1 flex flex-wrap gap-1.5" role="radiogroup" aria-label={bi("폭 규격", "Width preset")}>
                {PANEL_REFLOW_WIDTHS.map((width) => (
                  <label key={width} className={panelChipClass(settings.targetWidth === width)}>
                    <input type="radio" name="panel-reflow-width" className="sr-only" checked={settings.targetWidth === width} onChange={() => patch({ targetWidth: width })} />
                    {width}px
                  </label>
                ))}
              </div>
              <p className={cn(PANEL_HINT, "mt-1")}>
                {bi("720px 는 Studio 문서 폭이에요. 690px 는 양옆에 15px 씩 여백을 두고 가운데에 놓아요.", "720 px is the Studio page width. 690 px is centred with 15 px on each side.")}
              </p>
            </div>
            <div>
              <label className="block">
                <span className={PANEL_LABEL}>{bi("컷 사이 여백(px)", "Gap between panels (px)")}</span>
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
                    {gap === PANEL_REFLOW_STANDARD_GAP ? bi(`표준 ${gap}`, `Standard ${gap}`) : gap}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className={PANEL_LABEL}>{bi("배율", "Scaling")}</p>
              <div className="mt-1 grid gap-1.5" role="radiogroup" aria-label={bi("배율 방식", "Scaling mode")}>
                <label className={cn(panelChipClass(settings.scaleMode === "fit-width"), "justify-start text-left")}>
                  <input type="radio" name="panel-reflow-scale" className="sr-only" checked={settings.scaleMode === "fit-width"} onChange={() => patch({ scaleMode: "fit-width" })} />
                  {bi("폭에 맞춤 — 모든 컷을 같은 폭으로", "Fit width — every panel the same width")}
                </label>
                <label className={cn(panelChipClass(settings.scaleMode === "keep-size"), "justify-start text-left")}>
                  <input type="radio" name="panel-reflow-scale" className="sr-only" checked={settings.scaleMode === "keep-size"} onChange={() => patch({ scaleMode: "keep-size" })} />
                  {bi("원본 크기 유지 — 키우지 않고 가운데에", "Keep size — never enlarge, centred")}
                </label>
              </div>
            </div>
            <label className="block">
              <span className={PANEL_LABEL}>{bi("Studio 문서 제목", "Studio document title")}</span>
              <input type="text" value={props.title} maxLength={200} onChange={(event) => props.onTitle(event.currentTarget.value)} aria-invalid={!titleValid} className={cn(PANEL_INPUT, "mt-1")} />
            </label>
          </fieldset>

          {outcome.ok ? (
            <div className={cn(PANEL_SUBSURFACE, "grid gap-2")}>
              <p className="text-sm font-black text-fg" role="status">
                {bi(
                  `페이지 ${outcome.plan.pages.length}개 · 컷 ${outcome.plan.placements.length}개 · 총 높이 ${outcome.plan.totalHeight.toLocaleString("ko-KR")}px`,
                  `${outcome.plan.pages.length} page(s) · ${outcome.plan.placements.length} panel(s) · ${outcome.plan.totalHeight.toLocaleString("en-US")} px tall`,
                )}
              </p>
              <h4 className="text-xs font-black text-fg-2">{bi("원본과 달라지는 점", "What changes from the original")}</h4>
              <ul className="grid gap-1.5">
                {outcome.loss.map((item) => (
                  <li key={item.code}>
                    <PanelNotice tone={item.severity === "warning" ? "warn" : "info"} live="off">{lossItemText(item)}</PanelNotice>
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
                  <span>{bi("위 변경 사항을 확인했고, 이대로 새 이미지를 만드는 데 동의해요.", "I have read these changes and agree to create the new images this way.")}</span>
                </label>
              ) : null}
            </div>
          ) : (
            <PanelNotice tone="bad">{renderErrorText(outcome.error)}</PanelNotice>
          )}
        </div>

        <div className="min-w-0">
          {plan ? (
            <PanelReflowPreview plan={plan} imageUrl={props.imageUrl} image={props.image} background={background} />
          ) : (
            <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-line px-4 text-center text-sm text-fg-3">
              {bi("설정을 고치면 미리보기가 나타나요.", "Adjust the settings to see a preview.")}
            </div>
          )}
        </div>
      </div>

      {oversizedCuts.length > 0 ? (
        <PanelNotice tone="bad" className="mt-3">
          {bi(
            `${oversizedCuts.join(", ")}번 컷이 이 브라우저에서 한 장으로 만들 수 있는 크기를 넘어요. 폭 규격이나 배율을 바꾸거나 그 컷을 나눠 주세요.`,
            `Panel(s) ${oversizedCuts.join(", ")} are larger than this browser can create. Change the width or scaling, or split them.`,
          )}
        </PanelNotice>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={props.onBack} disabled={busy} className={buttonClass({ variant: "outline", size: "lg" })}>
          <ArrowLeft size={16} aria-hidden="true" />
          {bi("컷 고치기로", "Back to panels")}
        </button>
        <button type="button" disabled={!insertReady || plan === null} onClick={() => { if (plan) props.onInsert(plan); }} className={buttonClass({ size: "lg" })}>
          <FileInput size={16} aria-hidden="true" />
          {bi("Studio 문서로 삽입", "Insert into a Studio document")}
        </button>
        <button type="button" disabled={!downloadReady || plan === null || oversizedPages.length > 0} onClick={() => { if (plan) props.onDownload(plan); }} className={buttonClass({ variant: "outline", size: "lg" })}>
          <Download size={16} aria-hidden="true" />
          {bi("PNG 묶음(ZIP) 내려받기", "Download PNG bundle (ZIP)")}
        </button>
      </div>
      {!confirmed && needsConfirm ? <p className={cn(PANEL_HINT, "mt-2")}>{bi("변경 사항 확인에 체크하면 버튼이 열려요.", "Tick the confirmation to enable the buttons.")}</p> : null}
      {oversizedPages.length > 0 && plan ? <p className={cn(PANEL_HINT, "mt-2")}>{bi("페이지가 너무 길어 PNG 묶음은 만들 수 없어요(Studio 문서로 삽입은 가능해요).", "A page is too tall for the PNG bundle (inserting into a Studio document still works).")}</p> : null}

      <div className="mt-3 grid gap-2">
        <PanelJobStatus
          state={props.insertJob.state}
          runningLabel={bi("컷 이미지를 만들어 문서에 담는 중…", "Creating panel images and building the document…")}
          cancelledLabel={bi("삽입을 취소했어요. 원본과 컷 설정은 그대로예요.", "Insert cancelled. Your original and panel settings are unchanged.")}
          errorText={renderErrorText}
          onCancel={props.insertJob.cancel}
          onRetry={() => { if (plan) props.onInsert(plan); }}
          success={bi("Studio 편집기로 이동하고 있어요…", "Opening the Studio editor…")}
        />
        <PanelJobStatus
          state={props.downloadJob.state}
          runningLabel={bi("페이지 이미지를 만들어 ZIP 으로 묶는 중…", "Creating page images and zipping them…")}
          cancelledLabel={bi("내려받기를 취소했어요.", "Download cancelled.")}
          errorText={renderErrorText}
          onCancel={props.downloadJob.cancel}
          onRetry={() => { if (plan) props.onDownload(plan); }}
          success={bi("ZIP 을 내려받았어요. 브라우저의 다운로드 목록을 확인해 주세요.", "The ZIP was downloaded. Check your browser’s downloads.")}
        />
      </div>
    </section>
  );
}
