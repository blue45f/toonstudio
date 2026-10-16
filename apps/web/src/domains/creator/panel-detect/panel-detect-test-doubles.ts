/**
 * 컷 가져오기 시험 전용 대역 — 캔버스·디코더 없이 읽기/그리기 인터페이스를 흉내 낸다. 운영 코드가 가져오지 않는다.
 *
 * 합성 이미지(FixtureImage)를 `PanelDrawable` 로 감싸고, 그리기 면은 호출을 기록한 뒤 작은 PNG 모양 Blob 을 돌려준다.
 * PNG 파일 흉내(fakePngFile)는 헤더(시그니처 + IHDR)만 맞춘다 — 형식·크기 검사가 읽는 부분이다.
 */

import type { FixtureImage } from "./panel-detect-fixtures";
import type { PanelCanvasDeps, PanelDrawable, PanelRenderSurface } from "./panel-canvas-adapter";
import type { PanelRect } from "./panel-detect-types";

export interface FakeDrawable extends PanelDrawable {
  closed: boolean;
  readonly reads: Array<readonly [number, number]>;
}

export function fixtureDrawable(image: FixtureImage): FakeDrawable {
  const drawable: FakeDrawable = {
    width: image.width,
    height: image.height,
    canvasImage: null,
    closed: false,
    reads: [],
    readRgba(y0, rows) {
      drawable.reads.push([y0, rows]);
      return image.data.slice(y0 * image.width * 4, (y0 + rows) * image.width * 4);
    },
    close() {
      drawable.closed = true;
    },
  };
  return drawable;
}

export interface DrawCall {
  readonly from: PanelRect;
  readonly to: PanelRect;
}

export interface FakeSurface extends PanelRenderSurface {
  readonly fills: string[];
  readonly draws: DrawCall[];
  disposed: boolean;
}

/** 크기를 8바이트 머리말에 넣은 PNG 모양 Blob(내용 비교용). */
export function fakePngBlob(width: number, height: number, tag = 0): Blob {
  const bytes = new Uint8Array(16);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  new DataView(bytes.buffer).setUint16(8, width);
  new DataView(bytes.buffer).setUint16(10, height);
  bytes[12] = tag & 0xff;
  return new Blob([bytes], { type: "image/png" });
}

export interface FakeCanvasWorld {
  readonly deps: PanelCanvasDeps;
  readonly surfaces: FakeSurface[];
}

export function fakeCanvasWorld(options: {
  readonly decode?: (file: Blob) => Promise<PanelDrawable>;
  readonly failEncodeAt?: number;
  readonly refuse?: (width: number, height: number) => boolean;
} = {}): FakeCanvasWorld {
  const surfaces: FakeSurface[] = [];
  const deps: PanelCanvasDeps = {
    decode: options.decode ?? (() => Promise.reject(new Error("decode 대역이 없어요."))),
    createSurface(width, height) {
      if (options.refuse?.(width, height)) return null;
      const surface: FakeSurface = {
        width,
        height,
        fills: [],
        draws: [],
        disposed: false,
        fill(color) {
          surface.fills.push(color);
        },
        drawSource(_source, from, to) {
          surface.draws.push({ from, to });
        },
        toPngBlob() {
          if (options.failEncodeAt !== undefined && surfaces.length === options.failEncodeAt + 1) {
            return Promise.reject(new Error("인코딩 실패"));
          }
          return Promise.resolve(fakePngBlob(width, height, surfaces.indexOf(surface)));
        },
        dispose() {
          surface.disposed = true;
        },
      };
      surfaces.push(surface);
      return surface;
    },
  };
  return { deps, surfaces };
}

/** PNG 시그니처 + IHDR(가로세로)만 맞춘 파일. 본문은 padding 바이트로 채운다. */
export function fakePngFile(name: string, width: number, height: number, padding = 0, type = "image/png"): File {
  const bytes = new Uint8Array(33 + padding);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  return new File([bytes], name, { type });
}

/** 지연 없이 바로 끝나는 양보. */
export const noYield = (): Promise<void> => Promise.resolve();
