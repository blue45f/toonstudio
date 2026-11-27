// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createCoordinationItem, FINAL_SUBMISSION_MAX_BYTES } from "@toonstudio/contracts/final-submission";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SubmissionCoordinationImport } from "./SubmissionCoordinationImport";

afterEach(cleanup);

function selectFile(text: string, fileName = "검토.json") {
  fireEvent.change(screen.getByLabelText("어드민용 조정 JSON"), {
    target: { files: [{ name: fileName, size: new TextEncoder().encode(text).byteLength, text: async () => text }] },
  });
}

const envelope = (items: unknown) => JSON.stringify({ format: "toonstudio-coordination", version: 1, items });

describe("증빙 조정 항목 가져오기", () => {
  it("기존 ID를 유지하고 재검토할 새 항목만 반영한다", async () => {
    const existing = createCoordinationItem("known", "기존 원장");
    const candidate = { ...createCoordinationItem("new", "배포 근거 재확인"), latestVerified: true, status: "최종 확인",
      evidenceAt: "2026-11-26", checkedAt: "2026-11-26", file: "sample.zip", action: "배포",
      refs: [{ label: "근거", url: "https://example.org/build" }],
      comparisons: [{ label: "첨부 정보", file: "sample.zip", version: "r3", sha: "a".repeat(64), note: "3 B" }] };
    const apply = vi.fn(() => null);
    const close = vi.fn();
    render(<SubmissionCoordinationImport existing={[existing]} onApply={apply} onClose={close} />);
    selectFile(envelope([{ ...existing, title: "이름 바뀐 사본" }, candidate]));
    expect(await screen.findByText(/추가 1건 · 기존 ID 유지 1건/)).toBeTruthy();
    expect(screen.getByText(/이름 바뀐 사본.*기존 항목 유지/)).toBeTruthy();
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "새 항목 반영" }));
    expect(apply).toHaveBeenCalledWith([{ ...candidate, status: "미확인", latestVerified: false, checkedAt: "", evidenceAt: "" }]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("파일 선택 후 이미 추가된 ID는 다시 반영하지 않는다", async () => {
    const row = createCoordinationItem("new", "승인 원장");
    const apply = vi.fn(() => null);
    const close = vi.fn();
    const { rerender } = render(<SubmissionCoordinationImport existing={[]} onApply={apply} onClose={close} />);
    selectFile(envelope([row]));
    await screen.findByText(/추가 1건/);
    rerender(<SubmissionCoordinationImport existing={[row]} onApply={apply} onClose={close} />);
    expect(screen.getByText(/추가 0건 · 기존 ID 유지 1건/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "새 항목 반영" }));
    expect(apply).not.toHaveBeenCalled();
  });

  it.each([JSON.stringify({ board: {} }), envelope([{}]), envelope([createCoordinationItem("a", "동일"), createCoordinationItem("a", "동일")])])(
    "다른 보드 형식·잘못된 항목·중복 ID가 있는 파일을 차단한다", async text => {
      render(<SubmissionCoordinationImport existing={[]} onApply={vi.fn()} onClose={vi.fn()} />);
      selectFile(text);
      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(screen.queryByRole("heading", {name: "가져오기 미리보기"})).toBeNull();
    },
  );

  it("초과 크기는 파일 본문을 읽기 전에 차단한다", async () => {
    const read = vi.fn();
    render(<SubmissionCoordinationImport existing={[]} onApply={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("어드민용 조정 JSON"), {
      target: { files: [{ name: "large.json", size: FINAL_SUBMISSION_MAX_BYTES + 1, text: read }] },
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(/2 MiB/);
    expect(read).not.toHaveBeenCalled();
  });
});
