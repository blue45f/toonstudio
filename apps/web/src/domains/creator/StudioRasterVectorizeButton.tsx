import { Copy, ScanLine, Shapes } from "lucide-react";
import { useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import type { DrawEl, El } from "./studio-element-model";
import {
  STUDIO_IMAGE_TRACE_PRESETS,
  traceStudioRasterImage,
  type StudioImageTracePresetId,
} from "./studio-image-trace";
import { vectorizeStudioRasterImage } from "./studio-raster-vectorize-product";

type StudioVectorizableImage = Extract<El, { type: "image" }>;

export function StudioRasterVectorizeButton({
  src,
  image,
  disabled = false,
  onInsert,
}: {
  readonly src: string;
  readonly image: StudioVectorizableImage;
  readonly disabled?: boolean;
  readonly onInsert: (elements: readonly DrawEl[]) => boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [tracePreset, setTracePreset] = useState<StudioImageTracePresetId>("logo");
  const [tracedSvg, setTracedSvg] = useState<string | null>(null);

  const runVectorize = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setStatus("외곽선을 분석하는 중…");
    try {
      const result = await vectorizeStudioRasterImage(src, image);
      if (!onInsert(result.elements)) throw new Error("벡터 레이어를 현재 문서에 추가하지 못했습니다.");
      setStatus(`벡터 외곽선 ${result.elements.length}개를 새 레이어로 추가했습니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "이미지를 벡터로 변환하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const runTrace = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setTracedSvg(null);
    setStatus("이미지를 채움 패스로 트레이싱하는 중…");
    try {
      const result = await traceStudioRasterImage(src, image, tracePreset);
      if (!onInsert(result.elements)) throw new Error("트레이싱 결과를 현재 문서에 추가하지 못했습니다.");
      setTracedSvg(result.svg);
      setStatus(
        `트레이싱 완료 — 색상 ${result.layerCount}개, 채움 조각 ${result.pieceCount}개를 새 레이어로 추가했습니다.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "이미지를 트레이싱하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const copySvg = async () => {
    if (!tracedSvg) return;
    try {
      await navigator.clipboard.writeText(tracedSvg);
      setStatus("트레이싱 SVG를 클립보드에 복사했습니다.");
    } catch {
      setStatus("클립보드 복사가 막혀 있어요. 브라우저 권한을 확인해 주세요.");
    }
  };

  const activePreset = STUDIO_IMAGE_TRACE_PRESETS.find((preset) => preset.id === tracePreset);

  return (
    <div className="rounded-lg border border-line bg-card/50 p-2">
      <button type="button" disabled={busy || disabled} onClick={() => void runVectorize()} className={buttonClass({ variant: "outline", size: "sm", className: "w-full gap-2" })}>
        <ScanLine size={14} aria-hidden="true" />
        {busy ? "벡터화 중…" : "이미지를 벡터 외곽선으로 변환"}
      </button>

      <div className="mt-2 border-t border-line/60 pt-2">
        <div className="flex gap-1" role="group" aria-label="트레이싱 프리셋">
          {STUDIO_IMAGE_TRACE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={busy || disabled}
              aria-pressed={tracePreset === preset.id}
              onClick={() => setTracePreset(preset.id)}
              className={cn(
                "flex-1 rounded-md border px-1.5 py-1 text-[0.64rem] font-medium",
                tracePreset === preset.id
                  ? "border-fg/40 bg-fg/10 text-fg"
                  : "border-line bg-transparent text-fg-3 hover:text-fg",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {activePreset ? (
          <p className="mt-1.5 text-[0.62rem] leading-relaxed text-fg-3">{activePreset.description}</p>
        ) : null}
        <button type="button" disabled={busy || disabled} onClick={() => void runTrace()} className={buttonClass({ variant: "outline", size: "sm", className: "mt-1.5 w-full gap-2" })}>
          <Shapes size={14} aria-hidden="true" />
          {busy ? "트레이싱 중…" : "이미지를 채움 벡터로 트레이싱"}
        </button>
        {tracedSvg ? (
          <button type="button" disabled={busy || disabled} onClick={() => void copySvg()} className={buttonClass({ variant: "ghost", size: "sm", className: "mt-1 w-full gap-2" })}>
            <Copy size={12} aria-hidden="true" />
            트레이싱 SVG 복사
          </button>
        ) : null}
      </div>

      {status ? <p role="status" className="mt-2 text-[0.64rem] leading-relaxed text-fg-3">{status}</p> : null}
    </div>
  );
}
