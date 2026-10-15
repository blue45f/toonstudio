/**
 * 추론 HUD — 현재 추론 종류, 잠금 상태 배지, 방향키 잠금 버튼, 길이 직접 입력(VCB), 스크린리더 안내.
 *
 * 포인터 없이도 같은 결과에 도달하는 경로를 한 곳에 모았다.
 *  - 방향키(→ X, ← Z, ↑ Y, ↓ 평행·수직)와 같은 일을 하는 토글 버튼 4개 (aria-pressed, aria-keyshortcuts)
 *  - 길이 입력창: "2.4m", "80cm", "1200mm", "3'6\"" + Enter/적용 버튼
 *  - 키보드 점 고르기 목록: 마우스 없이 시작·끝점을 정한다
 *  - 항상 마운트된 live region: 추론이 바뀌거나 잠금·취소·오류가 생길 때 읽어 준다
 * 색에만 의존하지 않도록 축마다 선 무늬(점선 간격)와 문자(X/Y/Z)를 함께 쓴다.
 */

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { StudioBg3dInferenceKeyboardPicker } from "./StudioBg3dInferenceKeyboardPicker";
import { StudioBg3dInferenceMarker } from "./StudioBg3dInferenceMarker";
import { StudioBg3dLengthField } from "./StudioBg3dLengthField";
import {
  STUDIO_BG3D_INFERENCE_AXIS_STYLE,
  STUDIO_BG3D_INFERENCE_TONE_TEXT_CLASS,
  describeStudioBg3dInferenceAxis,
  studioBg3dInferenceKindLabel,
} from "./studio-bg3d-inference-kinds";
import { STUDIO_BG3D_INFERENCE_VCB_HINT } from "./studio-bg3d-inference-session";
import { formatStudioBg3dMeasurementLength } from "./studio-bg3d-measurement";

import type {
  StudioBg3dInferenceAxis,
  StudioBg3dInferenceAxisRoles,
} from "./studio-bg3d-inference-kinds";
import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type {
  StudioBg3dInferenceSessionState,
  StudioBg3dInferenceTool,
} from "./studio-bg3d-inference-session";
import type { StudioBg3dInferenceService } from "./studio-bg3d-inference-service";
import type { StudioBg3dInferenceResult } from "./studio-bg3d-inference-types";
import type { ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const TOOL_LABEL: Readonly<Record<StudioBg3dInferenceTool, string>> = Object.freeze({
  measure: "줄자",
  move: "이동",
  "push-pull": "밀기·당기기",
  wall: "벽 그리기",
  generic: "추론",
});

type LockRole = "first" | "second" | "vertical";

const AXIS_KEYS: ReadonlyArray<{ readonly role: LockRole; readonly arrow: string; readonly key: string }> = [
  { role: "first", arrow: "→", key: "ArrowRight" },
  { role: "second", arrow: "←", key: "ArrowLeft" },
  { role: "vertical", arrow: "↑", key: "ArrowUp" },
];

/** 축 선 무늬 미리보기 — 월드 단위 점선 간격을 화면용으로 키운다. */
function axisDashArray(axis: StudioBg3dInferenceAxis): string {
  const [dash, gap] = STUDIO_BG3D_INFERENCE_AXIS_STYLE[axis].dash;
  return `${Math.round(dash * 50)} ${Math.round(gap * 50)}`;
}

function AxisSwatch({ axis }: { readonly axis: StudioBg3dInferenceAxis }) {
  const toneClass = STUDIO_BG3D_INFERENCE_TONE_TEXT_CLASS[STUDIO_BG3D_INFERENCE_AXIS_STYLE[axis].tone];
  return (
    <svg
      viewBox="0 0 24 6"
      width={24}
      height={6}
      aria-hidden="true"
      focusable="false"
      className={cx("shrink-0", toneClass)}
    >
      <line
        x1="0"
        y1="3"
        x2="24"
        y2="3"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="butt"
        strokeDasharray={axisDashArray(axis)}
      />
    </svg>
  );
}

function holdLabel(hold: NonNullable<StudioBg3dInferenceSessionState["hold"]>): string {
  if (hold.kind === "line") return studioBg3dInferenceKindLabel(hold.from, hold.axis);
  if (hold.kind === "plane") return "면 위";
  return studioBg3dInferenceKindLabel(hold.from);
}

interface LockBadge {
  readonly id: string;
  readonly text: string;
  readonly axis: StudioBg3dInferenceAxis | null;
}

function collectLockBadges(session: StudioBg3dInferenceSessionState): LockBadge[] {
  const badges: LockBadge[] = [];
  if (session.lock.kind === "axis") {
    badges.push({
      id: "lock-axis",
      text: `잠금 · ${describeStudioBg3dInferenceAxis(session.lock.axis)}`,
      axis: session.lock.axis,
    });
  } else if (session.lock.kind === "direction") {
    badges.push({
      id: "lock-direction",
      text: `${session.lock.relation === "parallel" ? "평행" : "수직"} 잠금 · ${session.lock.referenceLabel}`,
      axis: null,
    });
  }
  if (session.hold) {
    badges.push({ id: "hold", text: `Shift 유지 · ${holdLabel(session.hold)}`, axis: null });
  }
  return badges;
}

export interface StudioBg3dInferenceHudProps {
  readonly service: StudioBg3dInferenceService;
  /** 키보드 점 고르기에서 점을 골랐을 때 도구에 전달한다 (줄자의 시작·끝점 등). */
  readonly onPickPoint?: (point: StudioBg3dInferenceVec3, result: StudioBg3dInferenceResult) => void;
  /** 키보드 점 고르기 목록을 보일지(기본 true). */
  readonly showPicker?: boolean;
  /** 도구 전용 추가 영역(예: 줄자의 길이 잠금 안내). */
  readonly footer?: ReactNode;
  readonly className?: string;
}

function useServiceSnapshot(service: StudioBg3dInferenceService) {
  return useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
}

export function StudioBg3dInferenceHud({
  service,
  onPickPoint,
  showPicker = true,
  footer,
  className,
}: StudioBg3dInferenceHudProps) {
  const snapshot = useServiceSnapshot(service);
  const { session, live, measuredMeters } = snapshot;
  const showPanel = session.active && snapshot.options.hud;
  const inputRef = useRef<HTMLInputElement>(null);
  const [focusTick, setFocusTick] = useState(0);

  useEffect(() => service.registerVcbFocus(() => setFocusTick((tick) => tick + 1)), [service]);
  useLayoutEffect(() => {
    if (focusTick === 0) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, [focusTick]);

  const roles: StudioBg3dInferenceAxisRoles = service.getAxisRoles();
  const result = session.lastResult;
  const lengthLabel = measuredMeters === null ? null : formatStudioBg3dMeasurementLength(measuredMeters, session.unit);
  const badges = collectLockBadges(session);
  const assertive = live.tone === "error";

  return (
    <>
      {/* 항상 마운트: 세션이 끝난 직후의 "취소했습니다"도 읽히려면 영역이 먼저 있어야 한다. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="bg3d-inference-live"
        className="sr-only"
      >
        {assertive ? null : <span key={live.seq}>{live.text}</span>}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        data-testid="bg3d-inference-live-alert"
        className="sr-only"
      >
        {assertive ? <span key={live.seq}>{live.text}</span> : null}
      </div>
      {showPanel ? (
        <div
          role="group"
          aria-label={`${TOOL_LABEL[session.tool]} · 추론과 길이 입력`}
          data-testid="bg3d-inference-hud"
          data-tool={session.tool}
          data-bg3d-viewport-control="true"
          className={cx(
            "grid gap-2.5 rounded-xl border border-accent/50 bg-panel/95 px-3 py-2.5 text-xs text-fg shadow-lg backdrop-blur",
            className,
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2" data-testid="bg3d-inference-current">
              {result ? (
                <StudioBg3dInferenceMarker kind={result.kind} axis={result.axis} label={result.label} size={20} />
              ) : (
                <span aria-hidden="true" className="size-5 shrink-0 rounded-full border border-dashed border-line" />
              )}
              <div className="min-w-0">
                <p className="truncate font-bold">{result ? result.label : "추론 대기"}</p>
                <p className="truncate text-[0.62rem] text-fg-3">
                  {result?.detail ?? "커서를 움직이면 끝점·중간점·축 정렬을 찾아 표시합니다."}
                </p>
              </div>
            </div>
            <output
              aria-label="현재 길이"
              data-testid="bg3d-inference-length"
              className="shrink-0 rounded-full border border-line bg-card px-2.5 py-1 text-[0.7rem] font-bold tabular-nums text-fg"
            >
              {lengthLabel ?? "길이 —"}
            </output>
          </div>

          <ul
            aria-label="현재 잠금 상태"
            data-testid="bg3d-inference-lock-badges"
            className="flex min-h-6 flex-wrap items-center gap-1.5"
          >
            {badges.length === 0 ? (
              <li className="text-[0.62rem] text-fg-3">잠금 없음</li>
            ) : (
              badges.map((badge) => (
                <li
                  key={badge.id}
                  data-testid={`bg3d-inference-badge-${badge.id}`}
                  className="inline-flex min-h-6 items-center gap-1.5 rounded-full border border-accent/45 bg-accent-soft px-2 text-[0.64rem] font-bold text-fg"
                >
                  {badge.axis ? <AxisSwatch axis={badge.axis} /> : null}
                  {badge.text}
                </li>
              ))
            )}
          </ul>

          <div role="group" aria-label="축 잠금" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {AXIS_KEYS.map(({ role, arrow, key }) => {
              const axis = roles[role];
              const style = STUDIO_BG3D_INFERENCE_AXIS_STYLE[axis];
              const pressed = session.lock.kind === "axis" && session.lock.axis === axis;
              return (
                <button
                  key={role}
                  type="button"
                  aria-pressed={pressed}
                  aria-keyshortcuts={key}
                  aria-label={`${style.label} 잠금 (${describeStudioBg3dInferenceAxis(axis)})`}
                  data-axis={axis}
                  className={cx(
                    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9",
                    pressed
                      ? "border-accent/60 bg-accent text-on-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised",
                  )}
                  onClick={() => service.requestLock(role)}
                >
                  <span aria-hidden="true">{arrow}</span>
                  <span aria-hidden="true">{axis.toUpperCase()}</span>
                  <span aria-hidden="true" className={pressed ? "text-on-accent" : undefined}>
                    <AxisSwatch axis={axis} />
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={session.lock.kind === "direction"}
              aria-keyshortcuts="ArrowDown"
              aria-label="평행 또는 수직 잠금 (현재 평행·수직 추론을 고정)"
              className={cx(
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9",
                session.lock.kind === "direction"
                  ? "border-accent/60 bg-accent text-on-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised",
              )}
              onClick={() => service.requestLock("relation")}
            >
              <span aria-hidden="true">↓</span>
              <span aria-hidden="true">평행·수직</span>
            </button>
          </div>

          <StudioBg3dLengthField
            label="길이 직접 입력"
            id="bg3d-inference-vcb"
            vcb
            inputRef={inputRef}
            text={session.vcb.text}
            error={session.vcb.error}
            hint={STUDIO_BG3D_INFERENCE_VCB_HINT}
            placeholder="길이 (예: 2.4m)"
            submitLabel="적용"
            parseOptions={{ defaultUnit: session.unit }}
            onTextChange={(text) => service.setVcbText(text)}
            onSubmit={() => service.submitVcb()}
          />

          {showPicker ? (
            <StudioBg3dInferenceKeyboardPicker
              service={service}
              unit={session.unit}
              onPick={(point, picked) => onPickPoint?.(point, picked)}
            />
          ) : null}

          <p className="text-[0.62rem] leading-relaxed text-fg-3">
            <kbd className="rounded border border-line px-1">→</kbd> X ·{" "}
            <kbd className="rounded border border-line px-1">←</kbd> Z ·{" "}
            <kbd className="rounded border border-line px-1">↑</kbd> Y ·{" "}
            <kbd className="rounded border border-line px-1">↓</kbd> 평행·수직 ·{" "}
            <kbd className="rounded border border-line px-1">Shift</kbd> 현재 추론 유지 ·{" "}
            <kbd className="rounded border border-line px-1">Esc</kbd> 취소 · 숫자 입력 후{" "}
            <kbd className="rounded border border-line px-1">Enter</kbd> 정확한 길이 적용
          </p>
          {footer}
        </div>
      ) : null}
    </>
  );
}
