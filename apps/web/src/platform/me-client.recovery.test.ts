// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("@/platform/api", () => ({
  api: { get: api.get, patch: api.patch },
  toApiError: async (error: unknown) => error instanceof Error ? error : new Error("요청 실패"),
}));
let client: typeof import("./me-client");
let auth: typeof import("@/domains/auth/public/session/auth-session-state");
const channels = new Map<string, ((event: { data: unknown }) => void)[]>();
let blockChannel = false;
const profile = (id = "account-a", name = "이름") => ({ id, name, bio: "소개", image: null, avatar: null, email: "synthetic@example.test" });
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("요청 준비 전 완료"); };
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function signIn(id: string) { auth.persistSession({ user: { id, name: "이름", role: "user" }, token: null }); }

beforeEach(async () => {
  vi.resetModules(); api.get.mockReset(); api.patch.mockReset(); channels.clear(); blockChannel = false;
  vi.stubGlobal("BroadcastChannel", class {
    constructor(readonly name: string) { if (blockChannel) throw new Error("채널 사용 불가"); }
    addEventListener(_type: string, callback: (event: { data: unknown }) => void) {
      channels.set(this.name, [...(channels.get(this.name) ?? []), callback]);
    }
    postMessage() { /* 다른 탭에서 전송한 이벤트는 테스트가 직접 전달한다. */ }
    close() { /* 격리된 테스트 채널. */ }
  });
  auth = await import("@/domains/auth/public/session/auth-session-state");
  client = await import("./me-client");
  signIn("account-a");
});
afterEach(() => { client.invalidateMyProfileCache({ broadcast: false }); auth.persistSession(null); vi.unstubAllGlobals(); });

describe("프로필 캐시의 계정·응답 순서 경계", () => {
  it("로그아웃 즉시 프로필 캐시와 구독 값을 비운다", async () => {
    api.get.mockResolvedValue({ profile: profile() });
    await client.getMyProfile();
    const listener = vi.fn(); const unsubscribe = client.subscribeMyProfile(listener);
    auth.persistSession(null);
    expect(client.getCachedMyProfile()).toBeNull();
    expect(listener).toHaveBeenLastCalledWith(null);
    unsubscribe();
  });
  it("다른 계정은 이전 계정의 진행 중 조회를 공유하지 않는다", async () => {
    const old = deferred<{ profile: ReturnType<typeof profile> }>();
    api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ profile: profile("account-b", "두 번째") });
    const pending = client.getMyProfile().then(() => "accepted", () => "rejected");
    signIn("account-b");
    const current = client.getMyProfile();
    expect(api.get).toHaveBeenCalledTimes(2);
    old.resolve({ profile: profile() });
    expect(await pending).toBe("rejected");
    expect((await current).id).toBe("account-b");
  });
  it("같은 계정으로 다시 로그인해도 로그아웃 이전 응답이 캐시를 되살리지 않는다", async () => {
    const old = deferred<{ profile: ReturnType<typeof profile> }>(); api.get.mockReturnValue(old.promise);
    const pending = client.getMyProfile().then(() => "accepted", () => "rejected");
    auth.persistSession(null); signIn("account-a");
    old.resolve({ profile: profile() });
    expect(await pending).toBe("rejected"); expect(client.getCachedMyProfile()).toBeNull();
  });
  it("저장보다 늦게 도착한 이전 조회가 저장한 이름을 되돌리지 않는다", async () => {
    const old = deferred<{ profile: ReturnType<typeof profile> }>(); api.get.mockReturnValue(old.promise);
    const pending = client.getMyProfile().then(() => "accepted", () => "rejected");
    api.patch.mockResolvedValue({ profile: profile("account-a", "저장한 새 이름") });
    await client.updateMyProfile({ name: "저장한 새 이름" });
    old.resolve({ profile: profile("account-a", "이전 이름") });
    expect(await pending).toBe("rejected");
    expect(client.getCachedMyProfile()?.name).toBe("저장한 새 이름");
    expect(auth.getAuthSession()?.user.name).toBe("저장한 새 이름");
  });
  it("무효화한 캐시를 이전 진행 중 요청이 다시 채우지 않는다", async () => {
    const old = deferred<{ profile: ReturnType<typeof profile> }>(); api.get.mockReturnValue(old.promise);
    const pending = client.getMyProfile().then(() => "accepted", () => "rejected");
    client.invalidateMyProfileCache({ broadcast: false }); old.resolve({ profile: profile() });
    expect(await pending).toBe("rejected"); expect(client.getCachedMyProfile()).toBeNull();
  });
  it("겹친 강제 조회에서는 최신 요청 결과가 늦은 예전 결과보다 우선한다", async () => {
    const old = deferred<{ profile: ReturnType<typeof profile> }>();
    api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ profile: profile("account-a", "새 조회") });
    const first = client.getMyProfile(undefined, true);
    await client.getMyProfile(undefined, true);
    old.resolve({ profile: profile("account-a", "예전 조회") });
    expect((await first).name).toBe("새 조회"); expect(client.getCachedMyProfile()?.name).toBe("새 조회");
  });
  it("취소한 소비자의 늦은 응답은 전역 세션과 캐시를 수정하지 않는다", async () => {
    const old = deferred<{ profile: ReturnType<typeof profile> }>(); api.get.mockReturnValue(old.promise);
    const controller = new AbortController();
    const pending = client.getMyProfile(controller.signal).then(() => "accepted", () => "rejected");
    controller.abort(); old.resolve({ profile: profile() });
    expect(await pending).toBe("rejected"); expect(client.getCachedMyProfile()).toBeNull();
  });
  it("브라우저가 탭 간 통신을 막아도 서버 프로필 조회는 작동한다", async () => {
    blockChannel = true; api.get.mockResolvedValue({ profile: profile() });
    await expect(client.getMyProfile()).resolves.toMatchObject({ id: "account-a" });
  });
  it("로그아웃한 탭은 다른 탭의 프로필 메시지를 캐시하지 않는다", async () => {
    client.subscribeMyProfile(vi.fn()); auth.persistSession(null);
    for (const listener of channels.get("toonspectrum:me-profile:v1") ?? []) listener({ data: { type: "profile", profile: profile() } });
    expect(client.getCachedMyProfile()).toBeNull();
  });
  it("이전 계정의 저장 응답은 새 계정의 캐시·구독을 변경하지 않는다", async () => {
    const old = deferred<{ profile: ReturnType<typeof profile> }>(); api.patch.mockReturnValue(old.promise);
    const pending = client.updateMyProfile({ name: "이전 계정 편집" }).then(() => "accepted", () => "rejected");
    signIn("account-b"); const listener = vi.fn(); const unsubscribe = client.subscribeMyProfile(listener);
    old.resolve({ profile: profile("account-a", "이전 계정 편집") });
    expect(await pending).toBe("rejected"); expect(client.getCachedMyProfile()).toBeNull(); expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
  it("정상적인 같은 계정 메시지는 새 값을 전달하고 이전 조회보다 우선한다", async () => {
    const old = deferred<{ profile: ReturnType<typeof profile> }>(); api.get.mockReturnValue(old.promise);
    const pending = client.getMyProfile().then(() => "accepted", () => "rejected");
    for (const listener of channels.get("toonspectrum:me-profile:v1") ?? []) listener({ data: { type: "profile", profile: profile("account-a", "다른 탭에서 저장") } });
    old.resolve({ profile: profile() });
    expect(await pending).toBe("rejected");
    expect(client.getCachedMyProfile()?.name).toBe("다른 탭에서 저장");
  });
  it("타입이 잘못되거나 다른 계정인 메시지는 현재 캐시를 오염시키지 않는다", async () => {
    api.get.mockResolvedValue({ profile: profile() }); await client.getMyProfile();
    for (const listener of channels.get("toonspectrum:me-profile:v1") ?? []) {
      listener({ data: { type: "profile", profile: profile("account-b") } });
      listener({ data: { type: "profile", profile: { ...profile(), name: 42 } } });
    }
    expect(client.getCachedMyProfile()?.name).toBe("이름");
  });
  it("게스트 조회·저장은 네트워크 요청 전에 거절한다", async () => {
    auth.persistSession(null);
    await expect(client.getMyProfile()).rejects.toThrow("로그인 후");
    await expect(client.updateMyProfile({ name: "게스트" })).rejects.toThrow("로그인 후");
    expect(api.get).not.toHaveBeenCalled(); expect(api.patch).not.toHaveBeenCalled();
  });
  it("같은 사용자의 세션 새로고침은 캐시를 불필요하게 삭제하지 않는다", async () => {
    api.get.mockResolvedValue({ profile: profile() }); await client.getMyProfile(); signIn("account-a");
    await client.getMyProfile(); expect(api.get).toHaveBeenCalledTimes(1);
  });
  it("조회 중에 응답 계정이 달라지면 현재 폼에 반환하지 않는다", async () => {
    api.get.mockResolvedValue({ profile: profile("account-b") });
    await expect(client.getMyProfile()).rejects.toThrow("다시 불러와");
    expect(client.getCachedMyProfile()).toBeNull();
  });

  it.each([
    { name: { value: "잘못된 이름" } },
    { bio: ["잘못된 소개"] },
    { image: 42 },
    { email: undefined },
  ])("형식이 깨진 서버 프로필은 기존 캐시와 세션을 변경하지 않는다: %j", async (broken) => {
    api.get.mockResolvedValueOnce({ profile: profile() });
    await client.getMyProfile();
    api.get.mockResolvedValueOnce({ profile: { ...profile(), ...broken } });
    await expect(client.getMyProfile(undefined, true)).rejects.toThrow("프로필을 불러오지 못했어요.");
    expect(client.getCachedMyProfile()?.name).toBe("이름");
    expect(auth.getAuthSession()?.user.name).toBe("이름");
  });
  it("저장 응답의 잘못된 필드를 성공 결과로 폼에 넘기지 않는다", async () => {
    api.patch.mockResolvedValue({ profile: { ...profile(), bio: { hidden: true } } });
    await expect(client.updateMyProfile({ bio: "정상 입력" })).rejects.toThrow("프로필을 저장하지 못했어요.");
    expect(client.getCachedMyProfile()).toBeNull();
  });

});


describe("편집 화면 최초 조회의 제한된 경합 복구", () => {
  it("편집 진입은 캐시가 있어도 서버에서 최신 값을 읽는다", async () => {
    api.get.mockResolvedValueOnce({ profile: profile("account-a", "캐시 이름") })
      .mockResolvedValueOnce({ profile: profile("account-a", "서버 최신 이름") });
    await client.getMyProfile();
    const controller = new AbortController();
    expect((await client.getMyProfileForEditing(controller.signal)).name).toBe("서버 최신 이름");
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenLastCalledWith("/me", { signal: controller.signal });
  });

  it("같은 계정의 설정 저장과 경합하면 오래된 조회 대신 서버를 한 번 다시 읽는다", async () => {
    const stale = deferred<{ profile: ReturnType<typeof profile> }>();
    api.get.mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({ profile: profile("account-a", "최신 프로필") });
    const controller = new AbortController();
    const pending = client.getMyProfileForEditing(controller.signal);
    api.patch.mockResolvedValue({ profile: profile("account-a", "최신 프로필") });
    await client.updateMyProfile({ name: "최신 프로필" });
    stale.resolve({ profile: profile("account-a", "저장 전 이름") });
    expect((await pending).name).toBe("최신 프로필");
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenLastCalledWith("/me", { signal: controller.signal });
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(client.getCachedMyProfile()?.name).toBe("최신 프로필");
  });

  it("첫 응답이 끝나기 전에 캐시가 무효화돼도 편집 조회는 새 GET으로 복구한다", async () => {
    const stale = deferred<{ profile: ReturnType<typeof profile> }>();
    api.get.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({ profile: profile("account-a", "재조회") });
    const pending = client.getMyProfileForEditing();
    client.invalidateMyProfileCache({ broadcast: false });
    stale.resolve({ profile: profile("account-a", "무효 응답") });
    expect((await pending).name).toBe("재조회");
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("다른 탭의 값은 편집 폼에 바로 쓰지 않고 서버 재확인 뒤 반환한다", async () => {
    const stale = deferred<{ profile: ReturnType<typeof profile> }>();
    api.get.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({ profile: profile("account-a", "서버 확인값") });
    const pending = client.getMyProfileForEditing();
    for (const listener of channels.get("toonspectrum:me-profile:v1") ?? []) {
      listener({ data: { type: "profile", profile: profile("account-a", "탭의 알림") } });
    }
    stale.resolve({ profile: profile("account-a", "지연된 값") });
    expect((await pending).name).toBe("서버 확인값");
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("재조회도 무효화되면 세 번째 요청 없이 오류로 반환한다", async () => {
    api.get.mockImplementation(async () => {
      client.invalidateMyProfileCache({ broadcast: false });
      return { profile: profile() };
    });
    await expect(client.getMyProfileForEditing()).rejects.toThrow("프로필이 갱신되는 중");
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(client.getCachedMyProfile()).toBeNull();
  });

  it("취소한 화면은 경합 이후에도 새 네트워크 요청을 만들지 않는다", async () => {
    const stale = deferred<{ profile: ReturnType<typeof profile> }>();
    api.get.mockReturnValueOnce(stale.promise);
    const controller = new AbortController();
    const pending = client.getMyProfileForEditing(controller.signal).then(() => "accepted", () => "rejected");
    client.invalidateMyProfileCache({ broadcast: false });
    controller.abort(); stale.resolve({ profile: profile() });
    expect(await pending).toBe("rejected");
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(client.getCachedMyProfile()).toBeNull();
  });

  it.each(["account-a", "account-b"])("로그아웃 후 %s로 로그인하면 이전 편집 조회를 재시도하지 않는다", async (nextId) => {
    const stale = deferred<{ profile: ReturnType<typeof profile> }>();
    api.get.mockReturnValueOnce(stale.promise);
    const pending = client.getMyProfileForEditing().then(() => "accepted", () => "rejected");
    auth.persistSession(null); signIn(nextId);
    stale.resolve({ profile: profile() });
    expect(await pending).toBe("rejected");
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(client.getCachedMyProfile()).toBeNull();
  });

  it("서버 오류는 경합 복구 명목으로 중복 요청하지 않는다", async () => {
    const failure = new Error("서버 연결 실패");
    api.get.mockRejectedValue(failure);
    await expect(client.getMyProfileForEditing()).rejects.toBe(failure);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("응답 계정이 다르면 재시도나 캐시 반영 없이 거절한다", async () => {
    api.get.mockResolvedValue({ profile: profile("account-b") });
    await expect(client.getMyProfileForEditing()).rejects.toThrow("다시 불러와");
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(client.getCachedMyProfile()).toBeNull();
  });

  it("형식이 잘못된 응답을 재시도로 숨기지 않는다", async () => {
    api.get.mockResolvedValue({ profile: { ...profile(), bio: ["잘못된 본문"] } });
    await expect(client.getMyProfileForEditing()).rejects.toThrow("프로필을 불러오지 못했어요.");
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
