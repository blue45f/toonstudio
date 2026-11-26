import type { Camera, PerspectiveCamera } from "three";
import type { StudioVrmSceneDocument } from "./studio-vrm-scene-document";

import { readPngDimensions } from "@/platform/creator-asset-response-validation";
import { STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION } from "../bg3d/studio-bg3d-shot-batch-limits";
import { STUDIO_VRM_PNG_MAX_PIXELS } from "./studio-vrm-png-worker-protocol";

export interface LinkedCutFrame {
  readonly source: StudioVrmSceneDocument;
  readonly pixels: { readonly width: number; readonly height: number };
}

/** PNG with optional embedded pose fragment. Decode only the signature + IHDR width/height. */
export function readLinkedCutPngSize(source: string | undefined): LinkedCutFrame["pixels"] | null {
  const prefix = "data:image/png;base64,";
  if (!source?.startsWith(prefix)) return null;
  try {
    const header = atob(source.slice(prefix.length, prefix.length + 32));
    if (header.length !== 24 || header.slice(8, 12) !== "\x00\x00\x00\x0d") return null;
    const size = readPngDimensions(Uint8Array.from(header, char => char.charCodeAt(0)));
    return size && size.width > 0 && size.height > 0 && size.width <= STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION
      && size.height <= STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION && size.width * size.height <= STUDIO_VRM_PNG_MAX_PIXELS ? size : null;
  } catch {
    return null;
  }
}

function equalCutValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (!a || typeof a !== "object" || !b || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equalCutValue(left[key], right[key]));
}

export function linkedCutCameraMatches(a: StudioVrmSceneDocument["camera"], b: StudioVrmSceneDocument["camera"] | null): boolean {
  return equalCutValue(a, b);
}

/** Validate the restored acting and scene before allowing fresh pixels to replace a saved cut. */
export function linkedCutContextMatches(source: StudioVrmSceneDocument, rendered: StudioVrmSceneDocument): boolean {
  const keys = ["model", "pose", "expressions", "camera", "render", "rig", "lighting", "lightingTone", "env", "physics", "sceneProps", "surfacePaint"] as const;
  return keys.every(key => equalCutValue(source[key], rendered[key]));
}

/** The live viewport may have a different aspect. Keep its camera untouched during readback. */
export function cameraForLinkedCut(source: Camera, frame: LinkedCutFrame): PerspectiveCamera {
  if (!(source as PerspectiveCamera).isPerspectiveCamera) throw new Error("저장한 컷의 원근 카메라를 복원할 수 없습니다.");
  const camera = (source as PerspectiveCamera).clone();
  source.updateWorldMatrix(true, false);
  source.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
  camera.aspect = frame.source.render.width / frame.source.render.height;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

/** Validate scene match and return the capture camera for a live insert or linked-cut refresh. */
export function resolveVrmCaptureCameraForFrame(
  viewportCamera: Camera,
  sceneDocument: StudioVrmSceneDocument,
  frame: LinkedCutFrame | undefined,
): Camera {
  if (!frame) return viewportCamera;
  if (!linkedCutContextMatches(frame.source, sceneDocument)) {
    throw new Error("저장한 컷의 연기·카메라·배경을 그대로 복원할 수 없습니다.");
  }
  return cameraForLinkedCut(viewportCamera, frame);
}
