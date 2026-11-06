import { describe, expect, it } from "vitest";

import { createReferenceSkeleton } from "../../../animation/reference-skeleton";
import { computeWorldTransforms } from "../../../animation/skeleton-fk";
import { HUMANOID_BONE_NAMES, isLabFailure } from "../../../contracts";
import { projectToPixel } from "../../../render/viewport-math";
import { qRotateVec3, v3Add, v3Length, v3Sub } from "../../../shared/math";

import {
  SHAPER_HISTORY_TYPE_ORDER,
  SHAPER_TRACKPAD_MAX_FINGERS,
  SHAPER_TRACKPAD_RING_BUFFER_CAPACITY,
  SHAPER_UI_DESIGN_TOKENS,
  clampShaperColorPickerHandle,
  clampShaperGizmoDelta,
  classifyShaperTrackpadTwoFingerGesture,
  composeShaperHangulJamo,
  computeJointDrag,
  computeShaperModelControllerTransform,
  computeShaperPartThumbnailCameraFrame,
  computeShaperPresetGridItemLayout,
  computeShaperWebcamPopupLayout,
  createShaperTrackpadTouchTracker,
  handlesKey,
  hudRows,
  isFingerBone,
  jointLabelKo,
  mapShaperNsTouchPhaseToRingPhase,
  parseShaperUniWinCFileTypesFilter,
  parseShaperUniWinDroppedPaths,
  pushShaperHistoryEntry,
  resolveDragPivot,
  resolveShaperCameraInputAction,
  resolveShaperContextStatusBarGuide,
  resolveShaperGizmoCastPlaneEuler,
  resolveShaperPresetClickModifiers,
  resolveShaperResizeHandleCursor,
  resolveShaperToolModeForPartTab,
  resolveShaperViewportKeyShortcut,
  sampleShaperColorPalettePicker2d,
  shouldPassThroughShaperNativeWindowClick,
  stepShaperHistoryCursor,
  visibleHandles,
} from "./viewport-interactions";

import type { ShaperHistoryStack } from "./viewport-interactions";
import type { HumanoidBoneName, HudSample, JointDragHandle, LabFailure, Pose, Quat, SkeletonData, Vec3 } from "../../../contracts";
import type { ViewportCameraInfo } from "../../../render/viewport-camera";

const SKELETON = createReferenceSkeleton();

/** 정면(+Z)에서 몸 중심을 보는 카메라 */
const CAMERA: ViewportCameraInfo = {
  position: [0, 1.1, 4],
  forward: [0, 0, -1],
  right: [1, 0, 0],
  up: [0, 1, 0],
  fovY: 0.8,
  width: 800,
  height: 800,
};

function worldOf(pose: Pose, bone: HumanoidBoneName): Vec3 {
  const world = computeWorldTransforms(SKELETON, pose).get(bone);
  if (!world) throw new Error(`본 없음: ${bone}`);
  return world.position;
}

function pixelOf(world: Vec3): readonly [number, number] {
  const pixel = projectToPixel(CAMERA, world);
  if (!pixel) throw new Error("투영 불가");
  return pixel;
}

describe("jointLabelKo", () => {
  it("몸통·좌우 사지·손가락을 한글로 라벨링하고 모르는 이름은 그대로 돌려준다", () => {
    expect(jointLabelKo("hips")).toBe("골반");
    expect(jointLabelKo("head")).toBe("머리");
    expect(jointLabelKo("leftUpperArm")).toBe("왼쪽 위팔");
    expect(jointLabelKo("rightLowerLeg")).toBe("오른쪽 종아리");
    expect(jointLabelKo("leftToes")).toBe("왼쪽 발가락");
    expect(jointLabelKo("rightIndexIntermediate")).toBe("오른쪽 검지 2마디");
    expect(jointLabelKo("leftThumbMetacarpal")).toBe("왼쪽 엄지 중수");
    expect(jointLabelKo("mixamorig:Foo")).toBe("mixamorig:Foo");
  });

  it("55개 휴머노이드 본이 모두 한글 라벨을 갖는다(영문 이름 그대로 나오지 않는다)", () => {
    for (const bone of HUMANOID_BONE_NAMES) expect(jointLabelKo(bone), bone).not.toBe(bone);
  });
});

describe("visibleHandles·handlesKey", () => {
  const handle = (bone: HumanoidBoneName, x: number, y: number): JointDragHandle => ({ bone, screen: [x, y], world: [0, 0, 0] });
  const all = [handle("hips", 1, 2), handle("leftHand", 3, 4), handle("leftIndexProximal", 5, 6), handle("leftEye", 7, 8), handle("jaw", 9, 10)];

  it("눈·턱은 항상 빼고 손가락은 옵션이다", () => {
    expect(visibleHandles(all, { fingers: false }).map((h) => h.bone)).toEqual(["hips", "leftHand"]);
    expect(visibleHandles(all, { fingers: true }).map((h) => h.bone)).toEqual(["hips", "leftHand", "leftIndexProximal"]);
    expect(isFingerBone("leftIndexProximal")).toBe(true);
    expect(isFingerBone("leftHand")).toBe(false);
  });

  it("키는 소수 첫째 자리 변화에만 반응한다", () => {
    const base = handlesKey([handle("hips", 10.01, 20.02)]);
    expect(handlesKey([handle("hips", 10.04, 20.03)])).toBe(base);
    expect(handlesKey([handle("hips", 10.2, 20.03)])).not.toBe(base);
    expect(handlesKey([handle("spine", 10.01, 20.02)])).not.toBe(base);
  });
});

describe("resolveDragPivot", () => {
  it("핸들 본의 부모 관절이 피벗이고 월드 원점은 FK 값이다", () => {
    const pivot = resolveDragPivot(SKELETON, {}, "leftLowerArm");
    expect(pivot?.pivotBone).toBe("leftUpperArm");
    expect(v3Length(v3Sub(pivot?.pivotWorld ?? [9, 9, 9], worldOf({}, "leftUpperArm")))).toBeLessThan(1e-9);
    expect(resolveDragPivot(SKELETON, {}, "head")?.pivotBone).toBe("neck");
  });

  it("루트(hips)는 자기 자신이 피벗이고 스켈레톤에 없는 본은 null이다", () => {
    expect(resolveDragPivot(SKELETON, {}, "hips")?.pivotBone).toBe("hips");
    expect(resolveDragPivot({ bones: [] }, {}, "head")).toBeNull();
  });

  it("보조 본(휴머노이드가 아닌 부모)은 건너뛰고 첫 휴머노이드 조상을 피벗으로 쓴다", () => {
    const skeleton = {
      bones: [
        { name: "hips", parent: null, restTranslation: [0, 1, 0] as Vec3, restRotation: [0, 0, 0, 1] as Quat },
        { name: "aux_root", parent: "hips", restTranslation: [0, 0.1, 0] as Vec3, restRotation: [0, 0, 0, 1] as Quat, auxiliary: true },
        { name: "spine", parent: "aux_root", restTranslation: [0, 0.1, 0] as Vec3, restRotation: [0, 0, 0, 1] as Quat },
      ],
    };
    const pivot = resolveDragPivot(skeleton, {}, "spine");
    expect(pivot?.pivotBone).toBe("hips");
    expect(pivot?.pivotWorld).toEqual([0, 1, 0]);
  });
});

describe("computeJointDrag", () => {
  it("팔꿈치를 어깨 둘레로 −45°(아래쪽) 끌면 위팔이 그만큼 돌고 팔꿈치가 목표 픽셀의 월드 점으로 간다", () => {
    const pivot = resolveDragPivot(SKELETON, {}, "leftLowerArm");
    expect(pivot).not.toBeNull();
    if (!pivot) return;
    const elbow = worldOf({}, "leftLowerArm");
    const around = Math.PI / 4;
    // 어깨(피벗) 둘레로 Z축 −45°: +X로 뻗은 팔이 아래로 내려간다
    const zRotation: Quat = [0, 0, -Math.sin(around / 2), Math.cos(around / 2)];
    const target = v3Add(pivot.pivotWorld, qRotateVec3(zRotation, v3Sub(elbow, pivot.pivotWorld)));
    const outcome = computeJointDrag({ skeleton: SKELETON, startPose: {}, pivot, camera: CAMERA, startPixel: pixelOf(elbow), currentPixel: pixelOf(target) });
    expect(outcome).not.toBeNull();
    if (!outcome) return;
    expect(outcome.pivotBone).toBe("leftUpperArm");
    expect(Math.abs(outcome.requestedDeg)).toBeCloseTo(45, 3);
    expect(outcome.clamped).toBe(false);
    const after = worldOf(outcome.pose, "leftLowerArm");
    expect(v3Length(v3Sub(after, target))).toBeLessThan(2e-3);
    // 시작 포즈의 다른 본은 보존된다
    expect(Object.keys(outcome.pose)).toEqual(["leftUpperArm"]);
  });

  it("누적 오차가 없다: 같은 시작 포즈에서 같은 입력은 같은 결과(결정적)이고 시작 포즈의 다른 본을 유지한다", () => {
    const startPose: Pose = { head: [0, 0.1, 0, 0.995] };
    const pivot = resolveDragPivot(SKELETON, startPose, "leftHand");
    if (!pivot) throw new Error("피벗 없음");
    const hand = worldOf(startPose, "leftHand");
    const input = { skeleton: SKELETON, startPose, pivot, camera: CAMERA, startPixel: pixelOf(hand), currentPixel: [pixelOf(hand)[0] + 20, pixelOf(hand)[1] + 60] as const };
    const a = computeJointDrag(input);
    const b = computeJointDrag(input);
    expect(a).toEqual(b);
    expect(a?.pose.head).toEqual(startPose.head);
    expect(a?.pose.leftLowerArm).toBeDefined();
  });

  it("관절 제한을 넘기는 드래그는 clamped=true로 보고한다(무음 클램프 없음)", () => {
    const pivot = resolveDragPivot(SKELETON, {}, "leftLowerArm");
    if (!pivot) throw new Error("피벗 없음");
    const elbow = worldOf({}, "leftLowerArm");
    // 팔꿈치를 어깨 바로 위·뒤로 반 바퀴 이상 돌리는 목표: 시선 평면에서 180°
    const mirrored = v3Add(pivot.pivotWorld, v3Sub(pivot.pivotWorld, elbow));
    const outcome = computeJointDrag({ skeleton: SKELETON, startPose: {}, pivot, camera: CAMERA, startPixel: pixelOf(elbow), currentPixel: pixelOf(mirrored) });
    expect(outcome?.clamped).toBe(true);
    expect(Math.abs(outcome?.requestedDeg ?? 0)).toBeGreaterThan(150);
  });

  it("피벗이 카메라 뒤쪽이면 null이다(역투영 불가)", () => {
    const pivot = resolveDragPivot(SKELETON, {}, "head");
    if (!pivot) throw new Error("피벗 없음");
    const behind: ViewportCameraInfo = { ...CAMERA, position: [0, 1.1, -4] };
    expect(computeJointDrag({ skeleton: SKELETON, startPose: {}, pivot, camera: behind, startPixel: [400, 300], currentPixel: [420, 300] })).toBeNull();
  });
});

describe("hudRows", () => {
  const sample: HudSample = {
    frameMs: 16.66,
    frameMsP95: 21.04,
    gpuFrameMs: null,
    drawCalls: 42,
    activeMeshes: 9,
    triangles: 123456,
    backend: "webgpu",
    adapterLabel: "Test GPU",
    physicsProvider: "builtin-pbd",
    shadingMode: "toon",
  };

  it("GPU 시간이 없으면 '미지원'을 적고 수치를 한글 단위로 서식한다", () => {
    const rows = new Map(hudRows(sample).map((row) => [row.key, row.value]));
    expect(rows.get("frame")).toBe("16.7 ms");
    expect(rows.get("p95")).toBe("21.0 ms");
    expect(rows.get("gpu")).toBe("미지원");
    expect(rows.get("draw")).toBe("42");
    expect(rows.get("shading")).toBe("툰");
    expect(rows.get("backend")).toBe("webgpu");
    expect(hudRows({ ...sample, gpuFrameMs: 3.21 }).find((row) => row.key === "gpu")?.value).toBe("3.2 ms");
    expect(hudRows({ ...sample, frameMs: Number.NaN }).find((row) => row.key === "frame")?.value).toBe("—");
  });
});

describe("SHAPER 뷰포트 단축키 및 프리셋 수식키(UIManager / ApplyHeadPart)", () => {
  it("resolveShaperPresetClickModifiers: 파츠 및 포즈 프리셋의 Shift/Alt/Ctrl 수식키 정책을 결정한다", () => {
    const partShiftAlt = resolveShaperPresetClickModifiers({ shift: true, alt: true }, "part");
    expect(partShiftAlt.keepExistingLines).toBe(true);
    expect(partShiftAlt.skipPresetLines).toBe(true);

    const poseMods = resolveShaperPresetClickModifiers({ shift: true, alt: true, ctrl: true }, "pose");
    expect(poseMods.keepCameraOnPose).toBe(true);
    expect(poseMods.mirrorPose).toBe(true);
    expect(poseMods.cameraOnlySkipBones).toBe(true);
  });

  it("resolveShaperViewportKeyShortcut: F/L/B/T 뷰, F12/F10/F5, Shift/Alt/일반 방향키를 해독한다", () => {
    expect(resolveShaperViewportKeyShortcut("f")).toEqual({
      kind: "camera-view",
      view: "front",
      pivotYAnglesDeg: [0, 0, 0],
      pivotXAnglesDeg: [0, 0, 0],
    });
    expect(resolveShaperViewportKeyShortcut("l")).toEqual({
      kind: "camera-view",
      view: "left",
      pivotYAnglesDeg: [0, 90, 0],
      pivotXAnglesDeg: [0, 0, 0],
    });
    expect(resolveShaperViewportKeyShortcut("F12")).toEqual({ kind: "front-light" });
    expect(resolveShaperViewportKeyShortcut("F10")).toEqual({ kind: "toggle-eyeball-cam-lock" });
    expect(resolveShaperViewportKeyShortcut("F5")).toEqual({ kind: "reset-camera" });

    const eyeUp = resolveShaperViewportKeyShortcut("ArrowUp", { shift: true }, 0.1);
    expect(eyeUp).toEqual({ kind: "rotate-eyeballs", deltaEulerDeg: [-10, 0, 0] });

    const shadeRight = resolveShaperViewportKeyShortcut("ArrowRight", { alt: true }, 0.25);
    expect(shadeRight).toEqual({ kind: "adjust-shade-line", deltaShadePos: 0.25 });

    const lightLeft = resolveShaperViewportKeyShortcut("ArrowLeft", {}, 0.1);
    expect(lightLeft).toEqual({ kind: "rotate-scene-light", deltaEulerDeg: [0, 10, 0] });
  });

  it("3-스타일 카메라 입력(unity/blender/max), 2-손가락 트랙패드 제스처 판별, 기즈모 레이캐스트 평면/클램프를 수행한다", () => {
    expect(resolveShaperCameraInputAction({ style: "unity", button: 2 })).toBe("pan");
    expect(resolveShaperCameraInputAction({ style: "unity", button: 0, modifiers: { alt: true } })).toBe("orbit");
    expect(resolveShaperCameraInputAction({ style: "unity", button: 1, modifiers: { alt: true } })).toBe("zoom");

    expect(resolveShaperCameraInputAction({ style: "blender", button: 2 })).toBe("orbit");
    expect(resolveShaperCameraInputAction({ style: "blender", button: 2, modifiers: { shift: true } })).toBe("pan");
    expect(resolveShaperCameraInputAction({ style: "blender", button: 2, modifiers: { ctrl: true } })).toBe("zoom");

    expect(resolveShaperCameraInputAction({ style: "max", button: 2 })).toBe("pan");
    expect(resolveShaperCameraInputAction({ style: "max", button: 2, modifiers: { alt: true } })).toBe("orbit");
    expect(resolveShaperCameraInputAction({ style: "max", button: 2, modifiers: { ctrl: true, alt: true } })).toBe("zoom");

    // 2-손가락 평행 이동 -> orbit 모드 선택
    const orbitGesture = classifyShaperTrackpadTwoFingerGesture({
      prevTouch0: [100, 100],
      prevTouch1: [200, 100],
      curTouch0: [120, 110],
      curTouch1: [220, 110],
      camPivotZ: -4,
    });
    expect(orbitGesture.gestureMode).toBe("orbit");
    expect(orbitGesture.orbitInputDelta).toEqual([5, 2.5]);

    // 2-손가락 핀치 줌 -> zoom 모드 선택 및 직교 크기 계산
    const zoomGesture = classifyShaperTrackpadTwoFingerGesture({
      prevTouch0: [100, 100],
      prevTouch1: [200, 100],
      curTouch0: [80, 100],
      curTouch1: [220, 100],
      camPivotZ: -4,
    });
    expect(zoomGesture.gestureMode).toBe("zoom");
    expect(zoomGesture.zoomDelta).toBeCloseTo(-40, 5);
    expect(zoomGesture.nextCamPivotZ).toBeCloseTo(-14, 5);
    // orthographicSize = 15 - (60 - (-14)) * 0.25 = 15 - 18.5 = -3.5
    expect(zoomGesture.orthographicSize).toBeCloseTo(-3.5, 5);

    expect(clampShaperGizmoDelta(12.5, 5)).toBe(5);
    expect(clampShaperGizmoDelta(-12.5, 5)).toBe(-5);
    expect(resolveShaperGizmoCastPlaneEuler("x", [15, 30, 45])).toEqual([15, 0, 0]);
    expect(resolveShaperGizmoCastPlaneEuler("y", [15, 30, 45])).toEqual([0, 30, 0]);
    expect(resolveShaperGizmoCastPlaneEuler("z", [15, 30, 45])).toEqual([0, 0, 45]);
  });

  it("CreatePartThumTex 탭별 썸네일 카메라 자동 프레이밍 및 HistoryManager 14-타입 Undo/Redo 꼬리 절단을 수행한다", () => {
    const headFrame = computeShaperPartThumbnailCameraFrame({
      tabIndex: 2,
      headRootPosition: [0, 1.5, 0],
      partCenterOffset: [0, 0.1, 0.05],
      partMinPos: [-2, -1, -1],
      partMaxPos: [2, 1, 1],
    });
    expect(headFrame.pivotPosition).toEqual([0, 1.6, 0.05]);
    expect(headFrame.pivotYawDeg).toBe(25);
    expect(headFrame.fovDeg).toBe(20);
    // span = max(4, 2) * 3 = 12 -> distance = 5 + 12 = 17
    expect(headFrame.distance).toBeCloseTo(17, 5);

    expect(computeShaperPartThumbnailCameraFrame({ tabIndex: 6 }).distance).toBe(75);
    expect(computeShaperPartThumbnailCameraFrame({ tabIndex: 7 }).distance).toBe(600);
    expect(
      computeShaperPartThumbnailCameraFrame({ tabIndex: 9, boundsSize: [2, 5, 3] }).distance,
    ).toBe(15);
    expect(
      computeShaperPartThumbnailCameraFrame({ tabIndex: 11, boundsSize: [2, 5, 3] }).distance,
    ).toBe(20);
    expect(computeShaperPartThumbnailCameraFrame({ tabIndex: 13 }).distance).toBe(70);

    expect(SHAPER_HISTORY_TYPE_ORDER).toHaveLength(14);
    let stack: ShaperHistoryStack<number> = { entries: [], curPos: -1 };
    stack = pushShaperHistoryEntry(stack, { type: "selectControlPoints", payload: 1 });
    stack = pushShaperHistoryEntry(stack, { type: "createLine", payload: 2 });
    stack = pushShaperHistoryEntry(stack, { type: "createHair", payload: 3 });
    expect(stack.curPos).toBe(2);

    const undoStep = stepShaperHistoryCursor(stack, -1);
    expect(undoStep.stack.curPos).toBe(1);
    expect(undoStep.appliedEntry?.payload).toBe(2);

    // Undo 상태에서 새 항목 추가 시 Redo 꼬리(createHair)가 잘려나감
    const branched = pushShaperHistoryEntry(undoStep.stack, { type: "changeColor", payload: 4 });
    expect(branched.entries).toHaveLength(3);
    expect(branched.curPos).toBe(2);
    expect(branched.entries[2]?.type).toBe("changeColor");
  });

  it("UIInputFieldFixKorean 한글 자모 오토마타(복합모음·겹받침·종성분리), 탭별 툴 모드 자동 전환, 컬러 피커 4px 클램프를 수행한다", () => {
    // ㅎ+ㅏ+ㄴ+ㄱ+ㅡ+ㄹ -> 한글
    expect(composeShaperHangulJamo(["ㅎ", "ㅏ", "ㄴ", "ㄱ", "ㅡ", "ㄹ"])).toBe("한글");
    // 겹받침 및 연음 종성분리: ㄷ+ㅏ+ㄹ+ㄱ -> 닭, 뒤에 ㅏ 입력 시 -> 달가
    expect(composeShaperHangulJamo(["ㄷ", "ㅏ", "ㄹ", "ㄱ"])).toBe("닭");
    expect(composeShaperHangulJamo(["ㄷ", "ㅏ", "ㄹ", "ㄱ", "ㅏ"])).toBe("달가");
    // 복합모음: ㄱ+ㅗ+ㅏ -> 과
    expect(composeShaperHangulJamo(["ㄱ", "ㅗ", "ㅏ"])).toBe("과");

    expect(resolveShaperToolModeForPartTab(0, 11)).toBe(0);
    expect(resolveShaperToolModeForPartTab(2, 1)).toBe(1);
    expect(resolveShaperToolModeForPartTab(6, 0)).toBe(3);
    expect(resolveShaperToolModeForPartTab(7, 3)).toBe(9);
    expect(resolveShaperToolModeForPartTab(9, 0)).toBe(10);
    expect(resolveShaperToolModeForPartTab(12, 0)).toBe(11);

    expect(clampShaperColorPickerHandle([0, 250], [200, 200])).toEqual([4, 196]);
  });

  it("TrackpadTouchOSX (513 링버퍼·10슬롯 타임스탬프 축출·1.5초 유령 터치 제거) 및 LibUniWinC 클릭 투과를 검증한다", () => {
    expect(SHAPER_TRACKPAD_RING_BUFFER_CAPACITY).toBe(513);
    expect(SHAPER_TRACKPAD_MAX_FINGERS).toBe(10);

    const tracker = createShaperTrackpadTouchTracker();
    // 10개 손가락 모두 등록
    for (let i = 0; i < 10; i += 1) {
      tracker.handleTouchEvents(
        [{ identity: `finger-${i}`, phase: 0, normalizedX: i * 0.1, normalizedY: 0.5 }],
        10 + i * 0.05,
      );
    }
    // 11번째 손가락(finger-10)이 들어오면 가장 오래된 슬롯(touchId=0, timestamp=10.0)을 축출하고 재사용한다
    const [evictedRecord] = tracker.handleTouchEvents(
      [{ identity: "finger-10", phase: 0, normalizedX: 0.99, normalizedY: 0.99 }],
      10.6,
    );
    expect(evictedRecord?.touchId).toBe(0);
    expect(tracker.getPendingCount()).toBe(11);

    // 1.5초 이상 지난 뒤 새 이벤트 도착 시 이전 유령 슬롯들을 모두 정리한다
    tracker.handleTouchEvents(
      [{ identity: "fresh-finger", phase: 0, normalizedX: 0.25, normalizedY: 0.75 }],
      15.0,
    );
    const activeSlots = tracker.getFingerSlots().filter((s) => s.identity !== null);
    expect(activeSlots).toHaveLength(1);
    expect(activeSlots[0]?.identity).toBe("fresh-finger");

    const firstPopped = tracker.popTouchRecord();
    expect(firstPopped?.touchId).toBe(0);
    expect(firstPopped?.phase).toBe(0);

    expect(
      shouldPassThroughShaperNativeWindowClick({
        isTransparent: true,
        isClickThroughEnabled: true,
        cursorPixelAlpha: 0.02,
      }),
    ).toBe(true);
    expect(
      shouldPassThroughShaperNativeWindowClick({
        isTransparent: true,
        isClickThroughEnabled: true,
        cursorPixelAlpha: 0.85,
      }),
    ).toBe(false);

    // Ghidra 12.1.4 (_HandleTouchEvent 0x2a0c): NSTouchPhase 비트마스크 매핑
    expect(mapShaperNsTouchPhaseToRingPhase(1)).toBe(0);
    expect(mapShaperNsTouchPhaseToRingPhase(2)).toBe(1);
    expect(mapShaperNsTouchPhaseToRingPhase(4)).toBe(4);
    expect(mapShaperNsTouchPhaseToRingPhase(8)).toBe(2);
    expect(mapShaperNsTouchPhaseToRingPhase(16)).toBe(3);
    expect(mapShaperNsTouchPhaseToRingPhase(32)).toBeNull();

    // Ghidra 12.1.4 (_clearFingersOlderThan 0x37d0): 유령 슬롯 제거 시 phase=2(Ended) 레코드 자동 합성
    const staleTracker = createShaperTrackpadTouchTracker();
    staleTracker.handleTouchEvents(
      [{ identity: "ghost-1", phase: 0, normalizedX: 0.4, normalizedY: 0.6 }],
      1.0,
    );
    expect(staleTracker.popTouchRecord()?.phase).toBe(0);
    expect(staleTracker.clearFingersOlderThan(2.0)).toBe(1);
    const syntheticEnded = staleTracker.popTouchRecord();
    expect(syntheticEnded).toMatchObject({
      touchId: 0,
      phase: 2,
      normalizedX: 0,
      normalizedY: 0,
    });

    // Ghidra 12.1.4 (LibUniWinC::CustomPanelHelper::addFileTypes 0x4328 & ColorKey 0x3d90..0x3da0)
    const parsedFilter = parseShaperUniWinCFileTypesFilter(
      "3D Models\tobj\tfbx\tglb\nImages\tpng\tjpg",
    );
    expect(parsedFilter.allowsAllFiles).toBe(false);
    expect(parsedFilter.allowedExtensions).toEqual(["obj", "fbx", "glb", "png", "jpg"]);
    expect(parseShaperUniWinCFileTypesFilter("All Files\t*").allowedExtensions).toBeNull();

    expect(
      shouldPassThroughShaperNativeWindowClick({
        isTransparent: true,
        isClickThroughEnabled: true,
        cursorPixelAlpha: 1.0,
        transparentType: "color-key",
        cursorPixelRgb: [0.0, 1.0, 0.01],
        keyColorRgb: [0.0, 1.0, 0.0],
        colorKeyTolerance: 0.02,
      }),
    ).toBe(true);
  });

  it("SHAPER UI/UX 디자인 토큰·2D 컬러피커·2열 프리셋 그리드·웹캠 팝업·하단 키캡 가이드를 정확히 계산한다", () => {
    expect(SHAPER_UI_DESIGN_TOKENS.canvasBackdropHex).toBe("#121212");
    expect(SHAPER_UI_DESIGN_TOKENS.toggleHighlightRgba).toEqual([1, 1, 0, 1]);
    expect(SHAPER_UI_DESIGN_TOKENS.bottomStatusBarHeightPx).toBe(24);
    expect(SHAPER_UI_DESIGN_TOKENS.presetCardStepPx).toBe(122);

    const sampled = sampleShaperColorPalettePicker2d({
      svPointerPos: [200, 200],
      svRectSize: [200, 200],
      huePointerX: 0,
      hueRectWidth: 200,
      scaleFactor: 1,
      anchorBoxPos: [100, 50],
    });
    expect(sampled.clampedSvHandlePos).toEqual([196, 196]);
    expect(sampled.popupPosition).toEqual([80, 54]);
    expect(sampled.hex).toBe("#FF0000");
    expect(sampled.rgb255[0]).toBe(255);

    const grid0 = computeShaperPresetGridItemLayout(0, 4, 800);
    const grid1 = computeShaperPresetGridItemLayout(1, 4, 800);
    const grid2 = computeShaperPresetGridItemLayout(2, 4, 800);
    expect(grid0).toEqual({
      row: 0,
      column: 0,
      anchoredX: 20,
      anchoredY: -20,
      cardWidth: 100,
      cardHeight: 100,
      contentHeight: 264,
      maxScrollPanelHeight: 710,
    });
    expect(grid1.anchoredX).toBe(142);
    expect(grid2.anchoredY).toBe(-142);

    const webcamLandscape = computeShaperWebcamPopupLayout(1920, 1080);
    expect(webcamLandscape.popupWidth).toBe(600);
    expect(webcamLandscape.popupHeight).toBe(544);

    const paintGuide = resolveShaperContextStatusBarGuide({ inspectorTab: "paint", drawingMode: true });
    expect(paintGuide.shortcuts.some((g) => g.description.includes("스트로크"))).toBe(true);
    const poseGuide = resolveShaperContextStatusBarGuide({ inspectorTab: "pose", drawingMode: false });
    expect(poseGuide.shortcuts.some((g) => g.description.includes("대칭"))).toBe(true);
  });

  it("UniWindowController (parsePaths·ResizeHandle) 및 Kirurobo.ModelController 지수 줌·회전 변환을 검증한다", () => {
    const dropped = parseShaperUniWinDroppedPaths(
      '"/Users/test/My ""Avatar"".obj"\n/Users/test/Pose.json\0"/Users/test/Hair.shaper"',
    );
    expect(dropped).toEqual([
      '/Users/test/My "Avatar".obj',
      "/Users/test/Pose.json",
      "/Users/test/Hair.shaper",
    ]);

    expect(resolveShaperResizeHandleCursor({ left: true, top: true })).toBe("nwse-resize");
    expect(resolveShaperResizeHandleCursor({ left: true, bottom: true })).toBe("nesw-resize");
    expect(resolveShaperResizeHandleCursor({ right: true, top: true })).toBe("nesw-resize");
    expect(resolveShaperResizeHandleCursor({ right: true, bottom: true })).toBe("nwse-resize");
    expect(resolveShaperResizeHandleCursor({ left: true })).toBe("ew-resize");
    expect(resolveShaperResizeHandleCursor({ top: true })).toBe("ns-resize");

    const transformed = computeShaperModelControllerTransform({
      yawDeg: 0,
      pitchDeg: 80,
      zoom: 0,
      dragDeltaPx: [100, 100],
      wheelDelta: 5,
      screenSizePx: [1000, 1000],
      zoomSensitivity: 0.2,
    });
    expect(transformed.yawDeg).toBeCloseTo(-36, 5);
    expect(transformed.pitchDeg).toBe(90); // 80 + 36 -> clamped to 90
    expect(transformed.zoom).toBeCloseTo(1, 5);
    expect(transformed.scale).toEqual([10, 10, 10]); // 10^1 = 10
  });
});

describe("skeleton & pointer boundary safety — 손상 스켈레톤 격리·진단 구별·포즈/Undo 보존·정상 회복", () => {
  const nanRestSkeleton: SkeletonData = {
    bones: [
      { name: "hips", parent: null, restTranslation: [0, 1, 0], restRotation: [0, 0, 0, 1] },
      { name: "spine", parent: "hips", restTranslation: [0, Number.NaN, 0], restRotation: [0, 0, 0, 1] },
      { name: "head", parent: "spine", restTranslation: [0, 0.3, 0], restRotation: [0, 0, 0, 1] },
    ],
  };

  const infRestSkeleton: SkeletonData = {
    bones: [
      { name: "hips", parent: null, restTranslation: [Number.POSITIVE_INFINITY, 0, 0], restRotation: [0, 0, 0, 1] },
      { name: "spine", parent: "hips", restTranslation: [0, 0.2, 0], restRotation: [0, 0, 0, 1] },
    ],
  };

  const cycleHumanoidSkeleton: SkeletonData = {
    bones: [
      { name: "hips", parent: "spine", restTranslation: [0, 1, 0], restRotation: [0, 0, 0, 1] },
      { name: "spine", parent: "hips", restTranslation: [0, 0.2, 0], restRotation: [0, 0, 0, 1] },
    ],
  };

  const cycleAuxiliarySkeleton: SkeletonData = {
    bones: [
      { name: "hips", parent: null, restTranslation: [0, 1, 0], restRotation: [0, 0, 0, 1] },
      { name: "aux_1", parent: "aux_2", restTranslation: [0, 0.1, 0], restRotation: [0, 0, 0, 1], auxiliary: true },
      { name: "aux_2", parent: "aux_1", restTranslation: [0, 0.1, 0], restRotation: [0, 0, 0, 1], auxiliary: true },
      { name: "spine", parent: "aux_1", restTranslation: [0, 0.2, 0], restRotation: [0, 0, 0, 1] },
    ],
  };

  it("resolveDragPivot: NaN/Infinity restTranslation 및 휴머노이드·보조 본 순환에서 throw/무한루프 없이 null을 반환하고 LabFailure를 보고한다", () => {
    const failures: LabFailure[] = [];

    expect(resolveDragPivot(nanRestSkeleton, {}, "head", { onFailure: (f) => failures.push(f), now: 1700000000001 })).toBeNull();
    expect(resolveDragPivot(infRestSkeleton, {}, "spine", { onFailure: (f) => failures.push(f), now: 1700000000002 })).toBeNull();
    expect(failures).toHaveLength(2);
    expect(isLabFailure(failures[0])).toBe(true);
    expect(failures[0]?.code).toBe("skeleton-non-finite-rest");
    expect(failures[1]?.code).toBe("skeleton-non-finite-rest");

    const cycleFailures: LabFailure[] = [];
    expect(resolveDragPivot(cycleHumanoidSkeleton, {}, "spine", { onFailure: (f) => cycleFailures.push(f), now: 1700000000003 })).toBeNull();
    expect(resolveDragPivot(cycleAuxiliarySkeleton, {}, "spine", { onFailure: (f) => cycleFailures.push(f), now: 1700000000004 })).toBeNull();
    expect(cycleFailures).toHaveLength(2);
    expect(cycleFailures[0]?.code).toBe("skeleton-cycle");
    expect(cycleFailures[1]?.code).toBe("skeleton-cycle");

    // 정상 빈 스켈레톤이나 미존재 본 조회는 null을 반환하되 onFailure를 호출하지 않아야 함 (원인 구별)
    const cleanFailures: LabFailure[] = [];
    expect(resolveDragPivot({ bones: [] }, {}, "head", { onFailure: (f) => cleanFailures.push(f) })).toBeNull();
    const partialSkeleton: SkeletonData = {
      bones: [{ name: "hips", parent: null, restTranslation: [0, 1, 0], restRotation: [0, 0, 0, 1] }],
    };
    expect(resolveDragPivot(partialSkeleton, {}, "head", { onFailure: (f) => cleanFailures.push(f) })).toBeNull();
    expect(cleanFailures).toHaveLength(0);
  });

  it("computeJointDrag: 손상 스켈레톤·비유한 pivotWorld·비유한 픽셀을 격리해 진단하고, 카메라 뒤쪽 정상 기하 실패와 구별한다", () => {
    const validPivot = resolveDragPivot(SKELETON, {}, "leftLowerArm");
    expect(validPivot).not.toBeNull();
    if (!validPivot) return;

    const failures: LabFailure[] = [];
    expect(
      computeJointDrag({
        skeleton: nanRestSkeleton,
        startPose: {},
        pivot: validPivot,
        camera: CAMERA,
        startPixel: [400, 300],
        currentPixel: [420, 320],
        onFailure: (f) => failures.push(f),
      }),
    ).toBeNull();
    expect(
      computeJointDrag({
        skeleton: cycleHumanoidSkeleton,
        startPose: {},
        pivot: validPivot,
        camera: CAMERA,
        startPixel: [400, 300],
        currentPixel: [420, 320],
        onFailure: (f) => failures.push(f),
      }),
    ).toBeNull();
    expect(
      computeJointDrag({
        skeleton: SKELETON,
        startPose: {},
        pivot: { pivotBone: "leftUpperArm", pivotWorld: [Number.NaN, 1, 0] },
        camera: CAMERA,
        startPixel: [400, 300],
        currentPixel: [420, 320],
        onFailure: (f) => failures.push(f),
      }),
    ).toBeNull();
    expect(
      computeJointDrag({
        skeleton: SKELETON,
        startPose: {},
        pivot: validPivot,
        camera: CAMERA,
        startPixel: [Number.NaN, 300],
        currentPixel: [420, 320],
        onFailure: (f) => failures.push(f),
      }),
    ).toBeNull();

    expect(failures.map((f) => f.code)).toEqual([
      "skeleton-non-finite-rest",
      "skeleton-cycle",
      "skeleton-invalid-input",
      "skeleton-invalid-input",
    ]);

    // 카메라 뒤쪽 피벗 역투영 불가는 null을 반환하되 onFailure를 호출하지 않음
    const geomFailures: LabFailure[] = [];
    const behindCamera: ViewportCameraInfo = { ...CAMERA, position: [0, 1.1, -4] };
    expect(
      computeJointDrag({
        skeleton: SKELETON,
        startPose: {},
        pivot: validPivot,
        camera: behindCamera,
        startPixel: [400, 300],
        currentPixel: [420, 320],
        onFailure: (f) => geomFailures.push(f),
      }),
    ).toBeNull();
    expect(geomFailures).toHaveLength(0);
  });

  it("clampShaperGizmoDelta & visibleHandles: 비유한 델타와 비유한 화면 좌표를 격리한다", () => {
    expect(clampShaperGizmoDelta(Number.NaN, 1.5)).toBe(0);
    expect(clampShaperGizmoDelta(0.5, Number.NaN)).toBe(0);
    expect(clampShaperGizmoDelta(Number.POSITIVE_INFINITY, 1.5)).toBe(0);

    const handles: readonly JointDragHandle[] = [
      { bone: "hips", screen: [100, 200], world: [0, 1, 0] },
      { bone: "spine", screen: [Number.NaN, 10], world: [0, 1.1, 0] },
      { bone: "head", screen: [10, Number.POSITIVE_INFINITY], world: [0, 1.5, 0] },
    ];
    expect(visibleHandles(handles, { fingers: true }).map((h) => h.bone)).toEqual(["hips"]);
    expect(handlesKey(handles)).toBe("hips:100.0,200.0|spine:nan|head:nan");
  });

  it("손상 스켈레톤 드래그 실패 시 이전 정상 포즈·Undo 히스토리가 보존되고 직후 정상 드래그가 즉시 회복된다", () => {
    const initialPose: Pose = { head: [0, 0.1, 0, 0.995] };
    const startPoseSnapshot: Pose = { head: [...(initialPose.head as Quat)] };
    let history: ShaperHistoryStack<Pose> = { entries: [], curPos: -1 };
    history = pushShaperHistoryEntry(history, { type: "selectPoseControlPoints", payload: initialPose });
    const historySnapshot = { curPos: history.curPos, entries: [...history.entries] };

    const failures: LabFailure[] = [];
    const failedPivot = resolveDragPivot(nanRestSkeleton, initialPose, "leftLowerArm", {
      onFailure: (f) => failures.push(f),
    });
    expect(failedPivot).toBeNull();

    const validPivot = resolveDragPivot(SKELETON, initialPose, "leftLowerArm");
    expect(validPivot).not.toBeNull();
    if (!validPivot) return;

    const failedOutcome = computeJointDrag({
      skeleton: cycleHumanoidSkeleton,
      startPose: initialPose,
      pivot: validPivot,
      camera: CAMERA,
      startPixel: [400, 300],
      currentPixel: [430, 340],
      onFailure: (f) => failures.push(f),
    });
    expect(failedOutcome).toBeNull();
    expect(failures).toHaveLength(2);

    // 기존 정상 포즈 및 Undo 히스토리 스택 무결성 검증
    expect(initialPose).toEqual(startPoseSnapshot);
    expect(history.curPos).toBe(historySnapshot.curPos);
    expect(history.entries).toEqual(historySnapshot.entries);

    // 실패 직후 정상 SKELETON으로 재시도 시 정상 회전 결과 및 히스토리 푸시/Undo 즉시 회복
    const elbow = worldOf(initialPose, "leftLowerArm");
    const startPx = pixelOf(elbow);
    const recoveredOutcome = computeJointDrag({
      skeleton: SKELETON,
      startPose: initialPose,
      pivot: validPivot,
      camera: CAMERA,
      startPixel: startPx,
      currentPixel: [startPx[0] + 25, startPx[1] + 45],
      onFailure: (f) => failures.push(f),
    });
    expect(recoveredOutcome).not.toBeNull();
    expect(failures).toHaveLength(2);
    if (!recoveredOutcome) return;

    expect(recoveredOutcome.pivotBone).toBe("leftUpperArm");
    expect(recoveredOutcome.pose.head).toEqual(initialPose.head);
    expect(recoveredOutcome.pose.leftUpperArm).toBeDefined();

    history = pushShaperHistoryEntry(history, { type: "selectPoseControlPoints", payload: recoveredOutcome.pose });
    expect(history.curPos).toBe(1);
    const undone = stepShaperHistoryCursor(history, -1);
    expect(undone.stack.curPos).toBe(0);
    expect(undone.appliedEntry?.payload).toEqual(initialPose);
  });
});
