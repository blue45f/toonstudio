import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogController, coverUpstreamAccept, parseCoverWidth } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

import type { Request, Response } from "express";

const { isAdminUser } = vi.hoisted(() => ({ isAdminUser: vi.fn() }));
vi.mock("../../server/app-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../server/app-config")>()),
  isAdminUser,
}));

const mockCatalogService = {} as unknown as CatalogService;

function createController(): CatalogController {
  return new CatalogController(mockCatalogService);
}

describe("CatalogController affiliate redirection", () => {
  it("rejects an external destination before logging or redirecting", async () => {
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), redirect: vi.fn() };
    await createController().redirectAffiliate(
      "ridi", "https://evil.test/login", { headers: {} } as Request, res as unknown as Response,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.redirect).not.toHaveBeenCalled();
  });
  it("to 쿼리 파라미터가 없으면 400 에러를 반환한다", async () => {
    const controller = createController();
    const req = {
      headers: {},
    } as unknown as Request;

    const statusFn = vi.fn().mockReturnThis();
    const sendFn = vi.fn();
    const res = {
      status: statusFn,
      send: sendFn,
    } as unknown as Response;

    await controller.redirectAffiliate("ridi", undefined, req, res);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(sendFn).toHaveBeenCalledWith("missing destination url ('to')");
  });

  it("제휴가 지원되는 플랫폼(ridi)인 경우 제휴 파라미터를 추가하여 302 리다이렉트한다", async () => {
    const controller = createController();
    const req = {
      headers: {
        referer: "https://toonstudio.com/detail",
        "user-agent": "Mozilla/5.0",
      },
    } as unknown as Request;

    const redirectFn = vi.fn();
    const res = {
      redirect: redirectFn,
    } as unknown as Response;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await controller.redirectAffiliate(
      "ridi",
      "https://ridibooks.com/books/123",
      req,
      res
    );

    expect(redirectFn).toHaveBeenCalledWith(
      302,
      "https://ridibooks.com/books/123?ridi_affiliate=toonstudio"
    );
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("제휴가 지원되지 않는 플랫폼(naver)인 경우 원본 URL 그대로 302 리다이렉트한다", async () => {
    const controller = createController();
    const req = {
      headers: {},
    } as unknown as Request;

    const redirectFn = vi.fn();
    const res = {
      redirect: redirectFn,
    } as unknown as Response;

    await controller.redirectAffiliate(
      "naver",
      "https://series.naver.com/comic/123",
      req,
      res
    );

    expect(redirectFn).toHaveBeenCalledWith(
      302,
      "https://series.naver.com/comic/123"
    );
  });
});

describe("CatalogController affiliate click log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 쿼리의 줄바꿈은 WHATWG URL 파서가 제거해 검증은 통과하지만, 원본 문자열을 그대로 로그에 쓰면
  // 공격자가 `[Affiliate Click] ...` 형태의 가짜 로그 줄을 끼워 넣을 수 있다(로그 위조, CWE-117).
  it("요청 값에 줄바꿈이 있어도 로그는 한 줄이고 검증된 목적지만 남긴다", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const redirect = vi.fn();
    const forgedTo =
      "https://ridibooks.com/books/1\n[Affiliate Click] platform=forged to=https://evil.test/steal";

    await createController().redirectAffiliate(
      "ridi",
      forgedTo,
      {
        headers: {
          referer: "https://toonstudio.com/a\r\n[Affiliate Click] forged",
          "user-agent": "agent\u2028second-line",
        },
      } as unknown as Request,
      { redirect } as unknown as Response,
    );

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = String(logSpy.mock.calls[0]?.[0]);
    // 한 줄이어야 가짜 `[Affiliate Click]` 기록이 새 로그 레코드로 시작될 수 없다.
    expect(line).not.toMatch(/[\r\n\u2028\u2029]/u);
    expect(line.startsWith("[Affiliate Click] platform=ridi timestamp=")).toBe(true);
    expect(line).not.toContain(" platform=forged");
  });

  it("지나치게 긴 헤더 값은 잘라서 남긴다", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await createController().redirectAffiliate(
      "ridi",
      "https://ridibooks.com/books/1",
      { headers: { "user-agent": "x".repeat(5_000) } } as unknown as Request,
      { redirect: vi.fn() } as unknown as Response,
    );
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(String(logSpy.mock.calls[0]?.[0]).length).toBeLessThan(1_000);
  });
});

describe("CatalogController cover SSRF boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects a private address without making any upstream request", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    await createController().proxyCover("https://127.0.0.1/private", res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revalidates a trusted CDN redirect before following it", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const fetchMock = vi.fn().mockResolvedValue(new globalThis.Response(null, {
      status: 302, headers: { location: "https://169.254.169.254/latest/meta-data/" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    await createController().proxyCover("https://image-comic.pstatic.net/cover.png", res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL("https://image-comic.pstatic.net/cover.png"),
      expect.objectContaining({ redirect: "manual", signal: expect.any(AbortSignal) }),
    );
  });

  it("serves an allowed CDN image after a same-origin redirect", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new globalThis.Response(null, { status: 302, headers: { location: "/actual.png" } }))
      .mockResolvedValueOnce(new globalThis.Response(png, { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    await createController().proxyCover("https://image-comic.pstatic.net/cover.png", res as unknown as Response);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toEqual(new URL("https://image-comic.pstatic.net/actual.png"));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(Buffer.from(png));
  });

  it("serves a KMAS attachment image through the proxy (octet-stream sniffed as JPEG)", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const fetchMock = vi.fn().mockResolvedValue(
      new globalThis.Response(jpeg, { headers: { "content-type": "application/octet-stream" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    await createController().proxyCover(
      "https://www.kmas.or.kr:443/common/file/atchmnflDownload.ajax?fileImageId=abc",
      res as unknown as Response
    );
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL("https://www.kmas.or.kr/common/file/atchmnflDownload.ajax?fileImageId=abc"),
      expect.objectContaining({ redirect: "manual" })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
    expect(res.send).toHaveBeenCalledWith(Buffer.from(jpeg));
  });

  it("negotiates the upstream format from the client Accept and marks the response Vary: Accept", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const fetchMock = vi.fn().mockResolvedValue(
      new globalThis.Response(png, { headers: { "content-type": "image/png" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    // AVIF를 선언하지 않은 클라이언트 — 업스트림에도 AVIF를 제안하지 않는다.
    const req = { headers: { accept: "image/webp,image/*,*/*;q=0.8" } } as unknown as Request;
    await createController().proxyCover(
      "https://image-comic.pstatic.net/cover.png", res as unknown as Response, undefined, req
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Accept).toBe("image/webp,image/*,*/*;q=0.8");
    expect(res.setHeader).toHaveBeenCalledWith("Vary", "Accept");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("forwards a standard width as a Width hint and ignores non-standard widths", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const fetchMock = vi.fn().mockResolvedValue(
      new globalThis.Response(png, { headers: { "content-type": "image/png" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    await createController().proxyCover(
      "https://image-comic.pstatic.net/cover.png", res as unknown as Response, "320", undefined
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Width).toBe("320");

    const res2 = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    await createController().proxyCover(
      "https://image-comic.pstatic.net/cover.png", res2 as unknown as Response, "12345", undefined
    );
    const init2 = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((init2.headers as Record<string, string>).Width).toBeUndefined();
    expect(res2.status).toHaveBeenCalledWith(200);
  });

  it("rejects an oversized cover by its declared Content-Length without reading the body", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const arrayBuffer = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({
        "content-type": "image/png",
        "content-length": String(10 * 1024 * 1024 + 1),
      }),
      body: null,
      arrayBuffer,
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    await createController().proxyCover(
      "https://image-comic.pstatic.net/huge.png",
      res as unknown as Response
    );
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.send).toHaveBeenCalledWith("cover too large");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("stops reading a streamed cover body once it exceeds the size cap", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const chunk = new Uint8Array(6 * 1024 * 1024);
    chunk.set([137, 80, 78, 71, 13, 10, 26, 10]); // PNG 매직 — 크기만으로 거절되는지 분리
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ "content-type": "image/png" }),
      body: stream,
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    await createController().proxyCover(
      "https://image-comic.pstatic.net/huge.png",
      res as unknown as Response
    );
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.send).toHaveBeenCalledWith("cover too large");
  });
});

describe("CatalogController cover server transcode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("resizes an oversized upstream JPEG to the requested standard width", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const { Image, encode, decode } = await import("image-js");
    const data = new Uint8Array(800 * 1200 * 4);
    for (let i = 0; i < data.length; i++) data[i] = i % 4 === 3 ? 255 : (i >> 2) % 251;
    const jpeg = encode(new Image(800, 1200, { data, colorModel: "RGBA" }), { format: "jpeg" });
    const fetchMock = vi.fn().mockResolvedValue(
      new globalThis.Response(jpeg, { headers: { "content-type": "image/jpeg" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    await createController().proxyCover(
      "https://image-comic.pstatic.net/cover.jpg", res as unknown as Response, "320", undefined
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
    const served = (res.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Buffer;
    expect(Buffer.isBuffer(served)).toBe(true);
    expect(served.length).toBeLessThan(jpeg.byteLength);
    const decoded = decode(served);
    expect(decoded.width).toBe(320);
    expect(decoded.height).toBe(480);
  });

  it("passes a WebP upstream through untouched even when a width is requested", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x1a, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20, 0x0e, 0, 0, 0, 0x90, 0x01, 0, 0x9d, 0x01, 0x2a, 0x01, 0, 0x01, 0,
    ]);
    const fetchMock = vi.fn().mockResolvedValue(
      new globalThis.Response(webp, { headers: { "content-type": "image/webp" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    await createController().proxyCover(
      "https://image-comic.pstatic.net/cover.webp", res as unknown as Response, "320", undefined
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(Buffer.from(webp));
  });
});

describe("cover transport negotiation helpers", () => {
  it.each([
    ["160", 160],
    ["320", 320],
    ["960", 960],
  ])("parseCoverWidth accepts standard width %j", (raw, expected) => {
    expect(parseCoverWidth(raw)).toBe(expected);
  });

  it.each([undefined, "", "abc", "0", "161", "1024", "12345", ["320"], { w: "320" }])(
    "parseCoverWidth rejects %j (원본 서빙으로 폴백)",
    (raw) => {
      expect(parseCoverWidth(raw)).toBeUndefined();
    }
  );

  it("coverUpstreamAccept only offers formats the client declared", () => {
    expect(coverUpstreamAccept(undefined)).toBe("image/avif,image/webp,image/*,*/*;q=0.8");
    expect(coverUpstreamAccept("image/avif,image/webp,image/*,*/*;q=0.8")).toBe(
      "image/avif,image/webp,image/*,*/*;q=0.8"
    );
    expect(coverUpstreamAccept("image/webp,image/*")).toBe("image/webp,image/*,*/*;q=0.8");
    expect(coverUpstreamAccept("image/png,image/*;q=0.8,*/*;q=0.5")).toBe("image/*,*/*;q=0.8");
    expect(coverUpstreamAccept("*/*")).toBe("image/*,*/*;q=0.8");
  });
});

describe("CatalogService getHomeData & withKmasImages", () => {
  it.each(["getSearchData", "getTitles"] as const)(
    "%s rejects malformed or oversized search input before catalogue side effects",
    async (method) => {
      const service = new CatalogService();
      const merge = vi.spyOn(service, "mergeKmasOnSiteAccess");
      for (const q of ["x".repeat(513), ["one", "two"], { length: 1_000_000 }, null, 123]) {
        await expect(service[method]({ q } as never)).rejects.toMatchObject({ status: 400 });
      }
      expect(merge).not.toHaveBeenCalled();
    },
  );

  it("getHomeData returns valid response structure", async () => {
    const service = new CatalogService();
    const data = await service.getHomeData();

    expect(data).toBeDefined();
    expect(Array.isArray(data.featured)).toBe(true);
    expect(Array.isArray(data.topRated)).toBe(true);
    expect(Array.isArray(data.waitFree)).toBe(true);
    expect(Array.isArray(data.newest)).toBe(true);
    expect(Array.isArray(data.families)).toBe(true);
    expect(Array.isArray(data.tags)).toBe(true);
    expect(typeof data.todayDay).toBe("string");
    expect(Array.isArray(data.todayReleases)).toBe(true);
    expect(typeof data.stats).toBe("object");
    expect(typeof data.stats.titles).toBe("number");
    expect(typeof data.stats.platforms).toBe("number");
    expect(typeof data.stats.genres).toBe("number");
    expect(typeof data.stats.reviews).toBe("number");
  });
});

// force 는 5분 TTL 캐시를 건너뛰고 KMAS 상류 조회를 즉시 다시 실행한다. 익명 호출이 반복하면
// 상류 쿼터와 서버 자원을 소진시키므로 관리자 세션에서만 허용하고, 그 외에는 평소 요청과 같다.
describe("CatalogController KMAS merge-on-access force", () => {
  function controllerWithMerge() {
    const mergeKmasOnSiteAccess = vi.fn().mockResolvedValue({ enabled: true, cached: true });
    const controller = new CatalogController({ mergeKmasOnSiteAccess } as unknown as CatalogService);
    return { controller, mergeKmasOnSiteAccess };
  }

  afterEach(() => isAdminUser.mockReset());

  it.each(["1", "true"])("익명 호출의 force=%s 는 캐시 우회를 일으키지 않는다", async (force) => {
    isAdminUser.mockResolvedValue(false);
    const { controller, mergeKmasOnSiteAccess } = controllerWithMerge();
    await controller.mergeKmasOnAccess(force, undefined);
    expect(mergeKmasOnSiteAccess).toHaveBeenCalledWith({ force: false });
  });

  it("관리자가 아닌 로그인 사용자의 force 도 무시한다", async () => {
    isAdminUser.mockResolvedValue(false);
    const { controller, mergeKmasOnSiteAccess } = controllerWithMerge();
    await controller.mergeKmasOnAccess("1", "member-1");
    expect(isAdminUser).toHaveBeenCalledWith("member-1");
    expect(mergeKmasOnSiteAccess).toHaveBeenCalledWith({ force: false });
  });

  it("관리자 세션의 force 는 그대로 전달한다", async () => {
    isAdminUser.mockResolvedValue(true);
    const { controller, mergeKmasOnSiteAccess } = controllerWithMerge();
    await controller.mergeKmasOnAccess("true", "admin-1");
    expect(mergeKmasOnSiteAccess).toHaveBeenCalledWith({ force: true });
  });

  it("force 가 없거나 거짓 값이면 관리자 조회 없이 평소 병합으로 처리한다", async () => {
    const { controller, mergeKmasOnSiteAccess } = controllerWithMerge();
    await controller.mergeKmasOnAccess(undefined, "admin-1");
    await controller.mergeKmasOnAccess("0", "admin-1");
    expect(isAdminUser).not.toHaveBeenCalled();
    expect(mergeKmasOnSiteAccess).toHaveBeenNthCalledWith(1, { force: false });
    expect(mergeKmasOnSiteAccess).toHaveBeenNthCalledWith(2, { force: false });
  });
});
