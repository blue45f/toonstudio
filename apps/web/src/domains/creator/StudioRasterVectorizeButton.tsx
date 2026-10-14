import { Copy, PenTool, ScanLine, Shapes } from "lucide-react";
import { useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import type { DrawEl, El } from "./studio-element-model";
import {
  STUDIO_IMAGE_TRACE_PRESETS,
  type StudioImageTracePresetId,
} from "./studio-image-trace";
import { vectorizeStudioRasterImage } from "./studio-raster-vectorize-product";
import type { VectorLayer } from "./vector-layer/vector-layer-model";

type StudioVectorizableImage = Extract<El, { type: "image" }>;

export function StudioRasterVectorizeButton({
  src,
  image,
  disabled = false,
  onInsert,
  onInsertVectorLayer,
}: {
  readonly src: string;
  readonly image: StudioVectorizableImage;
  readonly disabled?: boolean;
  readonly onInsert: (elements: readonly DrawEl[]) => boolean;
  /**
   * 지정하면 "벡터 레이어로 변환" 동작이 함께 나타난다. 트레이싱 결과를
   * DrawEl 이 아니라 vector-layer 도메인의 VectorLayer 로 받는 삽입구 —
   * 벡터 레이어 상태의 소유자가 있을 때만 연결한다(미지정 시 기존 동작과 동일).
   */
  readonly onInsertVectorLayer?: (layer: VectorLayer) => boolean;
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
      // 픽셀 연산(명도 격자·레이어 분리)은 Worker 에서 돈다. Worker 를 쓸 수 없는
      // 환경에서는 오케스트레이터가 direct 로 폴백한다.
      const { traceStudioRasterImageViaWorker } = await import("./studio-image-trace-browser");
      const result = await traceStudioRasterImageViaWorker(src, image, tracePreset);
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

  const runTraceToVectorLayer = async () => {
    if (busy || disabled || !onInsertVectorLayer) return;
    setBusy(true);
    setTracedSvg(null);
    setStatus("이미지를 벡터 레이어로 변환하는 중…");
    try {
      const { traceStudioRasterImageViaWorker } = await import("./studio-image-trace-browser");
      const { traceResultToVectorLayer } = await import("./studio-image-trace-vector-layer");
      const result = await traceStudioRasterImageViaWorker(src, image, tracePreset);
      const conversion = traceResultToVectorLayer(result, {
        id: `traced-vector-${image.id}-${Date.now().toString(36)}`,
      });
      if (conversion.convertedCount === 0) {
        throw new Error("벡터 레이어로 만들 뚜렷한 윤곽을 찾지 못했어요. 대비가 더 높은 원본으로 다시 시도해 주세요.");
      }
      if (!onInsertVectorLayer(conversion.layer)) throw new Error("벡터 레이어를 현재 문서에 추가하지 못했습니다.");
      setTracedSvg(result.svg);
      setStatus(
        `벡터 레이어로 변환 완료 — 편집 가능한 윤곽 ${conversion.convertedCount}개를 벡터 레이어로 추가했습니다.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "이미지를 벡터 레이어로 변환하지 못했습니다.");
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
        {onInsertVectorLayer ? (
          <button type="button" disabled={busy || disabled} onClick={() => void runTraceToVectorLayer()} className={buttonClass({ variant: "outline", size: "sm", className: "mt-1.5 w-full gap-2" })}>
            <PenTool size={14} aria-hidden="true" />
            {busy ? "변환 중…" : "벡터 레이어로 변환해 편집"}
          </button>
        ) : null}
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
