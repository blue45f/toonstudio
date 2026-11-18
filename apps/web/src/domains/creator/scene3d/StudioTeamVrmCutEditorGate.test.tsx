// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StudioTeamVrmCutEditorGate from "./StudioTeamVrmCutEditorGate";
import { TeamVrmCutAccessError } from "./studio-team-vrm-cut-client";

const { read, recheck } = vi.hoisted(() => ({ read: vi.fn(), recheck: vi.fn() }));
vi.mock("./studio-team-vrm-cut-client", () => ({
  readTeamVrmCut: read,
  readTeamVrmCutReceipt: recheck,
  TeamVrmCutAccessError: class extends Error {},
}));
function Editor() { return <input aria-label="컷 이름" defaultValue="첫 컷" />; }
const open = (authorized = true) => <StudioTeamVrmCutEditorGate workId="work" pageId="page" anchorId="anchor"
  authorized={authorized} editor={<Editor />} />;

beforeEach(() => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  read.mockResolvedValue({ scene: {}, sceneSha256: "original", resources: { paints: new Map(), blobs: new Map() } });
  recheck.mockResolvedValue({ sceneSha256: "original" });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("팀 VRM 컷을 다시 열 때의 권한", () => {
  it("탭에 복귀하면 영수증을 재검사하고 편집 중인 컷 이름과 다운로드한 모델을 유지한다", async () => {
    render(open());
    const input = await screen.findByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "수정 중" } });
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(recheck).toHaveBeenCalledOnce());
    expect(screen.getByRole("textbox")).toBe(input);
    expect(input.value).toBe("수정 중");
    expect(read).toHaveBeenCalledOnce();
  });
  it("연결 장애 때 편집을 보존하고 권한 철회가 확인되면 원본을 닫는다", async () => {
    render(open()); await screen.findByRole("textbox");
    recheck.mockRejectedValueOnce(new Error("네트워크 연결을 확인해 주세요."));
    fireEvent(window, new Event("online"));
    expect((await screen.findByRole("alert")).textContent).toContain("네트워크");
    expect(screen.getByRole("textbox")).toBeTruthy();
    recheck.mockRejectedValueOnce(new TeamVrmCutAccessError("접근 권한이 없습니다."));
    fireEvent(document, new Event("visibilitychange"));
    await screen.findByRole("button", { name: "다시 받기" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("권한");
    fireEvent.click(screen.getByRole("button", { name: "다시 받기" }));
    await screen.findByRole("textbox"); expect(read).toHaveBeenCalledTimes(2);
  });
  it("권한이 없는 레이어는 빈 편집기로 대체하지 않는다", async () => {
    const ui = render(open(false));
    expect(screen.getByRole("alert").textContent).toContain("권한");
    expect(read).not.toHaveBeenCalled();
    ui.rerender(open()); await screen.findByRole("textbox");
    ui.rerender(open(false));
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
