/** 실제 ray hit만 로컬 샘플로 전달하고, 문서와 별개로 포인터 capture의 수명만 소유한다. */
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Group } from "three";
import type { StudioEditableMesh, StudioMeshVec3 } from "../studio-editable-half-edge-mesh";
import { createStudioSculptGestureToken, type StudioSculptGestureController, type StudioSculptGestureToken } from "./studio-hybrid-dcc-sculpt-gesture";
import { createStudioSculptPointerAdapter, type StudioSculptPointerCapture } from "./studio-hybrid-dcc-sculpt-pointer";

interface Options {
  readonly assetId: string;
  readonly sourceMesh: StudioEditableMesh;
  readonly sourceMeshHash: string;
  readonly sourceMeshRevision: number;
  readonly objectRef: RefObject<Group | null>;
  readonly controller?: StudioSculptGestureController;
  readonly legacyStroke?: (point: StudioMeshVec3) => void;
  readonly onDraggingChange: (active: boolean) => void;
}
export type StudioSculptPointerEvent = Pick<ThreeEvent<PointerEvent>, "pointerId" | "timeStamp" | "button" | "buttons"
  | "isPrimary" | "target" | "eventObject" | "stopPropagation">;
function captureTarget(value: unknown): StudioSculptPointerCapture | null {
  if (!value || typeof value !== "object" || !("setPointerCapture" in value) || !("releasePointerCapture" in value)
    || !("hasPointerCapture" in value) || typeof value.setPointerCapture !== "function"
    || typeof value.releasePointerCapture !== "function" || typeof value.hasPointerCapture !== "function") return null;
  const set = value.setPointerCapture, release = value.releasePointerCapture, has = value.hasPointerCapture;
  return {
    setPointerCapture: (pointerId) => { Reflect.apply(set, value, [pointerId]); },
    releasePointerCapture: (pointerId) => { Reflect.apply(release, value, [pointerId]); },
    hasPointerCapture: (pointerId) => Reflect.apply(has, value, [pointerId]) === true,
  };
}
export function useStudioHybridDccSculptPointer(options: Options) {
  const { gl, raycaster } = useThree(), latest = useRef(options);
  const [adapter] = useState(() => createStudioSculptPointerAdapter((active) => latest.current.onDraggingChange(active)));
  const lostFrame = useRef<{ readonly token: StudioSculptGestureToken; frame: number } | null>(null);
  const legacyToken = useRef<StudioSculptGestureToken | null>(null);
  const [legacyController] = useState<StudioSculptGestureController>(() => ({
    begin: ({ localPoint }) => { const token = createStudioSculptGestureToken(); legacyToken.current = token; latest.current.legacyStroke?.(localPoint); return token; },
    isCurrent: (token) => legacyToken.current === token && !latest.current.controller && Boolean(latest.current.legacyStroke),
    sample: (_token, point) => { latest.current.legacyStroke?.(point); },
    end: () => { legacyToken.current = null; }, cancel: () => { legacyToken.current = null; },
  }));
  const { assetId, sourceMesh, sourceMeshHash, sourceMeshRevision, controller } = options;
  const enabled = Boolean(controller || options.legacyStroke);
  useLayoutEffect(() => { latest.current = options; adapter.reconcile(); });
  useLayoutEffect(() => () => { adapter.cancel("scope-changed"); }, [adapter, assetId, sourceMesh, sourceMeshHash, sourceMeshRevision, controller]);
  const deferLost = useCallback((pointerId: number, timeStamp: number) => {
    const token = adapter.currentToken();
    if (!token || lostFrame.current?.token === token) return;
    const settle = adapter.deferLostCapture(pointerId, timeStamp, () => gl.domElement.hasPointerCapture(pointerId));
    if (!settle) return;
    if (lostFrame.current) cancelAnimationFrame(lostFrame.current.frame);
    if (typeof requestAnimationFrame !== "function") { lostFrame.current = null; queueMicrotask(settle); return; }
    const frame = { token, frame: 0 };
    frame.frame = requestAnimationFrame(() => { if (lostFrame.current === frame) lostFrame.current = null; settle(); });
    lostFrame.current = frame;
  }, [adapter, gl]);
  useEffect(() => {
    if (!enabled) return;
    const canvas = gl.domElement;
    const up = (event: PointerEvent) => { adapter.end(event.pointerId, event.timeStamp); };
    const cancel = (event: PointerEvent) => { adapter.cancel("pointercancel", event.pointerId, event.timeStamp); };
    const lost = (event: PointerEvent) => { deferLost(event.pointerId, event.timeStamp); };
    const blur = () => { adapter.cancel("blur"); };
    const escape = (event: KeyboardEvent) => {
      if (!adapter.isActive() || event.key !== "Escape" || event.isComposing || event.defaultPrevented
        || !(event.target instanceof Element)) return;
      const scope = canvas.closest("[data-studio-hybrid-dcc-viewport]");
      if (!scope?.contains(event.target)) return;
      if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      const inner = event.target.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"], [data-studio-escape-scope="true"]');
      if (inner && !inner.contains(scope)) return;
      event.preventDefault(); event.stopPropagation(); adapter.cancel("escape");
    };
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
    canvas.addEventListener("lostpointercapture", lost); window.addEventListener("blur", blur);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", lost); window.removeEventListener("blur", blur);
      window.removeEventListener("keydown", escape, true);
      if (lostFrame.current) { cancelAnimationFrame(lostFrame.current.frame); lostFrame.current = null; }
      adapter.cancel("unmount");
    };
  }, [adapter, deferLost, enabled, gl]);
  function localPoint(event: StudioSculptPointerEvent): StudioMeshVec3 | null {
    const group = latest.current.objectRef.current;
    if (!group) return null;
    // R3F capture는 마지막 intersection을 재사용할 수 있다. 현재 이 mesh의 실제 hit만 채택한다.
    const hit = raycaster.intersectObject(event.eventObject, false)[0];
    if (!hit) return null;
    const point = group.worldToLocal(hit.point.clone());
    return [point.x, point.y, point.z].every(Number.isFinite) ? { x: point.x, y: point.y, z: point.z } : null;
  }
  return {
    onPointerDown(event: StudioSculptPointerEvent) {
      const current = latest.current;
      if ((!current.controller && !current.legacyStroke) || event.button !== 0 || event.isPrimary === false) return;
      event.stopPropagation();
      const point = localPoint(event); if (!point) return;
      // 새 controller의 begin 거절을 구 point callback으로 우회하지 않는다.
      const capture = captureTarget(event.target);
      if (capture) adapter.begin(current.controller ?? legacyController,
        { assetId: current.assetId, pointerId: event.pointerId, localPoint: point }, capture, event.timeStamp);
    },
    onPointerMove(event: StudioSculptPointerEvent) {
      const current = latest.current;
      if (!current.controller && !current.legacyStroke) return;
      if ((event.buttons & 1) !== 1) { adapter.cancel("buttons-released", event.pointerId, event.timeStamp); return; }
      if (current.controller && !adapter.isActive()) return;
      event.stopPropagation(); const point = localPoint(event); if (!point) return;
      if (current.controller) adapter.sample(event.pointerId, event.timeStamp, point); else current.legacyStroke?.(point);
    },
    onPointerUp(event: StudioSculptPointerEvent) { if (adapter.end(event.pointerId, event.timeStamp)) event.stopPropagation(); },
    onPointerCancel(event: StudioSculptPointerEvent) { adapter.cancel("pointercancel", event.pointerId, event.timeStamp); },
    onLostPointerCapture(event: StudioSculptPointerEvent) { deferLost(event.pointerId, event.timeStamp); },
  };
}
