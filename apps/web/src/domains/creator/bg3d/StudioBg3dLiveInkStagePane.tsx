import { Camera, CheckCircle2, Layers, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  getStudioBg3dWebtoonAtmospherePreset,
} from "./studio-bg3d-lighting-studio";
import type { Scene3DCaptureSnapshot } from "./studio-bg3d-live-ink-bake-bridge";

export type LiveInkInspectPass = "ink" | "depth" | "ao";

export interface StudioBg3dLiveInkStagePaneProps {
  readonly captureSnapshot: Scene3DCaptureSnapshot | null;
  readonly isCapturing?: boolean;
  readonly mode: "split-wipe" | "live-ink-only";
  readonly onRequestCapture?: () => void;
}

/**
 * Split-Wipe 우측 패인 및 선화 전용(Live Ink Only) 모드에서
 * 실제 WebGL/Three.js 멀티패스(선화·깊이·접지 AO) 캡처 결과를 렌더링한다.
 */
export function StudioBg3dLiveInkStagePane({
  captureSnapshot,
  isCapturing = false,
  mode,
  onRequestCapture,
}: StudioBg3dLiveInkStagePaneProps) {
  const copy = useBilingual("StudioBg3dLiveInkStagePane");
  const [inspectPass, setInspectPass] = useState<LiveInkInspectPass>("ink");

  const atmospherePreset = captureSnapshot?.atmospherePresetId
    ? getStudioBg3dWebtoonAtmospherePreset(captureSnapshot.atmospherePresetId)
    : null;

  const hasDepth = Boolean(captureSnapshot?.depthPassRef);
  const hasAo = Boolean(captureSnapshot?.aoPassRef);
  const resolvedPass: LiveInkInspectPass =
    inspectPass === "depth" && hasDepth
      ? "depth"
      : inspectPass === "ao" && hasAo
        ? "ao"
        : "ink";

  const activePassSrc =
    resolvedPass === "depth"
      ? captureSnapshot?.depthPassRef ?? null
      : resolvedPass === "ao"
        ? captureSnapshot?.aoPassRef ?? null
        : captureSnapshot?.inkPassRef ?? null;

  const passTitle =
    resolvedPass === "depth"
      ? copy("깊이(Depth) 패스", "Depth pass")
      : resolvedPass === "ao"
        ? copy("접지 음영(AO) 패스", "Contact AO pass")
        : copy("실시간 라이브 선화 패스", "Live Ink line-art pass");

  return (
    <div
      data-testid={mode === "split-wipe" ? "studio-bg3d-live-ink-wipe-pane" : "studio-bg3d-live-ink-only-pane"}
      data-live-ink-pass={resolvedPass}
      data-has-capture={captureSnapshot ? "true" : "false"}
      className="relative flex h-full min-h-[240px] w-full flex-col items-center justify-center overflow-hidden bg-canvas text-xs text-fg-2"
    >
      {activePassSrc ? (
        <div
          className="relative flex h-full w-full items-center justify-center overflow-hidden"
          style={{
            background:
              resolvedPass === "ink"
                ? "linear-gradient(160deg, color-mix(in oklch, var(--color-card) 94%, var(--color-cool) 6%), color-mix(in oklch, var(--color-panel) 96%, var(--color-accent) 4%))"
                : "var(--color-canvas)",
          }}
        >
          <img
            src={activePassSrc}
            alt={passTitle}
            data-testid="studio-bg3d-live-ink-pass-image"
            className="h-full w-full object-contain select-none"
            draggable={false}
          />
        </div>
      ) : (
        <div className="flex max-w-xs flex-col items-center justify-center gap-2.5 px-5 py-6 text-center [word-break:keep-all]">
          <span
            className="inline-flex size-12 items-center justify-center rounded-2xl border border-accent/40 text-accent"
            style={{
              background: "color-mix(in oklch, var(--color-accent) 16%, var(--color-card))",
            }}
          >
            <Sparkles size={20} aria-hidden />
          </span>
          <span className="text-sm font-bold text-fg">
            {isCapturing
              ? copy("3D 멀티패스 선화를 추출하는 중입니다…", "Extracting 3D multipass live ink…")
              : copy("실시간 라이브 선화 패스 대기 중", "Live Ink pass ready")}
          </span>
          <span className="text-[0.6875rem] leading-relaxed text-fg-3">
            {copy(
              "현재 3D 뷰포트에서 선화·음영·깊이·접지 음영 패스를 즉시 캡처해 원고 컷과 1:1로 비교합니다.",
              "Capture live line, shaded, depth, and AO passes directly from the 3D viewport.",
            )}
          </span>
          {onRequestCapture ? (
            <button
              type="button"
              disabled={isCapturing}
              title={
                isCapturing
                  ? copy(
                      "현재 3D 멀티패스 캡처가 진행 중입니다. 완료 후 다시 누를 수 있습니다.",
                      "3D multipass capture is in progress. Try again once finished.",
                    )
                  : copy("현재 3D 뷰포트에서 선화·음영·깊이·AO 패스를 캡처합니다.", "Capture live 3D passes now.")
              }
              data-testid="studio-bg3d-live-ink-capture-now"
              onClick={onRequestCapture}
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-accent bg-accent px-4 text-xs font-bold text-on-accent [word-break:keep-all] transition-[transform,background-color,box-shadow,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-accent-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:transform-none"
            >
              <Camera size={14} aria-hidden />
              {isCapturing ? copy("캡처 중…", "Capturing…") : copy("지금 선화 패스 캡처", "Capture Live Ink now")}
            </button>
          ) : null}
        </div>
      )}

      {/* 하단 패스 전환 & 무결성 요약 HUD (실제 캡처 상태가 있을 때 표시) */}
      <div
        className="pointer-events-auto absolute inset-x-2.5 bottom-2.5 flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-line bg-panel/92 px-2.5 py-1.5 shadow-sm backdrop-blur-sm"
        style={{
          boxShadow: "0 10px 26px -14px color-mix(in oklch, var(--color-cool) 35%, transparent)",
        }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent-soft px-2 py-0.5 text-[0.6875rem] font-bold text-accent">
            <Layers size={12} aria-hidden />
            {passTitle}
          </span>
          {captureSnapshot ? (
            <span
              data-testid="studio-bg3d-live-ink-metrics"
              className="font-mono text-[0.6875rem] tabular-nums text-fg-2"
            >
              {`${captureSnapshot.widthPx}×${captureSnapshot.heightPx} · 선폭 ${captureSnapshot.inkLineWeightPx}px`}
            </span>
          ) : (
            <span className="font-mono text-[0.6875rem] tabular-nums text-fg-3">
              {copy("손그림 LT 라인아트 패스 대기 중", "Hand-drawn LT line-art pass ready")}
            </span>
          )}
          {atmospherePreset ? (
            <span
              className="rounded-full border border-line px-2 py-0.5 text-[0.625rem] font-semibold text-fg"
              style={{
                borderColor: atmospherePreset.spectrumToneVar,
                background: atmospherePreset.spectrumGlowMix,
              }}
            >
              {copy(atmospherePreset.labelKo, atmospherePreset.labelEn)}
            </span>
          ) : null}
          {captureSnapshot?.inkAudit?.passesInkWeightInvariant ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-good/40 bg-good-soft px-2 py-0.5 text-[0.625rem] font-semibold text-good">
              <CheckCircle2 size={11} aria-hidden />
              {copy("컷 선굵기 일치", "Ink weight locked")}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {captureSnapshot ? (
            <div role="group" aria-label={copy("캡처 패스 보기", "Inspect capture pass")} className="inline-flex items-center gap-1">
              {(
                [
                  { id: "ink", ko: "선화", en: "Ink", available: true },
                  { id: "depth", ko: "깊이", en: "Depth", available: hasDepth },
                  { id: "ao", ko: "AO", en: "AO", available: hasAo },
                ] as const
              )
                .filter((item) => item.available)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={resolvedPass === item.id}
                    data-testid={`studio-bg3d-live-ink-pass-btn-${item.id}`}
                    onClick={() => setInspectPass(item.id)}
                    className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 [word-break:keep-all] transition-[transform,border-color,background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-accent/60 hover:text-fg active:scale-[0.97] aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent motion-reduce:transition-none motion-reduce:transform-none"
                  >
                    {copy(item.ko, item.en)}
                  </button>
                ))}
            </div>
          ) : null}
          {onRequestCapture ? (
            <button
              type="button"
              disabled={isCapturing}
              title={
                isCapturing
                  ? copy(
                      "현재 3D 멀티패스 캡처가 진행 중입니다. 완료 후 다시 촬영할 수 있습니다.",
                      "3D multipass capture is in progress. Wait to refresh.",
                    )
                  : copy("현재 3D 구도·조명으로 선화 패스를 다시 촬영합니다.", "Refresh Live Ink passes from current 3D view.")
              }
              data-testid="studio-bg3d-live-ink-refresh-btn"
              onClick={onRequestCapture}
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 [word-break:keep-all] transition-[transform,border-color,color,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-accent hover:text-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none motion-reduce:transform-none"
            >
              <RefreshCw
                size={13}
                className={isCapturing ? "opacity-60 transition-opacity duration-200 motion-reduce:transition-none" : "shrink-0"}
                aria-hidden
              />
              {isCapturing ? copy("캡처 중…", "Capturing…") : copy("재촬영", "Refresh")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
