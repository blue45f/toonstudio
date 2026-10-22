import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogController, coverUpstreamAccept, parseCoverWidth } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

import type { Request, Response } from "express";

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

  it("pins the recorded cache policy: revalidatable, no immutable, width variants split by URL", async () => {
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
    // 2026-10-14 확인 기록(catalog.controller.ts): 제3자 저작물 킬스위치 때문에 immutable을
    // 쓰지 않는 의도된 정책 — 브라우저 1시간·엣지 1일·SWR 1일. w는 URL 캐시 키라 폭 변형이
    // 분리 캐시되고, 협상 결과 공유는 Vary: Accept가 막는다. 값을 바꾸려면 이 테스트와
    // 컨트롤러 주석의 확인 기록을 함께 갱신할 것.
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400"
    );
    expect(res.setHeader).toHaveBeenCalledWith("Vary", "Accept");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("forwards a standard width as a Width hint and ignores non-standard widths", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    // 업스트림 요청마다 새 Response 를 돌려준다. Response 본문은 한 번만 읽을 수 있어, 한 인스턴스를
    // 두 요청이 공유하면(mockResolvedValue) 두 번째 요청은 이미 소비된 본문을 읽다 502 로 끝난다.
    const fetchMock = vi.fn().mockImplementation(async () =>
      new globalThis.Response(png, { headers: { "content-type": "image/png" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    await createController().proxyCover(
      "https://image-comic.pstatic.net/cover.png", res as unknown as Response, "320", undefined
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Width).toBe("320");
    expect(res.status).toHaveBeenCalledWith(200);

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

  it("resizes an oversized upstream JPEG to the requested standard width when the owner turned it on", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    vi.stubEnv("COVER_SERVER_TRANSCODE", "on");
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

  // 2026-10-16 운영 사고: 변환은 메인 스레드를 표지 한 장당 약 8초 막아(무료 플랜 0.1 CPU) 헬스체크가
  // 끊겼다. 켜지 않은 환경(기본)에서는 폭이 지정돼도 업스트림 바이트를 그대로 중계해야 한다.
  it.each([
    ["미설정", undefined],
    ["빈 값", ""],
    ["off", "off"],
    ["오타(true)", "true"],
  ])("relays the upstream bytes untouched when the server transcode is %s", async (_label, flag) => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    if (flag === undefined) delete process.env.COVER_SERVER_TRANSCODE;
    else vi.stubEnv("COVER_SERVER_TRANSCODE", flag);
    const { Image, encode } = await import("image-js");
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
    expect(res.send).toHaveBeenCalledWith(Buffer.from(jpeg));
  });

  it("passes a WebP upstream through untouched even when a width is requested", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    vi.stubEnv("COVER_SERVER_TRANSCODE", "on");
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

describe("CatalogController cover byte optimize (separate opt-in)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // 바이트 최적화의 본래 사각지대: 폭(w)이 없어 폭 변환 경로를 타지 못하는 표지.
  // 불투명 PNG는 같은 치수의 JPEG로 바꿔 바이트만 줄이고, 캐시 정책은 건드리지 않는다.
  it("shrinks an opaque PNG to a same-size JPEG without a width when the owner turned only optimize on", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    vi.stubEnv("COVER_SERVER_TRANSCODE_OPTIMIZE", "on");
    const { Image, encodePng, decode } = await import("image-js");
    const data = new Uint8Array(320 * 480 * 4);
    for (let i = 0; i < data.length; i++) data[i] = i % 4 === 3 ? 255 : (i >> 2) % 251;
    const png = encodePng(new Image(320, 480, { data, colorModel: "RGBA" }));
    const fetchMock = vi.fn().mockResolvedValue(
      new globalThis.Response(png, { headers: { "content-type": "image/png" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    await createController().proxyCover(
      "https://image-comic.pstatic.net/cover.png", res as unknown as Response, undefined, undefined
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/jpeg");
    const served = (res.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Buffer;
    expect(Buffer.isBuffer(served)).toBe(true);
    expect(served.length).toBeLessThan(png.byteLength);
    const decoded = decode(served);
    expect(decoded.width).toBe(320);
    expect(decoded.height).toBe(480);
    // 캐시 정책은 최적화를 켜도 바꾸지 않는다(고정 테스트와 같은 값).
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400"
    );
    expect(res.setHeader).toHaveBeenCalledWith("Vary", "Accept");
  });

  it("resizes an oversized JPEG to the requested width under optimize alone (transcode off)", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    vi.stubEnv("COVER_SERVER_TRANSCODE_OPTIMIZE", "on");
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
    const served = (res.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Buffer;
    expect(served.length).toBeLessThan(jpeg.byteLength);
    const decoded = decode(served);
    expect(decoded.width).toBe(320);
    expect(decoded.height).toBe(480);
  });

  // 기본값(끔)에서는 최적화 대상 표지라도 업스트림 바이트·헤더가 기존과 완전히 동일해야 한다.
  it.each([
    ["미설정", undefined],
    ["빈 값", ""],
    ["off", "off"],
    ["오타(true)", "true"],
  ])("relays the upstream bytes and headers untouched when byte optimize is %s", async (_label, flag) => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    if (flag === undefined) delete process.env.COVER_SERVER_TRANSCODE_OPTIMIZE;
    else vi.stubEnv("COVER_SERVER_TRANSCODE_OPTIMIZE", flag);
    const { Image, encodePng } = await import("image-js");
    const data = new Uint8Array(320 * 480 * 4);
    for (let i = 0; i < data.length; i++) data[i] = i % 4 === 3 ? 255 : (i >> 2) % 251;
    const png = encodePng(new Image(320, 480, { data, colorModel: "RGBA" }));
    const fetchMock = vi.fn().mockResolvedValue(
      new globalThis.Response(png, { headers: { "content-type": "image/png" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    await createController().proxyCover(
      "https://image-comic.pstatic.net/cover.png", res as unknown as Response, undefined, undefined
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400"
    );
    expect(res.setHeader).toHaveBeenCalledWith("Vary", "Accept");
    expect(res.send).toHaveBeenCalledWith(Buffer.from(png));
  });

  // 두 플래그가 모두 켜지고 폭 변환이 결과를 내면, 최적화는 그 결과를 다시
  // 인코딩하지 않는다 — 서빙 바이트가 폭 변환 함수의 출력과 정확히 같다.
  it("serves the transcode result untouched when both flags are on and transcode already reduced", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    vi.stubEnv("COVER_SERVER_TRANSCODE", "on");
    vi.stubEnv("COVER_SERVER_TRANSCODE_OPTIMIZE", "on");
    const { Image, encode } = await import("image-js");
    const { transcodeCoverToWidth } = await import("./cover-transcode");
    const data = new Uint8Array(800 * 1200 * 4);
    for (let i = 0; i < data.length; i++) data[i] = i % 4 === 3 ? 255 : (i >> 2) % 251;
    const jpeg = encode(new Image(800, 1200, { data, colorModel: "RGBA" }), { format: "jpeg" });
    const expected = transcodeCoverToWidth(Buffer.from(jpeg), "image/jpeg", 320);
    expect(expected).not.toBeNull();
    const fetchMock = vi.fn().mockResolvedValue(
      new globalThis.Response(jpeg, { headers: { "content-type": "image/jpeg" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = { status: vi.fn().mockReturnThis(), send: vi.fn(), setHeader: vi.fn() };
    await createController().proxyCover(
      "https://image-comic.pstatic.net/cover.jpg", res as unknown as Response, "320", undefined
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(expected!.body);
  });

  it("passes a WebP upstream through untouched even when byte optimize is on", async () => {
    vi.stubEnv("COVER_IMAGE_POLICY", "proxy");
    vi.stubEnv("COVER_SERVER_TRANSCODE_OPTIMIZE", "on");
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
