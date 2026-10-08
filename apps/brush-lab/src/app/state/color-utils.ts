/**
 * 그리기 화면 색 유틸. 16진 `#rrggbb`(sRGB) ↔ RGB(0..255) ↔ HSV(h 0..360, s·v 0..1) 변환.
 * 모두 순수 함수이며 잘못된 입력은 null로 돌려준다(무음 보정 없음 — 호출자가 입력 오류를 표시한다).
 */

export interface Rgb8 {
  r: number;
  g: number;
  b: number;
}

export interface Hsv {
  /** 0..360. */
  h: number;
  /** 0..1. */
  s: number;
  /** 0..1. */
  v: number;
}

/** `#rgb` 또는 `#rrggbb`(앞의 `#`는 생략 가능)를 읽는다. 아니면 null. */
export function parseHex(text: string): Rgb8 | null {
  const t = text.trim().replace(/^#/u, "");
  if (/^[0-9a-fA-F]{3}$/u.test(t)) {
    const [r, g, b] = [...t].map((c) => parseInt(c + c, 16));
    return { r: r ?? 0, g: g ?? 0, b: b ?? 0 };
  }
  if (/^[0-9a-fA-F]{6}$/u.test(t)) {
    return { r: parseInt(t.slice(0, 2), 16), g: parseInt(t.slice(2, 4), 16), b: parseInt(t.slice(4, 6), 16) };
  }
  return null;
}

function byteHex(v: number): string {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return c.toString(16).padStart(2, "0");
}

/** 소문자 `#rrggbb`. */
export function toHex(rgb: Rgb8): string {
  return `#${byteHex(rgb.r)}${byteHex(rgb.g)}${byteHex(rgb.b)}`;
}

/** 정규화된 `#rrggbb`로 바꾼다. 해석할 수 없으면 null. */
export function normalizeHex(text: string): string | null {
  const rgb = parseHex(text);
  return rgb ? toHex(rgb) : null;
}

export function rgbToHsv(rgb: Rgb8): Hsv {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb(hsv: Hsv): Rgb8 {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = Math.max(0, Math.min(1, hsv.s));
  const v = Math.max(0, Math.min(1, hsv.v));
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return { r: Math.round((rgb[0] + m) * 255), g: Math.round((rgb[1] + m) * 255), b: Math.round((rgb[2] + m) * 255) };
}

/** 최근 색 목록 앞에 색을 넣는다(중복은 앞으로 당기고 `max`칸을 넘으면 오래된 것을 버린다). */
export function pushRecentColor(recent: readonly string[], hex: string, max = 8): string[] {
  return [hex, ...recent.filter((c) => c !== hex)].slice(0, max);
}
