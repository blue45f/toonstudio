import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
// 애니풍 변환 패널 — 사진·스케치·기존 컷을 애니메이션 화풍으로 바꾸는 자리.
// 두 경로가 모두 실제 변환이다(필터 흉내 없음):
// ① 기기 변환 — AnimeGANv2(MIT) ONNX를 브라우저에서 직접 추론. 키도
// 서버도 필요 없고 원본이 기기를 떠나지 않는다.
// ② 클라우드 변환 — 사용자가 등록한 API 키(BYOK)로 Images Edits에
// 애니풍 프리셋(anime-cel) 프롬프트를 실어 보낸다. 키가 없으면 버튼을
// 정직하게 비활성으로 표시한다.
// 모델·런타임·클라이언트는 실행 버튼을 눌렀을 때만 동적 import로 지연 로딩된다.
import { Cloud, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import type { StudioAnimeganStyleKind } from "../studio-onnx-animegan";

import { cn } from "@/shared/lib/utils";

const T = (ko: string) => translateCurrentStaticSourceText(
  "domains.creator.ai.StudioOnnxAnimeStylePanel",
  "ko",
  ko,
);

const STYLE_OPTIONS: readonly {
  readonly kind: StudioAnimeganStyleKind;
  readonly label: string;
}[] = [
  { kind: "paprika", label: "풍경·컷 전반" },
  { kind: "face-paint", label: "인물 중심" },
];

type BusyRoute = "device" | "cloud" | null;

export function StudioOnnxAnimeStylePanel({
  src,
  cloudConfigured,
  onResult,
}: {
  src: string;
  /** True when the BYOK cloud route is ready (API key registered). */
  cloudConfigured: boolean;
  onResult: (dataUrl: string) => void;
}) {
  const [kind, setKind] = useState<StudioAnimeganStyleKind>("paprika");
  const [busy, setBusy] = useState<BusyRoute>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setPreviewSrc(null);
    setError(null);
  }, [src]);

  const runDevice = async () => {
    if (busy) return;
    setBusy("device");
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const service = await import("../studio-onnx-anime-style");
      const result = await service.convertToAnimeStyleOnDevice(src, {
        kind,
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      setPreviewSrc(result.dataUrl);
      onResult(result.dataUrl);
    } catch (cause) {
      if (!mountedRef.current) return;
      if (cause instanceof Error && cause.name === "AbortError") {
        setError(T("변환을 취소했어요."));
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : T("기기 변환에 실패했어요."),
        );
      }
    } finally {
      if (mountedRef.current) setBusy(null);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const runCloud = async () => {
    if (busy || !cloudConfigured) return;
    setBusy("cloud");
    setError(null);
    try {
      const client = await import("./studio-ai-client");
      const settings = client.loadStudioAiSessionSettings(
        window.sessionStorage,
        window.localStorage,
      );
      const result = await client.convertImageToAnimeStyle(settings, src);
      if (!mountedRef.current) return;
      if (result.ok) {
        setPreviewSrc(result.data.dataUrl);
        onResult(result.data.dataUrl);
      } else {
        setError(result.error);
      }
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : T("AI 변환에 실패했어요."),
      );
    } finally {
      if (mountedRef.current) setBusy(null);
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-line bg-panel/50 p-3"
      data-studio-anime-style-panel="true"
    >
      <div className="flex items-center gap-1.5 text-sm font-bold text-fg">
        <Sparkles size={14} className="text-accent" aria-hidden />
        {T("애니풍 변환")}
      </div>

      <p className="text-[0.68rem] leading-relaxed text-fg-2">
        {T("사진·스케치·컷을 애니메이션 화풍으로 바꿔요. 기기에서 바로 변환하면 원본이 밖으로 나가지 않아요.")}
      </p>

      {previewSrc && (
        <div className="overflow-hidden rounded-lg border border-line bg-card">
          <img
            src={previewSrc}
            alt={T("애니풍 변환 결과 미리보기")}
            className="max-h-32 w-full object-contain"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <span className="w-14 shrink-0 text-[0.62rem] font-semibold text-fg-3">
          {T("기기 스타일")}
        </span>
        {STYLE_OPTIONS.map((option) => (
          <button
            key={option.kind}
            type="button"
            disabled={busy !== null}
            aria-pressed={kind === option.kind}
            onClick={() => setKind(option.kind)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold",
              STUDIO_FOCUS_RING,
              kind === option.kind
                ? "border-accent/60 bg-accent/10 text-fg"
                : "border-line bg-card text-fg-3 hover:border-accent/40 hover:text-fg",
              "disabled:opacity-50",
            )}
          >
            {T(option.label)}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => void runDevice()}
          disabled={busy !== null}
          className={cn(
            "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-on-accent",
            STUDIO_EASE,
            "hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {busy === "device"
            ? <Loader2 size={14} className="animate-spin" aria-hidden />
            : <Sparkles size={14} aria-hidden />}
          {busy === "device" ? T("변환하는 중…") : T("기기에서 애니풍으로 변환")}
        </button>
        {busy === "device" && (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-fg-2",
              STUDIO_EASE,
              "hover:text-fg",
            )}
          >
            <X size={14} aria-hidden />
            {T("취소")}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => void runCloud()}
        disabled={busy !== null || !cloudConfigured}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold",
          STUDIO_EASE,
          STUDIO_FOCUS_RING,
          cloudConfigured
            ? "border-line bg-card text-fg-2 hover:text-fg"
            : "cursor-not-allowed border-line bg-card text-fg-3 opacity-60",
        )}
      >
        {busy === "cloud"
          ? <Loader2 size={14} className="animate-spin" aria-hidden />
          : <Cloud size={14} aria-hidden />}
        {busy === "cloud" ? T("AI로 변환하는 중…") : T("AI로 고화질 변환")}
      </button>
      {!cloudConfigured && (
        <p className="text-[0.66rem] leading-relaxed text-fg-3">
          {T("AI 고화질 변환은 API 키를 등록하면 쓸 수 있어요. 키가 없어도 위 기기 변환은 그대로 됩니다.")}
        </p>
      )}

      {error ? (
        <p role="alert" className="text-xs leading-relaxed text-bad">
          {error}
        </p>
      ) : (
        <p className="text-[0.66rem] leading-relaxed text-fg-3">
          {T("기기 변환은 512px로 줄여 변환한 뒤 원래 크기로 되돌려서 세밀한 선은 조금 뭉개질 수 있어요. 처음 한 번은 스타일 모델(약 8.7MB)을 내려받고, 기기에 따라 수십 초쯤 걸릴 수 있어요.")}
        </p>
      )}
    </div>
  );
}
