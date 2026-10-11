// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildGodotClipPayload } from "./cuts-godot-bridge";
import { CUTS_GODOT_EMBED_PATH, CutsGodotEmbed } from "./CutsGodotEmbed";
import type { CutsClip } from "./cuts-types";

const clip: CutsClip = {
  id: "clip-1",
  titleId: "title-1",
  title: "테스트 작품",
  author: "작가",
  episodeNumber: 3,
  episodeTitle: "세 번째 이야기",
  shots: [
    {
      id: "shot-1",
      imageUrl: "https://example.com/a.png",
      alt: "첫 컷",
      caption: "첫 번째 자막",
      narrationSegments: [
        { text: "첫 번째 자막", rate: 1, pitch: 1, pauseBeforeMs: 0, pauseAfterMs: 0, emotion: "neutral" },
      ],
      narrationPlain: "첫 번째 자막",
      startMs: 0,
      durationMs: 3000,
      kenBurns: {
        from: { scale: 1, x: 0, y: 0 },
        to: { scale: 1.1, x: 0.1, y: 0 },
        direction: "zoom-in",
      },
    },
    {
      id: "shot-2",
      imageUrl: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
      alt: "둘째 컷",
      caption: "두 번째 자막",
      narrationSegments: [
        { text: "두 번째 자막", rate: 1, pitch: 1, pauseBeforeMs: 0, pauseAfterMs: 0, emotion: "neutral" },
      ],
      narrationPlain: "두 번째 자막",
      startMs: 3000,
      durationMs: 3500,
      kenBurns: {
        from: { scale: 1.05, x: 0, y: 0 },
        to: { scale: 1, x: 0, y: 0 },
        direction: "zoom-out",
      },
    },
  ],
  durationMs: 6500,
  narrationSsml: "",
  thumbnailUrl: "https://example.com/a.png",
  createdBy: "tester",
  createdAt: "2026-10-11T00:00:00.000Z",
  publishedAt: "2026-10-11T00:00:00.000Z",
  views: 0,
  likes: 0,
};

afterEach(() => {
  cleanup();
  delete window.__tsMotionEvent;
});

describe("CutsGodotEmbed", () => {
  it("Godot 빌드 iframe을 띄우고 준비 전에는 로딩 상태를 보인다", () => {
    render(<CutsGodotEmbed clip={clip} onExitToWeb={() => undefined} />);
    const frame = document.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(CUTS_GODOT_EMBED_PATH);
    expect(screen.getByText(/플레이어 엔진을 불러오는 중이에요/)).toBeTruthy();
    expect(typeof window.__tsMotionEvent).toBe("function");
  });

  it("Godot가 클립 대기를 알리면 재생 명세만 추려 주입한다", () => {
    render(<CutsGodotEmbed clip={clip} onExitToWeb={() => undefined} />);
    const frame = document.querySelector("iframe");
    const setClip = vi.fn();
    const win = frame?.contentWindow as (Window & { __tsMotionSetClip?: typeof setClip }) | null;
    expect(win).toBeTruthy();
    if (win) win.__tsMotionSetClip = setClip;
    act(() => {
      window.__tsMotionEvent?.(JSON.stringify({ type: "ready-waiting-clip" }));
    });
    expect(setClip).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(setClip.mock.calls[0][0] as string) as {
      title: string;
      shots: Array<{ imageUrl: string; durationMs: number }>;
    };
    expect(payload.title).toBe("테스트 작품 3화");
    expect(payload.shots).toHaveLength(2);
    expect(payload.shots[0].durationMs).toBe(3000);
    // 내레이션·메타는 셸 소유라 페이로드에 싣지 않는다.
    expect(setClip.mock.calls[0][0]).not.toContain("narrationPlain");
  });

  it("ready 이벤트가 오면 로딩 오버레이를 걷고 재생 중 상태를 보인다", () => {
    render(<CutsGodotEmbed clip={clip} onExitToWeb={() => undefined} />);
    act(() => {
      window.__tsMotionEvent?.(JSON.stringify({ type: "ready", shots: 2, totalMs: 6500 }));
    });
    expect(screen.queryByText(/플레이어 엔진을 불러오는 중이에요/)).toBeNull();
    expect(screen.getByText("Godot 플레이어로 재생 중")).toBeTruthy();
  });

  it("error 이벤트가 오면 실패 상태와 다시 시도를 보인다", () => {
    render(<CutsGodotEmbed clip={clip} onExitToWeb={() => undefined} />);
    act(() => {
      window.__tsMotionEvent?.(JSON.stringify({ type: "error", message: "빈 클립" }));
    });
    expect(screen.getByText("Godot 플레이어를 불러오지 못했어요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("돌아가기 버튼은 웹 복귀 콜백을 호출하고 언마운트 시 브리지를 정리한다", () => {
    const onExitToWeb = vi.fn();
    const { unmount } = render(<CutsGodotEmbed clip={clip} onExitToWeb={onExitToWeb} />);
    fireEvent.click(screen.getByRole("button", { name: "웹 플레이어로 돌아가기" }));
    expect(onExitToWeb).toHaveBeenCalledTimes(1);
    unmount();
    expect(window.__tsMotionEvent).toBeUndefined();
  });

  it("페이로드 빌더는 샷 순서를 유지한다", () => {
    const parsed = JSON.parse(buildGodotClipPayload(clip)) as {
      shots: Array<{ caption: string }>;
    };
    expect(parsed.shots.map((shot) => shot.caption)).toEqual(["첫 번째 자막", "두 번째 자막"]);
  });
});
