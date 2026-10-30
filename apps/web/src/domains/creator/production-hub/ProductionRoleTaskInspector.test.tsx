// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProductionRoleWorkcellBoard, type ProductionTaskStatus } from "@toonstudio/core/production";
import { createProductionDemoProject } from "./production-demo";
import { ProductionRoleTaskInspector } from "./ProductionRoleTaskInspector";
import type { ProductionClientCommand } from "./production-api";

afterEach(cleanup);
function fixture(status: ProductionTaskStatus) {
  const original = createProductionDemoProject();
  const source = original.tasks.find((task) => task.processKey === "line-art");
  if (!source) throw new Error("선화 작업 기준이 없습니다.");
  const task = { ...source, status, dependencyTaskIds: [] };
  const aggregate = { ...original, tasks: [task] };
  const at = "2026-10-28T03:00:00.000Z";
  const gate = buildProductionRoleWorkcellBoard({ aggregate, at }).taskGates[task.id];
  if (!gate) throw new Error("작업 게이트가 없습니다.");
  return { aggregate, task, gate, at };
}
function show(status: ProductionTaskStatus, execute: (command: ProductionClientCommand, message: string) => Promise<void> = vi.fn(async () => undefined), canEdit = true) {
  const props = fixture(status);
  render(<MemoryRouter><ProductionRoleTaskInspector {...props} canEdit={canEdit} execute={execute} /></MemoryRouter>);
  return { ...props, execute };
}

describe("역할 작업 상세의 실제 협업 명령", () => {
  it("검수 상태에서 일반 수정으로 승인하지 않고 고정 검수 화면으로 연결한다", () => {
    const { task } = show("internal-review");
    expect(screen.queryByRole("button", { name: "승인 처리" })).toBeNull();
    const link = screen.getByRole("link", { name: "고정 제출본 검수" });
    expect(link.getAttribute("href")).toContain(`/review?task=${task.id}`);
    expect(link.getAttribute("href")).toContain("episode=episode-12");
  });

  it("시작 시 기존 상태를 조건으로 정식 상태 전환 명령을 보낸다", async () => {
    const { execute, task } = show("ready");
    fireEvent.click(screen.getByRole("button", { name: "작업 시작" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "transition-task-batch", transitions: [{ taskId: task.id, fromStatus: "ready", toStatus: "in-progress" }],
    }, expect.any(String)));
  });

  it("담당 변경은 이전 작업을 조건으로 저장하고 실패를 표시한다", async () => {
    const execute = vi.fn(async () => { throw new Error("workflow-task-conflict"); });
    const { task } = show("ready", execute);
    fireEvent.change(screen.getByRole("combobox", { name: `${task.title} 주 담당자` }), { target: { value: "assignment-art" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("workflow-task-conflict"));
    expect(execute).toHaveBeenCalledWith({ type: "upsert-task-batch", expectedTasks: [task], tasks: [{ ...task, assignmentIds: ["assignment-art"] }] }, expect.any(String));
  });

  it("서버 응답 전 중복 실행과 읽기 전용 변경을 막는다", async () => {
    let finish: (() => void) | undefined;
    const execute = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    show("ready", execute);
    const button = screen.getByRole("button", { name: "작업 시작" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(execute).toHaveBeenCalledTimes(1);
    finish?.();
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    cleanup();
    show("ready", execute, false);
    expect(screen.getByRole("button", { name: "작업 시작" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByRole("combobox").every((select) => select.hasAttribute("disabled"))).toBe(true);
  });
});
