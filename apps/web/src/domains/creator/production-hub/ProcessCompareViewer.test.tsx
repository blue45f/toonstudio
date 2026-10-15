// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProcessCompareViewer } from "./ProcessCompareViewer";
import { ProcessComparePaneEmptyArt } from "./process-compare-empty-art";
import { buildProcessCompareItems } from "./process-compare-model";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PROCESSES = [
  {
    id: "p-storyboard",
    label: "콘티",
    kind: "image" as const,
    revisions: [
      { id: "r1", createdAt: "2026-09-20T00:00:00Z" },
      { id: "r2", createdAt: "2026-09-21T00:00:00Z" },
    ],
  },
  {
    id: "p-line",
    label: "선화",
    kind: "image" as const,
    revisions: [{ id: "r3", createdAt: "2026-09-22T00:00:00Z" }],
  },
  {
    id: "p-color",
    label: "채색",
    kind: "image" as const,
    revisions: [{ id: "r4", createdAt: "2026-09-23T00:00:00Z" }],
  },
];

function renderViewer() {
  const items = buildProcessCompareItems(PROCESSES, () => null);
  render(<ProcessCompareViewer items={items} />);
  return items;
}

describe("ProcessCompareViewer", () => {
  it("기본 2개 페인을 렌더한다", () => {
    renderViewer();
    expect(screen.getByTestId("pcv-root")).toBeTruthy();
    expect(screen.getByTestId("pcv-viewport-1")).toBeTruthy();
    expect(screen.getByTestId("pcv-viewport-2")).toBeTruthy();
  });

  it("항목이 2개 미만이면 안내 메시지를 보여준다", () => {
    const items = buildProcessCompareItems([PROCESSES[1]], () => null);
    expect(items).toHaveLength(1);
    render(<ProcessCompareViewer items={items} />);
    // 비교 소스는 공정 버전뿐 아니라 지난 회차·레퍼런스·외부 이미지까지 넓어졌다.
    expect(screen.getByText("비교할 소스가 2개 이상 필요합니다")).toBeTruthy();
  });

  it("항목이 2개 미만이면 일러스트·다음 행동 가이드를 보여준다", () => {
    const items = buildProcessCompareItems([PROCESSES[1]], () => null);
    const { container } = render(<ProcessCompareViewer items={items} onClose={() => {}} />);
    expect(container.querySelector(".pcv-empty-art")).toBeTruthy();
    // 다음 행동 안내: 소스 2개를 채우는 두 길(풀에 쌓기·외부 이미지 추가)을 알려 준다.
    expect(screen.getByText(/버전·지난 회차·레퍼런스 중 2개 이상이 풀에 있거나.*외부 이미지를 추가하면 바로 나란히 비교/)).toBeTruthy();
    // 핵심 액션 1개: 닫기
    expect(screen.getByRole("button", { name: "닫기" })).toBeTruthy();
  });

  it("페인이 바라보던 소스가 풀에서 사라지면 빈 페인 대신 남은 소스로 다시 맞춘다", () => {
    const items = buildProcessCompareItems(PROCESSES, () => null);
    const { container, rerender } = render(<ProcessCompareViewer items={items} />);
    const pickerLabel = "이 페인에 표시할 공정과 버전 선택";
    // 기본 페인은 서로 다른 공정의 최신 리비전이다(선화·채색).
    expect(screen.getAllByLabelText<HTMLSelectElement>(pickerLabel).map((picker) => picker.value))
      .toEqual(["p-line::r3", "p-color::r4"]);
    // 페인이 바라보던 공정이 사라져도 풀에 비교 가능한 소스가 남아 있으면 기본 구성으로 다시 맞춘다.
    const fewer = buildProcessCompareItems([PROCESSES[0]], () => null);
    rerender(<ProcessCompareViewer items={fewer} />);
    expect(screen.getAllByLabelText<HTMLSelectElement>(pickerLabel).map((picker) => picker.value))
      .toEqual(["p-storyboard::r2"]);
    expect(container.querySelectorAll(".pcv-empty-art-sm")).toHaveLength(0);
    expect(screen.queryByText("위에서 공정과 버전을 선택하세요")).toBeNull();
  });

  it("풀이 2개 미만으로 줄면 페인 대신 풀 단위 안내로 바뀐다", () => {
    const items = buildProcessCompareItems(PROCESSES, () => null);
    const { container, rerender } = render(<ProcessCompareViewer items={items} />);
    expect(screen.getByTestId("pcv-viewport-1")).toBeTruthy();
    rerender(<ProcessCompareViewer items={buildProcessCompareItems([PROCESSES[1]], () => null)} />);
    expect(screen.queryByTestId("pcv-viewport-1")).toBeNull();
    expect(container.querySelector(".pcv-empty-art")).toBeTruthy();
    expect(screen.getByText("비교할 소스가 2개 이상 필요합니다")).toBeTruthy();
  });

  it("빈 페인 일러스트는 위쪽 피커를 가리키는 장식용 SVG다", () => {
    const { container } = render(<ProcessComparePaneEmptyArt />);
    const art = container.querySelector("svg.pcv-empty-art.pcv-empty-art-sm");
    expect(art).toBeTruthy();
    // 안내 문구는 페인이 텍스트로 따로 주므로 일러스트는 보조기기에서 숨긴다.
    expect(art?.getAttribute("aria-hidden")).toBe("true");
  });

  it("페인 개수를 3·4로 바꿀 수 있다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getByTestId("pcv-viewport-3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    // 항목은 3개 공정뿐이라 3개 페인까지만 채워진다
    expect(screen.queryByTestId("pcv-viewport-4")).not.toBeTruthy();
  });

  it("비교 방식을 슬라이더로 전환한다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "비포·애프터" }));
    expect(screen.getByTestId("pcv-slider-stage")).toBeTruthy();
    expect(screen.getByTestId("pcv-slider-handle")).toBeTruthy();
    expect(screen.getByTestId("pcv-hint").textContent ?? "").toContain("가운데 핸들을 잡고 드래그하세요");
  });

  it("슬라이더 핸들은 키보드로 조작할 수 있다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "비포·애프터" }));
    const handle = screen.getByTestId("pcv-slider-handle");
    expect(handle.getAttribute("role")).toBe("slider");
    expect(handle.getAttribute("aria-valuenow")).toBe("50");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle.getAttribute("aria-valuenow")).toBe("52");
    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    expect(handle.getAttribute("aria-valuenow")).toBe("42");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle.getAttribute("aria-valuenow")).toBe("0");
    fireEvent.keyDown(handle, { key: "End" });
    expect(handle.getAttribute("aria-valuenow")).toBe("100");
  });

  it("비교 방식을 깜빡임으로 전환한다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "깜빡임 비교" }));
    expect(screen.getByTestId("pcv-blink-stage")).toBeTruthy();
    expect(screen.getByTestId("pcv-blink-a")).toBeTruthy();
    expect(screen.getByTestId("pcv-blink-b")).toBeTruthy();
  });

  it("배율·이동 잠금 토글 버튼이 있다", () => {
    renderViewer();
    // 잠금은 기본으로 켜져 있고(공유 뷰포트+스크롤 동기), 버튼으로 항상 상태가 보인다.
    const toggle = screen.getByRole("button", { name: "배율·이동 잠금" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("줌 컨트롤이 동작한다", () => {
    renderViewer();
    const zoomVal = screen.getByTestId("pcv-zoomval");
    expect(zoomVal.textContent).toBe("100%");
    fireEvent.click(screen.getByRole("button", { name: "확대" }));
    expect(zoomVal.textContent).toBe("125%");
    fireEvent.click(screen.getByRole("button", { name: "축소" }));
    fireEvent.click(screen.getByRole("button", { name: "축소" }));
    expect(zoomVal.textContent).toBe("75%");
  });

  it("페인별 공정·버전을 선택할 수 있다", () => {
    renderViewer();
    const pickers = screen.getAllByLabelText("이 페인에 표시할 공정과 버전 선택");
    expect(pickers).toHaveLength(2);
    // 첫 페인을 콘티 v1으로 변경
    fireEvent.change(pickers[0], { target: { value: "p-storyboard::r1" } });
    expect(screen.getAllByText("콘티 · v1").length).toBeGreaterThan(0);
  });

  it("이미지가 없으면 플레이스홀더 아트를 사용한다", () => {
    renderViewer();
    const images = screen.getAllByRole("img");
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img.getAttribute("src") ?? "").toContain("data:image/svg+xml,");
    }
  });

  it("비교 방식을 바꾸면 live region에 안내한다", () => {
    renderViewer();
    const live = screen.getByTestId("pcv-live");
    expect(live.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "비포·애프터" }));
    expect(live.textContent).toBe("비포·애프터");
    fireEvent.click(screen.getByRole("button", { name: "깜빡임 비교" }));
    expect(live.textContent).toBe("깜빡임 비교");
  });

  it("슬라이더 드래그 중에는 핸들에 data-dragging이 표시된다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "비포·애프터" }));
    const stage = screen.getByTestId("pcv-slider-stage");
    const handle = screen.getByTestId("pcv-slider-handle");
    expect(handle.getAttribute("data-dragging")).toBe("false");
    fireEvent.pointerDown(stage, { clientX: 100, pointerId: 1 });
    expect(handle.getAttribute("data-dragging")).toBe("true");
    fireEvent.pointerUp(stage);
    expect(handle.getAttribute("data-dragging")).toBe("false");
  });

  it("깜빡임 모드에서 수동 전환 버튼이 있다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "깜빡임 비교" }));
    expect(screen.getByRole("button", { name: "수동 전환" })).toBeTruthy();
    expect(screen.getByLabelText("깜빡임 주기")).toBeTruthy();
  });

  it("깜빡임 주기 설정은 고급 설정으로 접혀 있다", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: "깜빡임 비교" }));
    const details = screen.getByText("고급 설정").closest("details");
    expect(details).toBeTruthy();
    expect(details?.hasAttribute("open")).toBe(false);
    // 접힌 상태에서도 설정값은 유지된다
    expect(screen.getByLabelText("깜빡임 주기")).toBeTruthy();
  });
});
