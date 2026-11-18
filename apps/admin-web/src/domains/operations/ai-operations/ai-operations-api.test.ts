import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonstudio/contracts/security/csrf";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAiOperations, parseAiOperationsView, saveAiOperations } from "./ai-operations-api";
import { aiFixture, aiFixtureView } from "./ai-operations-fixture.test-support";

afterEach(() => vi.unstubAllGlobals());
describe("AI 운영 API 클라이언트", () => {
  it("역할·리비전·스냅샷이 잘못된 응답을 유효한 보드로 표시하지 않는다", () => {
    expect(() => parseAiOperationsView({ ...aiFixtureView(), canEdit: "true" })).toThrow();
    expect(() => parseAiOperationsView({ ...aiFixtureView(), revision: -1 })).toThrow();
    expect(() => parseAiOperationsView({ ...aiFixtureView(), snapshot: {} })).toThrow();
    expect(() => parseAiOperationsView({ ...aiFixtureView(), audit: [{}] })).toThrow();
  });
  it("기록 읽기는 같은 출처 인증을 사용하며 캐시·리다이렉트를 허용하지 않는다", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(aiFixtureView())); vi.stubGlobal("fetch", fetcher);
    expect((await loadAiOperations()).revision).toBe(3);
    expect(fetcher).toHaveBeenCalledWith("/api/admin/ai-operations", expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error" }));
  });
  it("명시적 쓰기는 CSRF 헤더와 기대 리비전·mutationId를 포함한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(aiFixtureView())); vi.stubGlobal("fetch", fetcher);
    const input = { expectedRevision: 3, mutationId: crypto.randomUUID(), snapshot: aiFixture() }; await saveAiOperations(input);
    expect(fetcher).toHaveBeenCalledWith("/api/admin/ai-operations", expect.objectContaining({ method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE }, body: JSON.stringify(input) }));
  });
  it("서버의 권한 거부와 충돌 상태를 호출자에게 전달한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "권한 거부" }, { status: 403 })));
    await expect(loadAiOperations()).rejects.toMatchObject({ status: 403, message: "권한 거부" });
  });
});
