// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dPushPullSection } from "./StudioBg3dShapesPanelPushPull";

import type { BgPrimitive } from "../studio-background-3d-primitives";
import type { StudioBg3dPushPullAxis, StudioBg3dPushPullFace } from "./studio-bg3d-push-pull";

afterEach(() => {
  cleanup();
});

const BOX: BgPrimitive = {
  id: "box-1",
  kind: "box",
  position: [0, 0.5, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  color: "#c9a876",
};

function Harness({
  updateTransform,
  snapEnabled = false,
  locked = false,
  primitive = BOX,
}: {
  readonly updateTransform: (id: string, patch: unknown, options?: unknown) => void;
  readonly snapEnabled?: boolean;
  readonly locked?: boolean;
  readonly primitive?: BgPrimitive;
}) {
  const [axis, setAxis] = useState<StudioBg3dPushPullAxis>("y");
  const [face, setFace] = useState<StudioBg3dPushPullFace>("positive");
  const [distance, setDistance] = useState(0.5);
  const [feedback, setFeedback] = useState<string | null>(null);
  return (
    <StudioBg3dPushPullSection
      primitive={primitive}
      locked={locked}
      snapSettings={{ enabled: snapEnabled, translateStep: 0.25, rotateStepDegrees: 15, translateAxes: "xyz" }}
      updateTransform={updateTransform}
      axis={axis}
      face={face}
      distance={distance}
      feedback={feedback}
      setAxis={setAxis}
      setFace={setFace}
      setDistance={setDistance}
      setFeedback={setFeedback}
    />
  );
}

function type(value: string) {
  const input = screen.getByLabelText("이동 거리");
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("Push/Pull 길이 직접 입력(VCB)", () => {
  it("단위가 없는 숫자는 m로 읽고 Enter로 바로 적용한다", () => {
    const updateTransform = vi.fn();
    render(<Harness updateTransform={updateTransform} />);
    fireEvent.keyDown(type("0.8"), { key: "Enter" });
    expect(updateTransform).toHaveBeenCalledTimes(1);
    const [id, patch, options] = updateTransform.mock.calls[0] as [string, { scale: number[]; position: number[] }, { snap: boolean }];
    expect(id).toBe("box-1");
    expect(patch.scale[1]).toBeCloseTo(1.8, 9);
    expect(patch.position[1]).toBeCloseTo(0.9, 9);
    expect(options).toEqual({ snap: false });
  });

  it.each([
    ["80cm", 0.8],
    ["1200mm", 1.2],
    ["2.4m", 2.4],
    [`3'6"`, 1.0668],
  ])("%s 를 정확한 길이로 해석해 적용한다", (text, meters) => {
    const updateTransform = vi.fn();
    render(<Harness updateTransform={updateTransform} />);
    fireEvent.click(type(text).closest("div")?.parentElement?.querySelector("button") ?? document.body);
    const patch = updateTransform.mock.calls[0]?.[1] as { scale: number[] };
    expect(patch.scale[1]).toBeCloseTo(1 + meters, 9);
  });

  it("눈금 스냅이 켜져 있어도 직접 입력한 길이는 반올림하지 않는다", () => {
    const updateTransform = vi.fn();
    render(<Harness updateTransform={updateTransform} snapEnabled />);
    expect(screen.getByText(/눈금 스냅 제외/u)).toBeTruthy();
    fireEvent.keyDown(type("0.8"), { key: "Enter" });
    const patch = updateTransform.mock.calls[0]?.[1] as { scale: number[] };
    expect(patch.scale[1]).toBeCloseTo(1.8, 9);
  });

  it("음수는 안쪽으로 당기고 최소 두께 아래로는 거부한다", () => {
    const updateTransform = vi.fn();
    render(<Harness updateTransform={updateTransform} />);
    fireEvent.keyDown(type("-30cm"), { key: "Enter" });
    expect((updateTransform.mock.calls[0]?.[1] as { scale: number[] }).scale[1]).toBeCloseTo(0.7, 9);
    cleanup();
    const second = vi.fn();
    render(<Harness updateTransform={second} />);
    fireEvent.keyDown(type("-2m"), { key: "Enter" });
    // 두께 1m 도형을 2m 당기면 최소 두께(0.01m)에서 멈춘다.
    expect((second.mock.calls[0]?.[1] as { scale: number[] }).scale[1]).toBeCloseTo(0.01, 9);
  });

  it("형식이 틀리면 적용하지 않고 입력창이 이유를 role=alert 로 알린다", () => {
    const updateTransform = vi.fn();
    render(<Harness updateTransform={updateTransform} />);
    fireEvent.keyDown(type("열두자"), { key: "Enter" });
    expect(updateTransform).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent?.length).toBeGreaterThan(5);
    expect(screen.getByLabelText("이동 거리").getAttribute("aria-invalid")).toBe("true");
  });

  it("범위를 넘는 값은 거부한다 (±1000m)", () => {
    const updateTransform = vi.fn();
    render(<Harness updateTransform={updateTransform} />);
    fireEvent.keyDown(type("5000m"), { key: "Enter" });
    expect(updateTransform).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("잠긴 도형은 입력과 적용이 막힌다", () => {
    render(<Harness updateTransform={vi.fn()} locked />);
    expect((screen.getByLabelText("이동 거리") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "적용" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("입력 중 환산 미리보기를 보여 준다", () => {
    render(<Harness updateTransform={vi.fn()} />);
    type("80cm");
    expect(screen.getByTestId("bg3d-length-preview").textContent).toBe("= 0.8 m");
  });

  it("곡면 도형은 기존처럼 비활성 안내만 보인다", () => {
    render(<Harness updateTransform={vi.fn()} primitive={{ ...BOX, kind: "sphere" }} />);
    expect(screen.queryByLabelText("이동 거리")).toBeNull();
    expect(screen.getByText(/곡면·테이퍼 도형/u)).toBeTruthy();
  });
});
