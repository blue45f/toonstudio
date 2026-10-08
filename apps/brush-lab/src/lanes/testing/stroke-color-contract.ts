import { expect } from "vitest";

import { buildFixture } from "../../bench/fixtures/stroke-fixtures";
import { pixelHash } from "../../bench/metrics/render-metrics";
import { fakeEnv } from "../../bench/testing/synthetic-images";
import { srgbToLinear } from "../../engine/core/color";
import { DAB_FIELD, DAB_FLOATS } from "../../engine/core/dab-layout";
import { presetById } from "../../engine/presets/catalog";
import { splitFrames } from "../../engine/raster/reference-renderer";

import type { LabImage } from "../../engine/core/types";
import type { BrushEngineLane, LaneEnvironment, StrokeOptions } from "../lane";

/**
 * 획 색 계약 시험 공용 도우미(BL-1b). 레인이 `beginStroke(program, seed, { color })`의 색을 그림에 적용하는지,
 * 색이 없을 때는 기존(검정)과 같은지를 결과 픽셀로 확인한다.
 * - 평균 색: 알파로 가중한 straight sRGB 평균(0..1). 가장자리 반투명 픽셀이 색을 흐리게 하지 않는다.
 * - 색 없는 결과와 해시가 달라야 한다(색이 정말 바뀌었다는 증거).
 */

const SIZE = 96;

export interface InkColor {
  r: number;
  g: number;
  b: number;
  /** 알파가 0보다 큰 픽셀 수. */
  inked: number;
}

/** 알파 가중 평균 sRGB 색(0..1). 잉크가 없으면 null. */
export function meanInkColor(image: LabImage): InkColor | null {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sa = 0;
  let inked = 0;
  for (let i = 0; i < image.width * image.height; i += 1) {
    const a = (image.data[i * 4 + 3] ?? 0) / 255;
    if (a <= 0) continue;
    inked += 1;
    sr += ((image.data[i * 4] ?? 0) / 255) * a;
    sg += ((image.data[i * 4 + 1] ?? 0) / 255) * a;
    sb += ((image.data[i * 4 + 2] ?? 0) / 255) * a;
    sa += a;
  }
  if (inked === 0 || sa === 0) return null;
  return { r: sr / sa, g: sg / sa, b: sb / sa, inked };
}

export interface DrawLineOptions {
  make: () => BrushEngineLane;
  presetId?: string;
  options?: StrokeOptions;
  env?: LaneEnvironment;
  /** 라인 fixture 대신 쓸 캔버스 한 변(px). */
  size?: number;
}

/** 직선 fixture 1획을 그리고 readback 이미지를 돌려준다(프레임 분할은 러너와 같은 규칙). */
export async function drawLine(opts: DrawLineOptions): Promise<LabImage> {
  const size = opts.size ?? SIZE;
  const lane = opts.make();
  const env = opts.env ?? fakeEnv();
  await lane.init(env, { width: size, height: size, dpr: 1, tileSize: 16, seed: 1 });
  const fixture = buildFixture("line", { width: size, height: size });
  const program = presetById(opts.presetId ?? "ink-g-pen");
  if (opts.options === undefined) lane.beginStroke(program, 1);
  else lane.beginStroke(program, 1, opts.options);
  for (const frame of splitFrames(fixture.samples)) lane.addSamples(frame);
  await lane.endStroke();
  const image = await lane.readback();
  lane.dispose();
  return image;
}

/** 색 계약: 색을 지정하면 평균 색이 지정색 근처이고, 색 없는 결과와 해시가 다르며, 색 없는 결과는 검정에 가깝다. */
export async function expectStrokeColorContract(
  opts: Omit<DrawLineOptions, "options"> & { color?: readonly [number, number, number, number]; tolerance?: number },
): Promise<void> {
  const color = opts.color ?? [0.86, 0.14, 0.1, 1];
  const tolerance = opts.tolerance ?? 0.12;
  const plain = await drawLine(opts);
  const colored = await drawLine({ ...opts, options: { color } });
  const plainMean = meanInkColor(plain);
  const coloredMean = meanInkColor(colored);
  expect(plainMean, "색 없는 결과에 잉크가 있다").not.toBeNull();
  expect(coloredMean, "색 지정 결과에 잉크가 있다").not.toBeNull();
  if (!plainMean || !coloredMean) return;
  expect(Math.max(plainMean.r, plainMean.g, plainMean.b), "색 없는 획은 검정").toBeLessThan(0.15);
  expect(Math.abs(coloredMean.r - color[0])).toBeLessThan(tolerance);
  expect(Math.abs(coloredMean.g - color[1])).toBeLessThan(tolerance);
  expect(Math.abs(coloredMean.b - color[2])).toBeLessThan(tolerance);
  expect(pixelHash(colored)).not.toBe(pixelHash(plain));
}

/** sRGB straight 색 → dab 인스턴스에 실리는 값(선형 premultiplied). */
export function expectedDabColor(color: readonly [number, number, number, number]): [number, number, number, number] {
  const a = color[3];
  return [srgbToLinear(color[0]) * a, srgbToLinear(color[1]) * a, srgbToLinear(color[2]) * a, a];
}

/**
 * GPU 호출 계약: 업로드된 dab 인스턴스 버퍼(Float32Array)의 앞쪽 `count`개 dab가 모두 기대 색을 싣고 있는지 확인한다.
 * 색은 dab 인스턴스(color: vec4)로 셰이더에 전달되며 유니폼·셰이더 변경은 필요 없다.
 */
export function expectDabBufferColor(floats: Float32Array, count: number, color: readonly [number, number, number, number]): void {
  const want = expectedDabColor(color);
  expect(floats.length, "업로드된 dab 버퍼가 비어 있다").toBeGreaterThanOrEqual(count * DAB_FLOATS);
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const base = i * DAB_FLOATS;
    expect(floats[base + DAB_FIELD.r] ?? Number.NaN, `dab ${i} r`).toBeCloseTo(want[0], 5);
    expect(floats[base + DAB_FIELD.g] ?? Number.NaN, `dab ${i} g`).toBeCloseTo(want[1], 5);
    expect(floats[base + DAB_FIELD.b] ?? Number.NaN, `dab ${i} b`).toBeCloseTo(want[2], 5);
    expect(floats[base + DAB_FIELD.a] ?? Number.NaN, `dab ${i} a`).toBeCloseTo(want[3], 5);
  }
}
