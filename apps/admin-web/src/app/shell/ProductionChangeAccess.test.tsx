// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionChangeAccess } from "./ProductionChangeAccess";

import type { AdminIdentity } from "../../platform/http/admin-identity";

type BoardProps = { actor: AdminIdentity; verified: boolean; onUnauthorized: (message: string) => void };
const mocks = vi.hoisted(() => ({ identity: vi.fn(), board: vi.fn() }));
vi.mock("../../platform/http/admin-identity", () => ({ loadAdminIdentity: mocks.identity }));
vi.mock("../../domains/production/changes/ProductionChangeBoard", () => ({ ProductionChangeBoard: (props: BoardProps) => {
  const [draft, setDraft] = useState("");
  mocks.board(props);
  return <section><p>제작 기록 사용자 {props.actor.id} · {props.actor.role}</p>
    <label>변경 초안<input value={draft} disabled={!props.verified} onChange={(event) => setDraft(event.target.value)} /></label>
    <button type="button" onClick={() => props.onUnauthorized("제작 기록 권한이 만료되었습니다.")}>권한 만료</button>
  </section>;
} }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe("제작 변경 관리자 권한 경계", () => {
  it("관리자 확인 전에는 보드와 기록을 열지 않는다", () => {
    mocks.identity.mockReturnValue(new Promise(() => undefined));
    render(<ProductionChangeAccess />);
    expect(screen.getByRole("status").textContent).toContain("관리자 권한");
    expect(mocks.board).not.toHaveBeenCalled();
  });

  it("확인된 operator 역할을 전달하고 API 권한 거부 시 기록을 제거한다", async () => {
    mocks.identity.mockResolvedValue({ id: "operator-a", role: "operator" });
    render(<ProductionChangeAccess />);
    await screen.findByText("제작 기록 사용자 operator-a · operator");
    expect(mocks.board).toHaveBeenLastCalledWith(expect.objectContaining({ verified: true, actor: { id: "operator-a", role: "operator" } }));
    fireEvent.click(screen.getByRole("button", { name: "권한 만료" }));
    await screen.findByText("제작 기록 권한이 만료되었습니다.");
    expect(screen.queryByLabelText("변경 초안")).toBeNull();
  });

  it("재확인 중 기록을 숨기고 같은 계정 초안은 보존하며 계정 변경 시 분리한다", async () => {
    mocks.identity.mockResolvedValueOnce({ id: "admin-a", role: "admin" });
    render(<ProductionChangeAccess />);
    const draft = await screen.findByLabelText<HTMLInputElement>("변경 초안");
    fireEvent.change(draft, { target: { value: "미저장 초안" } });
    const recheck = Promise.withResolvers<AdminIdentity>();
    mocks.identity.mockReturnValueOnce(recheck.promise);
    fireEvent.focus(window);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(draft.disabled).toBe(true);
    recheck.resolve({ id: "admin-a", role: "admin" });
    await waitFor(() => expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("미저장 초안"));
    mocks.identity.mockResolvedValueOnce({ id: "admin-b", role: "admin" });
    fireEvent(window, new Event("toonstudio:auth-session-changed"));
    await screen.findByText("제작 기록 사용자 admin-b · admin");
    expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("");
    expect(screen.queryByText("제작 기록 사용자 admin-a · admin")).toBeNull();
  });
});
