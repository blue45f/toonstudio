/**
 * 필터 갤러리 대화상자 안의 결과 미리보기 창. 계산 계획과 실행 순서는 studio-filter-gallery-preview.ts 에 있다.
 *
 * 원본은 요소 src 를 문서 크기로 그린 스냅샷이다(캔버스 이미지 노드처럼 뒤집기를 먼저 굽는다). 결과는 이미지 필터 Worker 의
 * 상주 세션으로 계산해 캔버스 미리보기와 같은 필드·같은 픽셀 크기의 결과를 보인다. Worker 를 쓸 수 없는 브라우저에서는 같은
 * 세션의 direct 모드로 돌리고, direct 로 허용되지 않는 무거운 작업은 그 사실을 알린다.
 */
import { Columns2, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactElement } from "react";

import { STUDIO_FOCUS_RING } from "../../studio-panel-ui";

import { createStudioFilterGalleryPreviewScheduler } from "./studio-filter-gallery-preview";

import type { StudioFilterGalleryPreviewPlan, StudioFilterGalleryPreviewScheduler } from "./studio-filter-gallery-preview";
import type { ImageFilterFields } from "../../render/studio-konva-filter-fields";
import type { StudioImageFilterResidentWorkerSession } from "../../studio-image-filter-worker-client";
import type { StudioImageDataLike } from "../../studio-filters";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export interface StudioFilterGalleryPreviewProps {
  readonly src: string | null | undefined;
  readonly plan: StudioFilterGalleryPreviewPlan;
  readonly flipped: boolean;
  readonly flippedY: boolean;
  /** 캔버스 미리보기와 같은 필드(요소 필드 위에 초안 스택). */
  readonly fields: ImageFilterFields;
  /** 대화상자 격자 안 배치. */
  readonly className?: string;
}

type SourceState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly pixels: Uint8ClampedArray;
      readonly width: number;
      readonly height: number;
      readonly revision: number;
    };

const CHECKER_STYLE = {
  backgroundImage: "conic-gradient(from 90deg at 1px 1px, oklch(0.24 0.011 64) 25%, oklch(0.19 0.009 68) 0)",
  backgroundSize: "16px 16px",
} as const;

let nextSourceRevision = 0;

/** data:·blob: 이 아닌 다른 출처 주소는 CORS 로 받아야 픽셀을 읽을 수 있다(캔버스 필터와 같은 조건). */
function needsCors(src: string): boolean {
  if (/^(?:data|blob):/iu.test(src)) return false;
  try {
    return new URL(src, globalThis.location?.href).origin !== globalThis.location?.origin;
  } catch {
    return false;
  }
}

function paintPixels(canvas: HTMLCanvasElement | null, pixels: StudioImageDataLike): boolean {
  if (!canvas) return false;
  if (canvas.width !== pixels.width) canvas.width = pixels.width;
  if (canvas.height !== pixels.height) canvas.height = pixels.height;
  const context = canvas.getContext("2d");
  if (!context) return false;
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
  return true;
}

function errorText(error: unknown): string {
  const name = typeof error === "object" && error !== null ? (error as { readonly name?: unknown }).name : undefined;
  if (typeof name === "string" && /WorkerRequired/u.test(name)) {
    return "이 브라우저에서는 이 작업량을 대화상자 안에서 계산할 수 없어요. 캔버스 미리보기로 확인하세요.";
  }
  return "미리보기를 계산하지 못했어요. 캔버스 미리보기로 확인하세요.";
}

export function StudioFilterGalleryPreview({ src, plan, flipped, flippedY, fields, className }: StudioFilterGalleryPreviewProps): ReactElement {
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const schedulerRef = useRef<StudioFilterGalleryPreviewScheduler<ImageFilterFields> | null>(null);
  const fieldsRef = useRef(fields);
  const [source, setSource] = useState<SourceState>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [actualSize, setActualSize] = useState(false);
  const width = plan.kind === "ready" ? plan.width : 0;
  const height = plan.kind === "ready" ? plan.height : 0;

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  // 원본 스냅샷: src·문서 크기·뒤집기가 바뀔 때만 다시 만든다.
  useEffect(() => {
    if (!src || width === 0 || height === 0) {
      setSource({ status: "idle" });
      return;
    }
    let cancelled = false;
    setSource({ status: "loading" });
    const image = new Image();
    image.decoding = "async";
    if (needsCors(src)) image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      const canvas = sourceCanvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) {
        setSource({ status: "error", message: "이 브라우저에서는 미리보기를 그릴 수 없어요." });
        return;
      }
      try {
        canvas.width = width;
        canvas.height = height;
        context.save();
        context.translate(flipped ? width : 0, flippedY ? height : 0);
        context.scale(flipped ? -1 : 1, flippedY ? -1 : 1);
        context.drawImage(image, 0, 0, width, height);
        context.restore();
        const pixels = context.getImageData(0, 0, width, height).data;
        // 첫 결과가 오기 전에는 원본을 보인다.
        paintPixels(resultCanvasRef.current, { data: pixels, width, height });
        nextSourceRevision += 1;
        setSource({ status: "ready", pixels, width, height, revision: nextSourceRevision });
      } catch {
        setSource({ status: "error", message: "원본 픽셀을 읽지 못했어요(이미지 출처 제한). 캔버스 미리보기로 확인하세요." });
      }
    };
    image.onerror = () => {
      if (!cancelled) setSource({ status: "error", message: "원본 이미지를 불러오지 못했어요. 캔버스 미리보기로 확인하세요." });
    };
    image.src = src;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [src, width, height, flipped, flippedY]);

  // 원본이 준비되면 상주 세션과 실행 순서를 만든다. 원본이 바뀌면 둘 다 새로 만든다.
  useEffect(() => {
    if (source.status !== "ready") return;
    let session: StudioImageFilterResidentWorkerSession | null = null;
    let disposed = false;
    const request = { data: source.pixels, width: source.width, height: source.height };
    const scheduler = createStudioFilterGalleryPreviewScheduler<ImageFilterFields, StudioImageDataLike>({
      run: async (el, signal) => {
        const client = await import("../../studio-image-filter-worker-client");
        if (disposed) throw Object.assign(new Error("disposed"), { name: "AbortError" });
        session ??= client.createStudioImageFilterResidentWorkerSession({
          executionMode: typeof Worker === "function" ? "worker" : "direct",
        });
        const result = await session.run({ imageData: request, el }, { signal, sourceRevision: source.revision });
        return result.imageData;
      },
      onResult: (imageData) => {
        setRunError(null);
        paintPixels(resultCanvasRef.current, imageData);
      },
      onError: (error) => setRunError(errorText(error)),
      onBusyChange: setBusy,
    });
    schedulerRef.current = scheduler;
    scheduler.request(fieldsRef.current);
    return () => {
      disposed = true;
      schedulerRef.current = null;
      scheduler.dispose();
      session?.dispose();
      setBusy(false);
    };
  }, [source]);

  useEffect(() => {
    schedulerRef.current?.request(fields);
  }, [fields]);

  const status = (() => {
    if (plan.kind === "unsized") return "이 대상은 미리볼 크기를 알 수 없어요. 캔버스 미리보기로 확인하세요.";
    if (plan.kind === "too-large") {
      return `이미지가 커서(${plan.width}×${plan.height}px) 캔버스처럼 필터를 계산하지 않아요.`;
    }
    if (!src) return "미리볼 원본이 없어요. 캔버스 미리보기로 확인하세요.";
    if (source.status === "error") return source.message;
    if (source.status === "loading" || source.status === "idle") return "원본을 불러오는 중…";
    if (runError) return runError;
    const size = `${plan.width}×${plan.height}px`;
    if (plan.stackSkipped) return `작업량 상한을 넘어 효과 스택이 빠진 결과예요(캔버스와 같음) · ${size}`;
    return busy ? `계산 중… · ${size}` : `${compare ? "원본" : "결과"} · ${size}`;
  })();
  const showCanvas = plan.kind === "ready" && Boolean(src) && source.status !== "error";

  return (
    <section aria-label="결과 미리보기" className={cn("flex min-h-0 flex-col gap-2 border-b border-line p-3 lg:border-b-0 lg:border-r", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-fg">결과 미리보기</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-pressed={compare}
            disabled={!showCanvas}
            onClick={() => setCompare((current) => !current)}
            className={buttonClass({ variant: "ghost", className: "min-h-9 gap-1 px-2 text-[0.7rem]" })}
          >
            <Columns2 size={13} aria-hidden /> 원본 비교
          </button>
          <button
            type="button"
            aria-pressed={actualSize}
            disabled={!showCanvas}
            onClick={() => setActualSize((current) => !current)}
            className={buttonClass({ variant: "ghost", className: "min-h-9 gap-1 px-2 text-[0.7rem]" })}
          >
            {actualSize ? <Minimize2 size={13} aria-hidden /> : <Maximize2 size={13} aria-hidden />} 실제 크기
          </button>
        </div>
      </div>
      <div
        data-gallery-preview-surface="true"
        className={cn(
          "relative min-h-0 flex-1 rounded-xl border border-line",
          actualSize ? "overflow-auto overscroll-contain [scrollbar-width:thin]" : "overflow-hidden",
          STUDIO_FOCUS_RING,
        )}
        style={CHECKER_STYLE}
        tabIndex={actualSize && showCanvas ? 0 : -1}
        aria-label={actualSize ? "실제 크기 미리보기(스크롤해 살펴보기)" : undefined}
        role={actualSize ? "region" : undefined}
      >
        {[resultCanvasRef, sourceCanvasRef].map((ref, index) => {
          const isSource = index === 1;
          const visible = showCanvas && compare === isSource;
          return (
            <canvas
              key={isSource ? "source" : "result"}
              ref={ref}
              role="img"
              aria-label={isSource ? "원본" : "효과를 적용한 결과"}
              aria-hidden={visible ? undefined : true}
              className={cn(
                // 맞춤은 창을 꽉 채운 캔버스 안에서 비율을 지켜 줄인다(격자 칸 높이는 % 기준이 되지 못해 절대 배치한다).
                actualSize ? "block max-w-none" : "absolute inset-0 h-full w-full object-contain",
                !visible && "hidden",
              )}
            />
          );
        })}
      </div>
      <p aria-live="polite" className="min-h-4 text-[0.62rem] leading-snug text-fg-3">{status}</p>
    </section>
  );
}
