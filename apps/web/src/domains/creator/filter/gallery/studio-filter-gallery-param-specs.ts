/**
 * 필터 갤러리 매개변수 명세 만들기·읽기. 스케치·텍스처·스타일화 커널이 같이 쓴다.
 *
 * 읽기 함수는 명세의 min/max/default 를 그대로 numberParam·stringParam·booleanParam·colorParam 에 넘겨 화면 명세와
 * 커널이 서로 다른 범위를 쓰는 일을 막는다.
 */
import { booleanParam, colorParam, numberParam, stringParam } from "./studio-filter-gallery-kernel-utils";

import type { StudioFilterGalleryParamSpec, StudioFilterGalleryParams } from "./studio-filter-gallery-types";

export type Rgb = readonly [number, number, number];
export type SliderSpec = Extract<StudioFilterGalleryParamSpec, { readonly control: "slider" }>;
export type ColorSpec = Extract<StudioFilterGalleryParamSpec, { readonly control: "color" }>;
export type ToggleSpec = Extract<StudioFilterGalleryParamSpec, { readonly control: "toggle" }>;
export type Option<T extends string> = { readonly value: T; readonly label: string };
export interface SelectSpec<T extends string> {
  readonly key: string;
  readonly label: string;
  readonly control: "select";
  readonly options: readonly Option<T>[];
  readonly default: T;
}

/** 정수 단계(step 1) 슬라이더 명세. suffix 는 값 뒤에 붙는 단위(예: "%")다. */
export function paramSlider(key: string, label: string, min: number, max: number, value: number, suffix?: string): SliderSpec {
  const spec: SliderSpec = { key, label, control: "slider", min, max, step: 1, default: value };
  return suffix === undefined ? spec : { ...spec, suffix };
}

/** 선택 명세. 선택지 값 유니온이 readSelect 의 반환 형식이 된다. */
export function paramSelect<T extends string>(key: string, label: string, options: readonly Option<T>[], value: T): SelectSpec<T> {
  return { key, label, control: "select", options, default: value };
}

/** [값, 이름] 쌍을 선택지 목록으로 바꾼다. */
export function paramChoices<T extends string>(...pairs: readonly (readonly [T, string])[]): readonly Option<T>[] {
  return pairs.map(([value, label]) => ({ value, label }));
}

/** 켜고 끄는 토글 명세. */
export const paramToggle = (key: string, label: string, value: boolean): ToggleSpec => ({ key, label, control: "toggle", default: value });

/** #rrggbb 색 명세. */
export const paramColor = (key: string, label: string, value: string): ColorSpec => ({ key, label, control: "color", default: value });

/** 슬라이더 값을 명세 범위로 잘라 읽는다(숫자가 아니면 기본값). */
export const readSlider = (params: StudioFilterGalleryParams, spec: SliderSpec): number =>
  numberParam(params, spec.key, spec.default, spec.min, spec.max);

/** 선택 값을 읽는다(선택지 밖이면 기본값). */
export const readSelect = <T extends string>(params: StudioFilterGalleryParams, spec: SelectSpec<T>): T =>
  stringParam(params, spec.key, spec.options.map((option) => option.value), spec.default);

/** 토글 값을 읽는다(불리언이 아니면 기본값). */
export const readToggle = (params: StudioFilterGalleryParams, spec: ToggleSpec): boolean =>
  booleanParam(params, spec.key, spec.default);

/** 색 값을 [r, g, b] 로 읽는다(형식이 틀리면 명세 기본색). */
export function readColor(params: StudioFilterGalleryParams, spec: ColorSpec): Rgb {
  const hex = spec.default;
  const fallback: Rgb = [
    Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16),
  ];
  return colorParam(params, spec.key, fallback);
}
