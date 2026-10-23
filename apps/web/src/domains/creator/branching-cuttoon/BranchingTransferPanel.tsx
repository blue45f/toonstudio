"use no memo";
// 문구는 useBranchingT()(useT 를 감싼 훅)가 돌려주는 해소 함수 t 로 만든다. 같은 언어에서는 t 가 그대로라서 React Compiler 가 t 호출
// 결과를 캐시하면, 나중에 도착하는 런타임 번역이 열려 있는 화면에 반영되지 않는다. 그래서 이 화면의 컴포넌트 파일은 메모이제이션에서 뺀다.

import {
  BRANCHING_IMPORT_LIMITS,
  parseBranchingCuttoonJson,
  serializeBranchingCuttoon,
  type BranchingCuttoonGraph,
  type BranchingParseError,
} from "./model";
import { ClipboardCopy, Download, Upload } from "lucide-react";
import { useId, useRef, useState, type ChangeEvent, type ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

import { parseErrorMessage } from "./branching-cuttoon-copy";
import {
  BC_HEADING,
  BC_HINT,
  BC_INPUT,
  BC_LABEL,
  BC_PRIMARY_BUTTON,
  BC_SKELETON,
  BC_SMALL_BUTTON,
  BC_SURFACE,
  BC_TEXTAREA,
} from "./branching-cuttoon-styles";
import { BranchingNotice } from "./BranchingNotice";
import { useBranchingT } from "./use-branching-t";

/** 한 번에 보여 주는 가져오기 오류 줄 수. 나머지는 개수로만 알린다. */
const SHOWN_ERRORS = 5;
/** 파일은 UTF-8 이라 글자 수 상한의 3배 바이트를 넘으면 읽기 전에 거절한다. */
const MAX_FILE_BYTES = BRANCHING_IMPORT_LIMITS.maxTextLength * 3;
const DOWNLOAD_NAME = "branching-cuttoon.json";

type TransferState =
  | { readonly kind: "idle" }
  | { readonly kind: "reading" }
  | { readonly kind: "exported"; readonly method: "download" | "copy" }
  | { readonly kind: "exportFailed"; readonly method: "download" | "copy" }
  | { readonly kind: "importFailed"; readonly errors: readonly BranchingParseError[] }
  | { readonly kind: "readFailed" };

interface BranchingTransferPanelProps {
  readonly graph: BranchingCuttoonGraph;
  /** 모양이 맞는 파일을 읽었다. 현재 초안을 바꿔도 되는지 묻는 일은 부모가 맡는다. */
  readonly onImport: (graph: BranchingCuttoonGraph, ignoredFieldCount: number) => void;
}

function downloadText(text: string): boolean {
  if (typeof URL.createObjectURL !== "function") return false;
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = DOWNLOAD_NAME;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** 내보내기(파일 저장, 복사)와 가져오기(파일 선택, 붙여넣기). 가져오기는 모양만 확인하고 내용의 옳고 그름은 점검 결과가 알린다. */
export function BranchingTransferPanel({ graph, onImport }: BranchingTransferPanelProps): ReactElement {
  const t = useBranchingT();
  const prefix = useId().replace(/:/gu, "");
  const headingId = `${prefix}-heading`;
  const fileId = `${prefix}-file`;
  const pasteId = `${prefix}-paste`;
  const [state, setState] = useState<TransferState>({ kind: "idle" });
  const [pasted, setPasted] = useState("");
  const lastFile = useRef<File | null>(null);

  const exportAsFile = (): void => {
    let ok: boolean;
    try {
      ok = downloadText(serializeBranchingCuttoon(graph));
    } catch {
      ok = false;
    }
    setState(ok ? { kind: "exported", method: "download" } : { kind: "exportFailed", method: "download" });
  };

  const exportAsCopy = async (): Promise<void> => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(serializeBranchingCuttoon(graph));
      setState({ kind: "exported", method: "copy" });
    } catch {
      setState({ kind: "exportFailed", method: "copy" });
    }
  };

  const applyText = (text: string): boolean => {
    const result = parseBranchingCuttoonJson(text);
    if (!result.ok) {
      setState({ kind: "importFailed", errors: result.errors });
      return false;
    }
    setState({ kind: "idle" });
    onImport(result.graph, result.ignoredFieldCount);
    return true;
  };

  const readFile = async (file: File): Promise<void> => {
    lastFile.current = file;
    if (file.size > MAX_FILE_BYTES) {
      setState({ kind: "importFailed", errors: [{ code: "too-large", path: "" }] });
      return;
    }
    setState({ kind: "reading" });
    try {
      applyText(await file.text());
    } catch {
      setState({ kind: "readFailed" });
    }
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    // 같은 파일을 다시 고를 수 있도록 선택을 비운다.
    event.target.value = "";
    if (file) void readFile(file);
  };

  const importPasted = (): void => {
    if (applyText(pasted)) setPasted("");
  };

  return (
    <section aria-labelledby={headingId} className={BC_SURFACE}>
      <h3 id={headingId} className={BC_HEADING}>{t("branchingCuttoon.transfer.heading")}</h3>
      <p className={cn(BC_HINT, "mt-1")}>{t("branchingCuttoon.transfer.intro")}</p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-black text-fg">{t("branchingCuttoon.transfer.exportHeading")}</h4>
          <p className={cn(BC_HINT, "mt-1")}>{t("branchingCuttoon.transfer.exportHint")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={exportAsFile} className={BC_PRIMARY_BUTTON}>
              <Download size={16} aria-hidden="true" />
              {t("branchingCuttoon.transfer.exportFile")}
            </button>
            <button type="button" onClick={() => void exportAsCopy()} className={BC_SMALL_BUTTON}>
              <ClipboardCopy size={15} aria-hidden="true" />
              {t("branchingCuttoon.transfer.exportCopy")}
            </button>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-black text-fg">{t("branchingCuttoon.transfer.importHeading")}</h4>
          <p className={cn(BC_HINT, "mt-1")}>{t("branchingCuttoon.transfer.importHint")}</p>
          <label htmlFor={fileId} className={cn(BC_LABEL, "mt-3")}>{t("branchingCuttoon.transfer.fileField")}</label>
          <input
            id={fileId}
            type="file"
            accept=".json,application/json"
            onChange={onFile}
            className={cn(BC_INPUT, "mt-1 py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-fg")}
          />
          <label htmlFor={pasteId} className={cn(BC_LABEL, "mt-3")}>{t("branchingCuttoon.transfer.pasteField")}</label>
          <textarea
            id={pasteId}
            value={pasted}
            rows={4}
            spellCheck={false}
            onChange={(event) => setPasted(event.target.value)}
            className={cn(BC_TEXTAREA, "mt-1 font-mono text-xs")}
          />
          <button type="button" onClick={importPasted} disabled={pasted.trim() === ""} className={cn(BC_SMALL_BUTTON, "mt-2")}>
            <Upload size={15} aria-hidden="true" />
            {t("branchingCuttoon.transfer.importAction")}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {state.kind === "reading" ? (
          <div role="status" aria-busy="true" aria-label={t("branchingCuttoon.transfer.reading")} className="grid gap-2">
            <div className={cn(BC_SKELETON, "h-4 w-1/3")} />
            <p className={BC_HINT}>{t("branchingCuttoon.transfer.reading")}</p>
          </div>
        ) : null}
        {state.kind === "exported" ? (
          <BranchingNotice tone="good">
            {state.method === "download" ? t("branchingCuttoon.transfer.exportedFile") : t("branchingCuttoon.transfer.exportedCopy")}
          </BranchingNotice>
        ) : null}
        {state.kind === "exportFailed" ? (
          <BranchingNotice tone="bad">
            {state.method === "download" ? t("branchingCuttoon.transfer.exportFileFailed") : t("branchingCuttoon.transfer.exportCopyFailed")}
          </BranchingNotice>
        ) : null}
        {state.kind === "readFailed" ? (
          <BranchingNotice
            tone="bad"
            actions={
              <button
                type="button"
                onClick={() => {
                  if (lastFile.current) void readFile(lastFile.current);
                }}
                className={BC_SMALL_BUTTON}
              >
                {t("branchingCuttoon.common.retry")}
              </button>
            }
          >
            {t("branchingCuttoon.transfer.readFailed")}
          </BranchingNotice>
        ) : null}
        {state.kind === "importFailed" ? (
          <BranchingNotice tone="bad">
            <p className="font-bold">{t("branchingCuttoon.transfer.importFailed")}</p>
            <ul className="mt-1 list-disc pl-5">
              {state.errors.slice(0, SHOWN_ERRORS).map((error, index) => (
                <li key={`${error.code}-${error.path}-${index}`}>{parseErrorMessage(t, error)}</li>
              ))}
            </ul>
            {state.errors.length > SHOWN_ERRORS ? (
              <p className={cn(BC_HINT, "mt-1")}>{t("branchingCuttoon.transfer.moreErrors", { count: state.errors.length - SHOWN_ERRORS })}</p>
            ) : null}
          </BranchingNotice>
        ) : null}
      </div>
    </section>
  );
}
