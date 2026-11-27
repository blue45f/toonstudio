import type { Camera, PerspectiveCamera } from "three";
import type { StudioVrmSceneDocument } from "./studio-vrm-scene-document";

import { STUDIO_VRM_HUMANOID_BONES } from "@toonstudio/contracts/studio-vrm-scene-fields";

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

/** Keep the canvas layer's original image resolution when an artist reopens its character in Shaper. */
export function readEditableCutFrame(scene: StudioVrmSceneDocument | undefined, src: string | undefined): LinkedCutFrame | undefined {
  if (!scene?.characterDocumentId) return undefined;
  const pixels = readLinkedCutPngSize(src);
  return pixels ? { source: scene, pixels } : undefined;
}

type CutDifference = { path: string; saved: unknown; live: unknown };
const cutContextFields = {
  model: "모델", pose: "자세", expressions: "표정", camera: "카메라", render: "출력",
  rig: "리그", lighting: "조명", lightingTone: "조명 톤", env: "환경", physics: "물리",
  sceneProps: "장면 소품", surfacePaint: "표면 채색",
} as const satisfies Partial<Record<keyof StudioVrmSceneDocument, string>>;
type CutContextField = keyof typeof cutContextFields;
const cutContextKeys = Object.keys(cutContextFields) as CutContextField[];

function firstCutDifference(saved: unknown, live: unknown, tolerance = 1e-5): CutDifference | null {
  if (saved === live) return null;
  if (typeof saved === "number" && typeof live === "number" &&
      Math.abs(saved - live) <= tolerance * Math.max(1, Math.abs(saved), Math.abs(live))) return null;
  if (saved && typeof saved === "object" && live && typeof live === "object" &&
      Array.isArray(saved) === Array.isArray(live)) {
    const left = saved as Record<string, unknown>;
    const right = live as Record<string, unknown>;
    for (const key of Object.keys(left)) {
      if (!Object.hasOwn(right, key)) return { path: key, saved: left[key], live: undefined };
      const difference = firstCutDifference(left[key], right[key], tolerance);
      if (difference) return { ...difference, path: difference.path ? key + "." + difference.path : key };
    }
    const extra = Object.keys(right).find(key => !Object.hasOwn(left, key));
    return extra === undefined ? null : { path: extra, saved: undefined, live: right[extra] };
  }
  return { path: "", saved, live };
}

export function linkedCutCameraMatches(a: StudioVrmSceneDocument["camera"], b: StudioVrmSceneDocument["camera"] | null): boolean {
  return firstCutDifference(a, b) === null;
}

/** Validate the restored acting and scene before allowing fresh pixels to replace a saved cut. */
export function linkedCutContextMatches(source: StudioVrmSceneDocument, rendered: StudioVrmSceneDocument): boolean {
  return cutContextKeys.every(key => firstCutDifference(source[key], rendered[key]) === null);
}

/** An interactive edit can change acting. Retain its exact original numbers when only Euler round-off occurred. */
export function preserveUneditedCutPose(
  saved: StudioVrmSceneDocument,
  captured: StudioVrmSceneDocument,
): StudioVrmSceneDocument {
  const { bones: savedBones, fingerOverrides: savedFingers, ...originalBody } = saved.pose;
  const { bones: currentBones, fingerOverrides, ...currentBody } = captured.pose;
  const bones = { ...currentBones };
  for (const name of STUDIO_VRM_HUMANOID_BONES) {
    const original = savedBones[name];
    if (original && firstCutDifference(original, currentBones[name], 1e-12) === null) bones[name] = original;
  }
  const unchangedBody = firstCutDifference(originalBody, currentBody, 1e-12) === null;
  const unchangedFingers = firstCutDifference(savedFingers, fingerOverrides, 1e-12) === null;
  const unchangedCamera = firstCutDifference(saved.camera, captured.camera, 1e-12) === null;
  return {
    ...captured,
    pose: { ...(unchangedBody ? originalBody : currentBody), bones, fingerOverrides: unchangedFingers ? savedFingers : fingerOverrides },
    camera: unchangedCamera ? saved.camera : captured.camera,
  };
}

function describeCutField(key: CutContextField, difference: CutDifference): string {
  const field = cutContextFields[key] + (difference.path ? " (" + difference.path + ")" : "");
  const { saved, live } = difference;
  if (typeof saved === "number" && typeof live === "number") {
    return field + " " + Number(saved.toPrecision(6)) + " → " + Number(live.toPrecision(6));
  }
  if (live === undefined) return field + " 누락";
  if (saved === undefined) return field + " 추가";
  return field;
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
  editableFrame?: LinkedCutFrame,
): Camera {
  if (!frame) return editableFrame ? cameraForLinkedCut(viewportCamera, editableFrame) : viewportCamera;
  const mismatches: string[] = [];
  for (const key of cutContextKeys) {
    const difference = firstCutDifference(frame.source[key], sceneDocument[key]);
    if (difference) mismatches.push(describeCutField(key, difference));
  }
  if (mismatches.length) {
    throw new Error("저장한 컷에서 " + mismatches.join(", ") + " 항목을 복원할 수 없어 기존 이미지를 보존했습니다.");
  }
  return cameraForLinkedCut(viewportCamera, frame);
}
