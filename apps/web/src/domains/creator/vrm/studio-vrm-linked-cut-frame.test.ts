import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { cameraForLinkedCut, linkedCutCameraMatches, linkedCutContextMatches, preserveUneditedCutPose, readEditableCutFrame, readLinkedCutPngSize, resolveVrmCaptureCameraForFrame } from "./studio-vrm-linked-cut-frame";
import { vrmInsertCaptureSize } from "./studio-vrm-poser-helpers";
import { createDefaultStudioVrmSceneDocument } from "./studio-vrm-scene-document";

describe("linked placement recapture", () => {
  const scene = createDefaultStudioVrmSceneDocument();
  it("reads original PNG geometry with a pose fragment and rejects an unavailable or malformed source", () => {
    const size = readLinkedCutPngSize("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAEA#pose");
    expect(size).toEqual({ width: 512, height: 256 });
    expect(readLinkedCutPngSize("blob:a")).toBeNull();
    expect(readLinkedCutPngSize("data:image/png;base64,iVBORw0KGgoAAAABSUhEUgAAAgAAAAEA")).toBeNull();
  });
  it("permits new appearance only if the original shot and acting survive round-trip", () => {
    const changedLook = { ...scene, appearance: { ...scene.appearance, mannequin: !scene.appearance.mannequin } };
    expect(linkedCutContextMatches(scene, changedLook)).toBe(true);
    expect(linkedCutContextMatches(scene, { ...changedLook, pose: { ...scene.pose, bodyRotationY: scene.pose.bodyRotationY + .3 } })).toBe(false);
    expect(linkedCutContextMatches(scene, { ...changedLook, expressions: { ...scene.expressions, happy: 0.75 } })).toBe(false);
    expect(linkedCutContextMatches(scene, { ...changedLook, render: { ...scene.render, transparentBackground: !scene.render.transparentBackground } })).toBe(false);
    expect(linkedCutCameraMatches(scene.camera, { ...scene.camera, fovDegrees: scene.camera.fovDegrees + 1 })).toBe(false);
  });
  it("retains original framing and body precision during a local finger edit, while accepting intentional body edits", () => {
    const fingers = { rightIndexProximal: [0, 0, .5] as const };
    const captured = { ...scene, pose: { ...scene.pose, bodyRotationY: scene.pose.bodyRotationY + 2e-15, fingerOverrides: fingers },
      camera: { ...scene.camera, fovDegrees: scene.camera.fovDegrees + 1e-13 } };
    const edit = preserveUneditedCutPose(scene, captured);
    expect(edit.pose).toEqual({ ...scene.pose, fingerOverrides: fingers });
    expect(edit.camera).toBe(scene.camera);
    const moved = { ...captured, pose: { ...captured.pose, bodyRotationY: .5 }, camera: { ...scene.camera, fovDegrees: 27 } };
    expect(preserveUneditedCutPose(scene, moved)).toEqual(moved);
  });
  it("identifies the first differing field in each shot setting before pixel capture", () => {
    const frame = { source: scene, pixels: { width: 200, height: 100 } };
    const altered = { ...scene, pose: { ...scene.pose, bodyRotationY: scene.pose.bodyRotationY + 0.3 },
      camera: { ...scene.camera, fovDegrees: scene.camera.fovDegrees + 4 } };
    expect(() => resolveVrmCaptureCameraForFrame(new PerspectiveCamera(), altered, frame))
      .toThrow(/자세 \(bodyRotationY\).*카메라 \(fovDegrees\).*기존 이미지를 보존/u);
  });
  it("keeps an existing cut's PNG resolution and aspect when editing its pose or camera from a wider pane", () => {
    const original = { ...scene, characterDocumentId: "character:page/a", render: { ...scene.render, width: 128, height: 64 } };
    const frame = readEditableCutFrame(original, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAEA");
    expect(frame?.pixels).toEqual({ width: 512, height: 256 });
    expect(readEditableCutFrame(scene, "blob:unlinked")).toBeUndefined();
    const viewport = new PerspectiveCamera(57, 3, .01, 100);
    viewport.position.set(1, 2, 3);
    const edited = { ...original, camera: { ...original.camera, fovDegrees: 57 }, pose: { ...original.pose, bodyRotationY: .7 } };
    const rendered = resolveVrmCaptureCameraForFrame(viewport, edited, undefined, frame) as PerspectiveCamera;
    expect(rendered.fov).toBe(57);
    expect(rendered.aspect).toBe(2);
    expect(rendered.position.toArray()).toEqual([1, 2, 3]);
    expect(viewport.aspect).toBe(3);
    expect(() => resolveVrmCaptureCameraForFrame(viewport, edited, frame)).toThrow();
    expect(resolveVrmCaptureCameraForFrame(viewport, edited, undefined)).toBe(viewport);
  });
  it("captures with the stored shot aspect even when the current window is landscape", () => {
    const camera = new PerspectiveCamera(35, 2, .01, 100);
    camera.position.set(2, 1, 3);
    camera.lookAt(new Vector3(0, 1, 0));
    const frame = { source: { ...scene, render: { ...scene.render, width: 90, height: 160 } }, pixels: { width: 180, height: 320 } };
    const canvas = { width: 200, height: 100 } as HTMLCanvasElement;
    const normal = vrmInsertCaptureSize(canvas);
    expect([normal.displayWidth, normal.displayHeight]).toEqual([1040, 520]);
    expect(normal.width).toBeGreaterThan(normal.displayWidth);
    expect(vrmInsertCaptureSize(canvas, frame)).toEqual({ displayWidth: 90, displayHeight: 160, width: 180, height: 320 });
    const output = cameraForLinkedCut(camera, frame);
    expect(output.aspect).toBe(90 / 160);
    expect(output.position.distanceTo(camera.position)).toBeLessThan(1e-8);
    expect(output.quaternion.angleTo(camera.quaternion)).toBeLessThan(1e-6);
    expect(camera.aspect).toBe(2);
    expect(output).not.toBe(camera);
  });
});
