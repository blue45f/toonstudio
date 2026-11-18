// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { WorkspaceAccess } from "./WorkspaceAccess";

const identity = vi.hoisted(() => vi.fn());
vi.mock("../../platform/http/admin-identity", () => ({ loadAdminIdentity: identity }));
vi.mock("../../domains/workspace/AdminWorkspace", () => ({ AdminWorkspace: ({ actor }: { actor: { id: string; role: string } }) => {
  const [draft, setDraft] = useState("");
  return <section><p>{actor.id}:{actor.role}</p><label>계정별 초안<input value={draft} onChange={(event) => setDraft(event.target.value)} /></label></section>;
} }));
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

it("같은 계정의 권한이 바뀌면 이전 편집 상태를 재사용하지 않는다", async () => {
  identity.mockResolvedValueOnce({ id: "actor-a", role: "admin" });
  render(<WorkspaceAccess />);
  await screen.findByText("actor-a:admin");
  fireEvent.change(screen.getByLabelText("계정별 초안"), { target: { value: "관리자 초안" } });
  identity.mockResolvedValueOnce({ id: "actor-a", role: "operator" });
  fireEvent(window, new Event("toonstudio:auth-session-changed"));
  await screen.findByText("actor-a:operator");
  expect(screen.getByLabelText<HTMLInputElement>("계정별 초안").value).toBe("");
});

it("권한이 철회되면 작업실 데이터도 제거한다", async () => {
  identity.mockResolvedValueOnce({ id: "actor-a", role: "admin" });
  render(<WorkspaceAccess />);
  await screen.findByText("actor-a:admin");
  identity.mockRejectedValueOnce(new Error("권한이 철회되었습니다."));
  fireEvent.focus(window);
  await screen.findByRole("alert");
  expect(screen.queryByLabelText("계정별 초안")).toBeNull();
});
