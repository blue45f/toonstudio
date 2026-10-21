import { useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioHybridDccFaceDrawPad } from "./StudioHybridDccFaceDrawPad";
import {
  describeStudioFaceModelingDistanceHint,
  describeStudioFaceModelingEntryHint,
  describeStudioFaceModelingKeyHint,
  studioFaceModelingDirectionLabel,
  studioFaceModelingToolLabel,
  studioFaceModelingToolSummary,
} from "./studio-hybrid-dcc-face-modeling-messages";
import {
  formatStudioFaceModelingDistance,
  studioFaceModelingHandleFraction,
  studioFaceModelingHandleValue,
  type StudioFaceModelingDistanceTool,
  type StudioFaceModelingStepScale,
} from "./studio-hybrid-dcc-face-modeling-session";

import type { StudioOffsetDirection } from "./studio-hybrid-dcc-face-modeling-kernel";
import type { StudioFaceModelingTool } from "./studio-hybrid-dcc-face-modeling-workspace";
import type { StudioHybridDccFaceModelingModel } from "./useStudioHybridDccFaceModeling";

const TOOLS: readonly StudioFaceModelingTool[] = ["push-pull", "inset", "offset", "draw"];
const DIRECTIONS: readonly StudioOffsetDirection[] = ["inward", "outward"];
const FIELD =
  "min-h-9 pointer-coarse:min-h-11 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";
const BUTTON =
  "min-h-9 pointer-coarse:min-h-11 min-w-0 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-40";
const CHIP =
  "flex min-h-11 items-center justify-center rounded-lg border border-line bg-card px-2 text-center text-xs font-semibold text-fg-2 peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-40";

/** 키보드 한 단계의 크기: Shift = 세밀, PageUp/PageDown = 크게. */
function stepScale(event: { readonly shiftKey: boolean }, key: string): StudioFaceModelingStepScale {
  if (key === "PageUp" || key === "PageDown") return "coarse";
  return event.shiftKey ? "fine" : "normal";
}

function DistanceHandle({ model, hintId }: { readonly model: StudioHybridDccFaceModelingModel; readonly hintId: string }) {
  const bt = useBilingual("StudioHybridDccFaceModeling");
  const range = model.range;
  const disabled = Boolean(model.unavailable) || Boolean(model.unusable) || !range || model.committing
    || range.handle.max - range.handle.min <= 0;
  const bounds = range?.handle ?? { min: 0, max: 0 };
  const fraction = studioFaceModelingHandleFraction(model.value, bounds);
  const zero = studioFaceModelingHandleFraction(0, bounds);
  const shown = Math.min(bounds.max, Math.max(bounds.min, model.value ?? 0));
  const update = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!(rect.width > 0)) return;
    model.setHandleValue(studioFaceModelingHandleValue((event.clientX - rect.left) / rect.width, bounds));
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
      case "PageUp":
        event.preventDefault();
        model.step(1, stepScale(event, event.key));
        return;
      case "ArrowLeft":
      case "ArrowDown":
      case "PageDown":
        event.preventDefault();
        model.step(-1, stepScale(event, event.key));
        return;
      case "Home":
        event.preventDefault();
        model.setHandleValue(bounds.min);
        return;
      case "End":
        event.preventDefault();
        model.setHandleValue(bounds.max);
        return;
      case "Enter":
        event.preventDefault();
        if (model.pending) model.flushPreview();
        else model.apply();
        return;
    }
  };
  return (
    <div className="grid gap-1">
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={bt("거리 핸들", "Distance handle")}
        aria-orientation="horizontal"
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        aria-valuenow={shown}
        aria-valuetext={`${formatStudioFaceModelingDistance(shown)} m`}
        aria-disabled={disabled || undefined}
        aria-describedby={hintId}
        className="relative h-11 w-full touch-none select-none rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-disabled:opacity-40"
        data-dragging={model.dragging ? "true" : "false"}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // 포인터 캡처를 못 잡아도 끌기는 요소 안에서 계속된다.
          }
          event.currentTarget.focus();
          model.beginDrag();
          update(event);
        }}
        onPointerMove={(event) => {
          if (model.dragging) update(event);
        }}
        onPointerUp={(event) => {
          if (!model.dragging) return;
          update(event);
          model.endDrag();
        }}
        onPointerCancel={() => model.endDrag()}
        onLostPointerCapture={() => model.endDrag()}
      >
        <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-raised" />
        <div
          aria-hidden="true"
          className="absolute top-1/2 h-1.5 -translate-y-1/2 bg-accent/50"
          style={{ left: `${Math.min(zero, fraction) * 100}%`, width: `${Math.abs(fraction - zero) * 100}%` }}
        />
        <div
          aria-hidden="true"
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-card"
          style={{ left: `${fraction * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-fg-3" aria-hidden="true">
        <span>{formatStudioFaceModelingDistance(bounds.min)} m</span>
        <span>{formatStudioFaceModelingDistance(bounds.max)} m</span>
      </div>
    </div>
  );
}

function DistanceControls({
  model,
  tool,
  fieldRef,
}: {
  readonly model: StudioHybridDccFaceModelingModel;
  readonly tool: StudioFaceModelingDistanceTool;
  readonly fieldRef: RefObject<HTMLInputElement | null>;
}) {
  const bt = useBilingual("StudioHybridDccFaceModeling");
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = [hintId, model.error ? `${id}-error` : "", model.hint ? `${id}-note` : ""].filter(Boolean).join(" ");
  const disabled = Boolean(model.unavailable) || Boolean(model.unusable);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      // 입력이 멈추기를 기다리는 중이면 먼저 지금 값으로 미리보기를 보여 준다. 보이는 결과만 적용한다.
      if (model.pending) model.flushPreview();
      else model.apply();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      model.step(event.key === "ArrowUp" || event.key === "PageUp" ? 1 : -1, stepScale(event, event.key));
    }
  };
  return (
    <div className="space-y-2">
      {tool === "offset" ? (
        <fieldset className="min-w-0" disabled={Boolean(model.unavailable)}>
          <legend className="mb-1 text-[11px] text-fg-3">{bt("오프셋 방향", "Offset direction")}</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {DIRECTIONS.map((direction) => (
              <label key={direction} className="relative block">
                <input
                  type="radio"
                  name={`${id}-direction`}
                  value={direction}
                  checked={model.direction === direction}
                  disabled={model.committing}
                  className="peer sr-only"
                  onChange={() => model.setDirection(direction)}
                />
                <span className={CHIP}>{studioFaceModelingDirectionLabel(bt, direction)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="grid gap-1">
        <label htmlFor={`${id}-distance`} className="text-[11px] text-fg-2">
          {bt("거리 (m)", "Distance (m)")}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${id}-distance`}
            ref={fieldRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            maxLength={96}
            className={FIELD}
            value={model.text}
            disabled={disabled}
            readOnly={model.committing}
            placeholder={bt("예: 0.25 · 25cm · 250mm", "e.g. 0.25 · 25cm · 250mm")}
            aria-invalid={model.error ? true : undefined}
            aria-describedby={describedBy}
            aria-keyshortcuts="ArrowUp ArrowDown PageUp PageDown Enter Escape"
            onChange={(event) => model.setText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <span aria-hidden="true" className="text-xs font-semibold text-fg-3">m</span>
        </div>
      </div>
      <DistanceHandle model={model} hintId={hintId} />
      <div id={hintId} className="space-y-0.5 text-[11px] leading-relaxed text-fg-3">
        <p>{describeStudioFaceModelingDistanceHint(bt, tool, model.range?.allowed ?? null)}</p>
        <p>{describeStudioFaceModelingEntryHint(bt)}</p>
        <p>{describeStudioFaceModelingKeyHint(bt, model.stepSize)}</p>
      </div>
      {model.hint ? <p id={`${id}-note`} className="text-xs text-fg-2">{model.hint}</p> : null}
      {model.error ? <p id={`${id}-error`} role="alert" className="text-xs text-bad">{model.error}</p> : null}
    </div>
  );
}

function FaceModelingBody({ model }: { readonly model: StudioHybridDccFaceModelingModel }) {
  const bt = useBilingual("StudioHybridDccFaceModeling");
  const id = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const tool = model.tool;
  const state = model.committing ? "committing" : model.engaged ? "previewing" : "idle";
  const stateText = state === "committing"
    ? bt("적용 중", "Applying")
    : state === "previewing"
      ? bt("미리보기 중 (아직 확정되지 않음)", "Previewing (not confirmed yet)")
      : bt("대기", "Idle");
  const status = model.unavailable ?? model.unusable ?? (model.notice || model.previewSummary || "");
  const finish = (action: () => void) => {
    action();
    fieldRef.current?.focus();
  };
  return (
    <div className="space-y-3 border-t border-line p-3" data-studio-hybrid-dcc-face-modeling-body="true">
      <p className="text-[11px] leading-relaxed text-fg-3">
        {bt(
          "면을 선택한 뒤 정확한 거리를 입력하거나 핸들을 끌어 모델링합니다. 확정하기 전에는 3D 화면에 미리보기만 보이고 문서와 되돌리기 기록은 바뀌지 않으며, 확정은 되돌리기 한 번으로 원래대로 돌아갑니다. 따라 만들기(Follow Me)는 지원하지 않습니다.",
          "Select a face, then type an exact distance or drag the handle. Until you confirm, only a preview shows in the 3D view and neither the document nor the undo history changes; confirming is a single undo step. Follow Me is not supported.",
        )}
      </p>
      <fieldset className="min-w-0">
        <legend className="mb-1 text-[11px] text-fg-3">{bt("면 모델링 도구", "Face modeling tool")}</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {TOOLS.map((candidate) => (
            <label key={candidate} className="relative block">
              <input
                type="radio"
                name={`${id}-tool`}
                value={candidate}
                checked={tool === candidate}
                disabled={model.committing || Boolean(model.unavailable)}
                className="peer sr-only"
                onChange={() => model.setTool(candidate)}
              />
              <span className={CHIP}>{studioFaceModelingToolLabel(bt, candidate)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs leading-relaxed text-fg-2">{studioFaceModelingToolSummary(bt, tool)}</p>
      <p className="text-[11px] tabular-nums text-fg-3" data-state={state} data-studio-hybrid-dcc-face-modeling-state="true">
        {formatI18nTemplate(bt("도구 {tool} · 선택한 면 {count}개 · 상태 {state}", "Tool {tool} · {count} faces selected · State {state}"), {
          tool: studioFaceModelingToolLabel(bt, tool),
          count: model.selectionCount,
          state: stateText,
        })}
      </p>
      {tool === "draw" ? (
        <StudioHybridDccFaceDrawPad model={model} />
      ) : (
        <DistanceControls model={model} tool={tool} fieldRef={fieldRef} />
      )}
      {tool === "draw" && model.error ? <p role="alert" className="text-xs text-bad">{model.error}</p> : null}
      {tool === "draw" && model.hint ? <p className="text-xs text-fg-2">{model.hint}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`${BUTTON} border-accent/60 bg-accent-soft text-accent`}
          aria-disabled={!model.canApply || undefined}
          aria-keyshortcuts="Enter"
          onClick={() => finish(() => { if (model.canApply) model.apply(); })}
        >
          {bt("적용", "Apply")}
        </button>
        <button
          type="button"
          className={BUTTON}
          aria-disabled={!model.engaged || model.committing || undefined}
          aria-keyshortcuts="Escape"
          onClick={() => finish(() => { if (model.engaged && !model.committing) model.cancel(); })}
        >
          {bt("취소", "Cancel")}
        </button>
      </div>
      <p role="status" className="min-h-4 text-xs text-fg-2">{status}</p>
    </div>
  );
}

/** 면 단위 모델링 작업대: 밀기/당기기·안쪽 테두리·오프셋·면 그리기를 정확한 수치와 핸들로 쓴다. */
export function StudioHybridDccFaceModelingTools({ model }: { readonly model: StudioHybridDccFaceModelingModel }) {
  const bt = useBilingual("StudioHybridDccFaceModeling");
  const id = useId();
  return (
    <section
      ref={model.sectionRef}
      className="mt-2 overflow-hidden rounded-xl border border-line bg-panel"
      aria-label={bt("면 모델링 작업대", "Face modeling workbench")}
      data-studio-hybrid-dcc-face-modeling="true"
    >
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        aria-expanded={model.open}
        aria-controls={id}
        onClick={() => model.setOpen(!model.open)}
      >
        <span>{bt("면 모델링 · 밀기/당기기 · 안쪽 테두리 · 오프셋 · 면 그리기", "Face modeling · Push/Pull · Inset · Offset · Draw face")}</span>
        <span aria-hidden="true">{model.open ? "−" : "+"}</span>
      </button>
      <div id={id} hidden={!model.open}>
        {model.open ? <FaceModelingBody model={model} /> : null}
      </div>
    </section>
  );
}
