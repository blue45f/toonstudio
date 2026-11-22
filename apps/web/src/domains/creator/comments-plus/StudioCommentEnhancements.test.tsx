// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CommentResolutionAuditLog,
  MentionText,
  QuickReactionPicker,
  ReactionBar,
  RedpenCommentOverlaySvg,
  RedpenOverlayControlBar,
  ThreadStatusChip,
  TypingIndicator,
} from "./StudioCommentEnhancements";
import {
  acceptRedpenAndResolve,
  addRedpenStroke,
  createRedpenOverlayState,
  recordThreadResolutionTransition,
} from "./studio-redpen-comment-overlay";

afterEach(cleanup);

describe("TypingIndicator", () => {
  it("타이핑 중인 사용자가 없으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(<TypingIndicator users={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("한 명의 타이핑을 표시한다", () => {
    render(<TypingIndicator users={[{ userId: "u1", userName: "민준" }]} />);
    expect(screen.getByRole("status").textContent).toMatch(/민준님이 입력 중/);
  });

  it("여러 명이면 대표 이름 + 외 N명을 표시한다", () => {
    render(
      <TypingIndicator
        users={[
          { userId: "u1", userName: "민준" },
          { userId: "u2", userName: "지훈" },
        ]}
      />
    );
    expect(screen.getByRole("status").textContent).toMatch(/민준, 지훈/);
  });
});

describe("ReactionBar", () => {
  it("집계된 리액션을 보여준다", () => {
    render(
      <ReactionBar
        reactions={[
          { emoji: "👍", userId: "a" },
          { emoji: "👍", userId: "b" },
        ]}
        myUserId="me"
        onToggle={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /👍 2개/ })).toBeTruthy();
  });

  it("내 리액션은 aria-pressed=true", () => {
    render(
      <ReactionBar
        reactions={[{ emoji: "❤️", userId: "me" }]}
        myUserId="me"
        onToggle={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: /❤️/ }).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("클릭하면 onToggle이 호출된다", () => {
    const onToggle = vi.fn();
    render(
      <ReactionBar
        reactions={[{ emoji: "👍", userId: "a" }]}
        myUserId="me"
        onToggle={onToggle}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /👍/ }));
    expect(onToggle).toHaveBeenCalledWith("👍");
  });
});

describe("QuickReactionPicker", () => {
  it("5개 이모지를 고르면 onPick이 호출된다", () => {
    const onPick = vi.fn();
    render(<QuickReactionPicker onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: /👏/ }));
    expect(onPick).toHaveBeenCalledWith("👏");
  });
});

describe("MentionText", () => {
  it("멘션을 하이라이트한다", () => {
    render(<MentionText text="@민준 이거 봐줘" />);
    expect(screen.getByText("@민준")).toBeTruthy();
  });

  it("멘션이 없으면 텍스트 그대로", () => {
    const { container } = render(<MentionText text="그냥 댓글" />);
    expect(container.textContent).toBe("그냥 댓글");
  });

  it("멘션 클릭 시 콜백에 이름(조사 제거)을 전달한다", () => {
    const onMentionClick = vi.fn();
    render(
      <MentionText text="@민준이 봐줘" onMentionClick={onMentionClick} />
    );
    fireEvent.click(screen.getByRole("button", { name: "@민준이" }));
    expect(onMentionClick).toHaveBeenCalledWith("민준");
  });
});

describe("ThreadStatusChip", () => {
  it("미해결 상태를 표시한다", () => {
    render(<ThreadStatusChip resolved={false} />);
    expect(screen.getByRole("status").textContent).toContain("미해결");
  });

  it("해결됨 상태를 표시한다", () => {
    render(<ThreadStatusChip resolved={true} />);
    expect(screen.getByRole("status").textContent).toContain("해결됨");
  });

  it("onToggle이 있으면 버튼으로 동작한다", () => {
    const onToggle = vi.fn();
    render(<ThreadStatusChip resolved={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "해결하기" }));
    expect(onToggle).toHaveBeenCalled();
  });
});

describe("RedpenCommentOverlaySvg & RedpenOverlayControlBar", () => {
  const cutBox = { cutId: "cut-01", x: 0, y: 0, width: 800, height: 1_200 };

  it("비파괴 SVG 오버레이에 빨간펜 스트로크와 정규화 앵커 핀을 렌더한다", () => {
    const overlay = addRedpenStroke(
      createRedpenOverlayState({
        threadId: "t-svg",
        anchor: { cutId: "cut-01", u: 0.25, v: 0.5 },
        createdAt: 1_000,
        authorId: "editor",
      }),
      {
        id: "rp-svg-1",
        authorId: "editor",
        authorName: "편집자",
        createdAt: 1_100,
        points: [
          { u: 0.1, v: 0.2 },
          { u: 0.3, v: 0.4 },
        ],
      },
    );

    const { container } = render(
      <RedpenCommentOverlaySvg overlay={overlay} cutBox={cutBox} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("data-non-destructive-overlay")).toBe("true");
    expect(svg?.getAttribute("data-canvas-layer-id")).toBe("none");

    const strokePath = container.querySelector('[data-redpen-stroke-id="rp-svg-1"]');
    expect(strokePath?.getAttribute("d")).toBe("M 80 240 L 240 480");

    const pin = container.querySelector('[data-redpen-pin-anchor="true"]');
    expect(pin?.getAttribute("transform")).toBe("translate(200, 600)");
    expect(pin?.getAttribute("data-pin-u")).toBe("0.25");
    expect(pin?.getAttribute("data-pin-v")).toBe("0.5");
  });

  it("컨트롤 바에서 빨간펜 토글·1클릭 수락 체크완료·감사 이력 펼치기가 동작한다", () => {
    const base = addRedpenStroke(
      createRedpenOverlayState({
        threadId: "t-ctrl",
        anchor: { cutId: "cut-01", u: 0.5, v: 0.5 },
        createdAt: 1_000,
        authorId: "editor",
      }),
      {
        id: "rp-ctrl-1",
        authorId: "editor",
        authorName: "편집자",
        createdAt: 1_100,
        points: [{ u: 0.4, v: 0.4 }],
      },
    );
    const onToggleVisibility = vi.fn();
    const onAcceptAndResolve = vi.fn();

    render(
      <RedpenOverlayControlBar
        overlay={base}
        onToggleVisibility={onToggleVisibility}
        onAcceptAndResolve={onAcceptAndResolve}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "빨간펜 숨기기" }));
    expect(onToggleVisibility).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "빨간펜 수락 후 1클릭 체크완료" }));
    expect(onAcceptAndResolve).toHaveBeenCalledTimes(1);
  });

  it("해결/재열기 감사 이력을 순서대로 표시한다", () => {
    const base = createRedpenOverlayState({
      threadId: "t-log",
      anchor: { cutId: "cut-01", u: 0.5, v: 0.5 },
      createdAt: 1_000,
      authorId: "editor",
    });
    const accepted = acceptRedpenAndResolve(base, { id: "artist", name: "민수" }, 1_700_000_000_000, {
      note: "선 굵기 보정",
    });
    const reopened = recordThreadResolutionTransition(
      accepted,
      "reopen",
      { id: "editor", name: "지훈" },
      1_700_000_060_000,
    );

    render(<CommentResolutionAuditLog entries={reopened.auditLog} />);
    const log = screen.getByRole("log", { name: "해결 및 재열기 감사 이력" });
    expect(log.textContent).toContain("빨간펜 수락 · 체크완료");
    expect(log.textContent).toContain("민수");
    expect(log.textContent).toContain("선 굵기 보정");
    expect(log.textContent).toContain("다시 열기");
    expect(log.textContent).toContain("지훈");
  });
});
