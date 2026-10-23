// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StudioMagicPoserPanel,
  type StudioMagicPoserScene,
} from "./StudioMagicPoserPanel";
import {
  createStudioMannequinRestPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import {
  applyStudioMannequinTimeOfDay,
  type StudioMannequinLightingRig,
} from "./studio-mannequin-lighting";
import type {
  StudioMannequinJointId,
  StudioMannequinVec3,
} from "./studio-mannequin-model";

function createSceneStub(): StudioMagicPoserScene & {
  setPose: ReturnType<typeof vi.fn>;
  getPose: ReturnType<typeof vi.fn>;
  setJointRotation: ReturnType<typeof vi.fn>;
  setLightingRig: ReturnType<typeof vi.fn>;
} {
  return {
    setPose: vi.fn<(pose: StudioMannequinPose) => void>(),
    getPose: vi.fn<() => StudioMannequinPose>(() => createStudioMannequinRestPose()),
    setJointRotation: vi.fn<
      (jointId: StudioMannequinJointId, rotation: StudioMannequinVec3) => void
    >(),
    setLightingRig: vi.fn<(rig: StudioMannequinLightingRig) => void>(),
  };
}

describe("StudioMagicPoserPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(cleanup);

  it("빈 상태 안내를 표시한다 (씬 미연결)", () => {
    render(<StudioMagicPoserPanel scene={null} />);
    expect(screen.getByText("3D 씬이 연결되지 않았습니다")).toBeTruthy();
  });

  it("8개 탭을 표시한다", () => {
    render(<StudioMagicPoserPanel scene={createSceneStub()} />);
    for (const label of ["포즈", "손", "조명", "카메라", "체형", "복제", "핸들", "표정"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("손 프리셋을 씬 관절에 적용한다 (MP1)", () => {
    const scene = createSceneStub();
    render(<StudioMagicPoserPanel scene={scene} />);
    fireEvent.click(screen.getByRole("button", { name: "손" }));
    // "주먹" 프리셋 적용 (오른손 기본)
    fireEvent.click(screen.getByRole("button", { name: "주먹" }));
    expect(scene.setJointRotation).toHaveBeenCalledWith(
      "rightHand",
      expect.any(Array),
    );
  });

  it("손가락 컬 슬라이더가 동작한다 (MP1)", () => {
    const scene = createSceneStub();
    render(<StudioMagicPoserPanel scene={scene} />);
    fireEvent.click(screen.getByRole("button", { name: "손" }));
    fireEvent.click(screen.getByRole("button", { name: "주먹" }));
    const slider = screen.getByLabelText(/검지/) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "50" } });
    expect(scene.setJointRotation).toHaveBeenCalled();
  });

  it("포즈 강도 슬라이더를 표시한다 (MP2)", () => {
    render(<StudioMagicPoserPanel scene={createSceneStub()} />);
    expect(screen.getByLabelText(/포즈 강도/)).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("시간대 프리셋을 전환한다 (MP3)", () => {
    render(<StudioMagicPoserPanel scene={createSceneStub()} />);
    fireEvent.click(screen.getByRole("button", { name: "조명" }));
    fireEvent.click(screen.getByRole("button", { name: "황혼" }));
    expect(
      screen.getByText("LT 명암 힌트", { selector: "dt" }),
    ).toBeTruthy();
  });

  it("탭을 여는 것만으로는 씬 조명을 바꾸지 않고, 시간대 프리셋은 씬 setLightingRig로 전달된다 (MP3 실연결·B-12)", () => {
    const scene = createSceneStub();
    render(<StudioMagicPoserPanel scene={scene} />);
    // 마운트가 빈 릭을 밀어 넣어 씬 조명을 기본값으로 덮어쓰던 동작을 막는다.
    expect(scene.setLightingRig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "조명" }));
    // 릭이 없으면 실제 뷰포트의 기본 3점 리그를 그대로 말한다(조명 0개·명암 0%가 아니다).
    expect(screen.getByText("3 / 4 (기본 3점 조명)")).toBeTruthy();
    expect(screen.getByText("주광 명암 67% · 그림자 켬")).toBeTruthy();
    expect(screen.getByRole("button", { name: "기본 3점" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "정오" }).getAttribute("aria-pressed")).toBe("false");
    expect(scene.setLightingRig).not.toHaveBeenCalled();
    expect(screen.getByText(/뷰포트 조명에 실시간으로 반영/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "황혼" }));
    expect(scene.setLightingRig).toHaveBeenLastCalledWith(
      expect.objectContaining({ timeOfDay: "dusk", shadowsEnabled: true }),
    );
    const duskRig = scene.setLightingRig.mock.lastCall?.[0] as StudioMannequinLightingRig;
    expect(duskRig.lights).toHaveLength(2);
    expect(duskRig.lights[0]).toMatchObject({ kind: "directional", color: "#ff7a4d" });
    // 전 프리셋이 같은 경로로 전달된다.
    for (const [label, timeOfDay] of [
      ["새벽", "dawn"],
      ["정오", "noon"],
      ["밤", "night"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(scene.setLightingRig).toHaveBeenLastCalledWith(
        expect.objectContaining({ timeOfDay }),
      );
    }
  });

  it("씬에 이미 적용된 릭에서 시작해 실제 조명 수·시간대를 보여 준다 (B-12)", () => {
    const scene = {
      ...createSceneStub(),
      getLightingRig: vi.fn(() => applyStudioMannequinTimeOfDay("night")),
    };
    render(<StudioMagicPoserPanel scene={scene} />);
    fireEvent.click(screen.getByRole("button", { name: "조명" }));
    expect(screen.getByText("2 / 4")).toBeTruthy();
    expect(screen.getByRole("button", { name: "밤" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "기본 3점" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "그림자 끔" })).toBeTruthy();
    // 다시 열어도 씬 조명을 기본값으로 덮어쓰지 않는다.
    expect(scene.setLightingRig).not.toHaveBeenCalled();
  });

  it("기본 3점 조명에서도 그림자 토글이 씬에 전달되고 표시가 따라온다 (B-12)", () => {
    const scene = createSceneStub();
    render(<StudioMagicPoserPanel scene={scene} />);
    fireEvent.click(screen.getByRole("button", { name: "조명" }));
    fireEvent.click(screen.getByRole("button", { name: "그림자 켬" }));
    expect(scene.setLightingRig).toHaveBeenLastCalledWith(
      expect.objectContaining({ lights: [], shadowsEnabled: false }),
    );
    expect(screen.getByText("주광 명암 67% · 그림자 끔")).toBeTruthy();
    expect(screen.getByText("3 / 4 (기본 3점 조명)")).toBeTruthy();
  });

  it("포즈 탭은 웹툰 프리셋 그리드를 다시 두지 않고 지금 포즈의 강도를 조절한다 (B-07)", () => {
    const scene = createSceneStub();
    const leaning: StudioMannequinPose = {
      joints: { spine: [0.6, 0, 0], leftUpperArm: [-1, 0, 0.2] },
      pelvisOffset: [0, -0.2, 0],
    };
    scene.getPose.mockReturnValue(leaning);
    render(<StudioMagicPoserPanel scene={scene} />);
    // 포즈 고르기는 포즈 탭의 통합 라이브러리가 맡는다 — 같은 카드가 여기 한 번 더 있으면 안 된다.
    expect(screen.queryAllByRole("button", { name: /포즈 적용$/ })).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "웹툰 포즈 프리셋" })).toBeNull();

    fireEvent.change(screen.getByLabelText(/포즈 강도/), { target: { value: "50" } });
    const blended = scene.setPose.mock.lastCall?.[0] as StudioMannequinPose;
    expect(blended.joints.spine?.[0]).toBeCloseTo(0.3, 6);
    expect(blended.joints.leftUpperArm?.[0]).toBeCloseTo(-0.5, 6);
    expect(blended.pelvisOffset[1]).toBeCloseTo(-0.1, 6);
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("호스트가 포즈를 바꾸면 강도 기준을 새 포즈로 잡고 100%로 되돌린다", () => {
    const scene = createSceneStub();
    const first: StudioMannequinPose = { joints: { spine: [0.4, 0, 0] }, pelvisOffset: [0, 0, 0] };
    scene.getPose.mockReturnValue(first);
    const view = render(<StudioMagicPoserPanel scene={scene} currentPose={first} hostOwnsHistory />);
    fireEvent.change(screen.getByLabelText(/포즈 강도/), { target: { value: "40" } });
    expect(screen.getByText("40%")).toBeTruthy();

    // 라이브러리에서 다른 포즈를 적용한 것처럼 호스트 포즈가 바뀐다.
    const next: StudioMannequinPose = { joints: { neck: [0.2, 0, 0] }, pelvisOffset: [0, 0, 0] };
    scene.getPose.mockReturnValue(next);
    view.rerender(<StudioMagicPoserPanel scene={scene} currentPose={next} hostOwnsHistory />);
    expect(screen.getByText("100%")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/포즈 강도/), { target: { value: "50" } });
    const blended = scene.setPose.mock.lastCall?.[0] as StudioMannequinPose;
    expect(blended.joints.neck?.[0]).toBeCloseTo(0.1, 6);
    expect(blended.joints.spine).toBeUndefined();
  });

  it("호스트가 되돌리기를 소유하면 패널 자체 되돌리기 줄을 두지 않는다 (B-07)", () => {
    render(<StudioMagicPoserPanel scene={createSceneStub()} hostOwnsHistory />);
    expect(screen.queryByRole("button", { name: /포즈 되돌리기/ })).toBeNull();
    expect(screen.queryByText(/되돌리기 \d+ · 다시실행 \d+/)).toBeNull();
  });

  it("그림자 토글이 씬 setLightingRig로 전달된다 (MP3 실연결)", () => {
    const scene = createSceneStub();
    render(<StudioMagicPoserPanel scene={scene} />);
    fireEvent.click(screen.getByRole("button", { name: "조명" }));
    fireEvent.click(screen.getByRole("button", { name: "황혼" }));
    fireEvent.click(screen.getByRole("button", { name: "그림자 켬" }));
    expect(scene.setLightingRig).toHaveBeenLastCalledWith(
      expect.objectContaining({ timeOfDay: "dusk", shadowsEnabled: false }),
    );
  });

  it("카메라 북마크를 저장하고 불러온다 (MP4)", () => {
    render(<StudioMagicPoserPanel scene={createSceneStub()} />);
    fireEvent.click(screen.getByRole("button", { name: "카메라" }));
    const input = screen.getByLabelText("북마크 이름") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "정면 클로즈업" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByText(/정면 클로즈업/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "불러오기" }));
    expect(screen.getByText(/정면 클로즈업/)).toBeTruthy();
  });

  it("체형 모프 슬라이더가 onBodyMorphChange를 호출한다 (MP5)", () => {
    const onBodyMorphChange = vi.fn();
    render(
      <StudioMagicPoserPanel
        scene={createSceneStub()}
        onBodyMorphChange={onBodyMorphChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "체형" }));
    const slider = screen.getByLabelText(/근육/) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "40" } });
    expect(onBodyMorphChange).toHaveBeenCalledWith(
      expect.objectContaining({ muscle: 40 }),
    );
  });

  it("포즈 복제·붙여넣기가 동작한다 (MP6)", () => {
    const scene = createSceneStub();
    render(<StudioMagicPoserPanel scene={scene} />);
    fireEvent.click(screen.getByRole("button", { name: "복제" }));
    fireEvent.click(screen.getByRole("button", { name: "현재 포즈 복사" }));
    expect(screen.getByText(/복사했습니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "붙여넣기" }));
    expect(scene.setPose).toHaveBeenCalled();
    expect(screen.getByText(/적용했습니다/)).toBeTruthy();
  });

  it("핸들 가이드 4종을 표시한다 (MP7)", () => {
    render(<StudioMagicPoserPanel scene={createSceneStub()} />);
    fireEvent.click(screen.getByRole("button", { name: "핸들" }));
    for (const label of ["무게중심", "척추", "상체", "머리"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("표정 콤보가 onApplyExpression을 호출한다 (MP8)", () => {
    const onApplyExpression = vi.fn();
    render(
      <StudioMagicPoserPanel
        scene={createSceneStub()}
        onApplyExpression={onApplyExpression}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "표정" }));
    fireEvent.click(screen.getByRole("button", { name: /미소/ }));
    expect(onApplyExpression).toHaveBeenCalledWith(
      "smile",
      expect.objectContaining({ happy: 1 }),
    );
  });

  it("손 프리셋 카드마다 손가락 컬에서 그린 실루엣 SVG가 표시된다", () => {
    render(<StudioMagicPoserPanel scene={createSceneStub()} />);
    fireEvent.click(screen.getByRole("button", { name: "손" }));
    const fistSilhouette = screen.getByRole("img", {
      name: "주먹 손 모양 실루엣",
    });
    const openSilhouette = screen.getByRole("img", {
      name: "손바닥 펼침 손 모양 실루엣",
    });
    // 주먹(컬 100)과 손바닥 펼침(컬 0)의 첫 번째 손가락 실루엣이 다르게 그려진다.
    const fistPoints = fistSilhouette
      .querySelector("polyline")
      ?.getAttribute("points");
    const openPoints = openSilhouette
      .querySelector("polyline")
      ?.getAttribute("points");
    expect(fistPoints).toBeTruthy();
    expect(openPoints).toBeTruthy();
    expect(fistPoints).not.toBe(openPoints);
  });

  it("손 탭 첫 진입 가이드를 보여준다", () => {
    render(<StudioMagicPoserPanel scene={createSceneStub()} />);
    fireEvent.click(screen.getByRole("button", { name: "손" }));
    expect(
      screen.getByRole("note", { name: "손 프리셋 — 10초 가이드 안내" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/손 모양 카드를 클릭하면 3D 손에 바로 적용됩니다/),
    ).toBeTruthy();
  });

  it("손 카테고리 칩으로 그리드를 필터링한다", () => {
    render(<StudioMagicPoserPanel scene={createSceneStub()} />);
    fireEvent.click(screen.getByRole("button", { name: "손" }));
    fireEvent.click(screen.getByRole("button", { name: "숫자" }));
    expect(screen.getByRole("button", { name: "숫자 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "주먹" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(screen.getByRole("button", { name: "주먹" })).toBeTruthy();
  });

  it("손 프리셋 핀으로 즐겨찾기를 고정하고 localStorage에 유지된다", () => {
    const { unmount } = render(<StudioMagicPoserPanel scene={createSceneStub()} />);
    fireEvent.click(screen.getByRole("button", { name: "손" }));
    fireEvent.click(screen.getByRole("button", { name: "주먹 즐겨찾기 고정" }));
    expect(screen.getByText("즐겨찾기")).toBeTruthy();
    const stored = window.localStorage.getItem(
      "toonstudio.mannequin-hand-preset.favorites.v1",
    );
    expect(stored).toContain("fist");

    unmount();
    render(<StudioMagicPoserPanel scene={createSceneStub()} />);
    fireEvent.click(screen.getByRole("button", { name: "손" }));
    expect(screen.getByText("즐겨찾기")).toBeTruthy();
  });

  it("손 프리셋 적용 시 최근 사용에 기록되고 지우기로 비울 수 있다", () => {
    render(<StudioMagicPoserPanel scene={createSceneStub()} />);
    fireEvent.click(screen.getByRole("button", { name: "손" }));
    fireEvent.click(screen.getByRole("button", { name: "주먹" }));
    expect(
      screen.getByRole("button", { name: "주먹 손 프리셋 적용" }),
    ).toBeTruthy();
    expect(screen.getByText(/적용된 손: 주먹/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "지우기" }));
    expect(
      screen.queryByRole("button", { name: "주먹 손 프리셋 적용" }),
    ).toBeNull();
  });

  it("손 프리셋 적용 후 되돌리기·다시실행이 동작하고 개수가 표시된다", () => {
    const scene = createSceneStub();
    render(<StudioMagicPoserPanel scene={scene} />);
    expect(screen.getByText("되돌리기 0 · 다시실행 0")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "포즈 되돌리기" }),
    ).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "손" }));
    fireEvent.click(screen.getByRole("button", { name: "주먹" }));
    expect(screen.getByText("되돌리기 1 · 다시실행 0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /포즈 되돌리기/ }));
    expect(scene.setPose).toHaveBeenCalledWith(
      expect.objectContaining({ joints: {} }),
    );
    expect(screen.getByText("되돌리기 0 · 다시실행 1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /포즈 다시실행/ }));
    expect(scene.setPose).toHaveBeenCalledTimes(2);
    expect(screen.getByText("되돌리기 1 · 다시실행 0")).toBeTruthy();
  });

  it("카메라 북마크 불러오기가 onApplyCameraBookmark를 호출한다", () => {
    const onApplyCameraBookmark = vi.fn();
    render(
      <StudioMagicPoserPanel
        scene={createSceneStub()}
        onApplyCameraBookmark={onApplyCameraBookmark}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "카메라" }));
    const input = screen.getByLabelText("북마크 이름") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "정면" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    fireEvent.click(screen.getByRole("button", { name: "불러오기" }));
    expect(onApplyCameraBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ name: "정면" }),
    );
  });
});
