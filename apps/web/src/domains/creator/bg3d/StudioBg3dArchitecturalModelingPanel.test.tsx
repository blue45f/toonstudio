// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import { StudioBg3dArchitecturalModelingPanel } from "./StudioBg3dArchitecturalModelingPanel";

describe("StudioBg3dArchitecturalModelingPanel", () => {
  afterEach(cleanup);

  it("입력한 치수·단수·배치 위치를 실제 삽입 명령으로 전달하고 성공 후에만 완료를 표시한다", () => {
    const insert = vi.fn((_primitives: readonly BgPrimitive[], _label: string) => true);
    const onStatusChange = vi.fn();
    const { container } = render(<StudioBg3dArchitecturalModelingPanel
      onInsertScenePrimitives={insert} onStatusChange={onStatusChange} />);

    // 번역이 없어도 기본 한글 문구와 연결된 레이블이 남아야 한다.
    expect(screen.getByRole("heading", { name: "배경 건축 도구" })).toBeTruthy();
    expect(container.textContent).not.toContain("studio.bg3d.architecture.");
    expect(screen.getByTestId("bg3d-architecture-status").textContent).not.toContain("배치했습니다");
    fireEvent.change(screen.getByLabelText("가로 (m)"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("높이 (m)"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("깊이 (m)"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("배치 X (m)"), { target: { value: "-3" } });
    fireEvent.change(screen.getByLabelText("배치 Y (m)"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("배치 Z (m)"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("건축 컴포넌트 분할 수"), { target: { value: "6" } });
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-insert-scene-btn"));

    expect(insert).toHaveBeenCalledTimes(1);
    const primitives = insert.mock.calls[0]?.[0];
    expect(primitives).toHaveLength(6);
    expect(primitives?.[0]).toMatchObject({ position: [-3, 2.5, 0], scale: [4, 1, 1.4] });
    expect(onStatusChange).toHaveBeenCalledWith("직선형 계단 6개 요소를 현재 3D 장면에 배치했습니다.");
  });

  it.each(["", "0.7", "25", "Infinity"])("유효하지 않은 가로 입력 %s을 기본값이나 제한값으로 바꿔 배치하지 않는다", (value) => {
    const insert = vi.fn(() => true);
    render(<StudioBg3dArchitecturalModelingPanel onInsertScenePrimitives={insert} />);
    fireEvent.change(screen.getByLabelText("가로 (m)"), { target: { value } });

    expect(screen.getByRole("alert").textContent).toContain("0.8~24");
    expect(screen.getByLabelText("가로 (m)").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByTestId("spatial-modeler-arch-insert-scene-btn").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-insert-scene-btn"));
    expect(insert).not.toHaveBeenCalled();
  });

  it("배치 위치가 범위를 벗어나면 장면 명령을 실행하지 않는다", () => {
    const insert = vi.fn(() => true);
    render(<StudioBg3dArchitecturalModelingPanel onInsertScenePrimitives={insert} />);
    fireEvent.change(screen.getByLabelText("배치 Z (m)"), { target: { value: "1001" } });
    expect(screen.getByRole("alert").textContent).toContain("-1000~1000");
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-insert-scene-btn"));
    expect(insert).not.toHaveBeenCalled();
  });

  it.each(["거부", "예외"])("장면 명령 %s 시 실패만 안내하고 배치 성공으로 보고하지 않는다", (mode) => {
    const insert = vi.fn(() => {
      if (mode === "예외") throw new Error("장면 쓰기 실패");
      return false;
    });
    const onStatusChange = vi.fn();
    render(<StudioBg3dArchitecturalModelingPanel onInsertScenePrimitives={insert} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-insert-scene-btn"));
    expect(insert).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("bg3d-architecture-status").textContent).toContain("배치하지 못했습니다");
    expect(onStatusChange.mock.calls[0]?.[0]).not.toContain("배치했습니다");
  });

  it("실제 장면 연결이 없거나 편집이 잠겼을 때 배치 버튼을 비활성화한다", () => {
    const { rerender } = render(<StudioBg3dArchitecturalModelingPanel />);
    expect(screen.getByTestId("spatial-modeler-arch-insert-scene-btn").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("3D 배경 편집기에서 장면을 열면 건축 요소를 배치할 수 있습니다.")).toBeTruthy();
    const insert = vi.fn(() => true);
    rerender(<StudioBg3dArchitecturalModelingPanel disabled onInsertScenePrimitives={insert} />);
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-insert-scene-btn"));
    expect(insert).not.toHaveBeenCalled();
  });

  it("9종 건축 요소를 선택해 각각 실제 장면 삽입 명령으로 보낸다", () => {
    const insert = vi.fn((_primitives: readonly BgPrimitive[], _label: string) => true);
    render(<StudioBg3dArchitecturalModelingPanel onInsertScenePrimitives={insert} />);
    const kinds = ["staircase-straight", "staircase-l-landing", "staircase-spiral", "roof-gable", "roof-hip",
      "roof-hanok", "window-bay", "door-arch", "street-colonnade"];
    for (const kind of kinds) {
      fireEvent.click(screen.getByTestId(`spatial-modeler-arch-kind-${kind}`));
      expect(screen.getByTestId(`spatial-modeler-arch-kind-${kind}`).getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(screen.getByTestId("spatial-modeler-arch-insert-scene-btn"));
    }
    expect(insert).toHaveBeenCalledTimes(9);
    expect(insert.mock.calls.every(([primitives]) => primitives.length > 0
      && primitives.every((primitive) => [...primitive.position, ...primitive.scale].every(Number.isFinite)))).toBe(true);
  });

  it("나선 계단의 미사용 깊이는 비활성화하고 이전의 잘못된 깊이 입력이 배치를 막지 않는다", () => {
    const insert = vi.fn((_primitives: readonly BgPrimitive[], _label: string) => true);
    render(<StudioBg3dArchitecturalModelingPanel onInsertScenePrimitives={insert} />);
    fireEvent.change(screen.getByLabelText("깊이 (m)"), { target: { value: "" } });
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-kind-staircase-spiral"));

    expect(screen.getByLabelText("깊이 (m)").hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("나선형 계단은 가로를 기준으로 원형 배치하므로 깊이 입력을 사용하지 않습니다.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("spatial-modeler-arch-insert-scene-btn").hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-insert-scene-btn"));
    const primitives = insert.mock.calls[0]?.[0];
    expect(primitives).toHaveLength(9);
    expect(primitives?.every((primitive) => [...primitive.position, ...primitive.scale].every(Number.isFinite))).toBe(true);

    fireEvent.click(screen.getByTestId("spatial-modeler-arch-kind-staircase-straight"));
    expect(screen.getByLabelText("깊이 (m)").hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("alert").textContent).toContain("깊이 (m)");
    expect(screen.getByTestId("spatial-modeler-arch-insert-scene-btn").hasAttribute("disabled")).toBe(true);
  });

  it("지붕·창호의 미사용 분할 수를 끄고 계단·회랑으로 돌아오면 이전 값을 유지한다", () => {
    const insert = vi.fn((_primitives: readonly BgPrimitive[], _label: string) => true);
    render(<StudioBg3dArchitecturalModelingPanel onInsertScenePrimitives={insert} />);
    expect(screen.getByText("치수는 기본 부품과 배치 간격의 기준입니다. 처마·회전 계단을 포함한 전체 외곽 크기는 입력값과 다를 수 있습니다.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("건축 컴포넌트 분할 수"), { target: { value: "11" } });
    for (const kind of ["roof-gable", "roof-hip", "roof-hanok", "window-bay", "door-arch"]) {
      fireEvent.click(screen.getByTestId(`spatial-modeler-arch-kind-${kind}`));
      expect(screen.getByLabelText("건축 컴포넌트 분할 수").hasAttribute("disabled")).toBe(true);
    }
    expect(screen.getByText("분할 수는 계단 단수와 열주 회랑 경간에만 사용합니다. 선택한 건축 요소에는 적용하지 않습니다.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-kind-street-colonnade"));
    expect(screen.getByLabelText("건축 컴포넌트 분할 수").hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByTestId("spatial-modeler-arch-insert-scene-btn"));
    expect(insert.mock.calls[0]?.[0]).toHaveLength(22);
  });
});
