/**
 * 이름표 글자색 대비 보정.
 *
 * 아바타 꾸미기의 이름표 색(보라·장미·하늘·호박)은 어두운 판 위에서 읽히도록 고른 파스텔이다. 내 이름표는 판이 밝은
 * 강조색이라 같은 파스텔을 얹으면 글자가 판에 묻힌다(다크 테마 실측 1.46:1). 꾸민 색이 판 위에서 읽힐 때만 쓰고,
 * 아니면 이름표 본래의 글자색(판 위 대비가 보장된 색)으로 돌아간다.
 */

interface Rgb { readonly r: number; readonly g: number; readonly b: number }

/** "#rgb" · "#rrggbb" · "#rrggbbaa"(알파는 무시)를 읽는다. 읽을 수 없으면 null. */
function parseHexColor(value: string): Rgb | null {
  const digits = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.exec(value.trim())?.[1];
  if (!digits) return null;
  const hex = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits.slice(0, 6);
  return { r: Number.parseInt(hex.slice(0, 2), 16), g: Number.parseInt(hex.slice(2, 4), 16), b: Number.parseInt(hex.slice(4, 6), 16) };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 대비비(1~21). 한쪽이라도 읽을 수 없는 색이면 null. */
export function studioContrastRatio(foreground: string, background: string): number | null {
  const fg = parseHexColor(foreground);
  const bg = parseHexColor(background);
  if (!fg || !bg) return null;
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** 작은 글자(이름표 11px)에 요구하는 WCAG AA 대비. */
export const STUDIO_NAMEPLATE_MIN_CONTRAST = 4.5;

/**
 * 꾸민 글자색(preferred)이 판(plate) 위에서 충분히 읽히면 그대로, 아니면 본래 글자색(fallback)을 돌려준다.
 * 판 색을 모르거나 색을 읽을 수 없으면 꾸민 색을 존중한다(어두운 기본 판이 대부분이라 안전하다).
 */
export function studioReadableNameplateColor(
  preferred: string,
  plate: string | undefined,
  fallback: string,
  minimum = STUDIO_NAMEPLATE_MIN_CONTRAST,
): string {
  if (!plate) return preferred;
  const ratio = studioContrastRatio(preferred, plate);
  return ratio === null || ratio >= minimum ? preferred : fallback;
}
