"use no memo";
// 문구가 전역 언어를 읽는 bi() 로 만들어져서, 언어를 바꾸면 열려 있는 화면도 바로 다시 그려야 한다.
// React Compiler 가 상수 인자의 bi() 결과를 캐시하면 이전 언어가 남으므로 이 파일은 메모이제이션에서 뺀다(panel-import-bi.ts 참고).

import { FileUp, Lock, ShieldCheck } from "lucide-react";
import { useId, useRef, useState, type ChangeEvent, type ReactElement } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  PANEL_IMPORT_NOTE_MAX_LENGTH,
  PANEL_IMPORT_RIGHTS_STATEMENT_KO,
  createPanelImportRights,
  type PanelImportRights,
} from "../panel-import-rights";
import { PANEL_IMPORT_LIMITS, type PanelSourceImage } from "../panel-source-image";

import { PanelNotice } from "./PanelNotice";
import { bi, sourceErrorText } from "./panel-import-copy";
import { usePanelImportEnvironment } from "./panel-import-env";
import { PANEL_FOCUS_RING, PANEL_HEADING, PANEL_HINT, PANEL_INPUT, PANEL_LABEL, PANEL_SKELETON, PANEL_SURFACE } from "./panel-import-styles";
import { usePanelJob } from "./use-panel-job";

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
  const env = usePanelImportEnvironment();
  const id = useId().replace(/:/gu, "");
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
      <h3 id={`${id}-title`} className={PANEL_HEADING} data-panel-step-heading="source" tabIndex={-1}>
        {bi("1. 원고 권리 확인과 이미지 선택", "1. Confirm rights and choose the image")}
      </h3>
      <p className={cn(PANEL_HINT, "mt-1")}>
        {mode === "reflow"
          ? bi("스캔한 만화 페이지나 긴 웹툰 이미지 한 장을 골라 주세요. 컷을 찾아 세로 스트립으로 다시 배열해요.", "Choose one scanned comic page or a long webtoon image. Panels are detected and rearranged into a vertical strip.")
          : bi("긴 세로 원고 이미지 한 장을 골라 주세요. 4:5(1080×1350) 카드로 나눠요. Studio 에서 내보낸 세로 이미지도 쓸 수 있어요.", "Choose one long vertical manuscript image. It is sliced into 4:5 (1080×1350) cards. A vertical image exported from Studio works too.")}
      </p>

      <fieldset className="mt-4 rounded-xl border border-line bg-panel/55 p-3" disabled={busy || state.status === "success"}>
        <legend className="px-1 text-xs font-bold text-fg-2">{bi("권리 확인 (필수)", "Rights confirmation (required)")}</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm font-semibold text-fg">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
            className={cn("mt-0.5 size-5 shrink-0 accent-accent", PANEL_FOCUS_RING)}
            data-autofocus="true"
          />
          <span>
            {bi(PANEL_IMPORT_RIGHTS_STATEMENT_KO, "I own this manuscript or have permission to use it")}
          </span>
        </label>
        <p className={cn(PANEL_HINT, "mt-1 pl-7")}>
          {bi("스캔본이나 다른 사람의 원고는 저작권이 있을 수 있어요. 이 확인은 결과물에 기록으로 남고, 법률 자문이나 권리 인증이 아니에요.", "Scans or other people’s work may be copyrighted. This confirmation is recorded with the result; it is not legal advice or rights certification.")}
        </p>
        <label className="mt-3 block">
          <span className={PANEL_LABEL}>{bi("출처·이용 허락 메모 (선택)", "Source / permission note (optional)")}</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
            maxLength={PANEL_IMPORT_NOTE_MAX_LENGTH}
            rows={2}
            placeholder={bi("예: 직접 그린 원고 / 출판사 허락 2026-09-30", "e.g. drew it myself / publisher’s permission 2026-09-30")}
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
          {bi("이미지 선택", "Choose image")}
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
          {confirmed
            ? bi(`PNG·JPG·WebP, 최대 ${MAX_MB}MB`, `PNG, JPG or WebP, up to ${MAX_MB} MB`)
            : bi("먼저 위의 권리 확인에 체크해 주세요.", "First tick the rights confirmation above.")}
        </p>
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-fg-2">
        <Lock size={13} aria-hidden="true" />
        {bi("이미지는 이 기기에서만 처리하고 서버로 보내지 않아요. 원본 파일은 바꾸지 않아요.", "The image is processed only on this device and never sent to a server. The original file is not changed.")}
      </p>

      {state.status === "running" ? (
        <div className="mt-4" aria-busy="true">
          <PanelNotice tone="info" live="status" actions={
            <button type="button" onClick={job.cancel} className={buttonClass({ variant: "outline", size: "sm" })}>
              {bi("취소", "Cancel")}
            </button>
          }>
            {bi(`${pickedName ?? "이미지"} 읽는 중…`, `Reading ${pickedName ?? "the image"}…`)}
          </PanelNotice>
          <div className="mt-3 grid gap-2" aria-hidden="true">
            <div className={cn(PANEL_SKELETON, "h-4 w-2/3")} />
            <div className={cn(PANEL_SKELETON, "h-24 w-full")} />
          </div>
        </div>
      ) : null}

      {state.status === "cancelled" ? (
        <PanelNotice tone="warn" className="mt-4" live="status">
          {bi("이미지 읽기를 취소했어요. 다시 골라 주세요.", "Reading was cancelled. Choose the image again.")}
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
                  {bi("같은 파일로 다시 시도", "Retry this file")}
                </button>
              ) : null}
            </>
          }
        >
          {sourceErrorText(state.error)}
        </PanelNotice>
      ) : null}

      {state.status === "success" ? (
        <PanelNotice tone="good" className="mt-4">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={14} aria-hidden="true" />
            {bi(`${state.value.source.fileName} (${state.value.source.width}×${state.value.source.height}px)를 읽었어요. 권리 확인이 기록됐어요.`, `Read ${state.value.source.fileName} (${state.value.source.width}×${state.value.source.height} px). Your rights confirmation is recorded.`)}
          </span>
        </PanelNotice>
      ) : null}
    </section>
  );
}
