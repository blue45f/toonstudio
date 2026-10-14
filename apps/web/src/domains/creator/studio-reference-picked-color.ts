/**
 * studio-reference-picked-color.ts
 *
 * 참조(비교·레퍼런스) 화면에서 스포이드로 찍은 색을 "1동작"으로 팔레트에 등록하고
 * 색 정보(HEX/RGB/HSV)를 표시하기 위한 순수 헬퍼.
 *
 * - 등록은 중복 제거 + 최신순 정렬 + 상한 캡을 한 번의 순수 함수로 처리한다.
 *   그래서 패널은 클릭 핸들러에서 이 함수 한 번만 호출하면 등록이 끝난다(별도 저장 버튼 없음).
 * - 색 변환은 기존 studio-color-harmony-engine의 검증된 hexToRgb/hexToHsv를 재사용한다.
 */

import { hexToHsv, hexToRgb, type HsvColor, type RgbColor } from "./studio-color-harmony-engine";
import { normalizeHexColor } from "./studio-color-utils";

/** 찍은 색 팔레트에 보관하는 최대 색 수. 넘으면 가장 오래된 색부터 버린다. */
export const STUDIO_REFERENCE_PICKED_PALETTE_MAX_COLORS = 24;

export interface StudioReferencePickedColorInfo {
  /** 정규화된 소문자 6자리 HEX. 예: "#ff8800" */
  hex: string;
  rgb: RgbColor;
  hsv: HsvColor;
  /** 표시용 라벨. 예: "RGB 255 · 136 · 0" */
  rgbLabel: string;
  /** 표시용 라벨. 예: "HSV 32° · 100% · 100%" (h는 정수, s/v는 정수 %) */
  hsvLabel: string;
}

/**
 * HEX를 표시용 색 정보로 변환한다. 유효하지 않은 입력이면 null.
 * HSV의 h/s/v는 소수 첫째 자리까지 계산되므로 표시에서는 반올림한다.
 */
export function describeStudioReferencePickedColor(rawHex: string): StudioReferencePickedColorInfo | null {
  const hex = normalizeHexColor(rawHex);
  if (!hex) return null;
  const rgb = hexToRgb(hex);
  const hsv = hexToHsv(hex);
  return {
    hex,
    rgb,
    hsv,
    rgbLabel: `RGB ${rgb.r} · ${rgb.g} · ${rgb.b}`,
    hsvLabel: `HSV ${Math.round(hsv.h)}° · ${Math.round(hsv.s)}% · ${Math.round(hsv.v)}%`,
  };
}

export interface StudioReferencePickedColorRegistration {
  /** 등록 후 팔레트(최신순). 입력 배열은 변형하지 않는다. */
  colors: string[];
  /** 이번 호출로 새로 추가됐으면 true, 이미 있던 색이면 false(순서만 최신으로 이동). */
  added: boolean;
}

/**
 * 찍은 색을 팔레트에 1동작으로 등록한다.
 * - 정규화 후 유효하지 않으면 원본 목록을 그대로 돌려준다(added: false).
 * - 이미 있는 색이면 중복을 만들지 않고 맨 앞으로만 옮긴다.
 * - 상한(기본 24색)을 넘으면 오래된 색부터 버린다.
 */
export function registerStudioReferencePickedColor(
  current: readonly string[],
  rawHex: string,
  maxColors: number = STUDIO_REFERENCE_PICKED_PALETTE_MAX_COLORS,
): StudioReferencePickedColorRegistration {
  const hex = normalizeHexColor(rawHex);
  if (!hex) return { colors: [...current], added: false };
  const cap = Number.isFinite(maxColors) && maxColors > 0 ? Math.floor(maxColors) : STUDIO_REFERENCE_PICKED_PALETTE_MAX_COLORS;
  const rest = current
    .map((color) => normalizeHexColor(color))
    .filter((color): color is string => color !== null && color !== hex);
  const added = !current.some((color) => normalizeHexColor(color) === hex);
  return { colors: [hex, ...rest].slice(0, cap), added };
}
