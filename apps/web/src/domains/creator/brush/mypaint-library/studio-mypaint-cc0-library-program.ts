/**
 * CC0 MyPaint 브러시 행 → libmypaint 문서 변환.
 *
 * MyPaint 앱이 `.myb` 를 읽을 때의 의미를 그대로 따른다.
 *  - 문서에 없는 설정은 기본 브러시(mypaint_brush_from_defaults) 상태를 유지한다.
 *  - 문서에 있는 설정은 기준값과 **모든 입력 곡선**을 바꾼다. 기본 브러시에서 곡선을 가진 설정은
 *    `opaque_multiply`(필압)뿐이므로, 그 설정이 필압 곡선 없이 실려 있으면 빈 곡선을 넣어 지운다
 *    (`applyMybSettings` 는 길이 0 곡선을 mapping_n = 0 으로 적용한다).
 *  - 개발판 MyPaint 가 쓰던 입력 이름 `surfacemap_x/y` 는 정식 이름 `gridmap_x/y` 로 옮긴다(12종이 해당).
 * 색은 사용자의 현재 색으로, 반지름은 변환하는 획의 굵기로 바꾼다. MyPaint 에서 브러시를 고를 때 작업 색과
 * 크기 슬라이더가 브러시 설정의 기준값을 바꾸는 것과 같은 동작이다.
 */
import type { LibMypaintBrushDocument, LibMypaintCurvePoint } from "@toonstudio/studio-brush-platform/libmypaint";

import type { StudioMypaintCc0BrushRow } from "./studio-mypaint-cc0-library-data.generated";

/** 생성기와 같은 id 규칙. 원본에는 `+`, `#`, `%`, 괄호가 들어간 이름이 있다. */
const BRUSH_ID_PATTERN = /^[A-Za-z0-9_]+\/[A-Za-z0-9_+\-#.%()]+$/u;
const MAXIMUM_ID_LENGTH = 96;

/** 개발판 입력 이름 → libmypaint 1.6.1 정식 이름. */
export const STUDIO_MYPAINT_CC0_INPUT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  surfacemap_x: "gridmap_x",
  surfacemap_y: "gridmap_y",
});

/** 기본 브러시가 곡선을 가진 설정과 그 입력. 문서가 이 설정을 실으면 곡선도 문서 내용으로 바뀐다. */
const DEFAULT_BRUSH_CURVES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  opaque_multiply: Object.freeze(["pressure"]),
});

export interface StudioMypaintCc0ProgramOptions {
  /** 작업 색(#rrggbb). */
  readonly color: string;
  /** 지름(px). 반지름 기준값 radius_logarithmic = ln(지름 / 2). */
  readonly diameterPx: number;
}

export interface StudioMypaintCc0Program {
  readonly brushId: string;
  readonly sourceSha256: string;
  readonly document: LibMypaintBrushDocument;
  /** 별칭으로 옮긴 `설정.입력` 목록(원래 이름 기준). */
  readonly aliasedInputs: readonly string[];
  /** 기본 곡선을 지운 `설정.입력` 목록. */
  readonly clearedDefaultCurves: readonly string[];
}

export function isStudioMypaintCc0BrushId(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAXIMUM_ID_LENGTH && BRUSH_ID_PATTERN.test(value);
}

function hexToHsv(color: string): readonly [hue: number, saturation: number, value: number] {
  if (!/^#[0-9a-f]{6}$/iu.test(color)) throw new TypeError("MyPaint 작업 색은 #RRGGBB 형식이어야 합니다.");
  const red = Number.parseInt(color.slice(1, 3), 16) / 255;
  const green = Number.parseInt(color.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  // libmypaint rgb_to_hsv_float 와 같은 색상 구간 규칙(0~1, 빨강 0).
  let hue = 0;
  if (delta > 0) {
    if (maximum === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue /= 6;
  }
  return [hue, maximum === 0 ? 0 : delta / maximum, maximum];
}

function curvePoints(flat: readonly number[], label: string): LibMypaintCurvePoint[] {
  if (flat.length < 4 || flat.length % 2 !== 0 || flat.length > 128) {
    throw new RangeError(`${label} 곡선 점 수가 올바르지 않습니다.`);
  }
  const points: LibMypaintCurvePoint[] = [];
  let previous = -Infinity;
  for (let index = 0; index < flat.length; index += 2) {
    const x = flat[index]!;
    const y = flat[index + 1]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < previous) {
      throw new RangeError(`${label} 곡선 점이 유한하지 않거나 x 가 감소합니다.`);
    }
    previous = x;
    points.push([x, y]);
  }
  return points;
}

/** 브러시 행을 사용자 색·크기를 반영한 libmypaint 문서로 만든다. 입력 행은 바꾸지 않는다. */
export function buildStudioMypaintCc0Program(
  row: StudioMypaintCc0BrushRow,
  options: StudioMypaintCc0ProgramOptions,
): StudioMypaintCc0Program {
  const [brushId, sourceSha256, rows] = row;
  if (!isStudioMypaintCc0BrushId(brushId)) throw new TypeError(`허용하지 않는 MyPaint 브러시 id: ${String(brushId)}`);
  if (!/^[0-9a-f]{64}$/u.test(sourceSha256)) throw new TypeError(`${brushId}: 원본 SHA-256 형식이 올바르지 않습니다.`);
  if (!Number.isFinite(options.diameterPx) || options.diameterPx < 1 || options.diameterPx > 256) {
    throw new RangeError("MyPaint 변환 지름은 1~256px 이어야 합니다.");
  }
  const [hue, saturation, value] = hexToHsv(options.color);
  const settings: LibMypaintBrushDocument["settings"] = {};
  const aliasedInputs: string[] = [];
  const clearedDefaultCurves: string[] = [];
  for (const entry of rows) {
    const [name, base, inputs] = entry;
    if (typeof name !== "string" || !/^[a-z0-9_]+$/u.test(name) || !Number.isFinite(base)) {
      throw new TypeError(`${brushId}: 설정 행 형식이 올바르지 않습니다.`);
    }
    if (Object.hasOwn(settings, name)) throw new TypeError(`${brushId}: 설정 ${name} 이 중복됩니다.`);
    const curves: Record<string, LibMypaintCurvePoint[]> = {};
    for (const input of Object.keys(inputs ?? {}).sort()) {
      const target = STUDIO_MYPAINT_CC0_INPUT_ALIASES[input] ?? input;
      if (target !== input) aliasedInputs.push(`${name}.${input}`);
      if (Object.hasOwn(curves, target)) throw new TypeError(`${brushId}: ${name}.${target} 곡선이 별칭과 겹칩니다.`);
      curves[target] = curvePoints(inputs![input]!, `${brushId} ${name}.${input}`);
    }
    for (const input of DEFAULT_BRUSH_CURVES[name] ?? []) {
      if (!Object.hasOwn(curves, input)) {
        curves[input] = [];
        clearedDefaultCurves.push(`${name}.${input}`);
      }
    }
    settings[name] = { base_value: base, inputs: curves };
  }
  const override = (name: string, base: number) => {
    settings[name] = { base_value: base, inputs: settings[name]?.inputs ?? {} };
  };
  override("color_h", hue);
  override("color_s", saturation);
  override("color_v", value);
  override("radius_logarithmic", Math.log(options.diameterPx / 2));
  return Object.freeze({
    brushId,
    sourceSha256,
    document: { settings },
    aliasedInputs: Object.freeze(aliasedInputs),
    clearedDefaultCurves: Object.freeze(clearedDefaultCurves),
  });
}

/** 데이터 행에서 id 로 브러시를 찾는다. 없으면 null. */
export function findStudioMypaintCc0BrushRow(
  rows: readonly StudioMypaintCc0BrushRow[],
  brushId: string,
): StudioMypaintCc0BrushRow | null {
  if (!isStudioMypaintCc0BrushId(brushId)) return null;
  return rows.find((row) => row[0] === brushId) ?? null;
}
