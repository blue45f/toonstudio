/** r13의 숫자를 복사한 자급 합성 fixture다. native 이벤트·실제 handler·GPU 실행 증거가 아니다. */
import { Box3, Matrix4, PerspectiveCamera, Ray, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  createStudioHybridDccClickPrecisionTracker,
  type StudioHybridDccPointerFrame,
  type StudioHybridDccPointerSample,
  type StudioHybridDccPreciseClickOffset,
} from "./studio-hybrid-dcc-pointer-precision";

const CAMERA_WORLD: readonly number[] = [
  0.637242301313619, 0, -0.7706635124465947, 0,
  -0.36589641440197246, 0.880103957379843, -0.3025505546716438, 0,
  0.678264007112498, 0.4747810276373091, 0.5608394711959546, 0,
  2.5992762144493353, 1.8194788744035217, 2.1492762144493365, 1,
];
const CAMERA_PROJECTION: readonly number[] = [
  1.6735723688335937, 0, 0, 0, 0, 2.605089064693802, 0, 0,
  0, 0, -1.0000228429001352, -1, 0, 0, -0.0022842900135304645, 0,
];
const OBJECT_WORLD: readonly number[] = [
  1.1739635846082903, 0.0429509234173703, 0.2448769490810619, 0,
  -0.05289184676156338, 0.8932034240722636, 0.09690250652968366, 0,
  -0.2185362638745674, -0.12905852665581982, 1.0703204184117832, 0,
  0.35, 0.2, -0.1, 1,
];
type Tracker = ReturnType<typeof createStudioHybridDccClickPrecisionTracker>;

function frame(): StudioHybridDccPointerFrame {
  return { canvas: {}, camera: {}, width: 990, height: 636, left: 229, top: 80.75,
    cameraWorld: [...CAMERA_WORLD], cameraProjection: [...CAMERA_PROJECTION] };
}
function pointer(f: StudioHybridDccPointerFrame, type: string,
  patch: Partial<StudioHybridDccPointerSample> = {}): StudioHybridDccPointerSample {
  return { type, trusted: true, target: f.canvas, pointerId: 1, pointerType: "mouse", primary: true,
    button: 0, buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0, detail: 0,
    timeStamp: type === "pointerdown" ? 100 : 125,
    offsetX: 436.98211669921875, offsetY: 398.64385986328125,
    clientX: 665.9821166992188, clientY: 479.39385986328125, ...patch };
}
function clickFrom(up: StudioHybridDccPointerSample,
  patch: Partial<StudioHybridDccPointerSample> = {}): StudioHybridDccPointerSample {
  return { ...up, type: "click", buttons: 0, detail: 1, timeStamp: up.timeStamp + 1,
    offsetX: Math.round(up.offsetX), offsetY: Math.round(up.offsetY),
    clientX: Math.floor(up.clientX), clientY: Math.floor(up.clientY), ...patch };
}
function begin(tracker: Tracker, f: StudioHybridDccPointerFrame) {
  expect(tracker.sample(pointer(f, "pointerdown"), f)).toBeNull();
}
function release(tracker: Tracker, f: StudioHybridDccPointerFrame,
  patch: Partial<StudioHybridDccPointerSample> = {}) {
  const up = pointer(f, "pointerup", patch);
  expect(tracker.sample(up, f)).toBeNull();
  return up;
}
function expectedOffset(event: StudioHybridDccPointerSample): StudioHybridDccPreciseClickOffset {
  return { offsetX: event.offsetX, offsetY: event.offsetY };
}
function localRay(offset: StudioHybridDccPreciseClickOffset, f: StudioHybridDccPointerFrame): Ray {
  const camera = new PerspectiveCamera();
  camera.matrixWorld.fromArray(f.cameraWorld);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  camera.projectionMatrix.fromArray(f.cameraProjection);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  const origin = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const direction = new Vector3(offset.offsetX / f.width * 2 - 1, 1 - offset.offsetY / f.height * 2, 0.5)
    .unproject(camera).sub(origin).normalize();
  return new Ray(origin, direction).applyMatrix4(new Matrix4().fromArray(OBJECT_WORLD).invert());
}

describe("동일 pointer release의 click 소수 좌표 보존", () => {
  it("r13 합성 cube에서 정수 click ray의 miss와 보존된 release ray의 hit를 실제 Three 계산으로 구분한다", () => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker();
    const down = Object.freeze(pointer(f, "pointerdown"));
    const up = Object.freeze(pointer(f, "pointerup"));
    const click = Object.freeze(clickFrom(up));
    const before = JSON.stringify({ down, up, click, f });
    expect(tracker.sample(down, f)).toBeNull(); expect(tracker.sample(up, f)).toBeNull();
    const precise = tracker.sample(click, f);
    expect(precise).toEqual(expectedOffset(up));
    if (!precise) throw new Error("같은 실제 입력의 소수 좌표 결과가 필요합니다.");
    const cube = new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));
    expect(localRay(click, f).intersectBox(cube, new Vector3())).toBeNull();
    const hit = localRay(precise, f).intersectBox(cube, new Vector3());
    if (!hit) throw new Error("보존한 소수 ray는 원본 단위 cube 앞면에 도달해야 합니다.");
    expect(hit.x).toBeCloseTo(-0.24975013788952038, 12);
    expect(hit.y).toBeCloseTo(-0.4995001013064915, 12);
    expect(hit.z).toBeCloseTo(0.5, 12);
    // Three의 ray 교차점은 경계로 clamp하지 않으므로 마지막 연산의 기계 오차만 허용한다.
    expect(cube.distanceToPoint(hit)).toBeLessThanOrEqual(16 * Number.EPSILON * Math.max(1, hit.length()));
    expect(JSON.stringify({ down, up, click, f })).toBe(before);
  });

  it("이미 정수인 정상 클릭도 같은 Canvas·pointer의 원래 offset을 반환하고 한 번만 소비한다", () => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker();
    const down = pointer(f, "pointerdown", { offsetX: 400, offsetY: 300, clientX: 629, clientY: 380.75 });
    const up = { ...down, type: "pointerup", buttons: 0, timeStamp: 125 };
    tracker.sample(down, f); tracker.sample(up, f);
    expect(tracker.sample(clickFrom(up), f)).toEqual({ offsetX: 400, offsetY: 300 });
    expect(tracker.sample(clickFrom(up), f)).toBeNull();
  });

  it.each([0, 250])("release 후 %sms는 허용한다", (delay) => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    const up = release(tracker, f);
    expect(tracker.sample(clickFrom(up, { timeStamp: up.timeStamp + delay }), f)).toEqual(expectedOffset(up));
  });
  it.each([-1, 250.001])("release와의 시각 차이 %sms는 거부하며 결과를 재사용하지 않는다", (delay) => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    const up = release(tracker, f);
    expect(tracker.sample(clickFrom(up, { timeStamp: up.timeStamp + delay }), f)).toBeNull();
    expect(tracker.sample(clickFrom(up), f)).toBeNull();
  });

  it.each([0, 2])("같은 입력의 %spx 이동까지 release의 정밀 offset을 사용한다", (distance) => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    const up = pointer(f, "pointerup", { offsetX: 436.98211669921875 + distance, clientX: 665.9821166992188 + distance });
    expect(tracker.sample({ ...up, type: "pointermove", buttons: 1, timeStamp: 110 }, f)).toBeNull();
    tracker.sample(up, f);
    expect(tracker.sample(clickFrom(up), f)).toEqual(expectedOffset(up));
  });
  it("2px를 넘은 release는 거부한다", () => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    const up = release(tracker, f, { offsetX: 439.0821166992188, clientX: 668.0821166992188 });
    expect(tracker.sample(clickFrom(up), f)).toBeNull();
  });
  it("멀리 drag한 뒤 시작점으로 돌아와도 precision click으로 승격하지 않는다", () => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    tracker.sample(pointer(f, "pointermove", { offsetY: 403.64385986328125, clientY: 484.39385986328125 }), f);
    tracker.sample(pointer(f, "pointermove"), f);
    const up = release(tracker, f);
    expect(tracker.sample(clickFrom(up), f)).toBeNull();
  });
  it("버튼 변화가 없는 pointermove의 button -1은 정상 단일 입력을 취소하지 않는다", () => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    tracker.sample(pointer(f, "pointermove", { button: -1, timeStamp: 110 }), f);
    const up = release(tracker, f);
    expect(tracker.sample(clickFrom(up), f)).toEqual(expectedOffset(up));
  });
});

describe("다른 입력을 이전 release로 오인하지 않는 경계", () => {
  const invalidClicks: readonly { name: string; patch: Partial<StudioHybridDccPointerSample> }[] = [
    { name: "다른 target", patch: { target: {} } },
    { name: "target 없음", patch: { target: null } },
    { name: "다른 pointer", patch: { pointerId: 2 } },
    { name: "pointer ID 없음", patch: { pointerId: null } },
    { name: "다른 pointer 종류", patch: { pointerType: "pen" } },
    { name: "pointer 종류 없음", patch: { pointerType: null } },
    { name: "다른 버튼", patch: { button: 2 } },
    { name: "아직 눌린 버튼", patch: { buttons: 1 } },
    { name: "키보드 detail 0", patch: { detail: 0 } },
    { name: "비신뢰 click", patch: { trusted: false } },
    { name: "다른 offset", patch: { offsetX: 438 } },
    { name: "다른 client 정수", patch: { clientX: 666 } },
    { name: "유한하지 않은 좌표", patch: { offsetX: NaN } },
  ];
  it.each(invalidClicks)("$name click은 보정하지 않는다", ({ patch }) => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    const up = release(tracker, f);
    expect(tracker.sample(clickFrom(up, patch), f)).toBeNull();
    expect(tracker.sample(clickFrom(up), f)).toBeNull();
  });

  const invalidDowns: readonly { name: string; patch: Partial<StudioHybridDccPointerSample> }[] = [
    { name: "비신뢰 down", patch: { trusted: false } },
    { name: "다른 target", patch: { target: {} } },
    { name: "non-primary", patch: { primary: false } },
    { name: "오른쪽 버튼", patch: { button: 2, buttons: 2 } },
    { name: "눌린 버튼 없음", patch: { buttons: 0 } },
    { name: "pointer ID 0", patch: { pointerId: 0 } },
    { name: "소수 pointer ID", patch: { pointerId: 1.5 } },
  ];
  it.each(invalidDowns)("$name으로 시작한 입력은 보정하지 않는다", ({ patch }) => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker();
    tracker.sample(pointer(f, "pointerdown", patch), f);
    const up = release(tracker, f);
    expect(tracker.sample(clickFrom(up), f)).toBeNull();
  });

  const invalidUps: readonly { name: string; patch: Partial<StudioHybridDccPointerSample> }[] = [
    { name: "down보다 이른 release", patch: { timeStamp: 99 } },
    { name: "다른 pointer release", patch: { pointerId: 2 } },
    { name: "다른 버튼 release", patch: { button: 2 } },
    { name: "비신뢰 release", patch: { trusted: false } },
    { name: "non-primary release", patch: { primary: false } },
    { name: "다른 target release", patch: { target: {} } },
    { name: "client와 offset의 원점 불일치", patch: { clientY: 480.39385986328125 } },
  ];
  it.each(invalidUps)("$name 뒤의 정상 click도 보정하지 않는다", ({ patch }) => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    release(tracker, f, patch);
    expect(tracker.sample(clickFrom(pointer(f, "pointerup")), f)).toBeNull();
  });

  it("down 또는 release가 없는 click은 보정하지 않는다", () => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(), click = clickFrom(pointer(f, "pointerup"));
    expect(tracker.sample(click, f)).toBeNull();
    begin(tracker, f); expect(tracker.sample(click, f)).toBeNull();
  });
  it.each(["pointercancel", "pointerleave", "pointerout", "contextmenu", "wheel", "dblclick"])("%s 이후에는 release를 재사용하지 않는다", (type) => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    const up = release(tracker, f); tracker.sample(pointer(f, type), f);
    expect(tracker.sample(clickFrom(up), f)).toBeNull();
  });
  it("누른 상태에서 pointercancel되면 뒤늦은 up을 버리고 다음 새 입력만 허용한다", () => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    tracker.sample(pointer(f, "pointercancel"), f);
    const cancelled = release(tracker, f);
    expect(tracker.sample(clickFrom(cancelled), f)).toBeNull();
    begin(tracker, f); const fresh = release(tracker, f);
    expect(tracker.sample(clickFrom(fresh), f)).toEqual(expectedOffset(fresh));
  });
  it("다중 pointer의 release는 보정하지 않고 모두 끝난 뒤 새 단일 입력은 허용한다", () => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    tracker.sample(pointer(f, "pointerdown", { pointerId: 2, primary: false }), f);
    const first = release(tracker, f);
    expect(tracker.sample(clickFrom(first), f)).toBeNull();
    const second = release(tracker, f, { pointerId: 2, primary: false });
    expect(tracker.sample(clickFrom(second), f)).toBeNull();
    begin(tracker, f); const fresh = release(tracker, f);
    expect(tracker.sample(clickFrom(fresh), f)).toEqual(expectedOffset(fresh));
  });
  it("새 down은 이전 release를 대체하며 reset은 진행 중·완료 입력을 모두 버린다", () => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    const old = release(tracker, f); begin(tracker, f);
    expect(tracker.sample(clickFrom(old), f)).toBeNull();
    tracker.reset(); begin(tracker, f); tracker.reset();
    const up = release(tracker, f); expect(tracker.sample(clickFrom(up), f)).toBeNull();
    begin(tracker, f); const ready = release(tracker, f); tracker.reset();
    expect(tracker.sample(clickFrom(ready), f)).toBeNull();
    begin(tracker, f); const fresh = release(tracker, f);
    expect(tracker.sample(clickFrom(fresh), f)).toEqual(expectedOffset(fresh));
  });
});

describe("Canvas·카메라·크기 세대와 별도 행렬 snapshot", () => {
  const changedFrames: readonly { name: string; patch: Partial<StudioHybridDccPointerFrame> }[] = [
    { name: "Canvas identity", patch: { canvas: {} } },
    { name: "camera identity", patch: { camera: {} } },
    { name: "너비", patch: { width: 991 } },
    { name: "높이", patch: { height: 637 } },
    { name: "왼쪽 위치", patch: { left: 230 } },
    { name: "위쪽 위치", patch: { top: 81 } },
    { name: "빈 카메라 행렬", patch: { cameraWorld: [] } },
    { name: "짧은 투영 행렬", patch: { cameraProjection: CAMERA_PROJECTION.slice(1) } },
    { name: "유한하지 않은 행렬", patch: { cameraWorld: CAMERA_WORLD.map((value, index) => index === 0 ? Infinity : value) } },
    { name: "0 너비", patch: { width: 0 } },
  ];
  it.each(changedFrames)("release 후 $name 변경은 같은 클릭으로 인정하지 않는다", ({ patch }) => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    const up = release(tracker, f);
    expect(tracker.sample(clickFrom(up), { ...f, ...patch })).toBeNull();
  });
  it("내용이 같은 새 frame 배열은 허용한다", () => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    const up = release(tracker, { ...f, cameraWorld: [...CAMERA_WORLD], cameraProjection: [...CAMERA_PROJECTION] });
    expect(tracker.sample(clickFrom(up), { ...f })).toEqual(expectedOffset(up));
  });
  it("같은 camera·배열 identity의 Orbit 행렬 변경도 snapshot과 대조해 거부한다", () => {
    const world = [...CAMERA_WORLD], f = { ...frame(), cameraWorld: world };
    const tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    world[12] = 3;
    const up = release(tracker, f);
    expect(tracker.sample(clickFrom(up), f)).toBeNull();
  });
  it("release 뒤 같은 배열의 projection 변경도 거부한다", () => {
    const projection = [...CAMERA_PROJECTION], f = { ...frame(), cameraProjection: projection };
    const tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    const up = release(tracker, f); projection[0] = 2;
    expect(tracker.sample(clickFrom(up), f)).toBeNull();
  });
  it("관측한 Orbit 이동 뒤 원래 camera 행렬로 복귀해도 취소된 입력을 되살리지 않는다", () => {
    const f = frame(), tracker = createStudioHybridDccClickPrecisionTracker(); begin(tracker, f);
    const moved = { ...f, cameraWorld: CAMERA_WORLD.map((value, index) => index === 12 ? 3 : value) };
    tracker.sample(pointer(f, "pointermove"), moved);
    tracker.sample(pointer(f, "pointermove"), f);
    const up = release(tracker, f);
    expect(tracker.sample(clickFrom(up), f)).toBeNull();
  });
});
