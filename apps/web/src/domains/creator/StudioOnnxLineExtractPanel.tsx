import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import { Loader2, PencilLine, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  STUDIO_PHOTO_DEVELOP_PRESETS,
  resolveStudioPhotoDevelopPreset,
} from "./studio-photo-develop";

// 사진에서 선 추출 패널 — 참조 사진·포즈 자료를 밑그림용 흑백 선화로
// 바꾼다. TEED(엣지 검출, MIT)를 기기에서 실행한다(100% 브라우저, 무료).
// 민감도는 로컬 상태로만 조정하고 버튼을 누를 때 한 번만 실행하는
// one-shot 패턴(StudioLineCleanupPanel과 동일). 모델·런타임은 실행
// 시점에 동적 import로 지연 로딩된다.
//
// 실행 전에 비파괴 전처리(현상) 프리셋을 고를 수 있다 — 대비·안개
// 제거·화이트밸런스로 사진 결함을 고쳐 선 추출 품질을 올리는 입력
// 단계이며, 원본 사진은 바뀌지 않는다. 프리셋을 고르면 원본 선화와
// 전처리 선화를 나란히 보여줘 비교한 뒤 쓸 수 있고, 결과(onResult)는
// 전처리를 적용한 선화다. 완성 컷의 톤을 입히는 '색감 맞추기'와는
// 역할이 다르다(경계: studio-photo-develop.ts 머리말).
export function StudioOnnxLineExtractPanel({
  src,
  onResult,
}: {
  src: string;
  onResult: (dataUrl: string) => void;
}) {
  const [sensitivity, setSensitivity] = useState(0.5);
  const [developPresetId, setDevelopPresetId] = useState("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<{
    original: string;
    developed: string | null;
  } | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setPreviews(null);
    setError(null);
  }, [src]);

  // 프리셋을 바꾸면 이전 비교 결과는 낡은 것이므로 지운다.
  useEffect(() => {
    setPreviews(null);
  }, [developPresetId]);

  const developPreset = resolveStudioPhotoDevelopPreset(developPresetId);
  const developActive = developPreset.id !== "none";

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const service = await import("./studio-onnx-line-extract");
      if (developActive) {
        // 원본과 전처리를 모두 실행해 나란히 비교할 수 있게 한다.
        const original = await service.extractLineArtOnDevice(src, {
          sensitivity,
        });
        if (!mountedRef.current) return;
        const developed = await service.extractLineArtOnDevice(src, {
          sensitivity,
          develop: developPreset.settings,
        });
        if (!mountedRef.current) return;
        setPreviews({
          original: original.dataUrl,
          developed: developed.dataUrl,
        });
        onResult(developed.dataUrl);
      } else {
        const result = await service.extractLineArtOnDevice(src, {
          sensitivity,
        });
        if (!mountedRef.current) return;
        setPreviews({ original: result.dataUrl, developed: null });
        onResult(result.dataUrl);
      }
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error ? cause.message : r3c07StatusText("studio.panelStatus.r3c07.onnxLineExtract.extractFailed", "선 추출에 실패했어요."),
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-line bg-panel/50 p-3"
      data-studio-onnx-line-extract-panel="true"
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-fg-1">
        <PencilLine size={14} className="text-accent" aria-hidden />
        사진에서 선 추출
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 text-xs text-fg-2">
          <SlidersHorizontal size={12} className="text-fg-3" aria-hidden />
          전처리 (사진 현상)
        </span>
        <div className="flex flex-wrap gap-1">
          {STUDIO_PHOTO_DEVELOP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={developPresetId === preset.id}
              title={preset.tip}
              onClick={() => setDevelopPresetId(preset.id)}
              disabled={busy}
              className={
                developPresetId === preset.id
                  ? "rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-on-accent disabled:opacity-60"
                  : "rounded-full border border-line bg-card px-2.5 py-1 text-xs text-fg-2 transition-colors hover:text-fg-1 disabled:opacity-60"
              }
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="text-[0.7rem] leading-relaxed text-fg-3">
          {developPreset.tip}
        </p>
      </div>

      {previews && (
        <div className="flex gap-2">
          <figure className="min-w-0 flex-1 overflow-hidden rounded-lg border border-line bg-card">
            <img
              src={previews.original}
              alt="원본 사진에서 추출한 선화 미리보기"
              className="max-h-32 w-full object-contain"
            />
            <figcaption className="px-2 py-1 text-[10px] text-fg-3">
              원본 선화
            </figcaption>
          </figure>
          {previews.developed && (
            <figure className="min-w-0 flex-1 overflow-hidden rounded-lg border border-accent/50 bg-card">
              <img
                src={previews.developed}
                alt="전처리를 적용한 사진에서 추출한 선화 미리보기"
                className="max-h-32 w-full object-contain"
              />
              <figcaption className="px-2 py-1 text-[10px] text-fg-3">
                전처리 선화 · {developPreset.label}
              </figcaption>
            </figure>
          )}
        </div>
      )}

      <label className="flex items-center justify-between gap-2 text-xs text-fg-2">
        선 민감도
        <span className="flex items-center gap-1.5">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            disabled={busy}
            className="w-24 cursor-pointer accent-accent"
          />
          <span className="w-8 text-right text-[10px] tabular-nums text-fg-3">
            {sensitivity.toFixed(2)}
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-on-accent transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy
          ? <Loader2 size={14} className="animate-spin" aria-hidden />
          : <PencilLine size={14} aria-hidden />}
        {busy ? "선을 추출하는 중…" : "선 추출"}
      </button>

      {error ? (
        <p role="alert" className="text-xs leading-relaxed text-bad">
          {error}
        </p>
      ) : (
        <p className="text-[0.7rem] leading-relaxed text-fg-3">
          참조 사진의 윤곽만 남겨 밑그림으로 바꿔요 — TEED 모델을 기기에서
          실행합니다(100% 브라우저, 무료). 민감도를 올리면 옅은 선도
          잡아냅니다. 전처리는 선 추출에만 쓰이고 원본 사진은 바뀌지
          않으며, 완성 컷의 색감을 입히는 색감 맞추기와는 다른 단계예요.
          결과로 현재 이미지가 교체되며 실행 취소로 되돌릴 수 있어요.
        </p>
      )}
    </div>
  );
}
