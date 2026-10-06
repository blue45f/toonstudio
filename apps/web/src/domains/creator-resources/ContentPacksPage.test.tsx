// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentPacksPage } from "./ContentPacksPage";
import { creatorWorkspaceStorageKey } from "@/shared/lib/creator-workspace-persistence";

// 이 테스트들은 비로그인 상태라 워크스페이스가 게스트 파티션 키에 저장된다(소유자 스코프).
const GUEST_WORKSPACE_KEY = creatorWorkspaceStorageKey("guest");

const request = vi.fn<typeof fetch>();
const resource = { id: "aic:42", provider: "aic", title: "Museum armor", creator: "Maker", sourceUrl: "https://www.artic.edu/artworks/42", license: "CC0", credit: "Collection", fetchedAt: "2026-09-13T10:00:00Z", description: "" };
const response = () => Response.json({ provider: "aic", page: 1, status: "ready", items: [resource], hasMore: false, message: "Official source", fetchedAt: resource.fetchedAt });
const mount = (search = "") => render(<MemoryRouter initialEntries={[`/research/packs${search}`]}><ContentPacksPage /></MemoryRouter>);
beforeEach(() => {
  localStorage.clear(); request.mockReset().mockImplementation(async () => response()); vi.stubGlobal("fetch", request);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { locks: { request: async (_key: string, _options: unknown, operation: () => unknown) => operation() } }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("free content creation page", () => {
  it("has no initial provider requests and changes themes and formats without network calls", () => {
    mount(); expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /금 간 그릇의 기억/u }));
    fireEvent.change(screen.getByLabelText("산출물 형식"), { target: { value: "world" } });
    expect(screen.getByText(/세계관 설정 워크시트/u)).toBeTruthy(); expect(request).not.toHaveBeenCalled();
  });
  it("shows the selected provider's source identity chip and follows provider changes", () => {
    const { container } = mount();
    expect(container.querySelector(".research-source--aic")).toBeTruthy();
    expect(screen.getByText(/시카고 미술관이 공개한 회화·조각·공예 소장품에서 시대의 원형을 찾습니다/u)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("제공처"), { target: { value: "cleveland" } });
    expect(container.querySelector(".research-source--cleveland")).toBeTruthy();
    expect(screen.getByText(/클리블랜드 미술관이 CC0로 공개한 유물·문양·회화 소장품을 찾습니다/u)).toBeTruthy();
  });
  it("searches on demand, saves a source and uses selected credits in the brief", async () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: "갑옷 검색" }));
    fireEvent.click(await screen.findByRole("button", { name: "보드에 저장" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(GUEST_WORKSPACE_KEY)!).saved).toHaveLength(1));
    fireEvent.click(screen.getByRole("checkbox", { name: /Museum armor/u }));
    expect(screen.getByText(/원문: https:\/\/www.artic.edu\/artworks\/42/u)).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1); expect(String(request.mock.calls[0][0])).toContain("provider=aic");
  });
  it("keeps the local brief available during an outage and supports explicit retry", async () => {
    request.mockResolvedValueOnce(new Response(null, { status: 503 })); mount("?q=armor");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "브리프 Markdown 내보내기" })).has.property("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "Museum armor" })).toBeTruthy();
  });
  it("rejects invalid queries before calling the API", async () => {
    mount("?q=x"); expect((await screen.findByRole("alert")).textContent).toContain("2~80자"); expect(request).not.toHaveBeenCalled();
  });
});
