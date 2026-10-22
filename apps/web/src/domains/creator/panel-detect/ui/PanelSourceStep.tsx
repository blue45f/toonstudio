"use no memo";
// 문구는 usePanelT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역(번역 번들 갱신)이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import { creatorRestStatusText } from "../../creator-rest-status-i18n";
import { FileUp, Lock, ShieldCheck } from "lucide-react";
import { useId, useRef, useState, type ChangeEvent, type ReactElement } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  PANEL_IMPORT_NOTE_MAX_LENGTH,
  PanelImportRightsError,
  createPanelImportRights,
  type PanelImportRights,
} from "../panel-import-rights";
import { PANEL_IMPORT_LIMITS, type PanelSourceImage } from "../panel-source-image";

import { PanelNotice } from "./PanelNotice";
import { sourceErrorText } from "./panel-import-copy";
import { usePanelImportEnvironment } from "./panel-import-env";
import { PANEL_FOCUS_RING, PANEL_HEADING, PANEL_HINT, PANEL_INPUT, PANEL_LABEL, PANEL_SKELETON, PANEL_SURFACE } from "./panel-import-styles";
import { usePanelJob } from "./use-panel-job";
import { usePanelT } from "./use-panel-t";
import { useStepHeadingFocus } from "./use-step-heading-focus";

export interface PanelSourceReady {
  readonly source: PanelSourceImage;
  readonly rights: PanelImportRights;
  readonly file: File;
}

interface PanelSourceStepProps {
  readonly mode: "reflow" | "cards";
  readonly onReady: (ready: PanelSourceReady) => void;
}

const ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
const MAX_MB = PANEL_IMPORT_LIMITS.maxFileBytes / (1024 * 1024);

/**
 * 1단계 — 권리 확인 → 원고 이미지 고르기.
 * 권리 확인(체크)이 없으면 파일 선택이 열리지 않고, 확인 기록은 파일을 읽은 직후 원본 영수증과 함께 만들어진다.
 * 이미지는 이 브라우저 안에서만 읽는다.
 */
export function PanelSourceStep({ mode, onReady }: PanelSourceStepProps): ReactElement {
  const t = usePanelT();
  const env = usePanelImportEnvironment();
  const id = useId().replace(/:/gu, "");
  const headingRef = useStepHeadingFocus<HTMLHeadingElement>();
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [pickedName, setPickedName] = useState<string | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const job = usePanelJob<PanelSourceReady>();
  const busy = job.state.status === "running";

  const start = (file: File): void => {
    lastFileRef.current = file;
    setPickedName(file.name);
    void job.run(async ({ signal }) => {
      // 권리 확인을 가장 먼저 본다. 오류 화면에서 체크를 풀고 "같은 파일로 다시 시도"를 눌러도 파일을 디코딩·해시하지 않고,
      // 일반 오류가 아니라 확인이 필요하다는 이유로 끝낸다.
      if (!confirmed) throw new PanelImportRightsError("not-confirmed", creatorRestStatusText("creatorRest.status.panelSource.rightsRequired", "원고 권리 확인 없이는 파일을 읽을 수 없어요."));
      const source = await env.loadSource(file, signal);
      if (signal.aborted) {
        source.dispose();
        throw new DOMException("cancelled", "AbortError");
      }
      try {
        const rights = createPanelImportRights({
          confirmed,
          attestedAt: env.now().toISOString(),
          note,
          source: source.receipt(),
        });
        const ready: PanelSourceReady = { source, rights, file };
        onReady(ready);
        return ready;
      } catch (error) {
        source.dispose();
        throw error;
      }
    });
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (file && confirmed && !busy) start(file);
  };

  const state = job.state;
  const hintId = `${id}-hint`;
  return (
    <section className={PANEL_SURFACE} aria-labelledby={`${id}-title`}>
      <h3 ref={headingRef} id={`${id}-title`} className={PANEL_HEADING} data-panel-step-heading="source" tabIndex={-1}>
        {t("panelImport.source.title")}
      </h3>
      <p className={cn(PANEL_HINT, "mt-1")}>
        {mode === "reflow" ? t("panelImport.source.hint.reflow") : t("panelImport.source.hint.cards")}
      </p>

      <fieldset className="mt-4 rounded-xl border border-line bg-panel/55 p-3" disabled={busy || state.status === "success"}>
        <legend className="px-1 text-xs font-bold text-fg-2">{t("panelImport.source.rights.legend")}</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm font-semibold text-fg">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
            className={cn("mt-0.5 size-5 shrink-0 accent-accent", PANEL_FOCUS_RING)}
          />
          <span>{t("panelImport.attest.statement")}</span>
        </label>
        <p className={cn(PANEL_HINT, "mt-1 pl-7")}>
          {t("panelImport.source.rights.notice")}
        </p>
        <label className="mt-3 block">
          <span className={PANEL_LABEL}>{t("panelImport.source.note.label")}</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
            maxLength={PANEL_IMPORT_NOTE_MAX_LENGTH}
            rows={2}
            placeholder={t("panelImport.source.note.placeholder")}
            className={cn(PANEL_INPUT, "mt-1 py-2")}
          />
        </label>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label
          className={cn(
            buttonClass({ size: "lg", className: "cursor-pointer gap-2 focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-canvas" }),
            (!confirmed || busy || state.status === "success") && "pointer-events-none opacity-45",
          )}
          aria-disabled={!confirmed || busy || state.status === "success"}
        >
          <FileUp size={17} aria-hidden="true" />
          {t("panelImport.source.choose")}
          <input
            type="file"
            accept={ACCEPT}
            disabled={!confirmed || busy || state.status === "success"}
            onChange={onPick}
            aria-describedby={hintId}
            className="sr-only"
          />
        </label>
        <p id={hintId} className={cn(PANEL_HINT, "min-w-0 flex-1")}>
          {confirmed ? t("panelImport.source.accept", { max: MAX_MB }) : t("panelImport.source.needRights")}
        </p>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-fg-2">
        <Lock size={13} aria-hidden="true" />
        {mode === "reflow" ? t("panelImport.source.privacy.reflow") : t("panelImport.source.privacy.cards")}
      </p>

      {state.status === "running" ? (
        <div className="mt-4" aria-busy="true">
          <PanelNotice tone="info" live="status" actions={
            <button type="button" onClick={job.cancel} className={buttonClass({ variant: "outline", size: "sm" })}>
              {t("panelImport.common.cancel")}
            </button>
          }>
            {pickedName === null ? t("panelImport.source.readingFallback") : t("panelImport.source.reading", { name: pickedName })}
          </PanelNotice>
          <div className="mt-3 grid gap-2" aria-hidden="true">
            <div className={cn(PANEL_SKELETON, "h-4 w-2/3")} />
            <div className={cn(PANEL_SKELETON, "h-24 w-full")} />
          </div>
        </div>
      ) : null}

      {state.status === "cancelled" ? (
        <PanelNotice tone="warn" className="mt-4" live="status">
          {t("panelImport.source.cancelled")}
        </PanelNotice>
      ) : null}

      {state.status === "error" ? (
        <PanelNotice
          tone="bad"
          className="mt-4"
          actions={
            <>
              {lastFileRef.current ? (
                <button type="button" onClick={() => { if (lastFileRef.current) start(lastFileRef.current); }} className={buttonClass({ variant: "outline", size: "sm" })}>
                  {t("panelImport.source.retryFile")}
                </button>
              ) : null}
            </>
          }
        >
          {sourceErrorText(t, state.error)}
        </PanelNotice>
      ) : null}

      {state.status === "success" ? (
        <PanelNotice tone="good" className="mt-4">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={14} aria-hidden="true" />
            {t("panelImport.source.done", { name: state.value.source.fileName, width: state.value.source.width, height: state.value.source.height })}
          </span>
        </PanelNotice>
      ) : null}
    </section>
  );
}
