/**
 * Layer panel header button for the draft-layer batch visibility toggle.
 *
 * 상태는 이 컴포넌트가 갖지 않는다: 보기 상태(view state)는 문서와 분리해
 * 호출부가 보관하고(페이지/프로젝트 단위 저장), 이 버튼은
 * `studio-draft-layer-visibility`의 뷰 모델대로 그리고 토글 결과만 돌려준다.
 */

import { Eye, EyeOff } from "lucide-react";

import {
  draftLayerToggleView,
  toggleDraftLayerVisibility,
  type DraftLayerViewState,
  type DraftVisibilityLayerLike,
} from "./studio-draft-layer-visibility";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

export interface StudioDraftLayerVisibilityToggleProps<
  T extends DraftVisibilityLayerLike = DraftVisibilityLayerLike,
> {
  readonly layers: readonly T[];
  readonly viewState: DraftLayerViewState;
  /** 토글로 바뀐 레이어와 새 보기 상태를 함께 받는다 (보기 상태는 문서 밖에 저장). */
  readonly onToggle: (
    nextLayers: readonly T[],
    nextViewState: DraftLayerViewState,
  ) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function StudioDraftLayerVisibilityToggle<
  T extends DraftVisibilityLayerLike = DraftVisibilityLayerLike,
>({
  layers,
  viewState,
  onToggle,
  disabled = false,
  className,
}: StudioDraftLayerVisibilityToggleProps<T>) {
  const view = draftLayerToggleView(layers, viewState);
  const isDisabled = disabled || view.disabled;
  const Icon = view.mode === "hide" ? EyeOff : Eye;

  return (
    <button
      type="button"
      aria-pressed={view.pressed}
      aria-label={view.label}
      title={view.description}
      disabled={isDisabled}
      className={buttonClass({
        variant: view.pressed ? "outline" : "ghost",
        size: "sm",
        className: cn("h-7 px-2.5 text-[11px]", STUDIO_FOCUS_RING, className),
      })}
      onClick={() => {
        const result = toggleDraftLayerVisibility(layers, viewState);
        if (result.action !== "noop") onToggle(result.layers, result.viewState);
      }}
    >
      <Icon className="size-3.5" aria-hidden />
      {view.label}
    </button>
  );
}
