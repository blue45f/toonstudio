// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { StudioHistoryPanel } from "../StudioHistoryPanel";

import type { HistorySnapshot } from "../studio-history-labels";

beforeAll(() => {
  // jsdom 에는 scrollIntoView 가 없다. 패널은 현재 단계가 보이게 따라가려고 부른다.
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(cleanup);

const HISTORY: readonly HistorySnapshot[] = [
  [{ id: "page-1", elements: [] }],
  [{ id: "page-1", elements: [{ id: "text-1", type: "text", text: "안녕", x: 10, y: 10, width: 100, height: 40 }] }],
];

/** 실제 편집기처럼 단추로 열고 onClose 로 닫는 최소 호스트. */
function Host({ extra }: { extra?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        작업 내역 열기
      </button>
      {extra ? <button type="button">다른 단추</button> : null}
      {open ? (
        <StudioHistoryPanel
          history={HISTORY}
          currentIndex={1}
          onJumpTo={() => undefined}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

describe("StudioHistoryPanel 포커스", () => {
  it("열면 현재 단계로 포커스가 들어오고, Esc 로 닫으면 여는 단추로 돌아온다", () => {
    render(<Host />);
    const opener = screen.getByRole("button", { name: "작업 내역 열기" });
    opener.focus();
    fireEvent.click(opener);

    const panel = screen.getByRole("region", { name: "작업 내역" });
    expect(panel.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "작업 내역" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("닫기 단추로 닫아도 여는 단추로 돌아온다", () => {
    render(<Host />);
    const opener = screen.getByRole("button", { name: "작업 내역 열기" });
    opener.focus();
    fireEvent.click(opener);

    fireEvent.click(screen.getByRole("button", { name: "작업 내역 닫기" }));
    expect(screen.queryByRole("region", { name: "작업 내역" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("개발 모드(StrictMode)가 효과를 두 번 돌려도 여는 단추를 기억해 돌아온다", () => {
    // 개발 서버는 효과를 마운트→정리→마운트로 실행한다. 두 번째 마운트 때는 포커스가 이미 패널 안(곧 사라질 단계 단추)이라
    // 그때 읽은 값을 여는 단추로 믿으면 닫은 뒤 포커스가 문서 본문으로 떨어진다(브라우저 점검이 잡은 결함).
    render(
      <StrictMode>
        <Host />
      </StrictMode>,
    );
    const opener = screen.getByRole("button", { name: "작업 내역 열기" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("region", { name: "작업 내역" }).contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "작업 내역" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("닫는 순간 포커스가 이미 패널 밖의 다른 단추에 가 있으면 그 선택을 존중한다", () => {
    render(<Host extra />);
    const opener = screen.getByRole("button", { name: "작업 내역 열기" });
    opener.focus();
    fireEvent.click(opener);

    const other = screen.getByRole("button", { name: "다른 단추" });
    other.focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "작업 내역" })).toBeNull();
    expect(document.activeElement).toBe(other);
  });
});
