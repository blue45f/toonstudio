import { describe, expect, it } from "vitest";

import { createReferenceSkeleton } from "../../../animation/reference-skeleton";
import { computeWorldTransforms } from "../../../animation/skeleton-fk";
import { projectToPixel } from "../../../render/viewport-math";

import {
  SHAPER_BUILTIN_ARCHETYPE_PRESETS,
  SHAPER_BUILTIN_PART_PRESETS,
  SHAPER_BUILTIN_POSE_PRESETS,
  SHAPER_CONTROL_POINT_SPECS,
  SHAPER_GIZMO_MODES,
  buildShaperPresetCommands,
  computeShaperBoneScaleDrag,
  computeShaperControlPointDrag,
  computeShaperControlPoints,
  computeShaperIkHandleDrag,
} from "./shaper-control-points";

import type { ViewportCameraInfo } from "../../../render/viewport-camera";

const SKELETON = createReferenceSkeleton();
const CAMERA: ViewportCameraInfo = {
  position: [0, 1.1, 4],
  forward: [0, 0, -1],
  right: [1, 0, 0],
  up: [0, 1, 0],
  fovY: 0.8,
  width: 800,
  height: 800,
};

describe("SHAPER ControlPoint · 기즈모 모드 · 풀세트 아키타입 브리지", () => {
  it("SHAPER 기즈모 모드(0:Q 선택, 1:W IK이동, 2:E 회전, 3:R 스케일)를 순서대로 정의한다", () => {
    expect(SHAPER_GIZMO_MODES.map((m) => [m.mode, m.shortcutKey])).toEqual([
      [0, "Q"],
      [1, "W"],
      [2, "E"],
      [3, "R"],
    ]);
  });

  it("computeShaperControlPoints: 두상 9개·체형 4개 제어점의 월드·화면 좌표를 투영한다", () => {
    const points = computeShaperControlPoints(SKELETON, {}, CAMERA);
    expect(points).toHaveLength(SHAPER_CONTROL_POINT_SPECS.length);
    expect(points.filter((p) => p.category === "face")).toHaveLength(9);
    expect(points.filter((p) => p.category === "body")).toHaveLength(4);
    const nose = points.find((p) => p.id === "cp-face-nose");
    const chin = points.find((p) => p.id === "cp-face-chin");
    expect(nose).toBeDefined();
    expect(chin).toBeDefined();
    // 화면 좌표계에서 코는 턱보다 위(작은 y)에 투영된다
    expect((nose?.screen[1] ?? 0) < (chin?.screen[1] ?? 0)).toBe(true);
  });

  it("computeShaperControlPointDrag: 제어점 드래그 변위를 얼굴·체형 파라미터([-1, 1])로 환산한다", () => {
    const jawSpec = SHAPER_CONTROL_POINT_SPECS.find((s) => s.id === "cp-face-jaw");
    if (!jawSpec) throw new Error("cp-face-jaw missing");
    const outcome = computeShaperControlPointDrag({
      controlPoint: jawSpec,
      startPixel: [400, 300],
      currentPixel: [460, 250],
      renderWidth: 800,
      renderHeight: 800,
      baseFace: { jawWidth: -0.1 },
      baseBody: {},
    });
    expect(outcome.nextFace.jawWidth).toBeGreaterThan(-0.1);
    expect(outcome.nextFace.faceShape).toBeGreaterThan(0);
    expect(outcome.changes.map((c) => c.key)).toEqual(["jawWidth", "faceShape"]);
    expect(outcome.summaryKo).toContain("턱선·얼굴 윤곽 제어점");

    const shoulderSpec = SHAPER_CONTROL_POINT_SPECS.find((s) => s.id === "cp-body-shoulders");
    if (!shoulderSpec) throw new Error("cp-body-shoulders missing");
    const bodyOutcome = computeShaperControlPointDrag({
      controlPoint: shoulderSpec,
      startPixel: [400, 400],
      currentPixel: [520, 460],
      renderWidth: 800,
      renderHeight: 800,
      baseFace: {},
      baseBody: { shoulderWidth: 0 },
    });
    expect(bodyOutcome.nextBody.shoulderWidth).toBeGreaterThan(0);
    expect(bodyOutcome.nextBody.armLength).toBeGreaterThan(0);
  });

  it("computeShaperIkHandleDrag: W(IK 이동) 모드에서 손·머리 핸들을 끌면 사지 2-Bone IK와 척추 FABRIK IK를 푼다", () => {
    const transforms = computeWorldTransforms(SKELETON, {});
    const leftHandWorld = transforms.get("leftHand")?.position;
    if (!leftHandWorld) throw new Error("leftHand missing");
    const startPixel = projectToPixel(CAMERA, leftHandWorld);
    const targetPixel = projectToPixel(CAMERA, [leftHandWorld[0] - 0.08, leftHandWorld[1] + 0.15, leftHandWorld[2] + 0.05]);
    if (!startPixel || !targetPixel) throw new Error("projection failed");

    const armIk = computeShaperIkHandleDrag({
      skeleton: SKELETON,
      startPose: {},
      handleBone: "leftHand",
      camera: CAMERA,
      startPixel,
      currentPixel: targetPixel,
      symmetryEnabled: true,
    });
    expect(armIk).not.toBeNull();
    expect(armIk?.pose.leftUpperArm).toBeDefined();
    expect(armIk?.pose.leftLowerArm).toBeDefined();
    // 대칭 모드가 켜져 있으면 반대쪽 팔(rightUpperArm, rightLowerArm)에도 대칭 IK 회전이 적용된다
    expect(armIk?.pose.rightUpperArm).toBeDefined();
    expect(armIk?.pose.rightLowerArm).toBeDefined();

    const headWorld = transforms.get("head")?.position;
    if (!headWorld) throw new Error("head missing");
    const headStart = projectToPixel(CAMERA, headWorld);
    const headTarget = projectToPixel(CAMERA, [headWorld[0] + 0.06, headWorld[1] - 0.03, headWorld[2]]);
    if (!headStart || !headTarget) throw new Error("head projection failed");

    const spineIk = computeShaperIkHandleDrag({
      skeleton: SKELETON,
      startPose: {},
      handleBone: "head",
      camera: CAMERA,
      startPixel: headStart,
      currentPixel: headTarget,
    });
    expect(spineIk).not.toBeNull();
    expect(spineIk?.labelKo).toContain("척추 IK 이동");
    expect(spineIk?.pose.spine).toBeDefined();
  });

  it("computeShaperBoneScaleDrag: R(체형 스케일) 모드에서 본 핸들 드래그를 부위별 체형 파라미터로 변환한다", () => {
    const waistScale = computeShaperBoneScaleDrag({
      handleBone: "spine",
      startPixel: [400, 400],
      currentPixel: [450, 380],
      renderWidth: 800,
      renderHeight: 800,
      baseBody: { waist: -0.2 },
    });
    expect(waistScale.key).toBe("waist");
    expect(waistScale.value).toBeGreaterThan(-0.2);
    expect(waistScale.labelKo).toContain("허리 스케일");
  });

  it("SHAPER 풀세트 아키타입·포즈·부위 프리셋이 유효한 명령 시퀀스를 생성한다", () => {
    expect(Object.keys(SHAPER_BUILTIN_ARCHETYPE_PRESETS).length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(SHAPER_BUILTIN_POSE_PRESETS)).toEqual(["shaper-pose-1", "shaper-pose-2", "shaper-pose-3"]);
    expect(Object.keys(SHAPER_BUILTIN_PART_PRESETS).length).toBeGreaterThanOrEqual(5);

    const survivorMale = buildShaperPresetCommands("shaper-archetype-survivor-male");
    expect(survivorMale).not.toBeNull();
    expect(survivorMale?.commands.some((c) => c.type === "slot/apply" && c.slot === "hair" && c.presetId === "hair/wolf-layered")).toBe(true);
    expect(survivorMale?.commands.some((c) => c.type === "slot/apply" && c.slot === "top" && c.presetId === "top/hoodie")).toBe(true);
    expect(survivorMale?.commands.some((c) => c.type === "color/set" && c.key === "skin" && c.value === "#ffecce")).toBe(true);
    expect(survivorMale?.commands.some((c) => c.type === "pose/set")).toBe(true);

    const pose2 = buildShaperPresetCommands("shaper-pose-2");
    expect(pose2?.commands).toEqual([
      expect.objectContaining({ type: "pose/set", scope: "full" }),
    ]);

    const elfEars = buildShaperPresetCommands("shaper-part-ears-elf");
    expect(elfEars?.commands.some((c) => c.type === "slot/apply" && c.slot === "ears" && c.presetId === "ears/pointed")).toBe(true);
    expect(elfEars?.commands.some((c) => c.type === "param/set" && c.group === "face" && c.key === "earSize")).toBe(true);
  });
});
