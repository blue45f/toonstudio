/**
 * 컷 가져오기 화면 시험 도구 — 합성 원고 이미지, 대역 환경(디코딩·감지·캔버스·다운로드), 라우터 래퍼.
 * 운영 코드가 가져오지 않는다. 이미지는 모두 코드로 만들며 바이너리 픽스처를 쓰지 않는다.
 * JSX 없이 createElement 로 만들어, 컴포넌트·함수를 함께 내보내는 .tsx 파일의 fast-refresh 규칙과 부딪히지 않는다.
 */

import { render } from "@testing-library/react";
import { createElement, Fragment } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi, type Mock } from "vitest";

import { buildCardNewsBundle } from "../panel-card-export";
import { replanCardSlicesAsync, sliceCardsAsync } from "../panel-card-slice";
import { detectPanels } from "../panel-detect-core";
import { FixtureImage, WHITE } from "../panel-detect-fixtures";
import { fakeCanvasWorld, fakePngFile, fixtureDrawable, noYield, type FakeCanvasWorld, type FakeDrawable } from "../panel-detect-test-doubles";
import { createPanelImportRights } from "../panel-import-rights";
import { buildReflowPngBundle } from "../panel-reflow-output";

import { PanelImportEnvironmentContext } from "./panel-import-env";

import type { ReactElement } from "react";
import type { PanelImportEnvironment } from "./panel-import-env";
import type { PanelSourceImage } from "../panel-source-image";
import type { PanelSourceReady } from "./PanelSourceStep";

/** 400×560: 위 두 컷(왼쪽·오른쪽)과 아래 한 컷. 컷 사이는 20px 흰 여백. */
export function samplePage(): FixtureImage {
  const image = new FixtureImage(400, 560, WHITE);
  image.art(10, 10, 180, 220, { seed: 0, balloon: false });
  image.art(210, 10, 180, 220, { seed: 1, balloon: false });
  image.art(10, 250, 380, 300, { seed: 2, balloon: false });
  return image;
}

/** 폭 720, 긴 세로 원고: 장면 넷과 흰 여백. 카드 높이(원본 900행)를 넘어 여러 장으로 나뉜다. */
export function sampleStrip(): FixtureImage {
  const image = new FixtureImage(720, 3000, WHITE);
  image.art(20, 40, 680, 700, { seed: 0 });
  image.art(20, 800, 680, 800, { seed: 1 });
  image.art(20, 1660, 680, 700, { seed: 2 });
  image.art(20, 2420, 680, 540, { seed: 3 });
  return image;
}

export interface FakeSourceImage extends PanelSourceImage {
  disposed: boolean;
  readonly drawableFake: FakeDrawable;
}

export function fakePanelSource(image: FixtureImage, fileName: string): FakeSourceImage {
  const drawable = fixtureDrawable(image);
  const source: FakeSourceImage = {
    fileName,
    mimeType: "image/png",
    sizeBytes: 4096,
    width: image.width,
    height: image.height,
    sha256: "c".repeat(64),
    drawable,
    drawableFake: drawable,
    disposed: false,
    readRaster: () => Promise.resolve({ width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }),
    receipt: () => ({ fileName, mimeType: "image/png", sizeBytes: 4096, width: image.width, height: image.height, sha256: "c".repeat(64) }),
    dispose: () => {
      source.disposed = true;
      drawable.close();
    },
  };
  return source;
}

export interface KitOverrides extends Partial<PanelImportEnvironment> {
  readonly image?: FixtureImage;
}

export interface Kit {
  readonly env: PanelImportEnvironment;
  readonly world: FakeCanvasWorld;
  readonly downloads: Array<{ readonly blob: Blob; readonly fileName: string }>;
  readonly sources: FakeSourceImage[];
  readonly revoked: string[];
  readonly loadSource: Mock<PanelImportEnvironment["loadSource"]>;
  readonly detect: Mock<PanelImportEnvironment["detect"]>;
}

/** 합성 이미지로 동작하는 대역 환경. 필요한 부분만 overrides 로 바꿔 끼운다. */
export function createKit(overrides: KitOverrides = {}): Kit {
  const image = overrides.image ?? samplePage();
  const world = fakeCanvasWorld();
  const downloads: Kit["downloads"] = [];
  const sources: FakeSourceImage[] = [];
  const revoked: string[] = [];
  let counter = 0;
  const loadSource = vi.fn<PanelImportEnvironment["loadSource"]>((file) => {
    const source = fakePanelSource(image, file.name);
    sources.push(source);
    return Promise.resolve<PanelSourceImage>(source);
  });
  const detect = vi.fn<PanelImportEnvironment["detect"]>((raster, options) =>
    Promise.resolve(detectPanels(raster, { readingOrder: options.readingOrder, sensitivity: options.sensitivity })));
  const env: PanelImportEnvironment = {
    loadSource: overrides.loadSource ?? loadSource,
    detect: overrides.detect ?? detect,
    sliceCards: overrides.sliceCards ?? ((raster, options, signal) => sliceCardsAsync(raster, { ...options, isCancelled: () => signal.aborted }, { yieldNow: noYield })),
    replanCards: overrides.replanCards ?? ((analysis, cardCount, signal) => replanCardSlicesAsync(analysis, cardCount, signal, { yieldNow: noYield })),
    canvasDeps: overrides.canvasDeps ?? world.deps,
    // 실제 ZIP 작성기를 쓰되 Worker 가 없는 시험 환경이라 CRC 는 같은 스레드에서 계산한다.
    buildBundle: overrides.buildBundle ?? ((input) => buildCardNewsBundle({ ...input, crc32ExecutionMode: "direct-bounded" })),
    buildReflowBundle: overrides.buildReflowBundle ?? ((input) => buildReflowPngBundle({ ...input, crc32ExecutionMode: "direct-bounded" })),
    download: overrides.download ?? ((blob, fileName) => { downloads.push({ blob, fileName }); }),
    now: overrides.now ?? (() => new Date("2026-10-15T09:00:00.000Z")),
    makeId: overrides.makeId ?? (() => `id-${(counter += 1)}`),
    createPreviewUrl: overrides.createPreviewUrl ?? (() => "blob:panel-preview"),
    revokePreviewUrl: overrides.revokePreviewUrl ?? ((url) => { revoked.push(url); }),
  };
  return { env, world, downloads, sources, revoked, loadSource, detect };
}

/** 현재 주소를 화면에 그려 이동 결과를 확인하게 한다. */
export function LocationProbe(): ReactElement {
  const location = useLocation();
  return createElement("output", { "data-testid": "location" }, `${location.pathname}${location.search}`);
}

export function renderInRouter(ui: ReactElement) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ["/studio/import"] },
      createElement(Routes, null, createElement(Route, { path: "*", element: createElement(Fragment, null, ui, createElement(LocationProbe)) })),
    ),
  );
}

/** 환경 대역을 컨텍스트로 주입하고 라우터 안에 그린다. */
export function renderWithEnv(ui: ReactElement, env: PanelImportEnvironment) {
  return renderInRouter(createElement(PanelImportEnvironmentContext.Provider, { value: env }, ui));
}

export function sampleReady(image: FixtureImage = samplePage()): PanelSourceReady {
  const source = fakePanelSource(image, "page-01.png");
  return {
    source,
    file: fakePngFile("page-01.png", image.width, image.height),
    rights: createPanelImportRights({
      confirmed: true,
      attestedAt: "2026-10-15T09:00:00.000Z",
      note: "",
      source: source.receipt(),
    }),
  };
}

/** 보이는 getBoundingClientRect 를 흉내 낸다(jsdom 은 모두 0). 이미지 좌표 = 화면 좌표(배율 1). */
export function mockBounds(width: number, height: number): () => void {
  const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0,
    toJSON: () => ({}),
  });
  return () => { spy.mockRestore(); };
}
