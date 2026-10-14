/**
 * 사진 → 선화 배경 변환 (사진 LT) 패널.
 *
 * 배경 패널의 채우기 탭에 앉는 표면이다. 사진 1장을 고르면 기존 LT 엔진
 * (`convertStudioLtImage`)으로 선화+톤을 뽑아 합성 미리보기를 보여주고,
 * "선화 배경으로 배치"를 누르면 캔버스 배치 페이로드를 `onPlace`로
 * 한 번 전달한다. 실제 문서 커밋은 호스트(StudioPage 권한 영역)가
 * 페이로드의 src·좌표로 배경 레이어를 만드는 몫이다.
 *
 * 원본 사진 파일은 바꾸지 않고, 변환은 전부 기기 안에서 일어난다.
 */
import { ImagePlus, Layers, Loader2 } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  convertStudioLtImage,
  type StudioLtConvertResult,
} from "./studio-lt-convert";
import { decodeStudioLtSourceFile } from "./studio-lt-convert-source";
import {
  buildStudioPhotoLtBackgroundPlacement,
  resolveStudioPhotoLtBackgroundPreset,
  STUDIO_PHOTO_LT_BACKGROUND_DEFAULT_PRESET_ID,
  STUDIO_PHOTO_LT_BACKGROUND_PRESETS,
  type StudioPhotoLtBackgroundFit,
  type StudioPhotoLtBackgroundPlacement,
  type StudioPhotoLtBackgroundPresetId,
} from "./studio-photo-lt-background";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export type { StudioPhotoLtBackgroundPlacement } from "./studio-photo-lt-background";

type PanelStatus = "empty" | "decoding" | "ready" | "error";

export interface StudioPhotoLtBackgroundPanelProps {
  readonly canvasW: number;
  readonly canvasH: number;
  /** 선화 배경 배치를 호스트 문서에 커밋한다. */
  readonly onPlace: (placement: StudioPhotoLtBackgroundPlacement) => void;
  /** 테스트 seam. 기본값은 LT 소스 디코더(긴 변 2048px로 축소). */
  readonly decodeFile?: (file: File) => Promise<ImageData>;
  /** 테스트 seam. 기본값은 캔버스 PNG 직렬화. */
  readonly serializeImageData?: (imageData: ImageData) => string;
  readonly className?: string;
}

function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function defaultSerializeImageData(imageData: ImageData): string {
  const canvas = imageDataToCanvas(imageData);
  if (!canvas) throw new Error("이미지를 만들 캔버스가 없습니다.");
  return canvas.toDataURL("image/png");
}

export function StudioPhotoLtBackgroundPanel({
  canvasW,
  canvasH,
  onPlace,
  decodeFile = decodeStudioLtSourceFile,
  serializeImageData = defaultSerializeImageData,
  className,
}: StudioPhotoLtBackgroundPanelProps): ReactElement {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const mountedRef = useRef(true);

  const [status, setStatus] = useState<PanelStatus>("empty");
  const [source, setSource] = useState<ImageData | null>(null);
  const [sourceName, setSourceName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<StudioPhotoLtBackgroundPresetId>(
    STUDIO_PHOTO_LT_BACKGROUND_DEFAULT_PRESET_ID,
  );
  const [includeTone, setIncludeTone] = useState<boolean>(
    resolveStudioPhotoLtBackgroundPreset(
      STUDIO_PHOTO_LT_BACKGROUND_DEFAULT_PRESET_ID,
    ).includeTone,
  );
  const [fit, setFit] = useState<StudioPhotoLtBackgroundFit>("cover");
  const [placedSummary, setPlacedSummary] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const outcome = useMemo((): {
    result: StudioLtConvertResult | null;
    error: string | null;
  } => {
    if (!source) return { result: null, error: null };
    try {
      const preset = resolveStudioPhotoLtBackgroundPreset(presetId);
      return { result: convertStudioLtImage(source, preset.options), error: null };
    } catch (cause) {
      return {
        result: null,
        error:
          cause instanceof Error
            ? cause.message
            : t("studio.photoLtBackground.convertFailed", "선화 변환에 실패했어요."),
      };
    }
  }, [source, presetId, t]);

  // 합성 미리보기: 흰 바탕 → 톤(선택 시) → 선화 순서로 겹친다.
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !outcome.result || !source) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = source.width;
    canvas.height = source.height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (includeTone) {
      const toneCanvas = imageDataToCanvas(outcome.result.toneLayer);
      if (toneCanvas) context.drawImage(toneCanvas, 0, 0);
    }
    const lineCanvas = imageDataToCanvas(outcome.result.lineLayer);
    if (lineCanvas) context.drawImage(lineCanvas, 0, 0);
  }, [outcome.result, source, includeTone]);

  const handleFile = async (file: File) => {
    setStatus("decoding");
    setError(null);
    setPlacedSummary(null);
    try {
      const imageData = await decodeFile(file);
      if (!mountedRef.current) return;
      setSource(imageData);
      setSourceName(file.name);
      setStatus("ready");
    } catch (cause) {
      if (!mountedRef.current) return;
      setSource(null);
      setStatus("error");
      setError(
        cause instanceof Error
          ? cause.message
          : t("studio.photoLtBackground.decodeFailed", "사진을 읽지 못했어요."),
      );
    }
  };

  const handlePreset = (nextPresetId: StudioPhotoLtBackgroundPresetId) => {
    setPresetId(nextPresetId);
    setIncludeTone(resolveStudioPhotoLtBackgroundPreset(nextPresetId).includeTone);
    setPlacedSummary(null);
  };

  const handlePlace = () => {
    if (!outcome.result || !source) return;
    try {
      const placement = buildStudioPhotoLtBackgroundPlacement(
        outcome.result,
        {
          canvasWidth: canvasW,
          canvasHeight: canvasH,
          sourceWidth: source.width,
          sourceHeight: source.height,
          sourceName,
          presetId,
          includeTone,
          fit,
        },
        serializeImageData,
      );
      onPlace(placement);
      setPlacedSummary(
        t(
          "studio.photoLtBackground.placed",
          "선화 배경을 캔버스에 배치했어요 (레이어 {v0}개)",
        ).replace("{v0}", String(placement.layers.length)),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("studio.photoLtBackground.placeFailed", "배치에 실패했어요."),
      );
    }
  };

  const activePreset = resolveStudioPhotoLtBackgroundPreset(presetId);

  return (
    <div
      className={cn("flex flex-col gap-2 rounded-xl border border-line bg-panel/50 p-3", className)}
      data-studio-photo-lt-background-panel="true"
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-fg-1">
        <Layers size={14} aria-hidden />
        {t("studio.photoLtBackground.title", "사진으로 선화 배경 만들기")}
      </div>
      <p className="text-[0.7rem] leading-relaxed text-fg-3">
        {t(
          "studio.photoLtBackground.description",
          "사진 한 장을 선화 배경으로 바꿔 캔버스 맨 뒤에 깔아요. 원본 사진은 바뀌지 않아요.",
        )}
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label={t("studio.photoLtBackground.pickPhoto", "사진 고르기")}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void handleFile(file);
        }}
      />

      {status === "empty" ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line px-3 py-4 text-center transition-colors duration-150 hover:bg-accent-soft motion-reduce:transition-none",
            STUDIO_FOCUS_RING,
          )}
        >
          <ImagePlus size={18} aria-hidden />
          <span className="text-xs font-semibold text-fg-2">
            {t("studio.photoLtBackground.pickPhoto", "사진 고르기")}
          </span>
          <span className="text-[0.65rem] text-fg-3">
            {t("studio.photoLtBackground.emptyHint", "배경으로 쓸 사진 한 장을 골라 주세요")}
          </span>
        </button>
      ) : null}

      {status === "decoding" ? (
        <p className="flex items-center gap-1.5 px-1 py-3 text-xs text-fg-3" role="status">
          <Loader2 size={14} aria-hidden />
          {t("studio.photoLtBackground.decoding", "사진을 읽는 중…")}
        </p>
      ) : null}

      {status === "error" ? (
        <div className="px-1 py-2">
          <p role="alert" className="text-xs leading-relaxed text-fg-2">
            {error ?? t("studio.photoLtBackground.decodeFailed", "사진을 읽지 못했어요.")}
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "mt-2 inline-flex items-center gap-1.5 rounded-xl border border-line/70 bg-panel px-3 py-2 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:bg-accent-soft hover:text-accent motion-reduce:transition-none",
              STUDIO_FOCUS_RING,
            )}
          >
            <ImagePlus size={14} aria-hidden />
            {t("studio.photoLtBackground.retry", "다른 사진 고르기")}
          </button>
        </div>
      ) : null}

      {status === "ready" && source ? (
        <>
          <div className="overflow-hidden rounded-lg border border-line bg-[oklch(0.96_0.005_90)] dark:bg-[oklch(0.22_0.01_70)]">
            <canvas
              ref={previewCanvasRef}
              className="max-h-44 w-full object-contain"
              role="img"
              aria-label={t("studio.photoLtBackground.preview", "선화 배경 미리보기")}
            />
          </div>
          <p className="text-[0.65rem] text-fg-3">
            {sourceName} · {source.width}×{source.height} → {canvasW}×{canvasH}
          </p>

          <div
            role="group"
            aria-label={t("studio.photoLtBackground.presetGroup", "선화 느낌")}
            className="flex flex-wrap gap-1"
          >
            {STUDIO_PHOTO_LT_BACKGROUND_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={presetId === preset.id}
                title={preset.description}
                onClick={() => handlePreset(preset.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1.5 text-[0.68rem] font-semibold transition-colors duration-150 motion-reduce:transition-none",
                  STUDIO_FOCUS_RING,
                  presetId === preset.id
                    ? "border-accent/60 bg-accent text-on-accent"
                    : "border-line/70 bg-panel text-fg-2 hover:bg-accent-soft hover:text-accent",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="text-[0.65rem] text-fg-3">{activePreset.description}</p>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-fg-2">
              <input
                type="checkbox"
                checked={includeTone}
                onChange={(event) => {
                  setIncludeTone(event.currentTarget.checked);
                  setPlacedSummary(null);
                }}
                className={cn("size-4 accent-accent", STUDIO_FOCUS_RING)}
              />
              {t("studio.photoLtBackground.includeTone", "명암(톤)도 함께 깔기")}
            </label>
            <div
              role="group"
              aria-label={t("studio.photoLtBackground.fitGroup", "캔버스에 맞추는 법")}
              className="flex gap-1"
            >
              {(
                [
                  { id: "cover", label: t("studio.photoLtBackground.fitCover", "꽉 채우기") },
                  { id: "contain", label: t("studio.photoLtBackground.fitContain", "전체 보이기") },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={fit === option.id}
                  onClick={() => {
                    setFit(option.id);
                    setPlacedSummary(null);
                  }}
                  className={cn(
                    "rounded-lg border px-2 py-1 text-[0.68rem] font-semibold transition-colors duration-150 motion-reduce:transition-none",
                    STUDIO_FOCUS_RING,
                    fit === option.id
                      ? "border-accent/60 bg-accent text-on-accent"
                      : "border-line/70 bg-panel text-fg-2 hover:bg-accent-soft hover:text-accent",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "ml-auto text-[0.68rem] font-semibold text-fg-3 underline-offset-2 hover:underline",
                STUDIO_FOCUS_RING,
              )}
            >
              {t("studio.photoLtBackground.changePhoto", "사진 바꾸기")}
            </button>
          </div>

          {outcome.error ? (
            <p role="alert" className="text-xs text-fg-2">
              {outcome.error}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-fg-2">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={outcome.result === null}
            onClick={handlePlace}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-on-accent transition-colors duration-150 hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
              STUDIO_FOCUS_RING,
            )}
          >
            <Layers size={14} aria-hidden />
            {t("studio.photoLtBackground.place", "선화 배경으로 배치")}
          </button>
          {placedSummary ? (
            <p role="status" className="text-xs text-fg-2">
              {placedSummary}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
