// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBlendIfPanel } from "./StudioBlendIfPanel";
import {
  createDefaultBlendIfConfig,
  patchBlendIfChannelHandles,
} from "./studio-blend-if-compositor";

afterEach(() => {
  cleanup();
});

describe("StudioBlendIfPanel", () => {
  it("채널 탭 전환, 핸들 슬라이더 조정, 프리셋 적용이 콜백을 정확히 호출한다", () => {
    const onChange = vi.fn();
    render(
      <StudioBlendIfPanel
        config={createDefaultBlendIfConfig()}
        onChange={onChange}
      />,
    );

    // 채널 전환: 빨강 탭
    fireEvent.click(screen.getByRole("tab", { name: /빨강/u }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeChannel: "r" }),
    );

    // 이 레이어 밝기 끝 슬라이더 조정
    const whiteMaxSlider = screen.getByRole("slider", {
      name: /이 레이어 \(전체 명도\) 밝기 끝/u,
    });
    fireEvent.change(whiteMaxSlider, { target: { value: "210" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channels: expect.objectContaining({
          gray: expect.objectContaining({
            thisLayer: [0, 0, 210, 210],
          }),
        }),
      }),
    );

    // 프리셋 버튼 클릭 (흰 바탕 투명화)
    fireEvent.click(screen.getByRole("button", { name: "흰 바탕 투명화" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enabled: true,
        channels: expect.objectContaining({
          gray: expect.objectContaining({
            thisLayer: [0, 0, 215, 248],
          }),
        }),
      }),
    );
  });

  it("전체 활성화 스위치와 초기화 버튼이 정상 동작한다", () => {
    const onChange = vi.fn();
    const modified = patchBlendIfChannelHandles(
      createDefaultBlendIfConfig(),
      "gray",
      "thisLayer",
      [0, 20, 210, 240],
    );

    render(<StudioBlendIfPanel config={modified} onChange={onChange} />);

    expect(screen.getByRole("status").textContent).toContain("1개 채널");

    fireEvent.click(screen.getByRole("switch", { name: "명도 조건 합성 사용" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));

    fireEvent.click(screen.getByRole("button", { name: "전체 초기화" }));
    expect(onChange).toHaveBeenLastCalledWith(createDefaultBlendIfConfig());
  });
});
