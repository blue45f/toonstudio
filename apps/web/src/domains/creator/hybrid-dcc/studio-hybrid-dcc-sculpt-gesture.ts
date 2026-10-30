/** 포인터 수명과 순수 조형 세션을 구분한다. 토큰은 저장·문서·권한 데이터가 아니다. */
import type { StudioMeshVec3 } from "../studio-editable-half-edge-mesh";

const gestureBrand: unique symbol = Symbol("studio-sculpt-gesture");
export interface StudioSculptGestureToken { readonly [gestureBrand]: true }
export function createStudioSculptGestureToken(): StudioSculptGestureToken {
  const token: StudioSculptGestureToken = { [gestureBrand]: true };
  return Object.freeze(token);
}
export interface StudioSculptGestureInput {
  readonly assetId: string;
  readonly pointerId: number;
  readonly localPoint: StudioMeshVec3;
}
export type StudioSculptCancelReason = "pointercancel" | "lostpointercapture" | "blur" | "unmount"
  | "escape" | "scope-changed" | "capture-failed" | "buttons-released";
export interface StudioSculptGestureController {
  begin(input: StudioSculptGestureInput): StudioSculptGestureToken | null;
  isCurrent(token: StudioSculptGestureToken): boolean;
  sample(token: StudioSculptGestureToken, localPoint: StudioMeshVec3): void;
  end(token: StudioSculptGestureToken): void;
  cancel(token: StudioSculptGestureToken, reason: StudioSculptCancelReason): void;
}
