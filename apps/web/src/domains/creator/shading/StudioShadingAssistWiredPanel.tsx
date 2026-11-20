/**
 * Studio Shading Assist Wired Panel — `studio-shading-assist.ts` 3D 구면 볼륨·림라이트 엔진 라이브 배선 패널.
 *
 * 기존 무props `<Panel />` 마운트를 대체하여, 선택된 이미지 레이어의 실제 픽셀에
 * `buildStudioShadingAssistDraft`를 실행하고 비파괴 음영 레이어 생성(또는 현재 레이어 합성)으로 커밋한다.
 * 상단에 `StudioShadingLightBallOverlay` 구면 광원 볼 기즈모를 통합하며, 캔버스 위 플로팅
 * 광원 볼 띄우기도 지원한다.
 */
import { Eye, Layers, Loader2, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  encodeStudioAutoColorHintImageToPngDataUrl,
  loadStudioAutoColorHintImageFromSrc,
} from "../studio-auto-color-hints-image-source";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  buildStudioShadingAssistDraft,
  DEFAULT_SHADING_ASSIST_OPTIONS,
  normalizeShadingAssistOptions,
  SHADING_ASSIST_COVERAGE_RANGE,
  SHADING_ASSIST_SOFTNESS_RANGE,
  SHADING_ASSIST_STRENGTH_RANGE,
  type ShadingAssistBlendMode,
  type ShadingAssistDraft,
  type ShadingAssistModel,
  type ShadingAssistOptions,
} from "../studio-shading-assist";

import {
  clampElevationDeg,
  normalizeAzimuthDeg,
  shadingElevationToCoverage,
  StudioShadingLightBallOverlay,
  type ShadingLightBallState,
} from "./StudioShadingLightBallOverlay";

import type { El } from "../studio-element-model";
import type { StudioImageDataLike } from "../studio-filters";
import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

/* eslint-disable react-refresh/only-export-components -- pure shading layer output resolver and mood presets co-exported with panel */

/** `StudioElementLayerMetadata`(`name` 등)를 포함한 정본 이미지 요소 타입. */
export type StudioShadingImageEl = Extract<El, { type: "image" }>;

export interface StudioShadingLayerCommitPayload {
  readonly dataUrl: string;
  readonly name: string;
  readonly blendMode: "source-over" | "multiply";
  readonly clipBelow: boolean;
  readonly shadingModel: ShadingAssistModel;
  readonly coverageRatio: number;
  readonly rimLightPixelCount: number;
}

export interface StudioShadingAssistWiredPanelProps {
  readonly selected: StudioShadingImageEl;
  readonly readableImageSrc?: string | null;
  readonly onPatch: (patch: Partial<El>) => void;
  readonly onCreateShadingLayer?: (payload: StudioShadingLayerCommitPayload) => boolean | void;
  readonly destructiveEditDisabledReason?: string | null;
  readonly decodeSource?: (src: string) => Promise<StudioImageDataLike>;
  readonly encodePng?: (image: StudioImageDataLike) => string;
  readonly className?: string;
}

interface ShadingMoodPreset {
  readonly id: string;
  readonly label: string;
  readonly shadowColor: readonly [number, number, number];
  readonly rimLightColor: readonly [number, number, number];
  readonly swatchOklch: string;
}

export const SHADING_MOOD_PRESETS: readonly ShadingMoodPreset[] = [
  {
    id: "day-violet",
    label: "주간 보라",
    shadowColor: [88, 80, 160],
    rimLightColor: [255, 248, 220],
    swatchOklch: "oklch(0.49 0.12 278)",
  },
  {
    id: "warm-dawn",
    label: "새벽 햇살",
    shadowColor: [118, 66, 138],
    rimLightColor: [254, 232, 160],
    swatchOklch: "oklch(0.46 0.14 316)",
  },
  {
    id: "cool-moon",
    label: "야간 달빛",
    shadowColor: [46, 62, 118],
    rimLightColor: [176, 222, 255],
    swatchOklch: "oklch(0.37 0.11 264)",
  },
  {
    id: "sunset-wine",
    label: "노을 석양",
    shadowColor: [132, 54, 88],
    rimLightColor: [255, 198, 134],
    swatchOklch: "oklch(0.44 0.13 356)",
  },
] as const;

const BLEND_MODE_OPTIONS: readonly { readonly id: ShadingAssistBlendMode; readonly label: string }[] = [
  { id: "multiply", label: "곱하기" },
  { id: "linear-burn", label: "선형 번" },
  { id: "normal", label: "일반" },
];

const TONE_STEP_OPTIONS: readonly { readonly value: ShadingAssistOptions["toneSteps"]; readonly label: string }[] = [
  { value: 0, label: "부드럽게" },
  { value: 2, label: "2단 셀" },
  { value: 3, label: "3단 셀" },
];

const TRANSITION_CLASS =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none";

const CHIP_BUTTON_CLASS = cn(
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold [word-break:keep-all] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
  TRANSITION_CLASS,
  STUDIO_FOCUS_RING,
);

export interface ResolvedShadingLayerOutput {
  readonly imageData: StudioImageDataLike;
  readonly layerBlendMode: "source-over" | "multiply";
  readonly clipBelow: boolean;
  readonly layerName: string;
}

/**
 * `buildStudioShadingAssistDraft` 결과에서 비파괴 레이어 커밋에 가장 충실한 버퍼·블렌드 모드를 결정한다.
 * 림라이트나 선형 번이 켜져 있으면 곱하기 단독으로는 밝은 림이 사라지므로 합성 프리뷰 버퍼를 클리핑 레이어로 커밋한다.
 */
export function resolveShadingLayerOutput(
  draft: Extract<ShadingAssistDraft, { readonly status: "created" }>,
  baseLayerName?: string,
): ResolvedShadingLayerOutput {
  const blendMode = draft.options.blendMode ?? "multiply";
  const rimStrength = draft.options.rimLightStrength ?? 0;
  const prefix = baseLayerName?.trim() ? `${baseLayerName.trim()} ` : "";

  if (blendMode === "multiply" && rimStrength <= 0) {
    return {
      imageData: draft.mask,
      layerBlendMode: "multiply",
      clipBelow: true,
      layerName: `${prefix}자동 음영 (곱하기)`,
    };
  }
  if (blendMode === "normal" && rimStrength <= 0) {
    return {
      imageData: draft.mask,
      layerBlendMode: "source-over",
      clipBelow: true,
      layerName: `${prefix}자동 음영`,
    };
  }
  return {
    imageData: draft.preview,
    layerBlendMode: "source-over",
    clipBelow: true,
    layerName:
      rimStrength > 0
        ? `${prefix}자동 음영 · 림라이트`
        : `${prefix}자동 음영 (선형 번)`,
  };
}

export function StudioShadingAssistWiredPanel({
  selected,
  readableImageSrc,
  onPatch,
  onCreateShadingLayer,
  destructiveEditDisabledReason,
  decodeSource = loadStudioAutoColorHintImageFromSrc,
  encodePng = encodeStudioAutoColorHintImageToPngDataUrl,
  className,
}: StudioShadingAssistWiredPanelProps): ReactElement {
  const effectiveSrc = readableImageSrc ?? selected.src;

  const [options, setOptions] = useState<ShadingAssistOptions>(() =>
    normalizeShadingAssistOptions({
      ...DEFAULT_SHADING_ASSIST_OPTIONS,
      blendMode: "multiply",
      shadingModel: "spherical-volume",
      rimLightStrength: 35,
      rimLightWidthPx: 3,
      rimLightColor: SHADING_MOOD_PRESETS[0]!.rimLightColor,
    }),
  );
  const [elevationDeg, setElevationDeg] = useState<number>(45);
  const [linkElevationCoverage, setLinkElevationCoverage] = useState<boolean>(true);
  const [moodId, setMoodId] = useState<string>(SHADING_MOOD_PRESETS[0]!.id);
  const [canvasBallOpen, setCanvasBallOpen] = useState<boolean>(false);
  const [canvasBallAnchor, setCanvasBallAnchor] = useState<{ readonly x: number; readonly y: number }>({
    x: 0.5,
    y: 0.42,
  });
  const [busy, setBusy] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [previewSample, setPreviewSample] = useState<StudioImageDataLike | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 저해상도 썸네일 샘플을 1회 디코드해 광원 볼 드래그 중 실시간 음영을 미리본다.
  useEffect(() => {
    if (!effectiveSrc || typeof document === "undefined") {
      setPreviewSample(null);
      return;
    }
    let cancelled = false;
    void decodeSource(effectiveSrc)
      .then((decoded) => {
        if (cancelled) return;
        const maxSide = 144;
        if (decoded.width <= maxSide && decoded.height <= maxSide) {
          setPreviewSample(decoded);
          return;
        }
        const scale = maxSide / Math.max(decoded.width, decoded.height);
        const targetW = Math.max(1, Math.round(decoded.width * scale));
        const targetH = Math.max(1, Math.round(decoded.height * scale));
        const out = new Uint8ClampedArray(targetW * targetH * 4);
        for (let y = 0; y < targetH; y += 1) {
          const sy = Math.min(decoded.height - 1, Math.floor((y / targetH) * decoded.height));
          for (let x = 0; x < targetW; x += 1) {
            const sx = Math.min(decoded.width - 1, Math.floor((x / targetW) * decoded.width));
            const srcOff = (sy * decoded.width + sx) * 4;
            const dstOff = (y * targetW + x) * 4;
            out[dstOff] = decoded.data[srcOff]!;
            out[dstOff + 1] = decoded.data[srcOff + 1]!;
            out[dstOff + 2] = decoded.data[srcOff + 2]!;
            out[dstOff + 3] = decoded.data[srcOff + 3]!;
          }
        }
        setPreviewSample({ width: targetW, height: targetH, data: out });
      })
      .catch(() => {
        if (!cancelled) setPreviewSample(null);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveSrc, decodeSource]);

  const livePreviewDraft = useMemo(() => {
    if (!previewSample) return null;
    return buildStudioShadingAssistDraft(previewSample, options);
  }, [previewSample, options]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !livePreviewDraft || livePreviewDraft.status !== "created") return;
    canvas.width = livePreviewDraft.preview.width;
    canvas.height = livePreviewDraft.preview.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.createImageData(
      livePreviewDraft.preview.width,
      livePreviewDraft.preview.height,
    );
    imageData.data.set(livePreviewDraft.preview.data);
    ctx.putImageData(imageData, 0, 0);
  }, [livePreviewDraft]);

  const lightBallValue: ShadingLightBallState = {
    azimuthDeg: options.azimuthDeg,
    elevationDeg,
    shadingModel: options.shadingModel ?? "spherical-volume",
    rimLightStrength: options.rimLightStrength ?? 0,
    anchorX: canvasBallAnchor.x,
    anchorY: canvasBallAnchor.y,
  };

  const handleLightBallChange = (patch: Partial<ShadingLightBallState>): void => {
    if (patch.anchorX !== undefined || patch.anchorY !== undefined) {
      setCanvasBallAnchor((prev) => ({
        x: patch.anchorX ?? prev.x,
        y: patch.anchorY ?? prev.y,
      }));
    }
    const nextOptionPatch: Partial<ShadingAssistOptions> = {};
    if (patch.azimuthDeg !== undefined) {
      (nextOptionPatch as { azimuthDeg?: number }).azimuthDeg = normalizeAzimuthDeg(patch.azimuthDeg);
    }
    if (patch.elevationDeg !== undefined) {
      const clampedEl = clampElevationDeg(patch.elevationDeg);
      setElevationDeg(clampedEl);
      if (linkElevationCoverage) {
        (nextOptionPatch as { coverage?: number }).coverage = shadingElevationToCoverage(clampedEl);
      }
    }
    if (patch.shadingModel !== undefined) {
      (nextOptionPatch as { shadingModel?: ShadingAssistModel }).shadingModel = patch.shadingModel;
    }
    if (patch.rimLightStrength !== undefined) {
      (nextOptionPatch as { rimLightStrength?: number }).rimLightStrength = patch.rimLightStrength;
    }
    if (Object.keys(nextOptionPatch).length > 0) {
      setOptions((prev) => normalizeShadingAssistOptions({ ...prev, ...nextOptionPatch }));
    }
  };

  const patchOptions = (patch: Partial<ShadingAssistOptions>): void => {
    setOptions((prev) => normalizeShadingAssistOptions({ ...prev, ...patch }));
  };

  const runShadingCommit = async (mode: "new-layer" | "composite-selected"): Promise<void> => {
    if (!effectiveSrc) {
      setStatusMessage("선택한 레이어에서 이미지를 읽을 수 없어 음영을 생성하지 못했어요.");
      return;
    }
    setBusy(true);
    setStatusMessage(null);
    try {
      const source = await decodeSource(effectiveSrc);
      const draft = buildStudioShadingAssistDraft(source, options);
      if (draft.status === "refused") {
        setStatusMessage(draft.detail);
        return;
      }

      const coveragePct = Math.round(draft.coverageRatio * 100);
      const rimCount = draft.rimLightPixelCount ?? 0;

      if (mode === "new-layer" && onCreateShadingLayer) {
        const resolved = resolveShadingLayerOutput(draft, selected.name);
        const dataUrl = encodePng(resolved.imageData);
        const committed = onCreateShadingLayer({
          dataUrl,
          name: resolved.layerName,
          blendMode: resolved.layerBlendMode,
          clipBelow: resolved.clipBelow,
          shadingModel: draft.options.shadingModel ?? "spherical-volume",
          coverageRatio: draft.coverageRatio,
          rimLightPixelCount: rimCount,
        });
        if (committed === false) {
          setStatusMessage("음영 레이어를 문서에 추가하지 못했어요. 잠금 상태를 확인해 주세요.");
          return;
        }
        setStatusMessage(
          rimCount > 0
            ? `새 음영 레이어를 만들었어요 (음영 ${coveragePct}% · 림라이트 ${rimCount.toLocaleString()}px).`
            : `새 음영 레이어를 만들었어요 (음영 영역 ${coveragePct}%).`,
        );
        return;
      }

      const previewUrl = encodePng(draft.preview);
      onPatch({ src: previewUrl } as Partial<El>);
      setStatusMessage(
        rimCount > 0
          ? `선택 레이어에 음영과 림라이트를 합성했어요 (음영 ${coveragePct}% · 림라이트 ${rimCount.toLocaleString()}px).`
          : `선택 레이어에 음영을 합성했어요 (음영 영역 ${coveragePct}%).`,
      );
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "음영 초안을 계산하는 중 문제가 생겼어요.",
      );
    } finally {
      setBusy(false);
    }
  };

  const portalHost =
    canvasBallOpen && typeof document !== "undefined"
      ? (document.querySelector("[data-studio-canvas-stage]") ?? document.body)
      : null;

  const activeBlendMode = options.blendMode ?? "multiply";
  const rimWidthPx = options.rimLightWidthPx ?? 3;
  const rimStrength = Math.round(options.rimLightStrength ?? 0);

  return (
    <section
      aria-label="자동 명암 보조"
      data-testid="studio-shading-assist-wired-panel"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-line bg-panel/90 p-3 text-xs text-fg [word-break:keep-all]",
        className,
      )}
    >
      {/* 상단: 광원 볼 캔버스 띄우기 토글 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.72rem] leading-relaxed text-fg-3">
          3D 구면 볼륨과 림라이트로 음영 레이어를 바로 생성합니다.
        </p>
        <button
          type="button"
          disabled={busy}
          aria-pressed={canvasBallOpen}
          onClick={() => setCanvasBallOpen((prev) => !prev)}
          className={cn(
            CHIP_BUTTON_CLASS,
            "shrink-0 px-2.5",
            canvasBallOpen
              ? "border-accent bg-accent-soft text-fg"
              : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          <Eye size={14} aria-hidden />
          <span>{canvasBallOpen ? "광원 볼 숨기기" : "캔버스 광원 볼"}</span>
        </button>
      </div>

      {/* 내장 구면 광원 볼 기즈모 */}
      <StudioShadingLightBallOverlay
        value={lightBallValue}
        onChange={handleLightBallChange}
        variant="embedded"
        disabled={busy}
      />

      {/* 실시간 미리보기 썸네일 (디코드 성공 시) */}
      {livePreviewDraft?.status === "created" ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-line/75 bg-card/70 p-2">
          <canvas
            ref={previewCanvasRef}
            aria-label="자동 음영 실시간 미리보기"
            className="size-16 shrink-0 rounded-lg bg-panel object-contain outline-1 -outline-offset-1 outline-line"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[0.7rem] text-fg-2">
            <span className="font-semibold text-fg">실시간 음영 미리보기</span>
            <span className="tabular-nums text-fg-3">
              음영 비율 {Math.round(livePreviewDraft.coverageRatio * 100)}%
            </span>
            {(livePreviewDraft.rimLightPixelCount ?? 0) > 0 ? (
              <span className="tabular-nums text-accent">
                림라이트 {(livePreviewDraft.rimLightPixelCount ?? 0).toLocaleString()}px 활성
              </span>
            ) : (
              <span className="text-fg-3">림라이트 꺼짐</span>
            )}
          </div>
        </div>
      ) : null}

      {/* 광원 분위기 4종 (OKLCH 스와치) */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[0.72rem] font-semibold text-fg-2">그림자 분위기</span>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="그림자 분위기 프리셋">
          {SHADING_MOOD_PRESETS.map((preset) => {
            const active = moodId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={busy}
                aria-pressed={active}
                onClick={() => {
                  setMoodId(preset.id);
                  patchOptions({
                    shadowColor: preset.shadowColor,
                    rimLightColor: preset.rimLightColor,
                  });
                }}
                className={cn(
                  CHIP_BUTTON_CLASS,
                  "justify-start px-2.5",
                  active
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-3.5 shrink-0 rounded-full border border-line [forced-color-adjust:none]"
                  style={{ backgroundColor: preset.swatchOklch }}
                />
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 합성 방식 & 음영 단차 */}
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="음영 합성 방식">
        {BLEND_MODE_OPTIONS.map((mode) => (
          <button
            key={mode.id}
            type="button"
            disabled={busy}
            aria-pressed={activeBlendMode === mode.id}
            onClick={() => patchOptions({ blendMode: mode.id })}
            className={cn(
              CHIP_BUTTON_CLASS,
              activeBlendMode === mode.id
                ? "border-accent bg-accent-soft text-fg"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="음영 단차">
        {TONE_STEP_OPTIONS.map((step) => (
          <button
            key={step.label}
            type="button"
            disabled={busy}
            aria-pressed={options.toneSteps === step.value}
            onClick={() => patchOptions({ toneSteps: step.value })}
            className={cn(
              CHIP_BUTTON_CLASS,
              options.toneSteps === step.value
                ? "border-accent bg-accent-soft text-fg"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            {step.label}
          </button>
        ))}
      </div>

      {/* 핵심 슬라이더 3종 */}
      <div className="flex flex-col gap-2 rounded-xl border border-line/70 bg-card/60 p-2.5">
        <label className="flex flex-col gap-0.5 text-[0.72rem] text-fg-2">
          <span className="flex justify-between tabular-nums">
            <span>음영 강도</span>
            <span className="font-semibold text-fg">{Math.round(options.strength)}%</span>
          </span>
          <input
            type="range"
            aria-label="음영 강도"
            min={SHADING_ASSIST_STRENGTH_RANGE.min}
            max={SHADING_ASSIST_STRENGTH_RANGE.max}
            step={SHADING_ASSIST_STRENGTH_RANGE.step}
            disabled={busy}
            value={Math.round(options.strength)}
            onChange={(event) => patchOptions({ strength: Number(event.target.value) })}
            className="min-h-11 w-full cursor-pointer accent-accent"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[0.72rem] text-fg-2">
          <span className="flex justify-between tabular-nums">
            <span>음영 경계</span>
            <span className="font-semibold text-fg">{Math.round(options.coverage)}%</span>
          </span>
          <input
            type="range"
            aria-label="음영 경계"
            min={SHADING_ASSIST_COVERAGE_RANGE.min}
            max={SHADING_ASSIST_COVERAGE_RANGE.max}
            step={SHADING_ASSIST_COVERAGE_RANGE.step}
            disabled={busy}
            value={Math.round(options.coverage)}
            onChange={(event) => patchOptions({ coverage: Number(event.target.value) })}
            className="min-h-11 w-full cursor-pointer accent-accent"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[0.72rem] text-fg-2">
          <span className="flex justify-between tabular-nums">
            <span>경계 부드러움</span>
            <span className="font-semibold text-fg">{Math.round(options.softness)}%</span>
          </span>
          <input
            type="range"
            aria-label="경계 부드러움"
            min={SHADING_ASSIST_SOFTNESS_RANGE.min}
            max={SHADING_ASSIST_SOFTNESS_RANGE.max}
            step={SHADING_ASSIST_SOFTNESS_RANGE.step}
            disabled={busy}
            value={Math.round(options.softness)}
            onChange={(event) => patchOptions({ softness: Number(event.target.value) })}
            className="min-h-11 w-full cursor-pointer accent-accent"
          />
        </label>
      </div>

      {/* 점진적 공개: 림라이트 두께 및 고도 연동 세부 설정 */}
      <details className="rounded-xl border border-line/70 bg-card/55 p-2">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 text-xs font-semibold text-fg hover:bg-raised/60",
            TRANSITION_CLASS,
            STUDIO_FOCUS_RING,
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={14} className="text-accent" aria-hidden />
            <span>림라이트 · 고도 세부 설정</span>
          </span>
          <span className="tabular-nums text-[0.7rem] text-fg-3">
            {rimStrength > 0 ? `${rimWidthPx}px` : "끔"}
          </span>
        </summary>
        <div className="mt-2 flex flex-col gap-2 px-1">
          <label className="flex flex-col gap-0.5 text-[0.72rem] text-fg-2">
            <span className="flex justify-between tabular-nums">
              <span>림라이트 두께</span>
              <span className="font-semibold text-fg">{rimWidthPx}px</span>
            </span>
            <input
              type="range"
              aria-label="림라이트 두께"
              min={1}
              max={24}
              step={1}
              disabled={busy}
              value={rimWidthPx}
              onChange={(event) => patchOptions({ rimLightWidthPx: Number(event.target.value) })}
              className="min-h-11 w-full cursor-pointer accent-accent"
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[0.72rem] text-fg-2">
            <input
              type="checkbox"
              checked={linkElevationCoverage}
              disabled={busy}
              onChange={(event) => setLinkElevationCoverage(event.target.checked)}
              className="size-4 accent-accent"
            />
            <span>광원 고도각에 맞춰 음영 경계 자동 조절</span>
          </label>
        </div>
      </details>

      {/* 실행 버튼 */}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          disabled={busy || !effectiveSrc}
          onClick={() => void runShadingCommit("new-layer")}
          className={cn(
            CHIP_BUTTON_CLASS,
            "w-full border-accent bg-accent text-on-accent hover:bg-accent-2",
          )}
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Layers size={14} aria-hidden />
          )}
          <span>{onCreateShadingLayer ? "음영 레이어 만들기" : "음영 적용하기"}</span>
        </button>

        {onCreateShadingLayer && !destructiveEditDisabledReason ? (
          <button
            type="button"
            disabled={busy || !effectiveSrc}
            onClick={() => void runShadingCommit("composite-selected")}
            className={cn(
              CHIP_BUTTON_CLASS,
              "w-full border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <WandSparkles size={14} aria-hidden />
            <span>현재 레이어에 바로 합성</span>
          </button>
        ) : null}
      </div>

      {statusMessage ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-accent/35 bg-accent-soft px-2.5 py-2 text-[0.72rem] leading-relaxed text-fg"
        >
          {statusMessage}
        </p>
      ) : null}

      {/* 캔버스 플로팅 광원 볼 오버레이 포털 */}
      {portalHost
        ? createPortal(
            <StudioShadingLightBallOverlay
              value={lightBallValue}
              onChange={handleLightBallChange}
              variant="canvas-overlay"
              onClose={() => setCanvasBallOpen(false)}
              disabled={busy}
            />,
            portalHost,
          )
        : null}
    </section>
  );
}
