// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dCinematicDirectorPanel } from "./StudioBg3dCinematicDirectorPanel";

import type { StudioBg3dShot } from "./studio-bg3d-scene-document";

// 무거운 패널 렌더가 병렬 실행 부하에서 5초를 넘길 수 있어 타임아웃을 늘립니다.
vi.setConfig({ testTimeout: 30000 });

describe("StudioBg3dCinematicDirectorPanel", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders transition controls, continuity review and local shot deck actions", () => {
    const handleBookmark = vi.fn();
    const handleShake = vi.fn();

    render(
      <StudioBg3dCinematicDirectorPanel
        onApplyShotBookmark={handleBookmark}
        onTriggerShake={handleShake}
      />,
    );

    expect(screen.getByText("시네마틱 카메라 & 컷 디렉터")).toBeDefined();
    expect(screen.getByText("하이 앵글 부감 (High Angle)")).toBeDefined();
    expect(screen.getByText("컷 연속성 검사")).toBeDefined();
    expect(screen.getByText("저장된 웹툰 컷 덱")).toBeDefined();
    expect(screen.getByLabelText("카메라 전환 설정")).toBeDefined();

    fireEvent.click(screen.getByText("지진/붕괴 진동"));
    expect(handleShake).toHaveBeenCalledTimes(1);
    expect(handleShake.mock.calls[0][0].preset).toBe("earthquake-rumble");

    fireEvent.click(screen.getByRole("button", { name: "현재 설정으로 컷 추가" }));
    expect(handleBookmark).toHaveBeenCalledTimes(1);
    expect(handleBookmark.mock.calls[0][0].transitionSeconds).toBe(0.8);
    expect(screen.getByText("01화 컷 4")).toBeDefined();
  });

  it("connects production shot capture, apply, reorder, remove and AI reference callbacks", () => {
    const shots: readonly StudioBg3dShot[] = [
      {
        id: "shot-a",
        name: "대화 와이드",
        camera: { position: [0, 1.6, 6], target: [0, 1.4, 0], fovDegrees: 50 },
      },
      {
        id: "shot-b",
        name: "표정 클로즈업",
        camera: { position: [0, 1.6, 2], target: [0, 1.5, 0], fovDegrees: 24 },
      },
    ];
    const capture = vi.fn();
    const apply = vi.fn();
    const move = vi.fn();
    const remove = vi.fn();
    const aiReference = vi.fn();

    render(
      <StudioBg3dCinematicDirectorPanel
        productionShots={shots}
        baseCamera={{ position: [0, 1.6, 6], target: [0, 1.4, 0], fovDegrees: 45 }}
        onCaptureCurrentShot={capture}
        onApplyProductionShot={apply}
        onMoveProductionShot={move}
        onRemoveProductionShot={remove}
        onUseCurrentFrameAsAiReference={aiReference}
      />,
    );

    expect(screen.getByText("장면 연동")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "현재 장면을 컷으로 저장" }));
    expect(capture).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("표정 클로즈업 위로 이동"));
    expect(move).toHaveBeenCalledWith("shot-b", 0);

    fireEvent.click(screen.getAllByRole("button", { name: "이동" })[0]!);
    expect(apply).toHaveBeenCalledWith("shot-a");

    fireEvent.click(screen.getByLabelText("대화 와이드 삭제"));
    expect(remove).toHaveBeenCalledWith("shot-a");

    fireEvent.click(screen.getByRole("button", { name: "현재 컷을 AI 구도·포즈 참조로 보내기" }));
    expect(aiReference).toHaveBeenCalledTimes(1);
  });

  it("stops deck playback when a retained panel is hidden and requires explicit restart", () => {
    vi.useFakeTimers();
    const shots: readonly StudioBg3dShot[] = [
      {
        id: "shot-a",
        name: "대화 와이드",
        camera: { position: [0, 1.6, 6], target: [0, 1.4, 0], fovDegrees: 50 },
      },
      {
        id: "shot-b",
        name: "표정 클로즈업",
        camera: { position: [0, 1.6, 2], target: [0, 1.5, 0], fovDegrees: 24 },
      },
    ];
    const apply = vi.fn();
    const applyAngle = vi.fn();
    const panel = (hidden: boolean) => (
      <div hidden={hidden}>
        <StudioBg3dCinematicDirectorPanel
          disabled={hidden}
          onApplyShotBookmark={applyAngle}
          productionShots={shots}
          onApplyProductionShot={apply}
        />
      </div>
    );
    const { rerender } = render(panel(false));
    expect(screen.queryByRole("spinbutton", { name: "컷 유지" })).toBeNull();
    expect(screen.getByText(/1.2초 간격으로 바뀝니다/u)).toBeDefined();
    fireEvent.change(screen.getByRole("spinbutton", { name: "앵글 이동 시간(초)" }), {
      target: { value: "2.4" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "앵글 이동 곡선" }), { target: { value: "whip-pan" } });
    fireEvent.click(screen.getByRole("button", { name: /하이 앵글 부감/u }));
    expect(applyAngle).toHaveBeenLastCalledWith(expect.objectContaining({ transitionSeconds: 2.4, easing: "whip-pan" }));
    fireEvent.click(screen.getByRole("button", { name: "컷 순서 미리보기" }));
    expect(apply.mock.calls).toEqual([["shot-a"]]);
    act(() => vi.advanceTimersByTime(500));

    // Pro Suite preserves visited panels, so leaving Director disables it without unmounting.
    rerender(panel(true));
    act(() => vi.advanceTimersByTime(5_000));
    expect(apply.mock.calls).toEqual([["shot-a"]]);

    rerender(panel(false));
    act(() => vi.advanceTimersByTime(5_000));
    expect(apply.mock.calls).toEqual([["shot-a"]]);
    expect((screen.getByRole("spinbutton", { name: "앵글 이동 시간(초)" }) as HTMLInputElement).value)
      .toBe("2.4");

    fireEvent.click(screen.getByRole("button", { name: "컷 순서 미리보기" }));
    expect(apply.mock.calls).toEqual([["shot-a"], ["shot-a"]]);
    act(() => vi.advanceTimersByTime(1_200));
    expect(apply.mock.calls).toEqual([["shot-a"], ["shot-a"], ["shot-b"]]);
  });

  it("리허설은 첫 컷부터 표시하고 각 컷의 실제 대기 시간에 맞춰 다음 컷을 적용한다", () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    render(<StudioBg3dCinematicDirectorPanel onApplyShotBookmark={apply} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "이동 시간" }), { target: { value: "2.4" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "컷 유지" }), { target: { value: "3.6" } });
    fireEvent.click(screen.getByRole("button", { name: "현재 설정으로 컷 추가" }));
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ transitionSeconds: 2.4, holdSeconds: 3.6 }));
    apply.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "컷 순서 미리보기" }));
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ id: "cut-1", transitionSeconds: 0 }));
    act(() => vi.advanceTimersByTime(1_199));
    expect(apply).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1));
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ id: "cut-2" }));
    act(() => vi.advanceTimersByTime(2_000));
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ id: "cut-3" }));
  });

  it("explains the panel purpose in 10 seconds and annotates angle/shake presets", () => {
    render(<StudioBg3dCinematicDirectorPanel />);

    expect(
      screen.getByText(/앵글과 재생 시간을 정해 리허설 컷을 추가하세요/u),
    ).toBeDefined();

    const dutchButton = screen.getByRole("button", { name: /더치 앵글 사각/ });
    expect(dutchButton.getAttribute("title")).toContain("더치앵글");
    expect(dutchButton.getAttribute("aria-pressed")).toBeDefined();

    const quakeButton = screen.getByRole("button", { name: "지진/붕괴 진동" });
    expect(quakeButton.getAttribute("title")).toContain("지진");
    expect(quakeButton.getAttribute("aria-pressed")).toBeDefined();
  });
});
