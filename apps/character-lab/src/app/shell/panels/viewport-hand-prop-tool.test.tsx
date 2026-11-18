// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createMockEngine } from "../../../testing/mock-engine";

import { ViewportHandPropTool } from "./viewport-hand-prop-tool";

import type { LabCommand, Pose } from "../../../contracts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("부모 갱신 중 소품 선택과 대기 상태를 유지하고 실패 후 재시도·그립 포즈에 최신 포즈를 사용한다", async () => {
  const engine = createMockEngine();
  let rejectInstall: ((reason: Error) => void) | undefined;
  vi.spyOn(engine, "setHandProp").mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
    rejectInstall = reject;
  }));
  const onNotice = vi.fn<(notice: string) => void>();
  const commands: LabCommand[] = [];
  const dispatch = (command: LabCommand): void => { commands.push(command); };
  const view = render(<ViewportHandPropTool engine={engine} pose={{}} dispatch={dispatch} onNotice={onNotice} />);
  const select = screen.getByTestId("viewport-hand-prop-select") as HTMLSelectElement;

  fireEvent.change(select, { target: { value: "coffee-cup" } });
  expect(select.disabled).toBe(true);

  const latestPose: Pose = { head: [0, 0, 0, 1] };
  view.rerender(<ViewportHandPropTool engine={engine} pose={latestPose} dispatch={dispatch} onNotice={onNotice} />);
  expect(select.value).toBe("coffee-cup");
  expect(select.disabled).toBe(true);

  await act(async () => {
    if (!rejectInstall) throw new Error("손 소품 장착 요청이 시작되지 않았습니다.");
    rejectInstall(new Error("소품 파일을 읽지 못했습니다."));
  });
  expect(onNotice).toHaveBeenLastCalledWith("손 소품을 장착하지 못했습니다.");
  expect(select.disabled).toBe(false);
  expect(select.value).toBe("coffee-cup");

  fireEvent.change(select, { target: { value: "smartphone" } });
  await waitFor(() => expect(select.disabled).toBe(false));
  expect(engine.calls.filter((call) => call.method === "setHandProp").at(-1)?.args[0]).toMatchObject({
    propId: "smartphone",
    hand: "rightHand",
  });
  fireEvent.click(screen.getByTestId("viewport-hand-prop-grip-pose"));
  expect(commands.find((command) => command.type === "pose/set")).toMatchObject({
    type: "pose/set",
    pose: { head: latestPose.head },
  });
});

it.each([
  { name: "머리 액세서리", method: "setHeadProp", selectId: "viewport-head-prop-select", propId: "wire-glasses", retryId: "rofan-tiara", failure: "머리 액세서리를 장착하지 못했습니다." },
  { name: "스테이지 소품", method: "setStageProp", selectId: "viewport-stage-prop-select", propId: "academy-desk", retryId: "murim-sword-aura", failure: "배경 스테이지를 배치하지 못했습니다." },
] as const)("$name 장착 중 모든 소품 조작을 잠그고 실패 뒤 선택을 유지하며 재시도한다", async ({ method, selectId, propId, retryId, failure }) => {
  const engine = createMockEngine();
  let rejectInstall: ((reason: Error) => void) | undefined;
  vi.spyOn(engine, method).mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
    rejectInstall = reject;
  }));
  const onNotice = vi.fn<(notice: string) => void>();
  const dispatch = vi.fn<(command: LabCommand) => void>();
  const view = render(<ViewportHandPropTool engine={engine} pose={{}} dispatch={dispatch} onNotice={onNotice} />);
  const select = screen.getByTestId(selectId) as HTMLSelectElement;
  const allSelects = ["viewport-hand-prop-select", "viewport-head-prop-select", "viewport-stage-prop-select"]
    .map((id) => screen.getByTestId(id) as HTMLSelectElement);

  fireEvent.change(select, { target: { value: propId } });
  view.rerender(<ViewportHandPropTool engine={engine} pose={{ head: [0, 0, 0, 1] }} dispatch={dispatch} onNotice={onNotice} />);
  expect(select.value).toBe(propId);
  for (const control of allSelects) expect(control.disabled).toBe(true);

  await act(async () => {
    if (!rejectInstall) throw new Error("소품 장착 요청이 시작되지 않았습니다.");
    rejectInstall(new Error("소품 파일을 읽지 못했습니다."));
  });
  expect(onNotice).toHaveBeenLastCalledWith(failure);
  expect(select.value).toBe(propId);
  for (const control of allSelects) expect(control.disabled).toBe(false);

  fireEvent.change(select, { target: { value: retryId } });
  await waitFor(() => expect(select.disabled).toBe(false));
  expect(engine.calls.filter((call) => call.method === method).at(-1)?.args[0]).toMatchObject({ propId: retryId });
  for (const control of allSelects) expect(control.disabled).toBe(false);
});
