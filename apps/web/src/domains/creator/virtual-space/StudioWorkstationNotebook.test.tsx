// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { StudioVirtualSpaceWorkstationLiveModal } from "./StudioVirtualSpaceWorkstationLiveModal";
import { ILLUSTRATED_2D_WORKSTATIONS } from "./studio-virtual-space-illustrated-2d-runtime";
import { WorkstationSpaceContext } from "./use-studio-workstation-notebook";

const fixture = vi.hoisted(() => ({ actor: "owner-a", ready: true, rows: new Map<string, string>(), readError: false, writeError: false }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ ready: fixture.ready, data: fixture.actor ? { user: { id: fixture.actor } } : null }),
  getAuthUserId: () => fixture.actor || null,
}));
vi.mock("../studio-local-database-runtime", () => ({
  resetFailedStudioLocalDatabaseOwnership: async () => false,
  acquireStudioLocalDatabase: async () => ({ asAsyncKeyValueStore: () => ({
    async get(key: string) { if (fixture.readError) throw new Error("offline"); return fixture.rows.get(key) ?? null; },
    async set(key: string, value: string) { if (fixture.writeError) throw new Error("quota"); fixture.rows.set(key, value); },
  }) }),
}));
beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); fixture.actor = "owner-a"; fixture.ready = true; fixture.readError = fixture.writeError = false; fixture.rows.clear(); });
const station = ILLUSTRATED_2D_WORKSTATIONS[0];
const surface = (close = () => {}) => <WorkstationSpaceContext.Provider value={{ id: "my-project", personal: false }}>
  <StudioVirtualSpaceWorkstationLiveModal station={station} onClose={close} onSelectStation={() => {}} />
</WorkstationSpaceContext.Provider>;
const stamp = "🔧 구도 리테이크";
const saved = () => screen.findByText(/이 기기의 개인 작업대에 저장됩니다/);

it("준비 중인 세션의 작업물을 숨기고 SQLite 읽기 실패를 재시도한다", async () => {
  fixture.ready = false;
  const view = render(surface());
  expect(screen.queryByTestId("workstation-redline-canvas")).toBeNull();
  fixture.ready = true; fixture.readError = true; view.rerender(surface());
  await screen.findByRole("alert");
  expect(screen.queryByTestId("workstation-redline-canvas")).toBeNull();
  fixture.readError = false;
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await saved();
  expect(screen.getByTestId("workstation-redline-canvas")).toBeTruthy();
});
it("저장 실패 시 열린 변경을 보존하고 재시도, 계정 교체, 원소유자 복원을 처리한다", async () => {
  const close = vi.fn();
  const view = render(surface(close));
  await saved();
  fixture.writeError = true;
  fireEvent.click(screen.getByRole("button", { name: stamp }));
  await screen.findByText(/기기에 저장하지 못했습니다/);
  expect(screen.getByText("현재 판정: " + stamp)).toBeTruthy();
  fireEvent.click(screen.getByTestId("workstation-live-close-btn"));
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("계속 작업"));
  fixture.writeError = false;
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await saved();
  fixture.actor = "owner-b"; view.rerender(surface(close)); await saved();
  expect(screen.getByText("현재 판정: 미판정")).toBeTruthy();
  fixture.actor = "owner-a"; view.rerender(surface(close)); await saved();
  await waitFor(() => expect(screen.getByText("현재 판정: " + stamp)).toBeTruthy());
});
