/**
 * 이미지 놓는 곳 — 끌어다 놓기와 "파일 고르기" 버튼을 한 컴포넌트로 묶는다.
 *
 * 키보드·스크린리더 사용자는 끌어다 놓기 대신 버튼으로 같은 일을 한다. 숨은 파일 입력에는 접근 가능한 이름을 달고,
 * 같은 파일을 연달아 고를 수 있게 선택 뒤 값을 비운다. 비활성일 때는 이유를 `reason` 으로 화면에 보여 준다.
 */
import { ImagePlus } from "lucide-react";
import { useId, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export const ANCHOR_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";

export interface AnchorDropZoneProps {
  readonly disabled: boolean;
  /** 비활성일 때 이유(화면에 보인다). */
  readonly reason?: string;
  readonly multiple?: boolean;
  readonly inputLabel: string;
  readonly chooseLabel: string;
  readonly zoneLabel: string;
  readonly hint?: string;
  readonly onFiles: (files: readonly File[]) => void;
  readonly className?: string;
  readonly children?: ReactNode;
}

export function AnchorDropZone({
  disabled,
  reason,
  multiple = false,
  inputLabel,
  chooseLabel,
  zoneLabel,
  hint,
  onFiles,
  className,
  children,
}: AnchorDropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const reasonId = useId();

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) onFiles(files);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => { setDragging(false); }}
      onDrop={handleDrop}
      className={cn(
        "rounded-2xl border border-dashed border-line-strong bg-card p-4 transition-colors",
        dragging && "border-accent bg-accent-soft",
        disabled && "opacity-70",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <ImagePlus size={20} />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-semibold text-fg">{zoneLabel}</p>
          {hint ? <p className="text-sm text-fg-3">{hint}</p> : null}
        </div>
        <button
          type="button"
          disabled={disabled}
          aria-describedby={disabled && reason ? reasonId : undefined}
          onClick={() => inputRef.current?.click()}
          className={buttonClass({ variant: "solid", size: "md" })}
        >
          {chooseLabel}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ANCHOR_IMAGE_ACCEPT}
          multiple={multiple}
          disabled={disabled}
          tabIndex={-1}
          className="hidden"
          aria-label={inputLabel}
          onChange={handleChange}
        />
      </div>
      {disabled && reason ? (
        <p id={reasonId} className="mt-3 text-sm text-fg-2">
          {reason}
        </p>
      ) : null}
      {children}
    </div>
  );
}
