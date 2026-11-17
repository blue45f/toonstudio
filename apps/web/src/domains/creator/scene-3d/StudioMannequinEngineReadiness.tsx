import { AlertTriangle, ArrowLeft, Check, Loader2, RefreshCw } from "lucide-react";

import type { StudioMannequinEngineState } from "./studio-mannequin-webgl-probe";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export function StudioMannequinEngineStatusBadge({
  state,
}: {
  readonly state: StudioMannequinEngineState;
}) {
  const bt = useBilingual("StudioMannequinPoserPanel");
  const label =
    state === "ready"
      ? bt("준비됨 · WebGL2 3D", "Ready · WebGL2 3D")
      : state === "error"
        ? bt("오류 · WebGL2 미지원", "Error · WebGL2 unavailable")
        : bt("초기화 중 · 3D 포저", "Initializing · 3D Poser");
  const compactLabel =
    state === "ready"
      ? "WebGL2"
      : state === "error"
        ? bt("미지원", "No WebGL2")
        : bt("준비 중", "Init");

  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="studio-poser-engine-status"
      data-engine-state={state}
      className={cn(
        "inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold [word-break:keep-all]",
        state === "ready"
          ? "border-good/35 bg-good/10 text-good"
          : state === "error"
            ? "border-warn/45 bg-warn/10 text-warn"
            : "border-line bg-card/70 text-fg-2",
      )}
    >
      {state === "initializing" ? (
        <Loader2 size={11} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
      ) : state === "ready" ? (
        <Check size={11} className="shrink-0" aria-hidden />
      ) : (
        <AlertTriangle size={11} className="shrink-0" aria-hidden />
      )}
      <span className="sm:hidden" aria-hidden="true">{compactLabel}</span>
      <span className="sr-only sm:not-sr-only sm:inline">{label}</span>
    </span>
  );
}

export function StudioMannequinSceneErrorStage({
  message,
  onRetry,
  onReturnToStudio,
  presentation = "modal",
}: {
  readonly message: string;
  readonly onRetry: () => void;
  readonly onReturnToStudio: () => void;
  readonly presentation?: "modal" | "page";
}) {
  const bt = useBilingual("StudioMannequinPoserPanel");

  return (
    <div
      role="alert"
      data-testid="studio-poser-webgl-error-card"
      className="grid h-full place-items-center p-5 text-center"
    >
      <div className="max-w-md rounded-2xl border border-warn/40 bg-card/85 p-5 shadow-lg">
        <span className="mx-auto grid size-10 place-items-center rounded-xl bg-warn/15 text-warn">
          <AlertTriangle size={20} aria-hidden />
        </span>
        <p className="mt-3 text-sm font-bold text-fg [word-break:keep-all]">
          {bt(
            "이 브라우저에서는 3D 데생 인형 화면을 열 수 없습니다",
            "This browser can't open the 3D Mannequin view",
          )}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">{message}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-fg-3 [word-break:keep-all]">
          {bt(
            "브라우저 설정에서 하드웨어 가속(WebGL 2)을 켜고 다시 확인하거나, 저장된 포즈·2D 원고를 유지한 채 스튜디오로 안전하게 돌아갈 수 있습니다.",
            "Turn on hardware acceleration (WebGL 2) in browser settings and check again, or return safely to 2D Studio with your saved pose and manuscript intact.",
          )}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            data-testid="studio-poser-retry-webgl"
            onClick={onRetry}
            className={buttonClass({ size: "sm", variant: "outline", className: "min-h-11 gap-1.5" })}
          >
            <RefreshCw size={14} aria-hidden />
            {bt("다시 확인", "Check again")}
          </button>
          <button
            type="button"
            data-testid="studio-poser-return-studio"
            onClick={onReturnToStudio}
            className={buttonClass({ size: "sm", variant: "solid", className: "min-h-11 gap-1.5" })}
          >
            <ArrowLeft size={14} aria-hidden />
            {presentation === "page"
              ? bt("2D 원고 스튜디오로 복귀", "Return to 2D Studio")
              : bt("2D 원고로 돌아가기", "Back to 2D canvas")}
          </button>
        </div>
      </div>
    </div>
  );
}
