import { useId, type RefObject } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioHybridDccFaceModelingModel } from "./useStudioHybridDccFaceModeling";

/** 현재 선택 면에서 시작하는 경로를 입력한다. 미리보기·확정은 기존 면 모델링 명령이 소유한다. */
export function StudioHybridDccFollowMePath({ model, fieldRef }: {
  readonly model: StudioHybridDccFaceModelingModel;
  readonly fieldRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const bt = useBilingual("StudioHybridDccFaceModeling");
  const id = useId();
  const disabled = model.committing || Boolean(model.unavailable) || Boolean(model.unusable);
  const guide = model.followMeGuide;
  return (
    <div className="space-y-2" data-testid="studio-follow-me-path">
      <p id={`${id}-hint`} className="text-xs leading-relaxed text-fg-2">
        {bt("각 줄에 경로 한 점의 X, Y, Z를 입력하세요. 오브젝트의 좌표와 모델 단위를 사용합니다. 첫 점은 선택 면의 중심이고 첫 구간은 면 바깥 법선 방향입니다. 열린 경로를 지원하며, 되돌아가거나 모델과 겹치는 경로는 적용하지 않습니다.",
          "Enter one X, Y, Z path point per line, in object coordinates and model units. Start at the selected face centre and move outward along its normal. Use an open path; paths that turn back or overlap the model cannot be applied.")}
      </p>
      {guide ? <p className="break-words text-xs tabular-nums text-fg-3">
        {bt("면 중심", "Face centre")}: {[guide.centroid.x, guide.centroid.y, guide.centroid.z].map((value) => Number(value.toPrecision(8))).join(", ")}
      </p> : null}
      <button type="button" disabled={disabled || !guide} onClick={model.makeNormalPath}
        className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40">
        {bt("법선 방향 경로 만들기", "Create a normal-direction path")}
      </button>
      <label htmlFor={id} className="block text-xs text-fg-2">{bt("따라 만들기 경로 · X, Y, Z", "Follow Me path · X, Y, Z")}</label>
      <textarea ref={fieldRef} id={id} value={model.pathText} rows={5} maxLength={16384} disabled={disabled}
        aria-invalid={Boolean(model.error)} aria-describedby={`${id}-hint${model.error ? ` ${id}-error` : ""}`}
        onChange={(event) => model.setPathText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || event.nativeEvent.isComposing || event.keyCode === 229) return;
          event.preventDefault();
          if (model.pending) model.flushPreview();
          else if (model.canApply) model.apply();
        }}
        className="w-full min-w-0 rounded-lg border border-line bg-card px-2 py-2 font-mono text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40" />
      {model.error ? <p id={`${id}-error`} role="alert" className="text-xs text-bad">{model.error}</p> : null}
      {model.hint ? <p className="text-xs text-fg-2">{model.hint}</p> : null}
    </div>
  );
}
