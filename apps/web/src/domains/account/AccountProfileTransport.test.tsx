// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountPage } from "./AccountPage";
import { captureProfileDraftScope, readProfileDraft } from "./account-profile-draft";
import { SessionProvider } from "@/domains/auth/public/session/auth-session";
import { persistSession } from "@/domains/auth/public/session/auth-session-state";
import { WRITE_TIMEOUT_MS } from "@/platform/api";
import { getCachedMyProfile, invalidateMyProfileCache } from "@/platform/me-client";
import { EMPTY_CREATOR_ROLE_PROFILE } from "@/shared/lib/creator-role-contract";

vi.mock("@/shared/lib/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/i18n")>();
  return { ...actual, useT: () => (key: string) => key };
});
vi.mock("@/shared/lib/i18n-bilingual-copy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/i18n-bilingual-copy")>();
  return {
    ...actual,
    translateBilingualValueForActiveLocale: <T,>(_scope: string, ko: T): T => ko,
  };
});
vi.mock("@/domains/auth/public/session/auth-session-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domains/auth/public/session/auth-session-store")>();
  return {
    ...actual,
    synchronizeServerSession: vi.fn(async () => actual.getAuthSession()),
    synchronizeServerSessionState: vi.fn(async () => {
      const session = actual.getAuthSession();
      return session ? { status: "authenticated" as const, session }
        : { status: "unauthenticated" as const, session: null };
    }),
  };
});
vi.mock("@/platform/creator-client", async () => {
  const { getAuthUserId } = await import("@/domains/auth/public/session/auth-session-state");
  return { getCurrentUserId: getAuthUserId };
});
vi.mock("@/shared/components/my-space-module-chrome", () => ({ MySpaceModuleChrome: () => null }));
vi.mock("@/shared/components/section", () => ({ Container: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("./AccountPageSubSections", () => ({
  ActivityTab: () => null, PostsTab: () => null, SignInPrompt: () => null,
  DeleteAccountDialog: () => null, ProfilePreview: () => null,
}));
vi.mock("@/shared/components/avatar-uploader", () => ({ AvatarUploader: () => null }));
vi.mock("./CreatorRoleProfileEditor", () => ({ CreatorRoleProfileEditor: () => null }));

const originalFetch = globalThis.fetch;
// fake timer 아래에서 헤더/본문 읽기를 기다리더라도, 시작 신호가 오지 않으면
// 실제 시간 상한에서 실패시켜 불필요한 30초 대기 대신 원인 있는 실패를 남긴다.
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
function waitForBodyReadStarted(): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = realSetTimeout(() => reject(new Error("본문 읽기 시작 신호가 없습니다.")), 6000);
  });
  return Promise.race([bodyStarted, deadline]).finally(() => {
    if (timeout !== undefined) realClearTimeout(timeout);
  });
}
const userId = "profile-transport-fixture";
const streamCleanups: Array<() => void> = [];
const requests: Array<{ method: string; path: string; payload: unknown }> = [];
let stallGet = false;
let stallPatch = false;
let bodyStarted: Promise<void>;
let notifyBodyStarted: () => void;
const storedProfile = () => ({
  id: userId, name: " 이름 ", bio: "기존 소개\n", image: null, avatar: null, email: null,
  creatorRoleProfile: { ...EMPTY_CREATOR_ROLE_PROFILE, secondaryRoles: [], specialties: [] },
  regionSettings: null,
});
let stored = storedProfile();

function makeStalledResponse(signal: AbortSignal): Response {
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const abort = () => streamController?.error(signal.reason);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    },
    pull() { notifyBodyStarted(); },
  }, { highWaterMark: 0 });
  streamCleanups.push(() => {
    signal.removeEventListener("abort", abort);
    streamController?.error(new DOMException("합성 스트림 정리", "AbortError"));
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/json" } });
}

async function transport(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const path = new URL(request.url).pathname;
  const payload: unknown = request.method === "PATCH" ? await request.json() : null;
  requests.push({ method: request.method, path, payload });
  if (path === "/api/me" && request.method === "GET") {
    if (stallGet) return makeStalledResponse(request.signal);
  } else if (path === "/api/me/profile" && request.method === "PATCH") {
    if (stallPatch) return makeStalledResponse(request.signal);
    if (typeof payload !== "object" || payload === null || !("bio" in payload)
      || typeof payload.bio !== "string" || Object.keys(payload).length !== 1) {
      throw new Error("미수정 필드를 포함한 PATCH는 허용하지 않습니다.");
    }
    stored = { ...stored, bio: payload.bio };
  } else {
    throw new Error(`허용하지 않은 합성 요청: ${request.method} ${path}`);
  }
  return new Response(JSON.stringify({ profile: stored }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

function mount() {
  return render(<SessionProvider><MemoryRouter initialEntries={["/me?tab=profile"]}>
    <AccountPage />
  </MemoryRouter></SessionProvider>);
}
const nameInput = () => screen.getByLabelText<HTMLInputElement>("account.profile.nameLabel");
const bioInput = () => screen.getByLabelText<HTMLTextAreaElement>("account.profile.bioLabel");
const saveButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "account.profile.saveButton" });
const beforeUnload = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

beforeEach(() => {
  stallGet = false;
  stallPatch = false;
  stored = storedProfile();
  requests.length = 0;
  bodyStarted = new Promise<void>((resolve) => { notifyBodyStarted = resolve; });
  persistSession(null);
  persistSession({ user: { id: userId, name: "세션 이름" }, token: null });
  invalidateMyProfileCache({ broadcast: false });
  globalThis.fetch = vi.fn(transport);
});
afterEach(() => {
  cleanup();
  for (const close of streamCleanups.splice(0)) close();
  persistSession(null);
  invalidateMyProfileCache({ broadcast: false });
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("실제 프로필 폼과 API 본문 읽기의 연결", () => {
  it("조회 본문이 멈추면 무한 로딩 대신 재시도를 제공하고 최신 서버값으로 복구한다", async () => {
    stallGet = true;
    vi.useFakeTimers();
    await act(async () => { mount(); await vi.advanceTimersByTimeAsync(0); });
    await waitForBodyReadStarted();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    vi.useRealTimers();
    expect(screen.getByRole("alert").textContent).toContain("account.profile.loadingError");
    expect(nameInput().disabled).toBe(true);
    expect(bioInput().disabled).toBe(true);
    expect(saveButton().disabled).toBe(true);
    expect(requests).toEqual([{ method: "GET", path: "/api/me", payload: null }]);
    expect(readProfileDraft(captureProfileDraftScope(userId))).toBeNull();

    stallGet = false;
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    // 표시값 쿼리의 공백 정규화를 거치지 않고 서버 원문이 입력에 보존되는지 확인한다.
    await waitFor(() => expect(nameInput().value).toBe(stored.name));
    expect(nameInput().value).toBe(stored.name);
    expect(bioInput().value).toBe(stored.bio);
    expect(nameInput().disabled).toBe(false);
    expect(saveButton().disabled).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(beforeUnload()).toBe(false);
    expect(requests).toEqual([
      { method: "GET", path: "/api/me", payload: null },
      { method: "GET", path: "/api/me", payload: null },
    ]);
  });

  it("저장 본문 지연을 성공으로 알리지 않고 초안을 보존하며 명시적 재시도만 전송한다", async () => {
    mount();
    await waitFor(() => expect(nameInput().value).toBe(stored.name));
    fireEvent.change(bioInput(), { target: { value: "유지할 새 소개" } });
    const scope = captureProfileDraftScope(userId);
    expect(readProfileDraft(scope)?.patch).toEqual({ bio: "유지할 새 소개" });
    stallPatch = true;
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(saveButton());
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitForBodyReadStarted();
    await act(async () => { await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS + 1); });
    vi.useRealTimers();
    expect(screen.getByRole("alert").textContent?.length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "account.profile.saved" })).toBeNull();
    expect(bioInput().value).toBe("유지할 새 소개");
    expect(readProfileDraft(scope)?.patch).toEqual({ bio: "유지할 새 소개" });
    expect(getCachedMyProfile()?.bio).toBe("기존 소개\n");
    expect(beforeUnload()).toBe(true);
    expect(requests.filter((entry) => entry.method === "PATCH")).toEqual([
      { method: "PATCH", path: "/api/me/profile", payload: { bio: "유지할 새 소개" } },
    ]);

    stallPatch = false;
    fireEvent.click(saveButton());
    const saved = await screen.findByRole<HTMLButtonElement>("button", { name: "account.profile.saved" });
    expect(saved.disabled).toBe(true);
    expect(stored.name).toBe(" 이름 ");
    expect(stored.bio).toBe("유지할 새 소개");
    expect(getCachedMyProfile()?.bio).toBe(stored.bio);
    expect(readProfileDraft(scope)).toBeNull();
    expect(beforeUnload()).toBe(false);
    expect(requests.filter((entry) => entry.method === "PATCH")).toEqual([
      { method: "PATCH", path: "/api/me/profile", payload: { bio: "유지할 새 소개" } },
      { method: "PATCH", path: "/api/me/profile", payload: { bio: "유지할 새 소개" } },
    ]);
  });
});
