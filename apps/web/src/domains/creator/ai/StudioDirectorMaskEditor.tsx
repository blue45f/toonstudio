import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export function StudioDirectorMaskEditor({
  source,
  onChange,
}: {
  readonly source: string;
  readonly onChange: (maskDataUrl: string) => void;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [brush, setBrush] = useState(48);

  const emit = () => {
    const canvas = canvasRef.current;
    if (canvas?.width && canvas.height) onChange(canvas.toDataURL("image/png"));
  };

  const configure = () => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas || !image.naturalWidth || !image.naturalHeight) return;
    if (canvas.width !== image.naturalWidth || canvas.height !== image.naturalHeight) {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      emit();
    }
  };

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * canvas.width,
      y: (event.clientY - rect.top) / rect.height * canvas.height,
    };
  };

  const stroke = (canvas: HTMLCanvasElement, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const context = canvas.getContext("2d");
    if (!context) return;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.strokeStyle = "white";
    context.fillStyle = "white";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = brush;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  };

  const fillPreset = (preset: "center" | "lower" | "all" | "clear") => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (preset !== "clear") {
      context.fillStyle = "white";
      if (preset === "all") context.fillRect(0, 0, canvas.width, canvas.height);
      else if (preset === "center") {
        context.beginPath();
        context.ellipse(canvas.width / 2, canvas.height / 2, canvas.width * 0.2, canvas.height * 0.28, 0, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(0, canvas.height * 0.52, canvas.width, canvas.height * 0.48);
      }
    }
    emit();
  };

  return (
    <div className="space-y-2">
      <div className="relative mx-auto aspect-video max-h-72 overflow-hidden rounded-xl border border-line bg-canvas">
        <img
          ref={imageRef}
          src={source}
          alt={translateCurrentStaticSourceText("domains.creator.ai.StudioAiComicDirectorPanel", "ko", "수리 마스크를 그릴 현재 후보")}
          onLoad={configure}
          className="absolute inset-0 size-full object-contain"
        />
        <canvas
          ref={canvasRef}
          aria-label={translateCurrentStaticSourceText("domains.creator.ai.StudioAiComicDirectorPanel", "ko", "수리하거나 전경으로 분리할 영역을 칠하는 마스크")}
          onPointerDown={(event) => {
            drawingRef.current = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            const next = point(event);
            lastRef.current = next;
            stroke(event.currentTarget, next, next);
          }}
          onPointerMove={(event) => {
            if (!drawingRef.current || !lastRef.current) return;
            const next = point(event);
            stroke(event.currentTarget, lastRef.current, next);
            lastRef.current = next;
          }}
          onPointerUp={(event) => {
            drawingRef.current = false;
            lastRef.current = null;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            emit();
          }}
          onPointerCancel={() => {
            drawingRef.current = false;
            lastRef.current = null;
          }}
          className={cn(
            "absolute inset-0 size-full touch-none cursor-crosshair opacity-55",
            STUDIO_FOCUS_RING,
          )}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="text-[0.67rem] font-semibold text-fg-2">
          {translateCurrentStaticSourceText("domains.creator.ai.StudioAiComicDirectorPanel", "ko", "브러시")}<input
            type="range"
            min={12}
            max={180}
            value={brush}
            onChange={(event) => setBrush(Number(event.target.value))}
            className="ml-2 align-middle accent-accent"
          />
        </label>
        <button type="button" onClick={() => fillPreset("center")} className="min-h-11 rounded-lg border border-line bg-card px-2 text-[0.65rem] text-fg-2 hover:bg-raised">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiComicDirectorPanel", "ko", "가운데 선택")}</button>
        <button type="button" onClick={() => fillPreset("lower")} className="min-h-11 rounded-lg border border-line bg-card px-2 text-[0.65rem] text-fg-2 hover:bg-raised">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiComicDirectorPanel", "ko", "아래쪽 선택")}</button>
        <button type="button" onClick={() => fillPreset("all")} className="min-h-11 rounded-lg border border-line bg-card px-2 text-[0.65rem] text-fg-2 hover:bg-raised">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiComicDirectorPanel", "ko", "전체 선택")}</button>
        <button type="button" onClick={() => fillPreset("clear")} className="min-h-11 rounded-lg border border-line bg-card px-2 text-[0.65rem] text-fg-2 hover:bg-raised">{translateCurrentStaticSourceText("domains.creator.ai.StudioAiComicDirectorPanel", "ko", "마스크 지우기")}</button>
      </div>
    </div>
  );
}
