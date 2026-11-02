// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { smallBoardFixture } from "./board/board-fixtures";
import { flushBoardGestureTimers } from "./board/board-test-utils";
import { ProductionWorkBoard } from "./ProductionWorkBoard";

/** 실제 Router 전환의 commit만 보류한다. 검색 input이나 제품의 setter는 모의하지 않는다. */
function queryCommitGate() {
  let released = false;
  const pending = new Map<string, { promise: Promise<void>; complete: () => void }>();
  const releasedQueries = new Set<string>();
  const blockedQueries: string[] = [];
  return {
    blockedQueries,
    read(query: string) {
      if (!released && !releasedQueries.has(query) && query !== "") {
        blockedQueries.push(query);
        let entry = pending.get(query);
        if (!entry) {
          let complete: () => void = () => undefined;
          const promise = new Promise<void>((resolve) => { complete = resolve; });
          entry = { promise, complete }; pending.set(query, entry);
        }
        throw entry.promise;
      }
    },
    releaseQuery(query: string) { releasedQueries.add(query); pending.get(query)?.complete(); },
    release() { released = true; for (const entry of pending.values()) entry.complete(); },
  };
}

type QueryCommitGate = ReturnType<typeof queryCommitGate>;

function CommittedUrl({ gate }: { readonly gate: QueryCommitGate }) {
  const location = useLocation();
  const navigate = useNavigate();
  gate.read(new URLSearchParams(location.search).get("boardQuery") ?? "");
  return <>
    <output data-testid="committed-board-search-url">{location.search}</output>
    <button type="button" onClick={() => {
      const next = new URLSearchParams(location.search);
      next.delete("boardQuery");
      navigate({ pathname: location.pathname, search: next.toString() });
    }}>외부 URL에서 검색 초기화</button>
  </>;
}

function mountTransitionBoard(gate: QueryCommitGate, search = "?boardQuery=&untouched=keep") {
  const execute = vi.fn(async () => undefined);
  render(
    <MemoryRouter initialEntries={[`/production/projects/search-fixture${search}`]}>
      <Suspense fallback={<p data-testid="board-query-fallback">검색 전환 중</p>}>
        <ProductionWorkBoard aggregate={smallBoardFixture()} canEdit canManage execute={execute} persistOrder={false} />
        <CommittedUrl gate={gate} />
      </Suspense>
    </MemoryRouter>,
  );
  return execute;
}

function searchInput() {
  const input = screen.getByRole("textbox", { name: "작업 검색" });
  if (!(input instanceof HTMLInputElement)) throw new Error("검색 입력이 없습니다.");
  return input;
}

function committedParams() {
  return new URLSearchParams(screen.getByTestId("committed-board-search-url").textContent ?? "");
}

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  await flushBoardGestureTimers();
});

describe("제작 보드 검색의 Router 전환 경합", () => {
  it("URL 전환 commit이 지연돼도 각 키 입력을 보존하고 최종 URL과 카드 결과를 일치시킨다", async () => {
    const gate = queryCommitGate();
    const execute = mountTransitionBoard(gate);
    const input = searchInput(); input.focus();
    const query = "콘티";
    let expected = "";
    try {
      for (const character of query) {
        expected += character;
        // 완성 문자열을 직접 넣지 않는다. 실제 다음 키처럼 현재 DOM 입력 뒤에 덧붙인다.
        await act(async () => { fireEvent.change(input, { target: { value: input.value + character } }); });
        expect(input.value).toBe(expected);
        expect(input.getAttribute("aria-busy")).toBe("true");
        expect(input.disabled).toBe(false);
        expect(document.activeElement).toBe(input);
        expect(gate.blockedQueries).toContain(expected);
        expect(committedParams().get("boardQuery")).toBe("");
        expect(screen.queryByTestId("board-query-fallback")).toBeNull();
      }
      await act(async () => { gate.release(); });
      await waitFor(() => expect(committedParams().get("boardQuery")).toBe(query));
      expect(input.value).toBe(query);
      expect(input.getAttribute("aria-busy")).toBe("false");
      expect(committedParams().get("untouched")).toBe("keep");
      expect(screen.getByTestId("production-card-board-ready")).toBeTruthy();
      expect(screen.queryByTestId("production-card-board-draft")).toBeNull();
      expect(execute).not.toHaveBeenCalled();
    } finally {
      // 실패한 회귀에서도 보류된 실제 Router 작업을 남기지 않는다.
      await act(async () => { gate.release(); });
    }
  });

  it("입력창 밖의 URL 탐색으로 검색을 초기화하면 입력과 카드 결과도 함께 초기화한다", async () => {
    const gate = queryCommitGate(); gate.release();
    const execute = mountTransitionBoard(gate, `?boardQuery=${encodeURIComponent("콘티")}&untouched=keep`);
    const input = searchInput();
    expect(input.value).toBe("콘티");
    expect(screen.getByTestId("production-card-board-ready")).toBeTruthy();
    expect(screen.queryByTestId("production-card-board-draft")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "외부 URL에서 검색 초기화", exact: true }));
    await waitFor(() => expect(committedParams().has("boardQuery")).toBe(false));
    await waitFor(() => expect(input.value).toBe(""));
    expect(committedParams().get("untouched")).toBe("keep");
    expect(screen.getByTestId("production-card-board-ready")).toBeTruthy();
    expect(screen.getByTestId("production-card-board-draft")).toBeTruthy();
    expect(execute).not.toHaveBeenCalled();
  });

  for (const clearName of ["필터 초기화", "외부 URL에서 검색 초기화"]) {
    it(`URL 전환이 끝나기 전 ${clearName}도 초안을 지우고 이전 요청이 다시 적용되지 않는다`, async () => {
      const gate = queryCommitGate();
      const execute = mountTransitionBoard(gate);
      const input = searchInput(); input.focus();
      try {
        for (const character of "콘티") {
          await act(async () => { fireEvent.change(input, { target: { value: input.value + character } }); });
        }
        expect(input.value).toBe("콘티");
        expect(committedParams().get("boardQuery")).toBe("");
        fireEvent.click(screen.getByRole("button", { name: clearName, exact: true }));
        await waitFor(() => expect(input.value).toBe(""));
        await act(async () => { gate.release(); });
        expect(input.value).toBe("");
        expect(committedParams().has("boardQuery")).toBe(false);
        expect(committedParams().get("untouched")).toBe("keep");
        expect(screen.getByTestId("production-card-board-ready")).toBeTruthy();
        expect(screen.getByTestId("production-card-board-draft")).toBeTruthy();
        expect(execute).not.toHaveBeenCalled();
      } finally { await act(async () => { gate.release(); }); }
    });
  }

  it("이전 검색 전환만 먼저 풀려도 최신 입력과 포커스를 유지한다", async () => {
    const gate = queryCommitGate();
    mountTransitionBoard(gate);
    const input = searchInput(); input.focus();
    try {
      for (const character of "콘티") {
        await act(async () => { fireEvent.change(input, { target: { value: input.value + character } }); });
      }
      await act(async () => { gate.releaseQuery("콘"); });
      expect(input.value).toBe("콘티");
      expect(document.activeElement).toBe(input);
      expect(committedParams().get("boardQuery")).toBe("");
      await act(async () => { gate.releaseQuery("콘티"); });
      await waitFor(() => expect(committedParams().get("boardQuery")).toBe("콘티"));
      expect(input.value).toBe("콘티");
    } finally { await act(async () => { gate.release(); }); }
  });
});
