import { adjustStudioBrushWidthFromWheel } from "../brush/studio-drawing-shortcuts";
import { clampZoom, isStudioViewToolsHudEventTarget } from "../studio-page-shell-runtime";
import { shouldStartStudioSpacePan } from "../studio-space-pan-shortcut";
import { stepStudioViewWheelZoom } from "../studio-view-controls";

import { resolveStudioCanvasGestureDisposition } from "./studio-canvas-gesture-arbitration";
import { applyStudioCanvasWheelNavigation } from "./studio-canvas-wheel-navigation";

import type { StudioBrushSnapshot } from "../brush/studio-brush-library";
import type { StudioAppSettings } from "../studio-app-settings";
import type { StudioZoomGestureState, StudioZoomGestureStep } from "./studio-zoom-gesture-engine";

interface StudioCanvasViewportInput {
  readonly wrapRef: { readonly current: HTMLDivElement | null };
  readonly appSettingsRef: { readonly current: Pick<StudioAppSettings, "mouse" | "touch"> };
  readonly canvasPointerGestureIsOwned: () => boolean;
  readonly viewTransformSuppressedRef: { readonly current: boolean };
  readonly zoomLockedRef: { readonly current: boolean };
  readonly stepZoomGestureRef: { readonly current: StudioZoomGestureStep };
}

interface StudioCanvasWheelInput extends StudioCanvasViewportInput {
  readonly setStrokeWidth: (update: (current: number) => number) => void;
  readonly currentBrushSnapshotRef: {
    readonly current: Pick<StudioBrushSnapshot, "enginePrograms"> | null;
  };
}

interface StudioCanvasTouchInput extends StudioCanvasViewportInput {
  readonly canvasEditingGestureIsOwned: () => boolean;
  readonly touchViewPanActiveRef: { current: boolean };
  readonly zoomGestureRef: { readonly current: Pick<StudioZoomGestureState, "targetZoom"> | null };
  readonly zoomRef: { readonly current: number };
  readonly settleZoomGestureRef: { readonly current: () => void };
  readonly updateScrollPosRef: { readonly current: () => void };
}

interface StudioCanvasSpacePanInput {
  readonly editing: { readonly id: string } | null;
  readonly isSpacePressed: boolean;
  readonly setIsSpacePressed: (active: boolean) => void;
  readonly setIsPanning: (active: boolean) => void;
}

// React effect의 설치 시점과 상태 권위는 호스트에 두고 DOM 리스너 본문만 옮긴다.
export function installStudioCanvasWheelInput(input: StudioCanvasWheelInput): (() => void) | undefined {
  const {
    wrapRef,
    appSettingsRef,
    canvasPointerGestureIsOwned,
    viewTransformSuppressedRef,
    zoomLockedRef,
    stepZoomGestureRef,
    setStrokeWidth,
    currentBrushSnapshotRef,
  } = input;
  const node = wrapRef.current;
  if (!node) return;
  const onWheel = (e: WheelEvent) => {
    const gestureDisposition = resolveStudioCanvasGestureDisposition({
      gestureOwned: canvasPointerGestureIsOwned(),
      viewTransformSuppressed: viewTransformSuppressedRef.current,
      viewToolsHudTarget: isStudioViewToolsHudEventTarget(e.target),
    });
    // A contact-owned edit must see an immutable view transform from pointerdown to pointerup.
    // Trackpad/wheel noise during pen contact otherwise changes both the visual anchor and the
    // document coordinate scale midway through one stroke. Consume it even over nested HUD UI.
    if (gestureDisposition === "consume-owned") {
      e.preventDefault();
      return;
    }
    if (gestureDisposition !== "handle-canvas") return;
    const prefs = appSettingsRef.current.mouse;
    const modZoom = e.ctrlKey || e.metaKey;
    const wheelMode = modZoom ? "zoom" : prefs.wheel;
    if (applyStudioCanvasWheelNavigation(node, e, wheelMode, prefs.reverseWheel)) return;
    if (wheelMode === "zoom") {
      e.preventDefault();
      if (zoomLockedRef.current) return;
      // 틱마다 리렌더하지 않는다 — 제스처 transform 으로 즉시 반응하고 정착 시 한 번만 커밋.
      stepZoomGestureRef.current(
        (target) => stepStudioViewWheelZoom(
          target,
          e.deltaY,
          e.deltaMode,
          prefs.reverseWheel,
          node.clientHeight
        ),
        e.clientX,
        e.clientY
      );
      return;
    }
    if (wheelMode === "brush-size") {
      e.preventDefault();
      setStrokeWidth((w) => adjustStudioBrushWidthFromWheel(w, e, prefs.reverseWheel, currentBrushSnapshotRef.current?.enginePrograms));
      return;
    }
    if (wheelMode === "pan") {
      // Zero/non-finite wheel packets have no movement plan, but pan mode still
      // owns the canvas scrollport and must not bubble into the surrounding page.
      e.preventDefault();
    }
  };
  node.addEventListener("wheel", onWheel, { passive: false });
  return () => node.removeEventListener("wheel", onWheel);
}


export function installStudioCanvasTouchInput(input: StudioCanvasTouchInput): (() => void) | undefined {
  const {
    wrapRef,
    appSettingsRef,
    canvasEditingGestureIsOwned,
    canvasPointerGestureIsOwned,
    touchViewPanActiveRef,
    viewTransformSuppressedRef,
    zoomGestureRef,
    zoomRef,
    zoomLockedRef,
    stepZoomGestureRef,
    settleZoomGestureRef,
    updateScrollPosRef,
  } = input;
  const node = wrapRef.current;
  if (!node) return;
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let pinchStartCenter = { x: 0, y: 0 };
  let pinchGestureActive = false;
  let oneFingerPan: {
    identifier: number;
    lastX: number;
    lastY: number;
  } | null = null;
  const clearOneFingerPan = () => {
    oneFingerPan = null;
    touchViewPanActiveRef.current = false;
  };
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const center = (t: TouchList) => ({
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2,
  });
  // 정확히 두 손가락일 때만 기준선을 잡는다. 손가락 수가 바뀌면(예: 2→3→2) 기준선을 버려
  // 다음 두-손가락 프레임에서 새로 잡게 해 줌이 튀지 않도록 한다.
  const arm = (e: TouchEvent) => {
    if (e.touches.length !== 1) clearOneFingerPan();
    if (viewTransformSuppressedRef.current) {
      pinchStartDist = 0;
      return;
    }
    if (isStudioViewToolsHudEventTarget(e.target)) {
      pinchStartDist = 0;
      return;
    }
    if (
      e.touches.length === 1
      && appSettingsRef.current.touch.oneFingerDrag === "pan"
      && !canvasPointerGestureIsOwned()
    ) {
      const touch = e.touches[0]!;
      oneFingerPan = {
        identifier: touch.identifier,
        lastX: touch.clientX,
        lastY: touch.clientY,
      };
      touchViewPanActiveRef.current = true;
      pinchStartDist = 0;
      return;
    }
    if (appSettingsRef.current.touch.twoFinger !== "pan-zoom") {
      pinchStartDist = 0;
      return;
    }
    if (canvasPointerGestureIsOwned()) {
      pinchStartDist = 0;
      return;
    }
    if (e.touches.length === 2) {
      pinchStartDist = dist(e.touches);
      pinchStartZoom = zoomGestureRef.current?.targetZoom ?? zoomRef.current;
      pinchStartCenter = center(e.touches);
    } else {
      pinchStartDist = 0;
    }
  };
  const onTouchStart = arm;
  const onTouchMove = (e: TouchEvent) => {
    // A finger-pan may have started before a pen or edit tool acquired the canvas. The editing
    // contact wins immediately; otherwise the old finger session can still scroll the viewport
    // underneath a new stroke before the shared ownership resolver is reached.
    if (oneFingerPan && canvasEditingGestureIsOwned()) {
      clearOneFingerPan();
      pinchStartDist = 0;
      e.preventDefault();
      return;
    }
    if (oneFingerPan) {
      const touch = Array.from(e.touches).find(
        (candidate) => candidate.identifier === oneFingerPan?.identifier
      );
      if (e.touches.length === 1 && touch) {
        e.preventDefault();
        const deltaX = touch.clientX - oneFingerPan.lastX;
        const deltaY = touch.clientY - oneFingerPan.lastY;
        oneFingerPan.lastX = touch.clientX;
        oneFingerPan.lastY = touch.clientY;
        node.scrollLeft -= deltaX;
        node.scrollTop -= deltaY;
        updateScrollPosRef.current();
        return;
      }
      clearOneFingerPan();
    }
    const gestureDisposition = resolveStudioCanvasGestureDisposition({
      gestureOwned: canvasPointerGestureIsOwned(),
      viewTransformSuppressed: viewTransformSuppressedRef.current,
      viewToolsHudTarget: isStudioViewToolsHudEventTarget(e.target),
    });
    if (gestureDisposition === "consume-owned") {
      pinchStartDist = 0;
      e.preventDefault();
      return;
    }
    if (gestureDisposition === "pass-suppressed") {
      pinchStartDist = 0;
      return;
    }
    if (gestureDisposition === "pass-view-tools-hud") return;
    if (appSettingsRef.current.touch.twoFinger !== "pan-zoom") {
      pinchStartDist = 0;
      return;
    }
    if (e.touches.length !== 2) {
      pinchStartDist = 0; // 요소 드래그 중이거나 두 손가락이 아니면 핀치 비활성
      return;
    }
    if (pinchStartDist === 0) {
      // 두 손가락이 막 모인 첫 프레임 — 기준선만 잡고 이번 프레임은 줌하지 않는다.
      pinchStartDist = dist(e.touches);
      pinchStartZoom = zoomGestureRef.current?.targetZoom ?? zoomRef.current;
      pinchStartCenter = center(e.touches);
      return;
    }
    e.preventDefault(); // 브라우저 페이지 줌 차단
    const target = zoomLockedRef.current
      ? pinchStartZoom
      : clampZoom(pinchStartZoom * (dist(e.touches) / pinchStartDist));
    const currentCenter = center(e.touches);
    // 프레임마다 리렌더하지 않는다. 거리 변화는 줌, 중심점 이동은 두 손가락 팬으로 같은
    // transform에 합쳐 실제 pan-zoom 설정과 경쟁 드로잉 앱의 제스처를 일치시킨다.
    stepZoomGestureRef.current(() => target, currentCenter.x, currentCenter.y, {
      followClient: true,
      originClientX: pinchStartCenter.x,
      originClientY: pinchStartCenter.y,
    });
    pinchGestureActive = true;
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length === 0) clearOneFingerPan();
    if (e.touches.length !== 2) {
      pinchStartDist = 0;
      if (pinchGestureActive) {
        pinchGestureActive = false;
        // 손가락이 떨어지면 바로 정착시켜 흐릿한 transform 프리뷰를 즉시 크리스프하게 만든다.
        settleZoomGestureRef.current();
      }
    }
  };
  const onTouchCancel = () => {
    clearOneFingerPan();
    pinchStartDist = 0;
    if (!pinchGestureActive) return;
    pinchGestureActive = false;
    settleZoomGestureRef.current();
  };
  node.addEventListener("touchstart", onTouchStart, { passive: true });
  node.addEventListener("touchmove", onTouchMove, { passive: false });
  node.addEventListener("touchend", onTouchEnd, { passive: true });
  node.addEventListener("touchcancel", onTouchCancel, { passive: true });
  return () => {
    clearOneFingerPan();
    node.removeEventListener("touchstart", onTouchStart);
    node.removeEventListener("touchmove", onTouchMove);
    node.removeEventListener("touchend", onTouchEnd);
    node.removeEventListener("touchcancel", onTouchCancel);
  };
}


export function installStudioCanvasSpacePanInput(input: StudioCanvasSpacePanInput): (() => void) | undefined {
  const {
    editing,
    isSpacePressed,
    setIsSpacePressed,
    setIsPanning,
  } = input;
  const handleKeyDown = (e: KeyboardEvent) => {
    if (shouldStartStudioSpacePan({
      code: e.code,
      editing: Boolean(editing),
      isSpacePressed,
      target: e.target,
    })) {
      e.preventDefault();
      setIsSpacePressed(true);
    }
  };
  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      setIsSpacePressed(false);
      setIsPanning(false);
    }
  };
  globalThis.addEventListener("keydown", handleKeyDown);
  globalThis.addEventListener("keyup", handleKeyUp);
  return () => {
    globalThis.removeEventListener("keydown", handleKeyDown);
    globalThis.removeEventListener("keyup", handleKeyUp);
  };
}
