import { describe, expect, it, vi } from "vitest";

import { createStudioAiComicDirectorApiClient } from "./studio-ai-comic-director-api";

describe("콘티 API 인증", () => {
  it("스크립트 토큰이 없어도 같은 서비스의 HttpOnly 세션 쿠키로 대본을 읽는다", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ session: { id: "writer", revision: 1, payload: { storyText: "내 대본" } } }));
    const api = createStudioAiComicDirectorApiClient({ fetchImpl });
    expect(await api.getSession("writer")).toMatchObject({ ok: true, data: { storyText: "내 대본" } });
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).has("x-user-id")).toBe(false);
  });

  it("서버가 만료된 인증을 거절하면 로그인 안내를 돌려준다", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    const api = createStudioAiComicDirectorApiClient({ fetchImpl });
    expect(await api.getSession("writer")).toMatchObject({ ok: false, code: "not_authenticated" });
  });

  it("명시한 구형 서명 세션을 보존하며 접근 거절을 성공으로 처리하지 않는다", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ message: "접근할 수 없습니다" }, { status: 403 }));
    const api = createStudioAiComicDirectorApiClient({ fetchImpl, sessionToken: "fixture-signed-token" });
    expect(await api.getSession("another-work")).toMatchObject({ ok: false, code: "http_error" });
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get("x-user-id")).toBe("fixture-signed-token");
  });
});
