// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExploreResultsControls } from "./ExploreResultsControls";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
afterEach(cleanup);

function Controls({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  return <ExploreResultsControls query={query} onQueryChange={setQuery} density={density} onDensityChange={setDensity} />;
}
function disclosure() {
  const element = screen.getByText("결과 내 검색·표시").closest("details");
  const summary = element?.querySelector("summary");
  if (!element || !summary) throw new Error("결과 도구 details와 summary가 필요합니다.");
  return { element, summary };
}
async function openControls() {
  const { element, summary } = disclosure();
  if (!element.open) fireEvent.click(summary);
  await waitFor(() => expect(element.open).toBe(true));
  return { element, summary };
}

describe("탐색 결과 보조 도구", () => {
  it("기본 진입은 접혀 있고 검색 URL 진입은 펼쳐져 현재 검색어를 표시한다", () => {
    const view = render(<Controls />);
    expect(disclosure().element.open).toBe(false);
    view.unmount();
    render(<Controls initialQuery="밤" />);
    expect(disclosure().element.open).toBe(true);
    expect(disclosure().summary.textContent).toContain("‘밤’");
    expect(screen.getByRole("searchbox").getAttribute("value")).toBe("밤");
  });

  it("접었다 펴도 검색어와 조밀 선택을 보존하고 닫힌 요약에서도 알린다", async () => {
    render(<Controls />);
    const { element, summary } = await openControls();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "태그" } });
    fireEvent.click(screen.getByRole("button", { name: "조밀" }));
    for (let count = 0; count < 3; count += 1) {
      fireEvent.click(summary);
      await waitFor(() => expect(element.open).toBe(false));
      expect(summary.textContent).toContain("‘태그’");
      expect(summary.textContent).toContain("조밀");
      fireEvent.click(summary);
      await waitFor(() => expect(element.open).toBe(true));
    }
    expect(screen.getByRole("searchbox").getAttribute("value")).toBe("태그");
    expect(screen.getByRole("button", { name: "조밀" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "표준" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("검색어 지우기는 도구를 닫지 않고 입력에 초점을 돌려준다", async () => {
    render(<Controls initialQuery="초기 검색" />);
    const input = screen.getByRole("searchbox");
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect(input.getAttribute("value")).toBe("");
    expect(document.activeElement).toBe(input);
    expect(disclosure().element.open).toBe(true);
    expect(screen.queryByRole("button", { name: "검색어 지우기" })).toBeNull();
  });

  it("Escape는 검색을 유지한 채 닫고 요약에 초점을 돌려준다", async () => {
    render(<Controls initialQuery="검색 유지" />);
    const input = screen.getByRole("searchbox");
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(disclosure().element.open).toBe(false));
    expect(document.activeElement).toBe(disclosure().summary);
    await openControls();
    expect(screen.getByRole("searchbox").getAttribute("value")).toBe("검색 유지");
  });

  it("한글 조합 중 Escape는 도구를 닫지 않는다", () => {
    render(<Controls initialQuery="한" />);
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape", isComposing: true });
    expect(disclosure().element.open).toBe(true);
  });

  it("닫힌 상태에서 외부 검색값이 변경돼도 적용값은 요약에 반영한다", () => {
    const onQueryChange = vi.fn();
    const onDensityChange = vi.fn();
    const view = render(<ExploreResultsControls query="" onQueryChange={onQueryChange} density="comfortable" onDensityChange={onDensityChange} />);
    view.rerender(<ExploreResultsControls query="뒤로 가기 검색" onQueryChange={onQueryChange} density="comfortable" onDensityChange={onDensityChange} />);
    expect(disclosure().element.open).toBe(false);
    expect(disclosure().summary.textContent).toContain("‘뒤로 가기 검색’");
    expect(onQueryChange).not.toHaveBeenCalled();
  });
});
