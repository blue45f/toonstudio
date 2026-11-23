import { describe, expect, it, vi } from "vitest";

import { prepareStudioOfflineResources } from "./studio-service-worker-offline";

describe("Studio offline preparation", () => {
  it("accepts reviewed standalone emergency drawing HTML", async () => {
    const cached = new Map<string, Response>([
      [
        "/offline-draw/index.html",
        new Response("<!doctype html><title>Emergency drawing</title>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ],
    ]);
    const report = await prepareStudioOfflineResources({
      origin: "https://toonstudio.test",
      buildId: "offline-html",
      urls: [],
      shellUrls: [],
      criticalUrls: ["/offline-draw/index.html"],
      warmUrls: [],
      read: async (url) => cached.get(url)?.clone(),
      write: vi.fn(),
    });

    expect(report).toMatchObject({ checked: 1, cached: 1, complete: true, missing: [] });
  });

  it.each([
    ["/fonts/pretendard/v1.3.9/PretendardVariable.subset.81.woff2", "font/woff2"],
    ["/brand/luminous-atelier-20261114/icon-studio-pen-ink.webp", "image/webp"],
  ])("기기 확인에서 %s의 콘텐츠 형식을 검증한다", async (url, mime) => {
    const options = {
      origin: "https://toonstudio.test", buildId: "offline-ui", urls: [], shellUrls: [],
      criticalUrls: [], warmUrls: [], drawingUrls: [url], write: vi.fn(),
      fetcher: vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } })),
    };
    const ready = await prepareStudioOfflineResources({ ...options,
      read: async () => new Response("font-or-icon", { headers: { "content-type": mime } }),
    });
    expect(ready).toMatchObject({ checked: 1, cached: 1, complete: true });
    const invalid = await prepareStudioOfflineResources({ ...options, read: async () => undefined });
    expect(invalid.complete).toBe(false);
    expect(invalid.missing).toContain(url);
  });

  it("still rejects an HTML error page masquerading as JavaScript", async () => {
    const htmlError = () => new Response("<!doctype html><title>Not found</title>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    const report = await prepareStudioOfflineResources({
      origin: "https://toonstudio.test",
      buildId: "html-error",
      urls: [],
      shellUrls: [],
      criticalUrls: ["/bootstrap-compat.js"],
      warmUrls: [],
      read: async () => htmlError(),
      write: vi.fn(),
      fetcher: async () => htmlError(),
    });

    expect(report.complete).toBe(false);
    expect(report.missing).toContain("/bootstrap-compat.js");
  });
});
