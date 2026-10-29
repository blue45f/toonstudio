/** 배경 장면 단축키는 중첩 편집기의 키·이미 처리된 키를 가로채지 않는다. */
import { isStudioBg3dPhysicsTransientPhase, type StudioBg3dPhysicsPhase } from "./studio-bg3d-physics-ui";

export interface StudioBg3dSceneKeyboardPorts {
  readonly captureInFlightRef: { readonly current: boolean };
  readonly webXrSessionStateRef: { readonly current: { readonly status: string } };
  readonly physicsPhaseRef: { readonly current: StudioBg3dPhysicsPhase };
  readonly selectedIdsRef: { readonly current: ReadonlySet<string> };
  readonly measurementActiveRef: { readonly current: boolean };
  deleteSelected(): void;
  undo(): void;
  redo(): void;
  cancelMeasurement(message: string): void;
  setTransformMode(mode: "translate" | "rotate" | "scale"): void;
}

function elementTarget(target: EventTarget | null): target is Element {
  return target !== null && "closest" in target && typeof target.closest === "function";
}

function belongsToAnotherEditor(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing) return true;
  if (!elementTarget(event.target)) return false;
  if (event.target.closest('[data-studio-shortcut-boundary="true"]')) return true;
  const input = event.target.closest("input,textarea,select,[contenteditable]");
  return input !== null && (input.matches("input,textarea,select") || input.getAttribute("contenteditable") !== "false");
}

/** refs는 이벤트 순간에 읽고, 명령은 현재 호스트에 위임한다. 등록 시점의 선택을 복사하지 않는다. */
export function createStudioBg3dSceneKeyboardHandler(ports: StudioBg3dSceneKeyboardPorts): (event: KeyboardEvent) => void {
  return (event) => {
    if (belongsToAnotherEditor(event) || ports.captureInFlightRef.current) return;
    const xr = ports.webXrSessionStateRef.current.status;
    if (xr !== "idle" && xr !== "error") return;
    if (event.key === "Delete" || event.key === "Backspace") {
      if (!isStudioBg3dPhysicsTransientPhase(ports.physicsPhaseRef.current) && ports.selectedIdsRef.current.size > 0) {
        event.preventDefault(); ports.deleteSelected();
      }
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase();
      if (key === "z") { event.preventDefault(); if (event.shiftKey) ports.redo(); else ports.undo(); }
      else if (key === "y") { event.preventDefault(); ports.redo(); }
      return;
    }
    const key = event.key.toLowerCase();
    if (key !== "t" && key !== "r" && key !== "s") return;
    if (ports.measurementActiveRef.current) ports.cancelMeasurement("변형 도구로 전환해 줄자 측정을 취소했습니다.");
    ports.setTransformMode(key === "t" ? "translate" : key === "r" ? "rotate" : "scale");
  };
}
