/**
 * 포인터 캡처 유실·창 포커스 이탈·팜 터치 끼어들기 무손실 복구 가드.
 *
 * 긴 자유선을 긋는 도중 OS 알림·창 포커스 이탈(`blur`/`visibilitychange`)·`lostpointercapture`·
 * 보조 손바닥 터치(`pointerType === "touch"` 끼어들기 while `activePenPointerId` 진행 중)가 발생했을 때:
 * 1. 진행 중인 펜 스트로크 위의 보조 손바닥 접촉을 모든 단계(down/move/up/cancel)에서 격리 무시한다.
 * 2. 포인터 캡처 유실·알림 등으로 이전 스트로크가 `drawing` 상태에 고착된 채 새 주 펜/마우스 접촉이
 *    들어오면, 2초 대기 없이 기존 누적 포인트를 즉시 무손실 확정(salvage commit)한 뒤 새 획을 연다.
 * 3. 포커스 이탈·`pointercancel`·전송 중단 시 마지막 정상 접촉 샘플을 합성 복원해 그리던 선의 증발을 막는다.
 */

import { isCompleteStudioDrawOp } from "../brush/studio-draw-completion";
import {
  isStudioLeftContactDown,
  isStudioStrokePointerEvent,
  shouldCancelStudioFingerStrokeForAdditionalContact,
  type StudioPointerEventLike,
  type StudioStrokePointerSession,
} from "../canvas/studio-pointer-input";
import type { DrawEl } from "../studio-element-model";
import { recordStudioDrawingStabilityCounts } from "./studio-cuttoon-drawing-stability-telemetry";

const MIN_SALVAGEABLE_PATH_LENGTH_DOC_PX = 1.5;

function normalizedPointerType(
  event: StudioPointerEventLike | null | undefined,
): "pen" | "touch" | "mouse" | "unknown" {
  if (!event || typeof event.pointerType !== "string") return "unknown";
  const lower = event.pointerType.toLowerCase();
  if (lower === "pen" || lower === "touch" || lower === "mouse") return lower;
  return "unknown";
}

function normalizedPointerId(
  event: StudioPointerEventLike | null | undefined,
  fallback = 1,
): number {
  if (!event || event.pointerId === undefined || event.pointerId === null) {
    return fallback;
  }
  return typeof event.pointerId === "number" && Number.isFinite(event.pointerId)
    ? event.pointerId
    : Number.NaN;
}

function polylineLength(points: readonly number[]): number {
  let total = 0;
  for (let idx = 2; idx + 1 < points.length; idx += 2) {
    const dx = (points[idx] ?? 0) - (points[idx - 2] ?? 0);
    const dy = (points[idx + 1] ?? 0) - (points[idx - 1] ?? 0);
    total += Math.hypot(dx, dy);
  }
  return total;
}

/**
 * 활성 펜 스트로크가 진행 중인 동안 다른 포인터 ID로 들어오는 보조 손바닥/손가락(`touch`) 이벤트인지 판별한다.
 * 앱 설정의 팜 리젝션 토글 여부와 무관하게 이미 펜촉이 캔버스를 그리는 도중 들어온 동시 터치는
 * 브러시 커서 이동·커서 숨김·도구 전환·획 취소를 유발해서는 안 된다.
 */
export function isStudioPalmTouchDuringActivePenStroke(
  activeSession: StudioStrokePointerSession | null | undefined,
  activeDrawing: DrawEl | null | undefined,
  incomingEvent: StudioPointerEventLike | null | undefined,
): boolean {
  if (!activeSession || activeSession.pointerType !== "pen") return false;
  if (!activeDrawing) return false;
  if (normalizedPointerType(incomingEvent) !== "touch") return false;
  const incomingId = normalizedPointerId(incomingEvent, activeSession.pointerId);
  return !Number.isFinite(incomingId) || incomingId !== activeSession.pointerId;
}

export function isolateStudioPalmTouchIfNeeded(
  activeSession: StudioStrokePointerSession | null | undefined,
  activeDrawing: DrawEl | null | undefined,
  incomingEvent: StudioPointerEventLike | null | undefined,
): boolean {
  if (!isStudioPalmTouchDuringActivePenStroke(activeSession, activeDrawing, incomingEvent)) {
    return false;
  }
  recordStudioDrawingStabilityCounts({ palmTouchesIsolated: 1 });
  return true;
}

/**
 * 단절 시점에 누적된 `DrawEl`이 버리기 아까운 유효 스트로크인지 판정한다.
 * 점 1개짜리 우발 접촉은 버리고, 2개 이상의 샘플과 유의미한 이동을 가진 획은 무손실 보존한다.
 */
export function shouldSalvageStudioInterruptedStroke(
  stroke: DrawEl | null | undefined,
): stroke is DrawEl {
  if (!stroke) return false;
  if (isCompleteStudioDrawOp(stroke)) return true;
  if ((stroke.kind ?? "freehand") !== "freehand") return false;
  if (stroke.points.length < 4) return false;
  return polylineLength(stroke.points) >= MIN_SALVAGEABLE_PATH_LENGTH_DOC_PX;
}

/**
 * `drawingLastAuthoritativePointerRef`가 비어 있거나 손상된 경우에도
 * 세션의 마지막 권위 샘플 메타데이터로부터 안전한 종료용 `PointerEvent` 호환 스냅샷을 복원한다.
 */
export function synthesizeStudioAuthoritativeFallbackPointer(
  session: StudioStrokePointerSession | null | undefined,
  lastAuthoritativePointer: PointerEvent | null | undefined,
  triggerEvent?: PointerEvent | null,
): PointerEvent {
  if (
    session
    && lastAuthoritativePointer
    && isStudioStrokePointerEvent(session, lastAuthoritativePointer)
  ) {
    return lastAuthoritativePointer;
  }
  if (lastAuthoritativePointer) {
    return lastAuthoritativePointer;
  }
  const sample = session?.lastAuthoritativeSample;
  const synthetic = {
    type: "pointercancel",
    pointerId: session?.pointerId ?? triggerEvent?.pointerId ?? 1,
    pointerType: session?.pointerType ?? triggerEvent?.pointerType ?? "pen",
    isPrimary: true,
    button: 0,
    buttons: 0,
    clientX: sample?.clientX ?? triggerEvent?.clientX ?? 0,
    clientY: sample?.clientY ?? triggerEvent?.clientY ?? 0,
    pressure: sample?.pressure ?? 0,
    tangentialPressure: sample?.tangentialPressure ?? 0,
    tiltX: sample?.tiltX ?? 0,
    tiltY: sample?.tiltY ?? 0,
    altitudeAngle: sample?.altitudeAngle ?? Math.PI / 2,
    azimuthAngle: sample?.azimuthAngle ?? 0,
    twist: sample?.twist ?? 0,
    width: sample?.width ?? 1,
    height: sample?.height ?? 1,
    timeStamp: sample?.timeStamp ?? triggerEvent?.timeStamp ?? 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    getCoalescedEvents: () => [],
    getPredictedEvents: () => [],
  };
  return synthetic as unknown as PointerEvent;
}

export type StudioStageDownInterruptionPlan =
  | { readonly action: "proceed" }
  | { readonly action: "ignore-palm-touch" }
  | { readonly action: "ignore-foreign-or-duplicate" }
  | { readonly action: "discard-finger-for-multitouch" }
  | { readonly action: "discard-stale-and-proceed" }
  | {
      readonly action: "salvage-stuck-and-proceed";
      readonly fallbackPointer: PointerEvent;
    };

export interface StudioStageDownInterruptionInput {
  readonly activeSession: StudioStrokePointerSession | null | undefined;
  readonly activeDrawing: DrawEl | null | undefined;
  readonly incomingPointer: PointerEvent;
  readonly lastAuthoritativePointer: PointerEvent | null | undefined;
}

function isNewPrimaryPenOrMouseStart(event: PointerEvent): boolean {
  if (event.isPrimary === false) return false;
  const type = normalizedPointerType(event);
  if (type !== "pen" && type !== "mouse") return false;
  return isStudioLeftContactDown(event);
}

/**
 * `tryStageDownDraw` 진입 시 기존 미종료 세션·획과의 충돌 및 무손실 복구 전이를 결정한다.
 */
export function planStudioStageDownStrokeInterruption(
  input: StudioStageDownInterruptionInput,
): StudioStageDownInterruptionPlan {
  const { activeSession, activeDrawing, incomingPointer, lastAuthoritativePointer } = input;

  if (isolateStudioPalmTouchIfNeeded(activeSession, activeDrawing, incomingPointer)) {
    return { action: "ignore-palm-touch" };
  }

  if (!activeSession && !activeDrawing) {
    return { action: "proceed" };
  }

  if (!activeDrawing) {
    // drawingRef 없이 고립된 세션은 즉시 정리 후 새 입력을 받아들인다.
    return { action: "discard-stale-and-proceed" };
  }

  if (activeSession && isStudioStrokePointerEvent(activeSession, incomingPointer)) {
    // 같은 pointerId로 다시 pointerdown이 온 경우:
    // 이미 버튼/접촉이 끊긴 뒤 동일 ID로 재접촉한 드라이버(예: 와콤/마우스 캡처 유실 후 재클릭)라면
    // 직전 누적 스트로크가 유효할 때 무손실 구제 확정 후 새 획을 시작한다.
    const previousTime = activeSession.lastAuthoritativeSample.timeStamp;
    const dt = incomingPointer.timeStamp - previousTime;
    const isReentryAfterGap = Number.isFinite(dt) && dt >= 24;
    if (isReentryAfterGap && isNewPrimaryPenOrMouseStart(incomingPointer)) {
      if (shouldSalvageStudioInterruptedStroke(activeDrawing)) {
        recordStudioDrawingStabilityCounts({ interruptedStrokesSalvaged: 1 });
        return {
          action: "salvage-stuck-and-proceed",
          fallbackPointer: synthesizeStudioAuthoritativeFallbackPointer(
            activeSession,
            lastAuthoritativePointer,
            incomingPointer,
          ),
        };
      }
      return { action: "discard-stale-and-proceed" };
    }
    return { action: "ignore-foreign-or-duplicate" };
  }

  if (shouldCancelStudioFingerStrokeForAdditionalContact(activeSession, incomingPointer)) {
    return { action: "discard-finger-for-multitouch" };
  }

  // 캡처 유실·OS 알림·창 전환 등으로 이전 pointerId의 pointerup이 증발한 뒤
  // 사용자가 새 주 펜/마우스 접촉을 시작한 경우: 먹통(stuck) 대신 기존 획을 즉시 확정하고 새 획을 연다.
  if (isNewPrimaryPenOrMouseStart(incomingPointer)) {
    if (shouldSalvageStudioInterruptedStroke(activeDrawing)) {
      recordStudioDrawingStabilityCounts({ interruptedStrokesSalvaged: 1 });
      return {
        action: "salvage-stuck-and-proceed",
        fallbackPointer: synthesizeStudioAuthoritativeFallbackPointer(
          activeSession,
          lastAuthoritativePointer,
          incomingPointer,
        ),
      };
    }
    return { action: "discard-stale-and-proceed" };
  }

  return { action: "ignore-foreign-or-duplicate" };
}

export type StudioStrokeCancelRecoveryPlan =
  | { readonly action: "ignore-palm-touch" }
  | { readonly action: "ignore-foreign-pointer" }
  | { readonly action: "discard" }
  | {
      readonly action: "salvage-commit";
      readonly fallbackPointer: PointerEvent;
    };

export interface StudioStrokeCancelRecoveryInput {
  readonly activeSession: StudioStrokePointerSession | null | undefined;
  readonly activeDrawing: DrawEl | null | undefined;
  readonly cancelPointer?: PointerEvent | null;
  readonly lastAuthoritativePointer: PointerEvent | null | undefined;
}

/**
 * `pointercancel`·창 포커스 이탈(`blur`/`visibilitychange`)·전송 중단(`onDiscard`) 시
 * 펜/마우스로 이미 그린 유효 누적 포인트를 증발시키지 않고 안전하게 확정할지 판정한다.
 */
export function planStudioStrokeCancelOrAbortRecovery(
  input: StudioStrokeCancelRecoveryInput,
): StudioStrokeCancelRecoveryPlan {
  const { activeSession, activeDrawing, cancelPointer, lastAuthoritativePointer } = input;

  if (cancelPointer && isolateStudioPalmTouchIfNeeded(activeSession, activeDrawing, cancelPointer)) {
    return { action: "ignore-palm-touch" };
  }

  if (
    cancelPointer
    && activeSession
    && !isStudioStrokePointerEvent(activeSession, cancelPointer)
  ) {
    return { action: "ignore-foreign-pointer" };
  }

  const pointerType = activeSession?.pointerType ?? normalizedPointerType(cancelPointer);
  if (pointerType !== "touch" && shouldSalvageStudioInterruptedStroke(activeDrawing)) {
    recordStudioDrawingStabilityCounts({ interruptedStrokesSalvaged: 1 });
    return {
      action: "salvage-commit",
      fallbackPointer: synthesizeStudioAuthoritativeFallbackPointer(
        activeSession,
        lastAuthoritativePointer,
        cancelPointer,
      ),
    };
  }

  return { action: "discard" };
}
