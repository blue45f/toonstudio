// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { aiFixture } from "./ai-operations-fixture.test-support";
import { AiOperationsImport } from "./AiOperationsImport";

afterEach(cleanup);

describe("운영 보드 가져오기 파일 읽기", () => {
  it("새 파일을 읽지 못하면 이전에 확인한 검토본을 적용할 수 없다", async () => {
    const apply = vi.fn();
    render(<AiOperationsImport current={null} onImport={apply} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("또는 JSON 붙여넣기"), { target: { value: JSON.stringify(aiFixture()) } });
    fireEvent.click(screen.getByRole("button", { name: "가져오기 내용 검토" }));
    fireEvent.click(screen.getByRole("checkbox"));
    expect((screen.getByRole("button", { name: "검토한 기록을 화면에 적용" }) as HTMLButtonElement).disabled).toBe(false);

    const file = new File(["unreadable"], "unreadable.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => Promise.reject(new Error("읽기 실패")) });
    fireEvent.change(screen.getByLabelText("JSON 파일"), { target: { files: [file] } });
    expect(screen.queryByRole("button", { name: "검토한 기록을 화면에 적용" })).toBeNull();
    await screen.findByText("파일을 읽지 못했습니다. 현재 기록은 변경하지 않았습니다.");
    expect((screen.getByRole("button", { name: "가져오기 내용 검토" }) as HTMLButtonElement).disabled).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("늦게 읽은 이전 파일이 새 붙여넣기 내용을 덮어쓰지 않는다", async () => {
    let finish: ((content: string) => void) | undefined;
    const file = new File(["pending"], "older.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: () => new Promise<string>((resolve) => { finish = resolve; }) });
    render(<AiOperationsImport current={null} onImport={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("JSON 파일"), { target: { files: [file] } });
    const pasted = JSON.stringify({ ...aiFixture(), meta: { ...aiFixture().meta, title: "새로 붙여넣은 합성 보드" } });
    fireEvent.change(screen.getByLabelText("또는 JSON 붙여넣기"), { target: { value: pasted } });
    await act(async () => { finish?.(JSON.stringify(aiFixture())); });
    expect((screen.getByLabelText("또는 JSON 붙여넣기") as HTMLTextAreaElement).value).toBe(pasted);
    fireEvent.click(screen.getByRole("button", { name: "가져오기 내용 검토" }));
    expect(screen.getByRole("heading", { name: "새로 붙여넣은 합성 보드" })).toBeTruthy();
  });
});
