/**
 * 각도 칸 하나 — 미리보기, 상태, 파일 고르기·바꾸기·비우기·다시 읽기·원본 내려받기.
 *
 * 칸 전체가 끌어다 놓는 곳이고, 같은 일을 하는 버튼이 따로 있다(키보드·스크린리더). 상태 글자는 색에만 기대지 않고
 * 글로 쓴다. 읽기 오류는 이유와 다음 행동을 함께 보여 준다.
 */
import { Download, ImageOff, RotateCw, Trash2 } from "lucide-react";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  ANGLE_NAME_KEYS,
  SLOT_STATUS_KEYS,
  captureErrorCopy,
  formatFileSize,
  resolveCopy,
} from "../anchor-lab-copy";
import { anchorAngleSpec, type AnchorAngleId } from "../anchor-capture-spec";
import type { AnchorCapturedFrame, AnchorSlotState } from "../anchor-capture-session";
import { ANCHOR_IMAGE_ACCEPT } from "./AnchorDropZone";

export interface AnchorSlotCardProps {
  readonly angleId: AnchorAngleId;
  readonly slot: AnchorSlotState;
  readonly frame: AnchorCapturedFrame | undefined;
  readonly previewUrl: string | undefined;
  /** 파일을 받을 수 있는지(권리 확인 전이거나 읽는 중이면 false). */
  readonly acceptsFiles: boolean;
  readonly onAssign: (file: File) => void;
  readonly onClear: () => void;
  readonly onRetry: () => void;
  readonly onDownload: () => void;
}

const STATUS_TONE: Readonly<Record<AnchorSlotState["status"], string>> = {
  idle: "border-line text-fg-3",
  queued: "border-line text-fg-2",
  capturing: "border-accent/50 text-accent",
  done: "border-good/40 text-good",
  failed: "border-bad/40 text-bad",
  cancelled: "border-warn/40 text-warn",
};

export function AnchorSlotCard({
  angleId,
  slot,
  frame,
  previewUrl,
  acceptsFiles,
  onAssign,
  onClear,
  onRetry,
  onDownload,
}: AnchorSlotCardProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const angle = t(ANGLE_NAME_KEYS[angleId]);
  const spec = anchorAngleSpec(angleId);
  const filled = slot.status === "done" && frame !== undefined;
  const failed = slot.status === "failed" || slot.status === "cancelled";

  const handleDrop = (event: DragEvent<HTMLLIElement>): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && acceptsFiles) onAssign(file);
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onAssign(file);
  };

  return (
    <li
      data-anchor-slot={angleId}
      className={cn("flex flex-col gap-3 rounded-2xl border border-line bg-card p-3", dragging && "border-accent bg-accent-soft")}
      onDragOver={(event) => {
        event.preventDefault();
        if (acceptsFiles) setDragging(true);
      }}
      onDragLeave={() => { setDragging(false); }}
      onDrop={handleDrop}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-fg">{angle}</h3>
          <p className="text-xs text-fg-3">{t("anchorLab.angle.degrees", { degrees: spec.azimuthDeg })}</p>
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_TONE[slot.status])}>
          {t(SLOT_STATUS_KEYS[slot.status])}
        </span>
      </div>

      <div className="grid aspect-[2/3] place-items-center overflow-hidden rounded-xl bg-panel">
        {filled && previewUrl ? (
          <img src={previewUrl} alt={t("anchorLab.slot.previewAlt", { angle })} className="h-full w-full object-contain" draggable={false} />
        ) : slot.status === "capturing" || slot.status === "queued" ? (
          <div aria-hidden="true" className="h-full w-full animate-pulse bg-raised motion-reduce:animate-none" />
        ) : (
          <span className="grid place-items-center gap-1 px-2 text-center text-fg-3">
            <ImageOff size={26} aria-hidden="true" />
            <span className="text-xs">{t("anchorLab.slot.dropHint")}</span>
          </span>
        )}
      </div>

      {filled ? (
        <p className="text-xs text-fg-3">
          {t("anchorLab.slot.meta", { width: frame.width, height: frame.height, size: formatFileSize(frame.byteLength) })}
        </p>
      ) : null}
      {failed && slot.errorCode ? (
        <p
          role={slot.status === "failed" ? "alert" : "status"}
          className={cn("rounded-xl border px-3 py-2 text-sm text-fg", slot.status === "failed" ? "border-bad/40 bg-bad/10" : "border-warn/40 bg-warn/10")}
        >
          {resolveCopy(t, captureErrorCopy(slot.errorCode, slot.errorParams))}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!acceptsFiles}
          onClick={() => inputRef.current?.click()}
          className={buttonClass({ variant: filled ? "outline" : "solid", size: "sm" })}
        >
          {filled ? t("anchorLab.slot.replace") : t("anchorLab.slot.choose")}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ANCHOR_IMAGE_ACCEPT}
          disabled={!acceptsFiles}
          tabIndex={-1}
          className="hidden"
          aria-label={t("anchorLab.slot.inputLabel", { angle })}
          onChange={handleChange}
        />
        {failed ? (
          <button
            type="button"
            disabled={!acceptsFiles}
            aria-label={t("anchorLab.slot.retryLabel", { angle })}
            onClick={onRetry}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            <RotateCw size={14} aria-hidden="true" />
            {t("anchorLab.slot.retry")}
          </button>
        ) : null}
        {filled ? (
          <button
            type="button"
            aria-label={t("anchorLab.slot.downloadLabel", { angle })}
            onClick={onDownload}
            className={buttonClass({ variant: "ghost", size: "sm" })}
          >
            <Download size={14} aria-hidden="true" />
            {t("anchorLab.slot.download")}
          </button>
        ) : null}
        {filled || failed ? (
          <button
            type="button"
            disabled={!acceptsFiles}
            aria-label={t("anchorLab.slot.clearLabel", { angle })}
            onClick={onClear}
            className={buttonClass({ variant: "ghost", size: "sm" })}
          >
            <Trash2 size={14} aria-hidden="true" />
            {t("anchorLab.slot.clear")}
          </button>
        ) : null}
      </div>
    </li>
  );
}
