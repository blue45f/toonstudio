// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPageThumbnail } from "../StudioPageThumbnails";

class ThumbnailIntersectionObserver implements IntersectionObserver {
  static instances: ThumbnailIntersectionObserver[] = [];
  readonly root = null;
  readonly rootMargin: string;
  readonly scrollMargin = "0px";
  readonly thresholds = [0];
  private target: Element | null = null;

  constructor(private readonly callback: IntersectionObserverCallback, options = {}) {
    this.rootMargin = (options as IntersectionObserverInit).rootMargin ?? "0px";
    ThumbnailIntersectionObserver.instances.push(this);
  }

  disconnect(): void {
    this.target = null;
  }

  observe(target: Element): void {
    this.target = target;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve(target: Element): void {
    if (this.target === target) this.target = null;
  }

  emit(isIntersecting: boolean): void {
    if (!this.target) throw new Error("thumbnail observer target is missing");
    this.callback([{ isIntersecting, target: this.target } as IntersectionObserverEntry], this);
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  ThumbnailIntersectionObserver.instances.length = 0;
});

it("기기 원고 미리보기에서 앞선 9획과 복구한 펜 점의 ID와 위치를 유지한다", () => {
  const lines = Array.from({ length: 9 }, (_, i) => ({
    id: `stroke-${i}`, type: "draw", points: [0, i, 20, i], stroke: "#7c5cfc", strokeWidth: 6,
  }));
  const tap = {
    id: "recovered-tap", type: "draw", kind: "freehand", mode: "pen",
    points: [223.2, 278.1], stroke: "#7c5cfc", strokeWidth: 6, opacity: 0.7,
  };
  const elements = [...lines, tap];
  const { container } = render(
    <StudioPageThumbnail
      localImagesOnly
      page={{ id: "page-1", bg: "#fff", bgGrad: null, canvasH: 1080, elements }}
    />,
  );

  const strokes = Array.from(container.querySelectorAll("svg [data-element-id]"));
  expect(strokes.map((node) => node.getAttribute("data-element-id"))).toEqual(elements.map((el) => el.id));
  const dot = container.querySelector('ellipse[data-element-id="recovered-tap"]');
  expect(dot?.getAttribute("cx")).toBe("223.2");
  expect(dot?.getAttribute("cy")).toBe("278.1");
  expect(dot?.getAttribute("rx")).toBe("3");
  expect(dot?.getAttribute("ry")).toBe("3");
  expect(dot?.getAttribute("fill")).toBe("#7c5cfc");
  expect(dot?.getAttribute("opacity")).toBe("0.7");
});

describe("StudioPageThumbnail work assets", () => {
  it("renders an inert collaboration placeholder instead of an invalid SVG image href", () => {
    const html = renderToStaticMarkup(
      <StudioPageThumbnail page={{
        id: "page-1",
        bg: "#fff",
        bgGrad: null,
        canvasH: 1080,
        elements: [{
          id: "asset-1",
          type: "image",
          src: "work-asset://image/asset-1",
          x: 10,
          y: 20,
          width: 300,
          height: 400,
          rotation: 0,
        }],
      }} />
    );
    expect(html).toContain("data-work-asset-placeholder=\"true\"");
    expect(html).toContain("검증된 이미지 바이트를 안전하게 불러오는 중");
    expect(html).not.toContain("href=\"work-asset://");
  });

  it("mounts raster presentation only near the thumbnail viewport and releases it on exit", () => {
    vi.stubGlobal("IntersectionObserver", ThumbnailIntersectionObserver);
    const { container } = render(
      <StudioPageThumbnail page={{
        id: "page-windowed",
        bg: "#fff",
        bgGrad: null,
        canvasH: 1080,
        elements: [{
          id: "image-windowed",
          type: "image",
          src: "data:image/png;base64,AA==",
          x: 10,
          y: 20,
          width: 300,
          height: 400,
          rotation: 0,
        }],
      }} />,
    );
    const observer = ThumbnailIntersectionObserver.instances[0];
    expect(observer?.rootMargin).toBe("320px 0px");
    expect(container.querySelector("image")).toBeNull();

    act(() => observer?.emit(true));
    expect(container.querySelector("image")?.getAttribute("href")).toBe(
      "data:image/png;base64,AA==",
    );
    act(() => observer?.emit(false));
    expect(container.querySelector("image")).toBeNull();
  });
});
