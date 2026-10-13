// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceGameFeelSettings } from "./StudioVirtualSpaceGameFeelSettings";
import { DEFAULT_STUDIO_VIRTUAL_GAME_FEEL } from "./studio-virtual-space-game-feel-preference";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockReducedMotion(matches: boolean) {
  const query = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return query;
}

describe("StudioVirtualSpaceGameFeelSettings", () => {
  /** "세부 조정" 토글을 열어 슬라이더를 노출한다. */
  function openAdvanced() {
    fireEvent.click(screen.getByRole("button", { name: /세부 조정/ }));
  }

  it("화면 흔들림 토글·파티클·모션 슬라이더를 보여준다", () => {
    mockReducedMotion(false);
    render(<StudioVirtualSpaceGameFeelSettings value={DEFAULT_STUDIO_VIRTUAL_GAME_FEEL} onChange={() => {}} />);
    const shake = screen.getByRole("checkbox", { name: /화면 흔들림/ }) as HTMLInputElement;
    expect(shake.checked).toBe(true);
    // 슬라이더는 "세부 조정" 안에 접혀 있다
    expect(screen.queryByRole("slider", { name: "파티클 밀도" })).toBeNull();
    openAdvanced();
    const density = screen.getByRole("slider", { name: "파티클 밀도" }) as HTMLInputElement;
    expect(density.value).toBe("80");
    const motion = screen.getByRole("slider", { name: "모션 강도" }) as HTMLInputElement;
    expect(motion.value).toBe("100");
  });

  it("화면 흔들림을 끄면 onChange가 호출된다", () => {
    mockReducedMotion(false);
    const onChange = vi.fn();
    render(<StudioVirtualSpaceGameFeelSettings value={DEFAULT_STUDIO_VIRTUAL_GAME_FEEL} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /화면 흔들림/ }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_STUDIO_VIRTUAL_GAME_FEEL, version: 1, screenShake: false });
  });

  it("파티클 밀도 슬라이더를 움직이면 값이 반영된다", () => {
    mockReducedMotion(false);
    const onChange = vi.fn();
    render(<StudioVirtualSpaceGameFeelSettings value={DEFAULT_STUDIO_VIRTUAL_GAME_FEEL} onChange={onChange} />);
    openAdvanced();
    fireEvent.change(screen.getByRole("slider", { name: "파티클 밀도" }), { target: { value: "40" } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_STUDIO_VIRTUAL_GAME_FEEL, version: 1, particleDensity: 0.4 });
  });

  it("모션 강도 슬라이더를 움직이면 값이 반영된다", () => {
    mockReducedMotion(false);
    const onChange = vi.fn();
    render(<StudioVirtualSpaceGameFeelSettings value={DEFAULT_STUDIO_VIRTUAL_GAME_FEEL} onChange={onChange} />);
    openAdvanced();
    fireEvent.change(screen.getByRole("slider", { name: "모션 강도" }), { target: { value: "25" } });
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_STUDIO_VIRTUAL_GAME_FEEL, version: 1, motionIntensity: 0.25 });
  });

  it("OS reduced-motion이 켜져 있으면 안내 문구와 함께 컨트롤이 비활성화된다", () => {
    mockReducedMotion(true);
    render(<StudioVirtualSpaceGameFeelSettings value={DEFAULT_STUDIO_VIRTUAL_GAME_FEEL} onChange={() => {}} />);
    expect(screen.getByText(/모든 효과가 자동으로 꺼졌습니다/)).toBeTruthy();
    const shake = screen.getByRole("checkbox", { name: /화면 흔들림/ }) as HTMLInputElement;
    expect(shake.disabled).toBe(true);
    openAdvanced();
    const density = screen.getByRole("slider", { name: "파티클 밀도" }) as HTMLInputElement;
    expect(density.disabled).toBe(true);
    // 자동 연동 토글은 끌 수 있어야 한다
    const follow = screen.getByRole("checkbox", { name: /기기의 모션 감소 설정 따르기/ }) as HTMLInputElement;
    expect(follow.disabled).toBe(false);
  });

  it("이동 감각은 즉응형이 기본이고 관성형으로 바꾸면 onChange가 호출된다", () => {
    mockReducedMotion(false);
    const onChange = vi.fn();
    render(<StudioVirtualSpaceGameFeelSettings value={DEFAULT_STUDIO_VIRTUAL_GAME_FEEL} onChange={onChange} />);
    expect(screen.getByRole("group", { name: "이동 감각" })).toBeTruthy();
    const crisp = screen.getByRole("radio", { name: /즉응형/ }) as HTMLInputElement;
    const classic = screen.getByRole("radio", { name: /관성형/ }) as HTMLInputElement;
    expect(crisp.checked).toBe(true);
    expect(classic.checked).toBe(false);
    fireEvent.click(classic);
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_STUDIO_VIRTUAL_GAME_FEEL, version: 1, moveFeel: "classic" });
  });

  it("저장된 관성형 값은 선택된 상태로 보이고 즉응형으로 되돌릴 수 있다", () => {
    mockReducedMotion(false);
    const onChange = vi.fn();
    render(<StudioVirtualSpaceGameFeelSettings value={{ ...DEFAULT_STUDIO_VIRTUAL_GAME_FEEL, moveFeel: "classic" }} onChange={onChange} />);
    expect((screen.getByRole("radio", { name: /관성형/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /즉응형/ }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_STUDIO_VIRTUAL_GAME_FEEL, version: 1, moveFeel: "crisp" });
  });

  it("OS 모션 감소가 켜져 있어도 이동 감각은 선택할 수 있다", () => {
    mockReducedMotion(true);
    render(<StudioVirtualSpaceGameFeelSettings value={DEFAULT_STUDIO_VIRTUAL_GAME_FEEL} onChange={() => {}} />);
    expect((screen.getByRole("radio", { name: /즉응형/ }) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole("radio", { name: /관성형/ }) as HTMLInputElement).disabled).toBe(false);
  });

  it("matchMedia가 없어도 렌더링된다", () => {
    vi.stubGlobal("matchMedia", undefined);
    render(<StudioVirtualSpaceGameFeelSettings value={DEFAULT_STUDIO_VIRTUAL_GAME_FEEL} onChange={() => {}} />);
    expect(screen.getByRole("heading", { name: "게임필 설정" })).toBeTruthy();
  });
});
