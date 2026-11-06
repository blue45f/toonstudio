import { describe, expect, it } from "vitest";

import { createReferenceSkeleton } from "../../../animation/reference-skeleton";
import { computeWorldTransforms } from "../../../animation/skeleton-fk";
import { isLabFailure } from "../../../contracts";
import { projectToPixel } from "../../../render/viewport-math";
import { qFromAxisAngle } from "../../../shared/math";

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
import { pushShaperHistoryEntry, stepShaperHistoryCursor } from "./viewport-interactions";

import type { BodyParamKey, FaceParamKey, LabFailure, ParamValues, Pose, SkeletonData } from "../../../contracts";
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

describe("shaper-control-points — 손상 스켈레톤·비유한 좌표·순환 참조 안전 경계 회귀 검증", () => {
  const nanRestSkeleton: SkeletonData = Object.freeze({
    bones: Object.freeze(
      SKELETON.bones.map((bone) =>
        bone.name === "head"
          ? Object.freeze({ ...bone, restTranslation: Object.freeze([0, Number.NaN, 0] as const) })
          : Object.freeze({ ...bone }),
      ),
    ),
  });

  const infRestSkeleton: SkeletonData = Object.freeze({
    bones: Object.freeze(
      SKELETON.bones.map((bone) =>
        bone.name === "leftHand"
          ? Object.freeze({ ...bone, restTranslation: Object.freeze([Number.POSITIVE_INFINITY, 0, 0] as const) })
          : Object.freeze({ ...bone }),
      ),
    ),
  });

  const cycleHipsSpineSkeleton: SkeletonData = Object.freeze({
    bones: Object.freeze([
      Object.freeze({ name: "hips", parent: "spine", restTranslation: [0, 1, 0] as const, restRotation: [0, 0, 0, 1] as const }),
      Object.freeze({ name: "spine", parent: "hips", restTranslation: [0, 0.2, 0] as const, restRotation: [0, 0, 0, 1] as const }),
      Object.freeze({ name: "head", parent: "spine", restTranslation: [0, 0.3, 0] as const, restRotation: [0, 0, 0, 1] as const }),
    ]),
  });

  const cycleAuxSkeleton: SkeletonData = Object.freeze({
    bones: Object.freeze([
      Object.freeze({ name: "hips", parent: null, restTranslation: [0, 1, 0] as const, restRotation: [0, 0, 0, 1] as const }),
      Object.freeze({ name: "aux1", parent: "aux2", restTranslation: [0, 0.1, 0] as const, restRotation: [0, 0, 0, 1] as const }),
      Object.freeze({ name: "aux2", parent: "aux1", restTranslation: [0, 0.1, 0] as const, restRotation: [0, 0, 0, 1] as const }),
      Object.freeze({ name: "head", parent: "aux1", restTranslation: [0, 0.3, 0] as const, restRotation: [0, 0, 0, 1] as const }),
    ]),
  });

  it("computeShaperControlPoints: NaN/Infinity restTranslation 및 부모 순환 시 예외 없이 []를 반환하고 LabFailure를 보고하며, 카메라 뒤쪽 정상 빈 결과와 구별한다", () => {
    const frozenPose: Pose = Object.freeze({
      spine: Object.freeze(qFromAxisAngle([1, 0, 0], 0.15)),
    });

    const nanFailures: LabFailure[] = [];
    expect(
      computeShaperControlPoints(nanRestSkeleton, frozenPose, CAMERA, {
        now: 1700000003000,
        onFailure: (f) => nanFailures.push(f),
      }),
    ).toEqual([]);
    expect(nanFailures).toHaveLength(1);
    expect(isLabFailure(nanFailures[0])).toBe(true);
    expect(nanFailures[0]?.code).toBe("skeleton-non-finite-rest");

    const cycleFailures: LabFailure[] = [];
    expect(
      computeShaperControlPoints(cycleHipsSpineSkeleton, frozenPose, CAMERA, {
        now: 1700000003001,
        onFailure: (f) => cycleFailures.push(f),
      }),
    ).toEqual([]);
    expect(cycleFailures).toHaveLength(1);
    expect(cycleFailures[0]?.code).toBe("skeleton-cycle");

    const auxCycleFailures: LabFailure[] = [];
    expect(
      computeShaperControlPoints(cycleAuxSkeleton, frozenPose, CAMERA, {
        now: 1700000003002,
        onFailure: (f) => auxCycleFailures.push(f),
      }),
    ).toEqual([]);
    expect(auxCycleFailures).toHaveLength(1);
    expect(auxCycleFailures[0]?.code).toBe("skeleton-cycle");

    // 정상 빈 결과(카메라가 반대 방향을 바라봐 모든 제어점이 카메라 뒤쪽인 경우)에서는 onFailure가 호출되지 않는다
    const behindCamera: ViewportCameraInfo = {
      ...CAMERA,
      position: [0, 1.1, -4],
      forward: [0, 0, -1],
    };
    const behindFailures: LabFailure[] = [];
    expect(
      computeShaperControlPoints(SKELETON, frozenPose, behindCamera, {
        onFailure: (f) => behindFailures.push(f),
      }),
    ).toEqual([]);
    expect(behindFailures).toHaveLength(0);

    // 실패 직후 정상 스켈레톤·카메라로 재호출 시 즉시 13개 제어점 모두 유한한 좌표로 복구된다
    const recovered = computeShaperControlPoints(SKELETON, frozenPose, CAMERA);
    expect(recovered).toHaveLength(SHAPER_CONTROL_POINT_SPECS.length);
    for (const pt of recovered) {
      expect(Number.isFinite(pt.screen[0])).toBe(true);
      expect(Number.isFinite(pt.screen[1])).toBe(true);
    }
  });

  it("computeShaperIkHandleDrag: 비유한 픽셀·손상 스켈레톤(NaN/Infinity/순환)을 LabFailure 코드별로 격리하고 정상 빈 결과와 구별한다", () => {
    const startPose: Pose = Object.freeze({
      leftUpperArm: Object.freeze(qFromAxisAngle([0, 0, 1], 0.12)),
    });

    // 1. 비유한 픽셀 좌표 ([NaN, 300], [Infinity, -Infinity])
    const pixelFailures: LabFailure[] = [];
    expect(
      computeShaperIkHandleDrag({
        skeleton: SKELETON,
        startPose,
        handleBone: "leftHand",
        camera: CAMERA,
        startPixel: [Number.NaN, 300],
        currentPixel: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
        now: 1700000004000,
        onFailure: (f) => pixelFailures.push(f),
      }),
    ).toBeNull();
    expect(pixelFailures).toHaveLength(1);
    expect(pixelFailures[0]?.code).toBe("skeleton-invalid-input");

    // 2. NaN / Infinity restTranslation 스켈레톤
    const restFailures: LabFailure[] = [];
    expect(
      computeShaperIkHandleDrag({
        skeleton: infRestSkeleton,
        startPose,
        handleBone: "leftHand",
        camera: CAMERA,
        startPixel: [360, 420],
        currentPixel: [340, 390],
        now: 1700000004001,
        onFailure: (f) => restFailures.push(f),
      }),
    ).toBeNull();
    expect(restFailures).toHaveLength(1);
    expect(restFailures[0]?.code).toBe("skeleton-non-finite-rest");

    // 3. 부모 순환 스켈레톤
    const cycleFailures: LabFailure[] = [];
    expect(
      computeShaperIkHandleDrag({
        skeleton: cycleHipsSpineSkeleton,
        startPose,
        handleBone: "head",
        camera: CAMERA,
        startPixel: [400, 260],
        currentPixel: [420, 250],
        now: 1700000004002,
        onFailure: (f) => cycleFailures.push(f),
      }),
    ).toBeNull();
    expect(cycleFailures).toHaveLength(1);
    expect(cycleFailures[0]?.code).toBe("skeleton-cycle");

    // 4. 정상 빈 결과 (유효한 빈 스켈레톤에서 없는 본 조회) — onFailure 미호출
    const emptyValidSkeleton: SkeletonData = Object.freeze({ bones: Object.freeze([]) });
    const normalFailures: LabFailure[] = [];
    expect(
      computeShaperIkHandleDrag({
        skeleton: emptyValidSkeleton,
        startPose,
        handleBone: "leftHand",
        camera: CAMERA,
        startPixel: [360, 420],
        currentPixel: [340, 390],
        onFailure: (f) => normalFailures.push(f),
      }),
    ).toBeNull();
    expect(normalFailures).toHaveLength(0);

    // 5. 폴백 FK 경로(leftUpperArm) 및 실패 직후 정상 IK 드래그 즉시 회복 검증
    const transforms = computeWorldTransforms(SKELETON, startPose);
    const upperArmPos = transforms.get("leftUpperArm")?.position;
    if (!upperArmPos) throw new Error("leftUpperArm missing");
    const fkStart = projectToPixel(CAMERA, upperArmPos);
    const fkTarget = projectToPixel(CAMERA, [upperArmPos[0] - 0.05, upperArmPos[1] + 0.08, upperArmPos[2]]);
    if (!fkStart || !fkTarget) throw new Error("fk projection failed");

    const fkFailures: LabFailure[] = [];
    const fkOutcome = computeShaperIkHandleDrag({
      skeleton: SKELETON,
      startPose,
      handleBone: "leftUpperArm",
      camera: CAMERA,
      startPixel: fkStart,
      currentPixel: fkTarget,
      pivotMode: "direct",
      symmetryEnabled: true,
      onFailure: (f) => fkFailures.push(f),
    });
    expect(fkFailures).toHaveLength(0);
    expect(fkOutcome).not.toBeNull();
    expect(fkOutcome?.pose.leftUpperArm).toBeDefined();
    expect(fkOutcome?.pose.rightUpperArm).toBeDefined();
  });

  it("computeShaperControlPointDrag · computeShaperBoneScaleDrag: 비유한 픽셀/해상도 입력 시 baseFace/baseBody가 0으로 덮어써지지 않고 원본·Undo·프리셋을 보존한다", () => {
    const jawSpec = SHAPER_CONTROL_POINT_SPECS.find((s) => s.id === "cp-face-jaw");
    const shoulderSpec = SHAPER_CONTROL_POINT_SPECS.find((s) => s.id === "cp-body-shoulders");
    if (!jawSpec || !shoulderSpec) throw new Error("control point specs missing");

    const baseFace: ParamValues<FaceParamKey> = Object.freeze({
      jawWidth: -0.24,
      faceShape: -0.15,
    });
    const baseBody: ParamValues<BodyParamKey> = Object.freeze({
      shoulderWidth: 0.42,
      armLength: 0.18,
      waist: -0.28,
    });
    let history = pushShaperHistoryEntry(
      { entries: [], curPos: -1 },
      { type: "selectControlPoints", payload: { face: baseFace, body: baseBody } },
    );

    // 비유한 픽셀 ([NaN, 300], [Infinity, -Infinity]) 입력 시 기존 파라미터가 0으로 초기화되지 않는다
    const nanFaceDrag = computeShaperControlPointDrag({
      controlPoint: jawSpec,
      startPixel: [Number.NaN, 300],
      currentPixel: [460, 250],
      renderWidth: 800,
      renderHeight: 800,
      baseFace,
      baseBody,
    });
    expect(nanFaceDrag.changes).toEqual([]);
    expect(nanFaceDrag.nextFace).toEqual(baseFace);
    expect(nanFaceDrag.nextBody).toEqual(baseBody);

    // 비유한 해상도 (renderWidth: NaN, renderHeight: Infinity) 입력 시에도 기존 파라미터가 보존된다
    const infSizeDrag = computeShaperControlPointDrag({
      controlPoint: shoulderSpec,
      startPixel: [400, 400],
      currentPixel: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
      renderWidth: Number.NaN,
      renderHeight: Number.POSITIVE_INFINITY,
      baseFace,
      baseBody,
    });
    expect(infSizeDrag.changes).toEqual([]);
    expect(infSizeDrag.nextBody.shoulderWidth).toBe(0.42);
    expect(infSizeDrag.nextBody.armLength).toBe(0.18);

    // 체형 스케일 드래그(R 모드)에 비유한 픽셀/해상도가 들어와도 기존 waist(-0.28)가 0으로 오염되지 않는다
    const nanScale = computeShaperBoneScaleDrag({
      handleBone: "spine",
      startPixel: [Number.NaN, 400],
      currentPixel: [Number.POSITIVE_INFINITY, 380],
      renderWidth: 800,
      renderHeight: Number.NaN,
      baseBody,
    });
    expect(nanScale.key).toBe("waist");
    expect(nanScale.value).toBe(-0.28);

    // 실패 직후 정상 드래그 및 내장 프리셋(SHAPER_BUILTIN_POSE_PRESETS) 재적용이 즉시 정상 동작한다
    const recoveredDrag = computeShaperControlPointDrag({
      controlPoint: jawSpec,
      startPixel: [400, 300],
      currentPixel: [460, 250],
      renderWidth: 800,
      renderHeight: 800,
      baseFace,
      baseBody,
    });
    expect(recoveredDrag.changes.length).toBe(2);
    expect(recoveredDrag.nextFace.jawWidth).toBeGreaterThan(-0.24);

    history = pushShaperHistoryEntry(history, {
      type: "selectControlPoints",
      payload: { face: recoveredDrag.nextFace, body: recoveredDrag.nextBody },
    });
    const undo = stepShaperHistoryCursor(history, -1);
    expect(undo.appliedEntry?.payload).toEqual({ face: baseFace, body: baseBody });

    const posePresetCmds = buildShaperPresetCommands("shaper-pose-1");
    expect(posePresetCmds?.commands).toEqual([
      expect.objectContaining({ type: "pose/set", scope: "full" }),
    ]);
  });
});

