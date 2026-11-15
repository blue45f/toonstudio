// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useStudioPerSurfaceSelectionContinuity } from "./useStudioPerSurfaceSelectionContinuity";

interface PageFixture {
  readonly id: string;
  readonly elements: readonly { readonly id: string }[];
}

function Harness({
  documentScopeKey,
  pages,
}: {
  readonly documentScopeKey: string;
  readonly pages: readonly PageFixture[];
}) {
  const [activePageId, setActivePageId] = useState(pages[0]!.id);
  const [pagesHi, setPagesHi] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [marqueeIds, setMarqueeIds] = useState<string[]>([]);
  const [, setActiveGroupId] = useState<string | null>(null);

  const selectedIdRef = useRef<string | null>(null);
  const marqueeIdsRef = useRef<string[]>([]);
  const activeGroupIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  marqueeIdsRef.current = marqueeIds;

  const activeElements =
    pages.find((page) => page.id === activePageId)?.elements ?? [];
  const activeElementsRef = useRef(activeElements);
  activeElementsRef.current = activeElements;
  const pendingStrokeCommitsRef = useRef(null);

  useStudioPerSurfaceSelectionContinuity({
    documentScopeKey,
    activePageId,
    masterEditMode: false,
    pagesHi,
    selectedId,
    marqueeIds,
    activeElementsRef,
    pendingStrokeCommitsRef,
    selectedIdRef,
    marqueeIdsRef,
    activeGroupIdRef,
    setSelectedId,
    setMarqueeIds,
    setActiveGroupId,
  });

  return (
    <div>
      <button
        type="button"
        data-testid="select-cut1-stroke"
        onClick={() => {
          selectedIdRef.current = "stroke-cut-1";
          setSelectedId("stroke-cut-1");
        }}
      />
      <button
        type="button"
        data-testid="deselect"
        onClick={() => {
          selectedIdRef.current = null;
          setSelectedId(null);
        }}
      />
      <button
        type="button"
        data-testid="go-cut-2"
        onClick={() => setActivePageId("cut-2")}
      />
      <button
        type="button"
        data-testid="jump-cut-2-bubble"
        onClick={() => {
          selectedIdRef.current = "bubble-cut-2";
          setSelectedId("bubble-cut-2");
          setActivePageId("cut-2");
        }}
      />
      <button
        type="button"
        data-testid="go-cut-1"
        onClick={() => setActivePageId("cut-1")}
      />
      <button
        type="button"
        data-testid="bump-history"
        onClick={() => setPagesHi((prev) => prev + 1)}
      />
      <output data-testid="state">
        {JSON.stringify({ activePageId, selectedId, marqueeIds })}
      </output>
    </div>
  );
}

afterEach(() => {
  cleanup();
});

const TWO_CUTS: readonly PageFixture[] = [
  { id: "cut-1", elements: [{ id: "frame-cut-1" }, { id: "stroke-cut-1" }] },
  { id: "cut-2", elements: [{ id: "frame-cut-2" }, { id: "bubble-cut-2" }] },
];

describe("useStudioPerSurfaceSelectionContinuity", () => {
  it("첫 컷에서 선택한 활성 레이어를 다른 컷 이동 후 같은 첫 컷으로 복귀할 때 복원한다", () => {
    render(<Harness documentScopeKey="doc-a" pages={TWO_CUTS} />);

    act(() => {
      screen.getByTestId("select-cut1-stroke").click();
    });
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({
      activePageId: "cut-1",
      selectedId: "stroke-cut-1",
      marqueeIds: [],
    });

    act(() => {
      screen.getByTestId("go-cut-2").click();
    });
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({
      activePageId: "cut-2",
      selectedId: null,
      marqueeIds: [],
    });

    act(() => {
      screen.getByTestId("go-cut-1").click();
    });
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({
      activePageId: "cut-1",
      selectedId: "stroke-cut-1",
      marqueeIds: [],
    });
  });

  it("같은 컷에서 명시적으로 선택 해제하면 다시 돌아와도 해제 상태를 유지한다", () => {
    render(<Harness documentScopeKey="doc-a" pages={TWO_CUTS} />);

    act(() => {
      screen.getByTestId("select-cut1-stroke").click();
    });
    act(() => {
      screen.getByTestId("deselect").click();
    });
    act(() => {
      screen.getByTestId("go-cut-2").click();
    });
    act(() => {
      screen.getByTestId("go-cut-1").click();
    });

    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({
      activePageId: "cut-1",
      selectedId: null,
      marqueeIds: [],
    });
  });

  it("대상 요소 점프와 함께 컷을 이동하면 새 컷의 명시 선택을 보존하고 새 문서 스코프에는 누출하지 않는다", () => {
    const view = render(<Harness documentScopeKey="doc-a" pages={TWO_CUTS} />);

    act(() => {
      screen.getByTestId("select-cut1-stroke").click();
    });
    act(() => {
      screen.getByTestId("jump-cut-2-bubble").click();
    });
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({
      activePageId: "cut-2",
      selectedId: "bubble-cut-2",
      marqueeIds: [],
    });

    // 새 문서 스코프로 전환된 뒤 요소가 비어 있는 상태를 시뮬레이션하면 이전 문서 기억이 초기화된다.
    view.rerender(
      <Harness
        documentScopeKey="doc-b"
        pages={[{ id: "cut-1", elements: [{ id: "frame-cut-1" }] }, TWO_CUTS[1]!]}
      />,
    );
    act(() => {
      screen.getByTestId("go-cut-1").click();
    });
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({
      activePageId: "cut-1",
      selectedId: null,
      marqueeIds: [],
    });
  });
});
