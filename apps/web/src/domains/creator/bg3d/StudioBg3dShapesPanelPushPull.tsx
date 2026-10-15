import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { StudioBg3dLengthField } from "./StudioBg3dLengthField";
import { studioBg3dClassNames as cx } from "./studio-bg3d-editor-ui";
import { STUDIO_BG3D_LENGTH_INPUT_EXAMPLES, parseStudioBg3dLengthInput } from "./studio-bg3d-inference-units";
import type { StudioBg3dSnapSettings } from "./studio-bg3d-object-ops";
import {
  STUDIO_BG3D_PUSH_PULL_MAX_DISTANCE,
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
  // 입력창은 "2.4m·80cm·1200mm·3'6\"" 같은 텍스트가 정본이다. 올바르게 읽히면 부모의 숫자 상태도 맞춘다.
  const [distanceText, setDistanceText] = useState(() => String(pushPullDistance));

  const applyPushPull = () => {
    const parsed = parseStudioBg3dLengthInput(distanceText, {
      allowNegative: true,
      maxMeters: STUDIO_BG3D_PUSH_PULL_MAX_DISTANCE,
    });
    // 형식 오류는 입력창이 이유와 예시를 role=alert 로 알린다.
    if (!parsed.ok) return;
    const availableAxes = studioBg3dPushPullAxes(primitive.kind);
    const effectiveAxis = availableAxes.includes(pushPullAxis)
      ? pushPullAxis
      : availableAxes[0];
    if (!effectiveAxis) return;
    // 직접 입력한 길이는 정확히 적용한다 — 눈금 스냅으로 반올림하지 않는다.
    const result = planStudioBg3dPushPull(primitive, {
      axis: effectiveAxis,
      face: pushPullFace,
      distance: parsed.meters,
    });
    if (!result.ok) {
      setPushPullFeedback(result.message);
      return;
    }
    setPushPullDistance(parsed.meters);
    updateTransform(primitive.id, result.patch, { snap: false });
    setPushPullFeedback(
      `${effectiveAxis.toUpperCase()}${pushPullFace === "positive" ? "+" : "−"} 면 ${result.appliedDistance >= 0 ? "+" : ""}${result.appliedDistance.toFixed(2)}m · 반대 면 고정`,
    );
  };

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

          <StudioBg3dLengthField
            id="studio-bg3d-push-pull-distance"
            className="mt-2"
            label="이동 거리"
            text={distanceText}
            disabled={locked}
            submitLabel="적용"
            hint={`예: ${STUDIO_BG3D_LENGTH_INPUT_EXAMPLES.join(", ")} · 단위가 없으면 m`}
            parseOptions={{ allowNegative: true, maxMeters: STUDIO_BG3D_PUSH_PULL_MAX_DISTANCE }}
            onTextChange={(next) => {
              setDistanceText(next);
              setPushPullFeedback(null);
              const parsed = parseStudioBg3dLengthInput(next, {
                allowNegative: true,
                maxMeters: STUDIO_BG3D_PUSH_PULL_MAX_DISTANCE,
              });
              if (parsed.ok) setPushPullDistance(parsed.meters);
            }}
            onSubmit={applyPushPull}
          />

          <p
            aria-live="polite"
            className="mt-2 min-h-4 text-[0.62rem] leading-relaxed text-fg-3"
          >
            {pushPullFeedback
              ?? (snapSettings.enabled
                ? "입력한 길이를 그대로 적용합니다(눈금 스냅 제외) · 음수는 안쪽으로 당깁니다."
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
