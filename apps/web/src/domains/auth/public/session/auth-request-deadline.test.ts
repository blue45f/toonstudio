// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthSession, persistSession, signIn, signInWithGoogleIdToken, signOut, synchronizeServerSessionState } from "./auth-session-store";

const raw = vi.hoisted(() => vi.fn());
vi.mock("@/platform/api", () => ({ api: { raw }, apiPath: (path: string) => `/api${path}`, WRITE_TIMEOUT_MS: 75_000 }));
const response = () => new Response(JSON.stringify({ user: { id: "late-user", name: "늦은 응답" } }), { status: 200 });
beforeEach(() => { raw.mockReset(); persistSession(null); vi.useFakeTimers(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); persistSession(null); });

describe("인증 요청의 전체 대기 상한과 취소", () => {
  it("Google 전송이 응답하지 않아도 상한 뒤 폼에서 재시도할 수 있다", async () => {
    raw.mockImplementation(() => new Promise(() => undefined));
    let settled = false;
    const pending = signInWithGoogleIdToken("synthetic.payload.signature").then((value) => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(75_001);
    expect(settled).toBe(true);
    expect(await pending).toMatchObject({ ok: false, status: 0 });
    expect(raw).toHaveBeenCalledOnce(); expect(getAuthSession()).toBeNull();
  });
  it("Google 응답 헤더 뒤 본문이 멈춰도 성공으로 처리하거나 무한 대기하지 않는다", async () => {
    raw.mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => undefined) });
    let settled = false;
    const pending = signInWithGoogleIdToken("synthetic.payload.signature").then((value) => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(75_001); expect(settled).toBe(true);
    expect(await pending).toMatchObject({ ok: false }); expect(getAuthSession()).toBeNull();
  });
  it("취소 뒤 늦은 Google 성공 응답은 세션을 되살리지 않는다", async () => {
    let finish: ((value: Response) => void) | undefined;
    raw.mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const controller = new AbortController();
    const pending = signInWithGoogleIdToken("synthetic.payload.signature", { signal: controller.signal });
    controller.abort();
    finish?.(response());
    expect(await pending).toMatchObject({ ok: false, status: 0 }); expect(getAuthSession()).toBeNull();
  });
  it("자격 로그인도 응답 본문 대기까지 제한한다", async () => {
    raw.mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => undefined) });
    let settled = false;
    const pending = signIn("credentials", {}).then((value) => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(75_001); expect(settled).toBe(true);
    expect(await pending).toMatchObject({ ok: false, status: 0 });
  });
  it("로그아웃 무응답은 전체 상한 뒤 미확정으로 끝내고 기존 세션을 보존한다", async () => {
    persistSession({ user: { id: "existing-user" }, token: null });
    raw.mockImplementation(() => new Promise(() => undefined));
    let settled = false;
    const pending = signOut().then((value) => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(75_001); expect(settled).toBe(true);
    expect(await pending).toMatchObject({ ok: false, status: "pending", attempts: 1 });
    expect(getAuthSession()?.user.id).toBe("existing-user"); expect(raw).toHaveBeenCalledOnce();
  });
  it("세션 조회는 헤더 이후 본문이 멈춰도 5초 뒤 미확정으로 반환한다", async () => {
    raw.mockResolvedValue({ ok: true, status: 200, json: () => new Promise(() => undefined) });
    let settled = false;
    const pending = synchronizeServerSessionState().then((value) => { settled = true; return value; });
    await vi.advanceTimersByTimeAsync(5_001); expect(settled).toBe(true);
    expect(await pending).toMatchObject({ status: "indeterminate" });
  });
  it("이미 취소된 Google 요청은 전송하지 않는다", async () => {
    const controller = new AbortController(); controller.abort();
    expect(await signInWithGoogleIdToken("synthetic.payload.signature", { signal: controller.signal })).toMatchObject({ ok: false });
    expect(raw).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("정상 완료 뒤에는 시간 제한 타이머를 남기지 않는다", async () => {
    const schedule = vi.spyOn(globalThis, "setTimeout");
    const clear = vi.spyOn(globalThis, "clearTimeout");
    raw.mockResolvedValue(response());
    expect(await signInWithGoogleIdToken("synthetic.payload.signature")).toMatchObject({ ok: true });
    const deadlineIndex = schedule.mock.calls.findIndex((call) => call[1] === 75_000);
    expect(deadlineIndex).toBeGreaterThanOrEqual(0);
    // jsdom의 storage 이벤트 타이머가 아니라 인증 요청이 만든 정확한 타이머를 확인한다.
    expect(clear).toHaveBeenCalledWith(schedule.mock.results[deadlineIndex].value);
  });
  it("로그아웃 재시도는 매번 상한을 늘리지 않고 최초 시작부터 계산한다", async () => {
    let finish: ((value: Response) => void) | undefined;
    raw.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
      .mockImplementation(() => new Promise(() => undefined));
    const pending = signOut({ retryDelaysMs: [0], wait: async () => undefined });
    await vi.advanceTimersByTimeAsync(70_000); finish?.(new Response(null, { status: 503 }));
    await vi.advanceTimersByTimeAsync(0); expect(raw).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await pending).toMatchObject({ ok: false, status: "pending", attempts: 2 });
  });
  it("시간 초과 이후 새 로그아웃은 이전에 멈춘 요청을 재사용하지 않는다", async () => {
    persistSession({ user: { id: "retry-user" }, token: null });
    raw.mockImplementationOnce(() => new Promise(() => undefined));
    const first = signOut(); await vi.advanceTimersByTimeAsync(75_001);
    expect(await first).toMatchObject({ ok: false });
    const schedule = vi.spyOn(globalThis, "setTimeout");
    const clear = vi.spyOn(globalThis, "clearTimeout");
    raw.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await signOut()).toMatchObject({ ok: true, attempts: 1 });
    expect(getAuthSession()).toBeNull();
    const deadlineIndex = schedule.mock.calls.findIndex((call) => call[1] === 75_000);
    expect(deadlineIndex).toBeGreaterThanOrEqual(0);
    expect(clear).toHaveBeenCalledWith(schedule.mock.results[deadlineIndex].value);
  });

  it("세션 조회 시간 초과 뒤 늦은 401은 보존한 세션을 지우지 않는다", async () => {
    persistSession({ user: { id: "preserved-user" }, token: null });
    let finish: ((value: Response) => void) | undefined;
    raw.mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const pending = synchronizeServerSessionState();
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await pending).toMatchObject({ status: "indeterminate" });
    finish?.(new Response(null, { status: 401 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(getAuthSession()?.user.id).toBe("preserved-user");
  });

});
