// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PLAY_GODOT_EMBED_PATH, PlayGodotEmbed } from "./PlayGodotEmbed";

afterEach(() => {
  cleanup();
  delete window.__tsPlayGodotReady;
});

describe("PlayGodotEmbed", () => {
  it("허브 빌드 iframe을 띄우고 준비 전에는 로딩 상태를 보인다", () => {
    render(<PlayGodotEmbed onExitToWeb={() => undefined} />);
    const frame = document.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(PLAY_GODOT_EMBED_PATH);
    expect(screen.getByText(/게임 엔진을 불러오는 중이에요/)).toBeTruthy();
    expect(typeof window.__tsPlayGodotReady).toBe("function");
  });

  it("Godot 허브의 준비 콜백이 오면 로딩 오버레이를 걷는다", () => {
    render(<PlayGodotEmbed onExitToWeb={() => undefined} />);
    act(() => {
      window.__tsPlayGodotReady?.();
    });
    expect(screen.queryByText(/게임 엔진을 불러오는 중이에요/)).toBeNull();
    expect(screen.getByText("Godot 에디션으로 플레이 중")).toBeTruthy();
  });

  it("돌아가기 버튼은 웹 버전 복귀 콜백을 호출하고 언마운트 시 브리지를 정리한다", () => {
    const onExitToWeb = vi.fn();
    const { unmount } = render(<PlayGodotEmbed onExitToWeb={onExitToWeb} />);
    fireEvent.click(screen.getByRole("button", { name: "웹 버전 놀이터로 돌아가기" }));
    expect(onExitToWeb).toHaveBeenCalledTimes(1);
    unmount();
    expect(window.__tsPlayGodotReady).toBeUndefined();
  });
});
