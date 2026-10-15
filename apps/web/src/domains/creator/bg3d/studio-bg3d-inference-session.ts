/**
 * 추론 세션 상태기계 — 방향키 축 잠금, Shift 추론 유지, Esc 취소, 숫자 입력(VCB)을 한곳에서 다룬다.
 *
 * 순수 리듀서다: (상태, 이벤트) → (다음 상태, 부수 효과 목록, 키를 처리했는지). DOM·three.js를 모르므로
 * 키 입력을 같은 규칙으로 단위 테스트할 수 있다. 부수 효과(길이 적용, 취소, 입력창 포커스)는 훅이 실행한다.
 *
 * 키 매핑(장면 up 축 기준, 기본 Y-up):
 *   →  첫 번째 수평 축(X, 빨강)       ←  두 번째 수평 축(Z, 파랑)
 *   ↑  수직 축(Y, 초록, 높이)          ↓  평행/수직 추론 잠금
 *   Shift(누르는 동안) 현재 추론 유지   Esc  입력 지우기 → 취소     Enter  입력한 길이 적용
 */

import {
  STUDIO_BG3D_INFERENCE_AXIS_STYLE,
  describeStudioBg3dInferenceAxis,
  resolveStudioBg3dInferenceAxisRoles,
  studioBg3dInferenceAxisVector,
  studioBg3dInferenceKindLabel,
} from "./studio-bg3d-inference-kinds";
import { add, dot, nearlyEqual, normalize, scale, sub } from "./studio-bg3d-inference-math";
import {
  STUDIO_BG3D_LENGTH_INPUT_EXAMPLES,
  STUDIO_BG3D_LENGTH_INPUT_MAX_CHARACTERS,
  parseStudioBg3dLengthInput,
} from "./studio-bg3d-inference-units";
import { formatStudioBg3dMeasurementLength } from "./studio-bg3d-measurement";

import type {
  StudioBg3dInferenceAxis,
  StudioBg3dInferenceAxisRoles,
} from "./studio-bg3d-inference-kinds";
import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type {
  StudioBg3dInferenceHold,
  StudioBg3dInferenceLock,
  StudioBg3dInferenceResult,
} from "./studio-bg3d-inference-types";
import type { StudioBg3dMeasurementUnit } from "./studio-bg3d-measurement";

type V3 = StudioBg3dInferenceVec3;

export type StudioBg3dInferenceTool = "measure" | "move" | "push-pull" | "wall" | "generic";

export type StudioBg3dInferenceNoticeTone = "info" | "success" | "warn" | "error";

export interface StudioBg3dInferenceNotice {
  /** 같은 문구가 연속으로 와도 live region이 다시 읽도록 매번 증가하는 번호. */
  readonly id: number;
  readonly text: string;
  readonly tone: StudioBg3dInferenceNoticeTone;
  /** 잠금·취소·오류처럼 즉시 읽어야 하는 안내. */
  readonly urgent: boolean;
}

export interface StudioBg3dInferenceVcbState {
  readonly text: string;
  readonly error: string | null;
}

export interface StudioBg3dInferenceSessionState {
  readonly active: boolean;
  readonly tool: StudioBg3dInferenceTool;
  readonly referencePoint: V3 | null;
  readonly lock: StudioBg3dInferenceLock;
  readonly hold: StudioBg3dInferenceHold | null;
  readonly shiftDown: boolean;
  readonly altDown: boolean;
  readonly hoverReferences: readonly V3[];
  readonly lastResult: StudioBg3dInferenceResult | null;
  readonly vcb: StudioBg3dInferenceVcbState;
  readonly unit: StudioBg3dMeasurementUnit;
  readonly notice: StudioBg3dInferenceNotice | null;
  readonly noticeSeq: number;
}

export interface StudioBg3dInferenceKeyEvent {
  readonly key: string;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly repeat?: boolean;
  /** 입력창(VCB)에서 발생한 키인지. */
  readonly fromVcb?: boolean;
  /** 다른 위젯(탭 목록·슬라이더 등)이 방향키를 쓰는 곳인지. */
  readonly widgetOwnsArrows?: boolean;
}

export type StudioBg3dInferenceSessionEvent =
  | {
      readonly type: "begin";
      readonly tool: StudioBg3dInferenceTool;
      readonly referencePoint?: V3 | null;
      readonly unit?: StudioBg3dMeasurementUnit;
    }
  | { readonly type: "end" }
  | { readonly type: "set-reference"; readonly point: V3 | null }
  | { readonly type: "set-unit"; readonly unit: StudioBg3dMeasurementUnit }
  | { readonly type: "result"; readonly result: StudioBg3dInferenceResult | null }
  | { readonly type: "key-down"; readonly event: StudioBg3dInferenceKeyEvent }
  | { readonly type: "key-up"; readonly event: StudioBg3dInferenceKeyEvent }
  | { readonly type: "request-lock"; readonly role: "first" | "second" | "vertical" | "relation" }
  | { readonly type: "clear-lock" }
  | { readonly type: "vcb-change"; readonly text: string }
  | { readonly type: "vcb-submit" }
  | { readonly type: "add-hover-reference"; readonly point: V3 }
  | { readonly type: "clear-hover-references" }
  | { readonly type: "reset-modifiers" };

export type StudioBg3dInferenceEffect =
  | {
      readonly type: "apply-length";
      /** 항상 0보다 큰 길이(m). 음수 입력은 방향을 뒤집어 반영한다. */
      readonly meters: number;
      /** 기준점에서 적용할 단위 방향(길이 부호를 반영한 뒤). */
      readonly direction: V3;
      readonly negative: boolean;
    }
  | { readonly type: "cancel" }
  | { readonly type: "focus-vcb" };

export interface StudioBg3dInferenceReduceOptions {
  readonly axisRoles?: StudioBg3dInferenceAxisRoles;
  /** 음수 길이를 허용하는지(밀기·당기기·줄자 방향 뒤집기). 기본 true. */
  readonly allowNegative?: boolean;
  readonly maxMeters?: number;
}

export interface StudioBg3dInferenceReduction {
  readonly state: StudioBg3dInferenceSessionState;
  readonly effects: readonly StudioBg3dInferenceEffect[];
  /** true면 호출자가 `preventDefault()`와 전파 차단을 해야 한다. */
  readonly handled: boolean;
}

const VCB_START_KEYS = /^[0-9.-]$/u;

export function createStudioBg3dInferenceSessionState(
  unit: StudioBg3dMeasurementUnit = "m",
): StudioBg3dInferenceSessionState {
  const none: StudioBg3dInferenceLock = { kind: "none" };
  return Object.freeze({
    active: false,
    tool: "generic",
    referencePoint: null,
    lock: none,
    hold: null,
    shiftDown: false,
    altDown: false,
    hoverReferences: [],
    lastResult: null,
    vcb: { text: "", error: null },
    unit,
    notice: null,
    noticeSeq: 0,
  });
}

function withNotice(
  state: StudioBg3dInferenceSessionState,
  text: string,
  tone: StudioBg3dInferenceNoticeTone,
  urgent: boolean,
): StudioBg3dInferenceSessionState {
  const id = state.noticeSeq + 1;
  return { ...state, noticeSeq: id, notice: { id, text, tone, urgent } };
}

function reduction(
  state: StudioBg3dInferenceSessionState,
  handled: boolean,
  effects: readonly StudioBg3dInferenceEffect[] = [],
): StudioBg3dInferenceReduction {
  return { state, effects, handled };
}

/** 현재 결과를 "유지"할 수 있는 제약으로 바꾼다. 유지할 것이 없으면 null. */
export function createStudioBg3dInferenceHold(
  result: StudioBg3dInferenceResult | null,
): StudioBg3dInferenceHold | null {
  if (!result) return null;
  switch (result.kind) {
    case "axis":
    case "from-point":
    case "parallel":
    case "perpendicular": {
      if (!result.alignmentOrigin || !result.direction) return null;
      return {
        kind: "line",
        origin: result.alignmentOrigin,
        direction: result.direction,
        axis: result.axis,
        from: result.kind,
      };
    }
    case "on-edge": {
      if (!result.direction) return null;
      return { kind: "line", origin: result.point, direction: result.direction, axis: result.axis, from: "on-edge" };
    }
    case "on-face": {
      if (!result.normal) return null;
      return { kind: "plane", point: result.point, normal: result.normal, sourceId: result.sourceIds[0] ?? null };
    }
    case "endpoint":
    case "midpoint":
    case "center":
    case "intersection":
      return { kind: "point", point: result.point, from: result.kind };
    default:
      return null;
  }
}

function holdDescription(hold: StudioBg3dInferenceHold): string {
  if (hold.kind === "line") return studioBg3dInferenceKindLabel(hold.from, hold.axis);
  if (hold.kind === "plane") return "면 위";
  return studioBg3dInferenceKindLabel(hold.from);
}

function lockAnnouncement(axis: StudioBg3dInferenceAxis, locked: boolean): string {
  return locked
    ? `${STUDIO_BG3D_INFERENCE_AXIS_STYLE[axis].label} 잠금 — ${describeStudioBg3dInferenceAxis(axis).split(" · ").slice(1).join(", ")}`
    : `${STUDIO_BG3D_INFERENCE_AXIS_STYLE[axis].label} 잠금 해제`;
}

function toggleAxisLock(
  state: StudioBg3dInferenceSessionState,
  axis: StudioBg3dInferenceAxis,
): StudioBg3dInferenceReduction {
  if (!state.referencePoint) {
    return reduction(
      withNotice(state, "먼저 시작점을 잡아야 축을 잠글 수 있습니다.", "warn", true),
      true,
    );
  }
  const same = state.lock.kind === "axis" && state.lock.axis === axis;
  const lock: StudioBg3dInferenceLock = same ? { kind: "none" } : { kind: "axis", axis };
  return reduction(withNotice({ ...state, lock }, lockAnnouncement(axis, !same), "info", true), true);
}

function toggleRelationLock(state: StudioBg3dInferenceSessionState): StudioBg3dInferenceReduction {
  if (!state.referencePoint) {
    return reduction(
      withNotice(state, "먼저 시작점을 잡아야 평행·수직을 잠글 수 있습니다.", "warn", true),
      true,
    );
  }
  if (state.lock.kind === "direction") {
    return reduction(
      withNotice({ ...state, lock: { kind: "none" } }, "평행·수직 잠금 해제", "info", true),
      true,
    );
  }
  const result = state.lastResult;
  if (
    !result
    || (result.kind !== "parallel" && result.kind !== "perpendicular")
    || !result.direction
    || !result.relation
  ) {
    return reduction(
      withNotice(
        state,
        "잠글 평행·수직 추론이 없습니다. 기준 모서리와 평행하거나 수직인 표시가 나올 때 ↓ 키를 누르세요.",
        "warn",
        true,
      ),
      true,
    );
  }
  const lock: StudioBg3dInferenceLock = {
    kind: "direction",
    direction: result.direction,
    relation: result.kind,
    referenceId: result.relation.id,
    referenceLabel: result.relation.label,
  };
  return reduction(
    withNotice(
      { ...state, lock },
      `${result.kind === "parallel" ? "평행" : "수직"} 잠금 — ${result.relation.label}`,
      "info",
      true,
    ),
    true,
  );
}

/**
 * 입력한 길이를 적용할 방향을 정한다: 잠금 → 마지막 결과의 방향 → 기준점에서 결과 점까지.
 * 부호는 마지막 결과가 가리키던 쪽을 따른다(없으면 +).
 */
export function resolveStudioBg3dInferenceApplyDirection(
  state: Pick<StudioBg3dInferenceSessionState, "referencePoint" | "lock" | "hold" | "lastResult">,
): V3 | null {
  const reference = state.referencePoint;
  const result = state.lastResult;
  const towardResult = reference && result ? normalize(sub(result.point, reference)) : null;
  const orient = (line: V3): V3 => {
    const unit = normalize(line);
    if (!unit) return line;
    return towardResult && dot(unit, towardResult) < 0 ? scale(unit, -1) : unit;
  };
  if (state.lock.kind === "axis") return orient(studioBg3dInferenceAxisVector(state.lock.axis));
  if (state.lock.kind === "direction") return orient(state.lock.direction);
  if (state.hold?.kind === "line") return orient(state.hold.direction);
  return towardResult;
}

function submitVcb(
  state: StudioBg3dInferenceSessionState,
  options: StudioBg3dInferenceReduceOptions,
): StudioBg3dInferenceReduction {
  const parsed = parseStudioBg3dLengthInput(state.vcb.text, {
    defaultUnit: state.unit,
    allowNegative: options.allowNegative ?? true,
    ...(options.maxMeters === undefined ? {} : { maxMeters: options.maxMeters }),
  });
  if (!parsed.ok) {
    return reduction(
      withNotice(
        { ...state, vcb: { ...state.vcb, error: parsed.message } },
        `입력 오류: ${parsed.message}`,
        "error",
        true,
      ),
      true,
    );
  }
  const direction = resolveStudioBg3dInferenceApplyDirection(state);
  if (!direction || !state.referencePoint) {
    const message = "길이를 적용할 방향이 없습니다. 시작점을 잡은 뒤 커서를 움직이거나 방향키로 축을 잠그세요.";
    return reduction(
      withNotice({ ...state, vcb: { ...state.vcb, error: message } }, `입력 오류: ${message}`, "error", true),
      true,
    );
  }
  const negative = parsed.meters < 0;
  const meters = Math.abs(parsed.meters);
  const applied = negative ? scale(direction, -1) : direction;
  const label = formatStudioBg3dMeasurementLength(meters, state.unit) ?? `${meters} m`;
  return reduction(
    withNotice(
      { ...state, vcb: { text: "", error: null } },
      `길이 ${negative ? "−" : ""}${label} 적용`,
      "success",
      true,
    ),
    true,
    [{ type: "apply-length", meters, direction: applied, negative }],
  );
}

function isPrintableVcbStart(event: StudioBg3dInferenceKeyEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return VCB_START_KEYS.test(event.key);
}

function handleKeyDown(
  state: StudioBg3dInferenceSessionState,
  event: StudioBg3dInferenceKeyEvent,
  options: StudioBg3dInferenceReduceOptions,
): StudioBg3dInferenceReduction {
  const roles = options.axisRoles ?? resolveStudioBg3dInferenceAxisRoles();
  if (event.key === "Shift") {
    if (event.repeat || state.shiftDown) return reduction(state, false);
    const hold = createStudioBg3dInferenceHold(state.lastResult);
    const next: StudioBg3dInferenceSessionState = { ...state, shiftDown: true, hold };
    return reduction(
      hold
        ? withNotice(next, `추론 유지 — ${holdDescription(hold)}`, "info", true)
        : withNotice(next, "유지할 추론이 없습니다. 끝점·축 정렬 같은 표시가 나올 때 Shift를 누르세요.", "info", false),
      false,
    );
  }
  if (event.key === "Alt") {
    return reduction(event.repeat || state.altDown ? state : { ...state, altDown: true }, false);
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return reduction(state, false);

  if (event.key === "Escape") {
    if (state.vcb.text !== "") {
      return reduction(
        withNotice({ ...state, vcb: { text: "", error: null } }, "입력을 지웠습니다.", "info", true),
        true,
      );
    }
    const cleared: StudioBg3dInferenceSessionState = {
      ...state,
      lock: { kind: "none" },
      hold: null,
      shiftDown: false,
      referencePoint: null,
      hoverReferences: [],
      lastResult: null,
    };
    return reduction(withNotice(cleared, "취소했습니다.", "info", true), true, [{ type: "cancel" }]);
  }

  if (event.key === "Enter") {
    if (state.vcb.text.trim() === "") return reduction(state, false);
    return submitVcb(state, options);
  }

  // 입력창 밖에서 쌓인 숫자 입력은 Backspace로 지운다. 이 키가 전역 "선택 삭제"로 새지 않게 처리한다.
  // (입력창 안의 Backspace는 입력창 자신이 지운다.)
  if ((event.key === "Backspace" || event.key === "Delete") && !event.fromVcb && state.vcb.text !== "") {
    const text = event.key === "Backspace" ? state.vcb.text.slice(0, -1) : "";
    return reduction({ ...state, vcb: { text, error: null } }, true, [{ type: "focus-vcb" }]);
  }

  if (!event.widgetOwnsArrows) {
    if (event.key === "ArrowRight") return toggleAxisLock(state, roles.first);
    if (event.key === "ArrowLeft") return toggleAxisLock(state, roles.second);
    if (event.key === "ArrowUp") return toggleAxisLock(state, roles.vertical);
    if (event.key === "ArrowDown") return toggleRelationLock(state);
  }

  if (!event.fromVcb && state.vcb.text === "" && isPrintableVcbStart(event)) {
    return reduction(
      { ...state, vcb: { text: event.key, error: null } },
      true,
      [{ type: "focus-vcb" }],
    );
  }
  return reduction(state, false);
}

function handleKeyUp(
  state: StudioBg3dInferenceSessionState,
  event: StudioBg3dInferenceKeyEvent,
): StudioBg3dInferenceReduction {
  if (event.key === "Shift") {
    if (!state.shiftDown && !state.hold) return reduction(state, false);
    const hadHold = state.hold !== null;
    const next: StudioBg3dInferenceSessionState = { ...state, shiftDown: false, hold: null };
    return reduction(hadHold ? withNotice(next, "추론 유지 해제", "info", true) : next, false);
  }
  if (event.key === "Alt") {
    return reduction(state.altDown ? { ...state, altDown: false } : state, false);
  }
  return reduction(state, false);
}

/**
 * 세션 리듀서. 비활성 세션은 begin 외 이벤트를 무시하고 키를 처리하지 않는다.
 */
export function reduceStudioBg3dInferenceSession(
  state: StudioBg3dInferenceSessionState,
  event: StudioBg3dInferenceSessionEvent,
  options: StudioBg3dInferenceReduceOptions = {},
): StudioBg3dInferenceReduction {
  if (event.type === "begin") {
    return reduction(
      {
        ...createStudioBg3dInferenceSessionState(event.unit ?? state.unit),
        active: true,
        tool: event.tool,
        referencePoint: event.referencePoint ?? null,
        noticeSeq: state.noticeSeq,
      },
      false,
    );
  }
  if (event.type === "end") {
    return reduction({ ...createStudioBg3dInferenceSessionState(state.unit), noticeSeq: state.noticeSeq }, false);
  }
  if (!state.active) return reduction(state, false);

  switch (event.type) {
    case "set-reference": {
      return reduction(
        {
          ...state,
          referencePoint: event.point,
          lock: { kind: "none" },
          hold: null,
          hoverReferences: [],
          vcb: { text: "", error: null },
        },
        false,
      );
    }
    case "set-unit":
      return reduction({ ...state, unit: event.unit }, false);
    case "result":
      return reduction({ ...state, lastResult: event.result }, false);
    case "key-down":
      return handleKeyDown(state, event.event, options);
    case "key-up":
      return handleKeyUp(state, event.event);
    case "request-lock": {
      const roles = options.axisRoles ?? resolveStudioBg3dInferenceAxisRoles();
      if (event.role === "relation") return toggleRelationLock(state);
      return toggleAxisLock(state, roles[event.role]);
    }
    case "clear-lock":
      return reduction(
        state.lock.kind === "none" ? state : withNotice({ ...state, lock: { kind: "none" } }, "잠금 해제", "info", true),
        false,
      );
    case "vcb-change": {
      const text = event.text.slice(0, STUDIO_BG3D_LENGTH_INPUT_MAX_CHARACTERS * 2);
      return reduction({ ...state, vcb: { text, error: null } }, false);
    }
    case "vcb-submit":
      return state.vcb.text.trim() === "" ? reduction(state, false) : submitVcb(state, options);
    case "add-hover-reference": {
      if (state.hoverReferences.length >= 4) return reduction(state, false);
      // 같은 점에 다시 머물러도 기준점 칸을 낭비하지 않는다.
      if (state.hoverReferences.some((existing) => nearlyEqual(existing, event.point, 1e-6))) {
        return reduction(state, false);
      }
      return reduction({ ...state, hoverReferences: [...state.hoverReferences, event.point] }, false);
    }
    case "clear-hover-references":
      return reduction(state.hoverReferences.length === 0 ? state : { ...state, hoverReferences: [] }, false);
    case "reset-modifiers":
      return reduction({ ...state, shiftDown: false, altDown: false, hold: null }, false);
    default:
      return reduction(state, false);
  }
}

/** 입력창 placeholder 등에 쓰는 예시 문구. */
export const STUDIO_BG3D_INFERENCE_VCB_HINT = `예: ${STUDIO_BG3D_LENGTH_INPUT_EXAMPLES.join(", ")}`;

/** 결과 점과 기준점의 거리(m). 기준점이 없으면 null. */
export function measureStudioBg3dInferenceDistance(reference: V3 | null, point: V3): number | null {
  if (!reference) return null;
  const delta = sub(point, reference);
  return Math.hypot(delta[0], delta[1], delta[2]);
}

/** 길이를 적용한 끝점(기준점 + 방향 × 길이). */
export function applyStudioBg3dInferenceLength(reference: V3, direction: V3, meters: number): V3 {
  return add(reference, scale(direction, meters));
}
