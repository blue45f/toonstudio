import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchKmasBookAndWebtoon } from "../../../../../apps/api/src/server/kmas";

/**
 * 레거시 KMAS 경로(`GET /kmas/book-webtoons`, 검색 라이브 병합 등)가 쓰는 fetchKmasBookAndWebtoon 의
 * 외부 호출 한도. 신규 프록시(kmas-reference.ts)와 같은 방식이다: 호스트 허용 목록(prvKey 를 보내기 전에
 * 거부), 8초 타임아웃, redirect "error", 2 MiB 응답 상한(content-length 와 스트림 모두).
 * 실제 네트워크를 쓰지 않고 fetch 를 가짜로 대체한다. prvKey 값은 테스트용 가짜 문자열이다.
 */

const env = { KMAS_PRV_KEY: "test-only-key" };
const MIB = 1024 * 1024;

const okBody = { result: { resultState: "success", totalCount: 0 }, itemList: [] };

/** 자격 정보가 든 base URL. 리터럴로 적으면 비밀 검사기가 BasicAuth 로 오탐하므로 URL API 로 조립한다. */
function withCredentials(): string {
  const url = new URL("https://www.kmas.or.kr");
  url.username = "operator";
  url.password = "placeholder";
  return url.toString();
}

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const transport = vi.fn<typeof fetch>(handler);
  vi.stubGlobal("fetch", transport);
  return transport;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchKmasBookAndWebtoon 호스트 허용 목록", () => {
  it.each([
    ["https://www.kmas.or.kr", "www.kmas.or.kr"],
    ["https://kmas.or.kr", "kmas.or.kr"],
    ["https://www.kmas.or.kr/", "www.kmas.or.kr"],
  ])("%s 는 허용하고 prvKey 를 그 호스트로만 보낸다", async (base, hostname) => {
    const transport = stubFetch(async () => Response.json(okBody));

    await fetchKmasBookAndWebtoon({ title: "원피스" }, { ...env, KMAS_BASE_URL: base });

    expect(transport).toHaveBeenCalledOnce();
    const requested = new URL(String(transport.mock.calls[0]?.[0]));
    expect(requested.hostname).toBe(hostname);
    expect(requested.pathname).toBe("/openapi/search/bookAndWebtoonList");
    expect(requested.searchParams.get("prvKey")).toBe("test-only-key");
  });

  it.each([
    "https://evil.example",
    "https://www.kmas.or.kr.evil.example",
    "https://evilkmas.or.kr",
    "http://www.kmas.or.kr",
    "https://www.kmas.or.kr:8443",
    withCredentials(),
    "ftp://www.kmas.or.kr",
    "not a url",
  ])("%s 는 네트워크 호출 전에 거부한다(prvKey 가 나가지 않는다)", async (base) => {
    const transport = stubFetch(async () => Response.json(okBody));

    await expect(fetchKmasBookAndWebtoon({ title: "원피스" }, { ...env, KMAS_BASE_URL: base }))
      .rejects.toThrow(/KMAS_BASE_URL/u);

    expect(transport).not.toHaveBeenCalled();
  });

  it("기본값(KMAS_BASE_URL 없음)은 www.kmas.or.kr 이다", async () => {
    const transport = stubFetch(async () => Response.json(okBody));

    await fetchKmasBookAndWebtoon({ title: "원피스" }, env);

    expect(new URL(String(transport.mock.calls[0]?.[0])).origin).toBe("https://www.kmas.or.kr");
  });
});

describe("fetchKmasBookAndWebtoon 타임아웃·리다이렉트", () => {
  it("redirect 를 따라가지 않고 중단 신호를 붙여 호출한다", async () => {
    const transport = stubFetch(async () => Response.json(okBody));

    await fetchKmasBookAndWebtoon({ title: "원피스" }, env);

    const init = transport.mock.calls[0]?.[1];
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("제한 시간 안에 응답이 없으면 요청을 중단하고 시간 초과로 실패한다(오류에 prvKey 를 싣지 않는다)", async () => {
    let aborted = false;
    stubFetch((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(init.signal?.reason ?? new Error("aborted"));
      });
    }));

    const failure = await fetchKmasBookAndWebtoon({ title: "원피스" }, env, { timeoutMs: 20 })
      .then(() => null, (error: unknown) => error);

    expect(aborted).toBe(true);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/timed out after 20ms/u);
    expect((failure as Error).message).not.toContain("test-only-key");
  });

  it("본문을 읽는 도중에도 제한 시간이 적용된다", async () => {
    stubFetch(async (_input, init) => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason ?? new Error("aborted")));
      },
    })));

    await expect(fetchKmasBookAndWebtoon({ title: "원피스" }, env, { timeoutMs: 20 }))
      .rejects.toThrow(/timed out after 20ms/u);
  });
});

describe("fetchKmasBookAndWebtoon 응답 크기 상한(2 MiB)", () => {
  it("content-length 가 상한을 넘으면 본문을 읽지 않고 거부한다", async () => {
    let cancelled = false;
    stubFetch(async () => new Response(new ReadableStream<Uint8Array>({
      cancel() { cancelled = true; },
    }), { headers: { "content-length": String(2 * MIB + 1) } }));

    await expect(fetchKmasBookAndWebtoon({ title: "원피스" }, env)).rejects.toThrow(/exceeds 2097152 bytes/u);
    expect(cancelled).toBe(true);
  });

  it("content-length 가 없어도 스트림이 상한을 넘으면 읽기를 취소하고 거부한다", async () => {
    let cancelled = false;
    let pulls = 0;
    stubFetch(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(MIB).fill(0x20));
      },
      cancel() { cancelled = true; },
    })));

    await expect(fetchKmasBookAndWebtoon({ title: "원피스" }, env)).rejects.toThrow(/exceeds 2097152 bytes/u);
    expect(cancelled).toBe(true);
    // 2 MiB 를 넘는 3번째 조각에서 멈춘다(무한히 읽지 않는다).
    expect(pulls).toBeLessThanOrEqual(4);
  });

  it("상한 이내의 정상 응답은 그대로 파싱한다", async () => {
    const padding = "x".repeat(MIB);
    stubFetch(async () => Response.json({ ...okBody, itemList: [{ prdctNm: "원피스", outline: padding }] }));

    const response = await fetchKmasBookAndWebtoon({ title: "원피스" }, env);

    expect(response.result.resultState).toBe("success");
    expect(response.itemList?.[0]?.prdctNm).toBe("원피스");
  });
});

describe("fetchKmasBookAndWebtoon 기존 동작 유지", () => {
  it("HTTP 오류는 상태 코드로 실패한다", async () => {
    stubFetch(async () => new Response("upstream down", { status: 503, statusText: "Service Unavailable" }));

    await expect(fetchKmasBookAndWebtoon({ title: "원피스" }, env)).rejects.toThrow("KMAS 503 Service Unavailable");
  });

  it("result 봉투가 없으면 실패한다", async () => {
    stubFetch(async () => Response.json({ unexpected: true }));

    await expect(fetchKmasBookAndWebtoon({ title: "원피스" }, env)).rejects.toThrow("KMAS response did not contain result envelope");
  });

  it("KMAS_PRV_KEY 가 없으면 호출하지 않고 실패한다", async () => {
    const transport = stubFetch(async () => Response.json(okBody));

    await expect(fetchKmasBookAndWebtoon({ title: "원피스" }, {})).rejects.toThrow("KMAS_PRV_KEY is not configured");
    expect(transport).not.toHaveBeenCalled();
  });
});
