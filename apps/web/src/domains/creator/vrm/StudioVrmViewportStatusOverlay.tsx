import { AlertTriangle, Loader2, Upload } from "lucide-react";

import { frozenStatus5Text } from "../status-i18n/studio-frozen5-status-i18n";

import { cx } from "./studio-vrm-poser-helpers";
import { CONTROL_BUTTON } from "./StudioVrmPoserTypes";

export function StudioVrmViewportStatusOverlay({
  status,
  presentation,
  error,
  onOpenLibrary,
  onSampleLoad,
}: {
  readonly status: string;
  readonly presentation: "poser" | "shaper";
  readonly error: string | null | undefined;
  readonly onOpenLibrary: () => void;
  readonly onSampleLoad: () => void;
}) {
  return (
    <>
      {status === "empty" && presentation === "poser" ? (
        <div className="absolute inset-0 grid place-items-center bg-card/50 p-6 text-center backdrop-blur-[1px]">
          <div className="max-w-[22rem]">
            <div className="mx-auto grid size-12 place-items-center rounded-xl border border-accent/35 bg-accent-soft text-accent">
              <Upload size={22} aria-hidden />
            </div>
            <p className="mt-4 text-sm font-bold text-fg">VRM 모델을 불러와 장면을 시작하세요.</p>
            <p className="mt-2 text-xs leading-relaxed text-fg-3">
              내 .vrm 파일을 업로드하거나 모델 라이브러리에서 준비된 모델을 선택하세요. 불러온 뒤 조형, 포즈, 의상과 소품을 자유롭게 편집할 수 있습니다.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                className={cx(CONTROL_BUTTON, "border-accent/50 bg-accent text-on-accent")}
                onClick={onOpenLibrary}
              >
                <Upload size={14} aria-hidden />
                모델 라이브러리
              </button>
              <button
                type="button"
                className={cx(CONTROL_BUTTON, "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg")}
                onClick={onSampleLoad}
              >
                루미 불러오기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {status === "loading" ? (
        <div
          className="absolute inset-0 grid place-items-center bg-card/45 p-6 text-center backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <div>
            <Loader2 className="mx-auto animate-spin motion-reduce:animate-none text-accent" size={30} aria-hidden />
            <p className="mt-3 text-sm font-semibold text-fg">
              {frozenStatus5Text("studio.frozenStatus5.vrmViewport.loading", "VRM을 불러오는 중입니다.")}
            </p>
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div
          className="absolute inset-x-3 bottom-3 rounded-xl border border-line bg-panel/95 p-3 text-sm shadow-xl backdrop-blur"
          role="alert"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 shrink-0 text-accent" size={16} aria-hidden />
            <div>
              <p className="font-semibold text-fg">
                {frozenStatus5Text("studio.frozenStatus5.vrmViewport.loadFailed", "불러오기에 실패했습니다.")}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
                {error || frozenStatus5Text("studio.frozenStatus5.vrmViewport.loadFailedDetail", "파일 형식 또는 경로를 확인해 주세요.")}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
