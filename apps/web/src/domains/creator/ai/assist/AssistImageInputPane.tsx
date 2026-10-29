import "@/shared/ai/assist/ai-assist-i18n";

import { Image as ImageIcon, LoaderCircle, PanelTop } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { ASSIST_BUTTON, ASSIST_INPUT, ASSIST_QUIET_BUTTON } from "@/shared/ai/assist/assist-ui";
import { useT } from "@/shared/lib/i18n";

import { describeArtDirectorCoverage } from "./assist-art-director";
import { readClipboardImage, type ArtDirectorImageErrorCode, type ArtDirectorRenderedSegment } from "./assist-art-director-image";
import { getStudioCanvasCapture, useStudioCanvasCaptureAvailable } from "./assist-canvas-capture-registry";
import { canvasToImageFile } from "./assist-canvas-image";
import { pickDroppedFile } from "./assist-image-files";
import { AssistArtDirectorDropzone } from "./AssistArtDirectorDropzone";

import type { ArtDirectorImageController } from "./use-art-director-image";

const IMAGE_ERROR_KEY: Readonly<Record<ArtDirectorImageErrorCode, string>> = {
  "invalid-type": "aiAssist.art.invalidFile",
  "too-large": "aiAssist.art.tooLarge",
  "too-many-pixels": "aiAssist.art.tooManyPixels",
  unreadable: "aiAssist.art.unreadable",
};

const CLIPBOARD_MESSAGE_KEY = {
  unsupported: "aiAssist.art.clipboardUnsupported",
  denied: "aiAssist.art.clipboardDenied",
  empty: "aiAssist.art.clipboardEmpty",
} as const;

const ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";

export interface AssistImageInputPaneProps {
  readonly image: ArtDirectorImageController;
  /** 요청이 진행 중이면 이미지를 바꾸거나 지울 수 없다. */
  readonly running: boolean;
  /** 보낼 이미지(구간)를 그리는 방법. 기능마다 다르다(오버레이가 있는 미리보기, 단순 미리보기). */
  readonly renderPreview: (rendered: ArtDirectorRenderedSegment) => ReactNode;
  readonly belowPreview?: ReactNode;
}

/**
 * 이미지 입력 구역: 올리기(선택·끌어놓기·클립보드 버튼, 스튜디오 안에서는 캔버스에서 가져오기) → 보낼 이미지 미리보기(원본·전송 크기) → 바꾸기·지우기 →
 * 긴 이미지의 구간 고르기. 오류와 클립보드 안내를 한곳에서 알려 줘서 이미지를 받는 모든 AI 보조가 같은 경험을 준다.
 */
export function AssistImageInputPane({ image, running, renderPreview, belowPreview }: AssistImageInputPaneProps) {
  const t = useT();
  const idBase = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const hadImage = useRef(false);
  const [clipboardNote, setClipboardNote] = useState<string | null>(null);
  const canCaptureCanvas = useStudioCanvasCaptureAvailable();
  const [capturing, setCapturing] = useState(false);
  const { rendered, source, segmentIndex } = image;
  const segmentCount = source?.segments.length ?? 0;
  const coverage = source ? describeArtDirectorCoverage(source.height, source.segments) : null;

  // 이미지를 지우면 올리기 구역이 다시 나타난다. 지우기 버튼이 사라지며 포커스가 body로 떨어지지 않게 올리기 버튼으로 옮긴다.
  const hasImage = Boolean(rendered);
  useEffect(() => {
    if (hadImage.current && !hasImage) dropzoneRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus({ preventScroll: true });
    hadImage.current = hasImage;
  }, [hasImage]);

  const loadFile = (file: File | null) => {
    setClipboardNote(null);
    if (file) void image.load(file);
  };
  const pasteFromClipboard = async () => {
    setClipboardNote(null);
    const outcome = await readClipboardImage();
    if (outcome.ok) loadFile(outcome.file);
    else setClipboardNote(t(CLIPBOARD_MESSAGE_KEY[outcome.reason]));
  };
  const pick = () => fileInputRef.current?.click();
  // 스튜디오가 켜져 있으면 지금 보고 있는 페이지를 이 브라우저 안에서 그림으로 만들어 올린 파일과 같은 관문으로 보낸다. 전송은 실행 때만 일어난다.
  const fromCanvas = async () => {
    const capture = getStudioCanvasCapture();
    if (!capture) return;
    setClipboardNote(t("aiAssist.art.fromCanvasBusy"));
    setCapturing(true);
    try {
      const canvas = await capture();
      if (!canvas) throw new Error("no-canvas");
      loadFile(await canvasToImageFile(canvas));
    } catch {
      setClipboardNote(t("aiAssist.art.fromCanvasFailed"));
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="min-w-0 space-y-3">
      {rendered ? (
        <>
          {renderPreview(rendered)}
          <p className="text-xs text-fg-3">
            {t("aiAssist.art.sourceInfo", { width: source?.width ?? 0, height: source?.height ?? 0 })}
            {" · "}
            {t("aiAssist.art.sentInfo", {
              width: rendered.input.width,
              height: rendered.input.height,
              size: Math.max(1, Math.round(rendered.bytes / 1024)),
            })}
          </p>
          {belowPreview}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ASSIST_BUTTON} disabled={running || capturing} onClick={pick}>
              <ImageIcon size={16} aria-hidden />
              {t("aiAssist.art.replace")}
            </button>
            {canCaptureCanvas ? (
              <button type="button" className={ASSIST_BUTTON} disabled={running || capturing || image.preparing} onClick={() => void fromCanvas()}>
                {capturing ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <PanelTop size={16} aria-hidden />}
                {t("aiAssist.art.fromCanvas")}
              </button>
            ) : null}
            <button type="button" className={ASSIST_QUIET_BUTTON} disabled={running} onClick={image.clear}>
              {t("aiAssist.art.remove")}
            </button>
          </div>
          {segmentCount > 1 ? (
            <div>
              <label htmlFor={`${idBase}-segment`} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.art.segmentLabel")}</label>
              <select
                id={`${idBase}-segment`}
                className={ASSIST_INPUT}
                value={segmentIndex}
                disabled={running || image.preparing}
                onChange={(event) => void image.select(Number(event.target.value))}
              >
                {source?.segments.map((segment) => (
                  <option key={segment.index} value={segment.index}>
                    {t("aiAssist.art.segmentOption", { index: segment.index + 1, total: segmentCount })}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-fg-3">{t("aiAssist.art.segmentHint")}</p>
            </div>
          ) : null}
          {coverage?.truncated ? (
            <p role="note" className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-fg-2" data-claude-coverage="true">
              {t("aiAssist.art.coverageTruncated", { total: coverage.totalHeight, covered: coverage.coveredHeight, percent: coverage.percent })}
            </p>
          ) : null}
        </>
      ) : (
        <div ref={dropzoneRef}>
          <AssistArtDirectorDropzone
            preparing={image.preparing}
            onPick={pick}
            onPasteFromClipboard={() => void pasteFromClipboard()}
            onDropFiles={(files) => { if (!running) loadFile(pickDroppedFile(files)); }}
            onFromCanvas={canCaptureCanvas ? () => void fromCanvas() : undefined}
            capturing={capturing}
          />
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          loadFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      {image.errorCode ? (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{t(IMAGE_ERROR_KEY[image.errorCode])}</p>
      ) : null}
      {clipboardNote ? <p role="status" className="rounded-xl border border-line bg-raised px-3 py-2 text-xs text-fg-2">{clipboardNote}</p> : null}
    </div>
  );
}
