import type { Dispatch, SetStateAction } from "react";

import {
  STUDIO_BG3D_CONTROL_BUTTON as CONTROL_BUTTON,
  studioBg3dClassNames as cx,
} from "./studio-bg3d-editor-ui";
import type { StudioBg3dSnapSettings } from "./studio-bg3d-object-ops";
import {
  planStudioBg3dPushPull,
  studioBg3dPushPullAxes,
  type StudioBg3dPushPullAxis,
  type StudioBg3dPushPullFace,
} from "./studio-bg3d-push-pull";

import type { BgPrimitive } from "../studio-background-3d-primitives";

interface StudioBg3dPushPullSectionProps {
  readonly primitive: BgPrimitive;
  readonly locked: boolean;
  readonly snapSettings: StudioBg3dSnapSettings;
  readonly updateTransform: (
    id: string,
    patch: Partial<Pick<BgPrimitive, "position" | "rotation" | "scale">>,
    options?: { readonly snap?: boolean },
  ) => void;
  readonly axis: StudioBg3dPushPullAxis;
  readonly face: StudioBg3dPushPullFace;
  readonly distance: number;
  readonly feedback: string | null;
  readonly setAxis: Dispatch<SetStateAction<StudioBg3dPushPullAxis>>;
  readonly setFace: Dispatch<SetStateAction<StudioBg3dPushPullFace>>;
  readonly setDistance: Dispatch<SetStateAction<number>>;
  readonly setFeedback: Dispatch<SetStateAction<string | null>>;
}

/** 선택한 프리미티브의 한 면만 이동하는 Push/Pull 편집 섹션. 상태는 패널이 소유하고 이 섹션은 제어 컴포넌트로 동작한다. */
export function StudioBg3dPushPullSection({
  primitive,
  locked,
  snapSettings,
  updateTransform,
  axis: pushPullAxis,
  face: pushPullFace,
  distance: pushPullDistance,
  feedback: pushPullFeedback,
  setAxis: setPushPullAxis,
  setFace: setPushPullFace,
  setDistance: setPushPullDistance,
  setFeedback: setPushPullFeedback,
}: StudioBg3dPushPullSectionProps) {
  return (
    <section
      aria-label="면 밀기·당기기"
      className="rounded-xl border border-line/80 bg-card/70 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-fg">
            면 밀기·당기기
          </h4>
          <p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">
            선택한 면만 수치만큼 이동하고 반대 면은 그 자리에 고정합니다.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-accent/25 bg-accent-soft px-2 py-0.5 text-[0.6rem] font-bold text-accent">
          Push/Pull
        </span>
      </div>

      {studioBg3dPushPullAxes(primitive.kind).length > 0 ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {(["x", "y", "z"] as const).map((axis) => {
              const available = studioBg3dPushPullAxes(
                primitive.kind,
              ).includes(axis);
              return (
                <button
                  key={axis}
                  type="button"
                  disabled={!available || locked}
                  aria-pressed={pushPullAxis === axis}
                  className={cx(
                    "min-h-9 rounded-lg border text-[0.68rem] font-bold uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                    pushPullAxis === axis && available
                      ? "border-accent/55 bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised",
                  )}
                  onClick={() => {
                    setPushPullAxis(axis);
                    setPushPullFeedback(null);
                  }}
                >
                  {axis}축
                </button>
              );
            })}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(
              [
                ["negative", "− 면"],
                ["positive", "+ 면"],
              ] as const
            ).map(([face, label]) => (
              <button
                key={face}
                type="button"
                disabled={locked}
                aria-pressed={pushPullFace === face}
                className={cx(
                  "min-h-9 rounded-lg border text-[0.68rem] font-semibold transition-colors disabled:opacity-35",
                  pushPullFace === face
                    ? "border-accent/55 bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised",
                )}
                onClick={() => {
                  setPushPullFace(face);
                  setPushPullFeedback(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-2">
            <label
              htmlFor="studio-bg3d-push-pull-distance"
              className="block text-[0.65rem] font-semibold text-fg-3"
            >
              이동 거리
            </label>
            <div className="mt-1 flex gap-1.5">
              <span className="flex min-h-10 flex-1 items-center overflow-hidden rounded-lg border border-line bg-panel focus-within:border-accent">
                <input
                  id="studio-bg3d-push-pull-distance"
                  type="number"
                  min={-1_000}
                  max={1_000}
                  step={
                    snapSettings.enabled
                      ? snapSettings.translateStep
                      : 0.1
                  }
                  value={pushPullDistance}
                  disabled={locked}
                  aria-label="Push/Pull 이동 거리"
                  className="min-w-0 flex-1 bg-transparent px-2.5 text-xs font-semibold text-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
                  onChange={(event) => {
                    setPushPullDistance(
                      event.currentTarget.valueAsNumber,
                    );
                    setPushPullFeedback(null);
                  }}
                />
                <span className="pr-2.5 text-[0.65rem] text-fg-3">
                  m
                </span>
              </span>
              <button
                type="button"
                disabled={locked}
                className={cx(
                  CONTROL_BUTTON,
                  "min-h-10 shrink-0 border-accent/45 bg-accent px-3 text-on-accent hover:brightness-105 disabled:opacity-40",
                )}
                onClick={() => {
                  const availableAxes =
                    studioBg3dPushPullAxes(
                      primitive.kind,
                    );
                  const effectiveAxis =
                    availableAxes.includes(pushPullAxis)
                      ? pushPullAxis
                      : availableAxes[0];
                  if (!effectiveAxis) return;
                  const result = planStudioBg3dPushPull(
                    primitive,
                    {
                      axis: effectiveAxis,
                      face: pushPullFace,
                      distance: pushPullDistance,
                      snapStep: snapSettings.enabled
                        ? snapSettings.translateStep
                        : undefined,
                    },
                  );
                  if (!result.ok) {
                    setPushPullFeedback(result.message);
                    return;
                  }
                  updateTransform(
                    primitive.id,
                    result.patch,
                    { snap: false },
                  );
                  setPushPullFeedback(
                    `${effectiveAxis.toUpperCase()}${pushPullFace === "positive" ? "+" : "−"} 면 ${result.appliedDistance >= 0 ? "+" : ""}${result.appliedDistance.toFixed(2)}m · 반대 면 고정`,
                  );
                }}
              >
                적용
              </button>
            </div>
          </div>

          <p
            aria-live="polite"
            className="mt-2 min-h-4 text-[0.62rem] leading-relaxed text-fg-3"
          >
            {pushPullFeedback
              ?? (snapSettings.enabled
                ? `${snapSettings.translateStep}m 스냅 적용 · 음수는 안쪽으로 당깁니다.`
                : "음수는 안쪽으로 당기며 최소 두께는 0.01m입니다.")}
          </p>
        </>
      ) : (
        <p className="mt-2 rounded-lg border border-line bg-panel px-2.5 py-2 text-[0.65rem] leading-relaxed text-fg-3">
          곡면·테이퍼 도형은 형태를 속이지 않도록 비활성화했습니다.
          현재 상자 전 방향과 기둥·파이프의 높이 면을 지원합니다.
        </p>
      )}
    </section>
  );
}
