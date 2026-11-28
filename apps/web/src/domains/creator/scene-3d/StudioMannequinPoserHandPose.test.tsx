// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN } from "./studio-mannequin-lighting";
import { snapshotStudioMannequinLightingPlan } from "./studio-mannequin-scene";
import { useStudioMannequinHandPose } from "./use-studio-mannequin-hand-pose";

import type { StudioMannequinHandPadOutput } from "./studio-mannequin-ecorche-anatomy";
import type { StudioMannequinFingerPose, StudioMannequinSpec } from "./studio-mannequin-model";
import type { StudioMannequinSceneHandle } from "./studio-mannequin-scene";

const sceneMocks = vi.hoisted(() => {
  const setBodySpec = vi.fn<(spec: StudioMannequinSpec) => void>();
  const setEcorcheState = vi.fn<NonNullable<StudioMannequinSceneHandle["setEcorcheState"]>>();
  return { setBodySpec, setEcorcheState };
});

const sceneHandle: StudioMannequinSceneHandle = {
  setBodySpec: sceneMocks.setBodySpec,
  setEcorcheState: sceneMocks.setEcorcheState,
  setPose: vi.fn(),
  getPose: vi.fn(() => ({ joints: {}, pelvisOffset: [0, 0, 0] as const })),
  setJointRotation: vi.fn(),
  getJointRotation: vi.fn(() => [0, 0, 0] as const),
  selectJoint: vi.fn(),
  setMaterialStyle: vi.fn(),
  getMaterialStyle: vi.fn(() => "wood" as const),
  setOutlineMode: vi.fn(),
  getOutlineMode: vi.fn(() => "auto" as const),
  setShowJointRangeArc: vi.fn(),
  getShowJointRangeArc: vi.fn(() => true),
  setLightingRig: vi.fn(),
  getLightingRig: vi.fn(() => null),
  getLightingPlan: vi.fn(() => STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN),
  getLightingSnapshot: vi.fn(() => snapshotStudioMannequinLightingPlan(STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN)),
  setCameraPreset: vi.fn(),
  setProjection: vi.fn(),
  getProjection: vi.fn(() => "perspective" as const),
  setQuadView: vi.fn(),
  setCameraFovDeg: vi.fn(),
  resetCamera: vi.fn(),
  resize: vi.fn(),
  invalidate: vi.fn(),
  captureDataUrl: vi.fn(async () => ({
    pngDataUrl: "data:image/png;base64,AAAA",
    width: 640,
    height: 480,
    displayWidth: 320,
    displayHeight: 240,
  })),
  dispose: vi.fn(),
};

vi.mock("./studio-mannequin-scene", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-mannequin-scene")>();
  return {
    ...actual,
    createStudioMannequinScene: () => sceneHandle,
  };
});

vi.mock("./studio-mannequin-bg3d-preset-sqlite-repository", () => ({
  getProductStudioMannequinStateSqliteRepository: () => ({
    authority: "sqlite",
    load: vi.fn(async () => null),
    save: vi.fn(async (state: unknown) => state),
  }),
}));

const { StudioMannequinPoseSection } = await import("./StudioMannequinPoserPoseSection");
const { StudioMannequinPoserPanel } = await import("./StudioMannequinPoserPanel");

beforeEach(() => {
  sceneMocks.setBodySpec.mockClear();
  sceneMocks.setEcorcheState.mockClear();
});

afterEach(cleanup);

describe("StudioMannequinPoseSection · StudioMannequinPoserPanel — 손 포즈 실시간 본 연동", () => {
  it("외부 손 포즈와 한쪽 손 패드 변경이 스캐너 표시로 이어지고 벌림 편집은 다른 마디를 보존한다", () => {
    const { result } = renderHook(useStudioMannequinHandPose);
    const asymmetric: StudioMannequinFingerPose = {
      left: { index: [10, 20, 30], middle: [12, 22, 32] },
      right: { index: [70, 50, 30], middle: [80, 60, 40] },
    };
    act(() => result.current.setFingerPose(asymmetric));
    expect(result.current.handScannerPose.index.flex).toBe(0.7);
    expect(result.current.handScannerPose.middle.flex).toBe(0.8);

    act(() => result.current.handleScannerHandPoseChange({
      ...result.current.handScannerPose,
      index: { ...result.current.handScannerPose.index, spread: 0.5 },
    }, { kind: "finger", finger: "index", field: "spread" }));
    expect(result.current.fingerPose).toBe(asymmetric);
    expect(result.current.leftSplayDeg.index).toBe(9);
    expect(result.current.rightSplayDeg.index).toBe(9);

    const pad: StudioMannequinHandPadOutput = {
      segmentCurls: {
        thumb: [1, 2, 3], index: [25, 35, 45], middle: [30, 40, 50],
        ring: [35, 45, 55], little: [40, 50, 60],
      },
      splayDeg: { thumb: 0, index: -9, middle: 0, ring: 3, little: 6 },
    };
    act(() => result.current.handleApplyHandPad("right", pad));
    expect(result.current.handScannerPose.index).toEqual({ flex: 0.25, spread: -0.5 });
    expect(result.current.fingerPose.right?.index).toEqual([25, 35, 45]);
    expect(result.current.fingerPose.left?.index).toEqual([10, 20, 30]);
    expect(result.current.leftSplayDeg.index).toBe(9);
  });

  it("손 포즈 패널은 프리셋·초기화와 개별 굽힘·벌림 편집 의도를 전달한다", () => {
    const onHandPoseChange = vi.fn();

    const { container } = render(
      <StudioMannequinPoseSection
        selectedCategory="all"
        onCategorySelect={vi.fn()}
        onApplyPreset={vi.fn()}
        onApplyWebtoonPreset={vi.fn()}
        onMirror={vi.fn()}
        onResetJoints={vi.fn()}
        onHandPoseChange={onHandPoseChange}
      />,
    );

    const details = container.querySelector("details");
    expect(details).toBeTruthy();
    expect(screen.getByText("손 포즈 프리셋")).toBeTruthy();

    if (details) details.open = true;
    fireEvent.click(screen.getByRole("button", { name: "주먹 쥐기" }));
    expect(onHandPoseChange).toHaveBeenCalledTimes(1);
    expect(onHandPoseChange.mock.calls[0]![0].index.flex).toBeCloseTo(0.95, 2);
    expect(onHandPoseChange.mock.calls[0]?.[1]).toEqual({ kind: "preset" });

    fireEvent.click(screen.getByRole("button", { name: /검지/ }));
    const sliders = screen.getAllByRole("slider");
    const flexSlider = sliders.find((el) => el.getAttribute("min") === "0");
    const spreadSlider = sliders.find((el) => el.getAttribute("min") === "-100");
    expect(flexSlider).toBeTruthy();
    expect(spreadSlider).toBeTruthy();
    if (flexSlider) fireEvent.change(flexSlider, { target: { value: "25" } });
    expect(onHandPoseChange.mock.calls.at(-1)?.[0].index.flex).toBe(0.25);
    expect(onHandPoseChange.mock.calls.at(-1)?.[1]).toEqual({ kind: "finger", finger: "index", field: "flex" });
    if (spreadSlider) fireEvent.change(spreadSlider, { target: { value: "-25" } });
    expect(onHandPoseChange.mock.calls.at(-1)?.[0].index.spread).toBe(-0.25);
    expect(onHandPoseChange.mock.calls.at(-1)?.[1]).toEqual({ kind: "finger", finger: "index", field: "spread" });
    fireEvent.click(screen.getByTitle("손 포즈 초기화"));
    expect(onHandPoseChange.mock.calls.at(-1)?.[1]).toEqual({ kind: "preset" });
  });

  it("마네킹 패널에서 손 포즈 프리셋 및 손가락 슬라이더 조작 시 실시간 손가락 본(setBodySpec · setEcorcheState)을 갱신한다", async () => {
    render(
      <StudioMannequinPoserPanel
        open
        presentation="page"
        onClose={vi.fn()}
        onInsert={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(sceneMocks.setBodySpec).toHaveBeenCalled();
    });

    const summary = screen.getByText("손 포즈 프리셋");
    const details = summary.closest("details");
    expect(details).toBeTruthy();
    if (details) details.open = true;

    sceneMocks.setBodySpec.mockClear();
    sceneMocks.setEcorcheState.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "주먹 쥐기" }));

    await waitFor(() => {
      expect(sceneMocks.setBodySpec).toHaveBeenCalled();
      expect(sceneMocks.setEcorcheState).toHaveBeenCalled();
    });

    const latestEcorcheCall = sceneMocks.setEcorcheState.mock.calls.at(-1)?.[0] as {
      fingerPose: Record<"left" | "right", { index: readonly [number, number, number] }>;
      rightSplayDeg: { index?: number };
    };
    expect(latestEcorcheCall.fingerPose.right.index[0]).toBe(95);
    expect(latestEcorcheCall.fingerPose.left.index).toEqual([95, 95, 95]);
    expect(sceneMocks.setBodySpec.mock.calls.at(-1)?.[0].fingerPose?.left.index).toEqual([95, 95, 95]);
    expect(sceneMocks.setBodySpec.mock.calls.at(-1)?.[0].fingerPose?.right.index).toEqual([95, 95, 95]);

    fireEvent.click(screen.getByRole("button", { name: /검지/ }));
    const sliders = screen.getAllByRole("slider");
    const spreadSlider = sliders.find((el) => el.getAttribute("min") === "-100");
    expect(spreadSlider).toBeTruthy();
    if (spreadSlider) {
      fireEvent.change(spreadSlider, { target: { value: "50" } });
    }

    await waitFor(() => {
      const updated = sceneMocks.setEcorcheState.mock.calls.at(-1)?.[0] as {
        leftSplayDeg: { index?: number };
        rightSplayDeg: { index?: number };
      };
      expect(updated.rightSplayDeg.index).toBe(9);
      expect(updated.leftSplayDeg.index).toBe(9);
    });

    const tabs = within(screen.getByRole("navigation", { name: "데생 인형 설정 탭" }));
    fireEvent.click(tabs.getByRole("button", { name: /^체형$/u }));
    fireEvent.click(tabs.getByRole("button", { name: /^포즈$/u }));
    const restoredDetails = screen.getByText("손 포즈 프리셋").closest("details");
    if (restoredDetails) restoredDetails.open = true;
    fireEvent.click(screen.getByRole("button", { name: /검지/ }));
    const restoredSliders = screen.getAllByRole<HTMLInputElement>("slider");
    expect(restoredSliders.find((slider) => slider.getAttribute("min") === "0")?.value).toBe("95");
    expect(restoredSliders.find((slider) => slider.getAttribute("min") === "-100")?.value).toBe("50");
  });

  it("벌림이 0인 상태에서 굽힘만 변경해도 실제 본 스펙에 양손 손가락 각도가 반영된다", async () => {
    render(<StudioMannequinPoserPanel open presentation="page" onClose={vi.fn()} onInsert={vi.fn()} />);
    await waitFor(() => expect(sceneMocks.setBodySpec).toHaveBeenCalled());
    const details = screen.getByText("손 포즈 프리셋").closest("details");
    if (details) details.open = true;
    fireEvent.click(screen.getByRole("button", { name: /검지/ }));
    const flexSlider = screen.getAllByRole("slider").find((el) => el.getAttribute("min") === "0");
    expect(flexSlider).toBeTruthy();
    sceneMocks.setBodySpec.mockClear();
    if (flexSlider) fireEvent.change(flexSlider, { target: { value: "37" } });

    await waitFor(() => {
      const spec = sceneMocks.setBodySpec.mock.calls.at(-1)?.[0];
      expect(spec?.fingerPose?.left.index).toEqual([37, 37, 37]);
      expect(spec?.fingerPose?.right.index).toEqual([37, 37, 37]);
      expect(spec?.fingerPose?.left.middle).toEqual([0, 0, 0]);
    });
    const ecorche = sceneMocks.setEcorcheState.mock.calls.at(-1)?.[0];
    expect(ecorche?.leftSplayDeg).toEqual({});
    expect(ecorche?.rightSplayDeg).toEqual({});
  });

  it("라이브러리 손 프리셋을 한 번에 취소·재실행해 양손 굽힘·벌림·손목과 접촉을 복원한다", async () => {
    const { container } = render(<StudioMannequinPoserPanel open presentation="page" onClose={vi.fn()} onInsert={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "3D 데생 인형 닫기" })).toHaveProperty("disabled", false));
    const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name, exact: true }));
    const tabs = within(screen.getByRole("navigation", { name: "데생 인형 설정 탭" }));
    const showTab = (name: string) => fireEvent.click(tabs.getByRole("button", { name, exact: true }));
    const readHands = () => {
      const pose = vi.mocked(sceneHandle.setPose).mock.lastCall?.[0];
      const state = sceneMocks.setEcorcheState.mock.lastCall?.[0];
      if (!pose || !state) throw new Error("손 모양이 장면에 도달하지 않았습니다.");
      showTab("관절");
      const contact = screen.getByRole("button", { name: "턱 괴기" }).getAttribute("aria-pressed");
      showTab("포즈");
      return {
        bones: sceneMocks.setBodySpec.mock.lastCall?.[0].fingerPose,
        leftSplay: state.leftSplayDeg,
        rightSplay: state.rightSplayDeg,
        leftWrist: pose.joints.leftHand,
        rightWrist: pose.joints.rightHand,
        contact,
      };
    };
    const applyPreset = (id: string) => {
      fireEvent.change(screen.getByLabelText("포즈 라이브러리 검색"), { target: { value: id } });
      const card = container.querySelector(`[data-studio-pose-library-entry="mannequin:${id}"] button`);
      if (!card) throw new Error(`손 프리셋 카드가 없습니다: ${id}`);
      fireEvent.click(card);
    };

    showTab("매직 포저");
    click("손");
    click("왼손");
    click("손바닥 펼침");
    click("오른손");
    click("브이(피스)");
    showTab("관절");
    click("턱 괴기");
    const original = readHands();
    expect(original.bones?.left).not.toEqual(original.bones?.right);
    expect(original.leftSplay).not.toEqual(original.rightSplay);
    expect(original.contact).toBe("true");

    applyPreset("hand-fist");
    const fist = readHands();
    expect(fist.bones?.left.index).toEqual([100, 100, 100]);
    expect(fist.bones?.right.index).toEqual([100, 100, 100]);
    expect(fist.leftWrist).not.toEqual(original.leftWrist);
    expect(fist.contact).toBe("false");
    applyPreset("hand-peace");
    const peace = readHands();
    expect(peace.bones?.right.index).toEqual([0, 0, 0]);
    expect(peace.rightSplay).not.toEqual(fist.rightSplay);

    click(/^되돌리기/u);
    expect(readHands()).toEqual(fist);
    click(/^되돌리기/u);
    expect(readHands()).toEqual(original);
    click(/^다시실행/u);
    expect(readHands()).toEqual(fist);
    click(/^다시실행/u);
    expect(readHands()).toEqual(peace);
    click(/^되돌리기/u);
    applyPreset("hand-open");
    expect(screen.getByRole("button", { name: "다시실행" })).toHaveProperty("disabled", true);
  });
});
