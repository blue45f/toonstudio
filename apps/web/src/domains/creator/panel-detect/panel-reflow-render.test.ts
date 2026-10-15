// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { FixtureImage, WHITE } from "./panel-detect-fixtures";
import { fakeCanvasWorld, fixtureDrawable, noYield } from "./panel-detect-test-doubles";
import { PanelRenderError, blobToDataUrl } from "./panel-render-core";
import { planPanelReflow } from "./panel-reflow-plan";
import {
  PANEL_STUDIO_INSERT_MAX_BYTES,
  findOversizedCuts,
  findOversizedPages,
  renderReflowCuts,
  renderReflowPages,
} from "./panel-reflow-render";

const PANELS = [
  { id: "a", x: 10, y: 10, width: 360, height: 200 },
  { id: "b", x: 10, y: 240, width: 360, height: 300 },
  { id: "c", x: 400, y: 10, width: 300, height: 400 },
] as const;

function setup() {
  const drawable = fixtureDrawable(new FixtureImage(720, 600, WHITE));
  const world = fakeCanvasWorld();
  const plan = planPanelReflow(PANELS, { targetWidth: 720, gap: 80, scaleMode: "fit-width", pageHeight: 900 });
  return { drawable, world, plan };
}

describe("재배열 렌더 — 컷 이미지", () => {
  it("컷마다 계획 크기의 면을 만들고, 원본 컷 사각형을 계획 배율로 그린 뒤 PNG 로 굳힌다", async () => {
    const { drawable, world, plan } = setup();
    const progress: Array<readonly [number, number]> = [];
    const cuts = await renderReflowCuts(plan, drawable, world.deps, {
      background: "#ffffff",
      yieldNow: noYield,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(cuts.map((cut) => cut.panelId)).toEqual(["a", "b", "c"]);
    expect(cuts.map((cut) => cut.order)).toEqual([1, 2, 3]);
    expect(world.surfaces).toHaveLength(3);
    plan.placements.forEach((placement, index) => {
      const surface = world.surfaces[index];
      expect(surface.width).toBe(placement.dest.width);
      expect(surface.height).toBe(placement.dest.height);
      expect(surface.fills).toEqual(["#ffffff"]);
      expect(surface.draws).toEqual([{
        from: placement.source,
        to: { x: placement.dest.x, y: 0, width: placement.dest.width, height: placement.dest.height },
      }]);
      expect(surface.disposed).toBe(true);
      expect(cuts[index].blob.type).toBe("image/png");
      expect(cuts[index].width).toBe(placement.dest.width);
    });
    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it("원본 이미지는 읽기만 한다(닫거나 바꾸지 않는다)", async () => {
    const { drawable, world, plan } = setup();
    await renderReflowCuts(plan, drawable, world.deps, { background: "#000000", yieldNow: noYield });
    expect(drawable.closed).toBe(false);
    expect(drawable.reads).toEqual([]);
  });

  it("컷 사이에 취소하면 cancelled 로 끝나고 만들던 면을 해제한다", async () => {
    const { drawable, world, plan } = setup();
    const controller = new AbortController();
    await expect(renderReflowCuts(plan, drawable, world.deps, {
      background: "#ffffff",
      signal: controller.signal,
      yieldNow: () => { controller.abort(); return Promise.resolve(); },
    })).rejects.toMatchObject({ code: "cancelled" });
    expect(world.surfaces).toHaveLength(1);
    expect(world.surfaces.every((surface) => surface.disposed)).toBe(true);
  });

  it("인코딩이 실패하면 어느 컷인지 알리고 면을 해제한다", async () => {
    const drawable = fixtureDrawable(new FixtureImage(720, 600, WHITE));
    const world = fakeCanvasWorld({ failEncodeAt: 1 });
    const plan = planPanelReflow(PANELS, { targetWidth: 720, gap: 80, scaleMode: "fit-width" });
    await expect(renderReflowCuts(plan, drawable, world.deps, { background: "#ffffff", yieldNow: noYield }))
      .rejects.toMatchObject({ code: "encode-failed", subject: 2 });
    expect(world.surfaces.every((surface) => surface.disposed)).toBe(true);
  });

  it("브라우저가 만들 수 없는 크기의 컷은 하나도 그리기 전에 알린다", async () => {
    const drawable = fixtureDrawable(new FixtureImage(720, 600, WHITE));
    const world = fakeCanvasWorld();
    const tall = planPanelReflow([{ id: "t", x: 0, y: 0, width: 100, height: 4_000 }], { targetWidth: 720, gap: 0, scaleMode: "fit-width" });
    expect(tall.placements[0].dest.height).toBe(28_800);
    expect(findOversizedCuts(tall)).toEqual([1]);
    await expect(renderReflowCuts(tall, drawable, world.deps, { background: "#ffffff", yieldNow: noYield }))
      .rejects.toMatchObject({ code: "surface-unavailable", subject: 1 });
    expect(world.surfaces).toHaveLength(0);
    const refused = fakeCanvasWorld({ refuse: () => true });
    const { plan } = setup();
    await expect(renderReflowCuts(plan, drawable, refused.deps, { background: "#ffffff", yieldNow: noYield }))
      .rejects.toMatchObject({ code: "surface-unavailable", subject: 1 });
  });

  it("Studio 문서에 넣기엔 PNG 합계가 너무 크면 too-large-for-studio 로 멈춘다", async () => {
    const { drawable, plan } = setup();
    const big = fakeCanvasWorld();
    const original = big.deps.createSurface.bind(big.deps);
    const deps = {
      ...big.deps,
      createSurface: (width: number, height: number) => {
        const surface = original(width, height);
        if (!surface) return surface;
        return { ...surface, toPngBlob: () => Promise.resolve(new Blob([new Uint8Array(PANEL_STUDIO_INSERT_MAX_BYTES / 2 + 1)], { type: "image/png" })) };
      },
    };
    await expect(renderReflowCuts(plan, drawable, deps, { background: "#ffffff", yieldNow: noYield }))
      .rejects.toMatchObject({ code: "too-large-for-studio", subject: 2 });
  });
});

describe("재배열 렌더 — 페이지 이미지", () => {
  it("페이지마다 폭 규격 × 페이지 높이의 면에 배경을 깔고 컷을 계획 위치에 그린다", async () => {
    const { drawable, world, plan } = setup();
    const pages = await renderReflowPages(plan, drawable, world.deps, { background: "#101010", yieldNow: noYield });
    expect(pages).toHaveLength(plan.pages.length);
    expect(plan.pages.length).toBeGreaterThan(1);
    pages.forEach((page, index) => {
      const surface = world.surfaces[index];
      expect(page.width).toBe(720);
      expect(page.height).toBe(plan.pages[index].height);
      expect(surface.fills).toEqual(["#101010"]);
      expect(surface.draws.map((call) => call.to)).toEqual(plan.pages[index].placements.map((placement) => placement.dest));
    });
  });

  it("페이지가 브라우저 한계를 넘으면 미리 알려 준다", () => {
    const plan = planPanelReflow([{ id: "t", x: 0, y: 0, width: 100, height: 3_000 }], { targetWidth: 720, gap: 0, scaleMode: "fit-width" });
    expect(findOversizedPages(plan)).toEqual([1]);
  });
});

describe("Blob → data URL", () => {
  it("PNG Blob 을 data:image/png;base64 로 바꾸고, 그 밖의 형식은 거절한다", async () => {
    const url = await blobToDataUrl(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    expect(url).toBe("data:image/png;base64,AQID");
    await expect(blobToDataUrl(new Blob(["x"], { type: "text/plain" }))).rejects.toBeInstanceOf(PanelRenderError);
  });
});
