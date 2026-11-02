// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveStudioSkiaDocumentFontSource, STUDIO_SKIA_PRETENDARD_FONT_URL } from "./studio-skia-document-font-contract";
import { loadStudioSkiaDocumentFontData } from "./studio-skia-document-font-source";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Skia document font sources", () => {
  it("loads the fixed default font from the current HTTPS origin without following redirects", async () => {
    vi.stubGlobal("location", { origin: "https://www.toonstudio.cloud" });
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(bytes.slice().buffer, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    const result = await loadStudioSkiaDocumentFontData(
      resolveStudioSkiaDocumentFontSource(undefined, 400), signal,
    );
    expect(result).toEqual([bytes]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      `https://www.toonstudio.cloud${STUDIO_SKIA_PRETENDARD_FONT_URL}`,
    );
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), {
      signal, credentials: "omit", redirect: "error",
    });
  });

  it.each(["http://127.0.0.1:5199", "http://localhost:5199", "http://[::1]:5199"])(
    "permits only the fixed font for the local QA origin %s", async (origin) => {
      vi.stubGlobal("location", { origin });
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(new Uint8Array([1]).buffer));
      vi.stubGlobal("fetch", fetchMock);
      await loadStudioSkiaDocumentFontData(
        resolveStudioSkiaDocumentFontSource(undefined, 700), new AbortController().signal,
      );
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${origin}${STUDIO_SKIA_PRETENDARD_FONT_URL}`);
    },
  );

  it.each([
    "https://www.toonstudio.cloud/fonts/other.woff2",
    "https://www.toonstudio.cloud/fonts/pretendard/v1.3.9/PretendardVariable.woff2?download=1",
    "https://www.toonstudio.cloud/fonts/pretendard/v1.3.9/PretendardVariable.woff2#fragment",
    "https://user:password@www.toonstudio.cloud/fonts/pretendard/v1.3.9/PretendardVariable.woff2",
    "https://www.toonstudio.cloud:444/fonts/pretendard/v1.3.9/PretendardVariable.woff2",
    "https://evil.example/fonts/pretendard/v1.3.9/PretendardVariable.woff2",
    "https://www.toonstudio.cloud/fonts/pretendard/v1.3.9/%50retendardVariable.woff2",
    "/fonts/other.woff2",
  ])("rejects a local font permission escape before fetching: %s", async (value) => {
    vi.stubGlobal("location", { origin: "https://www.toonstudio.cloud" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadStudioSkiaDocumentFontData({ key: `font:${value}`, family: "Pretendard" },
      new AbortController().signal)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not permit the fixed local path on a remote insecure origin", async () => {
    vi.stubGlobal("location", { origin: "http://www.toonstudio.cloud" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadStudioSkiaDocumentFontData(
      resolveStudioSkiaDocumentFontSource(undefined, 400), new AbortController().signal,
    )).rejects.toThrow(/untrusted GPU font host/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps source planning independent of browser globals and rejects SSR local fetches", async () => {
    vi.stubGlobal("location", undefined);
    const font = resolveStudioSkiaDocumentFontSource(undefined, 400);
    expect(font.key).toBe(`font:${STUDIO_SKIA_PRETENDARD_FONT_URL}`);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadStudioSkiaDocumentFontData(font, new AbortController().signal))
      .rejects.toThrow(/requires a browser origin/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves the existing HTTPS CDN font compatibility", async () => {
    vi.stubGlobal("location", undefined);
    const bytes = new Uint8Array([1, 2]);
    const fetchMock = vi.fn(async () => new Response(bytes.slice().buffer));
    vi.stubGlobal("fetch", fetchMock);
    const value = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2";
    const signal = new AbortController().signal;
    expect(await loadStudioSkiaDocumentFontData({ key: `font:${value}`, family: "Pretendard" }, signal))
      .toEqual([bytes]);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), { signal, credentials: "omit" });
  });

  it("does not extend the local asset permission to stylesheets", async () => {
    vi.stubGlobal("location", { origin: "https://www.toonstudio.cloud" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadStudioSkiaDocumentFontData({
      key: "css:https://www.toonstudio.cloud/fonts/custom.css", family: "Other",
    }, new AbortController().signal)).rejects.toThrow(/untrusted GPU font stylesheet host/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("routes Pretendard, Google and custom families to stable source keys", () => {
    expect(resolveStudioSkiaDocumentFontSource(undefined, 400)).toMatchObject({
      key: expect.stringContaining("PretendardVariable.woff2"),
      family: "Pretendard",
    });
    expect(resolveStudioSkiaDocumentFontSource("'Noto Sans KR', sans-serif", 700)).toMatchObject({
      key: expect.stringContaining("fonts.googleapis.com/css2"),
      family: "Noto Sans KR",
    });
    expect(resolveStudioSkiaDocumentFontSource("'내 글꼴', sans-serif", 400)).toEqual({
      key: "custom:내 글꼴",
      family: "내 글꼴",
    });
  });

  it("applies the fixed local font redirect policy when referenced by an approved stylesheet", async () => {
    const origin = "https://www.toonstudio.cloud";
    vi.stubGlobal("location", { origin });
    const localFontUrl = `${origin}${STUDIO_SKIA_PRETENDARD_FONT_URL}`;
    const css = `@font-face{font-family:'T';src:url(${localFontUrl}) format('woff2')}`;
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const href = typeof input === "string" || input instanceof URL ? String(input) : input.url;
      return new URL(href).origin === "https://fonts.googleapis.com"
        ? new Response(css, { status: 200 })
        : new Response(bytes.slice().buffer, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    expect(await loadStudioSkiaDocumentFontData({
      key: "css:https://fonts.googleapis.com/css2?family=T", family: "T",
    }, signal)).toEqual([bytes]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(new URL(localFontUrl), {
      signal, credentials: "omit", redirect: "error",
    });
  });

  it("loads only declared font sources from approved hosts", async () => {
    const css = "@font-face{font-family:'T';src:url(https://fonts.gstatic.com/s/t/v1/a.woff2) format('woff2')}";
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const href = typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url;
      const url = new URL(href);
      return url.origin === "https://fonts.googleapis.com"
        ? new Response(css, { status: 200 })
        : new Response(bytes.slice().buffer, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const signal = new AbortController().signal;
    const result = await loadStudioSkiaDocumentFontData({
      key: "css:https://fonts.googleapis.com/css2?family=T",
      family: "T",
    }, signal);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(new URL("https://fonts.gstatic.com/s/t/v1/a.woff2"), {
      signal, credentials: "omit",
    });
  });

  it("rejects font URLs outside the allowlisted delivery hosts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      "@font-face{src:url(https://evil.example/font.woff2) format('woff2')}",
      { status: 200 },
    )));
    await expect(loadStudioSkiaDocumentFontData({
      key: "css:https://fonts.googleapis.com/css2?family=T",
      family: "T",
    }, new AbortController().signal)).rejects.toThrow(/untrusted GPU font host/u);
  });

  it("rejects untrusted stylesheet hosts before network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadStudioSkiaDocumentFontData({
      key: "css:https://evil.example/font.css",
      family: "T",
    }, new AbortController().signal)).rejects.toThrow(
      /untrusted GPU font stylesheet host/u,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("honors an already aborted font request", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    vi.stubGlobal("fetch", vi.fn());
    await expect(loadStudioSkiaDocumentFontData({
      key: "css:https://fonts.googleapis.com/css2?family=T",
      family: "T",
    }, controller.signal)).rejects.toThrow("cancelled");
    expect(fetch).not.toHaveBeenCalled();
  });
});
