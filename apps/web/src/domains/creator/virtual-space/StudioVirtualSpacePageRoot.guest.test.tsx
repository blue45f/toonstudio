// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpacePage } from "./StudioVirtualSpacePageRoot";
import { verifyStudioSpaceEntryCode } from "./studio-virtual-space-access-client";
import { createStudioGuestSession, readStudioGuestSession, writeStudioGuestSession } from "./studio-virtual-space-guest-session";
import type { StudioVirtualSpaceEntryLobby } from "./StudioVirtualSpaceEntryLobby";

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: () => ({ ready: true, data: null }) }));
vi.mock("../live/StudioLiveCollaborationProvider", () => ({ StudioLiveCollaborationProvider: ({ children }: PropsWithChildren) => <>{children}</> }));
vi.mock("../live/use-studio-live-transport-auth", () => ({ useStudioLiveTransportAuth: () => undefined }));
vi.mock("./world-publication/use-studio-world-publication", () => ({ useStudioWorldPublication: () => ({ snapshot: {} }) }));
vi.mock("./studio-virtual-space-access-client", () => ({ verifyStudioSpaceEntryCode: vi.fn(), verifyStudioSpatialInvite: vi.fn() }));
vi.mock("./StudioVirtualSpacePage", () => ({
  VirtualSpaceExperience: ({ nickname }: { nickname: string }) => <h1>무대 · {nickname}</h1>,
}));
vi.mock("./StudioVirtualSpaceEntryLobby", () => ({
  StudioVirtualSpaceEntryLobby: ({ nickname, onNickname, onEnter, accessBlocked, accessNotice }: ComponentProps<typeof StudioVirtualSpaceEntryLobby>) => <>
    <input aria-label="닉네임" value={nickname} onChange={event => onNickname(event.target.value)} />
    <button disabled={accessBlocked} onClick={onEnter}>입장</button>
    {accessNotice && <p role="status">{accessNotice.ko}</p>}
  </>,
}));

const spaceId = "guest-session-test";
const firstCode = "ABC234";
const secondCode = "DEF567";
const approved = { status: "valid", expiresAt: "2030-01-01T00:00:00.000Z" } as const;

function openGuestSpace(url = "?place=skyport") {
  return render(<MemoryRouter initialEntries={[`/studio/p/${spaceId}/space${url}`]}><StudioVirtualSpacePage projectIdOverride={spaceId} /></MemoryRouter>);
}

function previousVisit() {
  const previous = createStudioGuestSession({ spaceId, token: firstCode, nickname: "초대작업자" });
  writeStudioGuestSession(previous);
  return previous;
}

beforeEach(() => { localStorage.clear(); vi.resetAllMocks(); });
afterEach(cleanup);

describe("가상공간 게스트 재입장", () => {
  it("다른 장소에서 새로고침하면 자격 확인 뒤 같은 참가자로 자동 복귀한다", async () => {
    const previous = previousVisit();
    let approve!: (result: typeof approved) => void;
    vi.mocked(verifyStudioSpaceEntryCode).mockImplementationOnce(() => new Promise(resolve => { approve = resolve; }));
    openGuestSpace();
    expect(verifyStudioSpaceEntryCode).toHaveBeenCalledWith(spaceId, firstCode);
    expect(screen.queryByRole("heading")).toBeNull();
    await act(async () => { approve(approved); });
    expect((await screen.findByRole("heading")).textContent).toContain("무대 · 초대작업자");
    expect(readStudioGuestSession()).toEqual(previous);
  });

  it("명시적으로 로비를 열면 기존 닉네임을 확인하고 같은 세션에서 이름을 바꾼다", async () => {
    const previous = previousVisit();
    vi.mocked(verifyStudioSpaceEntryCode).mockResolvedValue(approved);
    openGuestSpace(`?lobby=1#code=${firstCode}`);
    expect(await screen.findByDisplayValue(previous.nickname)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "검수담당" } });
    fireEvent.click(screen.getByRole("button", { name: "입장" }));
    expect((await screen.findByRole("heading")).textContent).toContain("검수담당");
    expect(readStudioGuestSession()).toEqual({ ...previous, nickname: "검수담당" });
  });

  it("새 자격은 별도로 수락하고 다른 세션을 발급한다", async () => {
    const previous = previousVisit();
    vi.mocked(verifyStudioSpaceEntryCode).mockResolvedValue(approved);
    openGuestSpace(`#code=${secondCode}`);
    await waitFor(() => expect(screen.getByRole("button", { name: "입장" }).hasAttribute("disabled")).toBe(false));
    expect(screen.queryByRole("heading")).toBeNull();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "초대검수자" } });
    fireEvent.click(screen.getByRole("button", { name: "입장" }));
    expect((await screen.findByRole("heading")).textContent).toContain("초대검수자");
    const next = readStudioGuestSession();
    expect(next?.inviteToken).toBe(secondCode);
    expect(next?.sessionId).not.toBe(previous.sessionId);
  });

  it("이전 세션의 서버 확인이 지연되면 자동 입장하지 않고 로비에서 같은 이름으로 재개한다", async () => {
    const previous = previousVisit();
    vi.mocked(verifyStudioSpaceEntryCode).mockResolvedValue({ status: "unavailable" });
    openGuestSpace();
    expect(await screen.findByDisplayValue(previous.nickname)).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "입장" }));
    expect((await screen.findByRole("heading")).textContent).toContain(previous.nickname);
    expect(readStudioGuestSession()).toEqual(previous);
  });
});
